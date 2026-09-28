// db.js
// SQLite-backed "database" using better-sqlite3. All data lives in one
// file: data/eep.db (git-ignored — see .gitignore).
//
// This keeps the exact same readTable/writeTable/nextId interface the
// JSON-file version had, so routes/*.js, middleware/*.js, and seed.js
// don't need any changes. Internally, though, this now gives us real
// SQL tables, indexed lookups, and transaction-safe writes instead of
// rewriting a whole JSON file on every change.
//
// Migrating existing data/*.json files into this database (e.g. after
// a fresh deploy, or moving from the old JSON-file version) is done by
// migrate-json-to-sqlite.js — run `npm run migrate` once.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'eep.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // safer under concurrent reads/writes, and faster

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'parent',
    createdAt    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classes (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL,
    ageMin      INTEGER NOT NULL,
    ageMax      INTEGER NOT NULL,
    format      TEXT NOT NULL,
    price       REAL NOT NULL,
    priceUnit   TEXT NOT NULL DEFAULT 'per class',
    schedule    TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',
    capacity    INTEGER NOT NULL DEFAULT 10,
    rating      REAL,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY,
    classId     INTEGER NOT NULL,
    userId      INTEGER NOT NULL,
    studentName TEXT NOT NULL,
    studentAge  INTEGER,
    notes       TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'confirmed',
    createdAt   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_classId ON bookings(classId);
  CREATE INDEX IF NOT EXISTS idx_bookings_userId ON bookings(userId);

  CREATE TABLE IF NOT EXISTS passwordResets (
    id        INTEGER PRIMARY KEY,
    userId    INTEGER NOT NULL,
    tokenHash TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    used      INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_passwordResets_tokenHash ON passwordResets(tokenHash);
  CREATE INDEX IF NOT EXISTS idx_passwordResets_userId ON passwordResets(userId);

  CREATE TABLE IF NOT EXISTS counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
`);

// Column order per table — matches the field names routes/*.js already
// uses on plain JS objects, so writeTable() can stay fully generic.
const TABLE_COLUMNS = {
  users: ['id', 'name', 'email', 'passwordHash', 'role', 'createdAt'],
  classes: ['id', 'title', 'description', 'subject', 'ageMin', 'ageMax', 'format', 'price', 'priceUnit', 'schedule', 'image', 'capacity', 'rating', 'createdAt'],
  bookings: ['id', 'classId', 'userId', 'studentName', 'studentAge', 'notes', 'status', 'createdAt'],
  passwordResets: ['id', 'userId', 'tokenHash', 'expiresAt', 'used', 'createdAt'],
};

const seedCounter = db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)');
for (const name of Object.keys(TABLE_COLUMNS)) {
  seedCounter.run(name);
}

function assertKnownTable(name) {
  if (!TABLE_COLUMNS[name]) {
    throw new Error(`Unknown table: ${name}`);
  }
}

// Reads every row from a table, in id order — same shape as before
// (an array of plain objects with the same field names).
function readTable(name) {
  assertKnownTable(name);
  return db.prepare(`SELECT * FROM ${name} ORDER BY id`).all();
}

// Replaces the ENTIRE table's contents with `data` (an array of plain
// objects) — this matches the old JSON-file behavior exactly, since
// every route reads the whole table, mutates it in JS, then calls
// writeTable() with the full array back. Wrapped in a transaction so
// it's all-or-nothing (no half-written table if something throws).
function writeTable(name, data) {
  assertKnownTable(name);
  const columns = TABLE_COLUMNS[name];
  const placeholders = columns.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})`);
  const clear = db.prepare(`DELETE FROM ${name}`);

  const replaceAll = db.transaction((rows) => {
    clear.run();
    for (const row of rows) {
      const values = columns.map((col) => (row[col] === undefined ? null : row[col]));
      insert.run(...values);
    }
  });

  replaceAll(data);
}

// Returns the next auto-incrementing id for a table, same semantics as
// the old counters.json (a monotonically increasing counter that never
// reuses an id, even after rows are deleted).
function nextId(tableName) {
  const bump = db.transaction((name) => {
    db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)').run(name);
    db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?').run(name);
    return db.prepare('SELECT value FROM counters WHERE name = ?').get(name).value;
  });
  return bump(tableName);
}

module.exports = {
  readTable,
  writeTable,
  nextId,
  // Exposed for migrate-json-to-sqlite.js only — everyday app code
  // should stick to readTable/writeTable/nextId above.
  _db: db,
  _TABLE_COLUMNS: TABLE_COLUMNS,
};
