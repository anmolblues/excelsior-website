// mailer.js — sends transactional email via Google Workspace SMTP.
//
// Configure with environment variables:
//   SMTP_USER        the sending mailbox, e.g. no-reply@eepcenter.com
//   SMTP_PASS        a Google Workspace "app password" for that mailbox
//                     (not the regular login password — see README)
//   MAIL_FROM_NAME    optional display name (defaults below)
//   MAIL_FROM_ADDRESS optional From address (defaults to SMTP_USER)
//
// If SMTP_USER/SMTP_PASS aren't set (e.g. during local development before
// you've created the mailbox), emails are logged to the console instead of
// sent, and the app keeps working normally — signup/login never fail
// because of email.

const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Excelsior Enrichment Program';
const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || SMTP_USER;

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn(
    '[mailer] SMTP_USER/SMTP_PASS are not set — emails will be logged, not sent. See README.md "Sending emails" for setup.'
  );
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Fire-and-forget friendly: never throws. A failed/unconfigured send is
// logged, not surfaced to the caller, so email problems can never break
// signup, login, or bookings.
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[mailer] (not configured) would send "${subject}" to ${to}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

function sendWelcomeEmail(user) {
  const name = escapeHtml(user.name);
  const subject = 'Welcome to Excelsior Enrichment Program!';
  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h2 style="color:#2047bb; margin-bottom: 4px;">Welcome, ${name}!</h2>
      <p>Your account with <strong>Excelsior Enrichment Program</strong> is all set up.</p>
      <p>
        You can now browse classes and enroll your student any time at
        <a href="https://excelsiorenrichmentprogram.com" style="color:#2047bb;">excelsiorenrichmentprogram.com</a>.
      </p>
      <p style="color:#9ca3af; font-size: 13px; margin-top: 32px;">
        If you didn't create this account, you can safely ignore this email.
      </p>
    </div>`;
  const text =
    `Welcome, ${user.name}!\n\n` +
    `Your account with Excelsior Enrichment Program is all set up. Browse classes and enroll ` +
    `any time at https://excelsiorenrichmentprogram.com\n\n` +
    `If you didn't create this account, you can safely ignore this email.`;

  return sendMail({ to: user.email, subject, html, text });
}

module.exports = { sendMail, sendWelcomeEmail };
