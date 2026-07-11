import type { ModelProvider } from './types.js';
import { resolveProviderModel } from './generation.js';

export const COST_PRICING_SNAPSHOT = 'openrouter-api-2026-07-10-openai-pricing-2026-07-06';

interface TextPricing {
  inputPerTokenUsd: number;
  outputPerTokenUsd: number;
}

const OPENROUTER_TEXT_PRICING: Record<string, TextPricing> = {
  'mistralai/mistral-large-2512': { inputPerTokenUsd: 0.0000005, outputPerTokenUsd: 0.0000015 },
  'moonshotai/kimi-k2.7-code': { inputPerTokenUsd: 0.00000072, outputPerTokenUsd: 0.00000349 },
  'minimax/minimax-m3': { inputPerTokenUsd: 0.0000003, outputPerTokenUsd: 0.0000012 },
  'qwen/qwen3.7-plus': { inputPerTokenUsd: 0.00000032, outputPerTokenUsd: 0.00000128 },
  'deepseek/deepseek-v4-pro': { inputPerTokenUsd: 0.000000435, outputPerTokenUsd: 0.00000087 },
  'anthropic/claude-sonnet-5': { inputPerTokenUsd: 0.000002, outputPerTokenUsd: 0.00001 },
  'anthropic/claude-haiku-4.5': { inputPerTokenUsd: 0.000001, outputPerTokenUsd: 0.000005 },
  'anthropic/claude-opus-4.8': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.000025 },
  'anthropic/claude-fable-5': { inputPerTokenUsd: 0.00001, outputPerTokenUsd: 0.00005 },
  'google/gemini-3.1-pro-preview': { inputPerTokenUsd: 0.000002, outputPerTokenUsd: 0.000012 },
  'z-ai/glm-5.2': { inputPerTokenUsd: 0.00000093, outputPerTokenUsd: 0.000003 },
  'google/gemini-3.5-flash': { inputPerTokenUsd: 0.0000015, outputPerTokenUsd: 0.000009 },
  'google/gemma-4-31b-it': { inputPerTokenUsd: 0.00000012, outputPerTokenUsd: 0.00000035 },
  'openai/gpt-5.5': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003 },
  'openai/gpt-5.6-luna': { inputPerTokenUsd: 0.000001, outputPerTokenUsd: 0.000006 },
  'openai/gpt-5.6-terra': { inputPerTokenUsd: 0.0000025, outputPerTokenUsd: 0.000015 },
  'openai/gpt-5.6-sol': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003 }
};

const OPENAI_TEXT_PRICING: Record<string, TextPricing> = {
  'gpt-5.5': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003 },
  'gpt-5.6-luna': { inputPerTokenUsd: 0.000001, outputPerTokenUsd: 0.000006 },
  'gpt-5.6-terra': { inputPerTokenUsd: 0.0000025, outputPerTokenUsd: 0.000015 },
  'gpt-5.6-sol': { inputPerTokenUsd: 0.000005, outputPerTokenUsd: 0.00003 }
};

const OPENROUTER_SPEECH_INPUT_PRICING: Record<string, number> = {
  'microsoft/mai-voice-2': 0.000022,
  'hexgrad/kokoro-82m': 0.00000062,
  'canopylabs/orpheus-3b-0.1-ft': 0.000007,
  'zyphra/zonos-v0.1-transformer': 0.000007,
  'zyphra/zonos-v0.1-hybrid': 0.000007,
  'sesame/csm-1b': 0.000007
};

export function estimateTextCostUsd(
  provider: ModelProvider,
  model: string,
  inputTokens?: number,
  outputTokens?: number
): number | undefined {
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  if (inputTokens === 0 && outputTokens === 0) {
    return undefined;
  }

  const resolvedModel = resolveProviderModel(provider, model);
  const pricing = provider === 'openai'
    ? OPENAI_TEXT_PRICING[resolvedModel]
    : OPENROUTER_TEXT_PRICING[resolvedModel];
  if (!pricing) {
    return undefined;
  }

  return roundCost(
    (inputTokens * pricing.inputPerTokenUsd) +
    (outputTokens * pricing.outputPerTokenUsd)
  );
}

export function estimateSpeechCostUsd(
  provider: ModelProvider,
  model: string,
  inputChars: number
): number | undefined {
  if (provider !== 'openrouter') {
    return undefined;
  }

  const resolvedModel = resolveProviderModel(provider, model);
  const inputUnitCost = OPENROUTER_SPEECH_INPUT_PRICING[resolvedModel];
  if (inputUnitCost === undefined) {
    return undefined;
  }

  return roundCost(inputChars * inputUnitCost);
}

export function sumEstimatedCosts(...costs: Array<number | undefined>): number | undefined {
  const knownCosts = costs.filter((cost): cost is number => cost !== undefined);
  if (knownCosts.length === 0) {
    return undefined;
  }

  return roundCost(knownCosts.reduce((sum, cost) => sum + cost, 0));
}

export function formatUsd(cost?: number): string {
  if (cost === undefined) {
    return 'unknown';
  }

  return `$${cost.toFixed(4)}`;
}

function roundCost(cost: number): number {
  return Math.round(cost * 1_000_000) / 1_000_000;
}
