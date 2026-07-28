import type { Context, ScriptDialogue } from '../types.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { chunkDialogueByCharacters } from '../utils.js';
import { CONFIG } from '../config.js';
import { COST_PRICING_SNAPSHOT, estimateSpeechCostUsd, formatUsd } from '../costs.js';
import { createAudioClient, formatProviderModel, resolveProviderModel } from '../generation.js';
import {
  validatePersonaVoiceConfig,
  type PersonaVoice,
  type PersonaVoiceConfig
} from '../script-artifacts.js';

const BASE_TTS_INSTRUCTIONS = 'Speak casually, like someone thinking out loud while scrolling through their feed. Low energy, slightly tired, not performing for anyone. No dramatic intonation or podcast host energy.';
const PERSONA_INSTRUCTIONS: Record<string, string> = {
  [CONFIG.PERSONAS.SCHOLAR]: `${BASE_TTS_INSTRUCTIONS} Measured and reflective, with calm authority.`,
  [CONFIG.PERSONAS.NARRATOR]: `${BASE_TTS_INSTRUCTIONS} Neutral and concise. Use a soft orientation voice, not an announcer voice.`,
  [CONFIG.PERSONAS.OPERATOR]: `${BASE_TTS_INSTRUCTIONS} Concrete and practical, with restrained warmth and occasional dry understatement.`,
  [CONFIG.PERSONAS.HISTORIAN]: `${BASE_TTS_INSTRUCTIONS} Gently reflective and unhurried. Avoid theatrical gravity.`
};

interface AudioChunkPlan {
  index: number;
  persona: string;
  text: string;
  textHash: string;
  charCount: number;
  filePath: string;
  provider: PersonaVoice['provider'];
  model: string;
  voice: string;
  instructions: string;
}

interface AudioChunkManifest {
  version: 1;
  chunks: AudioChunkPlan[];
}

