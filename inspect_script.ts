import Database from 'better-sqlite3';
const db = new Database('data/episodes.db');
const row = db.prepare('SELECT script_content_draft FROM episodes WHERE episode_id = ?').get('20260117-1136-39c3537c');
console.log(row.script_content_draft);
