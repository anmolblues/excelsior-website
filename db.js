// db.js
// Lightweight file-based JSON "database". Good fit for a small site like this —
// no native dependencies to install, easy to back up (just copy the /data folder),
// and easy to inspect/edit by hand if you ever need to.
//
// If you outgrow this later, swap these functions for real DB queries
// (e.g. Postgres/MySQL/SQLite) — the rest of the app only talks to this file.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureFile(name, defaultValue) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, JSON.stringify(defaultValue, null, 2));
  }
}

// Make sure our "tables" exist
ensureFile('classes', []);
ensureFile('users', []);
ensureFile('bookings', []);
ensureFile('counters', { classes: 0, users: 0, bookings: 0 });

function readTable(name) {
  const fp = filePath(name);
  const raw = fs.readFileSync(fp, 'utf-8');
  return JSON.parse(raw || '[]');
}

function writeTable(name, data) {
  const fp = filePath(name);
  // write to a temp file then rename — avoids corrupting the file if the
  // process is killed mid-write
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

function nextId(tableName) {
  const counters = JSON.parse(fs.readFileSync(filePath('counters'), 'utf-8'));
  counters[tableName] = (counters[tableName] || 0) + 1;
  fs.writeFileSync(filePath('counters'), JSON.stringify(counters, null, 2));
  return counters[tableName];
}

module.exports = {
  readTable,
  writeTable,
  nextId,
};
