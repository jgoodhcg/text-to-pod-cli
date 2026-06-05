import type { Context } from './types.js';
import type { ModelProvider } from './types.js';
import { EpisodeRepository } from './database.js';
import { normalizeUrl, generateUrlHash, generateEpisodeId } from './utils.js';
import { CONFIG } from './config.js';
import { join, resolve } from 'path';

export function buildContext(options: any): Context {
  const textProvider = parseProvider(options.textProvider, CONFIG.DEFAULT_TEXT_PROVIDER);
  const audioProvider = parseProvider(options.audioProvider, CONFIG.DEFAULT_AUDIO_PROVIDER);
  const audioPreset = chooseAudioPreset(options.ttsModel, options.scholarVoice, audioProvider);

  const context: any = {
    options: {
      url: options.url,
      episodeDir: options.episodeDir,
      outputRoot: options.outputRoot || CONFIG.DEFAULT_OUTPUT_ROOT,
      startStage: options.startStage || 'metadata',
      runStage: options.runStage,
      textProvider,
      audioProvider,
      metadataModel: chooseModel(options.metadataModel, CONFIG.DEFAULT_MODEL_POOLS.METADATA, CONFIG.DEFAULT_METADATA_MODEL),
      scriptModel: chooseModel(options.scriptModel, CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_CONTENT, CONFIG.DEFAULT_SCRIPT_MODEL),
      scriptOutlineModel: chooseModel(options.scriptOutlineModel, CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_OUTLINE, CONFIG.DEFAULT_SCRIPT_OUTLINE_MODEL),
      scriptContentModel: chooseModel(options.scriptContentModel, CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_CONTENT, CONFIG.DEFAULT_SCRIPT_CONTENT_MODEL),
      scriptRefinementModel: chooseModel(options.scriptRefinementModel, CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_REFINEMENT, CONFIG.DEFAULT_SCRIPT_REFINEMENT_MODEL),
      scriptDescriptionModel: chooseModel(options.scriptDescriptionModel, CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_DESCRIPTION, CONFIG.DEFAULT_SCRIPT_DESCRIPTION_MODEL),
      ttsModel: audioPreset.model,
      metadataSystemPrompt: options.metadataSystemPrompt,
      metadataPromptTemplate: options.metadataPromptTemplate,
      scriptSystemPrompt: options.scriptSystemPrompt,
      scriptPromptTemplate: options.scriptPromptTemplate,
      scholarVoice: audioPreset.voice,
      maxScriptChars: parseInt(options.maxScriptChars) || CONFIG.DEFAULT_MAX_SCRIPT_CHARS,
      generationRetries: parseNonNegativeInt(options.generationRetries, CONFIG.DEFAULT_GENERATION_RETRIES),
      introBumper: options.introBumper ?? CONFIG.DEFAULT_INTRO_BUMPER,
      outroBumper: options.outroBumper ?? CONFIG.DEFAULT_OUTRO_BUMPER,
      spacesOrigin: options.spacesOrigin || CONFIG.DEFAULT_SPACES_ORIGIN,
      spacesFeedKey: options.spacesFeedKey || CONFIG.DEFAULT_SPACES_FEED_KEY,
      spacesAudioPrefix: options.spacesAudioPrefix || CONFIG.DEFAULT_SPACES_AUDIO_PREFIX,
      spacesCoverArtKey: options.spacesCoverArtKey || CONFIG.DEFAULT_SPACES_COVER_ART_KEY,
      feedTitle: options.feedTitle || CONFIG.DEFAULT_FEED_TITLE,
      feedDescription: options.feedDescription || CONFIG.DEFAULT_FEED_DESCRIPTION,
      feedLink: options.feedLink || CONFIG.DEFAULT_FEED_LINK,
      feedLanguage: options.feedLanguage || CONFIG.DEFAULT_FEED_LANGUAGE,
      feedAuthor: options.feedAuthor || CONFIG.DEFAULT_FEED_AUTHOR,
      s3cfg: options.s3cfg || CONFIG.DEFAULT_S3CFG,
      force: options.force || false,
      dryRun: options.dryRun || false,
      noPublish: !options.publish,
    },
    paths: {},
  };

  if (context.options.introBumper) {
    context.paths.introBumper = resolve(process.cwd(), context.options.introBumper);
  }

  if (context.options.outroBumper) {
    context.paths.outroBumper = resolve(process.cwd(), context.options.outroBumper);
  }

  // Initialize database connection
  const dbPath = join(process.cwd(), CONFIG.DATABASE_PATH);
  context.db = new EpisodeRepository(dbPath);

  // Handle URL-based episode creation
  if (options.url) {
    const normalizedUrl = normalizeUrl(options.url);
    const urlHash = generateUrlHash(options.url);
    
    // Check for duplicates
    const existing = context.db.findByUrlHash(urlHash);
    if (existing && !options.force) {
      throw new Error(`Episode already exists for this URL (ID: ${existing.episode_id}). Use --force to regenerate the episode or --episode-dir ${existing.episode_id} to resume existing episode.`);
    }
    
    // Use existing episode ID or generate new one
    const episodeId = existing?.episode_id || generateEpisodeId(urlHash);
    context.episodeId = episodeId;
    
    // Set up paths
    const episodeDir = join(options.outputRoot || 'resources/episodes', episodeId);
    context.paths.episodeDir = episodeDir;
    context.paths.scriptFile = join(episodeDir, 'script.json');
    context.paths.outlineFile = join(episodeDir, 'outline.json');
    context.paths.chunksDir = join(episodeDir, 'audio', 'chunks');
    context.paths.mergedFile = join(episodeDir, 'audio', 'episode.mp3');
    context.paths.feedFile = join(episodeDir, 'podcast.xml');

    // Handle existing episode with --force
    if (existing && options.force) {
      console.log(`[context] Regenerating existing episode: ${episodeId}`);
      context.db.resetEpisodeForRegeneration(episodeId);
    } else if (!existing) {
      // Insert new episode row
      context.db.insertEpisode({
        episode_id: episodeId,
        original_url: options.url,
        normalized_url: normalizedUrl,
        url_hash: urlHash,
        metadata_status: CONFIG.STAGE_STATUS.PENDING,
        script_status: CONFIG.STAGE_STATUS.PENDING,
        audio_status: CONFIG.STAGE_STATUS.PENDING,
        merge_status: CONFIG.STAGE_STATUS.PENDING,
        publish_status: CONFIG.STAGE_STATUS.PENDING
      });
    }
  } else if (options.episodeDir) {
    // Resume existing episode
    const episodeId = options.episodeDir.split('/').pop() || options.episodeDir;
    const existing = context.db.findByEpisodeId(episodeId);
    if (!existing) {
      throw new Error(`Episode not found: ${episodeId}`);
    }
    
    context.episodeId = episodeId;
    
    // Always use the standard output root directory for episode paths
    const episodeDir = join(options.outputRoot || CONFIG.DEFAULT_OUTPUT_ROOT, episodeId);
    context.paths.episodeDir = episodeDir;
    context.paths.scriptFile = join(episodeDir, 'script.json');
    context.paths.outlineFile = join(episodeDir, 'outline.json');
    context.paths.chunksDir = join(episodeDir, 'audio', 'chunks');
    context.paths.mergedFile = join(episodeDir, 'audio', 'episode.mp3');
    context.paths.feedFile = join(episodeDir, 'podcast.xml');
    
    // Add URL to options for stages that need it
    context.options.url = existing.original_url || existing.normalized_url;
  } else if (options.feedFile) {
    // HTML generation mode - use provided feed file
    context.paths.feedFile = resolve(process.cwd(), options.feedFile);
  } else if (options.runStage === 'html' || options.startStage === 'html') {
    // HTML generation mode - no feed file needed, will fetch from Spaces
    // Set default values for HTML generation
    context.options.spacesOrigin = options.spacesOrigin || CONFIG.DEFAULT_SPACES_ORIGIN;
    context.options.spacesFeedKey = options.spacesFeedKey || CONFIG.DEFAULT_SPACES_FEED_KEY;
  }

  return context;
}

