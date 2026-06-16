/**
 * Database module — opens the SQLite file and exposes it to the rest of the app.
 *
 * Why better-sqlite3?
 *   It's synchronous, which keeps the code simple — no async/await needed for queries.
 *   SQLite is fast enough that synchronous access is never a bottleneck at our scale.
 *
 * WAL mode: allows multiple readers at the same time as a writer.
 *   Without it, a read while a write is in progress would block.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');
const env = require('../config/env');

let db; // module-level singleton — one connection shared across the whole process

/**
 * initDb()
 * Called once at startup. Opens (or creates) the SQLite file, enables WAL mode,
 * and runs any migration files that haven't been applied yet.
 */
function initDb() {
  const dbPath = env.DB_PATH;

  // Make sure the directory exists before trying to create the file.
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // WAL = Write-Ahead Logging. Readers and writers don't block each other.
  db.pragma('journal_mode = WAL');

  // Foreign key enforcement is off by default in SQLite — turn it on.
  db.pragma('foreign_keys = ON');

  console.log(`[db] opened ${dbPath}`);

  runMigrations();
  return db;
}

/**
 * getDb()
 * Returns the open database connection.
 * Route handlers call this to run queries.
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

/**
 * runMigrations()
 * Reads every .sql file in the /migrations folder (sorted alphabetically, so
 * 001_users.sql runs before 002_profiles.sql, etc.), and applies each one
 * that hasn't already been recorded in the _migrations tracking table.
 *
 * This pattern means you never have to worry about running a migration twice —
 * just add a new numbered .sql file and restart the server.
 */
function runMigrations() {
  // Create the migrations tracking table if it doesn't exist yet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename  TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // alphabetical = numerical order given our 001_, 002_ prefix convention

  const alreadyApplied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename)
  );

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    console.log(`[db] applied migration: ${file}`);
  }
}

module.exports = { initDb, getDb };
