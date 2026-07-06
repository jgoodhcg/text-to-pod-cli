import { createRequire } from 'module';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { Database } = require('bun:sqlite') as {
  Database: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): any;
    close(): void;
  };
};

export interface EpisodeRow {
  episode_id: string;
  original_url?: string;
  normalized_url: string;
  url_hash: string;
  created_at: string;
  updated_at: string;
  
  metadata_status: string;
  metadata_model?: string;
  metadata_prompt_version?: string;
  metadata_title?: string;
  metadata_summary?: string;
  metadata_published_at?: string;
  metadata_related_links?: string; // JSON array of related links
  metadata_input_tokens?: number;
  metadata_output_tokens?: number;
  metadata_estimated_cost_usd?: number;
  
  script_status: string;
  script_model?: string;
  script_file_path?: string;
  script_segment_count?: number;
  script_input_tokens?: number;
  script_output_tokens?: number;
  
  // Multi-stage script generation
  script_outline_model?: string;
  script_outline_tokens?: number;
  script_outline_content?: string;
  script_content_model?: string;
  script_content_tokens?: number;
  script_content_draft?: string;
  script_refinement_model?: string;
  script_refinement_tokens?: number;
  script_description_notes?: string;
  script_description_model?: string;
  script_description_tokens?: number;
  script_estimated_cost_usd?: number;
  
  audio_status: string;
  audio_chunks_dir?: string;
  audio_chunk_count?: number;
  audio_voice_operator?: string;
  audio_voice_historian?: string;
  audio_voice_narrator?: string;
  audio_voice_scholar?: string;
  audio_total_duration_sec?: number;
  audio_input_chars?: number;
  audio_estimated_cost_usd?: number;
  audio_files?: string;
  
  merge_status: string;
  merged_audio_path?: string;
  merged_audio_duration_sec?: number;
  merged_audio_checksum?: string;
  
  publish_status: string;
  publish_feed_local_path?: string;
  publish_audio_remote_path?: string;
  publish_feed_remote_path?: string;
  publish_item_guid?: string;
  publish_at?: string;

  estimated_total_cost_usd?: number;
  cost_pricing_snapshot?: string;
}

export interface EpisodeFailureRow {
  id: number;
  episode_id?: string;
  url_hash?: string;
  original_url?: string;
  stage: string;
  stage_order: number;
  retry_scope?: string;
  attempt_number?: number;
  max_attempts?: number;
  will_retry: number;
  model?: string;
  error_name?: string;
  error_message: string;
  error_stack?: string;
  context_json?: string;
  created_at: string;
}

export interface ModelSampleEvaluationRow {
  sample_key: string;
  kind: 'text' | 'audio';
  provider: string;
  model: string;
  voice?: string;
  pass_fail?: 'pass' | 'fail';
  preference_rank?: number;
}

export interface RecordEpisodeFailureInput {
  episodeId?: string;
  urlHash?: string;
  originalUrl?: string;
  stage: string;
  stageOrder: number;
  retryScope?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  willRetry?: boolean;
  model?: string;
  error: unknown;
  context?: Record<string, unknown>;
}

export class EpisodeRepository {
  private db: InstanceType<typeof Database>;

  constructor(dbPath: string) {
    // Ensure data directory exists
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initTable();
  }

