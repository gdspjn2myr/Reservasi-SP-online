// ============================================================================
// HALAMAN RESERVASI — 2 tab: "Ajukan" & "Status Saya".
//
// Tab "Ajukan" punya 2 bagian pilih barang (atas permintaan Bos, dipisah
// biar jelas mana yang mana — sebelumnya sempat digabung jadi 1 daftar &
// bikin bingung karena judulnya masih "stock milik kamu" tapi isinya semua
// barang):
//   1. "Stock Milik Saya" — SEBELUMNYA doang, dari Api.getStockMilikUser
//      (mekanisme Sumber=USER+nama sendiri yang sudah ada di W-SMART).
//      Nampilin qty stock, Qty yang diajukan DIBATASI maksimal sejumlah itu.
//   2. "Ajukan Barang Lain" — dari Api.getKatalogBarang (SEMUA Kode Barang
//      di Master Data, termasuk yang onHand 0), ada search box karena
//      daftarnya bisa panjang. SENGAJA TIDAK menampilkan angka stock di
//      sini (beda dari bagian 1) & Qty TIDAK dibatasi — GDSP yang menilai
//      feasible/tidak pas Approval.
// Keduanya submit ke form yang SAMA di bawah (createReservasi sama persis).
// ============================================================================

let reservasiMilikList = [];
let reservasiKatalogList = [];
let reservasiSelectedItem = null; // { kode, namaBarang, satuan, plant, qty?, source: 'milik'|'katalog' }
let reservasiPageLoadedOnce = false;
let reservasiSearchTerm = '';

const RESERVASI_KATALOG_MAX_SHOWN = 60;

function reservasiStatusPillClass(status) {
  if (status === 'Barang Ready') return 'status-ready';
  if (status === 'Selesai') return 'status-selesai';
  if (status === 'Ditolak') return 'status-ditolak';
  return 'status-menunggu';
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
  box.innerHTML = reservasiMilikList.map((it) => `
    <div class="stock-pick-item" data-idx="${it._idx}">
      <div>
        <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
        <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}</div>
      </div>
      <div class="stock-pick-qty">${it.qty}</div>
    </div>
  `).join('');
  box.querySelectorAll('.stock-pick-item').forEach((el) => {
    el.addEventListener('click', () => selectReservasiMilikItem(Number(el.dataset.idx)));
  });
}

function selectReservasiMilikItem(idx) {
  const item = reservasiMilikList.find((it) => it._idx === idx);
  if (!item) return;
  reservasiSelectedItem = Object.assign({ source: 'milik' }, item);

  // Highlight cuma di list ini, list "Ajukan Barang Lain" ikut di-clear.
  document.querySelectorAll('#reservasiMilikList .stock-pick-item').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.idx) === idx);
  });
  document.querySelectorAll('#reservasiStockPickerList .stock-pick-item').forEach((el) => {
    el.classList.remove('selected');
  });

  document.getElementById('reservasiFormFields').hidden = false;
  document.getElementById('reservasiSelectedLabel').textContent = item.kode + ' — ' + (item.namaBarang || '-');
  document.getElementById('reservasiStockHint').textContent = 'Stock kamu: ' + item.qty + ' ' + (item.satuan || '');
  const qtyInput = document.getElementById('reservasiQty');
  qtyInput.max = item.qty;
  qtyInput.value = '';
}

// ---------------------------------------------------------------------------
// Bagian 2 — Ajukan Barang Lain (katalog SEMUA Kode Barang, tanpa angka
// stock ditampilkan, Qty bebas tidak dibatasi)
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
    box.innerHTML = '<div class="empty-state">Belum ada barang di Master Data.</div>';
    return;
  }

  const term = reservasiSearchTerm.trim().toLowerCase();
  const filtered = !term ? reservasiKatalogList : reservasiKatalogList.filter((it) =>
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
  let html = shown.map((it) => `
    <div class="stock-pick-item" data-idx="${it._idx}">
      <div>
        <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
        <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}</div>
      </div>
    </div>
  `).join('');

  if (filtered.length > shown.length) {
    html += '<div class="empty-state">Menampilkan ' + shown.length + ' dari ' + filtered.length + ' hasil — ketik lebih spesifik buat mempersempit pencarian.</div>';
  }

  box.innerHTML = html;
  box.querySelectorAll('.stock-pick-item').forEach((el) => {
    el.addEventListener('click', () => selectReservasiKatalogItem(Number(el.dataset.idx)));
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

function selectReservasiKatalogItem(idx) {
  const item = reservasiKatalogList.find((it) => it._idx === idx);
  if (!item) return;
  reservasiSelectedItem = Object.assign({ source: 'katalog' }, item);

  document.querySelectorAll('#reservasiStockPickerList .stock-pick-item').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.idx) === idx);
  });
  document.querySelectorAll('#reservasiMilikList .stock-pick-item').forEach((el) => {
    el.classList.remove('selected');
  });

  document.getElementById('reservasiFormFields').hidden = false;
  document.getElementById('reservasiSelectedLabel').textContent = item.kode + ' — ' + (item.namaBarang || '-');
  // Tidak nampilin angka stock di sini (sesuai permintaan) -- cukup kasih
  // tau ini di luar stock yang tercatat atas nama sendiri.
  document.getElementById('reservasiStockHint').textContent = 'Barang ini di luar stock yang tercatat atas nama kamu — GDSP yang akan proses.';
  const qtyInput = document.getElementById('reservasiQty');
  qtyInput.removeAttribute('max'); // Qty bebas, tidak dibatasi
  qtyInput.value = '';
}

// ---------------------------------------------------------------------------
// Form Ajukan Reservasi (dipakai bareng oleh 2 bagian di atas)
// ---------------------------------------------------------------------------
function wireReservasiForm() {
  const form = document.getElementById('reservasiForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!reservasiSelectedItem) {
      showToast('Pilih barang dulu.', 'error');
      return;
    }
    const qty = Number(document.getElementById('reservasiQty').value);
    const keterangan = document.getElementById('reservasiKeterangan').value.trim();
    if (!qty || qty <= 0) {
      showToast('Qty wajib diisi & lebih dari 0.', 'error');
      return;
    }
    if (reservasiSelectedItem.source === 'milik' && qty > reservasiSelectedItem.qty) {
      showToast('Qty melebihi stock yang tersedia (' + reservasiSelectedItem.qty + ').', 'error');
      return;
    }
    const btn = document.getElementById('btnReservasiSubmit');
    btn.disabled = true;
    btn.textContent = 'Mengajukan...';
    try {
      await Api.createReservasi({
        kode: reservasiSelectedItem.kode,
        namaBarang: reservasiSelectedItem.namaBarang,
        satuan: reservasiSelectedItem.satuan,
        plant: reservasiSelectedItem.plant,
        qty: qty,
        keterangan: keterangan,
        clientRequestId: generateClientRequestId()
      });
      showToast('Reservasi berhasil diajukan.', 'success');
      form.reset();
      reservasiSelectedItem = null;
      document.getElementById('reservasiFormFields').hidden = true;
      loadReservasiMilik();
      renderReservasiKatalog();
    } catch (err) {
      showToast(err.message, 'error');
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
        <div class="entry-card-sub">${r.tanggal}</div>
        <div class="entry-card-body">${r.kode} — ${r.namaBarang} · Qty ${r.qtyDiminta} ${r.satuan || ''}</div>
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
  }
  loadReservasiMilik();
  loadReservasiKatalog();
}
