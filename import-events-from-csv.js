// import-events-from-csv.js — one-time import of events into the `events`
// table from a CSV exported from the old Google Sheet ("Events" tab →
// File → Download → CSV).
//
//   node import-events-from-csv.js --dry-run            # preview
//   node import-events-from-csv.js                      # import data/events-import.csv
//   node import-events-from-csv.js path/to/file.csv     # import another file
//
// Safe to re-run: an Event ID that already exists in the database is skipped.
// If the same Event ID appears twice in the file, later ones get -2, -3, ...
// (Event IDs must be unique; registrations point at them).
// The Sheet's "Calendar Event ID" column is ignored.
const fs = require('fs');
const path = require('path');
const { readTable, writeTable, nextId } = require('./db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'data', 'events-import.csv');

const STATUSES = ['Draft', 'Published'];
const CATEGORIES = ['Test Prep', 'Enrichment', 'Workshop', 'Info Session'];
const EVENT_TYPES = ['Online', 'In-person', 'Hybrid'];
const RECURRENCES = ['None', 'Daily', 'Weekly', 'Every 2 Weeks', 'Monthly'];

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const pick = (list, v) => list.find((x) => x.toLowerCase() === String(v || '').trim().toLowerCase());

function normDate(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // M/D/YYYY
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

function normTime(v) {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/.exec(String(v || '').trim());
  return m ? `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M` : '';
}

if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
const table = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const header = table.shift().map((h) => h.trim());
const col = (row, name) => String(row[header.indexOf(name)] ?? '').trim();

const existing = readTable('events');
const used = new Set(existing.map((e) => e.slug.toLowerCase()));
const toAdd = [];
let problems = 0;

table.forEach((row, i) => {
  const line = i + 2;
  const baseSlug = col(row, 'Event ID');
  const e = {
    status: pick(STATUSES, col(row, 'Status')),
    name: col(row, 'Event Name'),
    category: pick(CATEGORIES, col(row, 'Category')),
    eventType: pick(EVENT_TYPES, col(row, 'Event Type')),
    grades: col(row, 'Grades').split(',').map((g) => g.trim()).filter(Boolean).join(','),
    date: normDate(col(row, 'Date')),
    recurrence: pick(RECURRENCES, col(row, 'Recurrence') || 'None'),
    recurrenceEnds: normDate(col(row, 'Recurrence Ends')),
    skipDates: col(row, 'Skip Dates').split(',').map((d) => normDate(d)).filter(Boolean).join(','),
    startTime: normTime(col(row, 'Start Time')),
    endTime: normTime(col(row, 'End Time')),
    capacity: parseInt(col(row, 'Capacity'), 10),
  };
  const missing = Object.entries({ 'Event ID': baseSlug, Status: e.status, 'Event Name': e.name, Category: e.category,
    'Event Type': e.eventType, Grades: e.grades, Date: e.date, Recurrence: e.recurrence, 'Start Time': e.startTime,
    'End Time': e.endTime, Capacity: Number.isInteger(e.capacity) && e.capacity > 0 ? 'ok' : '' })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { problems++; console.log(`line ${line}: SKIPPED — missing/unrecognized: ${missing.join(', ')}`); return; }

  let slug = baseSlug;
  if (used.has(slug.toLowerCase())) {
    if (existing.some((x) => x.slug.toLowerCase() === slug.toLowerCase())) { console.log(`line ${line}: skip  ${slug} (already in the database)`); return; }
    for (let n = 2; used.has(slug.toLowerCase()); n++) slug = `${baseSlug}-${n}`;
    console.log(`line ${line}: Event ID "${baseSlug}" repeats in the file → using "${slug}"`);
  }
  used.add(slug.toLowerCase());
  toAdd.push({ slug, ...e });
});

toAdd.forEach((e) => console.log(`${dryRun ? 'would add' : 'add'}  ${e.status.padEnd(9)} ${e.slug}  "${e.name}"  ${e.date} ${e.startTime}-${e.endTime}  grades ${e.grades}  ${e.recurrence}${e.recurrenceEnds ? ' until ' + e.recurrenceEnds : ''}`));

if (!dryRun && toAdd.length) {
  const rows = readTable('events');
  toAdd.forEach((e) => rows.push({ id: nextId('events'), ...e, createdAt: new Date().toISOString() }));
  writeTable('events', rows);
}
console.log(`\n${dryRun ? 'Dry run: ' : ''}${toAdd.length} event(s) ${dryRun ? 'would be added' : 'added'}${problems ? `, ${problems} skipped` : ''}.`);
