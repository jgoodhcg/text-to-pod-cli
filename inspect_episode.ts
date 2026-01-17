import Database from 'better-sqlite3';
const db = new Database('data/episodes.db');
const row = db.prepare('SELECT script_outline_content, script_content_draft FROM episodes WHERE episode_id = ?').get('20260117-1136-39c3537c');
console.log('---OUTLINE---');
console.log(row.script_outline_content);
console.log('---CONTENT---');
// console.log(row.script_content_draft); // Commented out to avoid massive output, mostly interested if outline is empty
