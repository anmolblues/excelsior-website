// routes/qr.js
//
// Trackable QR codes. Each printed QR code contains a short link like
//   https://excelsiorenrichmentprogram.com/go/flyer
// When someone scans it, goHandler() below logs the scan (qrScans table)
// and redirects to the link's destination with UTM tags added, e.g.
//   /assessment.html?utm_source=flyer&utm_medium=qr&utm_campaign=fall2026&qr=flyer
// so Google Analytics attributes the visit, and the landing page's form
// records which QR code the lead came from.
//
// New campaigns are created from the "QR Campaigns" section of admin.html
// — no code change or redeploy needed. The destination and tags can be
// edited after printing; the code itself can't (it's in the printed image).
const express = require('express');
const QRCode = require('qrcode');
const { _db: db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://excelsiorenrichmentprogram.com').replace(/\/+$/, '');

// Start with one ready-to-print link for the free-assessment flyer.
db.prepare(
  `INSERT OR IGNORE INTO qrLinks (code, label, destination, utmSource, utmMedium, utmCampaign, active, createdAt)
   VALUES ('flyer', 'Free assessment flyer', '/assessment.html', 'flyer', 'qr', 'free_assessment', 1, ?)`
).run(new Date().toISOString());

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

// Lowercase letters, digits and dashes only — it ends up in a printed URL.
function validCode(code) {
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(code);
}

// Only same-site paths ("/something"), so a QR link can never be turned
// into a redirect to another website.
function validDestination(dest) {
  return /^\/(?!\/)[^\s\\]*$/.test(dest);
}

function shortUrl(code) {
  return `${PUBLIC_BASE_URL}/go/${code}`;
}

function buildTarget(link) {
  const [pathAndQuery, hash] = link.destination.split('#');
  const [path, query] = pathAndQuery.split('?');
  const params = new URLSearchParams(query || '');
  if (link.utmSource) params.set('utm_source', link.utmSource);
  if (link.utmMedium) params.set('utm_medium', link.utmMedium);
  if (link.utmCampaign) params.set('utm_campaign', link.utmCampaign);
  params.set('qr', link.code);
  return `${path}?${params.toString()}${hash ? '#' + hash : ''}`;
}

// GET /go/:code — public. Mounted directly in server.js (not under /api).
function goHandler(req, res) {
  const code = String(req.params.code || '').toLowerCase();
  const link = validCode(code) ? db.prepare('SELECT * FROM qrLinks WHERE code = ?').get(code) : null;

  if (!link || !link.active) {
    // Unknown or switched-off code: still land somewhere useful.
    return res.redirect(302, '/assessment.html?utm_source=qr_unknown&utm_medium=qr');
  }

  db.prepare('INSERT INTO qrScans (code, createdAt) VALUES (?, ?)').run(code, new Date().toISOString());
  res.set('Cache-Control', 'no-store'); // so repeat scans aren't served from a cache and missed
  res.redirect(302, buildTarget(link));
}

function withStats(link) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const scans = db.prepare('SELECT COUNT(*) AS n FROM qrScans WHERE code = ?').get(link.code).n;
  const scans7d = db.prepare('SELECT COUNT(*) AS n FROM qrScans WHERE code = ? AND createdAt >= ?').get(link.code, weekAgo).n;
  const lastScan = db.prepare('SELECT MAX(createdAt) AS t FROM qrScans WHERE code = ?').get(link.code).t;
  const leads = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE qrCode = ?').get(link.code).n;
  return { ...link, active: !!link.active, shortUrl: shortUrl(link.code), targetUrl: buildTarget(link), scans, scans7d, lastScan, leads };
}

// GET /api/qr — admin: all links with scan + lead counts
router.get('/', requireAdmin, (req, res) => {
  const links = db.prepare('SELECT * FROM qrLinks ORDER BY createdAt DESC, id DESC').all();
  res.json({ links: links.map(withStats) });
});