function parseProvider(rawProvider: unknown, fallback: string): ModelProvider {
  const provider = String(rawProvider || fallback);
  if (provider === 'openai' || provider === 'openrouter') {
    return provider;
  }

  throw new Error(`Invalid provider "${provider}". Expected "openai" or "openrouter".`);
}

function chooseModel(rawModel: unknown, pool: readonly string[], fallback: string): string {
  if (typeof rawModel === 'string' && rawModel.trim()) {
    return rawModel.trim();
  }

  if (pool.length === 0) {
    return fallback;
  }

  return pool[Math.floor(Math.random() * pool.length)] || fallback;
}

function chooseAudioPreset(
  rawModel: unknown,
  rawVoice: unknown,
  provider: ModelProvider
): { model: string; voice: string } {
  const model = typeof rawModel === 'string' && rawModel.trim()
    ? rawModel.trim()
    : undefined;
  const voice = typeof rawVoice === 'string' && rawVoice.trim()
    ? rawVoice.trim()
    : undefined;
  const pool = provider === 'openai'
    ? CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENAI
    : CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENROUTER;
  const defaultPreset = pool[0] ?? {
    model: provider === 'openai'
      ? CONFIG.DEFAULT_TTS_MODELS.OPENAI
      : CONFIG.DEFAULT_TTS_MODELS.OPENROUTER,
    voice: CONFIG.DEFAULT_SCHOLAR_VOICE
  };

  if (model && voice) {
    return { model, voice };
  }

  if (model) {
    const matchingPresets = pool.filter(preset => preset.model === model);
    const preset = matchingPresets[Math.floor(Math.random() * matchingPresets.length)];
    return { model, voice: preset?.voice ?? defaultPreset.voice };
  }

  if (voice) {
    const matchingPresets = pool.filter(preset => preset.voice === voice);
    const preset = matchingPresets[Math.floor(Math.random() * matchingPresets.length)];
    return { model: preset?.model ?? defaultPreset.model, voice };
  }

  const preset = pool[Math.floor(Math.random() * pool.length)] ?? defaultPreset;
  return { model: preset.model, voice: preset.voice };
}

function parseNonNegativeInt(rawValue: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
