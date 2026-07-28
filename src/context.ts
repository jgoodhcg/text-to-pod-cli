import type { Context } from './types.js';
import type { ModelProvider } from './types.js';
import { EpisodeRepository } from './database.js';
import {
  buildPreferredAudioChoices,
  buildPreferredTextChoices,
  buildTextRetrySequence,
  chooseAudioChoice,
  chooseTextChoice
} from './model-preferences.js';
import { normalizeUrl, generateUrlHash, generateEpisodeId } from './utils.js';
import { CONFIG } from './config.js';
import { join, resolve } from 'path';

export function buildContext(options: any): Context {
  const textProvider = parseProvider(options.textProvider, CONFIG.DEFAULT_TEXT_PROVIDER);
  const audioProvider = parseProvider(options.audioProvider, CONFIG.DEFAULT_AUDIO_PROVIDER);
  const explicitTextProvider = typeof options.textProvider === 'string' && options.textProvider.trim() !== '';
  const explicitAudioProvider = typeof options.audioProvider === 'string' && options.audioProvider.trim() !== '';
  const dbPath = join(process.cwd(), CONFIG.DATABASE_PATH);
  const db = new EpisodeRepository(dbPath);

  const metadataChoices = buildPreferredTextChoices({
    db,
    pool: CONFIG.DEFAULT_MODEL_POOLS.METADATA,
    fallbackProvider: textProvider,
    ...(explicitTextProvider ? { providerFilter: textProvider } : {})
  });
  requireAutomaticChoices(metadataChoices, options.metadataModel, 'metadata generation', '--metadata-model');
  const metadataChoice = chooseTextChoice({
    rawModel: options.metadataModel,
    choices: metadataChoices,
    fallbackModel: CONFIG.DEFAULT_METADATA_MODEL,
    fallbackProvider: textProvider
  });

  const scriptOutlineChoices = buildPreferredTextChoices({
    db,
    pool: CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_OUTLINE,
    fallbackProvider: textProvider,
    ...(explicitTextProvider ? { providerFilter: textProvider } : {})
  });
  requireAutomaticChoices(scriptOutlineChoices, options.scriptOutlineModel, 'script outline generation', '--script-outline-model');
  const scriptOutlineChoice = chooseTextChoice({
    rawModel: options.scriptOutlineModel,
    choices: scriptOutlineChoices,
    fallbackModel: CONFIG.DEFAULT_SCRIPT_OUTLINE_MODEL,
    fallbackProvider: textProvider
  });

  const scriptContentChoices = buildPreferredTextChoices({
    db,
    pool: CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_CONTENT,
    fallbackProvider: textProvider,
    ...(explicitTextProvider ? { providerFilter: textProvider } : {})
  });
  requireAutomaticChoices(scriptContentChoices, options.scriptContentModel || options.scriptModel, 'script content generation', '--script-content-model');
  const scriptContentChoice = chooseTextChoice({
    rawModel: options.scriptContentModel || options.scriptModel,
    choices: scriptContentChoices,
    fallbackModel: CONFIG.DEFAULT_SCRIPT_CONTENT_MODEL,
    fallbackProvider: textProvider
  });

  const scriptRefinementChoices = buildPreferredTextChoices({
    db,
    pool: CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_REFINEMENT,
    fallbackProvider: textProvider,
    ...(explicitTextProvider ? { providerFilter: textProvider } : {})
  });
  requireAutomaticChoices(scriptRefinementChoices, options.scriptRefinementModel, 'script refinement', '--script-refinement-model');
  const scriptRefinementChoice = chooseTextChoice({
    rawModel: options.scriptRefinementModel,
    choices: scriptRefinementChoices,
    fallbackModel: CONFIG.DEFAULT_SCRIPT_REFINEMENT_MODEL,
    fallbackProvider: textProvider
  });

  const scriptDescriptionChoices = buildPreferredTextChoices({
    db,
    pool: CONFIG.DEFAULT_MODEL_POOLS.SCRIPT_DESCRIPTION,
    fallbackProvider: textProvider,
    ...(explicitTextProvider ? { providerFilter: textProvider } : {})
  });
  requireAutomaticChoices(scriptDescriptionChoices, options.scriptDescriptionModel, 'description notes extraction', '--script-description-model');
  const scriptDescriptionChoice = chooseTextChoice({
    rawModel: options.scriptDescriptionModel,
    choices: scriptDescriptionChoices,
    fallbackModel: CONFIG.DEFAULT_SCRIPT_DESCRIPTION_MODEL,
    fallbackProvider: textProvider
  });

  const audioChoices = buildPreferredAudioChoices({
    db,
    presets: getAudioPresetChoices(),
    fallbackProvider: audioProvider,
    ...(explicitAudioProvider ? { providerFilter: audioProvider } : {})
  });
  if (!options.ttsModel && !options.scholarVoice && audioChoices.length === 0) {
    throw new Error('No pass-rated voice samples are available. Update model sample evaluations or pass --tts-model/--scholar-voice explicitly.');
  }
  const defaultAudioPreset = getDefaultAudioPreset(audioProvider);
  const audioPreset = chooseAudioChoice({
    rawModel: options.ttsModel,
    rawVoice: options.scholarVoice,
    choices: audioChoices,
    fallback: defaultAudioPreset
  });

  const context: any = {
    options: {
      url: options.url,
      episodeDir: options.episodeDir,
      outputRoot: options.outputRoot || CONFIG.DEFAULT_OUTPUT_ROOT,
      startStage: options.startStage || 'metadata',
      runStage: options.runStage,
      textProvider,
      audioProvider: audioPreset.provider,
      metadataProvider: metadataChoice.provider,
      metadataModel: metadataChoice.model,
      metadataModelChoices: buildTextRetrySequence(metadataChoice, metadataChoices),
      scriptModel: scriptContentChoice.model,
      scriptModelChoices: buildTextRetrySequence(scriptContentChoice, scriptContentChoices),
      scriptOutlineProvider: scriptOutlineChoice.provider,
      scriptOutlineModel: scriptOutlineChoice.model,
      scriptOutlineModelChoices: buildTextRetrySequence(scriptOutlineChoice, scriptOutlineChoices),
      scriptContentProvider: scriptContentChoice.provider,
      scriptContentModel: scriptContentChoice.model,
      scriptContentModelChoices: buildTextRetrySequence(scriptContentChoice, scriptContentChoices),
      scriptRefinementProvider: scriptRefinementChoice.provider,
      scriptRefinementModel: scriptRefinementChoice.model,
      scriptRefinementModelChoices: buildTextRetrySequence(scriptRefinementChoice, scriptRefinementChoices),
      scriptDescriptionProvider: scriptDescriptionChoice.provider,
      scriptDescriptionModel: scriptDescriptionChoice.model,
      scriptDescriptionModelChoices: buildTextRetrySequence(scriptDescriptionChoice, scriptDescriptionChoices),
      ttsModel: audioPreset.model,
      metadataSystemPrompt: options.metadataSystemPrompt,
      metadataPromptTemplate: options.metadataPromptTemplate,
      scriptSystemPrompt: options.scriptSystemPrompt,
      scriptPromptTemplate: options.scriptPromptTemplate,
      scholarVoice: audioPreset.voice,
      operatorVoice: options.operatorVoice || CONFIG.DEFAULT_OPERATOR_VOICE,
      historianVoice: options.historianVoice || CONFIG.DEFAULT_HISTORIAN_VOICE,
      narratorVoice: options.narratorVoice || CONFIG.DEFAULT_NARRATOR_VOICE,
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

  context.db = db;

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
    context.paths.voiceConfigFile = join(episodeDir, 'voice-config.json');

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
    context.paths.voiceConfigFile = join(episodeDir, 'voice-config.json');
    
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

function parseNonNegativeInt(rawValue: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function requireAutomaticChoices(
  choices: readonly unknown[],
  rawOverride: unknown,
  label: string,
  overrideFlag: string
): void {
  if (typeof rawOverride === 'string' && rawOverride.trim()) {
    return;
  }

  if (choices.length === 0) {
    throw new Error(`No pass-rated models are available for ${label}. Update model sample evaluations or pass ${overrideFlag} explicitly.`);
  }
}

function getAudioPresetChoices(): Array<{ provider: ModelProvider; model: string; voice: string }> {
  return [
    ...CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENROUTER.map(preset => ({ provider: 'openrouter' as const, ...preset })),
    ...CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENAI.map(preset => ({ provider: 'openai' as const, ...preset }))
  ];
}

function getDefaultAudioPreset(provider: ModelProvider): { provider: ModelProvider; model: string; voice: string } {
  const pool = provider === 'openai'
    ? CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENAI
    : CONFIG.DEFAULT_AUDIO_PRESET_POOLS.OPENROUTER;
  const preset = pool[0];
  return {
    provider,
    model: preset?.model ?? (provider === 'openai'
      ? CONFIG.DEFAULT_TTS_MODELS.OPENAI
      : CONFIG.DEFAULT_TTS_MODELS.OPENROUTER),
    voice: preset?.voice ?? CONFIG.DEFAULT_SCHOLAR_VOICE
  };
}
