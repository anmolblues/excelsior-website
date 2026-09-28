// app.js — frontend logic for the Excelsior Enrichment Program site

let currentUser = null;
let debounceTimer = null;
let pendingBooking = null; // booking details captured before the user logs in / signs up

// ---------- Helpers ----------

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden', 'bg-gray-900', 'bg-red-600');
  toast.classList.add(isError ? 'bg-red-600' : 'bg-gray-900');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).classList.add('flex');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById(id).classList.remove('flex');
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

// ---------- Auth UI ----------

async function checkAuth() {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  if (currentUser) {
    authButtons.classList.add('hidden');
    userMenu.classList.remove('hidden');
    userMenu.classList.add('flex');
    document.getElementById('userMenuName').textContent = currentUser.name.split(' ')[0];
  } else {
    authButtons.classList.remove('hidden');
    userMenu.classList.add('hidden');
    userMenu.classList.remove('flex');
  }
}

function toggleAccountDropdown() {
  document.getElementById('accountDropdown').classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('accountDropdown');
  const menu = document.getElementById('userMenu');
  if (!menu.contains(e.target)) dropdown.classList.add('hidden');
});

// ---------- Auth Modal ----------

function openAuthModal(tab) {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authContextMsg').classList.add('hidden');
  showAuthTab(tab);
  openModal('authModal');
}

// Closing the auth modal by hand (the X button) abandons any enrollment
// that was waiting on login/signup — we don't silently book it later.
function closeAuthModal() {
  pendingBooking = null;
  document.getElementById('authContextMsg').classList.add('hidden');
  closeModal('authModal');
}

// showAuthTab: switches which panel is visible and resets both forms cleanly
function showAuthTab(tab) {
  const loginPanel  = document.getElementById('loginPanel');
  const signupPanel = document.getElementById('signupPanel');
  const loginTab    = document.getElementById('authTabLogin');
  const signupTab   = document.getElementById('authTabSignup');
  const activeClass = 'flex-1 py-2 rounded-xl font-semibold text-sm bg-blue-600 text-white';
  const inactiveClass = 'flex-1 py-2 rounded-xl font-semibold text-sm bg-gray-100 text-gray-600';

  if (tab === 'login') {
    loginTab.className  = activeClass;
    signupTab.className = inactiveClass;
    loginPanel.classList.remove('hidden');
    signupPanel.classList.add('hidden');
    // reset login fields
    document.getElementById('loginEmail').value    = '';
    document.getElementById('loginPassword').value = '';
  } else {
    signupTab.className = activeClass;
    loginTab.className  = inactiveClass;
    signupPanel.classList.remove('hidden');
    loginPanel.classList.add('hidden');
    // reset signup fields and strength UI
    document.getElementById('signupName').value            = '';
    document.getElementById('signupEmail').value           = '';
    document.getElementById('signupPassword').value        = '';
    document.getElementById('signupConfirmPassword').value = '';
    resetStrengthUI();
  }

  document.getElementById('authError').classList.add('hidden');
}

// ---------- Login form ----------

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.classList.add('hidden');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email:    document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      }),
    });
    currentUser = data.user;
    updateAuthUI();
    closeModal('authModal');
    document.getElementById('authContextMsg').classList.add('hidden');
    showToast(`Welcome back, ${currentUser.name.split(' ')[0]}!`);
    await completePendingBooking();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ---------- Sign Up form — password strength ----------

