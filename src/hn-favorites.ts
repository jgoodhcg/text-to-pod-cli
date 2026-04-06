import { buildContext } from './context.js';
import { EpisodeRepository } from './database.js';
import { CONFIG } from './config.js';
import { runPipeline } from './runner.js';
import { generateUrlHash } from './utils.js';
import { join } from 'path';

const HN_BASE_URL = 'https://news.ycombinator.com';
const HN_HOSTNAME = 'news.ycombinator.com';

interface BatchOptions {
  hnFavorites: string;
  hnFavoritesLimit?: string | number;
  outputRoot?: string;
  dryRun?: boolean;
  [key: string]: unknown;
}

interface FavoriteThread {
  itemId: string;
  url: string;
}

export async function runHnFavoritesBatch(options: BatchOptions): Promise<void> {
  const username = parseHnFavoritesInput(options.hnFavorites);
  const limit = parseLimit(options.hnFavoritesLimit);
  const repo = new EpisodeRepository(join(process.cwd(), CONFIG.DATABASE_PATH));

  try {
    const favorites = await fetchFavoriteThreads(username, limit);
    const missing = favorites.filter(thread => !repo.findByUrlHash(generateUrlHash(thread.url)));

    console.log(`[hn-favorites] User: ${username}`);
    console.log(`[hn-favorites] Favorites fetched: ${favorites.length}`);
    console.log(`[hn-favorites] Missing from database: ${missing.length}`);

    if (missing.length === 0) {
      console.log('[hn-favorites] No new favorites to process');
      return;
    }

    if (options.dryRun) {
      console.log('[hn-favorites] Dry run: missing thread URLs');
      for (const thread of missing) {
        console.log(thread.url);
      }
      return;
    }

    for (const [index, thread] of missing.entries()) {
      console.log(`\n[hn-favorites] (${index + 1}/${missing.length}) Processing ${thread.url}`);

      const context = buildContext({
        ...options,
        url: thread.url,
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

function parseHnFavoritesInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Hacker News favorites input is required');
  }

  if (!trimmed.includes('://')) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid Hacker News favorites URL: ${input}`);
  }

  if (parsed.hostname !== HN_HOSTNAME) {
    throw new Error(`Expected a ${HN_HOSTNAME} URL, got: ${parsed.hostname}`);
  }

  const username = parsed.searchParams.get('id');
  if (!username) {
    throw new Error(`Missing "id" query parameter in Hacker News favorites URL: ${input}`);
  }

  return username;
}

function parseLimit(rawLimit?: string | number): number | undefined {
  if (rawLimit == null || rawLimit === '') {
    return undefined;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --hn-favorites-limit value: ${rawLimit}`);
  }

  return limit;
}

async function fetchFavoriteThreads(username: string, limit?: number): Promise<FavoriteThread[]> {
  const threads: FavoriteThread[] = [];
  const seenItemIds = new Set<string>();
  let nextPageUrl: string | undefined = `${HN_BASE_URL}/favorites?id=${encodeURIComponent(username)}`;
  let page = 1;

  while (nextPageUrl) {
    const response = await fetch(nextPageUrl, {
      headers: {
        'user-agent': 'text-to-pod-cli/1.0 (+https://news.ycombinator.com/)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Hacker News favorites page ${page}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const pageThreads = extractFavoriteThreadsFromHtml(html);

    for (const thread of pageThreads) {
      if (seenItemIds.has(thread.itemId)) {
        continue;
      }

      seenItemIds.add(thread.itemId);
      threads.push(thread);

      if (limit && threads.length >= limit) {
        return threads;
      }
    }

    nextPageUrl = extractMoreLink(html);
    page += 1;
  }

  return threads;
}

function extractFavoriteThreadsFromHtml(html: string): FavoriteThread[] {
  const threads: FavoriteThread[] = [];
  const seenItemIds = new Set<string>();
  const linkPattern = /href="(?:https:\/\/news\.ycombinator\.com\/)?item\?id=(\d+)"/g;

  for (const match of html.matchAll(linkPattern)) {
    const itemId = match[1];
    if (!itemId || seenItemIds.has(itemId)) {
      continue;
    }

    seenItemIds.add(itemId);
    threads.push({
      itemId,
      url: `${HN_BASE_URL}/item?id=${itemId}`,
    });
  }

  return threads;
}

function extractMoreLink(html: string): string | undefined {
  const moreMatch = html.match(/<a[^>]+href="([^"]*favorites\?[^"]*?&amp;p=\d+[^"]*)"[^>]*>\s*More\s*<\/a>/i)
    ?? html.match(/<a[^>]+href="([^"]*favorites\?[^"]*?\bp=\d+[^"]*)"[^>]*>\s*More\s*<\/a>/i);

  if (!moreMatch?.[1]) {
    return undefined;
  }

  const href = moreMatch[1].replace(/&amp;/g, '&');
  return new URL(href, `${HN_BASE_URL}/`).toString();
}
