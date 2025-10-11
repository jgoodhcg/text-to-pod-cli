import type { Context } from '../types.js';
import type { EpisodeRow } from '../database.js';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { CONFIG } from '../config.js';

export async function runPublish(context: Context): Promise<void> {
  console.log('[publish] Running publish stage');
  console.log('[publish] No publish:', context.options.noPublish);
  console.log('[publish] Dry run:', context.options.dryRun);

  if (!context.episodeId) {
    throw new Error('Episode ID must be set in context');
  }

  if (!context.paths.mergedFile) {
    throw new Error('Merged audio path missing from context');
  }

  if (!context.paths.feedFile) {
    throw new Error('Feed file path missing from context');
  }

  const episode = context.db.findByEpisodeId(context.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${context.episodeId}`);
  }

  if (episode.publish_status === CONFIG.STAGE_STATUS.COMPLETED) {
    if (!context.options.force) {
      console.log('[publish] Stage already completed, skipping');
      return;
    }
    console.log('[publish] Force flag detected; re-running publish stage');
  }

  if (episode.merge_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    throw new Error('Merge stage must be completed before publish');
  }

  if (!existsSync(context.paths.mergedFile)) {
    throw new Error(`Merged audio file not found: ${context.paths.mergedFile}`);
  }

  const feedUrl = buildRemoteUrl(context.options.spacesOrigin, context.options.spacesFeedKey);
  const audioRemoteKey = buildAudioKey(context.options.spacesAudioPrefix, context.episodeId);
  const audioRemoteUrl = buildRemoteUrl(context.options.spacesOrigin, audioRemoteKey);
  const coverArtUrl = buildRemoteUrl(context.options.spacesOrigin, context.options.spacesCoverArtKey);
  const episodeDurationEstimate = undefined; // Placeholder until duration extraction is added
  const enclosureLength = statSync(context.paths.mergedFile).size.toString();

  console.log('[publish] Feed URL:', feedUrl);
  console.log('[publish] Planned audio key:', audioRemoteKey);

  const plannedPublishAt = new Date().toISOString();
  const rssDetails = buildRssItem(
    episode,
    audioRemoteUrl,
    enclosureLength,
    episodeDurationEstimate,
    plannedPublishAt,
    coverArtUrl,
    context.options.feedAuthor
  );
  logRssItemSummary(episode, audioRemoteUrl, enclosureLength, coverArtUrl, rssDetails, context.options.feedAuthor);

  if (context.options.dryRun) {
    console.log('[publish] Dry run: skipping feed download and uploads');
    return;
  }

  context.db.updateStageStatus(context.episodeId, 'publish', CONFIG.STAGE_STATUS.IN_PROGRESS);

  try {
    ensureDirectory(dirname(context.paths.feedFile!));
    const feedContent = await fetchFeed(feedUrl, context.paths.feedFile);
    const feedObject = feedContent
      ? parseFeed(feedContent)
      : createDefaultFeed(context, plannedPublishAt, coverArtUrl);

    ensureFeedBranding(feedObject, context, plannedPublishAt, coverArtUrl);

    if (context.options.force) {
      const removed = removeExistingItem(feedObject, episode);
      if (removed) {
        console.log('[publish] Existing feed item removed due to --force');
      }
    } else {
      enforceNoDuplicateEpisode(feedObject, episode);
    }

    if (context.options.noPublish) {
      context.db.updateStageStatus(context.episodeId, 'publish', CONFIG.STAGE_STATUS.PENDING, {
        publish_feed_local_path: context.paths.feedFile,
        publish_feed_remote_path: context.options.spacesFeedKey,
        publish_audio_remote_path: audioRemoteKey,
        publish_item_guid: episode.episode_id
      });
      console.log('[publish] Skipping upload (no-publish flag enabled)');
      return;
    }

    insertItemIntoFeed(feedObject, rssDetails.item);
    const updatedFeed = buildFeedXml(feedObject);
    writeFileSync(context.paths.feedFile, updatedFeed, 'utf-8');
    console.log('[publish] Updated feed written to:', context.paths.feedFile);

    await uploadAssetWithS3cmd(context.paths.mergedFile, audioRemoteKey, context, ['--acl-public']);
    await uploadAssetWithS3cmd(context.paths.feedFile, context.options.spacesFeedKey, context, ['--acl-public']);

    context.db.updateStageStatus(context.episodeId, 'publish', CONFIG.STAGE_STATUS.COMPLETED, {
      publish_feed_local_path: context.paths.feedFile,
      publish_feed_remote_path: context.options.spacesFeedKey,
      publish_audio_remote_path: audioRemoteKey,
      publish_item_guid: episode.episode_id,
      publish_at: plannedPublishAt
    });

    console.log('[publish] Upload complete:', audioRemoteKey, context.options.spacesFeedKey);
  } catch (error) {
    context.db.updateStageStatus(context.episodeId, 'publish', CONFIG.STAGE_STATUS.FAILED);
    throw error;
  }
}

function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

async function fetchFeed(feedUrl: string, destinationPath: string): Promise<string | null> {
  const response = await globalThis.fetch(feedUrl);
  if (response.status === 404) {
    console.log('[publish] Remote feed not found (404). A new feed will be created.');
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    console.log(`[publish] Remote feed not accessible (${response.status}). Assuming new feed creation is required.`);
    return null;
  }

  if (!response.ok) {
    throw new Error(`[publish] Failed to download feed (${response.status} ${response.statusText}) from ${feedUrl}`);
  }

  const content = await response.text();
  writeFileSync(destinationPath, content, 'utf-8');
  console.log('[publish] Feed downloaded to:', destinationPath);
  return content;
}

function buildRssItem(
  episode: EpisodeRow,
  audioUrl: string,
  enclosureLength: string,
  durationSeconds: number | undefined,
  publishDateIso: string,
  coverArtUrl: string,
  feedAuthor: string
): {
  item: Record<string, unknown>;
  title: string;
  subtitle: string;
  summary: string;
  plainSummary: string;
  relatedLinks: Array<{ label: string; url: string }>;
  publishDateIso: string;
  articlePublishedAtHuman?: string;
} {
  const title = episode.metadata_title || `Episode ${episode.episode_id}`;
  const summary = episode.metadata_summary || '';
  const subtitle = summary.split('.').shift()?.trim() ?? title;
  const pubDate = formatRfc2822Date(publishDateIso);

  const relatedLinks = parseRelatedLinks(episode.metadata_related_links);
  const articlePublishedAtHuman = formatHumanDate(episode.metadata_published_at);
  const htmlDescription = buildHtmlDescription({
    summary,
    originalUrl: episode.original_url || episode.normalized_url,
    articlePublishedAt: articlePublishedAtHuman,
    relatedLinks,
    models: {
      metadata: episode.metadata_model ?? null,
      script: episode.script_model ?? null
    },
    voices: {
      operator: episode.audio_voice_operator || 'Operator voice not set',
      historian: episode.audio_voice_historian || 'Historian voice not set',
      narrator: episode.audio_voice_narrator || 'Narrator voice not set'
    }
  });
  const plainSummary = stripTags(htmlDescription) || summary || subtitle;

  const item: Record<string, unknown> = {
    title,
    guid: {
      '@_isPermaLink': 'false',
      '#text': episode.episode_id
    },
    link: audioUrl,
    pubDate,
    enclosure: {
      '@_url': audioUrl,
      '@_length': enclosureLength,
      '@_type': 'audio/mpeg'
    },
    'itunes:subtitle': subtitle,
    'itunes:summary': plainSummary,
    'itunes:image': {
      '@_href': coverArtUrl
    },
    description: { '#cdata': htmlDescription },
    'content:encoded': { '#cdata': htmlDescription }
  };

  if (durationSeconds !== undefined) {
    item['itunes:duration'] = formatItunesDuration(durationSeconds);
  }

  if (feedAuthor) {
    item['itunes:author'] = feedAuthor;
  }

  return {
    item,
    title,
    subtitle,
    summary,
    plainSummary,
    relatedLinks,
    publishDateIso,
    ...(articlePublishedAtHuman ? { articlePublishedAtHuman } : {})
  };
}

function parseRelatedLinks(raw?: string | null): Array<{ label: string; url: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((entry: any) => {
        if (typeof entry === 'string') {
          return { label: entry, url: entry };
        }
        if (entry && typeof entry === 'object') {
          const url = typeof entry.url === 'string'
            ? entry.url
            : typeof entry.href === 'string'
              ? entry.href
              : undefined;
          if (!url) return null;
          const label = typeof entry.title === 'string'
            ? entry.title
            : typeof entry.label === 'string'
              ? entry.label
              : url;
          return { label, url };
        }
        return null;
      })
      .filter(Boolean) as Array<{ label: string; url: string }>;
    return normalized;
  } catch (error) {
    console.warn('[publish] Unable to parse metadata_related_links JSON:', error);
    return [];
  }
}

function buildHtmlDescription(options: {
  summary: string;
  originalUrl: string;
  articlePublishedAt?: string;
  relatedLinks: Array<{ label: string; url: string }>;
  models: { metadata?: string | null; script?: string | null };
  voices: { operator: string; historian: string; narrator: string };
}): string {
  const summarySection = options.summary
    ? `<p>${escapeXml(options.summary)}</p>`
    : '<p>No summary available.</p>';

  const publishedAtLine = options.articlePublishedAt
    ? `  <p><strong>Original Publish:</strong> ${escapeXml(options.articlePublishedAt)}</p>`
    : '';

  const sourceSection = [
    '<div class="episode-source">',
    '  <h3>Source</h3>',
    `  <p><a href="${escapeXml(options.originalUrl)}" rel="noopener noreferrer">${escapeXml(options.originalUrl)}</a></p>`,
    publishedAtLine,
    '</div>'
  ].join('\n');

  const modelsSection = [
    '<div class="episode-stack">',
    '  <h3>Generation Stack</h3>',
    '  <ul>',
    `    <li><strong>Metadata Model:</strong> ${escapeXml(options.models.metadata || 'Unknown')}</li>`,
    `    <li><strong>Script Model:</strong> ${escapeXml(options.models.script || 'Unknown')}</li>`,
    `    <li><strong>Operator Voice:</strong> ${escapeXml(options.voices.operator)}</li>`,
    `    <li><strong>Historian Voice:</strong> ${escapeXml(options.voices.historian)}</li>`,
    `    <li><strong>Narrator Voice:</strong> ${escapeXml(options.voices.narrator)}</li>`,
    '  </ul>',
    '</div>'
  ].join('\n');

  const linksSection = options.relatedLinks.length
    ? [
      '<div class="episode-links">',
      '  <h3>Related Links</h3>',
      '  <ul>',
      ...options.relatedLinks.map(link => `    <li><a href="${escapeXml(link.url)}">${escapeXml(link.label)}</a></li>`),
      '  </ul>',
      '</div>'
    ].join('\n')
    : '';

  return [
    '<div class="episode-description">',
    summarySection,
    sourceSection,
    modelsSection,
    linksSection,
    '</div>'
  ].filter(Boolean).join('\n');
}

function createDefaultFeed(context: Context, publishDateIso: string, coverArtUrl: string): any {
  console.log('[publish] Initializing new RSS feed from defaults');

  const pubDate = formatRfc2822Date(publishDateIso);

  return {
    rss: {
      '@_version': '2.0',
      '@_xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
      channel: {
        title: context.options.feedTitle,
        link: context.options.feedLink,
        description: context.options.feedDescription,
        language: context.options.feedLanguage,
        pubDate,
        lastBuildDate: pubDate,
        generator: 'text-to-pod-cli',
        'itunes:author': context.options.feedAuthor,
        'itunes:subtitle': context.options.feedDescription,
        'itunes:summary': context.options.feedDescription,
        'itunes:explicit': 'no',
        'itunes:image': {
          '@_href': coverArtUrl
        },
        image: {
          url: coverArtUrl,
          title: context.options.feedTitle,
          link: context.options.feedLink
        },
        item: [] as Record<string, unknown>[]
      }
    }
  };
}

function parseFeed(feedContent: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    cdataPropName: '#cdata',
    trimValues: false,
    parseTagValue: false
  });

  const parsed = parser.parse(feedContent);
  if (!parsed?.rss?.channel) {
    throw new Error('[publish] Feed XML missing <rss><channel> root');
  }

  if (Array.isArray(parsed.rss.channel)) {
    parsed.rss.channel = parsed.rss.channel[0];
  }

  const channel = parsed.rss.channel;
  if (!channel.item) {
    channel.item = [] as Record<string, unknown>[];
  } else if (!Array.isArray(channel.item)) {
    channel.item = [channel.item as Record<string, unknown>];
  }

  return parsed;
}

function ensureFeedBranding(feedObject: any, context: Context, publishDateIso: string, coverArtUrl: string): void {
  const rss = feedObject.rss || (feedObject.rss = {});
  rss['@_version'] = rss['@_version'] || '2.0';
  rss['@_xmlns:itunes'] = rss['@_xmlns:itunes'] || 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  rss['@_xmlns:content'] = rss['@_xmlns:content'] || 'http://purl.org/rss/1.0/modules/content/';

  const channel = rss.channel || (rss.channel = {});

  channel.title = channel.title || context.options.feedTitle;
  channel.link = channel.link || context.options.feedLink;
  channel.description = channel.description || context.options.feedDescription;
  channel.language = channel.language || context.options.feedLanguage;
  channel['itunes:author'] = channel['itunes:author'] || context.options.feedAuthor;
  channel['itunes:subtitle'] = channel['itunes:subtitle'] || context.options.feedDescription;
  channel['itunes:summary'] = channel['itunes:summary'] || context.options.feedDescription;
  channel['itunes:explicit'] = channel['itunes:explicit'] || 'no';
  channel.generator = channel.generator || 'text-to-pod-cli';
  channel.lastBuildDate = formatRfc2822Date(publishDateIso);
  channel.pubDate = channel.pubDate || formatRfc2822Date(publishDateIso);

  channel['itunes:image'] = { '@_href': coverArtUrl };
  const existingImage = (channel.image && typeof channel.image === 'object') ? channel.image : {};
  channel.image = {
    ...existingImage,
    url: coverArtUrl,
    title: existingImage.title || context.options.feedTitle,
    link: existingImage.link || context.options.feedLink
  };

  if (!channel.item) {
    channel.item = [] as Record<string, unknown>[];
  } else if (!Array.isArray(channel.item)) {
    channel.item = [channel.item as Record<string, unknown>];
  }
}

function enforceNoDuplicateEpisode(feedObject: any, episode: EpisodeRow): void {
  const channel = feedObject?.rss?.channel;
  if (!channel?.item) return;

  const items: Record<string, unknown>[] = Array.isArray(channel.item)
    ? channel.item as Record<string, unknown>[]
    : [channel.item as Record<string, unknown>];
  const alreadyExists = items.some((item: Record<string, unknown>) => extractGuidValue(item) === episode.episode_id);
  if (alreadyExists) {
    throw new Error(`[publish] Episode with GUID ${episode.episode_id} already exists in the feed`);
  }
}

function removeExistingItem(feedObject: any, episode: EpisodeRow): boolean {
  const channel = feedObject?.rss?.channel;
  if (!channel?.item) return false;

  const items: Record<string, unknown>[] = Array.isArray(channel.item)
    ? channel.item as Record<string, unknown>[]
    : [channel.item as Record<string, unknown>];
  const filtered = items.filter((item: Record<string, unknown>) => extractGuidValue(item) !== episode.episode_id);

  const removed = filtered.length !== items.length;
  channel.item = filtered;
  return removed;
}

function insertItemIntoFeed(feedObject: any, rssItem: Record<string, unknown>): void {
  const channel = feedObject?.rss?.channel;
  if (!channel) {
    throw new Error('[publish] Feed object missing channel');
  }

  if (!channel.item) {
    channel.item = [] as Record<string, unknown>[];
  }

  if (!Array.isArray(channel.item)) {
    channel.item = [channel.item as Record<string, unknown>];
  }

  (channel.item as Record<string, unknown>[]).push(rssItem);
}

function buildFeedXml(feedObject: any): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '#cdata',
    format: true,
    suppressEmptyNode: true
  });

  const xml = builder.build(feedObject);
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

function extractGuidValue(item: Record<string, unknown>): string | undefined {
  if (!item) return undefined;

  const guid = item.guid as unknown;
  if (typeof guid === 'string') {
    return guid.trim();
  }
  if (guid && typeof guid === 'object') {
    const guidObj = guid as Record<string, unknown>;
    const textValue = guidObj['#text'];
    if (typeof textValue === 'string') {
      return textValue.trim();
    }
    const attrValue = guidObj['@_value'];
    if (typeof attrValue === 'string') {
      return attrValue.trim();
    }
  }

  return undefined;
}

function logRssItemSummary(
  episode: EpisodeRow,
  audioUrl: string,
  enclosureLength: string,
  coverArtUrl: string,
  details: {
    title: string;
    subtitle: string;
    plainSummary: string;
    relatedLinks: Array<{ label: string; url: string }>;
    publishDateIso: string;
    articlePublishedAtHuman?: string;
  },
  feedAuthor?: string
): void {
  console.log('[publish] RSS item summary:');
  console.log(`  • Title: ${details.title}`);
  console.log(`  • GUID: ${episode.episode_id}`);
  console.log(`  • Audio: ${audioUrl} (${Number(enclosureLength).toLocaleString()} bytes)`);
  console.log(`  • Cover Art: ${coverArtUrl}`);
  console.log(`  • Subtitle: ${details.subtitle}`);
  console.log(`  • Publish Date: ${formatHumanDate(details.publishDateIso) || details.publishDateIso}`);
  if (feedAuthor) {
    console.log(`  • Author: ${feedAuthor}`);
  }
  if (details.articlePublishedAtHuman) {
    console.log(`  • Original Content Date: ${details.articlePublishedAtHuman}`);
  }
  if (details.plainSummary) {
    console.log(`  • Summary: ${truncate(details.plainSummary, 240)}`);
  }
  if (details.relatedLinks.length) {
    const previewLinks = details.relatedLinks.slice(0, 3);
    console.log('  • Related Links:');
    previewLinks.forEach(link => {
      console.log(`     - ${link.label}: ${link.url}`);
    });
    if (details.relatedLinks.length > previewLinks.length) {
      console.log(`     - (+${details.relatedLinks.length - previewLinks.length} more)`);
    }
  }
}

function buildRemoteUrl(origin: string, key: string): string {
  const normalizedOrigin = origin.endsWith('/') ? origin : `${origin}/`;
  const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
  return new URL(normalizedKey, normalizedOrigin).toString();
}

function buildAudioKey(prefix: string, episodeId: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, '');
  return `${normalizedPrefix}/${episodeId}.mp3`;
}

function buildS3Uri(origin: string, key: string): string {
  const normalizedKey = key.replace(/^\/+/, '');
  const host = new URL(origin).host;
  const bucket = host.split('.')[0];
  if (!bucket) {
    throw new Error(`[publish] Unable to derive bucket name from origin: ${origin}`);
  }
  return `s3://${bucket}/${normalizedKey}`;
}

function formatHumanDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  try {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatRfc2822Date(value?: string): string {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toUTCString();
  }
  return parsed.toUTCString();
}

function formatItunesDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTags(value: string): string {
  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  return decodeXmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

async function uploadAssetWithS3cmd(
  localPath: string,
  remoteKey: string,
  context: Context,
  extraArgs: string[] = []
): Promise<void> {
  const s3Uri = buildS3Uri(context.options.spacesOrigin, remoteKey);
  console.log(`[publish] Uploading ${localPath} -> ${s3Uri}`);

  const args: string[] = [];
  const s3cfgPath = resolveS3cfgPath(context.options.s3cfg);
  if (s3cfgPath) {
    if (!existsSync(s3cfgPath)) {
      throw new Error(`[publish] s3cmd config file not found at ${s3cfgPath}. Provide a valid path via --s3cfg.`);
    }
    args.push('--config', s3cfgPath);
  }

  args.push('put', ...extraArgs, localPath, s3Uri);
  await runS3cmd(args);
}

function runS3cmd(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('s3cmd', args, { stdio: 'inherit' });

    child.on('error', (error) => {
      rejectPromise(new Error(`[publish] Failed to spawn s3cmd: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`[publish] s3cmd exited with code ${code}`));
      }
    });
  });
}

function resolveS3cfgPath(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('~')) {
    return value.replace(/^~/, homedir());
  }
  return value;
}
