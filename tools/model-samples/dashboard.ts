#!/usr/bin/env bun

import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { dirname, extname, join, normalize, relative } from 'path';
import type { ModelProvider } from '../../src/types.js';

const DEFAULT_SAMPLES_DIR = 'test/model-samples';
const DEFAULT_DB_PATH = 'data/episodes.db';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4765;

interface Options {
  samplesDir: string;
  dbPath: string;
  host: string;
  port: number;
  portProvided: boolean;
}

interface ManifestEntry {
  kind: 'text' | 'audio';
  provider: ModelProvider;
  model: string;
  voice?: string;
  stagePools?: string[];
  file?: string;
  files?: string[];
  audioSegments?: string[];
  status: 'generated' | 'skipped' | 'failed';
  wordCount?: number;
  error?: string;
}

interface CostEstimatePayload {
  standard_episode_profile?: Record<string, unknown>;
  default_audio_baseline?: Record<string, unknown>;
  text?: Array<Record<string, unknown>>;
  audio?: Array<Record<string, unknown>>;
}

interface EvaluationRow {
  sample_key: string;
  pass_fail: 'pass' | 'fail';
  preference_rank?: number;
  updated_at: string;
}

interface PassFailPayload {
  sampleKey?: string;
  kind?: 'text' | 'audio';
  provider?: ModelProvider;
  model?: string;
  voice?: string;
  sampleFile?: string;
  passFail?: 'pass' | 'fail';
  costEstimateUsd?: number;
}

interface RankPayload {
  kind?: 'text' | 'audio';
  sampleKeys?: string[];
  samples?: Array<{
    sampleKey?: string;
    kind?: 'text' | 'audio';
    provider?: ModelProvider;
    model?: string;
    voice?: string;
    sampleFile?: string;
    costEstimateUsd?: number;
  }>;
}

const options = parseArgs(process.argv.slice(2));
const db = openDatabase(options.dbPath);
initEvaluationsTable();

const server = startServer(options);

console.log(`[samples:dashboard] Serving ${options.samplesDir}`);
console.log(`[samples:dashboard] Evaluations database: ${options.dbPath}`);
console.log(`[samples:dashboard] Open http://${server.hostname}:${server.port}`);

