// import-courses.js — turns the Course Schedule on the home page
// (public/schedule.js) into real classes in the database, so students can
// be enrolled in them (admin > Students > Enroll).
//
//   node import-courses.js --dry-run              # show what would happen
//   node import-courses.js                        # do it
//
// Options:
//   --keep-old           don't delete classes that aren't in the schedule
//   --force              delete old classes even if they have active bookings
//
// What it does:
//   1. One class per course + grade group, exactly like the course tiles on
//      the home page (After-school Homework Help becomes two: Grades 3–6 and
//      Grades 7–8). Title example: "Math (Grades 3–6)". Each class's schedule
//      text (e.g. "Tuesdays 4:30 – 5:30 PM") is what enrollment uses to
//      create a student's class dates.
//   2. It does NOT create class dates. Dates are created automatically when a
//      student is enrolled with a number of sessions, or added in Class Dates.
//   3. Safe to re-run: a class that already exists (same title) is updated,
//      not duplicated.
//   4. Deletes every other class (the old demo classes) along with its class
//      dates and attendance/report records. It refuses if any of those old
//      classes has an active booking, unless you pass --force.
//
// Run it wherever the database lives: on your Mac for the local copy, and
// on the EC2 server for the live site (the site reads the database on every
// request, so no restart is needed).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readTable, writeTable, nextId } = require('./db');

// ---------- options ----------
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const keepOld = args.includes('--keep-old');
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

// ---------- build class rows ----------
const plan = [...courses.values()].map((c) => {
  const title = `${c.name} (${GRADE_TITLE[c.grade] || c.grade})`;
  const dayNames = c.days.length === DAYS.length ? 'Monday to Friday' : c.days.map((i) => DAYS[i] + 's').join(', ');
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
  };
});

// ---------- compare with the database ----------
const classes = readTable('classes');
const bookings = readTable('bookings');
const plannedTitles = new Set(plan.map((p) => p.title));
const oldClasses = keepOld ? [] : classes.filter((c) => !plannedTitles.has(c.title));
const blocked = oldClasses.filter((c) => bookings.some((b) => b.classId === c.id && b.status !== 'cancelled'));

console.log(`Course Schedule: ${plan.length} courses (no class dates are created).\n`);
for (const p of plan) {
  const exists = classes.find((c) => c.title === p.title);
  console.log(`${exists ? 'update' : 'create'}  ${p.title.padEnd(42)} ${p.fields.schedule}`);
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

// 1. classes: update matches, add new ones, drop old ones
let nextClasses = classes.filter((c) => !oldClasses.includes(c));
for (const p of plan) {
  const i = nextClasses.findIndex((c) => c.title === p.title);
  if (i !== -1) {
    nextClasses[i] = { ...nextClasses[i], ...p.fields };
  } else {
    const row = { id: nextId('classes'), image: '', rating: null, createdAt: now, ...p.fields };
    nextClasses.push(row);
  }
}
writeTable('classes', nextClasses);

// 2. remove the old classes' dates (and their attendance/report records)
const oldIds = new Set(oldClasses.map((c) => c.id));
const removedSessionIds = new Set(readTable('classSessions').filter((s) => oldIds.has(s.classId)).map((s) => s.id));
if (removedSessionIds.size) {
  writeTable('classSessions', readTable('classSessions').filter((s) => !removedSessionIds.has(s.id)));
  writeTable('sessionRecords', readTable('sessionRecords').filter((r) => !removedSessionIds.has(r.sessionId)));
}
if (oldIds.size && force) {
  // --force: also drop bookings that pointed at the deleted classes
  writeTable('bookings', readTable('bookings').filter((b) => !oldIds.has(b.classId)));
}

console.log(`\nDone: ${plan.length} courses in place, ${oldClasses.length} old class(es) deleted. No class dates were created.`);
