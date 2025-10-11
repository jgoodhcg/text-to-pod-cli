#!/usr/bin/env node

import { Command } from 'commander';
import { buildContext } from './context.js';
import { runPipeline } from './runner.js';

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
  .option('--dry-run', 'Skip all external operations (OpenAI API, ffmpeg, s3cmd)')
  .option('--no-publish', 'Run everything except final upload to DigitalOcean Spaces')
  .option('--publish', 'Enable final upload to DigitalOcean Spaces (default)')
  .action(async (options) => {
    try {
      const context = buildContext(options);
      await runPipeline(context);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();