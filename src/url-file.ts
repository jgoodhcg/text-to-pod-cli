import { readFileSync } from 'fs';
import { buildContext } from './context.js';
import { EpisodeRepository } from './database.js';
import { CONFIG } from './config.js';
import { runPipeline } from './runner.js';
import { generateUrlHash } from './utils.js';
import { join } from 'path';

interface UrlFileOptions {
  urlFile: string;
  outputRoot?: string;
  dryRun?: boolean;
  [key: string]: unknown;
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

    const missing = urls.filter(
      url => !repo.findByUrlHash(generateUrlHash(url))
    );

    console.log(`[url-file] File: ${filePath}`);
    console.log(`[url-file] Valid URLs found: ${urls.length}`);
    console.log(`[url-file] Skipped (duplicates): ${urls.length - missing.length}`);
    console.log(`[url-file] To process: ${missing.length}`);

    if (missing.length === 0) {
      console.log('[url-file] No new URLs to process');
      return;
    }

    if (options.dryRun) {
      console.log('[url-file] Dry run: URLs that would be processed');
      for (const url of missing) {
        console.log(url);
      }
      return;
    }

    for (const [index, url] of missing.entries()) {
      console.log(`\n[url-file] (${index + 1}/${missing.length}) Processing ${url}`);

      const context = buildContext({
        ...options,
        url,
      });

      try {
        await runPipeline(context);
      } finally {
        context.db.close();
      }
    }
  } finally {
    repo.close();
  }
}
