// import-events-from-sheet.js — one-time import of the live events from the
// old Google Sheet (via its Apps Script Web App) into the `events` table.
//
//   node import-events-from-sheet.js --dry-run   # show what would be added
//   node import-events-from-sheet.js             # add them
//
// Run it on the server (it needs to reach script.google.com). Safe to re-run:
// events whose Event ID already exists are skipped.
//
// Limits (the Web App only publishes *expanded, Published* sessions, never
// the raw Sheet rows): Draft rows can't be imported, and a recurring series
// is rebuilt from the dates it published — so its "Recurrence ends" comes out
// as the last date currently visible (the Sheet only shows ~90 days ahead).
// Open each recurring event in the admin page afterwards and set its real
// end date.
const { readTable, writeTable, nextId } = require('./db');

const EVENTS_API_URL = process.env.EVENTS_API_URL ||
  'https://script.google.com/macros/s/AKfycbzI3f5UfT_z5m8cRvhWHCrqT3V3tVd84S1NYeaZOUtaviq9qpktPi8o6GGSoFSEnUvs/exec';

const CATEGORY_LABELS = { testprep: 'Test Prep', enrichment: 'Enrichment', workshop: 'Workshop', info: 'Info Session' };
const TYPE_LABELS = { online: 'Online', 'in-person': 'In-person', hybrid: 'Hybrid' };

const dryRun = process.argv.includes('--dry-run');

function daysBetween(a, b) {
  return Math.round((Date.UTC(...b.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) - Date.UTC(...a.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))) / 86400000);
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

(async () => {
  const res = await fetch(EVENTS_API_URL);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'The Sheet returned an error.');

  const groups = new Map();
  data.events.forEach((o) => {
    const slug = o.id.split('@')[0];
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(o);
  });

  const existing = readTable('events');
  const have = new Set(existing.map((e) => e.slug.toLowerCase()));
  const toAdd = [];

  groups.forEach((occs, slug) => {
    if (have.has(slug.toLowerCase())) { console.log(`skip  ${slug} (already in the database)`); return; }
    occs.sort((a, b) => a.date.localeCompare(b.date));
    const first = occs[0];
    const recurring = occs.some((o) => o.id.includes('@'));
    let recurrence = 'None', recurrenceEnds = '', skipDates = '';
    if (recurring) {
      const step = occs.length > 1 ? daysBetween(occs[0].date, occs[1].date) : 7;
      recurrence = step >= 27 ? 'Monthly' : (step >= 13 ? 'Every 2 Weeks' : 'Weekly');
      recurrenceEnds = occs[occs.length - 1].date;
      if (recurrence !== 'Monthly') {
        const have = new Set(occs.map((o) => o.date));
        const stride = recurrence === 'Weekly' ? 7 : 14;
        const skips = [];
        for (let d = addDays(first.date, stride); d < recurrenceEnds; d = addDays(d, stride)) if (!have.has(d)) skips.push(d);
        skipDates = skips.join(',');
      }
    }
    toAdd.push({
      slug, status: 'Published', name: first.name,
      category: CATEGORY_LABELS[first.cat] || 'Workshop',
      eventType: TYPE_LABELS[first.eventType] || 'Online',
      grades: first.grades.join(','),
      date: first.date, recurrence, recurrenceEnds, skipDates,
      startTime: first.start, endTime: first.end, capacity: first.capacity,
    });
  });

  toAdd.forEach((e) => console.log(`${dryRun ? 'would add' : 'add'}  ${e.slug}  "${e.name}"  ${e.date}${e.recurrence !== 'None' ? '  ' + e.recurrence + ' until ' + e.recurrenceEnds : ''}`));

  if (!dryRun && toAdd.length) {
    const rows = readTable('events');
    toAdd.forEach((e) => rows.push({ id: nextId('events'), ...e, createdAt: new Date().toISOString() }));
    writeTable('events', rows);
  }
  console.log(`\n${dryRun ? 'Dry run: ' : ''}${toAdd.length} event(s) ${dryRun ? 'would be added' : 'added'}.`);
  if (toAdd.some((e) => e.recurrence !== 'None')) {
    console.log('Reminder: open each recurring event in /admin.html and set its real "Recurrence ends" date.');
  }
})().catch((err) => { console.error('Import failed:', err.message); process.exit(1); });
