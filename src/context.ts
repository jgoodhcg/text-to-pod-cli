import type { Context } from './types.js';
import { EpisodeRepository } from './database.js';
import { normalizeUrl, generateUrlHash, generateEpisodeId } from './utils.js';
import { join } from 'path';

export function buildContext(options: any): Context {
  const context: Context = {
    options: {
      url: options.url,
      episodeDir: options.episodeDir,
      outputRoot: options.outputRoot || 'resources/episodes',
      startStage: options.startStage || 'metadata',
      runStage: options.runStage,
      metadataModel: options.metadataModel || 'gpt-4o',
      scriptModel: options.scriptModel || 'gpt-4o',
      metadataSystemPrompt: options.metadataSystemPrompt,
      metadataPromptTemplate: options.metadataPromptTemplate,
      scriptSystemPrompt: options.scriptSystemPrompt,
      scriptPromptTemplate: options.scriptPromptTemplate,
      operatorVoice: options.operatorVoice || 'coral',
      historianVoice: options.historianVoice || 'ballad',
      maxScriptChars: parseInt(options.maxScriptChars) || 900,
      s3cfg: options.s3cfg,
      force: options.force || false,
      dryRun: options.dryRun || false,
      noPublish: !options.publish,
    },
    paths: {},
  };

  // Initialize database connection
  const dbPath = join(process.cwd(), 'data', 'episodes.db');
  context.db = new EpisodeRepository(dbPath);

  // Handle URL-based episode creation
  if (options.url) {
    const normalizedUrl = normalizeUrl(options.url);
    const urlHash = generateUrlHash(options.url);
    
    // Check for duplicates
    const existing = context.db.findByUrlHash(urlHash);
    if (existing && !options.force) {
      throw new Error(`Episode already exists for this URL (ID: ${existing.episode_id}). Use --force to create a new episode or --episode-dir ${existing.episode_id} to resume existing episode.`);
    }
    
    // Generate new episode ID
    const episodeId = options.force ? generateEpisodeId(urlHash) : existing?.episode_id || generateEpisodeId(urlHash);
    context.episodeId = episodeId;
    
    // Set up paths
    const episodeDir = join(options.outputRoot || 'resources/episodes', episodeId);
    context.paths.episodeDir = episodeDir;
    context.paths.scriptFile = join(episodeDir, 'script.json');
    context.paths.chunksDir = join(episodeDir, 'audio', 'chunks');
    context.paths.mergedFile = join(episodeDir, 'audio', 'episode.mp3');
  } else if (options.episodeDir) {
    // Resume existing episode
    const episodeId = options.episodeDir.split('/').pop() || options.episodeDir;
    const existing = context.db.findByEpisodeId(episodeId);
    if (!existing) {
      throw new Error(`Episode not found: ${episodeId}`);
    }
    
    context.episodeId = episodeId;
    context.paths.episodeDir = options.episodeDir;
    context.paths.scriptFile = join(options.episodeDir, 'script.json');
    context.paths.chunksDir = join(options.episodeDir, 'audio', 'chunks');
    context.paths.mergedFile = join(options.episodeDir, 'audio', 'episode.mp3');
  }

  return context;
}