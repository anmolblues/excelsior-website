// routes/leads.js
//
// Lead capture for the free-assessment landing page (public/assessment.html).
// Parents don't need an account: the form POSTs here, the lead is saved to
// the `leads` table (see db.js), and two emails go out — an alert to the
// center and a thank-you to the parent. Admins work the leads from the
// "Leads" section of admin.html.
//
// Uses SQL directly (db._db) rather than readTable/writeTable, because those
// rewrite the whole table on every change — fine for classes, wasteful for a
// table that grows with every form submission.
const express = require('express');
const { _db: db } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../mailer');

const router = express.Router();

// Where new-lead alerts go. Set LEAD_NOTIFY_EMAIL in ecosystem.config.js to
// change it (comma-separate several addresses).
const LEAD_NOTIFY_EMAIL = process.env.LEAD_NOTIFY_EMAIL || 'contact@eepcenter.com';

const STATUSES = ['New', 'Contacted', 'Assessed', 'Enrolled', 'Lost'];

const GRADES = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const INTERESTS = ['Math', 'Reading & Writing', 'Test Prep (SAT/PSAT/ACT)', 'Coding & STEM', 'Public Speaking & Debate', 'Not sure yet'];

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Simple in-memory rate limit: at most 5 submissions per IP per 10 minutes.
// Resets when the app restarts, which is fine for a spam speed bump.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const recentByIp = new Map();

function clientIp(req) {
  // Behind Nginx, the real client is the first X-Forwarded-For entry.
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recentByIp.set(ip, hits);
  if (recentByIp.size > 5000) recentByIp.clear(); // keep memory bounded
  return hits.length > RATE_MAX;
}

// POST /api/leads — public: submit the free-assessment form
router.post('/', (req, res) => {
  const body = req.body || {};

  // Honeypot: a hidden "website" field real people never fill in. Pretend
  // success so bots don't learn to skip it.
  if (clean(body.website, 200)) {
    return res.status(201).json({ ok: true });
  }

  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes, or call us.' });
  }

  const parentName = clean(body.parentName, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 30);
  const studentGrade = clean(body.studentGrade, 10);
  const message = clean(body.message, 1000);
  const interestsIn = Array.isArray(body.interests) ? body.interests : [];
  const interests = interestsIn.map((i) => clean(i, 60)).filter((i) => INTERESTS.includes(i));

  if (!parentName) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!GRADES.includes(studentGrade)) return res.status(400).json({ error: "Please choose your child's grade." });

  const now = new Date().toISOString();
  const lead = {
    parentName,
    email,
    phone,
    studentGrade,
    interests: interests.join(', '),
    message,
    utmSource: clean(body.utmSource, 100),
    utmMedium: clean(body.utmMedium, 100),
    utmCampaign: clean(body.utmCampaign, 100),
    qrCode: clean(body.qrCode, 60),
    createdAt: now,
    updatedAt: now,
  };

  const info = db
    .prepare(
      `INSERT INTO leads (parentName, email, phone, studentGrade, interests, message, utmSource, utmMedium, utmCampaign, qrCode, status, adminNotes, createdAt, updatedAt)
       VALUES (@parentName, @email, @phone, @studentGrade, @interests, @message, @utmSource, @utmMedium, @utmCampaign, @qrCode, 'New', '', @createdAt, @updatedAt)`
    )
    .run(lead);

  // Emails are fire-and-forget (sendMail never throws), so a mail problem
  // can't lose the lead — it's already saved above.
  const source = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ') || 'direct';
  sendMail({
    to: LEAD_NOTIFY_EMAIL,
    subject: `New assessment request: ${parentName} (Grade ${studentGrade})`,
    text:
      `New free-assessment request #${info.lastInsertRowid}\n\n` +
      `Parent: ${parentName}\nEmail: ${email}\nPhone: ${phone}\nGrade: ${studentGrade}\n` +
      `Interests: ${lead.interests || '—'}\nMessage: ${message || '—'}\n` +
      `Source: ${source}${lead.qrCode ? ` (QR: ${lead.qrCode})` : ''}\n\n` +
      `Manage leads: https://excelsiorenrichmentprogram.com/admin.html#leads`,
    html: `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;color:#1f2937;">
        <h2 style="color:#2047bb;margin-bottom:8px;">New free-assessment request</h2>
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Parent</td><td>${escapeHtml(parentName)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Phone</td><td><a href="tel:${escapeHtml(phoneDigits)}">${escapeHtml(phone)}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Grade</td><td>${escapeHtml(studentGrade)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Interests</td><td>${escapeHtml(lead.interests || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;">Message</td><td>${escapeHtml(message || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Source</td><td>${escapeHtml(source)}${lead.qrCode ? ` (QR: ${escapeHtml(lead.qrCode)})` : ''}</td></tr>
        </table>
        <p style="margin-top:20px;"><a href="https://excelsiorenrichmentprogram.com/admin.html#leads" style="color:#2047bb;">Open the Leads list</a></p>
      </div>`,
  });

  sendMail({
    to: email,
    subject: 'We got your free assessment request — Excelsior Enrichment Program',
    text:
      `Hi ${parentName},\n\n` +
      `Thanks for requesting a free academic assessment for your Grade ${studentGrade} student. ` +
      `Someone from our team will reach out within one business day to find a time that works.\n\n` +
      `Questions in the meantime? Call or text +1 (201) 908-7279 or reply to contact@eepcenter.com.\n\n` +
      `— Excelsior Enrichment Program`,
    html: `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2937;">
        <h2 style="color:#2047bb;margin-bottom:4px;">Thanks, ${escapeHtml(parentName)}!</h2>
        <p>We received your request for a <strong>free academic assessment</strong> for your Grade ${escapeHtml(studentGrade)} student.</p>
        <p>Someone from our team will reach out within one business day to find a time that works for you.</p>
        <p>Questions in the meantime? Call or text <a href="tel:+12019087279" style="color:#2047bb;">+1 (201) 908-7279</a>
           or email <a href="mailto:contact@eepcenter.com" style="color:#2047bb;">contact@eepcenter.com</a>.</p>
        <p style="color:#6b7280;">— Excelsior Enrichment Program</p>
      </div>`,
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// GET /api/leads — admin: every lead, newest first
router.get('/', requireAdmin, (req, res) => {
  const leads = db.prepare('SELECT * FROM leads ORDER BY createdAt DESC, id DESC').all();
  res.json({ leads, statuses: STATUSES });
});

// GET /api/leads/export.csv — admin: download all leads for a spreadsheet
router.get('/export.csv', requireAdmin, (req, res) => {
  const cols = ['id', 'createdAt', 'status', 'parentName', 'email', 'phone', 'studentGrade', 'interests', 'message', 'utmSource', 'utmMedium', 'utmCampaign', 'qrCode', 'adminNotes'];
  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = db.prepare('SELECT * FROM leads ORDER BY createdAt DESC, id DESC').all();
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="eep-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// PATCH /api/leads/:id — admin: update status and/or notes
router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const status = req.body.status !== undefined ? clean(req.body.status, 20) : lead.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const adminNotes = req.body.adminNotes !== undefined ? clean(req.body.adminNotes, 2000) : lead.adminNotes;

  db.prepare('UPDATE leads SET status = ?, adminNotes = ?, updatedAt = ? WHERE id = ?').run(status, adminNotes, new Date().toISOString(), id);
  res.json({ lead: db.prepare('SELECT * FROM leads WHERE id = ?').get(id) });
});

module.exports = router;
module.exports.INTERESTS = INTERESTS;
