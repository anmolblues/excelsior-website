// routes/messages.js
//
// "Quick message" form in the Contact Us section of the home page
// (public/contact-form.js). Visitors don't need an account. The message is
// saved to the `messages` table (db.js) and emailed to the center; the
// visitor's address is set as Reply-To so the team can answer straight from
// their inbox. No automatic reply is sent to the visitor, so the form can't be
// used to make us email strangers.
const express = require('express');
const { _db: db } = require('../db');
const { sendMail } = require('../mailer');

const router = express.Router();

// Same recipient as new-lead alerts (override with LEAD_NOTIFY_EMAIL).
const NOTIFY_EMAIL = process.env.LEAD_NOTIFY_EMAIL || 'contact@eepcenter.com';

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

// In-memory rate limit: at most 3 messages per IP per 10 minutes.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;
const recentByIp = new Map();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recentByIp.set(ip, hits);
  if (recentByIp.size > 5000) recentByIp.clear();
  return hits.length > RATE_MAX;
}

// POST /api/messages — public
router.post('/', (req, res) => {
  const body = req.body || {};

  // Honeypot: hidden "website" field that people never fill in.
  if (clean(body.website, 200)) {
    return res.status(201).json({ ok: true });
  }

  const name = clean(body.name, 100);
  const email = clean(body.email, 200).toLowerCase();
  const question = clean(body.question, 1500);

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!question) return res.status(400).json({ error: 'Please type your question.' });

  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Too many messages. Please try again in a few minutes, or call us at +1 (201) 908-7279.' });
  }

  const createdAt = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO messages (name, email, question, createdAt) VALUES (?, ?, ?, ?)')
    .run(name, email, question, createdAt);

  // Fire-and-forget: sendMail never throws, and the message is already saved.
  sendMail({
    to: NOTIFY_EMAIL,
    replyTo: email,
    subject: `Website question from ${name}`,
    text: `New message #${info.lastInsertRowid} from the website Contact Us form\n\nName: ${name}\nEmail: ${email}\n\n${question}`,
    html: `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;color:#1f2937;">
        <h2 style="color:#2047bb;margin-bottom:8px;">New website question</h2>
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Name</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;">Question</td><td style="white-space:pre-wrap;">${escapeHtml(question)}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;margin-top:16px;">Reply to this email to answer ${escapeHtml(name)} directly.</p>
      </div>`,
  });

  res.status(201).json({ ok: true });
});

module.exports = router;
