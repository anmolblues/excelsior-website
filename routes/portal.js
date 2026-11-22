// routes/portal.js
//
// Parent Portal (public/portal.html) + the admin endpoints that feed it.
//
// Data model (see db.js):
//   classSessions  — dated meetings of a class, added by an admin
//   sessionRecords — one row per (session, student): attendance + report
//
// A student's schedule = every session of every class they have a
// non-cancelled booking in. Each session gets a status for the parent:
//   attended  — record says 'present'  (green check, report viewable)
//   absent    — record says 'absent'   (red X, no report)
//   upcoming  — no record yet          (circle, "class hasn't started yet")
//
// A past session with no record yet also shows as 'upcoming' to parents
// (attendance just hasn't been entered); the admin roster flags those.
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const TIMEZONE = 'America/New_York'; // the center's local time

// Today's date as YYYY-MM-DD in the center's timezone.
function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
}

function isValidTime(t) {
  return t === '' || (typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
}

// Bookings that belong to a student. Matches on studentId, and falls back
// to name + parent account for older bookings made before studentId existed
// (same rule routes/bookings.js uses for duplicate checks).
function bookingsForStudent(student, bookings) {
  return bookings.filter((b) =>
    b.status !== 'cancelled' &&
    b.userId === student.userId &&
    (b.studentId != null
      ? b.studentId === student.id
      : (b.studentName || '').trim().toLowerCase() === student.name.trim().toLowerCase())
  );
}

function sessionStatus(record) {
  if (!record) return 'upcoming';
  return record.attendance === 'present' ? 'attended' : 'absent';
}

// Loads a student and checks the logged-in parent owns them (admins may
// view any student, which is handy for previewing what a parent sees).
function loadOwnedStudent(req, res) {
  const id = parseInt(req.params.studentId, 10);
  const student = readTable('students').find((s) => s.id === id);
  if (!student || (student.userId !== req.user.id && req.user.role !== 'admin')) {
    res.status(404).json({ error: 'Student not found on your account.' });
    return null;
  }
  return student;
}

// Builds the full, date-sorted schedule for one student.
function buildSchedule(student) {
  const classes = readTable('classes');
  const myClassIds = new Set(bookingsForStudent(student, readTable('bookings')).map((b) => b.classId));
  const records = readTable('sessionRecords').filter((r) => r.studentId === student.id);
  const recordBySession = new Map(records.map((r) => [r.sessionId, r]));

  return readTable('classSessions')
    .filter((s) => myClassIds.has(s.classId))
    .map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      return {
        sessionId: s.id,
        classId: s.classId,
        classTitle: cls ? cls.title : 'Class',
        subject: cls ? cls.subject : '',
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        topic: s.topic,
        status: sessionStatus(recordBySession.get(s.id)),
      };
    })
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

// ======================= Parent endpoints =======================