function parseArgs(argv: string[]): Options {
  const parsed: Options = {
    samplesDir: DEFAULT_SAMPLES_DIR,
    dbPath: DEFAULT_DB_PATH,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    portProvided: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    switch (arg) {
      case '--samples-dir':
        parsed.samplesDir = requireValue(arg, value);
        i++;
        break;
      case '--db':
        parsed.dbPath = requireValue(arg, value);
        i++;
        break;
      case '--host':
        parsed.host = requireValue(arg, value);
        i++;
        break;
      case '--port':
        parsed.port = Number.parseInt(requireValue(arg, value), 10);
        if (!Number.isFinite(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
          throw new Error('--port must be a valid TCP port');
        }
        parsed.portProvided = true;
        i++;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function startServer(options: Options): ReturnType<typeof Bun.serve> {
  try {
    return createServer(options.host, options.port);
  } catch (error) {
    if (options.portProvided || !isAddressInUseError(error)) {
      throw error;
    }

    console.warn(`[samples:dashboard] Port ${options.port} is unavailable; selecting an open port.`);
    return createServer(options.host, 0);
  }
}

function createServer(host: string, port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      const url = new URL(request.url);

      try {
        if (request.method === 'GET' && url.pathname === '/') {
          return htmlResponse(renderDashboardHtml());
        }

        if (request.method === 'GET' && url.pathname === '/api/samples') {
          return jsonResponse(loadDashboardData(options.samplesDir));
        }

        if (request.method === 'POST' && url.pathname === '/api/pass-fail') {
          const payload = await request.json() as PassFailPayload;
          return jsonResponse(savePassFail(payload));
        }

        if (request.method === 'POST' && url.pathname === '/api/rate') {
          const legacyPayload = await request.json() as PassFailPayload & { rating?: 'up' | 'down' };
          return jsonResponse(savePassFail({
            ...legacyPayload,
            passFail: legacyPayload.rating === 'up' ? 'pass' : legacyPayload.rating === 'down' ? 'fail' : legacyPayload.passFail
          }));
        }

        if (request.method === 'POST' && url.pathname === '/api/rank') {
          const payload = await request.json() as RankPayload;
          return jsonResponse(saveRanking(payload));
        }

        if (request.method === 'GET' && url.pathname.startsWith('/samples/')) {
          return serveSampleFile(options.samplesDir, url.pathname.slice('/samples/'.length));
        }

        return new Response('Not found', { status: 404 });
      } catch (error) {
        return jsonResponse({ error: errorMessage(error) }, 500);
      }
    }
  });
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('EADDRINUSE') ||
    (error as Error & { code?: string }).code === 'EADDRINUSE'
  );
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: bun tools/model-samples/dashboard.ts [options]

Options:
  --samples-dir <path>  Generated samples directory (default: ${DEFAULT_SAMPLES_DIR})
  --db <path>           SQLite database for evaluations (default: ${DEFAULT_DB_PATH})
  --host <host>         Hostname (default: ${DEFAULT_HOST})
  --port <port>         Port (default: ${DEFAULT_PORT})
`);
}

function openDatabase(dbPath: string): any {
  const dir = dirname(dbPath);
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const require = createRequire(import.meta.url);
  const { Database } = require('bun:sqlite') as { Database: new (path: string) => any };
  return new Database(dbPath);
}

function initEvaluationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_sample_evaluations (
      sample_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'audio')),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      voice TEXT,
      sample_file TEXT,
      pass_fail TEXT CHECK (pass_fail IS NULL OR pass_fail IN ('pass', 'fail')),
      notes TEXT,
      preference_rank INTEGER,
      cost_estimate_usd REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  try {
    db.exec('ALTER TABLE model_sample_evaluations ADD COLUMN preference_rank INTEGER');
  } catch {
    // Column already exists.
  }
  try {
    db.exec(`
      INSERT OR IGNORE INTO model_sample_evaluations (
        sample_key,
        kind,
        provider,
        model,
        voice,
        sample_file,
        pass_fail,
        notes,
        preference_rank,
        cost_estimate_usd,
        created_at,
        updated_at
      )
      SELECT
        sample_key,
        kind,
        provider,
        model,
        voice,
        sample_file,
        CASE rating WHEN 'up' THEN 'pass' WHEN 'down' THEN 'fail' ELSE rating END,
        notes,
        preference_rank,
        cost_estimate_usd,
        created_at,
        updated_at
      FROM model_sample_ratings
    `);
  } catch {
    // Legacy table may not exist.
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_model_sample_evaluations_kind_pass_fail ON model_sample_evaluations (kind, pass_fail)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_model_sample_evaluations_preference_rank ON model_sample_evaluations (kind, preference_rank)');
}

function loadDashboardData(samplesDir: string): Record<string, unknown> {
  const manifest = readJson(join(samplesDir, 'manifest.json'), { entries: [] }) as { entries?: ManifestEntry[] };
  const costs = readJson(join(samplesDir, 'cost-estimates.json'), {}) as CostEstimatePayload;
  const entries = manifest.entries ?? [];
  const evaluations = loadEvaluations();

  const samples = entries.map(entry => {
    const sampleKey = buildSampleKey(entry.kind, entry.provider, entry.model, entry.voice);
    const cost = findCost(costs, entry);
    return {
      ...entry,
      sampleKey,
      sampleUrl: entry.file ? `/samples/${encodeSamplePath(entry.file)}` : undefined,
      sampleUrls: (entry.files ?? (entry.file ? [entry.file] : []))
        .map(file => `/samples/${encodeSamplePath(file)}`),
      textPreview: entry.kind === 'text' && entry.file ? readTextPreview(join(samplesDir, entry.file)) : undefined,
      cost,
      passFail: evaluations.get(sampleKey)?.pass_fail,
      preferenceRank: evaluations.get(sampleKey)?.preference_rank,
      evaluationUpdatedAt: evaluations.get(sampleKey)?.updated_at
    };
  });

  return {
    samples,
    standardEpisodeProfile: costs.standard_episode_profile,
    defaultAudioBaseline: costs.default_audio_baseline
  };
}

function readJson(path: string, fallback: unknown): unknown {
  if (!existsSync(path)) {
    return fallback;
  }

  return JSON.parse(readFileSync(path, 'utf-8'));
}

function loadEvaluations(): Map<string, EvaluationRow> {
  const rows = db.prepare(`
    SELECT sample_key, pass_fail, preference_rank, updated_at
    FROM model_sample_evaluations
  `).all() as EvaluationRow[];

  return new Map(rows.map(row => [row.sample_key, row]));
}

function savePassFail(payload: PassFailPayload): Record<string, unknown> {
  if (!payload.kind || !payload.provider || !payload.model || !payload.passFail) {
    throw new Error('kind, provider, model, and passFail are required');
  }

  if (payload.kind !== 'text' && payload.kind !== 'audio') {
    throw new Error('kind must be text or audio');
  }

  if (payload.provider !== 'openrouter' && payload.provider !== 'openai') {
    throw new Error('provider must be openrouter or openai');
  }

  if (payload.passFail !== 'pass' && payload.passFail !== 'fail') {
    throw new Error('passFail must be pass or fail');
  }

  const sampleKey = payload.sampleKey || buildSampleKey(payload.kind, payload.provider, payload.model, payload.voice);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO model_sample_evaluations (
      sample_key,
      kind,
      provider,
      model,
      voice,
      sample_file,
      pass_fail,
      cost_estimate_usd,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sample_key) DO UPDATE SET
      pass_fail = excluded.pass_fail,
      sample_file = excluded.sample_file,
      cost_estimate_usd = excluded.cost_estimate_usd,
      updated_at = excluded.updated_at
  `).run(
    sampleKey,
    payload.kind,
    payload.provider,
    payload.model,
    payload.voice ?? null,
    payload.sampleFile ?? null,
    payload.passFail,
    payload.costEstimateUsd ?? null,
    now,
    now
  );

  return { ok: true, sampleKey, passFail: payload.passFail, updatedAt: now };
}

