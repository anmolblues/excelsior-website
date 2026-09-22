/**
 * EEP Program Calendar — Events & Bookings backend (Google Apps Script)
 * ============================================================
 *
 * WHAT THIS IS
 * A Web App that sits in front of a Google Sheet and serves as the backend
 * for the public "calendar.html" page: it lists events with live seat counts,
 * and accepts registrations without letting two people overbook the same seat.
 * It also adds a "Sync to Google Calendar" menu button in the Sheet, so your
 * own Workshop Event Calendar (viewable on your phone, shareable, etc.) mirrors
 * whatever's Published — one-way, Sheet to Calendar, and only when you click
 * it, not automatically.
 *
 * SETUP (about 5 minutes)
 * 1. Create a new Google Sheet (any name — e.g. "EEP Events").
 * 2. Extensions -> Apps Script. Click the project name at the top left
 *    (it starts out as "Untitled project") and rename it to
 *    "EEP Events & Bookings" — this is the Apps Script project's own name,
 *    separate from the Sheet's name, and it's what you'll see later if you
 *    have several scripts and need to find this one again.
 * 3. Delete the placeholder code and paste this whole file in, then save
 *    (Ctrl/Cmd+S, or the disk icon in the toolbar). The function dropdown
 *    below won't list "initializeSheet" until the file is actually saved.
 * 4. In the function dropdown at the top, select "initializeSheet" and click
 *    Run. The first run will ask you to authorize — that's Google's own
 *    consent screen, approve it. This builds the two tabs (Events, Bookings)
 *    with headers and two example event rows.
 * 5. Open the Sheet, replace the two example rows in "Events" with your real
 *    events, and add more rows as needed. Column meanings are below.
 * 6. Back in the Apps Script editor: Deploy -> New deployment -> gear icon ->
 *    "Web app". Set "Execute as: Me" and "Who has access: Anyone". Deploy,
 *    and copy the Web App URL it gives you — that's what the calendar page's
 *    JavaScript will call.
 * 7. Any time you edit this code, you need to Deploy -> Manage deployments ->
 *    edit (pencil) -> New version, or the live URL keeps running the old code.
 * 8. Reload the Sheet tab in your browser (a plain refresh). You'll see a
 *    new "EEP Events" menu next to Help — that's the Calendar sync. Click
 *    "Sync to Google Calendar" any time you want your changes mirrored
 *    there; the first click will ask you to authorize Calendar access too
 *    (separate from the Sheets authorization in step 4 — Calendar is a
 *    different Google service, so it gets its own consent screen).
 *
 * ALREADY HAVE A SHEET SET UP FROM BEFORE THE "STATUS" OR "RECURRENCE" COLUMNS EXISTED?
 * Do this once, by hand, before pasting in this new version of the code:
 *   1. If you don't yet have a Status column: right-click column A's header,
 *      "Insert 1 column left", type "Status" in A1 (bold, to match the other
 *      headers), then type "Published" in every existing event row so they
 *      stay visible exactly as before.
 *   2. If you don't yet have Recurrence / Recurrence Ends / Skip Dates
 *      columns: right-click the column header just after "Date" three times
 *      ("Insert 1 column right" or "Insert 1 column left" on what's after
 *      it — either way, you want three new empty columns immediately after
 *      Date and before Start Time), and label them "Recurrence",
 *      "Recurrence Ends", "Skip Dates" (bold). Leave all three blank on
 *      every existing row — a blank Recurrence means "just this one date,"
 *      so your current events keep behaving exactly as they do now.
 *   3. Now paste in this code and redeploy (Deploy -> Manage deployments ->
 *      pencil -> New version), same as any other code update.
 *
 * SHEET STRUCTURE
 * "Events" tab — you edit this by hand:
 *   Status | Event ID | Event Name | Category | Event Type | Grades | Date | Recurrence | Recurrence Ends | Skip Dates | Start Time | End Time | Capacity | Calendar Event ID
 *   - Status: "Draft" or "Published". Only "Published" rows are ever returned
 *     to the public calendar page or bookable — this is your safety switch.
 *     Leave a new or half-edited event as "Draft" while you're setting it up,
 *     then flip it to "Published" when it's ready to go live. An accidental
 *     edit to a row that's already Published still goes live immediately
 *     (this only protects rows you haven't published yet), so for a bigger
 *     edit to a live event, it's safest to switch it back to Draft, make the
 *     change, then republish.
 *   - Event ID: a short code you make up (e.g. "sat-oct3") — must be unique.
 *   - Category: one of Test Prep / Enrichment / Workshop / Info Session.
 *   - Event Type: one of Online / In-person / Hybrid.
 *   - Grades: comma-separated, e.g. "5-6,7-8". IMPORTANT: format this whole
 *     column as Plain text first (select the column -> Format -> Number ->
 *     Plain text). Otherwise Sheets "helpfully" reads something like "11-12"
 *     as November 12th and silently turns it into a date behind the scenes,
 *     which is why a grade range can come out on the calendar page looking
 *     like a full timestamp instead of "11-12". If a cell already got
 *     converted this way: reformat the column as Plain text, then retype
 *     that cell's value (reformatting alone won't undo an existing bad
 *     conversion — it has to be retyped once the column is Plain text).
 *   - Date: yyyy-mm-dd (or just type a date, Sheets will store it as a date).
 *     For a recurring event, this is the date of its FIRST occurrence — the
 *     day of the week it falls on is the day every later occurrence uses too
 *     (so "every Monday at 4pm" is just: put a Monday's date here, 4:00 PM
 *     as the Start Time, and Weekly as the Recurrence — no separate
 *     day-of-week field needed).
 *   - Recurrence: blank/"None" for a one-time event, or "Weekly",
 *     "Every 2 Weeks", or "Monthly" to repeat it. A row's Category, Grades,
 *     Time, and Capacity apply to every occurrence the same way — this
 *     isn't meant for a series where different dates need different
 *     details; make separate rows for that instead.
 *     "Monthly" repeats on the same date each month (e.g. the 14th); if a
 *     given month doesn't have that date, it lands on the closest valid day
 *     just after (JavaScript's date math does this rollover automatically).
 *   - Recurrence Ends: yyyy-mm-dd, the last date to generate occurrences
 *     through. Required for anything other than "None" — a series can't
 *     repeat forever. Leave it blank on a one-time event.
 *     Regardless of this date, the page only ever generates occurrences up
 *     to 90 days out at a time (see MAX_HORIZON_DAYS below) — new dates
 *     just keep appearing automatically as they come into that window, you
 *     don't need to keep bumping this.
 *   - Skip Dates: comma-separated yyyy-mm-dd dates to cancel just those
 *     occurrences of a recurring event (e.g. a holiday week) without
 *     touching the rest of the series or deleting the row. Leave blank if
 *     nothing's being skipped.
 *   - Calendar Event ID: leave this blank yourself — the "Sync to Google
 *     Calendar" menu button fills it in automatically after creating the
 *     matching Calendar entry, and uses it on the next sync to update that
 *     same entry instead of creating a duplicate. Only Published rows get
 *     synced; a row you flip back to Draft gets removed from the calendar
 *     on the next sync, and this cell clears itself.
 *
 * "Bookings" tab — this script writes to it, you don't type into it directly:
 *   Timestamp | Event ID | Event Name | Name | Phone | Address |
 *   Marketing Opt-in | Booking Status | Lead Status
 *   - Booking Status is script-managed: "Confirmed" or "Waitlist" (never
 *     "Cancelled" automatically — that's something you'd set by hand if a
 *     family cancels).
 *   - Lead Status starts as "New" on every booking — this is the column
 *     you update by hand as you follow up (New -> Contacted -> Enrolled -> Lost),
 *     since every registration is effectively a lead.
 *
 * A NOTE ON CORS (why the front-end code looks slightly odd)
 * Apps Script Web Apps don't handle the CORS "preflight" request browsers
 * send before a JSON POST. The workaround — already reflected in this
 * script and needed on the calendar.html side too — is to POST the body as
 * plain text (Content-Type: text/plain) instead of application/json, and
 * parse it manually here with JSON.parse(e.postData.contents). If you ever
 * rewrite the front-end fetch call, keep that detail or bookings will
 * silently fail with a CORS error in the browser console.
 */

