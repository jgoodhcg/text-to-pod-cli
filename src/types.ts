import { EpisodeRepository } from './database.js';

export interface Context {
  options: {
    url?: string;
    episodeDir?: string;
    outputRoot: string;
    startStage: string;
    runStage?: string;
    metadataModel: string;
    scriptModel: string;
    scriptOutlineModel: string;
    scriptContentModel: string;
    scriptRefinementModel: string;
    metadataSystemPrompt?: string;
    metadataPromptTemplate?: string;
    scriptSystemPrompt?: string;
    scriptPromptTemplate?: string;
    scholarVoice: string;
    maxScriptChars: number;
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