// GET /api/portal/students — the logged-in parent's children, with counts
router.get('/students', requireAuth, (req, res) => {
  const students = readTable('students')
    .filter((s) => s.userId === req.user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const classes = readTable('classes');
  const bookings = readTable('bookings');

  const result = students.map((s) => {
    const schedule = buildSchedule(s);
    const classIds = [...new Set(bookingsForStudent(s, bookings).map((b) => b.classId))];
    return {
      id: s.id,
      name: s.name,
      grade: s.grade || '',
      classes: classIds.map((id) => (classes.find((c) => c.id === id) || {}).title).filter(Boolean),
      counts: {
        total: schedule.length,
        attended: schedule.filter((x) => x.status === 'attended').length,
        absent: schedule.filter((x) => x.status === 'absent').length,
        upcoming: schedule.filter((x) => x.status === 'upcoming').length,
      },
    };
  });
  res.json({ students: result });
});

// GET /api/portal/students/:studentId/schedule — every scheduled date
router.get('/students/:studentId/schedule', requireAuth, (req, res) => {
  const student = loadOwnedStudent(req, res);
  if (!student) return;
  res.json({
    student: { id: student.id, name: student.name, grade: student.grade || '' },
    today: todayLocal(),
    sessions: buildSchedule(student),
  });
});

// GET /api/portal/students/:studentId/sessions/:sessionId — one date's report
router.get('/students/:studentId/sessions/:sessionId', requireAuth, (req, res) => {
  const student = loadOwnedStudent(req, res);
  if (!student) return;

  const sessionId = parseInt(req.params.sessionId, 10);
  const entry = buildSchedule(student).find((s) => s.sessionId === sessionId);
  if (!entry) return res.status(404).json({ error: 'That class date was not found for this student.' });

  let report = null;
  if (entry.status === 'attended') {
    const r = readTable('sessionRecords').find((x) => x.sessionId === sessionId && x.studentId === student.id);
    report = {
      score: r.score,
      participation: r.participation,
      homework: r.homework,
      skills: r.skills,
      strengths: r.strengths,
      improve: r.improve,
      comments: r.comments,
      updatedAt: r.updatedAt,
    };
  }
  res.json({ student: { id: student.id, name: student.name }, session: entry, report });
});

// ======================= Admin endpoints =======================

// GET /api/portal/admin/sessions?classId=3 — sessions of a class, with
// how many records have been entered for each
router.get('/admin/sessions', requireAdmin, (req, res) => {
  const classId = parseInt(req.query.classId, 10);
  if (!classId) return res.status(400).json({ error: 'classId is required.' });
  const records = readTable('sessionRecords');
  const enrolled = readTable('bookings').filter((b) => b.classId === classId && b.status !== 'cancelled').length;
  const sessions = readTable('classSessions')
    .filter((s) => s.classId === classId)
    .map((s) => {
      const rs = records.filter((r) => r.sessionId === s.id);
      return {
        ...s,
        present: rs.filter((r) => r.attendance === 'present').length,
        absent: rs.filter((r) => r.attendance === 'absent').length,
        enrolled,
      };
    })
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  res.json({ today: todayLocal(), sessions });
});

// POST /api/portal/admin/sessions — add one or more dates to a class
// body: { classId, dates: ['2026-12-05', ...], startTime, endTime, topic }
router.post('/admin/sessions', requireAdmin, (req, res) => {
  const classId = parseInt(req.body.classId, 10);
  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  const startTime = (req.body.startTime || '').trim();
  const endTime = (req.body.endTime || '').trim();
  const topic = (req.body.topic || '').trim();

  if (!classId || !readTable('classes').find((c) => c.id === classId)) {
    return res.status(400).json({ error: 'Pick a valid class.' });
  }
  if (dates.length === 0 || dates.length > 100) {
    return res.status(400).json({ error: 'Provide between 1 and 100 dates.' });
  }
  if (!dates.every(isValidDate)) return res.status(400).json({ error: 'Dates must be YYYY-MM-DD.' });
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return res.status(400).json({ error: 'Times must be HH:MM.' });
  }

  const sessions = readTable('classSessions');
  const existing = new Set(sessions.filter((s) => s.classId === classId).map((s) => s.date + '|' + s.startTime));
  const created = [];
  for (const date of [...new Set(dates)]) {
    if (existing.has(date + '|' + startTime)) continue; // skip duplicates
    const s = { id: nextId('classSessions'), classId, date, startTime, endTime, topic, createdAt: new Date().toISOString() };
    sessions.push(s);
    created.push(s);
  }
  writeTable('classSessions', sessions);
  res.status(201).json({ created, skipped: dates.length - created.length });
});

// PUT /api/portal/admin/sessions/:id — edit a date/time/topic
router.put('/admin/sessions/:id', requireAdmin, (req, res) => {
  const sessions = readTable('classSessions');
  const idx = sessions.findIndex((s) => s.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Session not found.' });

  const s = sessions[idx];
  const date = req.body.date != null ? String(req.body.date).trim() : s.date;
  const startTime = req.body.startTime != null ? String(req.body.startTime).trim() : s.startTime;
  const endTime = req.body.endTime != null ? String(req.body.endTime).trim() : s.endTime;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
  if (!isValidTime(startTime) || !isValidTime(endTime)) return res.status(400).json({ error: 'Times must be HH:MM.' });

  sessions[idx] = { ...s, date, startTime, endTime, topic: req.body.topic != null ? String(req.body.topic).trim() : s.topic };
  writeTable('classSessions', sessions);
  res.json({ session: sessions[idx] });
});

// DELETE /api/portal/admin/sessions/:id — remove a date (and its records)
router.delete('/admin/sessions/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const sessions = readTable('classSessions');
  if (!sessions.find((s) => s.id === id)) return res.status(404).json({ error: 'Session not found.' });
  writeTable('classSessions', sessions.filter((s) => s.id !== id));
  writeTable('sessionRecords', readTable('sessionRecords').filter((r) => r.sessionId !== id));
  res.json({ ok: true });
});

