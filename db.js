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

// If an existing eventRegistrations table still has the old
// name/phone/address shape (before registration was changed to ask for
// student name/grade/age, matching class enrollment), drop it so the
// CREATE TABLE below recreates it with the new shape. This table only
// ever held test data at this point (confirmed with the user), so a
// one-time reset is safe — no column-by-column migration needed.
const existingTableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
if (existingTableNames.includes('eventRegistrations')) {
  const eventRegCols = db.prepare('PRAGMA table_info(eventRegistrations)').all().map((c) => c.name);
  if (!eventRegCols.includes('studentName')) {
    db.exec('DROP TABLE eventRegistrations');
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'parent',
    phone        TEXT,
    address      TEXT,
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
    studentGrade TEXT,
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

  -- Workshop Event registrations (events themselves are in the 'events'
  -- table below), tied to a real account (userId).
  -- Fields mirror class enrollment's bookings table (student name/age)
  -- plus a grade, since this is about the student, not the parent account.
  CREATE TABLE IF NOT EXISTS eventRegistrations (
    id           INTEGER PRIMARY KEY,
    userId       INTEGER NOT NULL,
    eventId      TEXT NOT NULL,
    eventName    TEXT NOT NULL,
    eventDate    TEXT NOT NULL,
    studentName  TEXT NOT NULL,
    studentGrade TEXT NOT NULL,
    studentAge   INTEGER,
    optIn        INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'confirmed',
    createdAt    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_eventRegistrations_eventId ON eventRegistrations(eventId);
  CREATE INDEX IF NOT EXISTS idx_eventRegistrations_userId ON eventRegistrations(userId);

  -- A parent's children. Light by design (Option B from an earlier design
  -- discussion): bookings/eventRegistrations keep their own freeform
  -- studentName/studentAge/studentGrade columns rather than being
  -- replaced, and get a nullable studentId (added below) that NEW rows
  -- can set to link back here. Old rows are left alone — nothing backfills
  -- them, and nothing requires a booking to reference a student record.
  CREATE TABLE IF NOT EXISTS students (
    id        INTEGER PRIMARY KEY,
    userId    INTEGER NOT NULL,
    name      TEXT NOT NULL,
    grade     TEXT,
    age       INTEGER,
    notes     TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_students_userId ON students(userId);

  -- Workshop Events (calendar.html). Mirrors the columns of the old Google
  -- Sheet "Events" tab. One row = one event *or* one recurring series;
  -- routes/events.js expands a series into dated occurrences on the fly.
  -- 'slug' is the Sheet's "Event ID" (e.g. sat-oct3): it's what
  -- eventRegistrations.eventId points at (as-is for one-time events, or
  -- slug@yyyy-mm-dd for one occurrence of a recurring series), so don't
  -- change it once people have registered.
  CREATE TABLE IF NOT EXISTS events (
    id             INTEGER PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    status         TEXT NOT NULL DEFAULT 'Draft',
    name           TEXT NOT NULL,
    category       TEXT NOT NULL,
    eventType      TEXT NOT NULL,
    grades         TEXT NOT NULL DEFAULT '',
    date           TEXT NOT NULL,
    recurrence     TEXT NOT NULL DEFAULT 'None',
    recurrenceEnds TEXT NOT NULL DEFAULT '',
    skipDates      TEXT NOT NULL DEFAULT '',
    startTime      TEXT NOT NULL DEFAULT '',
    endTime        TEXT NOT NULL DEFAULT '',
    capacity       INTEGER NOT NULL DEFAULT 10,
    createdAt      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
`);

// Additive migration for databases that already existed before phone/address
// were added to `users` (everyone's production database, most likely) —
// CREATE TABLE IF NOT EXISTS above only shapes a brand-new database, so an
// existing `users` table needs these columns added by hand. Safe to run on
// every startup: it only ALTERs when the column isn't already there.
const existingUserColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!existingUserColumns.includes('phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}
if (!existingUserColumns.includes('address')) {
  db.exec('ALTER TABLE users ADD COLUMN address TEXT');
}

// Additive migration for the new students table (see above): bookings and
// eventRegistrations both already have real rows by the time this ships,
// so — unlike eventRegistrations' earlier drop-and-recreate, which was
// only safe because that table was still test-only — this adds a nullable
// studentId column by hand rather than touching existing data.
const existingBookingColumns = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
if (!existingBookingColumns.includes('studentId')) {
  db.exec('ALTER TABLE bookings ADD COLUMN studentId INTEGER');
}
if (!existingBookingColumns.includes('studentGrade')) {
  // Added so class enrollment can ask for grade, same as Workshop Event
  // registration always has. Nullable — existing bookings just read back
  // with no grade, same as how studentId was added above.
  db.exec('ALTER TABLE bookings ADD COLUMN studentGrade TEXT');
}
const existingEventRegColumns = db.prepare("PRAGMA table_info(eventRegistrations)").all().map((c) => c.name);
if (!existingEventRegColumns.includes('studentId')) {
  db.exec('ALTER TABLE eventRegistrations ADD COLUMN studentId INTEGER');
}

// Column order per table — matches the field names routes/*.js already
// uses on plain JS objects, so writeTable() can stay fully generic.
const TABLE_COLUMNS = {
  users: ['id', 'name', 'email', 'passwordHash', 'role', 'phone', 'address', 'createdAt'],
  classes: ['id', 'title', 'description', 'subject', 'ageMin', 'ageMax', 'format', 'price', 'priceUnit', 'schedule', 'image', 'capacity', 'rating', 'createdAt'],
  bookings: ['id', 'classId', 'userId', 'studentName', 'studentAge', 'notes', 'status', 'createdAt', 'studentId', 'studentGrade'],
  passwordResets: ['id', 'userId', 'tokenHash', 'expiresAt', 'used', 'createdAt'],
  eventRegistrations: ['id', 'userId', 'eventId', 'eventName', 'eventDate', 'studentName', 'studentGrade', 'studentAge', 'optIn', 'status', 'createdAt', 'studentId'],
  students: ['id', 'userId', 'name', 'grade', 'age', 'notes', 'createdAt'],
  events: ['id', 'slug', 'status', 'name', 'category', 'eventType', 'grades', 'date', 'recurrence', 'recurrenceEnds', 'skipDates', 'startTime', 'endTime', 'capacity', 'createdAt'],
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