export async function runAudio(context: Context): Promise<void> {
  console.log('[audio] Running audio stage');
  console.log('[audio] Provider:', context.options.audioProvider);
  console.log('[audio] Model:', context.options.ttsModel);
  console.log('[audio] Dry run:', context.options.dryRun);

  if (!context.episodeId) {
    throw new Error('Episode ID must be set in context');
  }

  if (!context.paths.scriptFile) {
    throw new Error('Script file path missing from context');
  }

  if (!context.paths.chunksDir) {
    throw new Error('Audio chunks directory missing from context');
  }

  if (!context.paths.episodeDir) {
    throw new Error('Episode directory missing from context');
  }

  const existing = context.db.findByEpisodeId(context.episodeId);
  if (!existing) {
    throw new Error(`Episode not found: ${context.episodeId}`);
  }

  if (existing.audio_status === CONFIG.STAGE_STATUS.COMPLETED) {
    console.log('[audio] Stage already completed, skipping');
    return;
  }

  if (!existing.script_status || existing.script_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    throw new Error('Script stage must be completed before audio generation');
  }

  const scriptRaw = readFileSync(context.paths.scriptFile, 'utf-8');
  const script: ScriptDialogue[] = JSON.parse(scriptRaw);

  if (!Array.isArray(script) || script.length === 0) {
    throw new Error('Script file must contain a non-empty array of dialogue entries');
  }

  const charLimit = Math.min(context.options.maxScriptChars, CONFIG.DEFAULT_MAX_AUDIO_CHARS);
  const chunks = chunkDialogueByCharacters(script, charLimit);
  const voiceConfig = loadVoiceConfig(context, script);
  const chunkPlan = buildChunkPlan(context, chunks, voiceConfig);

  console.log('[audio] Chunks to synthesize:', chunkPlan.length);
  console.log('[audio] Character limit per chunk:', charLimit);
  for (const [persona, voice] of Object.entries(voiceConfig.personas)) {
    console.log(`[audio] ${persona}: ${formatProviderModel(voice.provider, voice.model)} / ${voice.voice}`);
  }

  if (context.options.dryRun) {
    chunkPlan.forEach(chunk => {
      console.log(`[audio] Dry run: would synthesize chunk ${chunk.index} (${chunk.persona}, ${chunk.charCount} chars, ${chunk.voice})`);
    });
    return;
  }

  if (!existsSync(context.paths.chunksDir)) {
    mkdirSync(context.paths.chunksDir, { recursive: true });
  }

  const manifestPath = join(context.paths.chunksDir, 'manifest.json');
  const previousManifest = readChunkManifest(manifestPath);
  const clients = new Map<string, ReturnType<typeof createAudioClient>>();
  const completedChunks: AudioChunkPlan[] = [];

  try {
    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.IN_PROGRESS);

    for (const chunk of chunkPlan) {
      const absoluteFilePath = join(context.paths.episodeDir, chunk.filePath);
      const previous = previousManifest?.chunks[chunk.index - 1];
      if (previous && sameChunk(previous, chunk) && existsSync(absoluteFilePath)) {
        console.log(`[audio] Reusing chunk ${chunk.index}/${chunkPlan.length}: ${chunk.persona}, ${chunk.charCount} chars`);
        completedChunks.push(chunk);
        writeChunkManifest(manifestPath, completedChunks);
        continue;
      }

      console.log(`[audio] Synthesizing chunk ${chunk.index}/${chunkPlan.length}: ${chunk.persona}, ${chunk.charCount} chars`);
      const clientKey = `${chunk.provider}:${chunk.model}`;
      let client = clients.get(clientKey);
      if (!client) {
        client = createAudioClient(chunk.provider);
        clients.set(clientKey, client);
      }

      const speechRequest: any = {
        model: resolveProviderModel(chunk.provider, chunk.model),
        voice: chunk.voice,
        input: chunk.text,
        response_format: 'mp3'
      };

      if (chunk.provider === 'openrouter') {
        speechRequest.provider = {
          options: {
            openai: {
              instructions: chunk.instructions
            }
          }
        };
      } else {
        speechRequest.instructions = chunk.instructions;
      }

      const response = await client.audio.speech.create(speechRequest);

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(absoluteFilePath, buffer);
      completedChunks.push(chunk);
      writeChunkManifest(manifestPath, completedChunks);
    }

    const audioInputChars = chunkPlan.reduce((sum, chunk) => sum + chunk.charCount, 0);
    const estimatedCost = estimateChunkPlanCost(chunkPlan);

    const updates: any = {
      audio_chunks_dir: context.paths.chunksDir,
      audio_chunk_count: chunkPlan.length,
      audio_input_chars: audioInputChars,
      audio_files: JSON.stringify(chunkPlan.map(chunk => chunk.filePath))
    };
    setVoiceTelemetry(updates, voiceConfig);

    if (estimatedCost !== undefined) {
      updates.audio_estimated_cost_usd = estimatedCost;
    }

    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.COMPLETED, updates);
    context.db.refreshEstimatedTotalCost(context.episodeId, COST_PRICING_SNAPSHOT);

    console.log('[audio] Audio chunks ready:', chunkPlan.length);
    console.log(`[audio] Usage: input_chars=${audioInputChars} estimated_cost=${formatUsd(estimatedCost)}`);
  } catch (error) {
    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.FAILED);
    context.db.recordFailure({
      episodeId: context.episodeId,
      stage: 'audio',
      stageOrder: CONFIG.PIPELINE_STAGE_ORDER.AUDIO,
      retryScope: 'stage',
      model: [...new Set(chunkPlan.map(chunk => formatProviderModel(chunk.provider, chunk.model)))].join(', '),
      error
    });
    throw error;
  }
}

function loadVoiceConfig(context: Context, script: ScriptDialogue[]): PersonaVoiceConfig {
  let config: PersonaVoiceConfig;
  if (context.paths.voiceConfigFile && existsSync(context.paths.voiceConfigFile)) {
    config = JSON.parse(readFileSync(context.paths.voiceConfigFile, 'utf8')) as PersonaVoiceConfig;
  } else {
    config = {
      version: 1,
      personas: {
        [CONFIG.PERSONAS.SCHOLAR]: buildLegacyVoice(context, context.options.scholarVoice),
        [CONFIG.PERSONAS.OPERATOR]: buildLegacyVoice(context, context.options.operatorVoice),
        [CONFIG.PERSONAS.HISTORIAN]: buildLegacyVoice(context, context.options.historianVoice),
        [CONFIG.PERSONAS.NARRATOR]: buildLegacyVoice(context, context.options.narratorVoice)
      }
    };
  }
  validatePersonaVoiceConfig(config, script.map(entry => entry.persona));
  return config;
}

