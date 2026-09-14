// ============================================================================
// HALAMAN RESERVASI — 2 tab: "Ajukan" (cari & pilih barang dari SELURUH
// Master Data, isi qty & keterangan) & "Status Saya" (daftar reservasi yang
// sudah diajukan + statusnya).
//
// CATATAN PERUBAHAN (atas permintaan Bos): sebelumnya picker cuma nampilin
// "stock milik sendiri" (Sumber=USER+nama sendiri sesuai mekanisme yang
// sudah ada, lewat Api.getStockMilikUser) — sekarang user bisa ajukan
// reservasi barang APA SAJA dari Master Data, tidak harus yang sudah
// tercatat atas namanya. Pakai Api.getKatalogBarang (SEMUA Kode Barang,
// termasuk yang onHand 0) + search box client-side (kode/nama). onHand
// ditampilkan SEKADAR referensi, TIDAK membatasi Qty yang boleh diajukan —
// GDSP yang menilai feasible/tidak pas Approval. Api.getStockMilikUser masih
// ada di backend (tidak dihapus), cuma sudah tidak dipanggil dari sini lagi.
// ============================================================================

let reservasiKatalogList = [];
let reservasiSelectedItem = null;
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
  let html = shown.map((it) => {
    const adaStock = Number(it.onHand) > 0;
    const stockText = adaStock ? 'Stock: ' + it.onHand : 'Stock kosong';
    return `
    <div class="stock-pick-item" data-idx="${it._idx}">
      <div>
        <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
        <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}</div>
      </div>
      <div class="stock-pick-qty${adaStock ? '' : ' stock-pick-qty-empty'}">${stockText}</div>
    </div>
  `;
  }).join('');

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
  reservasiSelectedItem = reservasiKatalogList.find((it) => it._idx === idx);
  if (!reservasiSelectedItem) return;
  document.querySelectorAll('#reservasiStockPickerList .stock-pick-item').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.idx) === idx);
  });
  document.getElementById('reservasiFormFields').hidden = false;
  document.getElementById('reservasiSelectedLabel').textContent = reservasiSelectedItem.kode + ' — ' + (reservasiSelectedItem.namaBarang || '-');
  const hint = document.getElementById('reservasiStockHint');
  if (hint) {
    hint.textContent = Number(reservasiSelectedItem.onHand) > 0
      ? 'Stock saat ini di gudang: ' + reservasiSelectedItem.onHand + ' ' + (reservasiSelectedItem.satuan || '')
      : 'Stock saat ini kosong — tetap bisa diajukan, nanti GDSP yang proses.';
  }
  document.getElementById('reservasiQty').value = '';
}

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
  loadReservasiKatalog();
}
