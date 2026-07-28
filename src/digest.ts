import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs';
import { dirname, join, resolve } from 'path';
import { EpisodeRepository } from './database.js';
import { CONFIG } from './config.js';
import { generateEpisodeId, generateUrlHash, normalizeUrl } from './utils.js';
import {
  compileDialogue,
  loadAuthoringJsonl,
  validatePersonaVoiceConfig,
  validateSourceCoverage,
  type PersonaVoiceConfig
} from './script-artifacts.js';

interface DigestSource {
  id: string;
  title: string;
  url: string;
}

interface DigestManifest {
  version: 1;
  slug: string;
  title: string;
  summary: string;
  description_notes?: string;
  script_file: string;
  script_model?: string;
  sources: DigestSource[];
  audio: PersonaVoiceConfig;
}

interface DigestImportOptions {
  digestManifest: string;
  outputRoot?: string;
  dryRun?: boolean;
}

export function runDigestImport(options: DigestImportOptions): void {
  const manifestPath = resolve(process.cwd(), options.digestManifest);
  const manifest = parseDigestManifest(readFileSync(manifestPath, 'utf8'));
  const manifestDir = dirname(manifestPath);
  const scriptPath = resolve(manifestDir, manifest.script_file);
  const segments = loadAuthoringJsonl(scriptPath);
  const sourceIds = manifest.sources.map(source => source.id);

  validateSourceCoverage(segments, sourceIds);
  validatePersonaVoiceConfig(manifest.audio, segments.map(segment => segment.persona));

  const canonicalUrl = `digest://${manifest.slug}`;
  const normalizedCanonicalUrl = normalizeUrl(canonicalUrl);
  const canonicalHash = generateUrlHash(canonicalUrl);
  const episodeId = generateEpisodeId(canonicalHash);
  const outputRoot = options.outputRoot || CONFIG.DEFAULT_OUTPUT_ROOT;
  const episodeDir = join(outputRoot, episodeId);
  const db = new EpisodeRepository(join(process.cwd(), CONFIG.DATABASE_PATH));

  try {
    const existingDigest = db.findByEpisodeId(episodeId) ?? db.findByUrlHash(canonicalHash);
    if (existingDigest) {
      throw new Error(`Digest already exists: ${existingDigest.episode_id}`);
    }

    const normalizedSources = manifest.sources.map((source, position) => {
      const normalizedUrl = normalizeUrl(source.url);
      const urlHash = generateUrlHash(source.url);
      const existing = db.findByUrlHash(urlHash);
      if (existing) {
        throw new Error(`Source ${source.id} is already covered by episode ${existing.episode_id}: ${source.url}`);
      }
      return {
        originalUrl: source.url,
        normalizedUrl,
        urlHash,
        position,
        title: source.title
      };
    });

    const dialogue = compileDialogue(segments);
    console.log(`[digest] Manifest: ${manifestPath}`);
    console.log(`[digest] Episode: ${episodeId}`);
    console.log(`[digest] Sources: ${normalizedSources.length}`);
    console.log(`[digest] Script segments: ${dialogue.length}`);
    console.log(`[digest] Script characters: ${dialogue.reduce((sum, entry) => sum + entry.text.length, 0)}`);

    if (options.dryRun) {
      console.log('[digest] Dry run: validation passed; no files or database rows written');
      return;
    }

    if (existsSync(episodeDir)) {
      throw new Error(`Episode directory already exists: ${episodeDir}`);
    }
    mkdirSync(outputRoot, { recursive: true });
    const stagingDir = mkdtempSync(join(outputRoot, '.digest-import-'));

    try {
      writeFileSync(join(stagingDir, 'script.json'), JSON.stringify(dialogue, null, 2));
      writeFileSync(join(stagingDir, 'script.authoring.jsonl'), readFileSync(scriptPath));
      writeFileSync(join(stagingDir, 'digest-manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(stagingDir, 'voice-config.json'), JSON.stringify(manifest.audio, null, 2));
      renameSync(stagingDir, episodeDir);

      try {
        db.insertDigestEpisode({
          episode: {
            episode_id: episodeId,
            episode_kind: 'digest',
            original_url: canonicalUrl,
            normalized_url: normalizedCanonicalUrl,
            url_hash: canonicalHash,
            metadata_status: CONFIG.STAGE_STATUS.COMPLETED,
            metadata_model: 'manual:digest-manifest',
            metadata_title: manifest.title,
            metadata_summary: manifest.summary,
            metadata_related_links: JSON.stringify(
              manifest.sources.map(source => ({ title: source.title, url: source.url }))
            ),
            script_status: CONFIG.STAGE_STATUS.COMPLETED,
            script_model: manifest.script_model || 'manual',
            script_file_path: join(episodeDir, 'script.json'),
            script_segment_count: dialogue.length,
            script_description_notes: JSON.stringify({
              description_notes: manifest.description_notes || manifest.summary
            }),
            audio_status: CONFIG.STAGE_STATUS.PENDING,
            merge_status: CONFIG.STAGE_STATUS.PENDING,
            publish_status: CONFIG.STAGE_STATUS.PENDING
          },
          sources: normalizedSources
        });
      } catch (error) {
        rmSync(episodeDir, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      throw error;
    }

    console.log(`[digest] Imported episode into ${episodeDir}`);
    console.log(`[digest] Continue with: bun run dev -- --episode-dir ${episodeId} --start-stage audio`);
  } finally {
    db.close();
  }
}

function parseDigestManifest(raw: string): DigestManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid digest manifest JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Digest manifest must be a JSON object');
  }

  const manifest = parsed as Partial<DigestManifest>;
  if (manifest.version !== 1) throw new Error('Digest manifest version must be 1');
  requireString(manifest.slug, 'slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug!)) {
    throw new Error('Digest slug must contain lowercase letters, numbers, and single hyphens');
  }
  requireString(manifest.title, 'title');
  requireString(manifest.summary, 'summary');
  requireString(manifest.script_file, 'script_file');
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error('Digest manifest sources must be a non-empty array');
  }
  const sourceIds = new Set<string>();
  for (const [index, source] of manifest.sources.entries()) {
    requireString(source?.id, `sources[${index}].id`);
    requireString(source?.title, `sources[${index}].title`);
    requireString(source?.url, `sources[${index}].url`);
    normalizeUrl(source.url);
    if (sourceIds.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
  }
  if (!manifest.audio) throw new Error('Digest manifest audio config is required');

  return manifest as DigestManifest;
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Digest manifest ${label} must be a non-empty string`);
  }
}
