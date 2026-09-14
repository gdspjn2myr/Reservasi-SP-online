// ============================================================================
// ROUTER — hash-based, sama persis pola W-SMART (js/router.js), cuma daftar
// halaman & judulnya beda (cuma 2 halaman: reservasi & spk).
// ============================================================================

const Router = {
  routes: {},
  register(name, onEnter) {
    this.routes[name] = onEnter;
  },
  current: 'reservasi',
  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  },
  resolve() {
    const hash = window.location.hash.replace('#/', '') || 'reservasi';
    let page = this.routes[hash] ? hash : 'reservasi';
    if (typeof window.canAccessPage === 'function' && !window.canAccessPage(page)) {
      page = 'reservasi';
    }
    this.current = page;
    this.render(page);
  },
  render(page) {
    document.querySelectorAll('.page').forEach((el) => {
      el.hidden = el.id !== 'page-' + page;
    });
    const activeEl = document.getElementById('page-' + page);
    if (activeEl) {
      activeEl.classList.remove('page-enter');
      void activeEl.offsetWidth;
      activeEl.classList.add('page-enter');
    }
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === page);
    });
    const titles = { reservasi: 'Reservasi Sparepart', spk: 'SPK Online' };
    document.getElementById('pageTitle').textContent = titles[page] || '';
    if (typeof this.routes[page] === 'function') {
      this.routes[page]();
    }
  }
};
