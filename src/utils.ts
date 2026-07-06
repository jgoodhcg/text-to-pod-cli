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
  const date = now.toLocaleDateString('en-CA').replace(/-/g, ''); // yyyyMMdd (local time)
  const time = now.toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5).replace(/:/g, ''); // HHmm (local time)
  return `${date}-${time}-${urlHash}`;
}

function splitTextAtSentenceBoundaries(text: string, limit: number): string[] {
  const sentences = splitIntoSentences(text);
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        parts.push(current);
        current = '';
      }
      parts.push(...splitLongSentence(sentence, limit));
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > limit && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const sentenceEnd = /[.!?]["')\]]?(?=\s|$)/g;
  const sentences: string[] = [];
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

  return sentences;
}

function splitLongSentence(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let splitIndex = -1;
    // Look backwards from limit for a safe break point
    const searchStart = Math.floor(limit * 0.7); 

    const slice = remaining.substring(0, limit);

    // 1. Clauses
    const clauseMatches = [
      slice.lastIndexOf('; '),
      slice.lastIndexOf(': '),
      slice.lastIndexOf(', ')
    ];
    const bestClause = Math.max(...clauseMatches);

    if (bestClause > searchStart) {
      splitIndex = bestClause + 1; // Include the punctuation
    } else {
      // 2. Words (space)
      const spaceMatch = slice.lastIndexOf(' ');
      if (spaceMatch > searchStart) {
        splitIndex = spaceMatch; // Exclude the space (it gets trimmed from next part)
      }
    }

    // 3. Hard split if no natural break found
    if (splitIndex === -1) {
      splitIndex = limit;
    }

    parts.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
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
    const parts = splitTextAtSentenceBoundaries(entry.text, maxChars);

    for (const partText of parts) {
      const partLength = partText.length;
      const personaChanged = currentPersona && currentPersona !== entry.persona;
      const joinLength = currentChunk.length ? 2 : 0;
      const wouldExceed = currentCount + joinLength + partLength > maxChars;

      if ((personaChanged || wouldExceed) && currentChunk.length) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCount = 0;
        currentPersona = undefined;
      }

      if (!currentPersona) {
        currentPersona = entry.persona;
      }

      currentChunk.push({ ...entry, text: partText });
      currentCount += (currentChunk.length > 1 ? 2 : 0) + partLength;
    }
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
  const text = raw
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);

    if (escape) {
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];
      if (!validEscapes.includes(char)) {
        result += '\\' + char;
      } else {
        result += char;
      }
      escape = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escape = true;
      continue;
    }

    if (char === '\u201C' || char === '\u201D') {
      if (inString) {
        result += '\\"';
      } else {
        result += '"';
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      const code = text.charCodeAt(i);
      if (code < 0x20) {
        if (char === '\n') result += '\\n';
        else if (char === '\r') result += '\\r';
        else if (char === '\t') result += '\\t';
        else if (char === '\b') result += '\\b';
        else if (char === '\f') result += '\\f';
        else result += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
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
