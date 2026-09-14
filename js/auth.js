// ============================================================================
// AUTH — Login, sesi (token), & Daftar akun (+ Plant & Departement). Pola sama
// persis dengan W-SMART (js/auth.js) — cuma Role di app ini praktis cuma
// 'User' (akun Admin/Staff TETAP bisa daftar/login di sini juga kalau perlu,
// tapi menu yang ditampilkan buat mereka kosong — kerja approve/kelola mereka
// ada di W-SMART, bukan di sini).
// ============================================================================

const AUTH_STORAGE_KEY = 'reservasiSpkSession';

// Halaman mana yang boleh diakses Role apa. 'spk' TIDAK dicek di sini per-
// Departement (itu tetap dicek server-side & lewat applyDepartemenVisibility
// di bawah) — daftar ini cuma level Role.
const PAGE_ROLES = {
  reservasi: ['User'],
  spk: ['User']
};

let currentSession = null; // { token, nama, username, role, plant, departement }
let routerStarted = false;

function loadSessionFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.role) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveSessionToStorage(session) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    // localStorage penuh/diblokir — sesi tetap jalan di memori sampai reload
  }
}

function clearSessionStorage() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) { /* no-op */ }
}

const Auth = {
  init() {
    currentSession = loadSessionFromStorage();
    return currentSession;
  },
  isLoggedIn() { return !!currentSession; },
  getUser() { return currentSession; },
  getToken() { return currentSession ? currentSession.token : ''; },
  setSession(session) {
    currentSession = session;
    saveSessionToStorage(session);
  },
  logout() {
    currentSession = null;
    clearSessionStorage();
  },
  canAccessPage(page) {
    if (!currentSession) return false;
    const allowed = PAGE_ROLES[page];
    if (!allowed) return true;
    if (allowed.indexOf(currentSession.role) === -1) return false;
    // Menu "spk" tambahan syaratnya: Departement harus salah satu dari
    // SPK_ELIGIBLE_DEPARTEMEN (lihat js/departemen-data.js). Server-side
    // TETAP jadi penjaga utama (lihat handleCreateSpk di Code.gs) — ini
    // cuma lapis UX.
    if (page === 'spk') {
      return SPK_ELIGIBLE_DEPARTEMEN.indexOf(String(currentSession.departement || '').trim().toUpperCase()) !== -1;
    }
    return true;
  }
};

window.canAccessPage = (page) => Auth.canAccessPage(page);

function applyRoleVisibility() {
  document.querySelectorAll('.nav-item[data-nav]').forEach((el) => {
    const ok = window.canAccessPage(el.dataset.nav);
    el.style.display = ok ? '' : 'none';
  });
}

function renderSidebarUserBox() {
  if (!currentSession) return;
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  if (nameEl) nameEl.textContent = currentSession.nama;
  if (roleEl) roleEl.textContent = currentSession.departement ? currentSession.departement : currentSession.role;
}

function showLoginScreen(message) {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('appShell').hidden = true;
  const errEl = document.getElementById('loginError');
  if (errEl) {
    if (message) {
      errEl.textContent = message;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }
  const userInput = document.getElementById('loginUsername');
  if (userInput) setTimeout(() => userInput.focus(), 50);
}

function showAppShell() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
  applyRoleVisibility();
  renderSidebarUserBox();
}

function handleSessionExpired() {
  Auth.logout();
  showLoginScreen('Sesi kamu berakhir, silakan login lagi.');
}
window.handleSessionExpired = handleSessionExpired;

function startAppAfterLogin() {
  showAppShell();
  if (!routerStarted) {
    routerStarted = true;
    Router.init();
    return;
  }
  if (window.location.hash === '#/reservasi' || window.location.hash === '') {
    Router.resolve();
  } else {
    window.location.hash = '#/reservasi';
  }
}

function wireLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const errEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    if (!username || !pin) {
      errEl.textContent = 'Username & Password wajib diisi.';
      errEl.hidden = false;
      return;
    }
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Masuk...';
    errEl.hidden = true;
    try {
      const res = await Api.login({ username, pin });
      Auth.setSession({
        token: res.token, nama: res.user.nama, username: res.user.username, role: res.user.role,
        plant: res.user.plant || '', departement: res.user.departement || ''
      });
      form.reset();
      startAppAfterLogin();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Masuk';
    }
  });
}

function wireLoginRegisterToggle() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const btnShowRegister = document.getElementById('btnShowRegister');
  const btnShowLogin = document.getElementById('btnShowLogin');
  if (!loginForm || !registerForm || !btnShowRegister || !btnShowLogin) return;

  btnShowRegister.addEventListener('click', () => {
    loginForm.hidden = true;
    registerForm.hidden = false;
    const el = document.getElementById('registerNama');
    if (el) setTimeout(() => el.focus(), 50);
  });
  btnShowLogin.addEventListener('click', () => {
    registerForm.hidden = true;
    loginForm.hidden = false;
    const el = document.getElementById('loginUsername');
    if (el) setTimeout(() => el.focus(), 50);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidNik(nik) {
  return /^\d+$/.test(nik);
}

function wireRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  const btnSubmit = document.getElementById('btnRegisterSubmit');
  const errEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');

  populatePlantDepartemenDropdown('registerPlant', 'registerDepartemen');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    successEl.hidden = true;

    const nama = document.getElementById('registerNama').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const nik = document.getElementById('registerNIK').value.trim();
    const plant = document.getElementById('registerPlant').value.trim();
    const departemen = document.getElementById('registerDepartemen').value.trim();
    const pin = document.getElementById('registerPin').value.trim();
    const pinConfirm = document.getElementById('registerPinConfirm').value.trim();

    if (!nama || !username || !email || !nik || !plant || !departemen || !pin || !pinConfirm) {
      errEl.textContent = 'Semua field wajib diisi.';
      errEl.hidden = false;
      return;
    }
    if (!isValidEmail(email)) {
      errEl.textContent = 'Format Email tidak valid.';
      errEl.hidden = false;
      return;
    }
    if (!isValidNik(nik)) {
      errEl.textContent = 'NIK harus berupa angka.';
      errEl.hidden = false;
      return;
    }
    if (pin.length < 4) {
      errEl.textContent = 'Password minimal 4 karakter.';
      errEl.hidden = false;
      return;
    }
    if (pin !== pinConfirm) {
      errEl.textContent = 'Password & ulangi Password tidak sama.';
      errEl.hidden = false;
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mendaftar...';
    try {
      const res = await Api.register({ nama, username, email, nik, pin, plant, departement: departemen });
      form.reset();
      successEl.textContent = res.message || 'Pendaftaran berhasil dikirim. Tunggu Admin menyetujui akun kamu.';
      successEl.hidden = false;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Daftar';
    }
  });
}

function wireLogoutButton() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await showConfirmModal({ title: 'Keluar', message: 'Keluar dari aplikasi?', confirmText: 'Keluar' });
    if (!ok) return;
    try { await Api.logout(); } catch (e) { /* tetap logout lokal walau panggilan gagal (mis. offline) */ }
    Auth.logout();
    showLoginScreen();
  });
}
