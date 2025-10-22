import type { Context } from '../types.js';
import type { EpisodeRow } from '../database.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';
import { CONFIG } from '../config.js';

export async function runMerge(context: Context): Promise<void> {
  console.log('[merge] Running merge stage');
  console.log('[merge] Dry run:', context.options.dryRun);

  if (!context.episodeId) {
    throw new Error('Episode ID must be set in context');
  }

  if (!context.paths.episodeDir || !context.paths.chunksDir || !context.paths.mergedFile) {
    throw new Error('Episode paths are incomplete; ensure metadata and script stages ran first');
  }

  const episode = context.db.findByEpisodeId(context.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${context.episodeId}`);
  }

  if (episode.merge_status === CONFIG.STAGE_STATUS.COMPLETED) {
    if (context.options.force) {
      console.log('[merge] Stage previously completed, rerunning due to --force');
    } else {
      console.log('[merge] Stage already completed, skipping');
      return;
    }
  }

  if (episode.audio_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    throw new Error('Audio stage must be completed before merging');
  }

  const chunkList = resolveChunkPaths(context, episode);
  if (!chunkList.length) {
    throw new Error('No audio chunks found to merge');
  }

  console.log('[merge] Chunk files to merge:', chunkList.length);

  const segmentsToMerge = buildMergeFileList(context, chunkList);

  console.log('[merge] Total segments (including bumpers):', segmentsToMerge.length);

  if (context.options.dryRun) {
    segmentsToMerge.forEach((segment, index) => {
      console.log(`[merge] Dry run: would include segment ${index + 1}: ${segment}`);
    });
    return;
  }

  const mergedOutputPath = resolve(context.paths.mergedFile!);
  ensureDirectory(dirname(mergedOutputPath));

  const concatFilePath = resolve(context.paths.chunksDir!, 'concat.txt');
  const concatFileContents = segmentsToMerge
    .map(chunkPath => `file '${chunkPath.replace(/'/g, `'\\''`)}'`)
    .join('\n');

  writeFileSync(concatFilePath, concatFileContents);

  try {
    context.db.updateStageStatus(context.episodeId, 'merge', CONFIG.STAGE_STATUS.IN_PROGRESS);

    await runFfmpegConcat(concatFilePath, mergedOutputPath);

    const relativeMergedPath = 'audio/episode.mp3';

    context.db.updateStageStatus(context.episodeId, 'merge', CONFIG.STAGE_STATUS.COMPLETED, {
      merged_audio_path: relativeMergedPath
    });

    console.log('[merge] Merged audio created at:', mergedOutputPath);
  } catch (error) {
    context.db.updateStageStatus(context.episodeId, 'merge', CONFIG.STAGE_STATUS.FAILED);
    throw error;
  } finally {
    try {
      unlinkSync(concatFilePath);
    } catch {
      // Ignore errors when cleaning up temp file
    }
  }
}

function resolveChunkPaths(context: Context, episode: EpisodeRow): string[] {
  if (!context.paths.episodeDir || !context.paths.chunksDir) {
    return [];
  }

  const chunkEntries: string[] = [];
  if (episode.audio_files) {
    try {
      const files = JSON.parse(episode.audio_files) as unknown;
      if (Array.isArray(files)) {
        files.forEach((relative) => {
          if (typeof relative === 'string') {
            chunkEntries.push(resolve(context.paths.episodeDir!, relative));
          }
        });
      }
    } catch (error) {
      console.warn('[merge] Failed to parse audio_files metadata, falling back to deterministic ordering');
    }
  }

  if (!chunkEntries.length) {
    const files = readdirSync(context.paths.chunksDir!)
      .filter((file: string) => file.endsWith('.mp3'))
      .sort();
    chunkEntries.push(...files.map(file => resolve(context.paths.chunksDir!, file)));
  }

  const existingChunks = chunkEntries.filter(path => existsSync(path));
  if (existingChunks.length !== chunkEntries.length) {
    const missing = chunkEntries.filter(path => !existsSync(path));
    throw new Error(`[merge] Missing chunk files: ${missing.join(', ')}`);
  }

  return existingChunks;
}

function buildMergeFileList(context: Context, chunkFiles: string[]): string[] {
  const segments: string[] = [];

  if (context.options.introBumper) {
    const introPath = context.paths.introBumper;
    if (introPath && existsSync(introPath)) {
      console.log('[merge] Including intro bumper:', introPath);
      segments.push(introPath);
    } else {
      console.warn('[merge] Intro bumper not found, skipping:', introPath ?? context.options.introBumper);
    }
  }

  segments.push(...chunkFiles);

  if (context.options.outroBumper) {
    const outroPath = context.paths.outroBumper;
    if (outroPath && existsSync(outroPath)) {
      console.log('[merge] Including outro bumper:', outroPath);
      segments.push(outroPath);
    } else {
      console.warn('[merge] Outro bumper not found, skipping:', outroPath ?? context.options.outroBumper);
    }
  }

  return segments;
}

function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function runFfmpegConcat(listFile: string, outputFile: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-ar', '24000',
      '-ac', '1',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      outputFile
    ], {
      stdio: ['ignore', 'inherit', 'inherit']
    });

    ffmpeg.on('error', (error) => {
      rejectPromise(new Error(`[merge] Failed to spawn ffmpeg: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`[merge] ffmpeg exited with code ${code}`));
      }
    });
  });
}