const EVENTS_SHEET = 'Events';
const BOOKINGS_SHEET = 'Bookings';

const EVENTS_HEADERS = [
  'Status', 'Event ID', 'Event Name', 'Category', 'Event Type', 'Grades',
  'Date', 'Recurrence', 'Recurrence Ends', 'Skip Dates',
  'Start Time', 'End Time', 'Capacity', 'Calendar Event ID'
];

// The Google Calendar that "Sync to Google Calendar" mirrors Published
// events into. Created automatically on first sync if it doesn't exist yet.
const CALENDAR_NAME = 'Workshop Event Calendar';

// How far out to expand a recurring series on any given page load, no
// matter how far off its "Recurrence Ends" date is. Keeps a "runs until
// June" series from generating months of occurrences nobody's about to
// look at yet — new dates simply appear on their own as they enter this
// window, so there's nothing to maintain here.
const MAX_HORIZON_DAYS = 90;

const BOOKINGS_HEADERS = [
  'Timestamp', 'Event ID', 'Event Name', 'Name', 'Phone', 'Address',
  'Marketing Opt-in', 'Booking Status', 'Lead Status'
];

const CATEGORY_MAP = {
  'test prep': 'testprep',
  'enrichment': 'enrichment',
  'workshop': 'workshop',
  'info session': 'info'
};

