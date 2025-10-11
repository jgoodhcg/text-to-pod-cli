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
    metadataSystemPrompt?: string;
    metadataPromptTemplate?: string;
    scriptSystemPrompt?: string;
    scriptPromptTemplate?: string;
    operatorVoice: string;
    historianVoice: string;
    maxScriptChars: number;
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
  };
  episodeId?: string;
  db: EpisodeRepository;
}
