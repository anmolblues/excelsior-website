// admin.js — admin dashboard logic

let adminUser = null;

// ---------- Tabs ----------
// Each tab shows one .tab-panel. The URL hash (#classes, #students, ...) and
// localStorage remember the current tab.
const ADMIN_TABS = ['classes', 'students', 'attendance', 'workshops', 'marketing'];

// The tab that holds a section, for deep links like admin.html#leads.
function tabForSectionId(id) {
  const el = id && document.getElementById(id);
  const panel = el && el.closest('.tab-panel');
  return panel ? panel.dataset.tab : null;
}

function initialAdminTab() {
  const fromHash = location.hash.replace('#', '');
  if (ADMIN_TABS.includes(fromHash)) return fromHash;
  const sectionTab = tabForSectionId(fromHash);
  if (sectionTab) return sectionTab;
  try {
    const saved = localStorage.getItem('eepAdminTab');
    if (ADMIN_TABS.includes(saved)) return saved;
  } catch (e) { /* storage unavailable */ }
  return 'classes';
}

// keepHash: leave a section deep link (e.g. #leads) in the URL so the page
// can scroll to it after loading.
function setAdminTab(tab, keepHash = false) {
  if (!ADMIN_TABS.includes(tab)) tab = 'classes';
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.tab !== tab));
  document.querySelectorAll('.admin-tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  if (!keepHash && location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  try { localStorage.setItem('eepAdminTab', tab); } catch (e) { /* storage unavailable */ }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '');
  if (ADMIN_TABS.includes(id)) return setAdminTab(id);
  const tab = tabForSectionId(id);
  if (tab) {
    setAdminTab(tab, true);
    document.getElementById(id).scrollIntoView();
  }
});

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden', 'bg-gray-900', 'bg-red-600');
  toast.classList.add(isError ? 'bg-red-600' : 'bg-gray-900');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Auth / view switching ----------

async function checkAdmin() {
  try {
    const data = await api('/auth/me');
    if (data.user.role !== 'admin') {
      showToast('This account is not an admin.', true);
      return false;
    }
    adminUser = data.user;
    return true;
  } catch {
    return false;
  }
}

async function showCorrectScreen() {
  const isAdmin = await checkAdmin();
  if (isAdmin) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    setAdminTab(initialAdminTab(), true);
    await loadClasses();
    await loadBookings();
    await loadEvents();
    await loadEventRegistrations();
    await loadUsers();
    await loadStudents();
    await loadLeads();
    await loadQrLinks();
    // Deep links like admin.html#leads (used in the new-lead alert email)
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) target.scrollIntoView();
    }
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
  }
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.classList.add('hidden');

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('adminEmail').value,
        password: document.getElementById('adminPassword').value,
      }),
    });
    if (data.user.role !== 'admin') {
      errorEl.textContent = 'This account does not have admin access.';
      errorEl.classList.remove('hidden');
      await api('/auth/logout', { method: 'POST' });
      return;
    }
    await showCorrectScreen();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

async function adminLogout() {
  await api('/auth/logout', { method: 'POST' });
  await showCorrectScreen();
}

// ---------- Classes ----------

let allClasses = [];