function readLinkFields(body, existing) {
  const pick = (key, max, fallback) => (body[key] !== undefined ? clean(body[key], max) : fallback);
  return {
    label: pick('label', 100, existing ? existing.label : ''),
    destination: pick('destination', 300, existing ? existing.destination : '/assessment.html') || '/assessment.html',
    utmSource: pick('utmSource', 100, existing ? existing.utmSource : ''),
    utmMedium: pick('utmMedium', 100, existing ? existing.utmMedium : 'qr'),
    utmCampaign: pick('utmCampaign', 100, existing ? existing.utmCampaign : ''),
    active: body.active !== undefined ? (body.active ? 1 : 0) : existing ? existing.active : 1,
  };
}

// POST /api/qr — admin: create a link
router.post('/', requireAdmin, (req, res) => {
  const code = clean(req.body.code, 40).toLowerCase();
  if (!validCode(code)) {
    return res.status(400).json({ error: 'Code must be lowercase letters, numbers or dashes (e.g. library-flyer).' });
  }
  if (db.prepare('SELECT 1 FROM qrLinks WHERE code = ?').get(code)) {
    return res.status(400).json({ error: `A link with code "${code}" already exists.` });
  }
  const fields = readLinkFields(req.body, null);
  if (!fields.utmSource) fields.utmSource = code;
  if (!validDestination(fields.destination)) {
    return res.status(400).json({ error: 'Destination must be a page on this site, starting with / (e.g. /assessment.html).' });
  }
  db.prepare(
    `INSERT INTO qrLinks (code, label, destination, utmSource, utmMedium, utmCampaign, active, createdAt)
     VALUES (@code, @label, @destination, @utmSource, @utmMedium, @utmCampaign, @active, @createdAt)`
  ).run({ code, ...fields, createdAt: new Date().toISOString() });
  res.status(201).json({ link: withStats(db.prepare('SELECT * FROM qrLinks WHERE code = ?').get(code)) });
});

// PATCH /api/qr/:id — admin: edit destination/tags/label, or switch on/off.
// The code itself is fixed once created (it's printed on paper).
router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM qrLinks WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Link not found.' });
  const fields = readLinkFields(req.body, existing);
  if (!validDestination(fields.destination)) {
    return res.status(400).json({ error: 'Destination must be a page on this site, starting with / (e.g. /assessment.html).' });
  }
  db.prepare(
    `UPDATE qrLinks SET label=@label, destination=@destination, utmSource=@utmSource, utmMedium=@utmMedium, utmCampaign=@utmCampaign, active=@active WHERE id=@id`
  ).run({ ...fields, id: existing.id });
  res.json({ link: withStats(db.prepare('SELECT * FROM qrLinks WHERE id = ?').get(existing.id)) });
});

// GET /api/qr/:id/image.(png|svg) — admin: the QR code image to print.
// High error correction (H) so it still scans if the flyer gets scuffed.
router.get('/:id/image.:ext', requireAdmin, async (req, res) => {
  const link = db.prepare('SELECT * FROM qrLinks WHERE id = ?').get(Number(req.params.id));
  if (!link) return res.status(404).json({ error: 'Link not found.' });
  const url = shortUrl(link.code);
  const opts = { errorCorrectionLevel: 'H', margin: 4, color: { dark: '#0b1f5c', light: '#ffffff' } };
  const download = req.query.download ? `attachment; filename="eep-qr-${link.code}.${req.params.ext}"` : 'inline';
  try {
    if (req.params.ext === 'svg') {
      const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
      res.set({ 'Content-Type': 'image/svg+xml', 'Content-Disposition': download }).send(svg);
    } else if (req.params.ext === 'png') {
      const png = await QRCode.toBuffer(url, { ...opts, type: 'png', width: 1200 });
      res.set({ 'Content-Type': 'image/png', 'Content-Disposition': download }).send(png);
    } else {
      res.status(404).json({ error: 'Use .png or .svg' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Could not generate QR code.' });
  }
});

module.exports = router;
module.exports.goHandler = goHandler;
