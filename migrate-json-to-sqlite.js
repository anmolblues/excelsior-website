// migrate-json-to-sqlite.js
// One-time migration: imports existing data/*.json files into the new
// SQLite database (data/eep.db). Safe to run on:
//   - a fresh clone (missing JSON files are just skipped), or
//   - the live server (imports your real users/classes/bookings).
//
// Run with: npm run migrate
//
// It will NOT overwrite a table that already has rows in SQLite, so
// it's safe to run more than once — it just does nothing on a second run.
//
// IMPORTANT: back up your data/ folder before running this on a live
// server, just in case.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function loadJsonArray(name) {
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) {
    console.log(`  (no ${name}.json found — skipping)`);
    return [];
  }
  const raw = fs.readFileSync(fp, 'utf-8');
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error(`  Could not parse ${name}.json: ${err.message}`);
    return [];
  }
}

// Requiring ./db creates data/eep.db and its schema if they don't exist yet.
const { readTable, writeTable, _db } = require('./db');

const TABLES = ['users', 'classes', 'bookings'];

console.log('Migrating JSON files into SQLite (data/eep.db)...\n');

function findDuplicateIds(rows) {
  const seen = new Map();
  const dupes = [];
  for (const row of rows) {
    if (seen.has(row.id)) {
      dupes.push({ id: row.id, a: seen.get(row.id), b: row });
    } else {
      seen.set(row.id, row);
    }
  }
  return dupes;
}

let hadErrors = false;

for (const table of TABLES) {
  const existing = readTable(table);
  if (existing.length > 0) {
    console.log(`- ${table}: SQLite already has ${existing.length} row(s) — skipping to avoid duplicating data.`);
    continue;
  }

  const rows = loadJsonArray(table);
  if (rows.length === 0) {
    console.log(`- ${table}: nothing to migrate.`);
    continue;
  }

  const dupes = findDuplicateIds(rows);
  if (dupes.length > 0) {
    hadErrors = true;
    console.error(`\n- ${table}: FOUND DUPLICATE IDS IN data/${table}.json — refusing to migrate this table until it's fixed:`);
    for (const d of dupes) {
      const label = (r) => r.title || r.name || r.email || JSON.stringify(r).slice(0, 60);
      console.error(`    id ${d.id} is used by BOTH: "${label(d.a)}" AND "${label(d.b)}"`);
    }
    console.error(`  Fix data/${table}.json (give each row a unique id) and re-run "npm run migrate".\n`);
    continue;
  }

  writeTable(table, rows);

  // Bump the id counter to at least the highest id we just migrated, so
  // the next new record (created via nextId()) can't collide with one
  // that came from the JSON file.
  const maxId = Math.max(...rows.map((r) => r.id || 0));
  _db.prepare(
    'INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)'
  ).run(table, maxId);

  console.log(`- ${table}: migrated ${rows.length} row(s) (id counter set to at least ${maxId}).`);
}

if (hadErrors) {
  console.error('Migration stopped early because of the duplicate-id issue(s) above. No data was lost — nothing was written for the affected table(s).');
  process.exit(1);
}

// Carry over the id counters too, so newly created records don't collide
// with ids that already existed in the JSON files.
const countersPath = path.join(DATA_DIR, 'counters.json');
if (fs.existsSync(countersPath)) {
  const counters = JSON.parse(fs.readFileSync(countersPath, 'utf-8'));
  const upsert = _db.prepare(
    'INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)'
  );
  for (const [name, value] of Object.entries(counters)) {
    upsert.run(name, value);
  }
  console.log('- counters: synced from counters.json (kept the higher of the two values)');
} else {
  console.log('- counters: no counters.json found, keeping whatever SQLite already has.');
}

console.log(
  "\nDone. The app now reads/writes data/eep.db instead of the JSON files.\n" +
  "The old data/*.json files are untouched — keep them around until you've\n" +
  "confirmed the site works correctly, then you can archive or delete them."
);
