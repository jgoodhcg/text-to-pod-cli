import { readFileSync } from 'fs';
import type { ModelProvider, ScriptDialogue } from './types.js';
import { CONFIG } from './config.js';

export interface AuthoringScriptSegment extends ScriptDialogue {
  segment_id: string;
  chapter: string;
  source_ids: string[];
  purpose?: string;
}

export interface PersonaVoice {
  provider: ModelProvider;
  model: string;
  voice: string;
  instructions?: string;
}

export interface PersonaVoiceConfig {
  version: 1;
  personas: Record<string, PersonaVoice>;
}

const SUPPORTED_PERSONAS = new Set<string>(Object.values(CONFIG.PERSONAS));

export function parseAuthoringJsonl(content: string): AuthoringScriptSegment[] {
  const segments: AuthoringScriptSegment[] = [];
  const segmentIds = new Set<string>();

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid script JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid script JSONL at line ${index + 1}: expected an object`);
    }

    const candidate = parsed as Partial<AuthoringScriptSegment>;
    const segmentId = requireNonEmptyString(candidate.segment_id, `segment_id at line ${index + 1}`);
    if (segmentIds.has(segmentId)) {
      throw new Error(`Duplicate script segment_id: ${segmentId}`);
    }
    segmentIds.add(segmentId);

    const persona = requireNonEmptyString(candidate.persona, `persona at line ${index + 1}`);
    if (!SUPPORTED_PERSONAS.has(persona)) {
      throw new Error(`Unknown persona "${persona}" at line ${index + 1}`);
    }

    const sourceIds = candidate.source_ids;
    if (!Array.isArray(sourceIds) || sourceIds.some(sourceId => typeof sourceId !== 'string' || !sourceId.trim())) {
      throw new Error(`Invalid source_ids at line ${index + 1}`);
    }

    segments.push({
      segment_id: segmentId,
      chapter: requireNonEmptyString(candidate.chapter, `chapter at line ${index + 1}`),
      persona,
      text: requireNonEmptyString(candidate.text, `text at line ${index + 1}`),
      source_ids: sourceIds.map(sourceId => sourceId.trim()),
      ...(typeof candidate.purpose === 'string' && candidate.purpose.trim()
        ? { purpose: candidate.purpose.trim() }
        : {})
    });
  }

  if (segments.length === 0) {
    throw new Error('Script JSONL must contain at least one segment');
  }

  return segments;
}

export function loadAuthoringJsonl(path: string): AuthoringScriptSegment[] {
  return parseAuthoringJsonl(readFileSync(path, 'utf8'));
}

export function compileDialogue(segments: AuthoringScriptSegment[]): ScriptDialogue[] {
  return segments.map(segment => ({ persona: segment.persona, text: segment.text }));
}

export function validateSourceCoverage(
  segments: AuthoringScriptSegment[],
  sourceIds: readonly string[]
): void {
  const allowed = new Set(sourceIds);
  const covered = new Set<string>();

  for (const segment of segments) {
    for (const sourceId of segment.source_ids) {
      if (!allowed.has(sourceId)) {
        throw new Error(`Script segment ${segment.segment_id} references unknown source_id "${sourceId}"`);
      }
      covered.add(sourceId);
    }
  }

  const missing = sourceIds.filter(sourceId => !covered.has(sourceId));
  if (missing.length > 0) {
    throw new Error(`Script does not cover source_ids: ${missing.join(', ')}`);
  }
}

export function validatePersonaVoiceConfig(
  config: PersonaVoiceConfig,
  personas: readonly string[]
): void {
  if (config.version !== 1 || !config.personas || typeof config.personas !== 'object') {
    throw new Error('Voice config must have version 1 and a personas object');
  }

  for (const persona of new Set(personas)) {
    const entry = config.personas[persona];
    if (!entry) {
      throw new Error(`Voice config is missing persona "${persona}"`);
    }
    const provider = requireNonEmptyString(entry.provider, `provider for ${persona}`);
    if (provider !== 'openai' && provider !== 'openrouter') {
      throw new Error(`Unsupported provider "${provider}" for persona "${persona}"`);
    }
    requireNonEmptyString(entry.model, `model for ${persona}`);
    requireNonEmptyString(entry.voice, `voice for ${persona}`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or empty ${label}`);
  }
  return value.trim();
}
