// routes/events.js — Workshop Events (calendar.html)
//
// Events themselves are still authored in a Google Sheet, read through the
// Apps Script Web App in events-backend.gs — that part is unchanged, and
// stays the easy no-code way to add/edit events. Only *registrations*
// moved here: they're stored in our own database (see the
// eventRegistrations table in db.js), linked to a real account, instead of
// landing as anonymous rows in the Sheet's Bookings tab. That's what lets
// a signed-in parent register more than one child for an event without
// creating a second account, and it's why "seats left" below is computed
// from our own database, not the Sheet's (which no longer hears about
// registrations at all).
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Same Apps Script Web App URL calendar.html used to call directly.
// Overridable via env var in case the deployment ever changes (see
// README "Workshop Events").
const EVENTS_API_URL = process.env.EVENTS_API_URL ||
  'https://script.google.com/macros/s/AKfycbzI3f5UfT_z5m8cRvhWHCrqT3V3tVd84S1NYeaZOUtaviq9qpktPi8o6GGSoFSEnUvs/exec';

// Fetches the published events list (id, name, cat, eventType, grades,
// date, start, end, capacity — plus a `booked` count from the Sheet's own
// Bookings tab, which we ignore and recompute below).
async function fetchSheetEvents() {
  const res = await fetch(EVENTS_API_URL);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to load events from the Sheet.');
  return data.events;
}

function registeredCount(eventId) {
  return readTable('eventRegistrations').filter(
    (r) => r.eventId === eventId && r.status !== 'cancelled'
  ).length;
}

// GET /api/events — public list, with live seat counts from OUR database.
router.get('/', async (req, res) => {
  try {
    const sheetEvents = await fetchSheetEvents();
    const events = sheetEvents.map((e) => ({ ...e, booked: registeredCount(e.id) }));
    res.json({ ok: true, events });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'Could not load the schedule right now.' });
  }
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
router.post('/:id/register', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const { studentId, studentName, studentGrade, studentAge } = req.body;
  const optIn = !!req.body.optIn;

  let sheetEvents;
  try {
    sheetEvents = await fetchSheetEvents();
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message || 'Could not reach the events schedule right now.' });
  }

  const event = sheetEvents.find((e) => e.id === eventId);
  if (!event) {
    // Treat an unknown/unpublished/expired occurrence id the same as "not
    // found" — mirrors events-backend.gs's own doPost behavior.
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