function buildLegacyVoice(context: Context, voice: string): PersonaVoice {
  return {
    provider: context.options.audioProvider,
    model: context.options.ttsModel,
    voice
  };
}

function buildChunkPlan(
  context: Context,
  chunks: ScriptDialogue[][],
  voiceConfig: PersonaVoiceConfig
): AudioChunkPlan[] {
  return chunks.map((chunk, index) => {
    const persona = chunk[0]?.persona;
    if (!persona) {
      throw new Error(`Audio chunk ${index + 1} has no persona`);
    }
    const voice = voiceConfig.personas[persona];
    if (!voice) {
      throw new Error(`No voice configured for persona "${persona}"`);
    }
    const text = chunk.map(entry => entry.text).join('\n\n');
    const chunkIndex = String(index + 1).padStart(3, '0');
    return {
      index: index + 1,
      persona,
      text,
      textHash: createHash('sha256').update(text).digest('hex'),
      charCount: text.length,
      filePath: ['audio', 'chunks', `${chunkIndex}-${persona.toLowerCase()}.mp3`].join('/'),
      provider: voice.provider,
      model: voice.model,
      voice: voice.voice,
      instructions: voice.instructions || PERSONA_INSTRUCTIONS[persona] || BASE_TTS_INSTRUCTIONS
    };
  });
}

function readChunkManifest(path: string): AudioChunkManifest | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as AudioChunkManifest;
    return parsed.version === 1 && Array.isArray(parsed.chunks) ? parsed : undefined;
  } catch (error) {
    console.warn('[audio] Unable to read prior chunk manifest; chunks will be regenerated:', error);
    return undefined;
  }
}

function writeChunkManifest(path: string, chunks: AudioChunkPlan[]): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify({ version: 1, chunks }, null, 2));
  renameSync(tempPath, path);
}

function sameChunk(a: AudioChunkPlan, b: AudioChunkPlan): boolean {
  return a.textHash === b.textHash
    && a.persona === b.persona
    && a.provider === b.provider
    && a.model === b.model
    && a.voice === b.voice
    && a.instructions === b.instructions
    && a.filePath === b.filePath;
}

function estimateChunkPlanCost(chunks: AudioChunkPlan[]): number | undefined {
  const totals = new Map<string, { provider: PersonaVoice['provider']; model: string; chars: number }>();
  for (const chunk of chunks) {
    const key = `${chunk.provider}:${chunk.model}`;
    const current = totals.get(key) || { provider: chunk.provider, model: chunk.model, chars: 0 };
    current.chars += chunk.charCount;
    totals.set(key, current);
  }

  let totalCost = 0;
  for (const total of totals.values()) {
    const cost = estimateSpeechCostUsd(total.provider, total.model, total.chars);
    if (cost === undefined) {
      return undefined;
    }
    totalCost += cost;
  }
  return Math.round(totalCost * 1_000_000) / 1_000_000;
}

function setVoiceTelemetry(updates: Record<string, unknown>, config: PersonaVoiceConfig): void {
  const fieldByPersona: Record<string, string> = {
    [CONFIG.PERSONAS.SCHOLAR]: 'audio_voice_scholar',
    [CONFIG.PERSONAS.OPERATOR]: 'audio_voice_operator',
    [CONFIG.PERSONAS.HISTORIAN]: 'audio_voice_historian',
    [CONFIG.PERSONAS.NARRATOR]: 'audio_voice_narrator'
  };
  for (const [persona, voice] of Object.entries(config.personas)) {
    const field = fieldByPersona[persona];
    if (field) {
      updates[field] = `${voice.voice} (${formatProviderModel(voice.provider, voice.model)})`;
    }
  }
}
