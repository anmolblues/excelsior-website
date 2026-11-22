// import-courses.js — turns the Course Schedule on the home page
// (public/schedule.js) into real classes in the database, with dated class
// sessions, so the admin "Attendance & Reports" section and the Parent
// Portal (/portal.html) can track them.
//
//   node import-courses.js --dry-run              # show what would happen
//   node import-courses.js                        # do it
//
// Options:
//   --start=YYYY-MM-DD   first week of classes (default 2026-11-23). Each
//                        course's first date is its first weekday on/after this.
//   --weeks=N            meetings per weekday a course runs (default 6, matching
//                        the 6-week programs). Holidays are skipped and the
//                        course runs one week later instead, so every course
//                        still gets N meetings per weekday.
//   --skip=d1,d2,...     dates with no classes (default: Thanksgiving Thu/Fri,
//                        Dec 24/25/31, Jan 1).
//   --keep-old           don't delete classes that aren't in the schedule
//   --force              delete old classes even if they have active bookings
//
// What it does:
//   1. One class per course + grade group, exactly like the course tiles on
//      the home page (After-school Homework Help becomes two: Grades 3–6 and
//      Grades 7–8). Title example: "Math (Grades 3–6)".
//   2. Safe to re-run: a class that already exists (same title) is updated,
//      not duplicated, and dates that already exist are skipped.
//   3. Deletes every other class (the old demo classes) along with its class
//      dates and attendance/report records. It refuses if any of those old
//      classes has an active booking, unless you pass --force.
//
// Run it wherever the database lives: on your Mac for the local copy, and
// on the EC2 server for the live site (then `pm2 restart all` is not needed;
// the site reads the database on every request).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readTable, writeTable, nextId } = require('./db');

// ---------- options ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const keepOld = args.includes('--keep-old');
const START = opt('start', '2026-11-23');
const WEEKS = parseInt(opt('weeks', '6'), 10);
const SKIP = new Set(
  opt('skip', '2026-11-26,2026-11-27,2026-12-24,2026-12-25,2026-12-31,2027-01-01')
    .split(',').map((s) => s.trim()).filter(Boolean)
);
if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !(WEEKS >= 1 && WEEKS <= 52)) {
  console.error('Usage: --start=YYYY-MM-DD --weeks=1..52');
  process.exit(1);
}

