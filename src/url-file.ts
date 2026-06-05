import { readFileSync } from 'fs';
import { buildContext } from './context.js';
import { EpisodeRepository } from './database.js';
import type { EpisodeRow } from './database.js';
import { CONFIG } from './config.js';
import { runPipeline } from './runner.js';
import { generateUrlHash } from './utils.js';
import { join } from 'path';

interface UrlFileOptions {
  urlFile: string;
  outputRoot?: string;
  dryRun?: boolean;
  stopOnError?: boolean;
  [key: string]: unknown;
}

interface BatchItem {
  url: string;
  existing?: EpisodeRow;
  startStage: string;
}

const HN_ITEM_PATTERN = /^(\d+)$/;
const HN_ITEM_URL_PATTERN = /news\.ycombinator\.com\/item\?id=(\d+)/;

function normalizeLine(raw: string): string | null {
  const line = raw.trim();
  if (!line || line.startsWith('#')) {
    return null;
  }

  const bareId = line.match(HN_ITEM_PATTERN);
  if (bareId) {
    return `https://news.ycombinator.com/item?id=${bareId[1]}`;
  }

  try {
    const parsed = new URL(line);
    const hnMatch = parsed.pathname + '?' + parsed.searchParams.toString();
    const hnId = hnMatch.match(HN_ITEM_URL_PATTERN);
    if (hnId) {
      return `https://news.ycombinator.com/item?id=${hnId[1]}`;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isComplete(row: EpisodeRow): boolean {
  return row.metadata_status === CONFIG.STAGE_STATUS.COMPLETED
    && row.script_status === CONFIG.STAGE_STATUS.COMPLETED
    && row.audio_status === CONFIG.STAGE_STATUS.COMPLETED
    && row.merge_status === CONFIG.STAGE_STATUS.COMPLETED
    && row.publish_status === CONFIG.STAGE_STATUS.COMPLETED;
}

function firstIncompleteStage(row: EpisodeRow): string {
  if (row.metadata_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    return 'metadata';
  }
  if (row.script_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    return 'script';
  }
  if (row.audio_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    return 'audio';
  }
  if (row.merge_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    return 'merge';
  }
  return 'publish';
}

export async function runUrlFileBatch(options: UrlFileOptions): Promise<void> {
  const filePath = options.urlFile;
  const repo = new EpisodeRepository(join(process.cwd(), CONFIG.DATABASE_PATH));

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    const urls: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const url = normalizeLine(line);
      if (url && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }

    const toProcess: BatchItem[] = [];
    let completedCount = 0;

    for (const url of urls) {
      const existing = repo.findByUrlHash(generateUrlHash(url));
      if (!existing) {
        toProcess.push({ url, startStage: 'metadata' });
        continue;
      }

      if (isComplete(existing) && !options.force) {
        completedCount++;
        continue;
      }

      toProcess.push({
        url,
        existing,
        startStage: options.force ? 'metadata' : firstIncompleteStage(existing)
      });
    }

    console.log(`[url-file] File: ${filePath}`);
    console.log(`[url-file] Valid URLs found: ${urls.length}`);
    console.log(`[url-file] Skipped (completed): ${completedCount}`);
    console.log(`[url-file] To process: ${toProcess.length}`);

    if (toProcess.length === 0) {
      console.log('[url-file] No new URLs to process');
      return;
    }

    if (options.dryRun) {
      console.log('[url-file] Dry run: URLs that would be processed');
      for (const item of toProcess) {
        const resume = item.existing ? ` (resume ${item.existing.episode_id} from ${item.startStage})` : '';
        console.log(`${item.url}${resume}`);
      }
      return;
    }

    const failures: Array<{ url: string; episodeId?: string; error: string }> = [];

    for (const [index, item] of toProcess.entries()) {
      console.log(`\n[url-file] (${index + 1}/${toProcess.length}) Processing ${item.url}`);
      if (item.existing) {
        console.log(`[url-file] Resuming existing episode ${item.existing.episode_id} from stage: ${item.startStage}`);
      }

      const context = buildContext({
        ...options,
        url: item.existing ? undefined : item.url,
        episodeDir: item.existing ? item.existing.episode_id : options.episodeDir,
        startStage: item.startStage,
      });

      try {
        await runPipeline(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({
          url: item.url,
          ...(context.episodeId ? { episodeId: context.episodeId } : {}),
          error: message
        });
        console.error(`[url-file] Failed: ${item.url}`);
        console.error(`[url-file] Error: ${message}`);

        if (options.stopOnError) {
          throw error;
        }
      } finally {
        context.db.close();
      }
    }

    if (failures.length > 0) {
      console.error('\n[url-file] Batch completed with failures:');
      for (const failure of failures) {
        const episode = failure.episodeId ? ` (${failure.episodeId})` : '';
        console.error(`- ${failure.url}${episode}: ${failure.error}`);
      }
      process.exitCode = 1;
    }
  } finally {
    repo.close();
  }
}
