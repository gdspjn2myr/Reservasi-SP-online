// ============================================================================
// HALAMAN RESERVASI — 2 tab: "Ajukan" & "Status Saya".
//
// Tab "Ajukan" — disesuaikan dengan form kertas manual "Permintaan Spare
// Part" atas permintaan Bos:
//   1. "Stock Milik Saya" — dari Api.getStockMilikUser (mekanisme
//      Sumber=USER+nama sendiri yang sudah ada di W-SMART). Nampilin qty
//      stock, Qty yang diajukan DIBATASI maksimal sejumlah itu.
//   2. "Ajukan Barang Lain" — dari Api.getKatalogBarang (barang di Master
//      Data yang Plant-nya sama dengan Plant akun yang login, termasuk yang
//      onHand 0), ada search box & baru muncul suggestion pas user ngetik.
//      SENGAJA TIDAK menampilkan angka stock di sini (beda dari bagian 1) &
//      Qty TIDAK dibatasi — GDSP yang menilai feasible/tidak pas Approval.
//   3. "Barang Dipilih" — keranjang: klik barang di bagian 1/2 buat
//      menambahkan ke sini (BUKAN cuma pilih 1). Semua barang dalam 1x
//      submit WAJIB dari S.Loc yang sama (barang tanpa S.Loc tercatat tetap
//      boleh digabung dengan S.Loc apapun).
//   4. Form "Detail Permintaan" — field baru sesuai form manual (Line,
//      Group, Pelaksana Lapangan, Equipment, dst). Field utama WAJIB, sisanya
//      OPSIONAL (dikonfirmasi Bos). Dropdown "Lain-lain" berubah jadi kolom
//      input teks bebas.
// 1x submit = 1 "Permintaan" (idPermintaan) yang bisa berisi banyak barang,
// tapi tiap barang tetap independen buat Approval/Issue di sisi GDSP (lihat
// komentar di atas HEADER_RESERVASI, Code.gs) — "Per barang" (dikonfirmasi
// Bos).
// ============================================================================

let reservasiMilikList = [];
let reservasiKatalogList = [];
let reservasiCart = []; // [{ key, kode, namaBarang, satuan, sloc, qty, maxQty: number|null, source: 'milik'|'katalog' }]
let reservasiPageLoadedOnce = false;
let reservasiSearchTerm = '';

const RESERVASI_KATALOG_MAX_SHOWN = 60;

function reservasiStatusPillClass(status) {
  if (status === 'Barang Ready') return 'status-ready';
  if (status === 'Selesai') return 'status-selesai';
  if (status === 'Ditolak') return 'status-ditolak';
  return 'status-menunggu';
}

function reservasiCartKey(kode, sloc) {
  return String(kode).trim().toUpperCase() + '::' + String(sloc || '').trim().toUpperCase();
}

function wireReservasiTabs() {
  const tabs = document.querySelectorAll('#page-reservasi .simple-tab-btn');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#page-reservasi .simple-tab-panel').forEach((p) => { p.hidden = true; });
      document.getElementById(btn.dataset.tabTarget).hidden = false;
      if (btn.dataset.tabTarget === 'reservasiTabStatus') loadReservasiStatusList();
    });
  });
}

// ---------------------------------------------------------------------------
// Bagian 1 — Stock Milik Saya
// ---------------------------------------------------------------------------
async function loadReservasiMilik() {
  const box = document.getElementById('reservasiMilikList');
  box.innerHTML = '<div class="empty-state">Memuat stock...</div>';
  try {
    const res = await Api.getStockMilikUser();
    reservasiMilikList = (res.data || []).map((it, idx) => Object.assign({ _idx: idx }, it));
    renderReservasiMilik();
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Gagal memuat stock: ' + err.message + '</div>';
  }
}

function renderReservasiMilik() {
  const box = document.getElementById('reservasiMilikList');
  if (!reservasiMilikList.length) {
    box.innerHTML = '<div class="empty-state">Belum ada stock yang tercatat atas nama kamu.</div>';
    return;
  }
  box.innerHTML = reservasiMilikList.map((it) => {
    const key = reservasiCartKey(it.kode, '');
    const inCart = reservasiCart.some((c) => c.key === key);
    return `
    <div class="stock-pick-item${inCart ? ' selected' : ''}" data-idx="${it._idx}">
      <div>
        <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
        <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}</div>
      </div>
      <div class="stock-pick-qty">${inCart ? 'Ditambahkan ✓' : it.qty}</div>
    </div>
  `;
  }).join('');
  box.querySelectorAll('.stock-pick-item').forEach((el) => {
    el.addEventListener('click', () => addReservasiMilikToCart(Number(el.dataset.idx)));
  });
}

