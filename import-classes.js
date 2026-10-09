// import-classes.js — loads the class list in data/classes-seed.json into the
// `classes` table, REPLACING whatever classes are there (ids are kept, so the
// photos/paths and the numbering match the file).
//
// Meant for setting up a fresh or test server so it shows the same classes as
// the main one:
//
//   node import-classes.js --dry-run      # show what would happen
//   node import-classes.js                # replace the classes
//
// Safety: it refuses to run if any class bookings exist (bookings point at
// class ids), so it can't be used by accident on a live database. Pass
// --force only if you really mean it.
const fs = require('fs');
const path = require('path');
const { readTable, writeTable, _db } = require('./db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'data', 'classes-seed.json');

const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
const existing = readTable('classes');
const bookings = readTable('bookings').length;

console.log(`File has ${incoming.length} classes; the database currently has ${existing.length} and ${bookings} class booking(s).`);
if (bookings > 0 && !force) {
  console.error('Refusing to replace classes while class bookings exist (they point at class ids). Use --force only if you are sure.');
  process.exit(1);
}

incoming.forEach((c) => console.log(`${dryRun ? 'would load' : 'load'}  #${c.id}  ${c.title}  (${c.format}, ages ${c.ageMin}-${c.ageMax}, $${c.price}, ${c.image || 'no image'})`));
if (dryRun) { console.log('\nDry run: nothing changed.'); process.exit(0); }

const now = new Date().toISOString();
writeTable('classes', incoming.map((c) => ({ ...c, createdAt: c.createdAt || now })));
// Keep the id counter ahead of the highest id so new classes don't collide.
const maxId = Math.max(0, ...incoming.map((c) => c.id));
_db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)').run('classes');
_db.prepare('UPDATE counters SET value = MAX(value, ?) WHERE name = ?').run(maxId, 'classes');
console.log(`\nDone: ${incoming.length} classes loaded.`);
