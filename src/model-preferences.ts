import type { EpisodeRepository } from './database.js';
import type { AudioPresetChoice, ModelProvider, TextModelChoice } from './types.js';

type StagePreset = { provider: ModelProvider; model: string; voice: string };

export function buildPreferredTextChoices(input: {
  db: EpisodeRepository;
  pool: readonly string[];
  fallbackProvider: ModelProvider;
  providerFilter?: ModelProvider;
}): TextModelChoice[] {
  const evaluations = input.db.listModelSampleEvaluations('text');
  if (evaluations.length === 0) {
    return input.pool.map(model => buildDefaultTextChoice(model, input.fallbackProvider, input.providerFilter));
  }

  const pool = new Set(input.pool);
  const choices = evaluations
    .filter(row => row.pass_fail === 'pass')
    .filter(row => typeof row.preference_rank === 'number')
    .filter(row => pool.has(row.model))
    .filter(row => !input.providerFilter || row.provider === input.providerFilter)
    .filter(row => isModelProvider(row.provider))
    .map(row => ({
      provider: resolveDefaultTextProvider(row.model, row.provider as ModelProvider, input.providerFilter),
      model: row.model,
      ...(typeof row.preference_rank === 'number' ? { preferenceRank: row.preference_rank } : {})
    }))
    .reduce<TextModelChoice[]>((deduped, choice) => upsertPreferredTextChoice(deduped, choice), [])
    .sort(compareTextChoices);

  return choices;
}

export function chooseTextChoice(input: {
  rawModel: unknown;
  choices: TextModelChoice[];
  fallbackModel: string;
  fallbackProvider: ModelProvider;
}): TextModelChoice {
  if (typeof input.rawModel === 'string' && input.rawModel.trim()) {
    return { provider: input.fallbackProvider, model: input.rawModel.trim() };
  }

  return chooseWeighted(input.choices) ?? {
    provider: input.fallbackProvider,
    model: input.fallbackModel
  };
}

export function buildTextRetrySequence(
  selected: TextModelChoice,
  choices: readonly TextModelChoice[]
): TextModelChoice[] {
  const providerFallback = buildTextProviderFallback(selected);
  return [
    selected,
    ...(providerFallback ? [providerFallback] : []),
    ...choices
      .filter(choice => !sameTextChoice(choice, selected))
      .filter(choice => !providerFallback || !sameTextChoice(choice, providerFallback))
      .sort(compareTextChoices)
  ];
}

export function buildPreferredAudioChoices(input: {
  db: EpisodeRepository;
  presets: readonly StagePreset[];
  fallbackProvider: ModelProvider;
  providerFilter?: ModelProvider;
}): AudioPresetChoice[] {
  const evaluations = input.db.listModelSampleEvaluations('audio');
  const configured = input.presets.filter(preset => !input.providerFilter || preset.provider === input.providerFilter);

  if (evaluations.length === 0) {
    const fallbackConfigured = input.presets.filter(preset => preset.provider === (input.providerFilter ?? input.fallbackProvider));
    return fallbackConfigured.map(preset => ({ ...preset }));
  }

  const configuredKeys = new Set(configured.map(buildAudioChoiceKey));
  return evaluations
    .filter(row => row.pass_fail === 'pass')
    .filter(row => isModelProvider(row.provider))
    .filter(row => typeof row.voice === 'string' && row.voice.length > 0)
    .filter(row => !input.providerFilter || row.provider === input.providerFilter)
    .filter(row => configuredKeys.has(buildAudioChoiceKey({
      provider: row.provider as ModelProvider,
      model: row.model,
      voice: row.voice!
    })))
    .map(row => ({
      provider: row.provider as ModelProvider,
      model: row.model,
      voice: row.voice!,
      ...(typeof row.preference_rank === 'number' ? { preferenceRank: row.preference_rank } : {})
    }))
    .sort(compareAudioChoices);
}

