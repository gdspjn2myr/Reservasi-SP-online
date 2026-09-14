// ============================================================================
// APP INIT — pola sama persis dengan W-SMART (js/app.js), dipangkas ke bagian
// yang relevan buat repo ini (toast, sidebar drawer, toggle password, modal
// konfirmasi, service worker/update banner, & wiring 2 halaman: reservasi & spk).
// ============================================================================

let toastTimer = null;
let toastHideTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastHideTimer = setTimeout(() => { el.hidden = true; }, 260);
  }, 3500);
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const menuToggle = document.getElementById('btnMenuToggle');
  if (!sidebar || !backdrop || !menuToggle) return;

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar(); else openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
  sidebar.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', closeSidebar);
  });
}

function wirePasswordToggles() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-password');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.querySelector('.icon-eye').hidden = !showing;
    btn.querySelector('.icon-eye-off').hidden = showing;
    btn.setAttribute('aria-label', showing ? 'Tampilkan Password' : 'Sembunyikan Password');
  });
}

let confirmModalResolve = null;
function showConfirmModal(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
    document.getElementById('confirmModalTitle').textContent = o.title || 'Konfirmasi';
    document.getElementById('confirmModalMessage').textContent = o.message || 'Yakin mau lanjut?';
    const okBtn = document.getElementById('btnConfirmModalOk');
    okBtn.textContent = o.confirmText || 'OK';
    okBtn.classList.toggle('btn-danger', !!o.danger);
    okBtn.classList.toggle('btn-primary', !o.danger);
    document.getElementById('btnConfirmModalCancel').textContent = o.cancelText || 'Batal';
    document.getElementById('confirmModalBackdrop').hidden = false;
    document.getElementById('confirmModal').hidden = false;
    okBtn.focus();
  });
}
function resolveConfirmModal(result) {
  document.getElementById('confirmModalBackdrop').hidden = true;
  document.getElementById('confirmModal').hidden = true;
  if (confirmModalResolve) {
    const resolve = confirmModalResolve;
    confirmModalResolve = null;
    resolve(result);
  }
}
function wireConfirmModal() {
  document.getElementById('btnConfirmModalOk').addEventListener('click', () => resolveConfirmModal(true));
  document.getElementById('btnConfirmModalCancel').addEventListener('click', () => resolveConfirmModal(false));
  document.getElementById('btnCloseConfirmModal').addEventListener('click', () => resolveConfirmModal(false));
  document.getElementById('confirmModalBackdrop').addEventListener('click', () => resolveConfirmModal(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('confirmModal').hidden) resolveConfirmModal(false);
  });
}

// ---- Service worker & notifikasi update versi (sama persis pola W-SMART) ----
function getSwVersion(worker) {
  return new Promise((resolve) => {
    if (!worker) { resolve(null); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data && e.data.version);
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}
function setSidebarVersion(v) {
  const el = document.getElementById('sidebarVersion');
  if (el && v) el.textContent = 'v' + v;
}
function pickAnySwWorker(registration) {
  return navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing || null;
}
function showUpdateBanner(version) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  document.getElementById('updateBannerVersion').textContent = version ? 'v' + version + ' siap dipasang' : 'Siap dipasang';
  banner.hidden = false;
  void banner.offsetWidth;
  banner.classList.add('show');
}
function hideUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.remove('show');
  setTimeout(() => { banner.hidden = true; }, 280);
}
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtLoad) {
      hadControllerAtLoad = true;
      getSwVersion(navigator.serviceWorker.controller).then(setSidebarVersion);
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('service-worker.js').then((registration) => {
    getSwVersion(pickAnySwWorker(registration)).then((v) => { if (v) setSidebarVersion(v); });

    if (registration.waiting && navigator.serviceWorker.controller) {
      getSwVersion(registration.waiting).then(showUpdateBanner);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          getSwVersion(newWorker).then(showUpdateBanner);
        }
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });

    const footerBtn = document.getElementById('sidebarFooter');
    if (footerBtn) {
      let checkingUpdate = false;
      footerBtn.addEventListener('click', async () => {
        if (checkingUpdate) return;
        checkingUpdate = true;
        footerBtn.classList.add('checking');
        showToast('Mengecek update...', 'info');
        try {
          await registration.update();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!registration.waiting) {
            showToast('Sudah pakai versi terbaru.', 'success');
          }
        } catch (err) {
          showToast('Gagal cek update: ' + err.message, 'error');
        } finally {
          checkingUpdate = false;
          footerBtn.classList.remove('checking');
        }
      });
    }
  }).catch(() => {});

  const btnUpdateNow = document.getElementById('btnUpdateNow');
  const btnUpdateLater = document.getElementById('btnUpdateLater');
  if (btnUpdateNow) {
    btnUpdateNow.addEventListener('click', () => {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
      hideUpdateBanner();
    });
  }
  if (btnUpdateLater) {
    btnUpdateLater.addEventListener('click', hideUpdateBanner);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash && window.location.hash !== '#/reservasi') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  Auth.init();
  wireLoginForm();
  wireRegisterForm();
  wireLoginRegisterToggle();
  wireLogoutButton();

  initSidebar();
  wirePasswordToggles();
  wireConfirmModal();

  Router.register('reservasi', () => { initReservasiPage(); });
  Router.register('spk', () => { initSpkPage(); });

  if (Auth.isLoggedIn()) {
    startAppAfterLogin();
  } else {
    showLoginScreen();
  }

  initServiceWorker();
});
