// routes/events.js — Workshop Events (calendar.html)
//
// Events live in our own database (the `events` table, see db.js) and are
// managed from the admin page (/admin.html → "Workshop Events"). They used
// to be authored in a Google Sheet read through an Apps Script Web App,
// which made the calendar slow to load; the columns are the same as that
// Sheet's "Events" tab (Status, Event ID, Name, Category, Event Type,
// Grades, Date, Recurrence, Recurrence Ends, Skip Dates, Start/End Time,
// Capacity) so nothing about how you think of an event changed.
//
// Registrations are stored in the eventRegistrations table, linked to a
// real account, and "seats left" is computed from that table.
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------- Allowed values (same lists the Sheet used) ----------

const STATUSES = ['Draft', 'Published'];
const CATEGORIES = ['Test Prep', 'Enrichment', 'Workshop', 'Info Session'];
const CATEGORY_IDS = { 'test prep': 'testprep', enrichment: 'enrichment', workshop: 'workshop', 'info session': 'info' };
const EVENT_TYPES = ['Online', 'In-person', 'Hybrid'];
const RECURRENCES = ['None', 'Weekly', 'Every 2 Weeks', 'Monthly'];
const GRADE_RANGES = ['3-4', '5-6', '7-8', '9-10', '11-12'];

// A recurring series only ever expands this many days ahead of today, no
// matter how far off its "Recurrence Ends" date is (same as the Sheet's
// MAX_HORIZON_DAYS) — new dates appear on their own as they come into range.
const MAX_HORIZON_DAYS = 90;
const BUSINESS_TZ = 'America/New_York';

// ---------- Date / time helpers (pure yyyy-mm-dd string math, UTC) ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s) {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUtc(dt) {
  return dt.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const dt = toUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fmtUtc(dt);
}

// Date.UTC rolls an out-of-range day into the next month (Jan 31 + 1 month
// => Mar 3), which is the "closest valid day just after" rule documented
// for Monthly recurrence.
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  return fmtUtc(new Date(Date.UTC(y, m - 1 + months, d)));
}

