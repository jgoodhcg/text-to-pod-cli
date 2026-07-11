import OpenAI from 'openai';
import type { ModelProvider } from './types.js';

export interface TextGenerationResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerationRequestFailure {
  error: unknown;
  attemptNumber: number;
  maxAttempts: number;
  willRetry: boolean;
  model: string;
}

interface TextGenerationOptions {
  provider: ModelProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  webGrounding?: boolean;
  onRequestFailure?: (failure: GenerationRequestFailure) => void;
}

const OPENROUTER_REQUEST_ATTEMPTS = 3;
const OPENROUTER_RETRY_BASE_MS = 1000;
const OPENROUTER_TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const OPENROUTER_MAX_COMPLETION_TOKENS = 8192;

class OpenRouterRequestError extends Error {
  status: number;
  metadata?: unknown;

  constructor(status: number, message: string, metadata?: unknown) {
    super(`OpenRouter request failed: ${status} ${message}`);
    this.name = 'OpenRouterRequestError';
    this.status = status;
    if (metadata !== undefined) {
      this.metadata = metadata;
    }
  }
}

export async function generateTextWithWebSearch(
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  if (options.provider === 'openrouter') {
    return generateOpenRouterTextWithWebSearch(options);
  }

  return generateOpenAITextWithWebSearch(options);
}

export function resolveProviderModel(provider: ModelProvider, model: string): string {
  if (provider === 'openrouter') {
    return model.includes('/') ? model : `openai/${model}`;
  }

  return model.startsWith('openai/') ? model.slice('openai/'.length) : model;
}

export function formatProviderModel(provider: ModelProvider, model: string): string {
  return provider === 'openai'
    ? resolveProviderModel(provider, model)
    : `${provider}:${resolveProviderModel(provider, model)}`;
}

export function createAudioClient(provider: ModelProvider): OpenAI {
  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required when --audio-provider openrouter is used');
    }

    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/justingood/text-to-pod-cli',
        'X-Title': 'text-to-pod-cli'
      }
    });
  }

  return new OpenAI();
}

async function generateOpenAITextWithWebSearch(
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  const openai = new OpenAI();
  const response = await (openai as any).responses.create({
    model: resolveProviderModel('openai', options.model),
    input: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt }
    ],
    ...(options.webGrounding === false
      ? {}
      : {
          tools: [{ type: 'web_search' }],
          tool_choice: 'auto'
        })
  });

  return buildTextGenerationResult(
    response.output_text || '',
    response.usage?.input_tokens ?? response.usage?.prompt_tokens,
    response.usage?.output_tokens ?? response.usage?.completion_tokens
  );
}

async function generateOpenRouterTextWithWebSearch(
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required when --text-provider openrouter is used');
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= OPENROUTER_REQUEST_ATTEMPTS; attempt++) {
    try {
      return await sendOpenRouterTextRequest(apiKey, options);
    } catch (error) {
      lastError = error;
      const willRetry = attempt < OPENROUTER_REQUEST_ATTEMPTS && isRetryableOpenRouterError(error);
      options.onRequestFailure?.({
        error,
        attemptNumber: attempt,
        maxAttempts: OPENROUTER_REQUEST_ATTEMPTS,
        willRetry,
        model: options.model
      });

      if (!willRetry) {
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[generation] OpenRouter transient failure on attempt ${attempt}/${OPENROUTER_REQUEST_ATTEMPTS}: ${message}`);
      await delay(OPENROUTER_RETRY_BASE_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildTextGenerationResult(
  content: string,
  inputTokens?: number,
  outputTokens?: number
): TextGenerationResult {
  return {
    content,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {})
  };
}

async function sendOpenRouterTextRequest(
  apiKey: string,
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  const tools = options.webGrounding === false
    ? undefined
    : [
        {
          type: 'openrouter:web_fetch',
          parameters: {
            engine: 'auto',
            max_uses: 5,
            max_content_tokens: 50000
          }
        }
      ];
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/justingood/text-to-pod-cli',
      'X-Title': 'text-to-pod-cli'
    },
    body: JSON.stringify({
      model: resolveProviderModel('openrouter', options.model),
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt }
      ],
      max_tokens: OPENROUTER_MAX_COMPLETION_TOKENS,
      ...(tools ? { tools } : {}),
      provider: {
        ignore: ['alibaba', 'anthropic', 'google-ai-studio']
      }
    })
  });

  const responseText = await response.text();
  const body = parseJsonResponse(responseText);

  if (!response.ok || body?.error) {
    const message = body?.error?.message || body?.message || response.statusText || responseText.slice(0, 200);
    const errorStatus = Number.isInteger(body?.error?.code)
      ? body.error.code
      : response.status;
    throw new OpenRouterRequestError(errorStatus, message, body?.error?.metadata);
  }

  return buildTextGenerationResult(
    extractMessageContent(body?.choices?.[0]?.message?.content),
    body?.usage?.prompt_tokens,
    body?.usage?.completion_tokens
  );
}

function parseJsonResponse(raw: string): any {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRetryableOpenRouterError(error: unknown): boolean {
  if (error instanceof OpenRouterRequestError) {
    return OPENROUTER_TRANSIENT_STATUSES.has(error.status);
  }

  return error instanceof TypeError;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }

  return '';
}
