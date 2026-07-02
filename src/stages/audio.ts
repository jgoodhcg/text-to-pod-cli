import type { Context, ScriptDialogue } from '../types.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chunkDialogueByCharacters } from '../utils.js';
import { CONFIG } from '../config.js';
import { COST_PRICING_SNAPSHOT, estimateSpeechCostUsd, formatUsd } from '../costs.js';
import { createAudioClient, formatProviderModel, resolveProviderModel } from '../generation.js';

const TTS_INSTRUCTIONS = 'Speak casually, like someone thinking out loud while scrolling through their feed. Low energy, slightly tired, not performing for anyone. Natural filler words and reactions. No dramatic intonation or podcast host energy.';

export async function runAudio(context: Context): Promise<void> {
  console.log('[audio] Running audio stage');
  console.log('[audio] Provider:', context.options.audioProvider);
  console.log('[audio] Model:', context.options.ttsModel);
  console.log('[audio] Scholar voice:', context.options.scholarVoice);
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

  console.log('[audio] Chunks to synthesize:', chunks.length);
  console.log('[audio] Character limit per chunk:', charLimit);

  if (context.options.dryRun) {
    chunks.forEach((chunk, index) => {
      const persona = chunk[0]?.persona ?? 'UNKNOWN';
      const combinedChars = chunk.reduce((sum, item) => sum + item.text.length, 0);
      console.log(`[audio] Dry run: would synthesize chunk ${index + 1} (${persona}, ${combinedChars} chars)`);
    });
    return;
  }

  if (!existsSync(context.paths.chunksDir)) {
    mkdirSync(context.paths.chunksDir, { recursive: true });
  }

  const openai = createAudioClient(context.options.audioProvider);
  const chunkMetadata: { index: number; persona: string; charCount: number; filePath: string; text: string }[] = [];

  const voiceForPersona = (persona: string): string => {
    switch (persona) {
      case CONFIG.PERSONAS.SCHOLAR:
        return context.options.scholarVoice;
      default:
        throw new Error(`Unknown persona "${persona}" for audio synthesis`);
    }
  };

  const formatChunkText = (chunk: ScriptDialogue[]): string =>
    chunk.map(entry => entry.text).join('\n\n');

  try {
    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.IN_PROGRESS);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.length === 0) {
        continue;
      }

      const persona = chunk[0]!.persona;
      const chunkText = formatChunkText(chunk);
      const charCount = chunkText.length;
      const voice = voiceForPersona(persona);
      const chunkIndex = String(i + 1).padStart(3, '0');
      const relativeFileName = ['audio', 'chunks', `${chunkIndex}-${persona.toLowerCase()}.mp3`].join('/');
      const absoluteFilePath = join(context.paths.episodeDir, 'audio', 'chunks', `${chunkIndex}-${persona.toLowerCase()}.mp3`);

      console.log(`[audio] Synthesizing chunk ${i + 1}/${chunks.length}: ${persona}, ${charCount} chars`);

      const speechRequest: any = {
        model: resolveProviderModel(context.options.audioProvider, context.options.ttsModel),
        voice,
        input: chunkText,
        response_format: 'mp3'
      };

      if (context.options.audioProvider === 'openrouter') {
        speechRequest.provider = {
          options: {
            openai: {
              instructions: TTS_INSTRUCTIONS
            }
          }
        };
      } else {
        speechRequest.instructions = TTS_INSTRUCTIONS;
      }

      const response = await openai.audio.speech.create(speechRequest);

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(absoluteFilePath, buffer);

      chunkMetadata.push({
        index: i + 1,
        persona,
        charCount,
        filePath: relativeFileName,
        text: chunkText
      });
    }

    const audioInputChars = chunkMetadata.reduce((sum, chunk) => sum + chunk.charCount, 0);
    const estimatedCost = estimateSpeechCostUsd(
      context.options.audioProvider,
      context.options.ttsModel,
      audioInputChars
    );

    const updates: any = {
      audio_chunks_dir: context.paths.chunksDir,
      audio_chunk_count: chunkMetadata.length,
      audio_voice_scholar: `${context.options.scholarVoice} (${formatProviderModel(context.options.audioProvider, context.options.ttsModel)})`,
      audio_input_chars: audioInputChars,
      audio_files: JSON.stringify(chunkMetadata.map(chunk => chunk.filePath))
    };

    if (estimatedCost !== undefined) {
      updates.audio_estimated_cost_usd = estimatedCost;
    }

    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.COMPLETED, updates);
    context.db.refreshEstimatedTotalCost(context.episodeId, COST_PRICING_SNAPSHOT);

    console.log('[audio] Audio chunks generated:', chunkMetadata.length);
    console.log(`[audio] Usage: input_chars=${audioInputChars} estimated_cost=${formatUsd(estimatedCost)}`);
  } catch (error) {
    context.db.updateStageStatus(context.episodeId, 'audio', CONFIG.STAGE_STATUS.FAILED);
    context.db.recordFailure({
      episodeId: context.episodeId,
      stage: 'audio',
      stageOrder: CONFIG.PIPELINE_STAGE_ORDER.AUDIO,
      retryScope: 'stage',
      model: formatProviderModel(context.options.audioProvider, context.options.ttsModel),
      error
    });
    throw error;
  }
}
