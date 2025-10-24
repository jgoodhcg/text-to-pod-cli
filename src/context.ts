import type { Context } from './types.js';
import { EpisodeRepository } from './database.js';
import { normalizeUrl, generateUrlHash, generateEpisodeId } from './utils.js';
import { CONFIG } from './config.js';
import { join, resolve } from 'path';

export function buildContext(options: any): Context {
  const context: any = {
    options: {
      url: options.url,
      episodeDir: options.episodeDir,
      outputRoot: options.outputRoot || CONFIG.DEFAULT_OUTPUT_ROOT,
      startStage: options.startStage || 'metadata',
      runStage: options.runStage,
      metadataModel: options.metadataModel || CONFIG.DEFAULT_METADATA_MODEL,
      scriptModel: options.scriptModel || CONFIG.DEFAULT_SCRIPT_MODEL,
      scriptOutlineModel: options.scriptOutlineModel || CONFIG.DEFAULT_SCRIPT_OUTLINE_MODEL,
      scriptContentModel: options.scriptContentModel || CONFIG.DEFAULT_SCRIPT_CONTENT_MODEL,
      scriptRefinementModel: options.scriptRefinementModel || CONFIG.DEFAULT_SCRIPT_REFINEMENT_MODEL,
      scriptDescriptionModel: options.scriptDescriptionModel || CONFIG.DEFAULT_SCRIPT_DESCRIPTION_MODEL,
      metadataSystemPrompt: options.metadataSystemPrompt,
      metadataPromptTemplate: options.metadataPromptTemplate,
      scriptSystemPrompt: options.scriptSystemPrompt,
      scriptPromptTemplate: options.scriptPromptTemplate,
      scholarVoice: options.scholarVoice || CONFIG.DEFAULT_SCHOLAR_VOICE,
      maxScriptChars: parseInt(options.maxScriptChars) || CONFIG.DEFAULT_MAX_SCRIPT_CHARS,
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
