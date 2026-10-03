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

  // Coming back from the forgot-password panel — restore the tab row.
  document.getElementById('authTabsRow').classList.remove('hidden');
  document.getElementById('forgotPanel').classList.add('hidden');

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

// ---------- Forgot password panel ----------

function showForgotPanel() {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authTabsRow').classList.add('hidden');
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('signupPanel').classList.add('hidden');
  document.getElementById('forgotPanel').classList.remove('hidden');

  // reset panel state each time it's opened
  document.getElementById('forgotEmail').value = '';
  document.getElementById('forgotPasswordForm').classList.remove('hidden');
  document.getElementById('forgotSuccessMsg').classList.add('hidden');
}

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.classList.add('hidden');
  try {
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: document.getElementById('forgotEmail').value }),
    });
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    const successEl = document.getElementById('forgotSuccessMsg');
    successEl.textContent = data.message || 'If that email is registered, a reset link has been sent — check your inbox.';
    successEl.classList.remove('hidden');
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
async function openBookingModal(classId, classTitle) {
  document.getElementById('bookingForm').reset();
  document.getElementById('bookingClassId').value    = classId;
  document.getElementById('bookingClassTitle').textContent = classTitle;
  document.getElementById('bookingError').classList.add('hidden');
  document.getElementById('bookingSuccess').classList.add('hidden');
  document.getElementById('bookingForm').classList.remove('hidden');
  document.getElementById('bookingAuthHint').classList.toggle('hidden', !!currentUser);
  await populateBookingStudentPicker();
  openModal('bookingModal');
}

// A module-level cache of the signed-in parent's saved students, used only
// to pre-fill the age field when they pick an existing one below.
let bookingStudents = [];

// Signed-in parents pick from their saved students (see "My Students")
// instead of retyping a name every time; logged-out visitors (who have no
// saved students yet) still get the plain freeform fields, same as before
// — whatever they type gets auto-saved as a new student once login/signup
// completes the pending booking.
async function populateBookingStudentPicker() {
  const wrap     = document.getElementById('bookingStudentPickerWrap');
  const select   = document.getElementById('bookingStudentSelect');
  const newFields = document.getElementById('bookingNewStudentFields');

  if (!currentUser) {
    bookingStudents = [];
    wrap.classList.add('hidden');
    newFields.classList.remove('hidden');
    return;
  }

  try {
    const data = await api('/students/me');
    bookingStudents = data.students || [];
    select.innerHTML = '';
    bookingStudents.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.age != null ? `${s.name} (age ${s.age})` : s.name;
      select.appendChild(opt);
    });
    const addNewOpt = document.createElement('option');
    addNewOpt.value = 'new';
    addNewOpt.textContent = '+ Add a new student';
    select.appendChild(addNewOpt);

    if (bookingStudents.length > 0) {
      wrap.classList.remove('hidden');
      select.value = bookingStudents[0].id;
      onBookingStudentSelectChange();
    } else {
      wrap.classList.add('hidden');
      newFields.classList.remove('hidden');
    }
  } catch (err) {
    // Couldn't load saved students — fall back to the plain fields rather
    // than blocking enrollment on it.
    bookingStudents = [];
    wrap.classList.add('hidden');
    newFields.classList.remove('hidden');
  }
}

