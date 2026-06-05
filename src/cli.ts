#!/usr/bin/env bun

import { Command } from 'commander';
import { buildContext } from './context.js';
import { runHnFavoritesBatch } from './hn-favorites.js';
import { runUrlFileBatch } from './url-file.js';
import { runPipeline } from './runner.js';

const program = new Command();

program
  .name('text-to-pod-cli')
  .description('Transform a URL into a narrated podcast episode')
  .version('1.0.0');

program
  .option('--url <string>', 'URL to transform into podcast episode')
  .option('--url-file <path>', 'Read newline-delimited URLs from a file and batch-process')
  .option('--hn-favorites <string>', 'Hacker News username or favorites URL to batch-import')
  .option('--hn-favorites-limit <number>', 'Maximum number of favorite thread URLs to process')
  .option('--episode-dir <path>', 'Episode directory path (for resuming)')
  .option('--output-root <path>', 'Output root directory', 'resources/episodes')
  .option('--start-stage <stage>', 'Start from specified stage (metadata, script, audio, merge, publish)')
  .option('--run-stage <stage>', 'Run only specified stage (metadata, script, audio, merge, publish, html)')
  .option('--feed-file <path>', 'Path to RSS feed file for HTML generation (deprecated - use --run-stage html)')
  .option('--text-provider <provider>', 'Text generation provider (openai, openrouter)')
  .option('--audio-provider <provider>', 'Audio synthesis provider (openai, openrouter)')
  .option('--metadata-model <model>', 'Model for metadata stage (default: random pool)')
  .option('--script-model <model>', 'Model for script stage (legacy; default: random content pool)')
  .option('--script-outline-model <model>', 'Model for script outline stage (default: random pool)')
  .option('--script-content-model <model>', 'Model for script content stage (default: random pool)')
  .option('--script-refinement-model <model>', 'Model for script refinement stage (default: random pool)')
  .option('--script-description-model <model>', 'Model for script description stage (default: random pool)')
  .option('--tts-model <model>', 'TTS model for audio synthesis')
  .option('--metadata-system-prompt <path>', 'Path to metadata system prompt file')
  .option('--metadata-prompt-template <path>', 'Path to metadata prompt template file')
  .option('--script-system-prompt <path>', 'Path to script system prompt file')
  .option('--script-prompt-template <path>', 'Path to script prompt template file')
  .option('--scholar-voice <voice>', 'TTS voice for scholar (default: provider-specific random pool)')
  .option('--generation-retries <number>', 'Retries for malformed/failed generation stages', '1')
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
  .option('--dry-run', 'Skip all external operations (model APIs, ffmpeg, s3cmd)')
  .option('--no-publish', 'Run everything except final upload to DigitalOcean Spaces')
  .option('--publish', 'Enable final upload to DigitalOcean Spaces (default)')
  .option('--stop-on-error', 'Stop URL-file batch processing after the first failed URL')
  .action(async (options) => {
    try {
      if (options.urlFile) {
        await runUrlFileBatch(options);
        return;
      }

      if (options.hnFavorites) {
        await runHnFavoritesBatch(options);
        return;
      }

      const context = buildContext(options);
      try {
        await runPipeline(context);
      } finally {
        context.db.close();
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
