import Database from 'better-sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

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
  
  audio_status: string;
  audio_chunks_dir?: string;
  audio_chunk_count?: number;
  audio_voice_operator?: string;
  audio_voice_historian?: string;
  audio_voice_narrator?: string;
  audio_voice_scholar?: string;
  audio_total_duration_sec?: number;
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

        audio_status TEXT NOT NULL DEFAULT 'pending',
        audio_chunks_dir TEXT,
        audio_chunk_count INTEGER,
        audio_voice_operator TEXT,
        audio_voice_historian TEXT,
        audio_voice_narrator TEXT,
        audio_voice_scholar TEXT,
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
        
        audio_status = 'pending',
        audio_chunks_dir = NULL,
        audio_chunk_count = NULL,
        audio_voice_operator = NULL,
        audio_voice_historian = NULL,
        audio_voice_narrator = NULL,
        audio_voice_scholar = NULL,
        audio_total_duration_sec = NULL,
        
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

  // Direct database access methods
  prepare(sql: string): any {
    return this.db.prepare(sql);
  }

  close(): void {
    this.db.close();
  }
}
