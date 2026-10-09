// admin.js — admin dashboard logic

let adminUser = null;

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
    await loadClasses();
    await loadBookings();
    await loadEvents();
    await loadEventRegistrations();
    await loadUsers();
    await loadStudents();
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
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">No events yet. Click “Add Event” to create one.</td></tr>';
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
  } else {
    document.getElementById('eventFormTitle').textContent = 'Add Event';
    document.getElementById('eventRowId').value = '';
    slugEl.disabled = false;
    document.getElementById('eventCapacity').value = 20;
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