function passwordRules(pw) {
  return {
    length: pw.length >= 8,
    upper:  /[A-Z]/.test(pw),
    lower:  /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

function isStrongPassword(pw) {
  const r = passwordRules(pw);
  return r.length && r.upper && r.lower && r.number && r.symbol;
}

function resetStrengthUI() {
  ['bar1','bar2','bar3','bar4'].forEach(id => {
    document.getElementById(id).className = 'h-1.5 flex-1 rounded-full bg-gray-200 transition-all';
  });
  document.getElementById('strengthLabel').textContent = 'At least 8 characters with uppercase, lowercase, number, and symbol.';
  document.getElementById('strengthLabel').className = 'text-xs text-gray-400';
  document.getElementById('matchLabel').classList.add('hidden');
  const reqMap = { 'req-length': true, 'req-upper': true, 'req-lower': true, 'req-number': true, 'req-symbol': true };
  Object.keys(reqMap).forEach(id => {
    const el = document.getElementById(id);
    el.className = 'flex items-center gap-1.5 text-gray-400';
    el.querySelector('i').className = 'fa-solid fa-circle text-[6px]';
  });
  // reset show/hide toggles
  document.getElementById('signupPassword').type        = 'password';
  document.getElementById('signupConfirmPassword').type = 'password';
  document.getElementById('toggleSignupPw').className   = 'fa-solid fa-eye text-sm';
  document.getElementById('toggleConfirmPw').className  = 'fa-solid fa-eye text-sm';
}

function checkPasswordStrength() {
  const pw    = document.getElementById('signupPassword').value;
  const rules = passwordRules(pw);
  const passed = Object.values(rules).filter(Boolean).length;

  // Checklist
  const map = { length: 'req-length', upper: 'req-upper', lower: 'req-lower', number: 'req-number', symbol: 'req-symbol' };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (rules[key]) {
      el.className = 'flex items-center gap-1.5 text-green-600';
      el.querySelector('i').className = 'fa-solid fa-check text-[10px]';
    } else {
      el.className = 'flex items-center gap-1.5 text-gray-400';
      el.querySelector('i').className = 'fa-solid fa-circle text-[6px]';
    }
  });

  // Strength bar
  const colors = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-green-500'];
  ['bar1','bar2','bar3','bar4'].forEach((id, i) => {
    document.getElementById(id).className =
      `h-1.5 flex-1 rounded-full transition-all ${i < passed ? colors[Math.min(passed - 1, 3)] : 'bg-gray-200'}`;
  });

  // Strength label
  const labelEl = document.getElementById('strengthLabel');
  if (pw.length === 0) {
    labelEl.textContent = 'At least 8 characters with uppercase, lowercase, number, and symbol.';
    labelEl.className = 'text-xs text-gray-400';
  } else {
    const labels      = ['','Weak','Fair','Good','Strong'];
    const labelColors = ['','text-red-500','text-orange-500','text-yellow-600','text-green-600'];
    labelEl.textContent = labels[passed] || '';
    labelEl.className = `text-xs font-medium ${labelColors[passed] || 'text-gray-400'}`;
  }

  // Re-run match check if confirm field already has a value
  if (document.getElementById('signupConfirmPassword').value) checkPasswordMatch();
}

function checkPasswordMatch() {
  const pw      = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirmPassword').value;
  const matchEl = document.getElementById('matchLabel');
  if (!confirm) { matchEl.classList.add('hidden'); return; }
  matchEl.classList.remove('hidden');
  if (pw === confirm) {
    matchEl.textContent = '✓ Passwords match';
    matchEl.className = 'text-xs mt-1 text-green-600';
  } else {
    matchEl.textContent = '✗ Passwords do not match';
    matchEl.className = 'text-xs mt-1 text-red-500';
  }
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-sm';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-sm';
  }
}

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.classList.add('hidden');

  const password = document.getElementById('signupPassword').value;
  const confirm  = document.getElementById('signupConfirmPassword').value;

  if (!isStrongPassword(password)) {
    errorEl.textContent = 'Password must be at least 8 characters with an uppercase letter, lowercase letter, number, and symbol.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (password !== confirm) {
    errorEl.textContent = 'Passwords do not match. Please retype them.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name:     document.getElementById('signupName').value,
        email:    document.getElementById('signupEmail').value,
        password,
      }),
    });
    currentUser = data.user;
    updateAuthUI();
    closeModal('authModal');
    document.getElementById('authContextMsg').classList.add('hidden');
    showToast(`Welcome to Excelsior, ${currentUser.name.split(' ')[0]}!`);
    await completePendingBooking();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// Finishes an enrollment that was captured before the user logged in / signed up.