async function loadClasses() {
  const data = await api('/classes');
  allClasses = data.classes;
  populateAttendanceClasses();
  const tbody = document.getElementById('classesTableBody');
  tbody.innerHTML = '';

  allClasses.forEach(cls => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(cls.title)}</td>
      <td class="px-4 py-3">${escapeHtml(cls.subject)}</td>
      <td class="px-4 py-3">${cls.ageMin}-${cls.ageMax}</td>
      <td class="px-4 py-3 capitalize">${escapeHtml(cls.format)}</td>
      <td class="px-4 py-3">$${cls.price}</td>
      <td class="px-4 py-3">${cls.spotsLeft} / ${cls.capacity}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="openClassForm(${cls.id})" class="text-blue-600 hover:underline mr-3">Edit</button>
        <button onclick="deleteClass(${cls.id})" class="text-red-600 hover:underline">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openClassForm(id) {
  const card = document.getElementById('classFormCard');
  const form = document.getElementById('classForm');
  form.reset();
  card.classList.remove('hidden');

  if (id) {
    const cls = allClasses.find(c => c.id === id);
    document.getElementById('classFormTitle').textContent = 'Edit Class';
    document.getElementById('classId').value = cls.id;
    document.getElementById('classTitle').value = cls.title;
    document.getElementById('classDescription').value = cls.description || '';
    document.getElementById('classSubject').value = cls.subject;
    document.getElementById('classFormat').value = cls.format;
    document.getElementById('classAgeMin').value = cls.ageMin;
    document.getElementById('classAgeMax').value = cls.ageMax;
    document.getElementById('classPrice').value = cls.price;
    document.getElementById('classPriceUnit').value = cls.priceUnit || '';
    document.getElementById('classCapacity').value = cls.capacity;
    document.getElementById('classRating').value = cls.rating ?? '';
    document.getElementById('classSchedule').value = cls.schedule || '';
    document.getElementById('classImage').value = cls.image || '';
  } else {
    document.getElementById('classFormTitle').textContent = 'Add Class';
    document.getElementById('classId').value = '';
  }

  card.scrollIntoView({ behavior: 'smooth' });
}

function closeClassForm() {
  document.getElementById('classFormCard').classList.add('hidden');
}

document.getElementById('classForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('classId').value;
  const payload = {
    title: document.getElementById('classTitle').value,
    description: document.getElementById('classDescription').value,
    subject: document.getElementById('classSubject').value,
    format: document.getElementById('classFormat').value,
    ageMin: document.getElementById('classAgeMin').value,
    ageMax: document.getElementById('classAgeMax').value,
    price: document.getElementById('classPrice').value,
    priceUnit: document.getElementById('classPriceUnit').value || 'per class',
    capacity: document.getElementById('classCapacity').value,
    rating: document.getElementById('classRating').value || null,
    schedule: document.getElementById('classSchedule').value,
    image: document.getElementById('classImage').value,
  };

  try {
    if (id) {
      await api(`/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Class updated.');
    } else {
      await api('/classes', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Class created.');
    }
    closeClassForm();
    await loadClasses();
  } catch (err) {
    showToast(err.message, true);
  }
});

async function deleteClass(id) {
  if (!confirm('Delete this class? This cannot be undone.')) return;
  try {
    await api(`/classes/${id}`, { method: 'DELETE' });
    showToast('Class deleted.');
    await loadClasses();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Bookings ----------

async function loadBookings() {
  const data = await api('/bookings');
  const tbody = document.getElementById('bookingsTableBody');
  tbody.innerHTML = '';

  if (data.bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No bookings yet.</td></tr>';
    return;
  }

  data.bookings.forEach(b => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    const statusColor = b.status === 'cancelled' ? 'text-red-500' : 'text-green-600';
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(b.class ? b.class.title : '—')}</td>
      <td class="px-4 py-3">${escapeHtml(b.studentName)}${b.studentAge ? ' (' + b.studentAge + ')' : ''}</td>
      <td class="px-4 py-3">${escapeHtml(b.studentGrade || '—')}</td>
      <td class="px-4 py-3">${b.parent ? escapeHtml(b.parent.name) + '<br><span class="text-xs text-gray-400">' + escapeHtml(b.parent.email) + '</span>' : '—'}</td>
      <td class="px-4 py-3 ${statusColor} capitalize">${escapeHtml(b.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-400">${new Date(b.createdAt).toLocaleDateString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Workshop Events ----------
// The events that appear on the Workshop Calendar (routes/events.js, `events`
// table). Same columns the old Google Sheet had. Draft events are hidden from
// the public; Published ones show up immediately. A recurring event (Weekly /
// Every 2 Weeks / Monthly) is one row that expands into dated sessions, each
// with its own seats.

let allEvents = [];

function fmtEventDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// "9:00 AM" -> "09:00" for <input type="time">
function timeTo24h(t) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t || '');
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return String(h).padStart(2, '0') + ':' + m[2];
}

async function loadEvents() {
  const data = await api('/events/admin');
  allEvents = data.events;
  const tbody = document.getElementById('eventsTableBody');
  tbody.innerHTML = '';

  if (allEvents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-6 text-center text-gray-400">No events yet. Click “Add Event” to create one.</td></tr>';
    return;
  }

  allEvents.forEach(ev => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    const live = ev.status === 'Published';
    const recur = ev.recurrence !== 'None'
      ? `<br><span class="text-xs text-gray-400">${escapeHtml(ev.recurrence)} until ${escapeHtml(ev.recurrenceEnds)}${ev.skipDates ? ' (skip ' + escapeHtml(ev.skipDates.split(',').length) + ')' : ''}</span>`
      : '';
    tr.innerHTML = `
      <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-semibold ${live ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${escapeHtml(ev.status)}</span></td>
      <td class="px-4 py-3 font-medium">${escapeHtml(ev.name)}<br><span class="text-xs text-gray-400">${escapeHtml(ev.category)} &middot; ${escapeHtml(ev.slug)}</span></td>
      <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(fmtEventDate(ev.date))}${recur}</td>
      <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(ev.startTime)}&ndash;${escapeHtml(ev.endTime)}</td>
      <td class="px-4 py-3">${escapeHtml(ev.eventType)}</td>
      <td class="px-4 py-3">${escapeHtml(ev.grades.join(', '))}</td>
      <td class="px-4 py-3">${ev.capacity}${ev.registrations ? '<br><span class="text-xs text-gray-400">' + ev.registrations + ' registered</span>' : ''}</td>
      <td class="px-4 py-3 whitespace-nowrap">${ev.price == null ? '<span class="text-gray-400">—</span>' : Number(ev.price) === 0 ? 'Free' : '$' + escapeHtml(Number(ev.price).toFixed(Number(ev.price) % 1 ? 2 : 0))}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="openEventForm(${ev.id})" class="text-blue-600 hover:underline mr-3">Edit</button>
        <button onclick="deleteEvent(${ev.id})" class="text-red-600 hover:underline">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleEventRecurrenceFields() {
  const recurring = document.getElementById('eventRecurrence').value !== 'None';
  document.getElementById('eventRecurrenceFields').classList.toggle('hidden', !recurring);
}
document.getElementById('eventRecurrence').addEventListener('change', toggleEventRecurrenceFields);

function openEventForm(id) {
  const card = document.getElementById('eventFormCard');
  const form = document.getElementById('eventForm');
  const errEl = document.getElementById('eventFormError');
  form.reset();
  errEl.classList.add('hidden');
  card.classList.remove('hidden');
  const slugEl = document.getElementById('eventSlug');

  if (id) {
    const ev = allEvents.find(x => x.id === id);
    document.getElementById('eventFormTitle').textContent = 'Edit Event';
    document.getElementById('eventRowId').value = ev.id;
    document.getElementById('eventStatus').value = ev.status;
    slugEl.value = ev.slug;
    slugEl.disabled = true; // registrations point at it, so it can't change
    document.getElementById('eventName').value = ev.name;
    document.getElementById('eventCategory').value = ev.category;
    document.getElementById('eventType').value = ev.eventType;
    document.getElementById('eventGrades').value = ev.grades.join(', ');
    document.getElementById('eventDate').value = ev.date;
    document.getElementById('eventRecurrence').value = ev.recurrence;
    document.getElementById('eventRecurrenceEnds').value = ev.recurrenceEnds || '';
    document.getElementById('eventSkipDates').value = ev.skipDates || '';
    document.getElementById('eventStartTime').value = timeTo24h(ev.startTime);
    document.getElementById('eventEndTime').value = timeTo24h(ev.endTime);
    document.getElementById('eventCapacity').value = ev.capacity;
    document.getElementById('eventPrice').value = ev.price == null ? '' : ev.price;
  } else {
    document.getElementById('eventFormTitle').textContent = 'Add Event';
    document.getElementById('eventRowId').value = '';
    slugEl.disabled = false;
    document.getElementById('eventCapacity').value = 20;
    document.getElementById('eventPrice').value = '';
  }
  toggleEventRecurrenceFields();
  card.scrollIntoView({ behavior: 'smooth' });
}

function closeEventForm() {
  document.getElementById('eventFormCard').classList.add('hidden');
}

document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('eventFormError');
  errEl.classList.add('hidden');

  const id = document.getElementById('eventRowId').value;
  const payload = {
    status: document.getElementById('eventStatus').value,
    slug: document.getElementById('eventSlug').value,
    name: document.getElementById('eventName').value,
    category: document.getElementById('eventCategory').value,
    eventType: document.getElementById('eventType').value,
    grades: document.getElementById('eventGrades').value,
    date: document.getElementById('eventDate').value,
    recurrence: document.getElementById('eventRecurrence').value,
    recurrenceEnds: document.getElementById('eventRecurrenceEnds').value,
    skipDates: document.getElementById('eventSkipDates').value,
    startTime: document.getElementById('eventStartTime').value,
    endTime: document.getElementById('eventEndTime').value,
    capacity: document.getElementById('eventCapacity').value,
    price: document.getElementById('eventPrice').value,
  };

  try {
    if (id) {
      await api(`/events/admin/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Event updated.');
    } else {
      await api('/events/admin', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Event added.');
    }
    closeEventForm();
    await loadEvents();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function deleteEvent(id) {
  const ev = allEvents.find(x => x.id === id);
  const warn = ev && ev.registrations
    ? `\n\n${ev.registrations} ${ev.registrations === 1 ? 'family is' : 'families are'} registered for it. Their registrations stay on record, but the event disappears from the calendar. (To just hide it, set Status to Draft instead.)`
    : '';
  if (!confirm(`Delete “${ev ? ev.name : 'this event'}”? This cannot be undone.${warn}`)) return;
  try {
    await api(`/events/admin/${id}`, { method: 'DELETE' });
    showToast('Event deleted.');
    await loadEvents();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Workshop Event Registrations ----------
// Who registered for which event (stored in this app's own database, tied
// to a real account). The events themselves are managed just above.

async function loadEventRegistrations() {
  const data = await api('/events/registrations');
  const tbody = document.getElementById('eventRegistrationsTableBody');
  tbody.innerHTML = '';

  if (data.registrations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No registrations yet.</td></tr>';
    return;
  }

  data.registrations.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    const statusColor = r.status === 'cancelled' ? 'text-red-500' : (r.status === 'waitlist' ? 'text-amber-600' : 'text-green-600');
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(r.eventName)}<br><span class="text-xs text-gray-400">${escapeHtml(r.eventDate)}</span></td>
      <td class="px-4 py-3">${escapeHtml(r.studentName)}${r.studentAge ? ' (' + r.studentAge + ')' : ''}</td>
      <td class="px-4 py-3">${escapeHtml(r.studentGrade)}</td>
      <td class="px-4 py-3">${r.parent ? escapeHtml(r.parent.name) + '<br><span class="text-xs text-gray-400">' + escapeHtml(r.parent.email) + '</span>' : '—'}</td>
      <td class="px-4 py-3 ${statusColor} capitalize">${escapeHtml(r.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-400">${new Date(r.createdAt).toLocaleDateString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Users ----------

let allUsers = []; // kept around for the Students "parent account" picker below

async function loadUsers() {
  const data = await api('/auth/users');
  allUsers = data.users;
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  if (data.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400">No users yet.</td></tr>';
    return;
  }

  data.users.forEach(u => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(u.name)}</td>
      <td class="px-4 py-3">${escapeHtml(u.email)}</td>
      <td class="px-4 py-3 capitalize">${escapeHtml(u.role)}</td>
      <td class="px-4 py-3 text-xs text-gray-400">${new Date(u.createdAt).toLocaleDateString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Students ----------
// A parent's children (routes/students.js). Unlike bookings/registrations
// (which admin can only view and cancel), students are fully managed from
// here too — an admin can add one for any parent account, not just view
// what parents added themselves via "My Students" on the main site.

let allStudents = [];

async function loadStudents() {
  const data = await api('/students');
  allStudents = data.students;
  populateEnrollStudents();
  const tbody = document.getElementById('studentsTableBody');
  tbody.innerHTML = '';

  if (allStudents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No students yet.</td></tr>';
    return;
  }

  allStudents.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'border-t';
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${escapeHtml(s.name)}</td>
      <td class="px-4 py-3">${escapeHtml(s.grade || '—')}</td>
      <td class="px-4 py-3">${s.age || '—'}</td>
      <td class="px-4 py-3">${s.parent ? escapeHtml(s.parent.name) + '<br><span class="text-xs text-gray-400">' + escapeHtml(s.parent.email) + '</span>' : '—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${escapeHtml(s.notes || '')}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="openStudentForm(${s.id})" class="text-blue-600 hover:underline mr-3">Edit</button>
        <button onclick="deleteStudent(${s.id})" class="text-red-600 hover:underline">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateStudentParentOptions(selectedUserId) {
  const sel = document.getElementById('studentParent');
  sel.innerHTML = '<option value="" disabled>Select a parent account&hellip;</option>';
  allUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.email})`;
    sel.appendChild(opt);
  });
  sel.value = selectedUserId ? String(selectedUserId) : '';
}

function openStudentForm(id) {
  const card = document.getElementById('studentFormCard');
  const form = document.getElementById('studentForm');
  const errEl = document.getElementById('studentFormError');
  form.reset();
  errEl.classList.add('hidden');
  card.classList.remove('hidden');

  if (id) {
    const s = allStudents.find(x => x.id === id);
    document.getElementById('studentFormTitle').textContent = 'Edit Student';
    document.getElementById('studentId').value = s.id;
    document.getElementById('studentName').value = s.name;
    document.getElementById('studentGrade').value = s.grade || '';
    document.getElementById('studentAge').value = s.age || '';
    document.getElementById('studentNotes').value = s.notes || '';
    populateStudentParentOptions(s.userId);
  } else {
    document.getElementById('studentFormTitle').textContent = 'Add Student';
    document.getElementById('studentId').value = '';
    populateStudentParentOptions(null);
  }

  card.scrollIntoView({ behavior: 'smooth' });
}

function closeStudentForm() {
  document.getElementById('studentFormCard').classList.add('hidden');
}

document.getElementById('studentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('studentFormError');
  errEl.classList.add('hidden');

  const id = document.getElementById('studentId').value;
  const payload = {
    userId: document.getElementById('studentParent').value,
    name: document.getElementById('studentName').value,
    grade: document.getElementById('studentGrade').value,
    age: document.getElementById('studentAge').value,
    notes: document.getElementById('studentNotes').value,
  };

  try {
    if (id) {
      await api(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Student updated.');
    } else {
      await api('/students/admin', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Student added.');
    }
    closeStudentForm();
    await loadStudents();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function deleteStudent(id) {
  if (!confirm('Remove this student? This only removes their saved info — any past bookings are unaffected.')) return;
  try {
    await api(`/students/${id}`, { method: 'DELETE' });
    showToast('Student removed.');
    await loadStudents();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Init ----------
showCorrectScreen();


// ---------- Leads ----------
// Free-assessment requests from public/assessment.html (routes/leads.js).
// Status and notes save as soon as you change them.

let allLeads = [];
let leadStatuses = ['New', 'Contacted', 'Assessed', 'Enrolled', 'Lost'];

const LEAD_STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
  Assessed: 'bg-purple-50 text-purple-700',
  Enrolled: 'bg-green-50 text-green-700',
  Lost: 'bg-gray-100 text-gray-500',
};

async function loadLeads() {
  const data = await api('/leads');
  allLeads = data.leads;
  leadStatuses = data.statuses || leadStatuses;
  const filter = document.getElementById('leadStatusFilter');
  if (filter.options.length === 1) {
    leadStatuses.forEach((s) => filter.add(new Option(s, s)));
  }
  renderLeads();
}

function renderLeads() {
  const summary = document.getElementById('leadSummary');
  summary.innerHTML = leadStatuses
    .map((s) => {
      const n = allLeads.filter((l) => l.status === s).length;
      return `<span class="px-3 py-1 rounded-full font-medium ${LEAD_STATUS_COLORS[s] || 'bg-gray-100'}">${escapeHtml(s)}: ${n}</span>`;
    })
    .join('');

  const filter = document.getElementById('leadStatusFilter').value;
  const leads = filter ? allLeads.filter((l) => l.status === filter) : allLeads;
  const tbody = document.getElementById('leadsTableBody');
  tbody.innerHTML = '';

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No leads yet.</td></tr>';
    return;
  }

  leads.forEach((l) => {
    const tr = document.createElement('tr');
    tr.className = 'border-t align-top';
    const source = l.qrCode
      ? `<span class="inline-block bg-yellow-50 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium"><i class="fa-solid fa-qrcode mr-1"></i>${escapeHtml(l.qrCode)}</span>`
      : escapeHtml([l.utmSource, l.utmMedium].filter(Boolean).join(' / ') || 'Direct');
    const options = leadStatuses
      .map((s) => `<option value="${escapeHtml(s)}" ${s === l.status ? 'selected' : ''}>${escapeHtml(s)}</option>`)
      .join('');
    const phoneDigits = (l.phone || '').replace(/[^\d+]/g, '');
    tr.innerHTML = `
      <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${new Date(l.createdAt).toLocaleDateString()}<br>${new Date(l.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
      <td class="px-4 py-3">
        <div class="font-medium">${escapeHtml(l.parentName)}</div>
        <a href="tel:${escapeHtml(phoneDigits)}" class="text-blue-600 text-xs hover:underline">${escapeHtml(l.phone)}</a><br>
        <a href="mailto:${escapeHtml(l.email)}" class="text-blue-600 text-xs hover:underline break-all">${escapeHtml(l.email)}</a>
      </td>
      <td class="px-4 py-3">
        <div class="font-medium">${escapeHtml(l.childName || '—')}</div>
        <div>Grade ${escapeHtml(l.studentGrade)}</div>
        <div class="text-xs text-gray-500">${escapeHtml(l.interests || '—')}</div>
        ${l.message ? `<div class="text-xs text-gray-600 mt-1 italic max-w-xs">“${escapeHtml(l.message)}”</div>` : ''}
      </td>
      <td class="px-4 py-3">${source}${l.utmCampaign ? `<div class="text-xs text-gray-400 mt-1">${escapeHtml(l.utmCampaign)}</div>` : ''}</td>
      <td class="px-4 py-3">
        <select data-lead-status="${l.id}" class="border border-gray-300 rounded-lg px-2 py-1 text-sm ${LEAD_STATUS_COLORS[l.status] || ''}">${options}</select>
      </td>
      <td class="px-4 py-3">
        <textarea data-lead-notes="${l.id}" rows="2" placeholder="Add a note…" class="w-48 border border-gray-200 rounded-lg px-2 py-1 text-xs">${escapeHtml(l.adminNotes)}</textarea>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveLead(id, changes) {
  try {
    const data = await api('/leads/' + id, { method: 'PATCH', body: JSON.stringify(changes) });
    const i = allLeads.findIndex((l) => l.id === id);
    if (i >= 0) allLeads[i] = data.lead;
    showToast('Lead updated.');
  } catch (err) {
    showToast(err.message, true);
  }
}

document.getElementById('leadsTableBody').addEventListener('change', async (e) => {
  const statusId = e.target.getAttribute('data-lead-status');
  const notesId = e.target.getAttribute('data-lead-notes');
  if (statusId) {
    await saveLead(Number(statusId), { status: e.target.value });
    renderLeads();
    loadQrLinks(); // lead counts per QR don't change, but keep things fresh
  } else if (notesId) {
    await saveLead(Number(notesId), { adminNotes: e.target.value });
  }
});

// ---------- QR Campaigns ----------
// Trackable QR links (routes/qr.js). The printed QR contains /go/<code>;
// the server counts the scan and redirects with UTM tags. Destination and
// tags can be edited after printing — the code can't.

let allQrLinks = [];

async function loadQrLinks() {
  const data = await api('/qr');
  allQrLinks = data.links;
  const tbody = document.getElementById('qrTableBody');
  tbody.innerHTML = '';

  if (allQrLinks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">No QR codes yet.</td></tr>';
    return;
  }

  allQrLinks.forEach((q) => {
    const tr = document.createElement('tr');
    tr.className = 'border-t align-top' + (q.active ? '' : ' opacity-50');
    const last = q.lastScan ? 'Last scan ' + new Date(q.lastScan).toLocaleDateString() : 'No scans yet';
    tr.innerHTML = `
      <td class="px-4 py-3">
        <a href="/api/qr/${q.id}/image.png" target="_blank" title="Open full size">
          <img src="/api/qr/${q.id}/image.svg" alt="QR code for ${escapeHtml(q.code)}" class="w-16 h-16 border rounded-lg bg-white">
        </a>
      </td>
      <td class="px-4 py-3">
        <div class="font-medium">${escapeHtml(q.label || q.code)}${q.active ? '' : ' <span class="text-xs text-gray-500">(off)</span>'}</div>
        <a href="${escapeHtml(q.shortUrl)}" target="_blank" class="text-blue-600 text-xs hover:underline break-all">${escapeHtml(q.shortUrl)}</a>
        <div class="text-xs text-gray-400 mt-1">${escapeHtml(last)}</div>
      </td>
      <td class="px-4 py-3 text-xs text-gray-600 break-all max-w-xs">${escapeHtml(q.targetUrl)}</td>
      <td class="px-4 py-3 text-right font-semibold">${q.scans}</td>
      <td class="px-4 py-3 text-right">${q.scans7d}</td>
      <td class="px-4 py-3 text-right font-semibold">${q.leads}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <a href="/api/qr/${q.id}/image.png?download=1" class="text-blue-600 hover:underline text-xs mr-2">PNG</a>
        <a href="/api/qr/${q.id}/image.svg?download=1" class="text-blue-600 hover:underline text-xs mr-3">SVG</a>
        <button onclick="openQrForm(${q.id})" class="text-blue-600 hover:underline text-xs">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openQrForm(id) {
  const q = id ? allQrLinks.find((x) => x.id === id) : null;
  document.getElementById('qrFormTitle').textContent = q ? 'Edit QR Code' : 'New QR Code';
  document.getElementById('qrId').value = q ? q.id : '';
  const codeEl = document.getElementById('qrCode');
  codeEl.value = q ? q.code : '';
  codeEl.disabled = !!q;
  document.getElementById('qrLabel').value = q ? q.label : '';
  document.getElementById('qrDestination').value = q ? q.destination : '/assessment.html';
  document.getElementById('qrUtmSource').value = q ? q.utmSource : '';
  document.getElementById('qrUtmCampaign').value = q ? q.utmCampaign : 'free_assessment';
  document.getElementById('qrActive').checked = q ? q.active : true;
  document.getElementById('qrFormError').classList.add('hidden');
  document.getElementById('qrFormCard').classList.remove('hidden');
  document.getElementById('qrFormCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeQrForm() {
  document.getElementById('qrFormCard').classList.add('hidden');
}

document.getElementById('qrForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('qrFormError');
  errorEl.classList.add('hidden');
  const id = document.getElementById('qrId').value;
  const payload = {
    label: document.getElementById('qrLabel').value,
    destination: document.getElementById('qrDestination').value,
    utmSource: document.getElementById('qrUtmSource').value,
    utmCampaign: document.getElementById('qrUtmCampaign').value,
    active: document.getElementById('qrActive').checked,
  };
  if (!id) payload.code = document.getElementById('qrCode').value;
  try {
    await api(id ? '/qr/' + id : '/qr', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    closeQrForm();
    await loadQrLinks();
    showToast(id ? 'QR code updated.' : 'QR code created — download the PNG or SVG to print.');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ---------- Attendance & Reports (Parent Portal) ----------

let attSessions = [];
let attRoster = null; // { session, roster }
let attEnroll = { weekdays: [], enrollments: [] };

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

// Toggle-able day "pills". selected = array of weekday numbers.
function dayPills(days, selected, onClick) {
  return days.map((d) => {
    const on = selected.includes(d);
    return `<button type="button" data-day="${d}" aria-pressed="${on}" onclick="${onClick}"
      class="daypill px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}">${WEEKDAY_SHORT[d]}</button>`;
  }).join('');
}
function pillsSelected(container) {
  return [...container.querySelectorAll('.daypill[aria-pressed="true"]')].map((b) => Number(b.dataset.day));
}
function flipPill(btn) {
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', on);
  btn.className = btn.className.replace(/bg-blue-600 text-white border-blue-600|bg-white text-gray-600 border-gray-300 hover:border-blue-400/,
    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400');
  return on;
}

// ----- "Add class dates" form: days + repeat -----
function renderSessDays(selected = []) {
  document.getElementById('sessDays').innerHTML = dayPills(WEEKDAY_ORDER, selected, 'flipPill(this); updateSessPreview()');
}
function syncStartDay() {
  const start = document.getElementById('sessStart').value;
  const box = document.getElementById('sessDays');
  if (start && pillsSelected(box).length === 0) {
    const d = new Date(start + 'T00:00:00Z').getUTCDay();
    const btn = box.querySelector(`[data-day="${d}"]`);
    if (btn) flipPill(btn);
  }
  updateSessPreview();
}
function toggleRepeatFields() {
  const once = document.getElementById('sessRepeat').value === '1';
  document.querySelectorAll('#addSessionsForm .repeat-only').forEach((el) => el.classList.toggle('hidden', once));
  updateSessPreview();
}
// Builds the list of dates the form describes.
function buildSessDates() {
  const start = document.getElementById('sessStart').value;
  if (!start) return [];
  const step = parseInt(document.getElementById('sessRepeat').value, 10);
  if (step === 1) return [start];
  const weeks = Math.min(52, Math.max(1, parseInt(document.getElementById('sessCount').value, 10) || 1));
  const skip = new Set(document.getElementById('sessSkip').value.split(',').map((x) => x.trim()).filter(Boolean));
  let days = pillsSelected(document.getElementById('sessDays'));
  if (!days.length) days = [new Date(start + 'T00:00:00Z').getUTCDay()];
  const base = new Date(start + 'T00:00:00Z');
  const dates = [];
  for (const d of days) {
    const first = new Date(base);
    first.setUTCDate(base.getUTCDate() + ((d - base.getUTCDay() + 7) % 7)); // first such weekday on/after start
    for (let w = 0; w < weeks; w++) {
      const dt = new Date(first);
      dt.setUTCDate(first.getUTCDate() + w * step);
      const iso = dt.toISOString().slice(0, 10);
      if (!skip.has(iso)) dates.push(iso);
    }
  }
  return dates.sort();
}
function updateSessPreview() {
  const dates = buildSessDates();
  document.getElementById('sessPreview').textContent = dates.length
    ? `Will add ${dates.length} date${dates.length === 1 ? '' : 's'}: ${attFmtDate(dates[0])}${dates.length > 1 ? ' → ' + attFmtDate(dates[dates.length - 1]) : ''}`
    : '';
}
['sessCount', 'sessSkip'].forEach((id) => document.getElementById(id).addEventListener('input', updateSessPreview));
renderSessDays();

function attFmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function attFmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function populateAttendanceClasses() {
  const sel = document.getElementById('attClass');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select a class…</option>' +
    allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  if (current) sel.value = current;
}

async function loadSessions() {
  const classId = document.getElementById('attClass').value;
  document.getElementById('addSessionsForm').classList.toggle('hidden', !classId);
  document.getElementById('sessionsCard').classList.toggle('hidden', !classId);
  document.getElementById('enrollCard').classList.toggle('hidden', !classId);
  if (!classId) return;
  loadEnrollments();

  const data = await api(`/portal/admin/sessions?classId=${classId}`);
  attSessions = data.sessions;
  const tbody = document.getElementById('sessionsTableBody');
  if (!attSessions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No dates yet — add some above.</td></tr>';
    return;
  }
  tbody.innerHTML = attSessions.map((s) => {
    const marked = s.present + s.absent;
    const past = s.date <= data.today;
    const status = marked
      ? `<span class="text-green-700">${s.present} present</span> · <span class="text-red-600">${s.absent} absent</span>${marked < s.enrolled ? ` · <span class="text-gray-400">${s.enrolled - marked} not marked</span>` : ''}`
      : (past && s.enrolled ? '<span class="text-orange-600 font-medium">Not taken yet</span>' : '<span class="text-gray-400">—</span>');
    return `
      <tr class="border-t">
        <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(attFmtDate(s.date))}</td>
        <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(attFmtTime(s.startTime))}${s.endTime ? ' – ' + escapeHtml(attFmtTime(s.endTime)) : ''}</td>
        <td class="px-4 py-3">
          <input value="${escapeHtml(s.topic)}" placeholder="Add topic" onchange="updateSessionTopic(${s.id}, this.value)"
                 class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded-lg px-2 py-1 text-sm">
        </td>
        <td class="px-4 py-3 text-xs whitespace-nowrap">${status}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button onclick="deleteSession(${s.id})" class="text-red-500 hover:underline">Delete</button>
        </td>
      </tr>`;
  }).join('');
}

document.getElementById('addSessionsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const classId = document.getElementById('attClass').value;
  const dates = buildSessDates();
  if (!dates.length) return showToast('Pick a start date.', true);

  try {
    const data = await api('/portal/admin/sessions', {
      method: 'POST',
      body: JSON.stringify({
        classId,
        dates,
        startTime: document.getElementById('sessStartTime').value,
        endTime: document.getElementById('sessEndTime').value,
      }),
    });
    showToast(`Added ${data.created.length} date(s)${data.skipped ? `, skipped ${data.skipped} duplicate(s)` : ''}.`);
    loadSessions();
  } catch (err) {
    showToast(err.message, true);
  }
});

async function updateSessionTopic(id, topic) {
  try {
    await api(`/portal/admin/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ topic }) });
    showToast('Topic saved.');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteSession(id) {
  const s = attSessions.find((x) => x.id === id);
  if (!confirm(`Delete ${attFmtDate(s.date)}? Any attendance and reports for this date will also be removed.`)) return;
  try {
    await api(`/portal/admin/sessions/${id}`, { method: 'DELETE' });
    showToast('Date deleted.');
    loadSessions();
  } catch (err) {
    showToast(err.message, true);
  }
}

function closeRoster() {
  attRoster = null;
  document.getElementById('rosterCard').classList.add('hidden');
  document.getElementById('arPlaceholder').classList.remove('hidden');
}

// Opens the attendance + report form for one date, for the student picked
// in Attendance & Reports.
async function openRoster(sessionId) {
  try {
    attRoster = await api(`/portal/admin/sessions/${sessionId}/roster`);
  } catch (err) {
    return showToast(err.message, true);
  }
  attRoster.classCount = attRoster.roster.length;
  attRoster.roster = attRoster.roster.filter((r) => r.studentId === arState.studentId);
  const { session } = attRoster;
  document.getElementById('rosterTitle').textContent = `${session.classTitle} — ${attFmtDate(session.date)}`;
  document.getElementById('rosterSub').textContent = arState.studentName + (session.topic ? ' · ' + session.topic : '');
  document.getElementById('rosterDate').value = session.date;
  document.getElementById('rosterStart').value = session.startTime || '';
  document.getElementById('rosterEnd').value = session.endTime || '';
  const others = attRoster.classCount > 1 ? ` (${attRoster.classCount} students)` : '';
  document.getElementById('rosterWhenNote').textContent =
    `Changing the date or time moves this class for everyone in it on this date${others}. Saved with the report.`;
  document.querySelector('#rosterCard [onclick="markAllPresent()"]').classList.add('hidden');
  document.querySelector('#rosterCard [onclick="closeRoster()"]').classList.add('hidden');

  renderRoster();
  document.getElementById('arPlaceholder').classList.add('hidden');
  document.getElementById('rosterCard').classList.remove('hidden');
}

function renderRoster() {
  const list = document.getElementById('rosterList');
  const { roster } = attRoster;
  if (!roster.length) {
    list.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No students enrolled in this class yet.</p>';
    return;
  }
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${label}</option>`;
  list.innerHTML = roster.map((r, i) => {
    if (r.unlinked) {
      return `<div class="border border-dashed rounded-2xl p-4 text-sm text-gray-500"><b>${escapeHtml(r.name)}</b> — booking isn't linked to a saved student, so a report can't be attached. Add them under Students for that parent.</div>`;
    }
    const rec = r.record || {};
    return `
      <div class="border rounded-2xl p-4" data-idx="${i}">
        <div class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-12">
            <p class="font-semibold">${escapeHtml(r.name)}</p>
            <p class="text-xs text-gray-400">${escapeHtml(r.grade || '')}</p>
          </div>
          <div class="sm:col-span-3">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Attendance</label>
            <select data-f="attendance" onchange="toggleReportFields(${i})" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              ${opt('', '— Not marked', rec.attendance)}${opt('present', '✓ Present', rec.attendance)}${opt('absent', '✗ Absent', rec.attendance)}
            </select>
          </div>
          <div class="sm:col-span-3 rf">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Score (0–100)</label>
            <input data-f="score" type="number" min="0" max="100" value="${rec.score ?? ''}" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
          </div>
          <div class="sm:col-span-3 rf">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Participation</label>
            <select data-f="participation" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              ${opt('', '—', rec.participation)}${[1, 2, 3, 4, 5].map((n) => opt(n, '★'.repeat(n), rec.participation)).join('')}
            </select>
          </div>
          <div class="sm:col-span-3 rf">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Homework</label>
            <select data-f="homework" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              ${opt('', '—', rec.homework)}${opt('complete', 'Complete', rec.homework)}${opt('partial', 'Partial', rec.homework)}${opt('missing', 'Missing', rec.homework)}${opt('none', 'None assigned', rec.homework)}
            </select>
          </div>
        </div>
        <div class="rf grid sm:grid-cols-2 gap-3 mt-3">
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">What we covered</label><textarea data-f="skills" rows="2" placeholder="What we covered / skills practiced" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">${escapeHtml(rec.skills || '')}</textarea></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Strengths</label><textarea data-f="strengths" rows="2" placeholder="Strengths" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">${escapeHtml(rec.strengths || '')}</textarea></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Areas to work on</label><textarea data-f="improve" rows="2" placeholder="Areas to work on" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">${escapeHtml(rec.improve || '')}</textarea></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Comments for the parent</label><textarea data-f="comments" rows="2" placeholder="Comments for the parent" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">${escapeHtml(rec.comments || '')}</textarea></div>
        </div>
      </div>`;
  }).join('');
  roster.forEach((r, i) => { if (!r.unlinked) toggleReportFields(i); });
}

// Report fields only apply to students marked present.
function toggleReportFields(i) {
  const card = document.querySelector(`#rosterList [data-idx="${i}"]`);
  const present = card.querySelector('[data-f="attendance"]').value === 'present';
  card.querySelectorAll('.rf').forEach((el) => {
    el.style.opacity = present ? '1' : '0.35';
    el.querySelectorAll('input,select,textarea').forEach((f) => { f.disabled = !present; });
  });
}

function markAllPresent() {
  document.querySelectorAll('#rosterList [data-idx]').forEach((card) => {
    const sel = card.querySelector('[data-f="attendance"]');
    if (!sel.value) sel.value = 'present';
    toggleReportFields(Number(card.dataset.idx));
  });
}

async function saveRoster() {
  const records = [];
  document.querySelectorAll('#rosterList [data-idx]').forEach((card) => {
    const r = attRoster.roster[Number(card.dataset.idx)];
    const rec = { studentId: r.studentId };
    card.querySelectorAll('[data-f]').forEach((f) => { rec[f.dataset.f] = f.value; });
    records.push(rec);
  });
  const sess = attRoster.session;
  const when = {
    date: document.getElementById('rosterDate').value,
    startTime: document.getElementById('rosterStart').value,
    endTime: document.getElementById('rosterEnd').value,
  };
  if (!when.date) return showToast('Pick a date.', true);
  const whenChanged = when.date !== sess.date || when.startTime !== (sess.startTime || '') || when.endTime !== (sess.endTime || '');
  if (whenChanged && attRoster.classCount > 1 &&
      !confirm(`This moves the class on ${attFmtDate(sess.date)} for all ${attRoster.classCount} students in it. Continue?`)) return;
  try {
    let moveNote = '';
    if (whenChanged) {
      const r = await api(`/portal/admin/sessions/${sess.id}`, { method: 'PUT', body: JSON.stringify(when) });
      if (r.notShownTo && r.notShownTo.length) {
        moveNote = ` Note: ${r.notShownTo.join(', ')} won't see this date (it's not on their days).`;
      }
    }
    await api(`/portal/admin/sessions/${sess.id}/records`, { method: 'PUT', body: JSON.stringify({ records }) });
    showToast((whenChanged ? 'Date/time and report saved.' : 'Attendance & report saved.') + moveNote, !!moveNote);
    const id = attRoster.session.id;
    if (document.getElementById('attClass').value) loadSessions(); // refresh Class Dates counts
    await loadArDates(id);
  } catch (err) {
    showToast(err.message, true);
  }
}

// ----- Enrolled students panel -----
async function loadEnrollments() {
  const classId = document.getElementById('attClass').value;
  if (!classId) return;
  try {
    attEnroll = await api(`/portal/admin/classes/${classId}/enrollments`);
  } catch (err) {
    return showToast(err.message, true);
  }
  renderEnrollments();
}

function renderEnrollments() {
  const { weekdays, enrollments } = attEnroll;
  const ordered = WEEKDAY_ORDER.filter((d) => weekdays.includes(d));
  document.getElementById('enrollCount').textContent = `(${enrollments.length})`;

  const list = document.getElementById('enrollList');
  list.innerHTML = enrollments.length ? enrollments.map((e) => {
    const selected = e.days.length ? e.days : ordered; // empty = every day
    return `
      <div class="flex flex-wrap items-center gap-3 py-3" data-booking="${e.bookingId}">
        <div class="flex-1 min-w-[180px]">
          <p class="font-medium text-sm">${escapeHtml(e.name)} <span class="text-gray-400 font-normal">${escapeHtml(e.grade)}</span></p>
          <p class="text-xs text-gray-400">Parent: ${escapeHtml(e.parentName || '—')}${e.startDate ? ' · starts ' + escapeHtml(attFmtDate(e.startDate)) : ''}${e.sessions ? ' · ' + e.sessions + ' sessions, ends ' + escapeHtml(attFmtDate(e.endDate)) : ''}</p>
        </div>
        <div class="flex flex-wrap gap-2">${ordered.length > 1
          ? dayPills(ordered, selected, `saveEnrollmentDays(this, ${e.bookingId})`)
          : `<span class="text-xs text-gray-500">${ordered.length ? 'Every ' + WEEKDAY_SHORT[ordered[0]] : 'All dates'}</span>`}</div>
        <button onclick="unenrollStudent(${e.bookingId}, '${escapeHtml(e.name).replace(/'/g, "\\'")}')" class="text-xs text-red-500 hover:underline">Unenroll</button>
      </div>`;
  }).join('') : '<p class="text-sm text-gray-400 py-3">No students enrolled yet.</p>';

  // enroll form: student picker (not already enrolled) + day pills
  const enrolledIds = new Set(enrollments.map((e) => e.studentId));
  document.getElementById('enrollStudent').innerHTML = '<option value="">Select a student…</option>' +
    allStudents.filter((s) => !enrolledIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}${s.parent ? ' (parent: ' + escapeHtml(s.parent.name) + ')' : ''}</option>`).join('');
  document.getElementById('enrollDays').innerHTML = ordered.length
    ? dayPills(ordered, ordered, 'flipPill(this)')
    : '<span class="text-xs text-gray-400 py-2 inline-block">Add class dates first</span>';
}

async function saveEnrollmentDays(btn, bookingId) {
  const on = flipPill(btn);
  const box = btn.parentElement;
  const days = pillsSelected(box);
  if (!days.length) {
    flipPill(btn); // undo: a student needs at least one day
    return showToast('A student needs at least one day. Use Unenroll to remove them.', true);
  }
  const all = box.querySelectorAll('.daypill').length === days.length;
  try {
    await api(`/portal/admin/enrollments/${bookingId}`, { method: 'PUT', body: JSON.stringify({ days: all ? [] : days }) });
    showToast(`Saved: ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`);
    const e = attEnroll.enrollments.find((x) => x.bookingId === bookingId);
    if (e) e.days = all ? [] : days;
    loadSessionsKeepRoster();
  } catch (err) {
    flipPill(btn);
    showToast(err.message, true);
  }
  return on;
}

async function unenrollStudent(bookingId, name) {
  if (!confirm(`Unenroll ${name} from this class? Their past attendance and reports are kept.`)) return;
  try {
    await api(`/portal/admin/enrollments/${bookingId}`, { method: 'DELETE' });
    showToast(`${name} unenrolled.`);
    await loadBookings();
    loadSessionsKeepRoster();
  } catch (err) {
    showToast(err.message, true);
  }
}

// Reloads Class Dates (dates table + enrolled students), the Enroll section
// and Attendance & Reports after an enrollment change.
async function loadSessionsKeepRoster() {
  if (enrData && !afterEnrollmentChange.running) loadStudentEnrollments();
  if (arState.studentId) refreshArStudent();
  await loadSessions();
}

async function enrollStudentInClass() {
  const classId = document.getElementById('attClass').value;
  const studentId = document.getElementById('enrollStudent').value;
  if (!studentId) return showToast('Pick a student first.', true);
  const box = document.getElementById('enrollDays');
  const total = box.querySelectorAll('.daypill').length;
  const days = pillsSelected(box);
  if (total && !days.length) return showToast('Pick at least one day.', true);
  try {
    await api('/portal/admin/enroll', {
      method: 'POST',
      body: JSON.stringify({ classId, studentId, days: days.length === total ? [] : days }),
    });
    showToast('Student enrolled.');
    await loadBookings();
    loadSessionsKeepRoster();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Enroll section: student first, then classes ----------

let enrData = null; // { student, classes }

function populateEnrollStudents() {
  const sel = document.getElementById('enrStudent');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select a student…</option>' +
    [...allStudents].sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} : ${escapeHtml(s.parent ? s.parent.name : '—')}${s.grade ? ' (' + escapeHtml(s.grade) + ')' : ''}</option>`).join('');
  if (current && allStudents.some((s) => String(s.id) === current)) sel.value = current;
  else enrData = null;

  // Attendance & Reports uses the same list
  const ar = document.getElementById('arStudent');
  const arCur = ar.value;
  ar.innerHTML = sel.innerHTML;
  if (arCur && allStudents.some((s) => String(s.id) === arCur)) ar.value = arCur;
}

async function loadStudentEnrollments() {
  const id = document.getElementById('enrStudent').value;
  if (!id) {
    enrData = null;
    return renderStudentEnrollments();
  }
  try {
    enrData = await api(`/portal/admin/students/${id}/enrollments`);
  } catch (err) {
    return showToast(err.message, true);
  }
  renderStudentEnrollments();
}

function renderStudentEnrollments() {
  const list = document.getElementById('enrClasses');
  const summary = document.getElementById('enrSummary');
  document.getElementById('enrEmpty').classList.toggle('hidden', !!enrData);
  list.classList.toggle('hidden', !enrData);
  if (!enrData) { summary.classList.add('hidden'); return; }

  const daysLabel = (c) => {
    const ordered = WEEKDAY_ORDER.filter((d) => c.weekdays.includes(d));
    const days = c.enrolled.days.length ? WEEKDAY_ORDER.filter((d) => c.enrolled.days.includes(d)) : ordered;
    return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
  };
  const enrolled = enrData.classes.filter((c) => c.enrolled);
  summary.innerHTML = enrolled.length
    ? `<i class="fa-solid fa-circle-check mr-1"></i><b>${escapeHtml(enrData.student.name)}</b> is enrolled in: ` +
      enrolled.map((c) => {
        const bits = [];
        if (c.weekdays.length > 1) bits.push(daysLabel(c));
        if (c.enrolled.startDate) bits.push('from ' + attFmtDate(c.enrolled.startDate));
        if (c.enrolled.sessions) bits.push(c.enrolled.sessions + ' sessions');
        return escapeHtml(c.title) + (bits.length ? ' (' + escapeHtml(bits.join(', ')) + ')' : '');
      }).join(' · ')
    : `${escapeHtml(enrData.student.name)} isn't enrolled in any classes yet.`;
  summary.className = `mt-4 text-sm rounded-xl px-4 py-2 ${enrolled.length ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`;

  const q = document.getElementById('enrFilter').value.trim().toLowerCase();
  const rows = enrData.classes.filter((c) => !q || (c.title + ' ' + c.schedule).toLowerCase().includes(q));
  list.innerHTML = rows.length ? rows.map((c) => {
    const ordered = WEEKDAY_ORDER.filter((d) => c.weekdays.includes(d));
    const sel = c.enrolled ? (c.enrolled.days.length ? c.enrolled.days : ordered) : ordered;
    const pills = ordered.length > 1
      ? dayPills(ordered, sel, c.enrolled ? `saveStudentClassDays(this, ${c.id})` : 'flipPill(this)')
      : `<span class="text-xs text-gray-500">${ordered.length ? 'Every ' + WEEKDAY_SHORT[ordered[0]] : 'No dates yet'}</span>`;
    const action = c.enrolled
      ? `<span class="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg"><i class="fa-solid fa-check mr-1"></i>Enrolled</span>
         <button onclick="unenrollFromEnrollSection(${c.id})" class="text-xs text-red-500 hover:underline">Unenroll</button>`
      : (c.spotsLeft === 0
        ? '<span class="text-xs text-red-500 font-semibold">Full</span>'
        : `<button onclick="enrollFromEnrollSection(this, ${c.id})" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl font-semibold text-xs">Enroll</button>`);
    return `
      <div class="enr-row flex flex-wrap items-center gap-3 px-4 py-3 ${c.enrolled ? 'bg-green-50/50' : ''}">
        <div class="flex-1 min-w-[200px]">
          <p class="font-medium text-sm">${escapeHtml(c.title)}</p>
          <p class="text-xs text-gray-400">${escapeHtml(c.schedule || '')}${c.enrolled ? '' : ` · ${c.spotsLeft} spot${c.spotsLeft === 1 ? '' : 's'} left`}</p>
          ${c.enrolled ? `<label class="text-xs text-gray-500 inline-flex items-center gap-2 mt-1">Starts
            <input type="date" value="${c.enrolled.startDate || ''}" onchange="saveStudentClassStart(this, ${c.id})" class="border border-gray-300 rounded-lg px-2 py-0.5 text-xs">
            ${c.enrolled.startDate ? '' : '<span class="text-gray-400">(from the first class)</span>'}</label>
          <label class="text-xs text-gray-500 inline-flex items-center gap-2 mt-1 ml-3">Sessions
            <input type="number" min="1" max="100" value="${c.enrolled.sessions || ''}" placeholder="no end" onchange="saveStudentClassSessions(this, ${c.id})" class="w-20 border border-gray-300 rounded-lg px-2 py-0.5 text-xs">
            ${c.enrolled.endDate ? '<span class="text-gray-400">ends ' + escapeHtml(attFmtDate(c.enrolled.endDate)) + '</span>' : ''}</label>` : ''}
        </div>
        <div class="flex flex-wrap gap-2 enr-days">${pills}</div>
        <div class="flex items-center gap-3 w-36 justify-end">${action}</div>
      </div>`;
  }).join('') : '<p class="text-sm text-gray-400 px-4 py-3">No classes match.</p>';
}

// After any enrollment change, refresh every view that shows enrollments.
async function afterEnrollmentChange() {
  afterEnrollmentChange.running = true;
  try {
    await loadStudentEnrollments();
    await loadBookings();
    if (arState.studentId) refreshArStudent();
    if (document.getElementById('attClass').value) await loadSessions();
  } finally {
    afterEnrollmentChange.running = false;
  }
}

async function enrollFromEnrollSection(btn, classId) {
  const row = btn.closest('.enr-row');
  const box = row.querySelector('.enr-days');
  const total = box.querySelectorAll('.daypill').length;
  const days = pillsSelected(box);
  if (total && !days.length) return showToast('Pick at least one day.', true);
  try {
    await api('/portal/admin/enroll', {
      method: 'POST',
      body: JSON.stringify({
        classId,
        studentId: enrData.student.id,
        days: days.length === total ? [] : days,
        startDate: document.getElementById('enrStart').value,
        sessions: document.getElementById('enrSessions').value,
      }),
    });
    const sess = document.getElementById('enrSessions').value;
    showToast(sess ? `Enrolled — ${sess} class dates set up.` : 'Enrolled.');
    afterEnrollmentChange();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function saveStudentClassDays(btn, classId) {
  const c = enrData.classes.find((x) => x.id === classId);
  flipPill(btn);
  const box = btn.parentElement;
  const days = pillsSelected(box);
  if (!days.length) {
    flipPill(btn);
    return showToast('A student needs at least one day. Use Unenroll to remove them.', true);
  }
  const all = box.querySelectorAll('.daypill').length === days.length;
  try {
    await api(`/portal/admin/enrollments/${c.enrolled.bookingId}`, { method: 'PUT', body: JSON.stringify({ days: all ? [] : days }) });
    showToast(`Saved: ${WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')}`);
    afterEnrollmentChange();
  } catch (err) {
    flipPill(btn);
    showToast(err.message, true);
  }
}

async function saveStudentClassSessions(input, classId) {
  const c = enrData.classes.find((x) => x.id === classId);
  try {
    const r = await api(`/portal/admin/enrollments/${c.enrolled.bookingId}`, { method: 'PUT', body: JSON.stringify({ sessions: input.value }) });
    showToast(r.sessions ? `${r.sessions} sessions — ends ${attFmtDate(r.endDate)}.` : 'No end date.');
    afterEnrollmentChange();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function saveStudentClassStart(input, classId) {
  const c = enrData.classes.find((x) => x.id === classId);
  try {
    await api(`/portal/admin/enrollments/${c.enrolled.bookingId}`, { method: 'PUT', body: JSON.stringify({ startDate: input.value }) });
    showToast(input.value ? `Starts ${attFmtDate(input.value)}.` : 'Starts from the first class.');
    afterEnrollmentChange();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function unenrollFromEnrollSection(classId) {
  const c = enrData.classes.find((x) => x.id === classId);
  if (!confirm(`Unenroll ${enrData.student.name} from ${c.title}? Past attendance and reports are kept.`)) return;
  try {
    await api(`/portal/admin/enrollments/${c.enrolled.bookingId}`, { method: 'DELETE' });
    showToast('Unenrolled.');
    afterEnrollmentChange();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Attendance & Reports: student -> class -> date ----------

let arState = { studentId: null, studentName: '', classId: null, selectedSessionId: null };

const AR_ICON = {
  attended: '<i class="fa-solid fa-circle-check text-green-600 text-lg"></i>',
  absent: '<i class="fa-solid fa-circle-xmark text-red-500 text-lg"></i>',
  upcoming: '<i class="fa-regular fa-circle text-gray-400 text-lg"></i>',
};

async function onArStudentChange() {
  arState = { studentId: null, studentName: '', classId: null, selectedSessionId: null };
  closeRoster();
  document.getElementById('arBody').classList.add('hidden');
  const cls = document.getElementById('arClass');
  const id = document.getElementById('arStudent').value;
  cls.disabled = !id;
  cls.innerHTML = '<option value="">' + (id ? 'Loading…' : 'Pick a student first') + '</option>';
  if (!id) return;
  arState.studentId = Number(id);
  await refreshArStudent();
}

// (Re)loads the picked student's enrolled classes into "Classes enrolled".
async function refreshArStudent() {
  let data;
  try {
    data = await api(`/portal/admin/students/${arState.studentId}/enrollments`);
  } catch (err) {
    return showToast(err.message, true);
  }
  arState.studentName = data.student.name;
  const enrolled = data.classes.filter((c) => c.enrolled);
  const sel = document.getElementById('arClass');
  const keep = sel.value;
  sel.innerHTML = '<option value="">' + (enrolled.length ? 'Select a class…' : 'Not enrolled in any classes') + '</option>' +
    enrolled.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  if (keep && enrolled.some((c) => String(c.id) === keep)) sel.value = keep;
  else if (enrolled.length === 1) sel.value = String(enrolled[0].id);
  if (sel.value) loadArDates(arState.selectedSessionId);
  else { document.getElementById('arBody').classList.add('hidden'); closeRoster(); }
}

// Lists the student's dates in the chosen class (their days, from their
// start date) with attendance status; opens one date's form.
async function loadArDates(selectId) {
  const classId = Number(document.getElementById('arClass').value);
  arState.classId = classId || null;
  const body = document.getElementById('arBody');
  if (!classId) { body.classList.add('hidden'); closeRoster(); return; }

  let data;
  try {
    data = await api(`/portal/students/${arState.studentId}/schedule`);
  } catch (err) {
    return showToast(err.message, true);
  }
  const dates = data.sessions.filter((s) => s.classId === classId);
  body.classList.remove('hidden');
  const list = document.getElementById('arDates');
  if (!dates.length) {
    list.innerHTML = '<p class="p-6 text-sm text-gray-400 text-center">No dates for this student in this class yet. Add dates in Class Dates.</p>';
    closeRoster();
    return;
  }

  // Default date: the latest unmarked date up to today, else the latest past date, else the first.
  if (typeof selectId !== 'number' || !dates.some((d) => d.sessionId === selectId)) {
    const past = dates.filter((d) => d.date <= data.today);
    const unmarked = past.filter((d) => d.status === 'upcoming');
    selectId = (unmarked.pop() || past.pop() || dates[0]).sessionId;
  }
  arState.selectedSessionId = selectId;

  list.innerHTML = dates.map((d) => `
    <button onclick="selectArDate(${d.sessionId})" data-session="${d.sessionId}"
      class="w-full text-left flex items-center gap-3 px-5 py-3 border-l-4 ${d.sessionId === selectId ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-gray-50'}">
      ${AR_ICON[d.status]}
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">${escapeHtml(attFmtDate(d.date))}${d.date === data.today ? ' <span class="ml-1 text-[10px] uppercase bg-yellow-300 text-blue-900 px-1.5 py-0.5 rounded">Today</span>' : ''}</p>
        <p class="text-xs text-gray-500 truncate">${escapeHtml(attFmtTime(d.startTime))}${d.endTime ? ' – ' + escapeHtml(attFmtTime(d.endTime)) : ''}${d.topic ? ' · ' + escapeHtml(d.topic) : ''}</p>
      </div>
    </button>`).join('');
  const sel = list.querySelector(`[data-session="${selectId}"]`);
  if (sel) list.scrollTop = Math.max(0, sel.offsetTop - list.offsetTop - 80);
  openRoster(selectId);
}

function selectArDate(sessionId) {
  loadArDates(sessionId);
}
