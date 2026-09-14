// ============================================================================
// HALAMAN RESERVASI — 2 tab: "Ajukan" (pilih dari stock milik sendiri, isi
// qty & keterangan) & "Status Saya" (daftar reservasi yang sudah diajukan +
// statusnya). "Stock milik sendiri" dari Api.getStockMilikUser (backend
// filter lewat mekanisme Sumber yang sudah ada di W-SMART).
// ============================================================================

let reservasiStockList = [];
let reservasiSelectedItem = null;
let reservasiPageLoadedOnce = false;

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

async function loadReservasiStockPicker() {
  const box = document.getElementById('reservasiStockPickerList');
  box.innerHTML = '<div class="empty-state">Memuat stock...</div>';
  try {
    const res = await Api.getStockMilikUser();
    reservasiStockList = res.data || [];
    if (!reservasiStockList.length) {
      box.innerHTML = '<div class="empty-state">Belum ada stock yang tercatat atas nama kamu.</div>';
      return;
    }
    box.innerHTML = reservasiStockList.map((it, idx) => `
      <div class="stock-pick-item" data-idx="${idx}">
        <div>
          <div class="stock-pick-name">${it.kode} — ${it.namaBarang || '-'}</div>
          <div class="stock-pick-meta">${it.plant ? 'Plant ' + it.plant : '(tanpa Plant)'} · ${it.satuan || ''}</div>
        </div>
        <div class="stock-pick-qty">${it.qty}</div>
      </div>
    `).join('');
    box.querySelectorAll('.stock-pick-item').forEach((el) => {
      el.addEventListener('click', () => selectReservasiStockItem(Number(el.dataset.idx)));
    });
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Gagal memuat stock: ' + err.message + '</div>';
  }
}

function selectReservasiStockItem(idx) {
  reservasiSelectedItem = reservasiStockList[idx];
  document.querySelectorAll('#reservasiStockPickerList .stock-pick-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
  document.getElementById('reservasiFormFields').hidden = false;
  document.getElementById('reservasiSelectedLabel').textContent = reservasiSelectedItem.kode + ' — ' + (reservasiSelectedItem.namaBarang || '-');
  document.getElementById('reservasiQty').max = reservasiSelectedItem.qty;
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
    if (qty > reservasiSelectedItem.qty) {
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
      loadReservasiStockPicker();
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
  }
  loadReservasiStockPicker();
}
