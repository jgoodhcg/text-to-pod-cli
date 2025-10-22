import { createHash } from 'crypto';
import type { ScriptDialogue } from './types.js';

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Lowercase host
    urlObj.hostname = urlObj.hostname.toLowerCase();
    
    // Remove default ports
    if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')) {
      urlObj.port = '';
    }
    
    // Remove trailing slash
    if (urlObj.pathname.endsWith('/') && urlObj.pathname !== '/') {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    
    // Sort query parameters
    if (urlObj.search) {
      const searchParams = new URLSearchParams(urlObj.search);
      const sortedParams = Array.from(searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b));
      urlObj.search = new URLSearchParams(sortedParams).toString();
    }
    
    // Remove fragment
    urlObj.hash = '';
    
    return urlObj.toString();
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

export function generateUrlHash(url: string): string {
  const normalized = normalizeUrl(url);
  return createHash('sha1').update(normalized).digest('hex').substring(0, 8);
}

export function generateEpisodeId(urlHash: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // yyyyMMdd
  const time = now.toISOString().slice(11, 16).replace(/:/g, ''); // HHmm
  return `${date}-${time}-${urlHash}`;
}

export function chunkDialogueByCharacters(
  dialogue: ScriptDialogue[],
  maxChars: number
): ScriptDialogue[][] {
  if (maxChars <= 0) {
    throw new Error('maxChars must be greater than zero');
  }

  const chunks: ScriptDialogue[][] = [];
  let currentChunk: ScriptDialogue[] = [];
  let currentCount = 0;
  let currentPersona: string | undefined;

  for (const entry of dialogue) {
    const entryLength = entry.text.length;

    const exceedsLimit = entryLength > maxChars;
    const personaChanged = currentPersona && currentPersona !== entry.persona;

    if ((personaChanged || currentCount + entryLength > maxChars) && currentChunk.length) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentCount = 0;
      currentPersona = undefined;
    }

    if (exceedsLimit) {
      chunks.push([entry]);
      currentPersona = undefined;
      currentChunk = [];
      currentCount = 0;
      continue;
    }

    if (!currentPersona) {
      currentPersona = entry.persona;
    }

    currentChunk.push(entry);
    currentCount += entryLength;
  }

  if (currentChunk.length) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function stripMarkdownCodeFence(content: string): string {
  if (!content) return content;
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed.replace(/^```/, '').replace(/```$/, '').trim();
}

export function extractJsonObject(raw: string): string | undefined {
  return extractJsonStructure(raw, '{', '}');
}

export function extractJsonArray(raw: string): string | undefined {
  const stripped = stripMarkdownCodeFence(raw);
  const arrays: string[] = [];
  let searchStart = 0;
  while (searchStart < stripped.length) {
    const slice = stripped.slice(searchStart);
    const candidate = extractJsonStructure(slice, '[', ']');
    if (!candidate) break;
    arrays.push(candidate);
    searchStart += stripped.indexOf(candidate, searchStart) + candidate.length;
  }

  const valid = arrays.find(array => looksLikeDialogueArray(array));
  return valid;
}

export function sanitizeJsonText(raw: string): string {
  const text = raw.trim();
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);

    if (escape) {
      result += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escape = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString && (char === '\n' || char === '\r' || char === '\t')) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else {
        result += '\\t';
      }
      continue;
    }

    if (!inString && char === ',') {
      let j = i + 1;
      while (j < text.length) {
        const nextWhitespaceCandidate = text.charAt(j);
        if (!nextWhitespaceCandidate || !/\s/.test(nextWhitespaceCandidate)) {
          break;
        }
        j++;
      }
      const next = text.charAt(j);
      if (next === '}' || next === ']') {
        i = j - 1;
        continue;
      }
    }

    result += char;
  }

  return result.trim();
}

function extractJsonStructure(raw: string, opening: '{' | '[', closing: '}' | ']'): string | undefined {
  if (!raw) return undefined;
  const stripped = stripMarkdownCodeFence(raw);
  const startIndex = stripped.indexOf(opening);
  if (startIndex === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < stripped.length; i++) {
    const char = stripped.charAt(i);

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth++;
    } else if (char === closing) {
      depth--;
      if (depth === 0) {
        return stripped.slice(startIndex, i + 1).trim();
      }
    }
  }

  return undefined;
}

function looksLikeDialogueArray(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) return false;

  const firstObject = extractJsonStructure(trimmed, '{', '}');
  if (!firstObject) return false;

  try {
    const candidate = JSON.parse(`[${firstObject}]`);
    if (!Array.isArray(candidate) || !candidate.length) {
      return false;
    }
    const entry = candidate[0];
    return typeof entry === 'object' && entry !== null && 'persona' in entry && 'text' in entry;
  } catch {
    return false;
  }
}
