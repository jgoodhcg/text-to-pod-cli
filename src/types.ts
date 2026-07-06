import { EpisodeRepository } from './database.js';

export type ModelProvider = 'openai' | 'openrouter';

export interface TextModelChoice {
  provider: ModelProvider;
  model: string;
  preferenceRank?: number;
}

export interface AudioPresetChoice {
  provider: ModelProvider;
  model: string;
  voice: string;
  preferenceRank?: number;
}

export interface Context {
  options: {
    url?: string;
    episodeDir?: string;
    outputRoot: string;
    startStage: string;
    runStage?: string;
    textProvider: ModelProvider;
    audioProvider: ModelProvider;
    metadataProvider: ModelProvider;
    metadataModel: string;
    metadataModelChoices: TextModelChoice[];
    scriptModel: string;
    scriptModelChoices: TextModelChoice[];
    scriptOutlineProvider: ModelProvider;
    scriptOutlineModel: string;
    scriptOutlineModelChoices: TextModelChoice[];
    scriptContentProvider: ModelProvider;
    scriptContentModel: string;
    scriptContentModelChoices: TextModelChoice[];
    scriptRefinementProvider: ModelProvider;
    scriptRefinementModel: string;
    scriptRefinementModelChoices: TextModelChoice[];
    scriptDescriptionProvider: ModelProvider;
    scriptDescriptionModel: string;
    scriptDescriptionModelChoices: TextModelChoice[];
    ttsModel: string;
    metadataSystemPrompt?: string;
    metadataPromptTemplate?: string;
    scriptSystemPrompt?: string;
    scriptPromptTemplate?: string;
    scholarVoice: string;
    maxScriptChars: number;
    generationRetries: number;
    introBumper?: string;
    outroBumper?: string;
    spacesOrigin: string;
    spacesFeedKey: string;
    spacesAudioPrefix: string;
    spacesCoverArtKey: string;
    feedTitle: string;
    feedDescription: string;
    feedLink: string;
    feedLanguage: string;
    feedAuthor: string;
    s3cfg?: string;
    force: boolean;
    dryRun: boolean;
    noPublish: boolean;
  };
  paths: {
    episodeDir?: string;
    scriptFile?: string;
    outlineFile?: string;
    chunksDir?: string;
    mergedFile?: string;
    feedFile?: string;
    introBumper?: string;
    outroBumper?: string;
  };
  episodeId?: string;
  url: string;
  db: EpisodeRepository;
}

export interface ScriptDialogue {
  persona: string;
  text: string;
}
