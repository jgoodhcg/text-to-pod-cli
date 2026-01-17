import Database from 'better-sqlite3';
const db = new Database('data/episodes.db');
const row = db.prepare('SELECT original_url, normalized_url, metadata_title, metadata_summary, metadata_related_links FROM episodes WHERE episode_id = ?').get('20260117-1136-39c3537c');
console.log(JSON.stringify(row, null, 2));
