import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(__dirname, '..', '..', 'data.sqlite');

export const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Adds a column to an existing table when it is missing, so a database created
// before the column existed keeps working without being wiped.
function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Running the schema on every boot keeps setup to a single command. The CREATE
// statements are all IF NOT EXISTS, so they are safe to repeat; columns added
// later need the explicit ALTER below, since CREATE will skip a table that
// already exists.
export function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  addColumnIfMissing('messages', 'internal', 'INTEGER NOT NULL DEFAULT 0');
}

export function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS ai_analysis;
    DROP TABLE IF EXISTS tickets;
    DROP TABLE IF EXISTS users;
  `);
  migrate();
}