function todayInBusinessTz() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Accepts "HH:MM" (what <input type="time"> sends) or "h:mm AM/PM" and
// returns the display form the calendar shows, e.g. "9:00 AM". Returns
// null if it can't be understood; '' for blank.
function normalizeTime(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  let h, min;
  if (m) {
    h = Number(m[1]); min = Number(m[2]);
    if (h > 23 || min > 59) return null;
  } else {
    m = /^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/.exec(s);
    if (!m) return null;
    h = Number(m[1]); min = Number(m[2]);
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m[3].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${suffix}`;
}

function normalizeRecurrence(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'weekly') return 'weekly';
  if (key === 'every 2 weeks' || key === 'biweekly' || key === 'every-2-weeks') return 'every2weeks';
  if (key === 'monthly') return 'monthly';
  return 'none';
}

function parseSkipDates(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function generateOccurrenceDates(startDate, recur, recurrenceEnds, horizonCap) {
  const cap = recurrenceEnds && recurrenceEnds < horizonCap ? recurrenceEnds : horizonCap;
  const dates = [];
  if (recur === 'none') {
    if (startDate <= cap) dates.push(startDate);
    return dates;
  }
  for (let n = 0; n < 500; n++) {
    let occ;
    if (recur === 'weekly') occ = addDays(startDate, n * 7);
    else if (recur === 'every2weeks') occ = addDays(startDate, n * 14);
    else occ = addMonths(startDate, n);
    if (occ > cap) break;
    dates.push(occ);
  }
  return dates;
}

// Expands every Published event row into bookable, dated occurrences —
// the same objects the Apps Script used to return: {id, name, cat,
// eventType, grades[], date, start, end, capacity}. A recurring
// occurrence gets its own bookable id (slug@date) so each date has its
// own seats; a one-time event keeps its plain slug.
function getOccurrences() {
  const horizonCap = addDays(todayInBusinessTz(), MAX_HORIZON_DAYS);
  const out = [];
  readTable('events')
    .filter((row) => row.status === 'Published')
    .forEach((row) => {
      const recur = normalizeRecurrence(row.recurrence);
      const skip = parseSkipDates(row.skipDates);
      const grades = String(row.grades || '').split(',').map((g) => g.trim()).filter(Boolean);
      generateOccurrenceDates(row.date, recur, row.recurrenceEnds, horizonCap)
        .filter((d) => skip.indexOf(d) === -1)
        .forEach((d) => {
          out.push({
            id: recur === 'none' ? row.slug : `${row.slug}@${d}`,
            name: row.name,
            cat: CATEGORY_IDS[String(row.category).trim().toLowerCase()] || String(row.category).trim().toLowerCase().replace(/\s+/g, ''),
            eventType: String(row.eventType).trim().toLowerCase(),
            grades,
            date: d,
            start: row.startTime,
            end: row.endTime,
            capacity: Number(row.capacity),
          });
        });
    });
  out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return out;
}

// One pass over the registrations table => {eventId: activeCount}.
function registeredCounts() {
  const counts = new Map();
  readTable('eventRegistrations').forEach((r) => {
    if (r.status === 'cancelled') return;
    counts.set(r.eventId, (counts.get(r.eventId) || 0) + 1);
  });
  return counts;
}

// GET /api/events — public list, with live seat counts from OUR database.
router.get('/', (req, res) => {
  try {
    const counts = registeredCounts();
    const events = getOccurrences().map((e) => ({ ...e, booked: counts.get(e.id) || 0 }));
    res.json({ ok: true, events });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Could not load the schedule right now.' });
  }
});

// ---------- Admin: manage events (add / update / delete) ----------

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// Validates + normalizes an add/update payload. Returns {error} or {value}.
function parseEventInput(body) {
  const b = body || {};
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Event name is required.' };

  const status = STATUSES.find((s) => s.toLowerCase() === String(b.status || 'Draft').trim().toLowerCase());
  if (!status) return { error: 'Status must be Draft or Published.' };

  const category = CATEGORIES.find((c) => c.toLowerCase() === String(b.category || '').trim().toLowerCase());
  if (!category) return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` };

  const eventType = EVENT_TYPES.find((t) => t.toLowerCase() === String(b.eventType || '').trim().toLowerCase());
  if (!eventType) return { error: `Event type must be one of: ${EVENT_TYPES.join(', ')}.` };

  const gradeList = Array.isArray(b.grades) ? b.grades : String(b.grades || '').split(',');
  const grades = gradeList.map((g) => String(g).trim()).filter(Boolean);
  if (!grades.length) return { error: 'Pick at least one grade range.' };
  const badGrade = grades.find((g) => !GRADE_RANGES.includes(g));
  if (badGrade) return { error: `Unknown grade range "${badGrade}". Use: ${GRADE_RANGES.join(', ')}.` };

  const date = String(b.date || '').trim();
  if (!isValidIsoDate(date)) return { error: 'Date must be a valid yyyy-mm-dd date.' };

  const recurrence = RECURRENCES.find((r) => r.toLowerCase() === String(b.recurrence || 'None').trim().toLowerCase());
  if (!recurrence) return { error: `Recurrence must be one of: ${RECURRENCES.join(', ')}.` };

  let recurrenceEnds = '';
  let skipDates = '';
  if (recurrence !== 'None') {
    recurrenceEnds = String(b.recurrenceEnds || '').trim();
    if (!isValidIsoDate(recurrenceEnds)) return { error: 'A recurring event needs a valid "Recurrence ends" date.' };
    if (recurrenceEnds < date) return { error: '"Recurrence ends" can’t be before the first date.' };
    const skips = parseSkipDates(b.skipDates);
    const badSkip = skips.find((s) => !isValidIsoDate(s));
    if (badSkip) return { error: `Skip date "${badSkip}" isn’t a valid yyyy-mm-dd date.` };
    skipDates = skips.join(',');
  }

  const startTime = normalizeTime(b.startTime);
  const endTime = normalizeTime(b.endTime);
  if (startTime === null || endTime === null) return { error: 'Start/end time must look like 9:00 AM.' };
  if (!startTime || !endTime) return { error: 'Start time and end time are required.' };

  const capacity = parseInt(b.capacity, 10);
  if (!Number.isInteger(capacity) || capacity < 1) return { error: 'Capacity must be a whole number of at least 1.' };

  return {
    value: { name, status, category, eventType, grades: grades.join(','), date, recurrence, recurrenceEnds, skipDates, startTime, endTime, capacity },
  };
}

