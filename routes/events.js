// routes/events.js — Workshop Events (calendar.html)
//
// Events themselves are still authored in a Google Sheet, read through the
// Apps Script Web App in events-backend.gs — that part is unchanged, and
// stays the easy no-code way to add/edit events. Only *registrations*
// moved here: they're stored in our own database (see the
// eventRegistrations table in db.js), linked to a real account, instead of
// landing as anonymous rows in the Sheet's Bookings tab. That's what lets
// a signed-in user register for a second event without retyping their
// name/phone/address, and it's why "seats left" below is computed from our
// own database, not the Sheet's (which no longer hears about registrations
// at all).
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
// account, and — if the submitted phone/address are new or different —
// saves them to the account too, so the *next* registration (for this
// event or any other) can pre-fill without retyping.
router.post('/:id/register', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  const address = (req.body.address || '').trim();
  const optIn = !!req.body.optIn;

  if (!name || !phone || !address) {
    return res.status(400).json({ ok: false, error: 'Name, phone, and address are all required.' });
  }

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

  const registrations = readTable('eventRegistrations');

  const duplicate = registrations.find(
    (r) => r.eventId === eventId && r.userId === req.user.id && r.status !== 'cancelled'
  );
  if (duplicate) {
    return res.status(409).json({ ok: false, error: 'You’re already registered for this session.' });
  }

  const bookedCount = registrations.filter((r) => r.eventId === eventId && r.status !== 'cancelled').length;
  const status = bookedCount < event.capacity ? 'Confirmed' : 'Waitlist';

  const registration = {
    id: nextId('eventRegistrations'),
    userId: req.user.id,
    eventId,
    eventName: event.name,
    eventDate: event.date,
    name,
    phone,
    address,
    optIn: optIn ? 1 : 0,
    status: status.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  registrations.push(registration);
  writeTable('eventRegistrations', registrations);

  // Keep the account's saved info current so a future registration (or a
  // class booking) can reuse it without retyping.
  const users = readTable('users');
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx !== -1) {
    const u = users[idx];
    if (u.phone !== phone || u.address !== address || (name && u.name !== name)) {
      users[idx] = { ...u, name: name || u.name, phone, address };
      writeTable('users', users);
    }
  }

  const seatsLeft = Math.max(0, event.capacity - bookedCount - (status === 'Confirmed' ? 1 : 0));
  res.status(201).json({ ok: true, status, seatsLeft, capacity: event.capacity });
});

module.exports = router;
