#!/usr/bin/env bun

import { createRequire } from 'module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { CONFIG } from '../../src/config.js';
import {
  createAudioClient,
  formatProviderModel,
  generateTextWithWebSearch,
  resolveProviderModel
} from '../../src/generation.js';
import type { ModelProvider, ScriptDialogue } from '../../src/types.js';

const DEFAULT_OUTPUT_DIR = 'test/model-samples';
const MAX_TEXT_SAMPLE_WORDS = 100;
const TTS_INSTRUCTIONS = 'Speak casually, like someone thinking out loud while scrolling through their feed. Low energy, slightly tired, not performing for anyone. Natural filler words and reactions. No dramatic intonation or podcast host energy.';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const STANDARD_SCRIPT_INPUT_TOKENS = 35000;
const STANDARD_SCRIPT_OUTPUT_TOKENS = 6000;
const AVG_SPOKEN_CHARS_PER_WORD = 6;

const FALLBACK_AUDIO_TEXT = `Okay, so this one is a small but pretty active discussion about local-first tools and the tradeoffs around keeping personal data portable. The useful part is not really the headline by itself. It is the way the comments circle around maintenance, trust, and whether ordinary people can actually keep these systems running without turning their lives into a second operations job.`;

const TEXT_SAMPLE_OUTLINE = {
  headline: {
    title: 'A no-ECU tractor startup becomes a right-to-repair symbol',
    source_domain: 'Hacker News linking to a small trade article',
    source_type: 'discussion thread plus article'
  },
  activity_signals: {
    comment_count: '158',
    activity_level: 'lively',
    thread_depth: 'mixed',
    comparison_to_typical: 'lively for a niche equipment story, about median for this podcast project'
  },
  comment_temperature: {
    dominant_sentiment: 'mixed',
    temperature_summary: 'The thread starts with repairability enthusiasm, then turns into arguments about economics, regulation, and nostalgia.'
  },
  comment_buckets: [
    {
      label: 'endorsement',
      stance: 'people like mechanical systems they can diagnose without dealer software',
      share_estimate: 'about half'
    },
    {
      label: 'skepticism',
      stance: 'others doubt whether simple machines can stay cheap once production, safety, and support scale up',
      share_estimate: 'about a third'
    }
  ],
  article_triage: {
    worth_reading: true,
    key_claims: [
      'the tractors use remanufactured diesel engines and mechanical injection',
      'the pitch is fewer electronics, lower price, and easier field repair',
      'the article is thin, but the comments reveal why the idea resonates'
    ]
  },
  takeaway: 'the product matters less than the hunger for repairable tools'
};

const BENCHMARK_TEXT_MODELS = [
  // OpenRouter model-picker candidates for ranking quality against planning cost.
  // These are sample/evaluation candidates only; production episode defaults live
  // in CONFIG.DEFAULT_MODEL_POOLS.
  'mistralai/mistral-large-2512',
  'moonshotai/kimi-k2.7-code',
  'minimax/minimax-m3',
  'qwen/qwen3.7-plus',
  'deepseek/deepseek-v4-pro',
  'z-ai/glm-5.2',
  'google/gemma-4-31b-it',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.5-flash',
  'openai/gpt-5.5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-fable-5',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-sol'
] as const;

const FALLBACK_OPENROUTER_TEXT_PRICING: Record<string, TextPricing> = {
  'mistralai/mistral-large-2512': { inputPerTokenUsd: 0.0000005, outputPerTokenUsd: 0.0000015 },
  'moonshotai/kimi-k2.7-code': { inputPerTokenUsd: 0.00000072, outputPerTokenUsd: 0.00000349 },
  'minimax/minimax-m3': { inputPerTokenUsd: 0.0000003, outputPerTokenUsd: 0.0000012 },
  'qwen/qwen3.7-plus': { inputPerTokenUsd: 0.00000032, outputPerTokenUsd: 0.00000128 },
  'deepseek/deepseek-v4-pro': { inputPerTokenUsd: 0.000000435, outputPerTokenUsd: 0.00000087 },
  'anthropic/claude-sonnet-5': { inputPerTokenUsd: 0.000002, outputPerTokenUsd: 0.00001, webSearchUnitUsd: 0.01 },
  'anthropic/claude-haiku-4.5': { inputPerTokenUsd: 0.000001, outputPerTokenUsd: 0.000005, webSearchUnitUsd: 0.01 },
  'anthropic/claude-opus-4.8': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.000025 },
  'anthropic/claude-fable-5': { inputPerTokenUsd: 0.00001, outputPerTokenUsd: 0.00005, webSearchUnitUsd: 0.01 },
  'google/gemini-3.1-pro-preview': { inputPerTokenUsd: 0.000002, outputPerTokenUsd: 0.000012 },
  'z-ai/glm-5.2': { inputPerTokenUsd: 0.00000093, outputPerTokenUsd: 0.000003 },
  'google/gemini-3.5-flash': { inputPerTokenUsd: 0.0000015, outputPerTokenUsd: 0.000009 },
  'google/gemma-4-31b-it': { inputPerTokenUsd: 0.00000012, outputPerTokenUsd: 0.00000035 },
  'openai/gpt-5.5': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003, webSearchUnitUsd: 0.01 },
  'openai/gpt-5.6-luna': { inputPerTokenUsd: 0.000001, outputPerTokenUsd: 0.000006, webSearchUnitUsd: 0.01 },
  'openai/gpt-5.6-terra': { inputPerTokenUsd: 0.0000025, outputPerTokenUsd: 0.000015, webSearchUnitUsd: 0.01 },
  'openai/gpt-5.6-sol': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003, webSearchUnitUsd: 0.01 }
};