// How many (non-cancelled) registrations point at this event row, across
// all of its occurrences.
function registrationCountFor(slug, regs) {
  return regs.filter((r) => r.status !== 'cancelled' && (r.eventId === slug || r.eventId.startsWith(slug + '@'))).length;
}

// GET /api/events/admin — every event row (Draft + Published), for the admin page
router.get('/admin', requireAdmin, (req, res) => {
  const regs = readTable('eventRegistrations');
  const events = readTable('events')
    .map((e) => ({ ...e, grades: e.grades ? e.grades.split(',') : [], registrations: registrationCountFor(e.slug, regs) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json({ events });
});

// POST /api/events/admin — add an event
router.post('/admin', requireAdmin, (req, res) => {
  const parsed = parseEventInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const events = readTable('events');
  let slug = String((req.body && req.body.slug) || '').trim();
  if (slug) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) {
      return res.status(400).json({ error: 'Event ID can only use letters, numbers, dashes and underscores.' });
    }
  } else {
    const base = slugify(`${parsed.value.name}-${parsed.value.date}`) || 'event';
    slug = base;
    for (let n = 2; events.some((e) => e.slug.toLowerCase() === slug.toLowerCase()); n++) slug = `${base}-${n}`;
  }
  if (events.some((e) => e.slug.toLowerCase() === slug.toLowerCase())) {
    return res.status(409).json({ error: `Event ID "${slug}" is already used by another event.` });
  }

  const event = { id: nextId('events'), slug, ...parsed.value, createdAt: new Date().toISOString() };
  events.push(event);
  writeTable('events', events);
  res.status(201).json({ ok: true, event });
});

// PUT /api/events/admin/:id — update an event. The Event ID (slug) is
// deliberately not editable: registrations point at it.
router.put('/admin/:id', requireAdmin, (req, res) => {
  const events = readTable('events');
  const idx = events.findIndex((e) => e.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Event not found.' });

  const parsed = parseEventInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  events[idx] = { ...events[idx], ...parsed.value };
  writeTable('events', events);
  res.json({ ok: true, event: events[idx] });
});

// DELETE /api/events/admin/:id — delete an event (past registrations keep
// their saved event name/date; to just hide an event, set it to Draft).
router.delete('/admin/:id', requireAdmin, (req, res) => {
  const events = readTable('events');
  const idx = events.findIndex((e) => e.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Event not found.' });
  events.splice(idx, 1);
  writeTable('events', events);
  res.json({ ok: true });
});

// GET /api/events/my-registrations — the current user's own registrations
router.get('/my-registrations', requireAuth, (req, res) => {
  const registrations = readTable('eventRegistrations')
    .filter((r) => r.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ registrations });
});

// GET /api/events/registrations — admin view of every registration
router.get('/registrations', requireAdmin, (req, res) => {
  const registrations = readTable('eventRegistrations');
  const users = readTable('users');
  const enriched = registrations
    .map((r) => ({
      ...r,
      parent: (() => {
        const u = users.find((u) => u.id === r.userId);
        return u ? { id: u.id, name: u.name, email: u.email } : null;
      })(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ registrations: enriched });
});

// DELETE /api/events/registrations/:id — cancel a registration (owner or admin)
router.delete('/registrations/:id', requireAuth, (req, res) => {
  const registrations = readTable('eventRegistrations');
  const idx = registrations.findIndex((r) => r.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Registration not found.' });

  const registration = registrations[idx];
  if (registration.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only cancel your own registrations.' });
  }

  registration.status = 'cancelled';
  registrations[idx] = registration;
  writeTable('eventRegistrations', registrations);
  res.json({ ok: true });
});

// POST /api/events/:id/register — must be logged in (see middleware/auth.js
// requireAuth). Saves the registration to our database tied to the
// account. Accepts either an existing studentId (a previously-saved
// student, picked from the "My Students" list) or studentName/studentGrade
// to register a new one — which is auto-saved to the students table (see
// db.js) so it's pickable next time. Either way a grade is required: even
// a saved student whose profile doesn't have one yet (e.g. one first
// created through class enrollment, which never asks for grade) needs one
// supplied here, and that grade (and age, if given) is written back onto
// the student's saved profile so it stays current.
router.post('/:id/register', requireAuth, (req, res) => {
  const eventId = req.params.id;
  const { studentId, studentName, studentGrade, studentAge } = req.body;
  const optIn = !!req.body.optIn;

  const event = getOccurrences().find((e) => e.id === eventId);
  if (!event) {
    // Treat an unknown/Draft/skipped/expired occurrence id the same as
    // "not found" — don't let someone book a made-up date.
    return res.status(404).json({ ok: false, error: 'Event not found.' });
  }

  const students = readTable('students');
  let student;
  let studentsChanged = false;
  const trimmedGrade = (studentGrade || '').trim();
  let ageNum = null;
  if (studentAge != null && studentAge !== '') {
    ageNum = Number(studentAge);
    if (Number.isNaN(ageNum)) {
      return res.status(400).json({ ok: false, error: "Student's age must be a number." });
    }
  }

  if (studentId) {
    const idx = students.findIndex((s) => s.id === parseInt(studentId, 10) && s.userId === req.user.id);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'That student was not found on your account.' });
    }
    student = students[idx];
    const updates = {};
    if (trimmedGrade && trimmedGrade !== student.grade) updates.grade = trimmedGrade;
    if (ageNum != null && ageNum !== student.age) updates.age = ageNum;
    if (Object.keys(updates).length) {
      student = { ...student, ...updates };
      students[idx] = student;
      studentsChanged = true;
    }
    if (!student.grade) {
      return res.status(400).json({ ok: false, error: "This student needs a grade — please select one." });
    }
  } else {
    const trimmedName = (studentName || '').trim();
    if (!trimmedName || !trimmedGrade) {
      return res.status(400).json({ ok: false, error: 'Student name and grade are required.' });
    }
    student = {
      id: nextId('students'),
      userId: req.user.id,
      name: trimmedName,
      grade: trimmedGrade,
      age: ageNum,
      notes: '',
      createdAt: new Date().toISOString(),
    };
    students.push(student);
    studentsChanged = true;
  }

  if (studentsChanged) writeTable('students', students);

  const registrations = readTable('eventRegistrations');

  // Avoid the same parent double-registering the same child for the same
  // event — but let one parent register multiple different children for
  // it. Prefers matching by studentId, falling back to a name match for
  // legacy registrations made before studentId existed.
  const duplicate = registrations.find(
    (r) =>
      r.eventId === eventId &&
      r.userId === req.user.id &&
      r.status !== 'cancelled' &&
      (r.studentId != null ? r.studentId === student.id : r.studentName.toLowerCase() === student.name.toLowerCase())
  );
  if (duplicate) {
    return res.status(409).json({ ok: false, error: `${student.name} is already registered for this session.` });
  }

  const bookedCount = registrations.filter((r) => r.eventId === eventId && r.status !== 'cancelled').length;
  const status = bookedCount < event.capacity ? 'Confirmed' : 'Waitlist';

  const registration = {
    id: nextId('eventRegistrations'),
    userId: req.user.id,
    eventId,
    eventName: event.name,
    eventDate: event.date,
    studentId: student.id,
    studentName: student.name,
    studentGrade: student.grade,
    studentAge: student.age,
    optIn: optIn ? 1 : 0,
    status: status.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  registrations.push(registration);
  writeTable('eventRegistrations', registrations);

  const seatsLeft = Math.max(0, event.capacity - bookedCount - (status === 'Confirmed' ? 1 : 0));
  res.status(201).json({ ok: true, status, seatsLeft, capacity: event.capacity });
});

module.exports = router;