// GET /api/portal/admin/sessions/:id/roster — enrolled students + records
router.get('/admin/sessions/:id/roster', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const session = readTable('classSessions').find((s) => s.id === id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const students = readTable('students');
  const records = readTable('sessionRecords').filter((r) => r.sessionId === id);
  const bookings = readTable('bookings').filter((b) => b.classId === session.classId && b.status !== 'cancelled');

  // Resolve each booking to a saved student (needed so reports link to the
  // child the parent sees in the portal). Older bookings without studentId
  // are matched by name on the same parent account.
  const roster = [];
  const seen = new Set();
  for (const b of bookings) {
    const st = b.studentId != null
      ? students.find((s) => s.id === b.studentId)
      : students.find((s) => s.userId === b.userId && s.name.trim().toLowerCase() === (b.studentName || '').trim().toLowerCase());
    if (!st) {
      roster.push({ studentId: null, name: b.studentName, unlinked: true, record: null });
      continue;
    }
    if (seen.has(st.id)) continue;
    seen.add(st.id);
    roster.push({ studentId: st.id, name: st.name, grade: st.grade || '', record: records.find((r) => r.studentId === st.id) || null });
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));
  const cls = readTable('classes').find((c) => c.id === session.classId);
  res.json({ session: { ...session, classTitle: cls ? cls.title : '' }, roster });
});

// POST /api/portal/admin/enroll — admin enrolls a saved student in a class
// (for sign-ups taken in person). Creates a normal booking on the parent's
// account, so it also shows up in the parent's "My Bookings".
// body: { classId, studentId }
router.post('/admin/enroll', requireAdmin, (req, res) => {
  const classId = parseInt(req.body.classId, 10);
  const studentId = parseInt(req.body.studentId, 10);
  const cls = readTable('classes').find((c) => c.id === classId);
  const student = readTable('students').find((s) => s.id === studentId);
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const bookings = readTable('bookings');
  if (bookingsForStudent(student, bookings).some((b) => b.classId === classId)) {
    return res.status(409).json({ error: `${student.name} is already enrolled in this class.` });
  }
  const active = bookings.filter((b) => b.classId === classId && b.status !== 'cancelled');
  if (active.length >= cls.capacity) {
    return res.status(409).json({ error: 'This class is full.' });
  }

  const booking = {
    id: nextId('bookings'),
    classId,
    userId: student.userId,
    studentName: student.name,
    studentAge: student.age,
    notes: 'Enrolled by admin',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    studentId: student.id,
    studentGrade: student.grade || null,
  };
  bookings.push(booking);
  writeTable('bookings', bookings);
  res.status(201).json({ booking });
});

function cleanInt(v, min, max) {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  if (Number.isNaN(n) || n < min || n > max) return undefined; // invalid
  return n;
}

// PUT /api/portal/admin/sessions/:id/records — save attendance + reports
// body: { records: [{ studentId, attendance: 'present'|'absent'|'', score,
//   participation, homework, skills, strengths, improve, comments }] }
// attendance '' clears that student's record (back to "not started").
router.put('/admin/sessions/:id/records', requireAdmin, (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const session = readTable('classSessions').find((s) => s.id === sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const input = Array.isArray(req.body.records) ? req.body.records : null;
  if (!input) return res.status(400).json({ error: 'records must be an array.' });

  const studentIds = new Set(readTable('students').map((s) => s.id));
  const HOMEWORK = ['', 'complete', 'partial', 'missing', 'none'];
  let records = readTable('sessionRecords');
  const now = new Date().toISOString();

  for (const r of input) {
    const studentId = parseInt(r.studentId, 10);
    if (!studentIds.has(studentId)) return res.status(400).json({ error: `Unknown student ${r.studentId}.` });
    const attendance = (r.attendance || '').trim();
    if (!['', 'present', 'absent'].includes(attendance)) {
      return res.status(400).json({ error: 'attendance must be present, absent, or blank.' });
    }

    const idx = records.findIndex((x) => x.sessionId === sessionId && x.studentId === studentId);
    if (attendance === '') {
      if (idx !== -1) records.splice(idx, 1);
      continue;
    }

    const score = cleanInt(r.score, 0, 100);
    const participation = cleanInt(r.participation, 1, 5);
    if (score === undefined) return res.status(400).json({ error: 'Score must be 0–100.' });
    if (participation === undefined) return res.status(400).json({ error: 'Participation must be 1–5.' });
    const homework = (r.homework || '').trim();
    if (!HOMEWORK.includes(homework)) return res.status(400).json({ error: 'Invalid homework value.' });

    const row = {
      sessionId,
      studentId,
      attendance,
      score,
      participation,
      homework,
      skills: String(r.skills || '').trim().slice(0, 2000),
      strengths: String(r.strengths || '').trim().slice(0, 2000),
      improve: String(r.improve || '').trim().slice(0, 2000),
      comments: String(r.comments || '').trim().slice(0, 4000),
      updatedAt: now,
    };
    if (idx === -1) records.push({ id: nextId('sessionRecords'), createdAt: now, ...row });
    else records[idx] = { ...records[idx], ...row };
  }

  writeTable('sessionRecords', records);
  res.json({ ok: true });
});

module.exports = router;