export function chooseAudioChoice(input: {
  rawModel: unknown;
  rawVoice: unknown;
  choices: AudioPresetChoice[];
  fallback: AudioPresetChoice;
}): AudioPresetChoice {
  const model = typeof input.rawModel === 'string' && input.rawModel.trim()
    ? input.rawModel.trim()
    : undefined;
  const voice = typeof input.rawVoice === 'string' && input.rawVoice.trim()
    ? input.rawVoice.trim()
    : undefined;

  if (model && voice) {
    return { provider: input.fallback.provider, model, voice };
  }

  if (model) {
    const matching = input.choices.filter(choice => choice.model === model);
    return chooseWeighted(matching) ?? { ...input.fallback, model };
  }

  if (voice) {
    const matching = input.choices.filter(choice => choice.voice === voice);
    return chooseWeighted(matching) ?? { ...input.fallback, voice };
  }

  return chooseWeighted(input.choices) ?? input.fallback;
}

function chooseWeighted<T extends { preferenceRank?: number }>(choices: readonly T[]): T | undefined {
  if (choices.length === 0) {
    return undefined;
  }

  const sorted = [...choices].sort(compareRankedChoices);
  const weights = sorted.map((choice, index) =>
    choice.preferenceRank === undefined ? 1 : sorted.length - index
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.random() * total;

  for (let index = 0; index < sorted.length; index++) {
    cursor -= weights[index]!;
    if (cursor <= 0) {
      return sorted[index];
    }
  }

  return sorted[sorted.length - 1];
}

function isModelProvider(value: string): value is ModelProvider {
  return value === 'openai' || value === 'openrouter';
}

function sameTextChoice(a: TextModelChoice, b: TextModelChoice): boolean {
  return a.provider === b.provider && a.model === b.model;
}

function buildDefaultTextChoice(
  model: string,
  fallbackProvider: ModelProvider,
  providerFilter?: ModelProvider
): TextModelChoice {
  return {
    provider: resolveDefaultTextProvider(model, fallbackProvider, providerFilter),
    model
  };
}

function resolveDefaultTextProvider(
  model: string,
  provider: ModelProvider,
  providerFilter?: ModelProvider
): ModelProvider {
  if (providerFilter) {
    return providerFilter;
  }

  // OpenAI models are available through both OpenRouter and direct OpenAI. By
  // default, try OpenRouter first so episode generation stays on one billing
  // surface; buildTextRetrySequence adds direct OpenAI as the next fallback.
  if (isOpenAIModel(model)) {
    return 'openrouter';
  }

  return provider;
}

function buildTextProviderFallback(selected: TextModelChoice): TextModelChoice | undefined {
  if (selected.provider === 'openrouter' && isOpenAIModel(selected.model)) {
    return {
      provider: 'openai',
      model: selected.model,
      ...(typeof selected.preferenceRank === 'number' ? { preferenceRank: selected.preferenceRank } : {})
    };
  }

  return undefined;
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith('openai/');
}

function upsertPreferredTextChoice(
  choices: TextModelChoice[],
  next: TextModelChoice
): TextModelChoice[] {
  const existingIndex = choices.findIndex(choice => sameTextChoice(choice, next));
  if (existingIndex === -1) {
    choices.push(next);
    return choices;
  }

  const existing = choices[existingIndex]!;
  if (compareTextChoices(next, existing) < 0) {
    choices[existingIndex] = next;
  }

  return choices;
}

function buildAudioChoiceKey(choice: StagePreset): string {
  return [choice.provider, choice.model, choice.voice].join(':');
}

function compareTextChoices(a: TextModelChoice, b: TextModelChoice): number {
  return compareRankedChoices(a, b) || compareProviderPriority(a.provider, b.provider) || a.model.localeCompare(b.model);
}

function compareAudioChoices(a: AudioPresetChoice, b: AudioPresetChoice): number {
  return compareRankedChoices(a, b)
    || a.provider.localeCompare(b.provider)
    || a.model.localeCompare(b.model)
    || a.voice.localeCompare(b.voice);
}

function compareRankedChoices(
  a: { preferenceRank?: number },
  b: { preferenceRank?: number }
): number {
  const aRank = a.preferenceRank ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.preferenceRank ?? Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
}

function compareProviderPriority(a: ModelProvider, b: ModelProvider): number {
  return providerPriority(a) - providerPriority(b);
}

function providerPriority(provider: ModelProvider): number {
  return provider === 'openrouter' ? 0 : 1;
}
