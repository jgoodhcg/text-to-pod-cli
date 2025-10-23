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
  .option('--start-stage <stage>', 'Start from specified stage')
  .option('--run-stage <stage>', 'Run only specified stage')
  .option('--metadata-model <model>', 'OpenAI model for metadata stage')
  .option('--script-model <model>', 'OpenAI model for script stage (legacy)')
  .option('--script-outline-model <model>', 'OpenAI model for script outline stage')
  .option('--script-content-model <model>', 'OpenAI model for script content stage')
  .option('--script-refinement-model <model>', 'OpenAI model for script refinement stage')
  .option('--script-description-model <model>', 'OpenAI model for script description stage')
  .option('--metadata-system-prompt <path>', 'Path to metadata system prompt file')
  .option('--metadata-prompt-template <path>', 'Path to metadata prompt template file')
  .option('--script-system-prompt <path>', 'Path to script system prompt file')
  .option('--script-prompt-template <path>', 'Path to script prompt template file')
  .option('--scholar-voice <voice>', 'OpenAI TTS voice for scholar')
  .option('--intro-bumper <path>', 'Path to intro bumper audio (MP3)')
  .option('--outro-bumper <path>', 'Path to outro bumper audio (MP3)')
  .option('--max-script-chars <number>', 'Maximum characters per script chunk')
  .option('--spaces-origin <url>', 'Base URL for DigitalOcean Spaces feed host')
  .option('--spaces-feed-key <path>', 'Key/path to the RSS feed within Spaces')
  .option('--spaces-audio-prefix <path>', 'Directory/key prefix for published episode audio')
  .option('--spaces-cover-art-key <path>', 'Key/path to the podcast cover art image')
  .option('--feed-title <string>', 'Podcast feed title')
  .option('--feed-description <string>', 'Podcast feed description')
  .option('--feed-link <string>', 'Canonical podcast website link')
  .option('--feed-language <locale>', 'Podcast feed language (e.g. en-US)')
  .option('--feed-author <string>', 'Podcast feed author/creator')
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