const FALLBACK_OPENAI_TEXT_PRICING: Record<string, TextPricing> = {
  'gpt-5.5': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003 }
};

const FALLBACK_OPENROUTER_SPEECH_INPUT_PRICING: Record<string, number> = {
  'microsoft/mai-voice-2': 0.000022,
  'hexgrad/kokoro-82m': 0.00000062,
  'canopylabs/orpheus-3b-0.1-ft': 0.000007,
  'zyphra/zonos-v0.1-transformer': 0.000007,
  'zyphra/zonos-v0.1-hybrid': 0.000007,
  'sesame/csm-1b': 0.000007
};

interface Options {
  outDir: string;
  includeText: boolean;
  includeAudio: boolean;
  textProvider: ModelProvider;
  audioProviders: ModelProvider[];
  maxWords: number;
  audioTextFile?: string;
  onlyTextModel?: string;
  onlyAudioVoice?: string;
  requireKeys: boolean;
}

interface ManifestEntry {
  kind: 'text' | 'audio';
  provider: ModelProvider;
  model: string;
  voice?: string;
  stagePools?: string[];
  file?: string;
  files?: string[];
  audioSegments?: string[];
  status: 'generated' | 'skipped' | 'failed';
  wordCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

interface TextPricing {
  inputPerTokenUsd: number;
  outputPerTokenUsd: number;
  webSearchUnitUsd?: number;
}

interface PricingCatalog {
  text: Map<string, TextPricing>;
  openaiText: Map<string, TextPricing>;
  speechInputPerChar: Map<string, number>;
  source: string;
  warning?: string;
}

interface StandardEpisodeProfile {
  scriptInputTokens: number;
  scriptOutputTokens: number;
  audioInputChars: number;
  source: string;
  episodeCount?: number;
}

interface CostEstimatePayload {
  generated_at: string;
  pricing_source: string;
  pricing_warning?: string;
  standard_episode_profile: StandardEpisodeProfile;
  default_audio_baseline: {
    provider: ModelProvider;
    model: string;
    voice: string;
    costUsd?: number;
  };
  text: Array<{
    kind: 'text';
    provider: ModelProvider;
    model: string;
    stagePools: string[];
    inputPerMillionUsd?: number;
    outputPerMillionUsd?: number;
    baseScriptCostUsd?: number;
    scriptPlusDefaultAudioCostUsd?: number;
    webToolUnitUsd?: number;
  }>;
  audio: Array<{
    kind: 'audio';
    provider: ModelProvider;
    model: string;
    voice: string;
    inputPerThousandCharsUsd?: number;
    audioCostUsd?: number;
  }>;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outDir: DEFAULT_OUTPUT_DIR,
    includeText: true,
    includeAudio: true,
    textProvider: 'openrouter',
    audioProviders: ['openrouter', 'openai'],
    maxWords: MAX_TEXT_SAMPLE_WORDS,
    requireKeys: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    switch (arg) {
      case '--out-dir':
        options.outDir = requireValue(arg, value);
        i++;
        break;
      case '--text-only':
        options.includeText = true;
        options.includeAudio = false;
        break;
      case '--audio-only':
        options.includeText = false;
        options.includeAudio = true;
        break;
      case '--text-provider':
        options.textProvider = parseProvider(requireValue(arg, value), arg);
        i++;
        break;
      case '--audio-provider':
        options.audioProviders = parseAudioProviders(requireValue(arg, value));
        i++;
        break;
      case '--max-words':
        options.maxWords = Number.parseInt(requireValue(arg, value), 10);
        if (!Number.isFinite(options.maxWords) || options.maxWords < 25) {
          throw new Error('--max-words must be a number >= 25');
        }
        i++;
        break;
      case '--audio-text-file':
        options.audioTextFile = requireValue(arg, value);
        i++;
        break;
      case '--only-text-model':
        options.onlyTextModel = requireValue(arg, value);
        i++;
        break;
      case '--only-audio-voice':
        options.onlyAudioVoice = requireValue(arg, value);
        i++;
        break;
      case '--require-keys':
        options.requireKeys = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseProvider(value: string, flag: string): ModelProvider {
  if (value === 'openrouter' || value === 'openai') {
    return value;
  }
  throw new Error(`${flag} must be "openrouter" or "openai"`);
}

function parseAudioProviders(value: string): ModelProvider[] {
  if (value === 'all') {
    return ['openrouter', 'openai'];
  }
  return [parseProvider(value, '--audio-provider')];
}

function printHelp(): void {
  console.log(`Usage: bun --env-file=.secrets.env tools/model-samples/generate.ts [options]

Generates git-ignored model review samples under ${DEFAULT_OUTPUT_DIR}.

Options:
  --out-dir <path>          Output directory (default: ${DEFAULT_OUTPUT_DIR})
  --text-only              Generate text samples only
  --audio-only             Generate audio samples only
  --text-provider <name>    Text provider: openrouter|openai (default: openrouter)
  --audio-provider <name>   Audio provider: openrouter|openai|all (default: all)
  --max-words <number>      Text sample word cap (default: ${MAX_TEXT_SAMPLE_WORDS})
  --audio-text-file <path>  Use a specific text file for voice samples
  --only-text-model <id>    Generate one text model sample
  --only-audio-voice <id>   Generate one voice sample by exact voice name
  --require-keys            Fail instead of skipping providers with missing API keys
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outDir);
  ensureDir(join(options.outDir, 'text'));
  ensureDir(join(options.outDir, 'audio'));

  const manifest: ManifestEntry[] = [];
  const startedAt = new Date().toISOString();
  const audioText = resolveAudioText(options);
  const audioSegments = buildAudioSegments(audioText);
  writeFileSync(join(options.outDir, 'audio-input.txt'), formatAudioInputFile(audioSegments));

  if (options.includeText) {
    manifest.push(...await generateTextSamples(options));
  }

  if (options.includeAudio) {
    manifest.push(...await generateAudioSamples(options, audioSegments));
  }

  const pricing = await loadPricingCatalog();
  const standardProfile = loadStandardEpisodeProfile();
  const manifestPayload = {
    generated_at: startedAt,
    output_dir: options.outDir,
    text_sample_max_words: options.maxWords,
    standard_episode_profile: standardProfile,
    pricing_source: pricing.source,
    entries: manifest
  };

  writeFileSync(join(options.outDir, 'manifest.json'), `${JSON.stringify(manifestPayload, null, 2)}\n`);
  writeFileSync(join(options.outDir, 'README.md'), buildReviewIndex(manifest, audioSegments));
  writeFileSync(
    join(options.outDir, 'cost-estimates.md'),
    buildCostReport({
      pricing,
      standardProfile,
      textModels: getTextModels(),
      audioProviders: options.audioProviders
    })
  );
  writeFileSync(
    join(options.outDir, 'cost-estimates.json'),
    `${JSON.stringify(buildCostEstimatePayload({
      pricing,
      standardProfile,
      textModels: getTextModels(),
      audioProviders: options.audioProviders
    }), null, 2)}\n`
  );

  const generated = manifest.filter(entry => entry.status === 'generated').length;
  const skipped = manifest.filter(entry => entry.status === 'skipped').length;
  const failed = manifest.filter(entry => entry.status === 'failed').length;
  console.log(`[samples] Done. generated=${generated} skipped=${skipped} failed=${failed}`);
  console.log(`[samples] Review index: ${join(options.outDir, 'README.md')}`);
  console.log(`[samples] Cost report: ${join(options.outDir, 'cost-estimates.md')}`);
}

async function generateTextSamples(options: Options): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];

  for (const { model, stagePools } of getTextModels()) {
    if (options.onlyTextModel && model !== options.onlyTextModel) {
      continue;
    }

    const provider = resolveTextSampleProvider(options.textProvider, model);
    const file = join('text', `${safeFileName(model)}.md`);
    const absoluteFile = join(options.outDir, file);
    const entry: ManifestEntry = {
      kind: 'text',
      provider,
      model,
      stagePools,
      file,
      status: 'failed'
    };

    if (!hasProviderKey(provider)) {
      const message = missingKeyMessage(provider);
      if (options.requireKeys) {
        throw new Error(message);
      }

      entry.status = 'skipped';
      entry.error = message;
      entries.push(entry);
      continue;
    }

    try {
      console.log(`[samples:text] ${formatProviderModel(provider, model)}`);
      const result = await generateTextWithWebSearch({
        provider,
        model,
        systemPrompt: buildTextSampleSystemPrompt(options.maxWords),
        userPrompt: buildTextSampleUserPrompt(),
        webGrounding: false
      });
      const normalized = normalizeSampleText(result.content);
      const limited = enforceWordLimit(normalized, options.maxWords);
      const rawSuffix = limited.wasTrimmed
        ? `\n\n[Sampler note: model output exceeded ${options.maxWords} words and was trimmed for review.]\n`
        : '\n';

      writeFileSync(absoluteFile, [
        `# ${model}`,
        '',
        `Provider: ${provider}`,
        `Stage pools: ${stagePools.join(', ')}`,
        `Words: ${limited.wordCount}`,
        '',
        limited.text,
        rawSuffix
      ].join('\n'));

      if (limited.wasTrimmed) {
        writeFileSync(
          join(options.outDir, 'text', `${safeFileName(model)}.raw.txt`),
          `${normalized}\n`
        );
      }

      entry.status = 'generated';
      entry.wordCount = limited.wordCount;
      entry.inputTokens = result.inputTokens;
      entry.outputTokens = result.outputTokens;
    } catch (error) {
      entry.status = 'failed';
      entry.error = errorMessage(error);
      console.error(`[samples:text] Failed ${model}: ${entry.error}`);
    }

