// portal.js — Parent Portal (portal.html)
//
// Views are driven by the URL hash so the browser Back button works:
//   (empty)                      → list of the parent's children
//   #kid/<studentId>             → that child's class dates
//   #kid/<studentId>/<sessionId> → that child's report for one date

let currentUser = null;
let kidsCache = [];
let scheduleCache = null; // { studentId, data }

// ---------- helpers ----------

function showToast(message, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.remove('hidden', 'bg-gray-900', 'bg-red-600');
  t.classList.add(isError ? 'bg-red-600' : 'bg-gray-900');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function show(id) {
  ['loadingView', 'authView', 'kidsView', 'kidView'].forEach((v) =>
    document.getElementById(v).classList.toggle('hidden', v !== id)
  );
}

function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeRange(s) {
  if (!s.startTime) return '';
  return fmtTime(s.startTime) + (s.endTime ? ' – ' + fmtTime(s.endTime) : '');
}

const STATUS_ICON = {
  attended: '<i class="fa-solid fa-circle-check text-green-600 text-xl" title="Attended"></i>',
  absent: '<i class="fa-solid fa-circle-xmark text-red-500 text-xl" title="Absent"></i>',
  upcoming: '<i class="fa-regular fa-circle text-gray-400 text-xl" title="Not started yet"></i>',
};

// ---------- auth ----------

function showAuthTab(tab) {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authInfo').classList.add('hidden');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('forgotForm').classList.toggle('hidden', tab !== 'forgot');
  document.getElementById('authTabs').classList.toggle('hidden', tab === 'forgot');
  const on = 'flex-1 py-2 rounded-xl font-semibold text-sm bg-blue-600 text-white';
  const off = 'flex-1 py-2 rounded-xl font-semibold text-sm bg-gray-100 text-gray-600';
  document.getElementById('tabLogin').className = tab === 'login' ? on : off;
  document.getElementById('tabSignup').className = tab === 'signup' ? on : off;
}

function authError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function pwRules(pw) {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    num: /[0-9]/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
  };
}

function updatePwRules() {
  const rules = pwRules(document.getElementById('signupPassword').value);
  document.querySelectorAll('#pwRules li').forEach((li) => {
    const ok = rules[li.dataset.rule];
    li.className = ok ? 'text-green-600' : 'text-gray-400';
    li.querySelector('i').className = (ok ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle') + ' mr-1';
  });
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      }),
    });
    currentUser = data.user;
    onLoggedIn();
  } catch (err) {
    authError(err.message);
  }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('signupPassword').value;
  if (!Object.values(pwRules(pw)).every(Boolean)) {
    return authError('Password must be 8+ characters with an uppercase letter, lowercase letter, number, and symbol.');
  }
  if (pw !== document.getElementById('signupConfirm').value) {
    return authError('Passwords do not match.');
  }
  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        password: pw,
      }),
    });
    currentUser = data.user;
    onLoggedIn();
    showToast('Account created — welcome!');
  } catch (err) {
    authError(err.message);
  }
});

document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: document.getElementById('forgotEmail').value }),
    });
    showAuthTab('login');
    const info = document.getElementById('authInfo');
    info.textContent = data.message || 'If that email is registered, a reset link has been sent — check your inbox.';
    info.classList.remove('hidden');
  } catch (err) {
    authError(err.message);
  }
});

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  kidsCache = [];
  scheduleCache = null;
  location.hash = '';
  showLoggedOut();
}

function showLoggedOut() {
  document.getElementById('navUser').classList.add('hidden');
  document.getElementById('navUser').classList.remove('flex');
  document.getElementById('navBackSite').classList.remove('hidden');
  show('authView');
  showAuthTab('login');
}

function onLoggedIn() {
  document.getElementById('navUserName').textContent = currentUser.name;
  document.getElementById('navUser').classList.remove('hidden');
  document.getElementById('navUser').classList.add('flex');
  document.getElementById('navBackSite').classList.add('hidden');
  document.getElementById('welcomeName').textContent = currentUser.name.split(' ')[0];
  route();
}

// ---------- kids list ----------