function saveRanking(payload: RankPayload): Record<string, unknown> {
  if (payload.kind !== 'text' && payload.kind !== 'audio') {
    throw new Error('kind must be text or audio');
  }

  if (!Array.isArray(payload.sampleKeys)) {
    throw new Error('sampleKeys array is required');
  }

  const sampleKeys = payload.sampleKeys.filter((key): key is string => typeof key === 'string' && key.trim() !== '');
  const sampleDetails = new Map(
    (payload.samples ?? [])
      .filter(sample => typeof sample.sampleKey === 'string' && sample.kind === payload.kind && typeof sample.provider === 'string' && typeof sample.model === 'string')
      .map(sample => [sample.sampleKey!, sample])
  );
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO model_sample_evaluations (
      sample_key,
      kind,
      provider,
      model,
      voice,
      sample_file,
      pass_fail,
      cost_estimate_usd,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(sample_key) DO UPDATE SET
      sample_file = COALESCE(excluded.sample_file, model_sample_evaluations.sample_file),
      cost_estimate_usd = COALESCE(excluded.cost_estimate_usd, model_sample_evaluations.cost_estimate_usd),
      updated_at = excluded.updated_at
  `);
  const clear = db.prepare(`
    UPDATE model_sample_evaluations
    SET preference_rank = NULL, updated_at = ?
    WHERE kind = ?
  `);
  const update = db.prepare(`
    UPDATE model_sample_evaluations
    SET preference_rank = ?, updated_at = ?
    WHERE sample_key = ? AND kind = ?
  `);
  const transaction = db.transaction(() => {
    clear.run(now, payload.kind);
    sampleKeys.forEach((sampleKey, index) => {
      const detail = sampleDetails.get(sampleKey);
      if (detail) {
        upsert.run(
          sampleKey,
          payload.kind,
          detail.provider,
          detail.model,
          detail.voice ?? null,
          detail.sampleFile ?? null,
          detail.costEstimateUsd ?? null,
          now,
          now
        );
      }
      update.run(index + 1, now, sampleKey, payload.kind);
    });
  });

  transaction();
  return { ok: true, kind: payload.kind, ranked: sampleKeys.length, updatedAt: now };
}

function findCost(costs: CostEstimatePayload, entry: ManifestEntry): Record<string, unknown> | undefined {
  const collection = entry.kind === 'text' ? costs.text : costs.audio;
  if (!collection) {
    return undefined;
  }

  return collection.find(item =>
    item.provider === entry.provider &&
    item.model === entry.model &&
    (entry.kind === 'text' || item.voice === entry.voice)
  );
}

function buildSampleKey(kind: string, provider: string, model: string, voice?: string): string {
  return [kind, provider, model, voice ?? ''].join(':');
}

function readTextPreview(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  const raw = readFileSync(path, 'utf-8');
  return raw.length > 3000 ? `${raw.slice(0, 3000)}\n\n...` : raw;
}

function encodeSamplePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function serveSampleFile(samplesDir: string, encodedPath: string): Response {
  const decoded = decodeURIComponent(encodedPath);
  const root = normalize(samplesDir);
  const filePath = normalize(join(root, decoded));
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith('..') || relativePath === '' || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Type': mimeType(filePath),
      'Cache-Control': 'no-store'
    }
  });
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Model Samples</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #171717;
      --panel: #242327;
      --panel-strong: #2d2c32;
      --ink: #f4f4f5;
      --muted: #a1a1aa;
      --line: #34333a;
      --accent: #ff6b00;
      --accent-soft: rgba(255, 107, 0, 0.14);
      --good: #5cc489;
      --bad: #ff6b6b;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 20% 0%, rgba(255, 107, 0, 0.18), transparent 28rem),
        radial-gradient(circle at 80% 15%, rgba(80, 80, 90, 0.24), transparent 26rem),
        var(--bg);
      color: var(--ink);
    }

    header {
      border-bottom: 1px solid var(--line);
      background: rgba(23, 23, 23, 0.88);
      backdrop-filter: blur(14px);
      padding: 18px 24px 14px;
      position: sticky;
      top: 0;
      z-index: 2;
    }

    h1 {
      font-size: 22px;
      line-height: 1.2;
      margin: 0 0 10px;
      font-weight: 650;
    }

    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
      align-items: center;
    }

    input, select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      min-height: 36px;
      background: var(--panel);
    }

    input { min-width: min(360px, 100%); flex: 1; }
    main { padding: 18px 24px 40px; }

    .section-title {
      font-size: 15px;
      font-weight: 650;
      margin: 22px 0 10px;
      color: var(--ink);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 12px;
      align-items: start;
    }

    .rank-num {
      font-weight: 700;
      color: var(--accent);
      font-size: 13px;
      margin-bottom: 4px;
    }

    .rank-actions {
      display: flex;
      gap: 6px;
      white-space: nowrap;
    }

    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 7px;
      margin-left: 6px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid var(--line);
      color: var(--muted);
    }

    .badge.up {
      border-color: var(--good);
      color: var(--good);
    }

    .badge.down {
      border-color: var(--bad);
      color: var(--bad);
    }

    article {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 14px;
      min-width: 0;
    }

    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .model {
      font-weight: 650;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .meta, .costs, .status {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-top: 4px;
    }

    .costs {
      margin-top: 10px;
      color: #d4d4d8;
    }

    .sample-text {
      margin-top: 12px;
      padding: 10px;
      background: #1b1b1f;
      border: 1px solid var(--line);
      border-radius: 6px;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.45;
      max-height: 260px;
      overflow: auto;
    }

    audio {
      width: 100%;
      margin-top: 12px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    button {
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--ink);
      border-radius: 6px;
      padding: 7px 10px;
      min-width: 44px;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
    }

    button[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }

    button.up.active {
      border-color: var(--good);
      color: #07140d;
      background: var(--good);
    }

    button.down.active {
      border-color: var(--bad);
      color: #210707;
      background: var(--bad);
    }

    .play-stitch {
      background: var(--accent);
      border-color: var(--accent);
      color: #1b1006;
      margin-top: 12px;
    }

    .empty {
      color: var(--muted);
      padding: 20px 0;
    }

    @media (max-width: 720px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      .grid { grid-template-columns: 1fr; }
      .toolbar { align-items: stretch; }
      select, input { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Model Samples</h1>
    <div class="summary" id="summary">Loading samples...</div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Filter models, voices, providers">
      <select id="kind">
        <option value="all">All samples</option>
        <option value="text">Text models</option>
        <option value="audio">Voice samples</option>
      </select>
      <select id="vote">
        <option value="all">All grades</option>
        <option value="pass">Passed</option>
        <option value="fail">Failed</option>
        <option value="unrated">Unrated</option>
      </select>
    </div>
  </header>
  <main id="app"></main>
  <script>
    let state = { samples: [], standardEpisodeProfile: null, defaultAudioBaseline: null };
    const app = document.getElementById('app');
    const summary = document.getElementById('summary');
    const search = document.getElementById('search');
    const kind = document.getElementById('kind');
    const vote = document.getElementById('vote');

    search.addEventListener('input', render);
    kind.addEventListener('change', render);
    vote.addEventListener('change', render);

    load();

    async function load() {
      const response = await fetch('/api/samples');
      state = await response.json();
      render();
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      const kindFilter = kind.value;
      const voteFilter = vote.value;
      const samples = (state.samples || []).filter(sample => {
        const haystack = [sample.kind, sample.provider, sample.model, sample.voice, sample.status, sample.file].filter(Boolean).join(' ').toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (kindFilter !== 'all' && sample.kind !== kindFilter) return false;
        if (voteFilter === 'pass' && sample.passFail !== 'pass') return false;
        if (voteFilter === 'fail' && sample.passFail !== 'fail') return false;
        if (voteFilter === 'unrated' && sample.passFail) return false;
        return true;
      });

      const textSamples = samples.filter(sample => sample.kind === 'text');
      const audioSamples = samples.filter(sample => sample.kind === 'audio');
      const total = state.samples?.length || 0;
      const pass = (state.samples || []).filter(sample => sample.passFail === 'pass').length;
      const fail = (state.samples || []).filter(sample => sample.passFail === 'fail').length;
      const profile = state.standardEpisodeProfile || {};
      summary.textContent = total + ' samples | ' + pass + ' pass | ' + fail + ' fail | standard episode: ' +
        formatNumber(profile.scriptInputTokens || profile.script_input_tokens) + ' input tokens, ' +
        formatNumber(profile.scriptOutputTokens || profile.script_output_tokens) + ' output tokens, ' +
        formatNumber(profile.audioInputChars || profile.audio_input_chars) + ' audio chars';

      app.innerHTML = '';
      appendSection('Text Models', sortedSamplesForDisplay(textSamples, 'text'));
      appendSection('Voice Samples', sortedSamplesForDisplay(audioSamples, 'audio'));
    }

    function appendSection(title, samples) {
      const heading = document.createElement('div');
      heading.className = 'section-title';
      heading.textContent = title + ' (' + samples.length + ')';
      app.appendChild(heading);

      if (samples.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No samples match the current filters.';
        app.appendChild(empty);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const sample of samples) {
        grid.appendChild(renderCard(sample));
      }
      app.appendChild(grid);
    }

    function renderCard(sample) {
      const card = document.createElement('article');
      const cost = sample.cost || {};
      const canRate = sample.status === 'generated';
      const canRank = sample.status === 'generated';
      const ranked = canRank ? sortedRankableSamples(sample.kind) : [];
      const rankIndex = canRank ? ranked.findIndex(item => item.sampleKey === sample.sampleKey) : -1;
      const rankMarkup = canRank
        ? '<div class="rank-num">Rank ' + (rankIndex + 1) + renderRatingBadge(sample) + '</div>'
        : '';
      const rankActions = canRank
        ? '<div class="rank-actions">' +
            '<button class="rank-up" ' + (rankIndex <= 0 ? 'disabled' : '') + '>Move up</button>' +
          '<button class="rank-down" ' + (rankIndex === ranked.length - 1 ? 'disabled' : '') + '>Move down</button>' +
          '</div>'
        : '';
      card.innerHTML =
        rankMarkup +
        '<div class="card-head">' +
          '<div>' +
            '<div class="model">' + escapeHtml(sample.model) + '</div>' +
            '<div class="meta">' + escapeHtml(sample.provider) + (sample.voice ? ' / ' + escapeHtml(sample.voice) : '') + '</div>' +
            '<div class="meta">' + escapeHtml((sample.stagePools || []).join(', ')) + '</div>' +
          '</div>' +
          '<div class="status">' + escapeHtml(sample.status) + '</div>' +
        '</div>' +
        '<div class="costs">' + renderCost(sample.kind, cost) + '</div>' +
        renderMedia(sample) +
        '<div class="actions">' +
          '<button class="up ' + (sample.passFail === 'pass' ? 'active' : '') + '" ' + (canRate ? '' : 'disabled') + '>Pass</button>' +
          '<button class="down ' + (sample.passFail === 'fail' ? 'active' : '') + '" ' + (canRate ? '' : 'disabled') + '>Fail</button>' +
        '</div>' +
        rankActions;

      card.querySelector('.up').addEventListener('click', () => savePassFail(sample, 'pass'));
      card.querySelector('.down').addEventListener('click', () => savePassFail(sample, 'fail'));
      const rankUp = card.querySelector('.rank-up');
      const rankDown = card.querySelector('.rank-down');
      if (rankUp) rankUp.addEventListener('click', () => moveRankBySampleKey(sample.sampleKey, -1));
      if (rankDown) rankDown.addEventListener('click', () => moveRankBySampleKey(sample.sampleKey, 1));
      const stitchedButton = card.querySelector('.play-stitch');
      if (stitchedButton) {
        stitchedButton.addEventListener('click', () => playStitched(sample, stitchedButton));
      }
      return card;
    }

    function renderMedia(sample) {
      if (sample.kind === 'audio') {
        const urls = sample.sampleUrls && sample.sampleUrls.length ? sample.sampleUrls : (sample.sampleUrl ? [sample.sampleUrl] : []);
        if (!urls.length) {
          return '<div class="sample-text">' + escapeHtml(sample.error || 'No generated file yet.') + '</div>';
        }
        const stitched = urls.length > 1
          ? '<button class="play-stitch" type="button">Play stitched preview</button><div class="meta">Two TTS requests, played back-to-back in the browser.</div>'
          : '';
        return stitched + urls.map((url, index) =>
          '<div class="meta">Part ' + (index + 1) + '</div><audio controls preload="none" src="' + escapeHtml(url) + '"></audio>'
        ).join('');
      }
      if (sample.kind === 'text') {
        return '<div class="sample-text">' + escapeHtml(sample.textPreview || sample.error || 'No sample text yet.') + '</div>';
      }
      return '<div class="sample-text">' + escapeHtml(sample.error || 'No generated file yet.') + '</div>';
    }

    function renderCost(kind, cost) {
      if (kind === 'text') {
        return 'script: ' + money(cost.baseScriptCostUsd) +
          ' | script + default audio: ' + money(cost.scriptPlusDefaultAudioCostUsd) +
          ' | rates: ' + money(cost.inputPerMillionUsd) + '/1M in, ' + money(cost.outputPerMillionUsd) + '/1M out';
      }
      return 'audio: ' + money(cost.audioCostUsd) +
        ' | rate: ' + money(cost.inputPerThousandCharsUsd) + '/1k chars';
    }

    async function savePassFail(sample, passFail) {
      const cost = sample.cost || {};
      const costEstimateUsd = sample.kind === 'text' ? cost.scriptPlusDefaultAudioCostUsd : cost.audioCostUsd;
      const response = await fetch('/api/pass-fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleKey: sample.sampleKey,
          kind: sample.kind,
          provider: sample.provider,
          model: sample.model,
          voice: sample.voice,
          sampleFile: sample.file,
          passFail,
          costEstimateUsd
        })
      });
      if (!response.ok) {
        alert('Pass/fail save failed: ' + await response.text());
        return;
      }
      sample.passFail = passFail;
      render();
    }

    function sortedRankableSamples(kind) {
      return (state.samples || [])
        .filter(sample => sample.kind === kind && sample.status === 'generated')
        .sort((a, b) => {
          const aRank = typeof a.preferenceRank === 'number' ? a.preferenceRank : Number.MAX_SAFE_INTEGER;
          const bRank = typeof b.preferenceRank === 'number' ? b.preferenceRank : Number.MAX_SAFE_INTEGER;
          if (aRank !== bRank) return aRank - bRank;
          return String(a.provider + a.model + a.voice).localeCompare(String(b.provider + b.model + b.voice));
        });
    }

    function sortedSamplesForDisplay(samples, kind) {
      const orderedKeys = new Map(sortedRankableSamples(kind).map((sample, index) => [sample.sampleKey, index]));
      return [...samples].sort((a, b) => {
        const aOrder = orderedKeys.has(a.sampleKey) ? orderedKeys.get(a.sampleKey) : Number.MAX_SAFE_INTEGER;
        const bOrder = orderedKeys.has(b.sampleKey) ? orderedKeys.get(b.sampleKey) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.provider + a.model + a.voice).localeCompare(String(b.provider + b.model + b.voice));
      });
    }

    async function moveRankBySampleKey(sampleKey, delta) {
      const sample = (state.samples || []).find(item => item.sampleKey === sampleKey);
      if (!sample) return;
      const ranked = sortedRankableSamples(sample.kind);
      const index = ranked.findIndex(sample => sample.sampleKey === sampleKey);
      if (index === -1) return;
      const target = index + delta;
      if (target < 0 || target >= ranked.length) return;

      const moved = ranked.splice(index, 1)[0];
      ranked.splice(target, 0, moved);
      await saveRankOrder(sample.kind, ranked);
    }

    async function saveRankOrder(kind, ranked) {
      ranked.forEach((sample, index) => {
        sample.preferenceRank = index + 1;
      });

      const response = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          sampleKeys: ranked.map(sample => sample.sampleKey),
          samples: ranked.map(sample => ({
            sampleKey: sample.sampleKey,
            kind: sample.kind,
            provider: sample.provider,
            model: sample.model,
            voice: sample.voice,
            sampleFile: sample.file,
            costEstimateUsd: sample.kind === 'text'
              ? sample.cost?.scriptPlusDefaultAudioCostUsd
              : sample.cost?.audioCostUsd
          }))
        })
      });
      if (!response.ok) {
        alert('Ranking save failed: ' + await response.text());
        return;
      }
      render();
    }

    function renderRatingBadge(sample) {
      if (sample.passFail === 'pass') return '<span class="badge up">pass</span>';
      if (sample.passFail === 'fail') return '<span class="badge down">fail</span>';
      return '<span class="badge">unrated</span>';
    }

    function playStitched(sample, button) {
      const urls = sample.sampleUrls || [];
      if (!urls.length) return;

      button.disabled = true;
      button.textContent = 'Playing...';
      let index = 0;
      const player = new Audio();

      player.addEventListener('ended', () => {
        index += 1;
        if (index >= urls.length) {
          button.disabled = false;
          button.textContent = 'Play stitched preview';
          return;
        }
        player.src = urls[index];
        player.play();
      });

      player.addEventListener('error', () => {
        button.disabled = false;
        button.textContent = 'Play stitched preview';
        alert('Audio playback failed.');
      });

      player.src = urls[index];
      player.play();
    }

    function money(value) {
      return typeof value === 'number' ? '$' + value.toFixed(4) : 'unknown';
    }

    function formatNumber(value) {
      return typeof value === 'number' ? value.toLocaleString() : 'unknown';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }
  </script>
</body>
</html>`;
}
