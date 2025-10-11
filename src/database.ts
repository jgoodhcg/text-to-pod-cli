import Database from 'better-sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface EpisodeRow {
  episode_id: string;
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
  metadata_input_tokens?: number;
  metadata_output_tokens?: number;
  
  script_status: string;
  script_model?: string;
  script_file_path?: string;
  script_segment_count?: number;
  script_input_tokens?: number;
  script_output_tokens?: number;
  
  audio_status: string;
  audio_chunks_dir?: string;
  audio_chunk_count?: number;
  audio_voice_operator?: string;
  audio_voice_historian?: string;
  audio_total_duration_sec?: number;
  
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
}

export class EpisodeRepository {
  private db: Database.Database;

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
        metadata_input_tokens INTEGER,
        metadata_output_tokens INTEGER,

        script_status TEXT NOT NULL DEFAULT 'pending',
        script_model TEXT,
        script_file_path TEXT,
        script_segment_count INTEGER,
        script_input_tokens INTEGER,
        script_output_tokens INTEGER,

        audio_status TEXT NOT NULL DEFAULT 'pending',
        audio_chunks_dir TEXT,
        audio_chunk_count INTEGER,
        audio_voice_operator TEXT,
        audio_voice_historian TEXT,
        audio_total_duration_sec REAL,

        merge_status TEXT NOT NULL DEFAULT 'pending',
        merged_audio_path TEXT,
        merged_audio_duration_sec REAL,
        merged_audio_checksum TEXT,

        publish_status TEXT NOT NULL DEFAULT 'pending',
        publish_feed_local_path TEXT,
        publish_audio_remote_path TEXT,
        publish_feed_remote_path TEXT,
        publish_item_guid TEXT,
        publish_at TEXT
      );
    `;
    
    this.db.exec(createTableSQL);
  }

  findByUrlHash(urlHash: string): EpisodeRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE url_hash = ?');
    return stmt.get(urlHash) as EpisodeRow | undefined;
  }

  findByEpisodeId(episodeId: string): EpisodeRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE episode_id = ?');
    return stmt.get(episodeId) as EpisodeRow | undefined;
  }

  insertEpisode(episode: Omit<EpisodeRow, 'created_at' | 'updated_at'>): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO episodes (
        episode_id, normalized_url, url_hash, created_at, updated_at,
        metadata_status, script_status, audio_status, merge_status, publish_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      episode.episode_id,
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
    const values = [status, now];
    
    // Add any additional fields
    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = ?`);
      values.push(String(value));
    });
    
    values.push(episodeId);
    
    const sql = `UPDATE episodes SET ${fields.join(', ')} WHERE episode_id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values as any);
  }

  close(): void {
    this.db.close();
  }
}