function addReservasiMilikToCart(idx) {
  const item = reservasiMilikList.find((it) => it._idx === idx);
  if (!item) return;
  reservasiAddToCart({
    kode: item.kode, namaBarang: item.namaBarang, satuan: item.satuan,
    sloc: '', maxQty: item.qty, source: 'milik'
  });
}

// ---------------------------------------------------------------------------
// Bagian 2 — Ajukan Barang Lain (katalog barang sesuai Plant akun, tanpa
// angka stock ditampilkan, Qty bebas tidak dibatasi)
// ---------------------------------------------------------------------------
async function loadReservasiKatalog() {
  const box = document.getElementById('reservasiStockPickerList');
  box.innerHTML = '<div class="empty-state">Memuat daftar barang...</div>';
  try {
    const res = await Api.getKatalogBarang();
    reservasiKatalogList = (res.data || []).map((it, idx) => Object.assign({ _idx: idx }, it));
    renderReservasiKatalog();
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Gagal memuat daftar barang: ' + err.message + '</div>';
  }
}

function renderReservasiKatalog() {
  const box = document.getElementById('reservasiStockPickerList');
  if (!reservasiKatalogList.length) {
    box.innerHTML = '<div class="empty-state">Belum ada barang di Master Data buat Plant kamu.</div>';
    return;
  }

  const term = reservasiSearchTerm.trim().toLowerCase();
  // SENGAJA TIDAK nampilin daftar penuh secara default -- baru muncul saran
  // (suggest) pas user mulai ngetik kode/nama barang (atas permintaan Bos,
  // daftar Master Data bisa panjang banget kalau ditampilkan semua).
  if (!term) {
    box.innerHTML = '<div class="empty-state">Ketik kode atau nama barang buat cari.</div>';
    return;
  }

  const filtered = reservasiKatalogList.filter((it) =>
    String(it.kode).toLowerCase().indexOf(term) !== -1 ||
    String(it.namaBarang || '').toLowerCase().indexOf(term) !== -1
  );

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">Tidak ada barang yang cocok dengan pencarian.</div>';
    return;
  }

  const shown = filtered.slice(0, RESERVASI_KATALOG_MAX_SHOWN);
  // SENGAJA TIDAK ada .stock-pick-qty di sini -- bagian ini nggak nampilin
  // angka stock sama sekali (beda dari "Stock Milik Saya" di atas).
  let html = shown.map((it) => {
    const key = reservasiCartKey(it.kode, it.sloc);
    const inCart = reservasiCart.some((c) => c.key === key);
    return `
    <div class="stock-pick-item${inCart ? ' selected' : ''}" data-idx="${it._idx}">
      <div>
        <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
        <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}${it.sloc ? ' · S.Loc ' + it.sloc : ''}</div>
      </div>
      ${inCart ? '<div class="stock-pick-qty">Ditambahkan ✓</div>' : ''}
    </div>
  `;
  }).join('');

  if (filtered.length > shown.length) {
    html += '<div class="empty-state">Menampilkan ' + shown.length + ' dari ' + filtered.length + ' hasil — ketik lebih spesifik buat mempersempit pencarian.</div>';
  }

  box.innerHTML = html;
  box.querySelectorAll('.stock-pick-item').forEach((el) => {
    el.addEventListener('click', () => addReservasiKatalogToCart(Number(el.dataset.idx)));
  });
}

function wireReservasiSearch() {
  const input = document.getElementById('reservasiKatalogSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    reservasiSearchTerm = input.value;
    renderReservasiKatalog();
  });
}

function addReservasiKatalogToCart(idx) {
  const item = reservasiKatalogList.find((it) => it._idx === idx);
  if (!item) return;
  reservasiAddToCart({
    kode: item.kode, namaBarang: item.namaBarang, satuan: item.satuan,
    sloc: item.sloc || '', maxQty: null, source: 'katalog'
  });
}

// ---------------------------------------------------------------------------
// Bagian 3 — Keranjang barang dipilih (WAJIB 1 S.Loc per permintaan)
// ---------------------------------------------------------------------------
function reservasiActiveSloc() {
  const withSloc = reservasiCart.find((c) => c.sloc);
  return withSloc ? withSloc.sloc : '';
}

function reservasiAddToCart(item) {
  const key = reservasiCartKey(item.kode, item.sloc);
  const existing = reservasiCart.find((c) => c.key === key);
  if (existing) {
    // Sudah ada -- tambah qty 1 (dibatasi maxQty kalau ada), bukan dobel baris.
    const next = existing.qty + 1;
    existing.qty = existing.maxQty != null ? Math.min(next, existing.maxQty) : next;
    renderReservasiCart();
    renderReservasiMilik();
    renderReservasiKatalog();
    return;
  }

  const activeSloc = reservasiActiveSloc();
  if (item.sloc && activeSloc && item.sloc !== activeSloc) {
    showToast('Barang ini S.Loc ' + item.sloc + ', beda dengan S.Loc permintaan ini (' + activeSloc + '). Semua barang dalam 1 permintaan harus 1 S.Loc — ajukan terpisah.', 'error');
    return;
  }

  reservasiCart.push({
    key: key,
    kode: item.kode,
    namaBarang: item.namaBarang,
    satuan: item.satuan,
    sloc: item.sloc || '',
    qty: 1,
    maxQty: item.maxQty,
    source: item.source
  });
  renderReservasiCart();
  renderReservasiMilik();
  renderReservasiKatalog();
}