// ---------- read the course schedule from public/schedule.js ----------
// Pulls out the SCHEDULE, DAYS and PRICES lists so this script always
// matches what the website shows (edit schedule.js, then re-run this).
const src = fs.readFileSync(path.join(__dirname, 'public', 'schedule.js'), 'utf8');
function extract(name) {
  const m = src.match(new RegExp(`var ${name} = ([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`Could not find "var ${name}" in public/schedule.js`);
  return vm.runInNewContext(`(${m[1]})`);
}
const SCHEDULE = extract('SCHEDULE');
const DAYS = extract('DAYS');      // ['Monday', ... 'Friday']
const PRICES = extract('PRICES');  // 'Name|Grade x–y' -> [1:1, group of 3, group of 6] for 6 weeks

// "4:30 – 5:30 PM" -> ['16:30', '17:30']. School-day times: hours 1–11
// without AM/PM after them are afternoon/evening.
function parseTimes(range) {
  const [a, b] = range.split(/\s*[–-]\s*/);
  const to24 = (t) => {
    const m = t.match(/(\d{1,2}):(\d{2})/);
    let h = parseInt(m[1], 10);
    if (/AM/i.test(t)) { if (h === 12) h = 0; } else if (h < 12) h += 12;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  return [to24(a), to24(b)];
}

const AGES = { 'Grade 3–6': [8, 12], 'Grade 7–8': [12, 14], 'Grade 3–7': [8, 13], 'High School': [14, 18] };
const GRADE_TITLE = { 'Grade 3–6': 'Grades 3–6', 'Grade 7–8': 'Grades 7–8', 'High School': 'High School' };

// Same grouping as the home-page tiles: one course per name + grade label;
// the after-school class (Grade 3–7) is split into Grades 3–6 and 7–8.
const courses = new Map();
for (const row of SCHEDULE) {
  row.classes.forEach(([name, grade, band], dayIdx) => {
    const grades = band === 'afterschool' ? ['Grade 3–6', 'Grade 7–8'] : [grade];
    for (const g of grades) {
      const key = `${name}|${g}`;
      if (!courses.has(key)) courses.set(key, { name, grade: g, time: row.time, days: [] });
      courses.get(key).days.push(dayIdx);
    }
  });
}

// ---------- build class rows + dates ----------
const WEEKDAY_NUM = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function datesFor(dayIdxs) {
  const out = [];
  for (const i of dayIdxs) {
    const want = WEEKDAY_NUM[DAYS[i]];
    let d = START;
    while (new Date(d + 'T00:00:00Z').getUTCDay() !== want) d = addDays(d, 1);
    let count = 0;
    while (count < WEEKS) {
      if (!SKIP.has(d)) { out.push(d); count++; }
      d = addDays(d, 7);
    }
  }
  return out.sort();
}

const plan = [...courses.values()].map((c) => {
  const title = `${c.name} (${GRADE_TITLE[c.grade] || c.grade})`;
  const dayNames = c.days.length === DAYS.length ? 'Monday to Friday' : c.days.map((i) => DAYS[i] + 's').join(', ');
  const [startTime, endTime] = parseTimes(c.time);
  const price = PRICES[`${c.name}|${c.grade}`];
  const [ageMin, ageMax] = AGES[c.grade] || [8, 18];
  return {
    title,
    fields: {
      title,
      description: `In-person ${c.name} for ${GRADE_TITLE[c.grade] || c.grade} at our Pearl River learning center.`,
      subject: c.name,
      ageMin,
      ageMax,
      format: 'in-person',
      price: price ? price[1] : 0, // small group (up to 3), full 6-week program
      priceUnit: 'per 6 weeks',
      schedule: `${dayNames} ${c.time}`,
      capacity: 6,
    },
    startTime,
    endTime,
    dates: datesFor(c.days),
  };
});

// ---------- compare with the database ----------
const classes = readTable('classes');
const bookings = readTable('bookings');
const plannedTitles = new Set(plan.map((p) => p.title));
const oldClasses = keepOld ? [] : classes.filter((c) => !plannedTitles.has(c.title));
const blocked = oldClasses.filter((c) => bookings.some((b) => b.classId === c.id && b.status !== 'cancelled'));

console.log(`Course Schedule: ${plan.length} courses. Start ${START}, ${WEEKS} meetings per weekday, skipping ${[...SKIP].join(', ') || 'nothing'}.\n`);
for (const p of plan) {
  const exists = classes.find((c) => c.title === p.title);
  console.log(`${exists ? 'update' : 'create'}  ${p.title.padEnd(42)} ${p.fields.schedule.padEnd(36)} ${p.dates.length} dates (${p.dates[0]} → ${p.dates[p.dates.length - 1]})`);
}
if (oldClasses.length) {
  console.log(`\ndelete  ${oldClasses.length} old class(es) not in the Course Schedule:`);
  oldClasses.forEach((c) => console.log(`        #${c.id} ${c.title}${blocked.includes(c) ? '   <-- HAS ACTIVE BOOKINGS' : ''}`));
}
if (blocked.length && !force) {
  console.error('\nRefusing: the classes marked above still have active bookings. Cancel/move those bookings first, use --keep-old, or pass --force to delete anyway.');
  process.exit(1);
}
if (dryRun) { console.log('\nDry run: nothing changed.'); process.exit(0); }

// ---------- write ----------
const now = new Date().toISOString();
const classIdByTitle = new Map();

// 1. classes: update matches, add new ones, drop old ones
let nextClasses = classes.filter((c) => !oldClasses.includes(c));
for (const p of plan) {
  const i = nextClasses.findIndex((c) => c.title === p.title);
  if (i !== -1) {
    nextClasses[i] = { ...nextClasses[i], ...p.fields };
    classIdByTitle.set(p.title, nextClasses[i].id);
  } else {
    const row = { id: nextId('classes'), image: '', rating: null, createdAt: now, ...p.fields };
    nextClasses.push(row);
    classIdByTitle.set(p.title, row.id);
  }
}
writeTable('classes', nextClasses);

// 2. sessions: remove the old classes' dates (and their records), add new dates
const oldIds = new Set(oldClasses.map((c) => c.id));
const removedSessionIds = new Set(readTable('classSessions').filter((s) => oldIds.has(s.classId)).map((s) => s.id));
let sessions = readTable('classSessions').filter((s) => !oldIds.has(s.classId));
let added = 0;
for (const p of plan) {
  const classId = classIdByTitle.get(p.title);
  const have = new Set(sessions.filter((s) => s.classId === classId).map((s) => s.date + '|' + s.startTime));
  for (const date of p.dates) {
    if (have.has(date + '|' + p.startTime)) continue;
    sessions.push({ id: nextId('classSessions'), classId, date, startTime: p.startTime, endTime: p.endTime, topic: '', createdAt: now });
    added++;
  }
}
writeTable('classSessions', sessions);
if (removedSessionIds.size) {
  writeTable('sessionRecords', readTable('sessionRecords').filter((r) => !removedSessionIds.has(r.sessionId)));
}
if (oldIds.size && force) {
  // --force: also drop bookings that pointed at the deleted classes
  writeTable('bookings', readTable('bookings').filter((b) => !oldIds.has(b.classId)));
}

console.log(`\nDone: ${plan.length} courses in place, ${added} class dates added, ${oldClasses.length} old class(es) deleted.`);
