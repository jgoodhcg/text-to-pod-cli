import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EpisodeRepository } from '../src/database.ts';
import {
  compileDialogue,
  parseAuthoringJsonl,
  validateSourceCoverage
} from '../src/script-artifacts.ts';
import { chunkDialogueByCharacters, generateUrlHash, normalizeUrl } from '../src/utils.ts';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('digest script artifacts', () => {
  test('parses JSONL metadata and compiles the TTS dialogue contract', () => {
    const segments = parseAuthoringJsonl([
      JSON.stringify({
        segment_id: 'opening',
        chapter: 'Orientation',
        persona: 'NARRATOR',
        text: 'A quiet opening.',
        source_ids: []
      }),
      JSON.stringify({
        segment_id: 'item-one',
        chapter: 'Workbench',
        persona: 'OPERATOR',
        text: 'A concrete source description.',
        source_ids: ['one']
      })
    ].join('\n'));

    validateSourceCoverage(segments, ['one']);
    expect(compileDialogue(segments)).toEqual([
      { persona: 'NARRATOR', text: 'A quiet opening.' },
      { persona: 'OPERATOR', text: 'A concrete source description.' }
    ]);
  });

  test('rejects missing source coverage and unknown personas', () => {
    const valid = parseAuthoringJsonl(JSON.stringify({
      segment_id: 'one',
      chapter: 'Chapter',
      persona: 'HISTORIAN',
      text: 'Context.',
      source_ids: ['one']
    }));
    expect(() => validateSourceCoverage(valid, ['one', 'two'])).toThrow('two');
    expect(() => parseAuthoringJsonl(JSON.stringify({
      segment_id: 'bad',
      chapter: 'Chapter',
      persona: 'HOST',
      text: 'No.',
      source_ids: []
    }))).toThrow('Unknown persona');
  });

  test('keeps sentence and persona boundaries in separate audio chunks', () => {
    const chunks = chunkDialogueByCharacters([
      { persona: 'OPERATOR', text: 'First sentence ends here. Second sentence ends here.' },
      { persona: 'HISTORIAN', text: 'A different voice begins here.' }
    ], 35);

    expect(chunks).toEqual([
      [{ persona: 'OPERATOR', text: 'First sentence ends here.' }],
      [{ persona: 'OPERATOR', text: 'Second sentence ends here.' }],
      [{ persona: 'HISTORIAN', text: 'A different voice begins here.' }]
    ]);
  });
});

describe('episode source membership', () => {
  test('deduplicates digest members through the same URL lookup as single episodes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'text-to-pod-digest-test-'));
    tempDirs.push(directory);
    const repo = new EpisodeRepository(join(directory, 'episodes.db'));
    const digestUrl = 'digest://test-episode';
    const sourceUrl = 'https://news.ycombinator.com/item?id=123';

    repo.insertDigestEpisode({
      episode: {
        episode_id: 'digest-1',
        episode_kind: 'digest',
        original_url: digestUrl,
        normalized_url: normalizeUrl(digestUrl),
        url_hash: generateUrlHash(digestUrl),
        metadata_status: 'completed',
        metadata_title: 'Test digest',
        metadata_summary: 'Summary',
        script_status: 'completed',
        script_file_path: 'script.json',
        script_segment_count: 1,
        audio_status: 'pending',
        merge_status: 'pending',
        publish_status: 'pending'
      },
      sources: [{
        originalUrl: sourceUrl,
        normalizedUrl: normalizeUrl(sourceUrl),
        urlHash: generateUrlHash(sourceUrl),
        position: 0,
        title: 'Source'
      }]
    });

    expect(repo.findByUrlHash(generateUrlHash(sourceUrl))?.episode_id).toBe('digest-1');
    expect(repo.listEpisodeSources('digest-1')).toHaveLength(1);
    repo.close();
  });

  test('rolls back a digest import when a source is already covered', () => {
    const directory = mkdtempSync(join(tmpdir(), 'text-to-pod-digest-test-'));
    tempDirs.push(directory);
    const repo = new EpisodeRepository(join(directory, 'episodes.db'));
    const sourceUrl = 'https://example.com/already-covered';
    const sourceHash = generateUrlHash(sourceUrl);

    repo.insertEpisode({
      episode_id: 'single-1',
      episode_kind: 'single',
      original_url: sourceUrl,
      normalized_url: normalizeUrl(sourceUrl),
      url_hash: sourceHash,
      metadata_status: 'pending',
      script_status: 'pending',
      audio_status: 'pending',
      merge_status: 'pending',
      publish_status: 'pending'
    });

    expect(() => repo.insertDigestEpisode({
      episode: {
        episode_id: 'digest-conflict',
        episode_kind: 'digest',
        original_url: 'digest://conflict',
        normalized_url: normalizeUrl('digest://conflict'),
        url_hash: generateUrlHash('digest://conflict'),
        metadata_status: 'completed',
        script_status: 'completed',
        audio_status: 'pending',
        merge_status: 'pending',
        publish_status: 'pending'
      },
      sources: [{
        originalUrl: sourceUrl,
        normalizedUrl: normalizeUrl(sourceUrl),
        urlHash: sourceHash,
        position: 0
      }]
    })).toThrow();

    expect(repo.findByEpisodeId('digest-conflict')).toBeUndefined();
    repo.close();
  });
});