function reservasiRemoveFromCart(key) {
  reservasiCart = reservasiCart.filter((c) => c.key !== key);
  renderReservasiCart();
  renderReservasiMilik();
  renderReservasiKatalog();
}

function renderReservasiCart() {
  const list = document.getElementById('reservasiCartList');
  const countEl = document.getElementById('reservasiCartCount');
  const slocHint = document.getElementById('reservasiSlocHint');
  countEl.textContent = reservasiCart.length ? reservasiCart.length + ' barang' : '';

  const activeSloc = reservasiActiveSloc();
  if (activeSloc) {
    slocHint.hidden = false;
    slocHint.textContent = 'Semua barang di permintaan ini dari S.Loc ' + activeSloc + ' (barang tanpa S.Loc tercatat tetap boleh ikut).';
  } else {
    slocHint.hidden = true;
  }

  if (!reservasiCart.length) {
    list.innerHTML = '<div class="empty-state">Belum ada barang dipilih. Ketuk barang di atas buat menambahkan.</div>';
    return;
  }

  list.innerHTML = reservasiCart.map((c) => `
    <div class="item-row">
      <button type="button" class="item-remove" data-key="${c.key}" aria-label="Hapus barang">×</button>
      <div class="stock-pick-name">${c.kode} — ${c.namaBarang || '-'}</div>
      <div class="stock-pick-meta">${c.satuan || ''}${c.sloc ? ' · S.Loc ' + c.sloc : ''}${c.maxQty != null ? ' · Stock kamu: ' + c.maxQty : ' · Di luar stock kamu'}</div>
      <div class="form-row form-row-small">
        <label>Qty Diminta</label>
        <input type="number" class="reservasi-cart-qty" data-key="${c.key}" min="1" step="1" value="${c.qty}"${c.maxQty != null ? ' max="' + c.maxQty + '"' : ''}>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.item-remove').forEach((btn) => {
    btn.addEventListener('click', () => reservasiRemoveFromCart(btn.dataset.key));
  });
  list.querySelectorAll('.reservasi-cart-qty').forEach((input) => {
    input.addEventListener('change', () => {
      const item = reservasiCart.find((c) => c.key === input.dataset.key);
      if (!item) return;
      let qty = Number(input.value) || 0;
      if (qty < 1) qty = 1;
      if (item.maxQty != null && qty > item.maxQty) {
        qty = item.maxQty;
        showToast('Qty dibatasi maksimal stock kamu (' + item.maxQty + ').', 'error');
      }
      item.qty = qty;
      input.value = qty;
    });
  });
}

// ---------------------------------------------------------------------------
// Dropdown "Lain-lain" -> berubah jadi kolom input teks bebas (Alasan
// Permintaan Barang & Uraian Pekerjaan, sesuai form manual).
// ---------------------------------------------------------------------------
function wireReservasiLainLain(selectId, textId) {
  const select = document.getElementById(selectId);
  const text = document.getElementById(textId);
  if (!select || !text) return;
  select.addEventListener('change', () => {
    const isLain = select.value === 'Lain-lain';
    text.hidden = !isLain;
    if (!isLain) text.value = '';
    else text.focus();
  });
}

function resolveReservasiDropdown(selectId, textId) {
  const select = document.getElementById(selectId);
  const text = document.getElementById(textId);
  if (select.value === 'Lain-lain') return text.value.trim();
  return select.value;
}

// ---------------------------------------------------------------------------
// Form "Detail Permintaan" — submit 1 permintaan (bisa banyak barang)
// ---------------------------------------------------------------------------
function wireReservasiForm() {
  const form = document.getElementById('reservasiForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('reservasiFormError');
    errEl.hidden = true;

    if (!reservasiCart.length) {
      showToast('Pilih minimal 1 barang dulu.', 'error');
      return;
    }
    for (const c of reservasiCart) {
      if (!c.qty || c.qty <= 0) {
        showToast('Qty ' + c.kode + ' wajib diisi & lebih dari 0.', 'error');
        return;
      }
    }

    const line = document.getElementById('reservasiLine').value.trim();
    const group = document.getElementById('reservasiGroup').value.trim();
    const pelaksanaLapangan = document.getElementById('reservasiPelaksana').value;
    const namaEquipment = document.getElementById('reservasiNamaEquipment').value.trim();
    const nomorEquipment = document.getElementById('reservasiNomorEquipment').value.trim();
    const subEquipment1Nama = document.getElementById('reservasiSubEq1Nama').value.trim();
    const subEquipment1No = document.getElementById('reservasiSubEq1No').value.trim();
    const subEquipment2Nama = document.getElementById('reservasiSubEq2Nama').value.trim();
    const subEquipment2No = document.getElementById('reservasiSubEq2No').value.trim();
    const alasanPermintaan = resolveReservasiDropdown('reservasiAlasan', 'reservasiAlasanLain');
    const uraianPekerjaan = resolveReservasiDropdown('reservasiUraian', 'reservasiUraianLain');
    const referency = document.getElementById('reservasiReferency').value.trim();
    const maintenanceOrder = document.getElementById('reservasiMaintenanceOrder').value.trim();
    const keterangan = document.getElementById('reservasiKeterangan').value.trim();

    if (!line || !group || !pelaksanaLapangan || !namaEquipment || !alasanPermintaan || !uraianPekerjaan || !keterangan) {
      errEl.textContent = 'Line, Group, Pelaksana Lapangan, Nama Equipment, Alasan Permintaan Barang, Uraian Pekerjaan, & Kebutuhan/Keterangan wajib diisi.';
      errEl.hidden = false;
      return;
    }

    const btn = document.getElementById('btnReservasiSubmit');
    btn.disabled = true;
    btn.textContent = 'Mengajukan...';
    try {
      await Api.createReservasi({
        items: reservasiCart.map((c) => ({ kode: c.kode, namaBarang: c.namaBarang, satuan: c.satuan, qty: c.qty, sloc: c.sloc })),
        keterangan, line, group, pelaksanaLapangan, namaEquipment, nomorEquipment,
        subEquipment1Nama, subEquipment1No, subEquipment2Nama, subEquipment2No,
        alasanPermintaan, uraianPekerjaan, referency, maintenanceOrder,
        clientRequestId: generateClientRequestId()
      });
      showToast('Reservasi berhasil diajukan (' + reservasiCart.length + ' barang).', 'success');
      form.reset();
      reservasiCart = [];
      document.getElementById('reservasiAlasanLain').hidden = true;
      document.getElementById('reservasiUraianLain').hidden = true;
      renderReservasiCart();
      loadReservasiMilik();
      renderReservasiKatalog();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ajukan Reservasi';
    }
  });
}

async function loadReservasiStatusList() {
  const box = document.getElementById('reservasiStatusList');
  box.innerHTML = '<div class="empty-state">Memuat...</div>';
  try {
    const res = await Api.getReservasiList({});
    const data = res.data || [];
    if (!data.length) {
      box.innerHTML = '<div class="empty-state">Belum ada reservasi yang kamu ajukan.</div>';
      return;
    }
    box.innerHTML = data.map((r) => `
      <div class="entry-card">
        <div class="entry-card-top">
          <div class="entry-card-id">${r.idReservasi}</div>
          <span class="status-pill ${reservasiStatusPillClass(r.status)}">${r.status}</span>
        </div>
        <div class="entry-card-sub">${r.tanggal}${r.idPermintaan ? ' · ' + r.idPermintaan : ''}</div>
        <div class="entry-card-body">${r.kode} — ${r.namaBarang} · Qty ${r.qtyDiminta} ${r.satuan || ''}${r.sloc ? ' · S.Loc ' + r.sloc : ''}</div>
        ${r.namaEquipment ? '<div class="entry-card-sub">Equipment: ' + r.namaEquipment + (r.nomorEquipment ? ' (' + r.nomorEquipment + ')' : '') + '</div>' : ''}
        ${r.keterangan ? '<div class="entry-card-sub">' + r.keterangan + '</div>' : ''}
        ${r.catatanApproval ? '<div class="entry-card-sub">Catatan: ' + r.catatanApproval + '</div>' : ''}
        ${r.status === 'Selesai' ? '<div class="entry-card-sub">Diambil ' + r.qtyIssue + ' ' + (r.satuan || '') + ' pada ' + r.tanggalIssue + '</div>' : ''}
      </div>
    `).join('');
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Gagal memuat: ' + err.message + '</div>';
  }
}

function initReservasiPage() {
  if (!reservasiPageLoadedOnce) {
    reservasiPageLoadedOnce = true;
    wireReservasiTabs();
    wireReservasiForm();
    wireReservasiSearch();
    wireReservasiLainLain('reservasiAlasan', 'reservasiAlasanLain');
    wireReservasiLainLain('reservasiUraian', 'reservasiUraianLain');
  }
  reservasiCart = [];
  renderReservasiCart();
  loadReservasiMilik();
  loadReservasiKatalog();
}