  private initTable(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS episodes (
        episode_id TEXT PRIMARY KEY,
        original_url TEXT,
        normalized_url TEXT NOT NULL,
        url_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        metadata_status TEXT NOT NULL DEFAULT 'pending',
        metadata_model TEXT,
        metadata_prompt_version TEXT,
        metadata_title TEXT,
        metadata_summary TEXT,
        metadata_published_at TEXT,
        metadata_related_links TEXT,
        metadata_input_tokens INTEGER,
        metadata_output_tokens INTEGER,
        metadata_estimated_cost_usd REAL,

        script_status TEXT NOT NULL DEFAULT 'pending',
        script_model TEXT,
        script_file_path TEXT,
        script_segment_count INTEGER,
        script_input_tokens INTEGER,
        script_output_tokens INTEGER,
        
        -- Multi-stage script generation
        script_outline_model TEXT,
        script_outline_tokens INTEGER,
        script_outline_content TEXT,
        script_content_model TEXT,
        script_content_tokens INTEGER,
        script_content_draft TEXT,
        script_refinement_model TEXT,
        script_refinement_tokens INTEGER,
        script_description_notes TEXT,
        script_description_model TEXT,
        script_description_tokens INTEGER,
        script_estimated_cost_usd REAL,

        audio_status TEXT NOT NULL DEFAULT 'pending',
        audio_chunks_dir TEXT,
        audio_chunk_count INTEGER,
        audio_voice_operator TEXT,
        audio_voice_historian TEXT,
        audio_voice_narrator TEXT,
        audio_voice_scholar TEXT,
        audio_total_duration_sec REAL,
        audio_input_chars INTEGER,
        audio_estimated_cost_usd REAL,

        merge_status TEXT NOT NULL DEFAULT 'pending',
        merged_audio_path TEXT,
        merged_audio_duration_sec REAL,
        merged_audio_checksum TEXT,

        publish_status TEXT NOT NULL DEFAULT 'pending',
        publish_feed_local_path TEXT,
        publish_audio_remote_path TEXT,
        publish_feed_remote_path TEXT,
        publish_item_guid TEXT,
        publish_at TEXT,

        estimated_total_cost_usd REAL,
        cost_pricing_snapshot TEXT
      );
    `;
    
    this.db.exec(createTableSQL);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episode_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id TEXT,
        url_hash TEXT,
        original_url TEXT,
        stage TEXT NOT NULL,
        stage_order INTEGER NOT NULL,
        retry_scope TEXT,
        attempt_number INTEGER,
        max_attempts INTEGER,
        will_retry INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        error_name TEXT,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        context_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
      );
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_failures_episode_created ON episode_failures (episode_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_failures_stage_created ON episode_failures (stage, created_at)');

    this.db.exec(`
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
      this.db.exec('ALTER TABLE model_sample_evaluations ADD COLUMN preference_rank INTEGER');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec(`
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
    } catch (error) {
      // Legacy table may not exist, ignore error.
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_model_sample_evaluations_kind_pass_fail ON model_sample_evaluations (kind, pass_fail)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_model_sample_evaluations_preference_rank ON model_sample_evaluations (kind, preference_rank)');

    try {
      this.db.exec('ALTER TABLE episode_failures ADD COLUMN retry_scope TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Add new columns if they don't exist (for existing databases)
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN metadata_related_links TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN original_url TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN audio_voice_operator TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN audio_voice_historian TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN audio_voice_narrator TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec('ALTER TABLE episodes ADD COLUMN audio_voice_scholar TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Add multi-stage script generation columns
    const scriptColumns = [
      'script_outline_model TEXT',
      'script_outline_tokens INTEGER',
      'script_outline_content TEXT',
      'script_content_model TEXT', 
      'script_content_tokens INTEGER',
      'script_content_draft TEXT',
      'script_refinement_model TEXT',
      'script_refinement_tokens INTEGER'
    ];
    
    for (const column of scriptColumns) {
      try {
        this.db.exec(`ALTER TABLE episodes ADD COLUMN ${column}`);
      } catch (error) {
        // Column already exists, ignore error
      }
    }
    
    // Add description notes columns
    const descriptionColumns = [
      'script_description_notes TEXT',
      'script_description_model TEXT',
      'script_description_tokens INTEGER'
    ];
    
    for (const column of descriptionColumns) {
      try {
        this.db.exec(`ALTER TABLE episodes ADD COLUMN ${column}`);
      } catch (error) {
        // Column already exists, ignore error
      }
    }
    
    // Add columns for new implementation
    const newColumns = [
      'metadata TEXT',           // JSON metadata
      'script TEXT',             // JSON script
      'audio_files TEXT',        // Comma-separated list of audio files
      'merged_file TEXT',        // Path to merged audio file
      'published_at TEXT'        // Publication timestamp
    ];
    
    newColumns.forEach(column => {
      try {
        this.db.exec(`ALTER TABLE episodes ADD COLUMN ${column}`);
      } catch (error) {
        // Column already exists, ignore error
      }
    });

    const telemetryColumns = [
      'metadata_estimated_cost_usd REAL',
      'script_estimated_cost_usd REAL',
      'audio_input_chars INTEGER',
      'audio_estimated_cost_usd REAL',
      'estimated_total_cost_usd REAL',
      'cost_pricing_snapshot TEXT'
    ];

    for (const column of telemetryColumns) {
      try {
        this.db.exec(`ALTER TABLE episodes ADD COLUMN ${column}`);
      } catch (error) {
        // Column already exists, ignore error
      }
    }
  }

  findByUrlHash(urlHash: string): EpisodeRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE url_hash = ?');
    return stmt.get(urlHash) as EpisodeRow | undefined;
  }

  findByEpisodeId(episodeId: string): EpisodeRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE episode_id = ?');
    return stmt.get(episodeId) as EpisodeRow | undefined;
  }

  listModelSampleEvaluations(kind: 'text' | 'audio'): ModelSampleEvaluationRow[] {
    const stmt = this.db.prepare(`
      SELECT sample_key, kind, provider, model, voice, pass_fail, preference_rank
      FROM model_sample_evaluations
      WHERE kind = ?
      ORDER BY
        CASE WHEN preference_rank IS NULL THEN 1 ELSE 0 END,
        preference_rank ASC,
        model ASC,
        COALESCE(voice, '') ASC
    `);
    return stmt.all(kind) as ModelSampleEvaluationRow[];
  }

  insertEpisode(episode: Omit<EpisodeRow, 'created_at' | 'updated_at'>): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO episodes (
        episode_id, original_url, normalized_url, url_hash, created_at, updated_at,
        metadata_status, script_status, audio_status, merge_status, publish_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      episode.episode_id,
      episode.original_url ?? episode.normalized_url,
      episode.normalized_url,
      episode.url_hash,
      now,
      now,
      episode.metadata_status,
      episode.script_status,
      episode.audio_status,
      episode.merge_status,
      episode.publish_status
    );
  }

  updateStageStatus(episodeId: string, stage: string, status: string, updates: Partial<EpisodeRow> = {}): void {
    const now = new Date().toISOString();
    const statusField = `${stage}_status`;
    
    // Build dynamic update query
    const fields = [`${statusField} = ?`, 'updated_at = ?'];
    const values: unknown[] = [status, now];
    
    // Add any additional fields
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      fields.push(`${key} = ?`);
      values.push(value);
    });
    
    values.push(episodeId);
    
    const sql = `UPDATE episodes SET ${fields.join(', ')} WHERE episode_id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values as any);
  }