const EVENT_TYPES = ['online', 'in-person', 'hybrid'];

// ---------- Menu ----------

// Runs automatically when the Sheet is opened; adds the sync button as a
// menu next to Help. (If you don't see it, do a plain browser refresh on
// the Sheet tab — a menu can't appear until the Sheet is reloaded once
// after this code exists.)
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EEP Events')
    .addItem('Sync to Google Calendar', 'syncEventsToCalendar')
    .addToUi();
}

// ---------- One-time setup ----------

function initializeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupTab_(ss, EVENTS_SHEET, EVENTS_HEADERS);
  setupTab_(ss, BOOKINGS_SHEET, BOOKINGS_HEADERS);

  const events = ss.getSheetByName(EVENTS_SHEET);
  if (events.getLastRow() === 1) {
    // A one-time event: Recurrence / Recurrence Ends / Skip Dates all blank.
    events.appendRow(['Published', 'sat-oct3', 'Fall SAT Prep Bootcamp', 'Test Prep', 'In-person', '9-10,11-12', '2026-10-03', '', '', '', '9:00 AM', '12:00 PM', 24, '']);
    // A recurring event: repeats weekly (same weekday as the Date above)
    // through the Recurrence Ends date. Left as Draft so it's a safe demo —
    // flip it to Published to see it expand into multiple bookable dates.
    events.appendRow(['Draft', 'stem-sat', 'STEM Saturday: Robotics & Circuits', 'Workshop', 'Hybrid', '5-6', '2026-10-10', 'Weekly', '2026-12-19', '', '10:00 AM', '12:00 PM', 16, '']);
  }
}

function setupTab_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// ---------- Reading events + live availability ----------

function getEventsWithAvailability_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventRows = ss.getSheetByName(EVENTS_SHEET).getDataRange().getValues().slice(1);
  const bookingRows = ss.getSheetByName(BOOKINGS_SHEET).getDataRange().getValues().slice(1);

  const results = [];

  eventRows
    .filter(function (r) { return r[1] && String(r[0]).trim().toLowerCase() === 'published'; }) // skip blank rows + only Published
    .forEach(function (row) {
      const id = row[1], name = row[2], category = row[3], eventType = row[4], grades = row[5],
            dateVal = row[6], recurrenceVal = row[7], recurrenceEnds = row[8], skipDatesVal = row[9],
            start = row[10], end = row[11], capacity = row[12];

      const recur = normalizeRecurrence_(recurrenceVal);
      const startDate = toDateObj_(dateVal);
      const skipSet = parseSkipDates_(skipDatesVal);

      const occurrenceDates = generateOccurrences_(startDate, recur, recurrenceEnds)
        .filter(function (d) { return skipSet.indexOf(formatDate_(d)) === -1; });

      occurrenceDates.forEach(function (d) {
        const iso = formatDate_(d);
        // Recurring occurrences need their own bookable identity (Oct 10's
        // seats are separate from Oct 17's); a one-time event keeps its
        // plain Event ID so existing bookings against it still match.
        const occId = (recur === 'none') ? id : id + '@' + iso;
        const booked = bookingRows.filter(function (b) {
          return b[1] === occId && b[7] !== 'Cancelled';
        }).length;
        results.push({
          id: occId,
          name: name,
          cat: normalizeCategory_(category),
          eventType: normalizeEventType_(eventType),
          grades: formatGrades_(grades).split(',').map(function (g) { return g.trim(); }).filter(Boolean),
          date: iso,
          start: formatTime_(start),
          end: formatTime_(end),
          capacity: Number(capacity),
          booked: booked
        });
      });
    });

  return results;
}