    entries.push(entry);
  }

  return entries;
}

async function generateAudioSamples(options: Options, audioSegments: string[]): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];

  for (const provider of options.audioProviders) {
    const presets = CONFIG.DEFAULT_AUDIO_PRESET_POOLS[provider.toUpperCase() as 'OPENROUTER' | 'OPENAI'];
    const providerDir = join(options.outDir, 'audio', provider);
    ensureDir(providerDir);

    if (!hasProviderKey(provider)) {
      const message = missingKeyMessage(provider);
      if (options.requireKeys) {
        throw new Error(message);
      }

      for (const preset of presets) {
        entries.push({
          kind: 'audio',
          provider,
          model: preset.model,
          voice: preset.voice,
          status: 'skipped',
          error: message
        });
      }
      continue;
    }

    const client = createAudioClient(provider);

    for (const preset of presets) {
      if (options.onlyAudioVoice && preset.voice !== options.onlyAudioVoice) {
        continue;
      }

      const baseName = safeFileName(`${preset.model}-${preset.voice}`);
      const files = audioSegments.map((_, index) =>
        join('audio', provider, `${baseName}-part-${index + 1}.mp3`)
      );
      const entry: ManifestEntry = {
        kind: 'audio',
        provider,
        model: preset.model,
        voice: preset.voice,
        file: files[0],
        files,
        audioSegments,
        status: 'failed'
      };

      try {
        console.log(`[samples:audio] ${formatProviderModel(provider, preset.model)} voice=${preset.voice}`);
        for (let i = 0; i < audioSegments.length; i++) {
          const speechRequest: any = {
            model: resolveProviderModel(provider, preset.model),
            voice: preset.voice,
            input: audioSegments[i],
            response_format: 'mp3'
          };

          if (provider === 'openrouter') {
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

          const response = await client.audio.speech.create(speechRequest);
          const buffer = Buffer.from(await response.arrayBuffer());
          writeFileSync(join(options.outDir, files[i]!), buffer);
        }

        entry.status = 'generated';
      } catch (error) {
        entry.status = 'failed';
        entry.error = errorMessage(error);
        console.error(`[samples:audio] Failed ${preset.model} ${preset.voice}: ${entry.error}`);
      }

      entries.push(entry);
    }
  }

  return entries;
}

