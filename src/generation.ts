import OpenAI from 'openai';
import type { ModelProvider } from './types.js';

export interface TextGenerationResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface TextGenerationOptions {
  provider: ModelProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
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
    tools: [
      {
        type: 'web_search'
      }
    ],
    tool_choice: 'auto'
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
      tools: [
        {
          type: 'openrouter:web_fetch',
          parameters: {
            engine: 'openrouter',
            max_uses: 5,
            max_content_tokens: 50000
          }
        }
      ]
    })
  });

  const body = await response.json().catch(() => undefined) as any;
  if (!response.ok || body?.error) {
    const message = body?.error?.message || body?.message || response.statusText;
    throw new Error(`OpenRouter request failed: ${response.status} ${message}`);
  }

  return buildTextGenerationResult(
    extractMessageContent(body?.choices?.[0]?.message?.content),
    body?.usage?.prompt_tokens,
    body?.usage?.completion_tokens
  );
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