// ---------- Recurrence expansion ----------

function normalizeRecurrence_(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'weekly') return 'weekly';
  if (key === 'every 2 weeks' || key === 'biweekly' || key === 'every-2-weeks') return 'every2weeks';
  if (key === 'monthly') return 'monthly';
  return 'none'; // blank or anything unrecognized — safest fallback is a single one-off date
}

function toDateObj_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return new Date(value.getTime());
  const parts = String(value).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function addDays_(d, days) {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

function addMonths_(d, months) {
  // JS Date naturally rolls an out-of-range day into the next month (e.g.
  // Jan 31 + 1 month => Mar 3, since February doesn't have a 31st) — that
  // rollover is exactly the "closest valid day just after" behavior
  // documented for Monthly recurrence above, and needs no extra code.
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

function parseSkipDates_(value) {
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function generateOccurrences_(startDate, recur, recurrenceEndsVal) {
  const horizonDate = new Date();
  horizonDate.setDate(horizonDate.getDate() + MAX_HORIZON_DAYS);

  const recurrenceEndsDate = recurrenceEndsVal ? toDateObj_(recurrenceEndsVal) : null;
  const cap = (recurrenceEndsDate && recurrenceEndsDate < horizonDate) ? recurrenceEndsDate : horizonDate;

  const dates = [];
  if (recur === 'none') {
    if (startDate <= cap) dates.push(startDate);
    return dates;
  }

  for (let n = 0, guard = 0; guard < 500; n++, guard++) {
    let occ;
    if (recur === 'weekly') occ = addDays_(startDate, n * 7);
    else if (recur === 'every2weeks') occ = addDays_(startDate, n * 14);
    else /* monthly */ occ = addMonths_(startDate, n);

    if (occ > cap) break;
    dates.push(occ);
  }
  return dates;
}

function normalizeCategory_(label) {
  const key = String(label).trim().toLowerCase();
  return CATEGORY_MAP[key] || key.replace(/\s+/g, '');
}

function normalizeEventType_(label) {
  // Values already match their slug form once lowercased (Online -> online,
  // In-person -> in-person, Hybrid -> hybrid), so no lookup table needed —
  // EVENT_TYPES above is just the reference list of valid values.
  return String(label).trim().toLowerCase();
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function formatGrades_(value) {
  // A Grades cell like "11-12" (no comma — a single range) looks like a
  // month-day date to Sheets' auto-detection, so unless the column is
  // formatted as Plain text, Sheets silently stores it as a real date
  // (guessing a year) instead of the text you typed. If that happened,
  // getValues() hands back a Date here — best-effort, rebuild "M-D" from
  // its month/day rather than show a raw timestamp. This can't recover a
  // *multi*-range cell like "5-6,7-8" that got auto-converted this way,
  // since the comma-separated text is already gone by the time it's a
  // Date — see the fix note in events-backend.gs's setup instructions for
  // how to stop it happening at all.
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return (value.getMonth() + 1) + '-' + value.getDate();
  }
  return String(value);
}

function formatTime_(value) {
  // When you type a time like "9:00 AM" into a Sheet cell, Sheets silently
  // converts it to a Time value (a Date object at its epoch, 1899-12-30,
  // with just the time-of-day part meaningful). getValues() hands that back
  // as a real JS Date, which — if returned as-is — turns into a full
  // timestamp once JSON-encoded, and calendar.html ends up displaying
  // something like "Wed Dec 30 1899 09:00:00" instead of "9:00 AM". This
  // reformats it down to just the time before it ever reaches the page.
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  }
  return String(value).trim();
}

// ---------- Web App endpoints ----------

function doGet(e) {
  return jsonOutput_({ ok: true, events: getEventsWithAvailability_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'The system is busy — please try again in a moment.' });
  }

  try {
    const data = JSON.parse(e.postData.contents);
    const eventId = data.eventId;
    const name = (data.name || '').trim();
    const phone = (data.phone || '').trim();
    const address = (data.address || '').trim();
    const optIn = !!data.optIn;

    if (!eventId || !name || !phone || !address) {
      return jsonOutput_({ ok: false, error: 'Missing required fields.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventsSheet = ss.getSheetByName(EVENTS_SHEET);
    const bookingsSheet = ss.getSheetByName(BOOKINGS_SHEET);

    const eventRow = findValidOccurrence_(eventsSheet, eventId);
    if (!eventRow) {
      // Treat a Draft row, an unknown event, or a date that was never
      // actually offered (skipped, past the recurrence window, etc.) the
      // same as "not found" — don't reveal to the public that an
      // unpublished event exists or let someone book a made-up date.
      return jsonOutput_({ ok: false, error: 'Event not found.' });
    }
    const capacity = Number(eventRow[12]);
    const eventName = eventRow[2];

    const bookedCount = bookingsSheet.getDataRange().getValues().slice(1)
      .filter(function (b) { return b[1] === eventId && b[7] !== 'Cancelled'; }).length;

    const bookingStatus = bookedCount < capacity ? 'Confirmed' : 'Waitlist';

    bookingsSheet.appendRow([
      new Date(), eventId, eventName, name, phone, address,
      optIn ? 'Yes' : 'No', bookingStatus, 'New'
    ]);

    const seatsLeft = Math.max(0, capacity - bookedCount - (bookingStatus === 'Confirmed' ? 1 : 0));

    return jsonOutput_({ ok: true, status: bookingStatus, seatsLeft: seatsLeft, capacity: capacity });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'Something went wrong: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

// Resolves a submitted eventId — either a plain Event ID ("sat-oct3") or a
// recurring occurrence ("stem-sat@2026-10-17") — back to its Sheet row,
// but only if that row is Published AND (for a recurring row) the
// requested date is one the series actually generates and hasn't been
// skipped. Returns the row array, or null if the booking should be rejected.
function findValidOccurrence_(eventsSheet, eventId) {
  const rows = eventsSheet.getDataRange().getValues().slice(1);

  const atIdx = String(eventId).indexOf('@');
  const baseId = atIdx === -1 ? eventId : eventId.slice(0, atIdx);
  const requestedDate = atIdx === -1 ? null : eventId.slice(atIdx + 1);

  const row = rows.find(function (r) { return r[1] === baseId; });
  if (!row || String(row[0]).trim().toLowerCase() !== 'published') return null;

  const recur = normalizeRecurrence_(row[7]);
  if (recur === 'none') {
    return requestedDate === null ? row : null; // one-off events use the plain ID, no @date suffix
  }

  if (requestedDate === null) return null; // a recurring event always needs a @date
  const skipSet = parseSkipDates_(row[9]);
  if (skipSet.indexOf(requestedDate) !== -1) return null;

  const startDate = toDateObj_(row[6]);
  const isValidDate = generateOccurrences_(startDate, recur, row[8])
    .some(function (d) { return formatDate_(d) === requestedDate; });

  return isValidDate ? row : null;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sync to Google Calendar ----------
//
// One-way, Sheet -> Calendar, and only when you click the menu button —
// never automatic, same philosophy as the Draft/Published gate. A row's
// Recurrence/Recurrence Ends/Skip Dates map directly onto Google Calendar's
// own recurrence rules (Calendar has native support for "repeat weekly
// until this date, except these dates," so this isn't reimplementing
// anything — it's just handing Calendar the same pattern the booking page
// already understands). Note this sync isn't bound by the 90-day
// MAX_HORIZON_DAYS window the public page uses — Calendar can maintain a
// true long-running recurring series on its own, so your calendar can show
// further ahead than the booking page does; that's intentional, since this
// calendar is for your own visibility, not for what's bookable right now.

function syncEventsToCalendar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(EVENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const calendar = getOrCreateEepCalendar_();

  let created = 0, updated = 0, removed = 0, skipped = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = row[1];
    if (!id) continue; // blank row

    const status = String(row[0]).trim().toLowerCase();
    const existingCalRef = row[13];

    if (status !== 'published') {
      // Not (or no longer) live — make sure it's not sitting in the
      // calendar either, e.g. because it was un-published after a
      // previous sync.
      if (existingCalRef) {
        deleteExistingCalendarEntry_(calendar, existingCalRef);
        sheet.getRange(i + 1, 14).setValue('');
        removed++;
      } else {
        skipped++;
      }
      continue;
    }

    // Published: replace whatever's there (if anything) with a fresh
    // entry built from the row's current values. Simpler and more
    // reliable than trying to patch an existing series in place when,
    // say, its recurrence pattern changed.
    if (existingCalRef) deleteExistingCalendarEntry_(calendar, existingCalRef);

    const name = row[2];
    const startDate = toDateObj_(row[6]);
    const recur = normalizeRecurrence_(row[7]);
    const recurrenceEndsVal = row[8];
    const skipDatesVal = row[9];
    const startDateTime = combineDateAndTime_(startDate, row[10]);
    const endDateTime = combineDateAndTime_(startDate, row[11]);

    let stored;
    if (recur === 'none') {
      const ev = calendar.createEvent(name, startDateTime, endDateTime);
      stored = 'event:' + ev.getId();
    } else {
      const recurrence = buildCalendarRecurrence_(recur, recurrenceEndsVal, skipDatesVal);
      const series = calendar.createEventSeries(name, startDateTime, endDateTime, recurrence);
      stored = 'series:' + series.getId();
    }

    sheet.getRange(i + 1, 14).setValue(stored);
    existingCalRef ? updated++ : created++;
  }

  const parts = [];
  if (created) parts.push(created + ' created');
  if (updated) parts.push(updated + ' updated');
  if (removed) parts.push(removed + ' removed (no longer Published)');
  if (!parts.length) parts.push('nothing to sync');
  SpreadsheetApp.getUi().alert('Synced to "' + CALENDAR_NAME + '": ' + parts.join(', ') + '.' +
    (skipped ? ' (' + skipped + ' Draft row(s) left untouched.)' : ''));
}

function getOrCreateEepCalendar_() {
  const existing = CalendarApp.getCalendarsByName(CALENDAR_NAME);
  if (existing.length) return existing[0];
  return CalendarApp.createCalendar(CALENDAR_NAME);
}

// Calendar entries created by this script are recorded as "event:<id>" or
// "series:<id>" (the prefix says which Calendar API method finds them, so
// deleting doesn't have to guess).
function deleteExistingCalendarEntry_(calendar, stored) {
  const str = String(stored);
  const sep = str.indexOf(':');
  if (sep === -1) return;
  const kind = str.slice(0, sep);
  const id = str.slice(sep + 1);
  try {
    if (kind === 'series') {
      const series = calendar.getEventSeriesById(id);
      if (series) series.deleteEventSeries();
    } else if (kind === 'event') {
      const ev = calendar.getEventById(id);
      if (ev) ev.deleteEvent();
    }
  } catch (err) {
    // Already gone (e.g. someone deleted it by hand in Calendar) — fine,
    // we were about to remove/replace it anyway.
  }
}

function buildCalendarRecurrence_(recur, recurrenceEndsVal, skipDatesVal) {
  let recurrence = CalendarApp.newRecurrence();
  if (recur === 'weekly') recurrence = recurrence.addWeeklyRule();
  else if (recur === 'every2weeks') recurrence = recurrence.addWeeklyRule().interval(2);
  else if (recur === 'monthly') recurrence = recurrence.addMonthlyRule();

  if (recurrenceEndsVal) {
    recurrence = recurrence.until(toDateObj_(recurrenceEndsVal));
  }

  const skipDates = parseSkipDates_(skipDatesVal).map(toDateObj_);
  if (skipDates.length) {
    recurrence = recurrence.addDatesToExclude(skipDates);
  }

  return recurrence;
}

// Takes the Y/M/D from a Date and the time-of-day from a Start/End Time
// cell (a Date if Sheets auto-converted it — see formatTime_'s note above
// — or a plain "H:MM"/"H:MM AM" string) and combines them into one Date,
// since Calendar events need a single real timestamp, not separate date
// and time values.
function combineDateAndTime_(dateObj, timeVal) {
  let hours = 0, minutes = 0;
  if (Object.prototype.toString.call(timeVal) === '[object Date]') {
    hours = timeVal.getHours();
    minutes = timeVal.getMinutes();
  } else {
    const m = String(timeVal).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    if (m) {
      hours = Number(m[1]);
      minutes = Number(m[2]);
      if (m[3]) { // 12-hour clock with AM/PM
        hours = hours % 12;
        if (/p/i.test(m[3])) hours += 12;
      } // else: already 24-hour
    }
  }
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hours, minutes);
}
