import type { Context } from './types.js';

export function buildContext(options: any): Context {
  return {
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
}