async function renderKids() {
  show('kidsView');
  const grid = document.getElementById('kidsGrid');
  grid.innerHTML = '<div class="text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading…</div>';
  const data = await api('/portal/students');
  kidsCache = data.students;

  document.getElementById('kidsEmpty').classList.toggle('hidden', kidsCache.length > 0);
  grid.innerHTML = '';
  kidsCache.forEach((k) => {
    const initials = k.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    const card = document.createElement('button');
    card.className = 'text-left bg-white rounded-3xl shadow hover:shadow-lg hover:-translate-y-0.5 transition p-6 border border-transparent hover:border-blue-200';
    card.onclick = () => { location.hash = `kid/${k.id}`; };
    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-yellow-400 text-blue-900 font-bold text-xl flex items-center justify-center shrink-0">${escapeHtml(initials)}</div>
        <div class="min-w-0">
          <p class="font-semibold text-lg truncate">${escapeHtml(k.name)}</p>
          <p class="text-sm text-gray-500 truncate">${escapeHtml(k.grade || '')}${k.grade && k.classes.length ? ' · ' : ''}${escapeHtml(k.classes.join(', '))}</p>
        </div>
        <i class="fa-solid fa-chevron-right text-gray-300 ml-auto"></i>
      </div>
      ${k.counts.total
        ? `<div class="flex gap-4 mt-5 text-sm">
             <span class="text-green-700"><i class="fa-solid fa-circle-check mr-1"></i>${k.counts.attended} attended</span>
             <span class="text-red-600"><i class="fa-solid fa-circle-xmark mr-1"></i>${k.counts.absent} absent</span>
             <span class="text-gray-500"><i class="fa-regular fa-circle mr-1"></i>${k.counts.upcoming} upcoming</span>
           </div>`
        : '<p class="mt-5 text-sm text-gray-400">No class dates scheduled yet</p>'}
    `;
    grid.appendChild(card);
  });
}

function toggleAddKid(open) {
  document.getElementById('addKidForm').classList.toggle('hidden', !open);
  document.getElementById('addKidBtn').classList.toggle('hidden', open);
  document.getElementById('kidError').classList.add('hidden');
  if (open) document.getElementById('kidName').focus();
}

(function fillKidSelects() {
  const g = document.getElementById('kidGrade');
  g.innerHTML = '<option value="">&mdash;</option>' +
    ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']
      .map((x) => `<option value="${x} Grade">${x} Grade</option>`).join('');
  const a = document.getElementById('kidAge');
  a.innerHTML = '<option value="">&mdash;</option>' +
    Array.from({ length: 14 }, (_, i) => i + 5).map((n) => `<option value="${n}">${n}</option>`).join('');
})();

document.getElementById('addKidForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/students', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('kidName').value.trim(),
        grade: document.getElementById('kidGrade').value,
        age: document.getElementById('kidAge').value,
      }),
    });
    e.target.reset();
    toggleAddKid(false);
    showToast('Child added.');
    renderKids();
  } catch (err) {
    const el = document.getElementById('kidError');
    el.textContent = err.message;
    el.classList.remove('hidden');
  }
});

// ---------- one kid: dates ----------

async function renderKid(studentId, sessionId) {
  show('kidView');

  if (!scheduleCache || scheduleCache.studentId !== studentId) {
    document.getElementById('datesList').innerHTML = '<div class="p-6 text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading…</div>';
    try {
      const data = await api(`/portal/students/${studentId}/schedule`);
      scheduleCache = { studentId, data };
    } catch (err) {
      showToast(err.message, true);
      location.hash = '';
      return;
    }
    renderDatesList();
  }

  const { data } = scheduleCache;
  document.getElementById('kidTitle').textContent = data.student.name;
  const classes = [...new Set(data.sessions.map((s) => s.classTitle))];
  document.getElementById('kidSub').textContent = [data.student.grade, classes.join(', ')].filter(Boolean).join(' · ');

  // highlight selected
  document.querySelectorAll('.date-row').forEach((r) =>
    r.classList.toggle('selected', Number(r.dataset.session) === sessionId)
  );

  // On phones the list and detail stack; when a date is open show only the detail.
  const datesPanel = document.getElementById('datesPanel');
  datesPanel.classList.toggle('hidden', !!sessionId && window.innerWidth < 1024);

  if (sessionId) {
    renderDetail(studentId, sessionId);
  } else {
    document.getElementById('detailContent').classList.add('hidden');
    document.getElementById('detailPlaceholder').style.display = data.sessions.length ? '' : 'none';
  }
}

function renderDatesList() {
  const { data, studentId } = scheduleCache;
  const list = document.getElementById('datesList');
  const sessions = data.sessions;
  document.getElementById('datesEmpty').classList.toggle('hidden', sessions.length > 0);
  list.classList.toggle('hidden', sessions.length === 0);
  document.getElementById('datesCount').textContent = sessions.length ? `${sessions.length} date${sessions.length === 1 ? '' : 's'}` : '';

  list.innerHTML = '';
  let firstUpcoming = null;
  sessions.forEach((s) => {
    const row = document.createElement('button');
    row.className = 'date-row w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50 border-l-4 border-transparent transition';
    row.dataset.session = s.sessionId;
    row.onclick = () => { location.hash = `kid/${studentId}/${s.sessionId}`; };
    const isToday = s.date === data.today;
    row.innerHTML = `
      <div class="w-7 text-center shrink-0">${STATUS_ICON[s.status]}</div>
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-sm">${escapeHtml(fmtDate(s.date))}${isToday ? ' <span class="ml-1 text-[10px] uppercase bg-yellow-300 text-blue-900 px-1.5 py-0.5 rounded">Today</span>' : ''}</p>
        <p class="text-xs text-gray-500 truncate">${escapeHtml(s.classTitle)}${s.startTime ? ' · ' + escapeHtml(timeRange(s)) : ''}</p>
      </div>
      <i class="fa-solid fa-chevron-right text-gray-300 text-xs"></i>
    `;
    if (!firstUpcoming && s.status === 'upcoming' && s.date >= data.today) firstUpcoming = row;
    list.appendChild(row);
  });

  // Scroll so past dates sit above and the next upcoming date is in view.
  if (firstUpcoming && firstUpcoming.previousElementSibling) {
    // show one full past row above the next upcoming date
    list.scrollTop = Math.max(0, firstUpcoming.previousElementSibling.offsetTop);
  }
}

// ---------- one date: report ----------

async function renderDetail(studentId, sessionId) {
  const box = document.getElementById('detailContent');
  document.getElementById('detailPlaceholder').style.display = 'none';
  box.classList.remove('hidden');
  box.innerHTML = '<div class="bg-white rounded-3xl shadow p-10 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i></div>';

  let data;
  try {
    data = await api(`/portal/students/${studentId}/sessions/${sessionId}`);
  } catch (err) {
    box.innerHTML = `<div class="bg-white rounded-3xl shadow p-8 text-red-600 text-sm">${escapeHtml(err.message)}</div>`;
    return;
  }
  const s = data.session;

  const mobileBack = `<button onclick="location.hash='kid/${studentId}'" class="lg:hidden text-sm text-blue-600 font-medium mb-3"><i class="fa-solid fa-arrow-left mr-1"></i> All dates</button>`;
  const header = `
    <div class="hero-bg text-white px-6 py-5">
      <p class="text-blue-200 text-xs font-semibold uppercase tracking-wide">${escapeHtml(s.classTitle)}</p>
      <p class="text-xl font-bold mt-1">${escapeHtml(fmtDate(s.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p>
      <p class="text-blue-100 text-sm mt-1">${escapeHtml(timeRange(s))}${s.topic ? (s.startTime ? ' · ' : '') + escapeHtml(s.topic) : ''}</p>
    </div>`;

  if (s.status === 'upcoming') {
    box.innerHTML = mobileBack + `
      <div class="bg-white rounded-3xl shadow overflow-hidden">${header}
        <div class="p-10 text-center">
          <i class="fa-regular fa-circle text-4xl text-gray-300 mb-3"></i>
          <p class="font-semibold text-lg">This class hasn't started yet.</p>
          <p class="text-sm text-gray-500 mt-1">A report will be available here after ${escapeHtml(data.student.name.split(' ')[0])} attends.</p>
        </div>
      </div>`;
    return;
  }

  if (s.status === 'absent') {
    box.innerHTML = mobileBack + `
      <div class="bg-white rounded-3xl shadow overflow-hidden">${header}
        <div class="p-10 text-center">
          <i class="fa-solid fa-circle-xmark text-4xl text-red-400 mb-3"></i>
          <p class="font-semibold text-lg">Marked absent</p>
          <p class="text-sm text-gray-500 mt-1">There's no report for this class. Questions? <a href="/#contactUs" class="text-blue-600 hover:underline">Contact us</a>.</p>
        </div>
      </div>`;
    return;
  }

  // attended
  const r = data.report || {};
  const stars = r.participation
    ? Array.from({ length: 5 }, (_, i) => `<i class="fa-${i < r.participation ? 'solid' : 'regular'} fa-star ${i < r.participation ? 'text-yellow-400' : 'text-gray-300'}"></i>`).join('')
    : '<span class="text-gray-400 text-sm">—</span>';
  const HW = {
    complete: ['Complete', 'bg-green-100 text-green-700'],
    partial: ['Partially done', 'bg-yellow-100 text-yellow-800'],
    missing: ['Not turned in', 'bg-red-100 text-red-700'],
    none: ['No homework', 'bg-gray-100 text-gray-600'],
  };
  const hw = HW[r.homework];
  const scoreColor = r.score == null ? 'text-gray-400' : r.score >= 85 ? 'text-green-600' : r.score >= 70 ? 'text-blue-600' : 'text-orange-500';

  const section = (icon, title, body) => body
    ? `<div><p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1"><i class="fa-solid ${icon} mr-1"></i>${title}</p><p class="text-sm text-gray-700 whitespace-pre-line">${escapeHtml(body)}</p></div>`
    : '';

  const narrative = [
    section('fa-book-open', 'What we covered', r.skills),
    section('fa-thumbs-up', 'Strengths', r.strengths),
    section('fa-arrow-trend-up', 'Areas to work on', r.improve),
    section('fa-comment', "Teacher's comments", r.comments),
  ].join('');

  box.innerHTML = mobileBack + `
    <div class="bg-white rounded-3xl shadow overflow-hidden">${header}
      <div class="p-6 space-y-6">
        <div class="flex items-center gap-2 text-green-700 font-semibold text-sm"><i class="fa-solid fa-circle-check"></i> Attended</div>
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-gray-50 rounded-2xl p-4 text-center">
            <p class="text-xs text-gray-500 mb-1">Score</p>
            <p class="text-2xl font-bold ${scoreColor}">${r.score == null ? '—' : r.score + '<span class="text-sm text-gray-400">/100</span>'}</p>
          </div>
          <div class="bg-gray-50 rounded-2xl p-4 text-center">
            <p class="text-xs text-gray-500 mb-2">Participation</p>
            <p class="text-sm whitespace-nowrap">${stars}</p>
          </div>
          <div class="bg-gray-50 rounded-2xl p-4 text-center">
            <p class="text-xs text-gray-500 mb-2">Homework</p>
            ${hw ? `<span class="inline-block text-xs font-semibold px-2 py-1 rounded-lg ${hw[1]}">${hw[0]}</span>` : '<span class="text-gray-400 text-sm">—</span>'}
          </div>
        </div>
        ${narrative || '<p class="text-sm text-gray-500">The teacher hasn\'t added written notes for this class yet.</p>'}
        ${r.updatedAt ? `<p class="text-xs text-gray-400">Report updated ${escapeHtml(new Date(r.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</p>` : ''}
      </div>
    </div>`;
}

// ---------- routing ----------

function route() {
  if (!currentUser) return showLoggedOut();
  const m = location.hash.match(/^#kid\/(\d+)(?:\/(\d+))?$/);
  if (m) {
    renderKid(Number(m[1]), m[2] ? Number(m[2]) : null);
  } else {
    scheduleCache = null; // refresh next time a child is opened
    renderKids().catch((err) => showToast(err.message, true));
  }
}

window.addEventListener('hashchange', route);

(async function init() {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    onLoggedIn();
  } catch {
    showLoggedOut();
  }
})();