  recordFailure(input: RecordEpisodeFailureInput): void {
    const now = new Date().toISOString();
    const episode = input.episodeId ? this.findByEpisodeId(input.episodeId) : undefined;
    const errorDetails = serializeError(input.error);
    const contextJson = input.context ? JSON.stringify(input.context) : null;
    const stmt = this.db.prepare(`
      INSERT INTO episode_failures (
        episode_id,
        url_hash,
        original_url,
        stage,
        stage_order,
        retry_scope,
        attempt_number,
        max_attempts,
        will_retry,
        model,
        error_name,
        error_message,
        error_stack,
        context_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.episodeId ?? null,
      input.urlHash ?? episode?.url_hash ?? null,
      input.originalUrl ?? episode?.original_url ?? episode?.normalized_url ?? null,
      input.stage,
      input.stageOrder,
      input.retryScope ?? null,
      input.attemptNumber ?? null,
      input.maxAttempts ?? null,
      input.willRetry ? 1 : 0,
      input.model ?? null,
      errorDetails.name,
      errorDetails.message,
      errorDetails.stack,
      contextJson,
      now
    );
  }

  resetEpisodeForRegeneration(episodeId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE episodes SET 
        metadata_status = 'pending',
        metadata_model = NULL,
        metadata_prompt_version = NULL,
        metadata_title = NULL,
        metadata_summary = NULL,
        metadata_published_at = NULL,
        metadata_related_links = NULL,
        metadata_input_tokens = NULL,
        metadata_output_tokens = NULL,
        metadata_estimated_cost_usd = NULL,
        
        script_status = 'pending',
        script_model = NULL,
        script_file_path = NULL,
        script_segment_count = NULL,
        script_input_tokens = NULL,
        script_output_tokens = NULL,
        
        script_outline_model = NULL,
        script_outline_tokens = NULL,
        script_outline_content = NULL,
        script_content_model = NULL,
        script_content_tokens = NULL,
        script_content_draft = NULL,
        script_refinement_model = NULL,
        script_refinement_tokens = NULL,
        script_description_notes = NULL,
        script_description_model = NULL,
        script_description_tokens = NULL,
        script_estimated_cost_usd = NULL,
        
        audio_status = 'pending',
        audio_chunks_dir = NULL,
        audio_chunk_count = NULL,
        audio_voice_operator = NULL,
        audio_voice_historian = NULL,
        audio_voice_narrator = NULL,
        audio_voice_scholar = NULL,
        audio_total_duration_sec = NULL,
        audio_input_chars = NULL,
        audio_estimated_cost_usd = NULL,
        
        merge_status = 'pending',
        merged_audio_path = NULL,
        merged_audio_duration_sec = NULL,
        merged_audio_checksum = NULL,
        
        publish_status = 'pending',
        publish_feed_local_path = NULL,
        publish_audio_remote_path = NULL,
        publish_feed_remote_path = NULL,
        publish_item_guid = NULL,
        publish_at = NULL,

        estimated_total_cost_usd = NULL,
        cost_pricing_snapshot = NULL,
        
        updated_at = ?
      WHERE episode_id = ?
    `);
    
    stmt.run(now, episodeId);
  }