async function completePendingBooking() {
  if (!pendingBooking) return;
  const { classTitle, ...bookingData } = pendingBooking;
  pendingBooking = null;
  try {
    await api('/bookings', { method: 'POST', body: JSON.stringify(bookingData) });
    showToast(`You're enrolled in ${classTitle}! 🎉`);
    loadClasses();
  } catch (err) {
    showToast(`We couldn't complete that enrollment: ${err.message}`, true);
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  currentUser = null;
  updateAuthUI();
  document.getElementById('accountDropdown').classList.add('hidden');
  showToast('Logged out.');
}

// ---------- Subjects ----------

async function loadSubjects() {
  try {
    const data = await api('/classes/subjects');
    const select = document.getElementById('filterSubject');
    data.subjects.forEach(subject => {
      const opt = document.createElement('option');
      opt.value = subject;
      opt.textContent = subject;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load subjects', err);
  }
}

// ---------- Classes ----------

function getCurrentFilters() {
  const filters = {};
  const search    = document.getElementById('filterSearch').value.trim();
  const subject   = document.getElementById('filterSubject').value;
  const format    = document.getElementById('filterFormat').value;
  const age       = document.getElementById('filterAge').value;
  const maxPriceInput = document.getElementById('filterMaxPrice');
  const maxPrice  = maxPriceInput.value;

  if (search)   filters.search   = search;
  if (subject)  filters.subject  = subject;
  if (format)   filters.format   = format;
  if (age)      filters.age      = age;
  if (maxPrice && Number(maxPrice) < Number(maxPriceInput.max)) filters.maxPrice = maxPrice;

  return filters;
}

async function loadClasses() {
  const grid      = document.getElementById('classesGrid');
  const loading   = document.getElementById('loadingClasses');
  const noClasses = document.getElementById('noClasses');

  loading.classList.remove('hidden');
  noClasses.classList.add('hidden');
  grid.innerHTML = '';

  try {
    const filters = getCurrentFilters();
    const params  = new URLSearchParams(filters).toString();
    const data    = await api('/classes' + (params ? `?${params}` : ''));

    loading.classList.add('hidden');
    document.getElementById('resultsCount').textContent =
      `${data.classes.length} class${data.classes.length === 1 ? '' : 'es'} found`;

    if (data.classes.length === 0) { noClasses.classList.remove('hidden'); return; }
    data.classes.forEach(cls => grid.appendChild(renderClassCard(cls)));
  } catch (err) {
    loading.classList.add('hidden');
    showToast('Could not load classes: ' + err.message, true);
  }
}

function renderClassCard(cls) {
  const card = document.createElement('div');
  card.className = 'class-card bg-white border border-gray-100 rounded-3xl overflow-hidden flex flex-col';

  const ratingBadge = cls.rating
    ? `<span class="text-blue-600">${cls.rating.toFixed(2)} ★</span>`
    : `<span class="text-gray-400">New</span>`;

  const formatBadgeColor = cls.format === 'online'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-amber-100 text-amber-700';

  const spotsLabel = cls.spotsLeft === 0
    ? `<span class="text-red-500 font-semibold">Full</span>`
    : `<span class="text-green-600">${cls.spotsLeft} spot${cls.spotsLeft === 1 ? '' : 's'} left</span>`;

  const enrollDisabled = cls.spotsLeft === 0 ? 'disabled' : '';
  const enrollClasses  = cls.spotsLeft === 0
    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
    : 'bg-blue-100 hover:bg-blue-200 text-blue-700';

  card.innerHTML = `
    <img src="${cls.image || `https://picsum.photos/seed/${cls.id}/400/240`}" class="w-full h-48 object-cover" alt="${escapeHtml(cls.title)}">
    <div class="p-6 flex flex-col flex-1">
      <div class="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded">Ages ${cls.ageMin}-${cls.ageMax}</span>
        <span class="${formatBadgeColor} px-2 py-1 rounded capitalize">${cls.format}</span>
        <span class="text-gray-400">•</span>
        ${ratingBadge}
      </div>
      <h3 class="font-semibold leading-tight mb-2">${escapeHtml(cls.title)}</h3>
      <p class="text-sm text-gray-600 line-clamp-2 mb-4">${escapeHtml(cls.description)}</p>
      <div class="mt-auto flex justify-between items-end gap-2">
        <div>
          <div class="text-xs text-gray-500">${escapeHtml(cls.schedule || '')}</div>
          <div class="font-semibold">$${cls.price} / ${escapeHtml((cls.priceUnit || 'class').replace('per ',''))}</div>
          <div class="text-xs mt-1">${spotsLabel}</div>
        </div>
        <button ${enrollDisabled} onclick="openBookingModal(${cls.id}, '${escapeHtml(cls.title).replace(/'/g,"\\'")}' )"
          class="${enrollClasses} px-5 py-2 rounded-2xl text-sm font-medium whitespace-nowrap">
          ${cls.spotsLeft === 0 ? 'Full' : 'Enroll'}
        </button>
      </div>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function debouncedLoadClasses() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadClasses, 300);
}

function resetFilters() {
  document.getElementById('filterSearch').value  = '';
  document.getElementById('filterSubject').value = '';
  document.getElementById('filterFormat').value  = '';
  document.getElementById('filterAge').value     = '';
  const maxPriceInput = document.getElementById('filterMaxPrice');
  maxPriceInput.value = maxPriceInput.max;
  updateMaxPriceLabel();
  loadClasses();
}

function updateMaxPriceLabel() {
  const input = document.getElementById('filterMaxPrice');
  const label = document.getElementById('filterMaxPriceLabel');
  label.textContent = Number(input.value) >= Number(input.max) ? 'Any price' : `Up to $${input.value}`;
}

// ---------- Booking ----------

// Anyone can open this and fill it in — we only ask for login/signup right
// before submitting, so the class details and student info come first.
function openBookingModal(classId, classTitle) {
  document.getElementById('bookingForm').reset();
  document.getElementById('bookingClassId').value    = classId;
  document.getElementById('bookingClassTitle').textContent = classTitle;
  document.getElementById('bookingError').classList.add('hidden');
  document.getElementById('bookingSuccess').classList.add('hidden');
  document.getElementById('bookingForm').classList.remove('hidden');
  document.getElementById('bookingAuthHint').classList.toggle('hidden', !!currentUser);
  openModal('bookingModal');
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById('bookingError');
  const successEl = document.getElementById('bookingSuccess');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const bookingData = {
    classId:     document.getElementById('bookingClassId').value,
    studentName: document.getElementById('bookingStudentName').value,
    studentAge:  document.getElementById('bookingStudentAge').value || null,
    notes:       document.getElementById('bookingNotes').value,
  };
  const classTitle = document.getElementById('bookingClassTitle').textContent;

  if (!currentUser) {
    // Hold onto what they've entered and ask them to confirm via login/signup.
    pendingBooking = { ...bookingData, classTitle };
    closeModal('bookingModal');
    openAuthModal('signup');
    const contextMsg = document.getElementById('authContextMsg');
    contextMsg.textContent =
      `Almost done! Log in or create a free account to confirm ${bookingData.studentName || 'your student'}'s spot in ${classTitle}.`;
    contextMsg.classList.remove('hidden');
    return;
  }

  try {
    await api('/bookings', { method: 'POST', body: JSON.stringify(bookingData) });
    successEl.textContent = "You're enrolled! We'll see you in class. 🎉";
    successEl.classList.remove('hidden');
    document.getElementById('bookingForm').classList.add('hidden');
    loadClasses();
    setTimeout(() => closeModal('bookingModal'), 1800);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ---------- My Bookings ----------

async function openBookingsModal() {
  document.getElementById('accountDropdown').classList.add('hidden');
  const list = document.getElementById('bookingsList');
  list.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';
  openModal('bookingsModal');

  try {
    const data = await api('/bookings/me');
    if (data.bookings.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-sm">No bookings yet — go enroll in a class!</p>';
      return;
    }
    list.innerHTML = '';
    data.bookings.forEach(b => {
      const row = document.createElement('div');
      row.className = 'border border-gray-100 rounded-2xl p-4 flex justify-between items-center gap-4';
      const cancelled = b.status === 'cancelled';
      row.innerHTML = `
        <div>
          <div class="font-semibold ${cancelled ? 'line-through text-gray-400' : ''}">${escapeHtml(b.class ? b.class.title : 'Class')}</div>
          <div class="text-sm text-gray-500">Student: ${escapeHtml(b.studentName)}${b.studentAge ? ', age ' + b.studentAge : ''}</div>
          <div class="text-xs text-gray-400">${escapeHtml(b.class ? b.class.schedule : '')}</div>
          ${cancelled ? '<div class="text-xs text-red-500 mt-1">Cancelled</div>' : ''}
        </div>
        ${cancelled ? '' : `<button onclick="cancelBooking(${b.id})" class="text-sm text-red-600 hover:underline whitespace-nowrap">Cancel</button>`}
      `;
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-red-500 text-sm">${escapeHtml(err.message)}</p>`;
  }
}

async function cancelBooking(id) {
  if (!confirm('Cancel this booking?')) return;
  try {
    await api(`/bookings/${id}`, { method: 'DELETE' });
    showToast('Booking cancelled.');
    openBookingsModal();
    loadClasses();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Filters / search / nav links ----------

document.getElementById('filterSearch').addEventListener('input', debouncedLoadClasses);
['filterSubject','filterFormat','filterAge'].forEach(id => {
  document.getElementById(id).addEventListener('change', loadClasses);
});
document.getElementById('filterMaxPrice').addEventListener('input', () => {
  updateMaxPriceLabel();
  debouncedLoadClasses();
});

function scrollToClasses() {
  document.getElementById('classes').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('navSearchBtn').addEventListener('click', runNavSearch);
document.getElementById('navSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') runNavSearch(); });
document.getElementById('navSearchInputMobile').addEventListener('keydown', e => { if (e.key === 'Enter') runNavSearchMobile(); });

function runNavSearch() {
  document.getElementById('filterSearch').value = document.getElementById('navSearchInput').value;
  loadClasses(); scrollToClasses();
}
function runNavSearchMobile() {
  document.getElementById('filterSearch').value = document.getElementById('navSearchInputMobile').value;
  loadClasses(); scrollToClasses();
}

document.querySelectorAll('.subject-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('filterSubject').value = link.dataset.subjectFilter;
    loadClasses(); scrollToClasses();
  });
});

document.querySelectorAll('.category-filter-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    if (link.dataset.formatFilter) document.getElementById('filterFormat').value = link.dataset.formatFilter;
    loadClasses(); scrollToClasses();
  });
});

// ---------- Init ----------

(async function init() {
  updateMaxPriceLabel();
  await checkAuth();
  await loadSubjects();
  await loadClasses();
})();