function onBookingStudentSelectChange() {
  const select    = document.getElementById('bookingStudentSelect');
  const newFields = document.getElementById('bookingNewStudentFields');
  newFields.classList.toggle('hidden', select.value !== 'new');
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById('bookingError');
  const successEl = document.getElementById('bookingSuccess');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const pickerShown  = !document.getElementById('bookingStudentPickerWrap').classList.contains('hidden');
  const select       = document.getElementById('bookingStudentSelect');
  const usingExisting = pickerShown && select.value !== 'new';

  const bookingData = {
    classId: document.getElementById('bookingClassId').value,
    notes:   document.getElementById('bookingNotes').value,
  };

  if (usingExisting) {
    bookingData.studentId = select.value;
  } else {
    bookingData.studentName = document.getElementById('bookingStudentName').value.trim();
    if (!bookingData.studentName) {
      errorEl.textContent = "Please enter the student's name.";
      errorEl.classList.remove('hidden');
      return;
    }
    bookingData.studentAge = document.getElementById('bookingStudentAge').value || null;
  }

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
// Shows everything the signed-in account has signed a student up for —
// both class enrollments (routes/bookings.js) and Workshop Event
// registrations (routes/events.js). These live in two separate tables
// (see db.js), so this pulls both and renders them as two sections.

function bookingRow(title, sub, scheduleLine, cancelled, onCancel) {
  const row = document.createElement('div');
  row.className = 'border border-gray-100 rounded-2xl p-4 flex justify-between items-center gap-4';
  row.innerHTML = `
    <div>
      <div class="font-semibold ${cancelled ? 'line-through text-gray-400' : ''}">${escapeHtml(title)}</div>
      <div class="text-sm text-gray-500">${escapeHtml(sub)}</div>
      ${scheduleLine ? `<div class="text-xs text-gray-400">${escapeHtml(scheduleLine)}</div>` : ''}
      ${cancelled ? '<div class="text-xs text-red-500 mt-1">Cancelled</div>' : ''}
    </div>
  `;
  if (!cancelled) {
    const btn = document.createElement('button');
    btn.className = 'text-sm text-red-600 hover:underline whitespace-nowrap';
    btn.textContent = 'Cancel';
    btn.onclick = onCancel;
    row.appendChild(btn);
  }
  return row;
}

async function openBookingsModal() {
  document.getElementById('accountDropdown').classList.add('hidden');
  const list = document.getElementById('bookingsList');
  list.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';
  openModal('bookingsModal');

  try {
    const [bookingsData, registrationsData] = await Promise.all([
      api('/bookings/me'),
      api('/events/my-registrations'),
    ]);
    const bookings = bookingsData.bookings || [];
    const registrations = registrationsData.registrations || [];

    if (bookings.length === 0 && registrations.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-sm">No bookings yet — go enroll in a class or register for a Workshop Event!</p>';
      return;
    }

    list.innerHTML = '';

    if (bookings.length) {
      const h = document.createElement('div');
      h.className = 'text-xs font-semibold uppercase tracking-wide text-gray-400 mt-2 first:mt-0';
      h.textContent = 'Classes';
      list.appendChild(h);
      bookings.forEach(b => {
        list.appendChild(bookingRow(
          b.class ? b.class.title : 'Class',
          `Student: ${b.studentName}${b.studentAge ? ', age ' + b.studentAge : ''}`,
          b.class ? b.class.schedule : '',
          b.status === 'cancelled',
          () => cancelBooking(b.id)
        ));
      });
    }

    if (registrations.length) {
      const h = document.createElement('div');
      h.className = 'text-xs font-semibold uppercase tracking-wide text-gray-400 mt-5 first:mt-0';
      h.textContent = 'Workshop Events';
      list.appendChild(h);
      registrations.forEach(r => {
        const statusNote = r.status === 'waitlist' ? ' (waitlisted)' : '';
        list.appendChild(bookingRow(
          r.eventName + statusNote,
          `Student: ${r.studentName}, grade ${r.studentGrade}${r.studentAge ? ', age ' + r.studentAge : ''}`,
          r.eventDate,
          r.status === 'cancelled',
          () => cancelEventRegistration(r.id)
        ));
      });
    }
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

async function cancelEventRegistration(id) {
  if (!confirm('Cancel this registration?')) return;
  try {
    await api(`/events/registrations/${id}`, { method: 'DELETE' });
    showToast('Registration cancelled.');
    openBookingsModal();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- My Students ----------
// A parent's saved children (routes/students.js) — just the reusable
// identity info (name/grade/age), so it doesn't have to be retyped on
// every class enrollment or event registration. Not wired into those
// forms yet (see routes/students.js) — this is just the manager.

let myStudents = [];

async function openStudentsModal() {
  document.getElementById('accountDropdown').classList.add('hidden');
  closeStudentForm();
  openModal('studentsModal');
  await loadStudentsList();
}

async function loadStudentsList() {
  const list = document.getElementById('studentsList');
  list.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';
  try {
    const data = await api('/students/me');
    myStudents = data.students || [];
    if (myStudents.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-sm">No students saved yet.</p>';
      return;
    }
    list.innerHTML = '';
    myStudents.forEach(s => {
      const row = document.createElement('div');
      row.className = 'border border-gray-100 rounded-2xl p-4 flex justify-between items-center gap-4';
      const details = [s.grade ? 'Grade ' + s.grade : null, s.age ? 'age ' + s.age : null].filter(Boolean).join(' · ');
      row.innerHTML = `
        <div>
          <div class="font-semibold">${escapeHtml(s.name)}</div>
          ${details ? `<div class="text-sm text-gray-500">${escapeHtml(details)}</div>` : ''}
          ${s.notes ? `<div class="text-xs text-gray-400 mt-0.5">${escapeHtml(s.notes)}</div>` : ''}
        </div>
        <div class="flex gap-3 whitespace-nowrap">
          <button class="text-sm text-blue-600 hover:underline">Edit</button>
          <button class="text-sm text-red-600 hover:underline">Remove</button>
        </div>
      `;
      const [editBtn, removeBtn] = row.querySelectorAll('button');
      editBtn.onclick = () => openStudentForm(s.id);
      removeBtn.onclick = () => deleteStudent(s.id);
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-red-500 text-sm">${escapeHtml(err.message)}</p>`;
  }
}

function openStudentForm(id) {
  const card = document.getElementById('studentFormCard');
  const errEl = document.getElementById('studentFormError');
  errEl.classList.add('hidden');
  document.getElementById('addStudentBtn').classList.add('hidden');

  if (id) {
    const s = myStudents.find(x => x.id === id);
    document.getElementById('studentFormId').value = s.id;
    document.getElementById('studentFormName').value = s.name || '';
    document.getElementById('studentFormGrade').value = s.grade || '';
    document.getElementById('studentFormAge').value = s.age || '';
    document.getElementById('studentFormNotes').value = s.notes || '';
  } else {
    document.getElementById('studentFormId').value = '';
    document.getElementById('studentFormName').value = '';
    document.getElementById('studentFormGrade').value = '';
    document.getElementById('studentFormAge').value = '';
    document.getElementById('studentFormNotes').value = '';
  }

  card.classList.remove('hidden');
  document.getElementById('studentFormName').focus();
}

function closeStudentForm() {
  document.getElementById('studentFormCard').classList.add('hidden');
  document.getElementById('addStudentBtn').classList.remove('hidden');
}

async function saveStudentForm() {
  const id = document.getElementById('studentFormId').value;
  const errEl = document.getElementById('studentFormError');
  errEl.classList.add('hidden');

  const payload = {
    name: document.getElementById('studentFormName').value.trim(),
    grade: document.getElementById('studentFormGrade').value,
    age: document.getElementById('studentFormAge').value,
    notes: document.getElementById('studentFormNotes').value.trim(),
  };

  if (!payload.name) {
    errEl.textContent = "Student's name is required.";
    errEl.classList.remove('hidden');
    return;
  }

  try {
    if (id) {
      await api(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Student updated.');
    } else {
      await api('/students', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Student added.');
    }
    closeStudentForm();
    await loadStudentsList();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function deleteStudent(id) {
  if (!confirm('Remove this student? This only removes their saved info — any past bookings are unaffected.')) return;
  try {
    await api(`/students/${id}`, { method: 'DELETE' });
    showToast('Student removed.');
    await loadStudentsList();
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

// Other pages (calendar, blog, about) link to /index.html?format=online#classes
// or ?format=in-person#classes so that clicking "Online"/"In-person" there
// actually pre-filters the class list here, not just navigates to the page.
function applyFormatFromQuery() {
  const format = new URLSearchParams(window.location.search).get('format');
  if (format) document.getElementById('filterFormat').value = format;
  return format;
}

(async function init() {
  updateMaxPriceLabel();
  await checkAuth();
  await loadSubjects();
  const formatFromQuery = applyFormatFromQuery();
  await loadClasses();
  if (formatFromQuery) scrollToClasses();
})();