  updateEpisodeUrls(episodeId: string, originalUrl: string, normalizedUrl: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE episodes
      SET original_url = ?, normalized_url = ?, updated_at = ?
      WHERE episode_id = ?
    `);
    
    stmt.run(originalUrl, normalizedUrl, now, episodeId);
  }

  refreshEstimatedTotalCost(episodeId: string, pricingSnapshot: string): void {
    const now = new Date().toISOString();
    const row = this.findByEpisodeId(episodeId);
    if (!row) {
      return;
    }

    const knownCosts = [
      toNumber(row.metadata_estimated_cost_usd),
      toNumber(row.script_estimated_cost_usd),
      toNumber(row.audio_estimated_cost_usd)
    ].filter((cost): cost is number => cost !== undefined);

    if (knownCosts.length === 0) {
      return;
    }

    const total = Math.round(knownCosts.reduce((sum, cost) => sum + cost, 0) * 1_000_000) / 1_000_000;
    const stmt = this.db.prepare(`
      UPDATE episodes
      SET estimated_total_cost_usd = ?, cost_pricing_snapshot = ?, updated_at = ?
      WHERE episode_id = ?
    `);

    stmt.run(total, pricingSnapshot, now, episodeId);
  }

  // Direct database access methods
  prepare(sql: string): any {
    return this.db.prepare(sql);
  }

  close(): void {
    this.db.close();
  }
}

function serializeError(error: unknown): { name: string | null; message: string; stack: string | null } {
  if (error instanceof Error) {
    const metadata = 'metadata' in error ? error.metadata : undefined;
    const metadataSuffix = metadata === undefined
      ? ''
      : ` | metadata=${safeJsonStringify(metadata)}`;
    return {
      name: error.name || null,
      message: (error.message || String(error)) + metadataSuffix,
      stack: error.stack || null
    };
  }

  return {
    name: null,
    message: String(error),
    stack: null
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