function getTextModels(): { model: string; stagePools: string[] }[] {
  const byModel = new Map<string, Set<string>>();

  for (const [stage, models] of Object.entries(CONFIG.DEFAULT_MODEL_POOLS)) {
    for (const model of models) {
      const existing = byModel.get(model) ?? new Set<string>();
      existing.add(stage.toLowerCase());
      byModel.set(model, existing);
    }
  }

  for (const model of BENCHMARK_TEXT_MODELS) {
    const existing = byModel.get(model) ?? new Set<string>();
    existing.add('benchmark');
    byModel.set(model, existing);
  }

  return [...byModel.entries()]
    .map(([model, stagePools]) => ({ model, stagePools: [...stagePools].sort() }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

function resolveTextSampleProvider(defaultProvider: ModelProvider, model: string): ModelProvider {
  return defaultProvider;
}

function buildTextSampleSystemPrompt(maxWords: number): string {
  return `You are auditioning for a text-to-podcast episode generator.

Write in the project's low-energy browsing voice: casual, precise, and a little tired, like someone scanning a discussion thread and deciding whether it is worth opening the source.

Return one plain-text sample of about ${maxWords} words. No title, bullets, JSON, markdown, citations, or prefatory note. Do not mention that this is a test.`;
}

function buildTextSampleUserPrompt(): string {
  return `Create a short episode-style narration from this outline:

${JSON.stringify(TEXT_SAMPLE_OUTLINE, null, 2)}

The sample should quickly show whether you can:
- orient around the source, title, platform, and activity level
- compare comment volume to typical posts and this project's usual episode
- scan the strongest community split without sounding like a debate recap
- decide whether the original source is worth reading or the thread is the real signal
- close with one plain takeaway`;
}

function normalizeSampleText(value: string): string {
  return value
    .replace(/^```(?:text|markdown|json)?/i, '')
    .replace(/```$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function enforceWordLimit(text: string, maxWords: number): { text: string; wordCount: number; wasTrimmed: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { text, wordCount: words.length, wasTrimmed: false };
  }

  return {
    text: `${words.slice(0, maxWords).join(' ')}...`,
    wordCount: maxWords,
    wasTrimmed: true
  };
}

function resolveAudioText(options: Options): string {
  if (options.audioTextFile) {
    return limitAudioWords(readFileSync(options.audioTextFile, 'utf-8'));
  }

  const scriptText = findLatestScriptSnippet();
  return scriptText ?? FALLBACK_AUDIO_TEXT;
}

function findLatestScriptSnippet(): string | undefined {
  const root = CONFIG.DEFAULT_OUTPUT_ROOT;
  if (!existsSync(root)) {
    return undefined;
  }

  const scriptFiles = listFiles(root)
    .filter(file => basename(file) === 'script.json')
    .map(file => ({ file, mtimeMs: statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { file } of scriptFiles) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as ScriptDialogue[];
      if (!Array.isArray(parsed)) {
        continue;
      }

      const text = parsed
        .filter(entry => entry && typeof entry.text === 'string')
        .map(entry => entry.text)
        .join(' ');
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (normalized) {
        return limitAudioWords(normalized);
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function limitAudioWords(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 70) {
    return words.join(' ');
  }

  return words.slice(0, 70).join(' ');
}

function buildAudioSegments(audioText: string): string[] {
  const normalized = audioText.replace(/\s+/g, ' ').trim();
  const sentences: string[] = [];
  const sentenceEnd = /[.!?]["')\]]?(?=\s|$)/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEnd.exec(normalized)) !== null) {
    const end = match.index + match[0].length;
    const sentence = normalized.slice(start, end).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    start = end;
  }

  const tail = normalized.slice(start).trim();
  if (tail) {
    sentences.push(tail);
  }

  if (sentences.length >= 2) {
    const target = Math.ceil(normalized.length / 2);
    let first = '';
    let second = '';

    for (const sentence of sentences) {
      if (!second && first && first.length + sentence.length > target) {
        second = sentence;
      } else if (second) {
        second = `${second} ${sentence}`;
      } else {
        first = first ? `${first} ${sentence}` : sentence;
      }
    }

    if (first && second) {
      return [first, second];
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const midpoint = Math.max(1, Math.ceil(words.length / 2));
  return [
    words.slice(0, midpoint).join(' '),
    words.slice(midpoint).join(' ')
  ].filter(Boolean);
}

function formatAudioInputFile(audioSegments: string[]): string {
  return `${audioSegments
    .map((segment, index) => `Segment ${index + 1}:\n${segment}`)
    .join('\n\n')}\n`;
}

async function loadPricingCatalog(): Promise<PricingCatalog> {
  const text = new Map<string, TextPricing>(
    Object.entries(FALLBACK_OPENROUTER_TEXT_PRICING).map(([model, pricing]) => [model, { ...pricing }])
  );
  const openaiText = new Map<string, TextPricing>(
    Object.entries(FALLBACK_OPENAI_TEXT_PRICING).map(([model, pricing]) => [model, { ...pricing }])
  );
  const speechInputPerChar = new Map<string, number>(
    Object.entries(FALLBACK_OPENROUTER_SPEECH_INPUT_PRICING)
  );

  try {
    const response = await fetch(OPENROUTER_MODELS_URL);
    if (!response.ok) {
      throw new Error(`OpenRouter models request failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.json() as { data?: Array<{ id?: string; pricing?: Record<string, string> }> };
    for (const model of body.data ?? []) {
      if (!model.id || !model.pricing) {
        continue;
      }

      const prompt = parsePrice(model.pricing.prompt);
      const completion = parsePrice(model.pricing.completion);
      if (prompt === undefined || completion === undefined) {
        continue;
      }

      text.set(model.id, {
        inputPerTokenUsd: prompt,
        outputPerTokenUsd: completion,
        ...(parsePrice(model.pricing.web_search) !== undefined
          ? { webSearchUnitUsd: parsePrice(model.pricing.web_search) }
          : {})
      });
    }

    return {
      text,
      openaiText,
      speechInputPerChar,
      source: `${OPENROUTER_MODELS_URL} for OpenRouter text pricing; OpenAI pricing page snapshot for direct OpenAI text pricing; local speech snapshot for OpenRouter TTS char pricing`
    };
  } catch (error) {
    return {
      text,
      openaiText,
      speechInputPerChar,
      source: 'local fallback snapshot with OpenAI pricing page snapshot for direct OpenAI text pricing',
      warning: errorMessage(error)
    };
  }
}

function parsePrice(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function loadStandardEpisodeProfile(): StandardEpisodeProfile {
  const fallback = buildFallbackStandardEpisodeProfile();
  if (!existsSync(CONFIG.DATABASE_PATH)) {
    return fallback;
  }

  try {
    const require = createRequire(import.meta.url);
    const { Database } = require('bun:sqlite') as {
      Database: new (path: string) => {
        prepare(sql: string): { all(): Array<Record<string, unknown>> };
        close(): void;
      };
    };
    const db = new Database(CONFIG.DATABASE_PATH);
    try {
      const rows = db.prepare(`
        SELECT script_input_tokens, script_output_tokens, audio_input_chars
        FROM episodes
        WHERE script_status = 'completed'
          AND script_input_tokens IS NOT NULL
          AND script_output_tokens IS NOT NULL
      `).all();

      const scriptInputTokens = medianNumber(rows.map(row => row.script_input_tokens));
      const scriptOutputTokens = medianNumber(rows.map(row => row.script_output_tokens));
      const audioInputChars = medianNumber(
        rows
          .map(row => row.audio_input_chars)
          .filter(value => typeof value === 'number' && value > 0)
      );

      if (scriptInputTokens === undefined || scriptOutputTokens === undefined) {
        return fallback;
      }

      return {
        scriptInputTokens,
        scriptOutputTokens,
        audioInputChars: audioInputChars ?? fallback.audioInputChars,
        episodeCount: rows.length,
        source: audioInputChars === undefined
          ? 'median completed script rows from data/episodes.db; fallback audio character count'
          : 'median completed rows from data/episodes.db'
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      ...fallback,
      source: `${fallback.source}; database read failed: ${errorMessage(error)}`
    };
  }
}

function buildFallbackStandardEpisodeProfile(): StandardEpisodeProfile {
  return {
    scriptInputTokens: STANDARD_SCRIPT_INPUT_TOKENS,
    scriptOutputTokens: STANDARD_SCRIPT_OUTPUT_TOKENS,
    audioInputChars: CONFIG.TARGET_AUDIO_MINUTES * CONFIG.WORDS_PER_MINUTE * AVG_SPOKEN_CHARS_PER_WORD,
    source: 'fallback profile'
  };
}

function medianNumber(values: unknown[]): number | undefined {
  const numbers = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (numbers.length === 0) {
    return undefined;
  }

  const middle = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) {
    return numbers[middle];
  }

  return Math.round((numbers[middle - 1]! + numbers[middle]!) / 2);
}

function buildCostReport(input: {
  pricing: PricingCatalog;
  standardProfile: StandardEpisodeProfile;
  textModels: { model: string; stagePools: string[] }[];
  audioProviders: ModelProvider[];
}): string {
  const defaultOpenRouterAudio = CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENROUTER[0];
  const defaultAudioCost = estimateAudioCostUsd(
    input.pricing,
    'openrouter',
    defaultOpenRouterAudio.model,
    input.standardProfile.audioInputChars
  );
  const generatedAt = new Date().toISOString();
  const lines = [
    '# Cost Estimates',
    '',
    `Generated: ${generatedAt}`,
    '',
    'These are planning estimates for comparing sampled models, not billing records.',
    'The text table treats each model as if it handled the full script stage: outline, content draft, refinement, and description notes. Metadata extraction, publishing, storage, and retries are not included.',
    'Web/search tool charges are shown separately when pricing metadata exposes them; they are not included in the base token estimate because actual tool usage varies by source.',
    '',
    '## Standard Episode Profile',
    '',
    `Source: ${input.standardProfile.source}`,
    `Script input tokens: ${input.standardProfile.scriptInputTokens.toLocaleString()}`,
    `Script output tokens: ${input.standardProfile.scriptOutputTokens.toLocaleString()}`,
    `Audio input chars: ${input.standardProfile.audioInputChars.toLocaleString()}`,
    ...(input.standardProfile.episodeCount !== undefined
      ? [`Episode rows used: ${input.standardProfile.episodeCount.toLocaleString()}`]
      : []),
    '',
    '## Pricing Source',
    '',
    input.pricing.source,
    ...(input.pricing.warning ? [`Warning: ${input.pricing.warning}`] : []),
    '',
    '## Text Models',
    '',
    `Default audio baseline: ${defaultOpenRouterAudio.model} / ${defaultOpenRouterAudio.voice} (${formatCost(defaultAudioCost)})`,
    '',
    '| Provider | Model | Stage pools | Input $/1M | Output $/1M | Base script cost | Script + default audio | Web/tool unit |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |'
  ];

  for (const model of input.textModels) {
    const provider = resolveTextSampleProvider('openrouter', model.model);
    const pricing = getTextPricing(input.pricing, provider, model.model);
    const textCost = pricing
      ? estimateTextCostUsd(input.standardProfile, pricing)
      : undefined;
    const combinedCost = sumCosts(textCost, defaultAudioCost);
    lines.push(markdownRow([
      provider,
      model.model,
      model.stagePools.join(', '),
      pricing ? formatMillionTokenRate(pricing.inputPerTokenUsd) : 'unknown',
      pricing ? formatMillionTokenRate(pricing.outputPerTokenUsd) : 'unknown',
      formatCost(textCost),
      formatCost(combinedCost),
      pricing?.webSearchUnitUsd !== undefined ? formatCost(pricing.webSearchUnitUsd) : ''
    ]));
  }

  lines.push(
    '',
    '## Voice Models',
    '',
    '| Provider | Model | Voice | Input $/1k chars | Audio cost |',
    '| --- | --- | --- | ---: | ---: |'
  );

  for (const provider of input.audioProviders) {
    for (const preset of getAudioPresets(provider)) {
      const charPrice = provider === 'openrouter'
        ? input.pricing.speechInputPerChar.get(preset.model)
        : undefined;
      const audioCost = estimateAudioCostUsd(
        input.pricing,
        provider,
        preset.model,
        input.standardProfile.audioInputChars
      );

      lines.push(markdownRow([
        provider,
        preset.model,
        preset.voice,
        charPrice !== undefined ? formatThousandCharRate(charPrice) : 'unknown',
        formatCost(audioCost)
      ]));
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildCostEstimatePayload(input: {
  pricing: PricingCatalog;
  standardProfile: StandardEpisodeProfile;
  textModels: { model: string; stagePools: string[] }[];
  audioProviders: ModelProvider[];
}): CostEstimatePayload {
  const defaultOpenRouterAudio = CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENROUTER[0];
  const defaultAudioCost = estimateAudioCostUsd(
    input.pricing,
    'openrouter',
    defaultOpenRouterAudio.model,
    input.standardProfile.audioInputChars
  );

  return {
    generated_at: new Date().toISOString(),
    pricing_source: input.pricing.source,
    ...(input.pricing.warning ? { pricing_warning: input.pricing.warning } : {}),
    standard_episode_profile: input.standardProfile,
    default_audio_baseline: {
      provider: 'openrouter',
      model: defaultOpenRouterAudio.model,
      voice: defaultOpenRouterAudio.voice,
      ...(defaultAudioCost !== undefined ? { costUsd: defaultAudioCost } : {})
    },
    text: input.textModels.map(model => {
      const provider = resolveTextSampleProvider('openrouter', model.model);
      const pricing = getTextPricing(input.pricing, provider, model.model);
      const textCost = pricing
        ? estimateTextCostUsd(input.standardProfile, pricing)
        : undefined;
      const combinedCost = sumCosts(textCost, defaultAudioCost);

      return {
        kind: 'text',
        provider,
        model: model.model,
        stagePools: model.stagePools,
        ...(pricing ? { inputPerMillionUsd: roundCost(pricing.inputPerTokenUsd * 1_000_000) } : {}),
        ...(pricing ? { outputPerMillionUsd: roundCost(pricing.outputPerTokenUsd * 1_000_000) } : {}),
        ...(textCost !== undefined ? { baseScriptCostUsd: textCost } : {}),
        ...(combinedCost !== undefined ? { scriptPlusDefaultAudioCostUsd: combinedCost } : {}),
        ...(pricing?.webSearchUnitUsd !== undefined ? { webToolUnitUsd: pricing.webSearchUnitUsd } : {})
      };
    }),
    audio: input.audioProviders.flatMap(provider =>
      getAudioPresets(provider).map(preset => {
        const charPrice = provider === 'openrouter'
          ? input.pricing.speechInputPerChar.get(preset.model)
          : undefined;
        const audioCost = estimateAudioCostUsd(
          input.pricing,
          provider,
          preset.model,
          input.standardProfile.audioInputChars
        );

        return {
          kind: 'audio',
          provider,
          model: preset.model,
          voice: preset.voice,
          ...(charPrice !== undefined ? { inputPerThousandCharsUsd: roundCost(charPrice * 1_000) } : {}),
          ...(audioCost !== undefined ? { audioCostUsd: audioCost } : {})
        };
      })
    )
  };
}

function getTextPricing(
  pricing: PricingCatalog,
  provider: ModelProvider,
  model: string
): TextPricing | undefined {
  const providerModel = resolveProviderModel(provider, model);
  if (provider === 'openai') {
    return pricing.openaiText.get(providerModel);
  }

  return pricing.text.get(providerModel) ?? pricing.text.get(model);
}

function estimateTextCostUsd(profile: StandardEpisodeProfile, pricing: TextPricing): number {
  return roundCost(
    (profile.scriptInputTokens * pricing.inputPerTokenUsd) +
    (profile.scriptOutputTokens * pricing.outputPerTokenUsd)
  );
}

function estimateAudioCostUsd(
  pricing: PricingCatalog,
  provider: ModelProvider,
  model: string,
  audioInputChars: number
): number | undefined {
  if (provider !== 'openrouter') {
    return undefined;
  }

  const charPrice = pricing.speechInputPerChar.get(model);
  return charPrice === undefined ? undefined : roundCost(audioInputChars * charPrice);
}

function sumCosts(...costs: Array<number | undefined>): number | undefined {
  const known = costs.filter((cost): cost is number => cost !== undefined);
  if (known.length !== costs.length) {
    return undefined;
  }

  return roundCost(known.reduce((sum, cost) => sum + cost, 0));
}

function getAudioPresets(provider: ModelProvider): Array<{ model: string; voice: string }> {
  return CONFIG.DEFAULT_AUDIO_PRESET_POOLS[provider.toUpperCase() as 'OPENROUTER' | 'OPENAI'];
}

function formatMillionTokenRate(perToken: number): string {
  return `$${(perToken * 1_000_000).toFixed(2)}`;
}

function formatThousandCharRate(perChar: number): string {
  return `$${(perChar * 1_000).toFixed(4)}`;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) {
    return 'unknown';
  }

  return `$${cost.toFixed(4)}`;
}

function roundCost(cost: number): number {
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function buildReviewIndex(entries: ManifestEntry[], audioSegments: string[]): string {
  const lines = [
    '# Model Samples',
    '',
    'Generated files in this directory are intentionally git-ignored.',
    '',
    'Cost estimates: [cost-estimates.md](cost-estimates.md)',
    '',
    '## Voice Sample Text',
    '',
    'Voice samples are generated as two separate TTS requests so the dashboard can play a stitched preview across a segment boundary.',
    '',
    ...audioSegments.flatMap((segment, index) => [
      `Segment ${index + 1}:`,
      '',
      segment,
      ''
    ]),
    '## Text Samples',
    '',
    '| Rating | Model | Stage pools | Words | File | Status |',
    '| --- | --- | --- | ---: | --- | --- |'
  ];

  for (const entry of entries.filter(item => item.kind === 'text')) {
    lines.push(markdownRow([
      '',
      entry.model,
      entry.stagePools?.join(', ') ?? '',
      String(entry.wordCount ?? ''),
      entry.file ? `[sample](${entry.file})` : '',
      formatStatus(entry)
    ]));
  }

  lines.push(
    '',
    '## Voice Samples',
    '',
    '| Rating | Provider | Model | Voice | File | Status |',
    '| --- | --- | --- | --- | --- | --- |'
  );

  for (const entry of entries.filter(item => item.kind === 'audio')) {
    lines.push(markdownRow([
      '',
      entry.provider,
      entry.model,
      entry.voice ?? '',
      entry.file ? `[mp3](${entry.file})` : '',
      formatStatus(entry)
    ]));
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatStatus(entry: ManifestEntry): string {
  if (entry.status === 'generated') {
    return 'generated';
  }
  const error = entry.error ? entry.error.replace(/\|/g, '/') : entry.status;
  return `${entry.status}: ${error}`;
}

function markdownRow(cells: string[]): string {
  return `| ${cells.map(cell => cell.replace(/\|/g, '/')).join(' | ')} |`;
}

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function hasProviderKey(provider: ModelProvider): boolean {
  if (provider === 'openrouter') {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }
  return Boolean(process.env.OPENAI_API_KEY);
}

function missingKeyMessage(provider: ModelProvider): string {
  return provider === 'openrouter'
    ? 'OPENROUTER_API_KEY is not set'
    : 'OPENAI_API_KEY is not set';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exit(1);
});
