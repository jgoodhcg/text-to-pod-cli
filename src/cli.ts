#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('text-to-pod-cli')
  .description('Transform a URL into a narrated podcast episode')
  .version('1.0.0');

program
  .option('--url <string>', 'URL to transform into podcast episode')
  .option('--episode-dir <path>', 'Episode directory path (for resuming)')
  .option('--output-root <path>', 'Output root directory', 'resources/episodes')
  .option('--start-stage <stage>', 'Start from specified stage', 'metadata')
  .option('--run-stage <stage>', 'Run only specified stage')
  .option('--metadata-model <model>', 'OpenAI model for metadata stage', 'gpt-4o')
  .option('--script-model <model>', 'OpenAI model for script stage', 'gpt-4o')
  .option('--metadata-system-prompt <path>', 'Path to metadata system prompt file')
  .option('--metadata-prompt-template <path>', 'Path to metadata prompt template file')
  .option('--script-system-prompt <path>', 'Path to script system prompt file')
  .option('--script-prompt-template <path>', 'Path to script prompt template file')
  .option('--operator-voice <voice>', 'OpenAI TTS voice for operator', 'coral')
  .option('--historian-voice <voice>', 'OpenAI TTS voice for historian', 'ballad')
  .option('--max-script-chars <number>', 'Maximum characters per script chunk', '900')
  .option('--s3cfg <path>', 'Path to s3cmd config file')
  .option('--force', 'Force creation even if URL hash already exists')
  .option('--dry-run', 'Skip actual uploads/publishing')
  .action((options) => {
    console.log('CLI options parsed:', options);
    
    if (options.runStage) {
      switch (options.runStage) {
        case 'metadata':
          console.log('Processed metadata stage');
          break;
        case 'script':
          console.log('Processed script stage');
          break;
        case 'audio':
          console.log('Processed audio stage');
          break;
        case 'merge':
          console.log('Processed merge stage');
          break;
        case 'publish':
          console.log('Processed publish stage');
          break;
        default:
          console.log(`Unknown stage: ${options.runStage}`);
      }
    } else {
      console.log(`Starting from stage: ${options.startStage}`);
      console.log('Would run all stages from start to publish');
    }
  });

program.parse();