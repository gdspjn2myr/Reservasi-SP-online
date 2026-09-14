// ============================================================================
// HALAMAN SPK ONLINE — 2 tab: "Buat SPK" (Perbaikan Unit / Fabrikasi + Foto
// Sebelum WAJIB) & "Status Saya" (daftar SPK yang dibuat + status + klik buka
// detail/timeline feedback & update harian).
// ============================================================================

const JENIS_UNIT_SPK_OPTIONS = ['Forklift Solar', 'Pallet Mover', 'Counter Balance', 'Reachtruck', 'Handpallet', 'Tangga Elektrik', 'Lain-lain'];

let spkFotoSebelumHasil = null; // { base64, mimeType, previewUrl } sebelum diupload
let spkFotoSebelumUrl = '';     // url hasil Api.uploadFotoSpk (dikirim pas submit)
let spkPageLoadedOnce = false;

function spkStatusPillClass(status) {
  if (status === 'Open') return 'status-open';
  if (status === 'Onproses') return 'status-onproses';
  if (status === 'Closed') return 'status-closed';
  if (status === 'Hold') return 'status-hold';
  if (status === 'Ditolak') return 'status-ditolak';
  return 'status-menunggu';
}

function wireSpkTabs() {
  const tabs = document.querySelectorAll('#page-spk .simple-tab-btn');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#page-spk .simple-tab-panel').forEach((p) => { p.hidden = true; });
      document.getElementById(btn.dataset.tabTarget).hidden = false;
      if (btn.dataset.tabTarget === 'spkTabStatus') loadSpkStatusList();
    });
  });
}

function wireSpkJenisPengerjaanToggle() {
  const select = document.getElementById('spkJenisPengerjaan');
  const unitFields = document.getElementById('spkFieldsPerbaikanUnit');
  const fabrikasiFields = document.getElementById('spkFieldsFabrikasi');
  const jenisUnitSelect = document.getElementById('spkJenisUnit');
  jenisUnitSelect.innerHTML = '<option value="">Pilih Jenis Unit</option>' +
    JENIS_UNIT_SPK_OPTIONS.map((j) => `<option value="${j}">${j}</option>`).join('');

  select.addEventListener('change', () => {
    const isUnit = select.value === 'Perbaikan Unit';
    unitFields.hidden = !isUnit;
    fabrikasiFields.hidden = isUnit || select.value !== 'Fabrikasi';
  });
}

function wireSpkFotoUpload() {
  const box = document.getElementById('spkFotoUploadBox');
  const input = document.getElementById('spkFotoInput');
  const preview = document.getElementById('spkFotoPreview');
  const statusEl = document.getElementById('spkFotoStatus');

  box.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    spkFotoSebelumUrl = '';
    statusEl.textContent = 'Mengompres foto...';
    try {
      spkFotoSebelumHasil = await kompresFotoUntukUpload(file);
      preview.src = spkFotoSebelumHasil.previewUrl;
      preview.hidden = false;
      statusEl.textContent = 'Mengupload foto...';
      const res = await Api.uploadFotoSpk({
        imageBase64: spkFotoSebelumHasil.base64,
        mimeType: spkFotoSebelumHasil.mimeType,
        tipeFoto: 'sebelum'
      });
      spkFotoSebelumUrl = res.url;
      statusEl.textContent = 'Foto siap (sudah diupload).';
    } catch (err) {
      statusEl.textContent = 'Gagal upload foto: ' + err.message;
      spkFotoSebelumUrl = '';
    }
  });
}

function resetSpkForm() {
  document.getElementById('spkForm').reset();
  document.getElementById('spkFieldsPerbaikanUnit').hidden = true;
  document.getElementById('spkFieldsFabrikasi').hidden = true;
  const preview = document.getElementById('spkFotoPreview');
  preview.hidden = true;
  preview.removeAttribute('src'); // defensif — lihat fix .foto-upload-preview:not([hidden]) di style.css
  document.getElementById('spkFotoStatus').textContent = '';
  spkFotoSebelumHasil = null;
  spkFotoSebelumUrl = '';
}

function wireSpkForm() {
  const form = document.getElementById('spkForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!spkFotoSebelumUrl) {
      showToast('Foto sebelum wajib diupload dulu (tunggu sampai selesai upload).', 'error');
      return;
    }
    const jenisPengerjaan = document.getElementById('spkJenisPengerjaan').value;
    const deskripsi = document.getElementById('spkDeskripsi').value.trim();
    if (!jenisPengerjaan) { showToast('Pilih Jenis Pengerjaan.', 'error'); return; }
    if (!deskripsi) { showToast('Deskripsi Pengerjaan wajib diisi.', 'error'); return; }

    const payload = { jenisPengerjaan, deskripsi, fotoSebelum: spkFotoSebelumUrl, clientRequestId: generateClientRequestId() };
    if (jenisPengerjaan === 'Perbaikan Unit') {
      payload.jenisUnit = document.getElementById('spkJenisUnit').value;
      payload.nomorUnit = document.getElementById('spkNomorUnit').value.trim();
      if (!payload.jenisUnit || !payload.nomorUnit) { showToast('Jenis Unit & Nomor Unit/SN wajib diisi.', 'error'); return; }
    } else if (jenisPengerjaan === 'Fabrikasi') {
      payload.namaItemFabrikasi = document.getElementById('spkNamaItemFabrikasi').value.trim();
      payload.area = document.getElementById('spkArea').value.trim();
      if (!payload.namaItemFabrikasi || !payload.area) { showToast('Nama Item Fabrikasi & Area wajib diisi.', 'error'); return; }
    }

    const btn = document.getElementById('btnSpkSubmit');
    btn.disabled = true;
    btn.textContent = 'Mengirim...';
    try {
      await Api.createSpk(payload);
      showToast('SPK berhasil diajukan.', 'success');
      resetSpkForm();
      document.getElementById('spkFieldsPerbaikanUnit').hidden = true;
      document.getElementById('spkFieldsFabrikasi').hidden = true;
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ajukan SPK';
    }
  });
}

async function loadSpkStatusList() {
  const box = document.getElementById('spkStatusList');
  box.innerHTML = '<div class="empty-state">Memuat...</div>';
  try {
    const res = await Api.getSpkList({});
    const data = res.data || [];
    if (!data.length) {
      box.innerHTML = '<div class="empty-state">Belum ada SPK yang kamu buat.</div>';
      return;
    }
    box.innerHTML = data.map((s) => `
      <div class="entry-card" data-idspk="${s.idSpk}">
        <div class="entry-card-top">
          <div class="entry-card-id">${s.idSpk}</div>
          <span class="status-pill ${spkStatusPillClass(s.status)}">${s.status}</span>
        </div>
        <div class="entry-card-sub">${s.tanggalDibuat}</div>
        <div class="entry-card-body">${s.jenisPengerjaan}${s.jenisPengerjaan === 'Fabrikasi' ? ' — ' + s.namaItemFabrikasi : ' — ' + s.jenisUnit}</div>
        <div class="entry-card-flags">
          ${s.targetTanggalPengerjaan ? '<span class="status-pill status-open">Jadwal: ' + s.targetTanggalPengerjaan + '</span>' : ''}
          ${s.telat ? '<span class="status-pill status-telat">Telat</span>' : ''}
        </div>
      </div>
    `).join('');
    box.querySelectorAll('.entry-card').forEach((el) => {
      el.addEventListener('click', () => openSpkDetail(el.dataset.idspk, data));
    });
  } catch (err) {
    box.innerHTML = '<div class="empty-state">Gagal memuat: ' + err.message + '</div>';
  }
}

// Ekstrak file ID dari URL Drive (hasil file.getUrl(), format .../d/<id>/view)
// supaya bisa ditampilkan sebagai <img> thumbnail LANGSUNG di dalam app —
// bukan link yang buka tab baru & minta pilih akun Google (sama polanya
// dengan driveThumbUrl_ di W-SMART/js/spk-online.js, disalin ke sini karena
// file JS repo ini terpisah). Kalau formatnya beda/gagal di-parse, fallback
// ke link biasa. `size` dipakai buat bikin versi lebih besar (dipakai pas
// diklik buat "zoom") — TETAP lewat endpoint thumbnail, BUKAN link share
// asli, supaya klik foto TIDAK minta login/pilih akun Google.
function driveThumbUrl_(url, size) {
  if (!url) return '';
  const m = String(url).match(/\/d\/([^/]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size || 800}` : '';
}

function spkFotoHtml_(url, label) {
  if (!url) return '';
  const thumb = driveThumbUrl_(url, 800);
  const zoom = driveThumbUrl_(url, 1600);
  if (thumb) {
    // href ke versi thumbnail lebih besar (bukan url Drive asli) -> klik foto
    // buka tab baru yang langsung nampilin gambar, TANPA diminta login/pilih
    // akun Google (beda dari sebelumnya yang link ke share url Drive asli).
    // Label ditampilkan sebagai caption TEKS di atas foto (sebelumnya cuma
    // ada di atribut alt yang tidak kelihatan sama sekali di halaman biasa —
    // ini yang bikin Bos gabisa bedain mana Foto Sebelum vs Foto Selesai).
    return `<div class="spk-foto-row"><div class="spk-foto-block"><div class="spk-foto-caption">${label}</div><a href="${zoom}" target="_blank" rel="noopener"><img src="${thumb}" class="foto-upload-preview" alt="${label}"></a></div></div>`;
  }
  return `<div class="spk-foto-row"><div class="spk-foto-block"><div class="spk-foto-caption">${label}</div><p><a href="${url}" target="_blank" rel="noopener">Lihat ${label}</a></p></div></div>`;
}

async function openSpkDetail(idSpk, dataList) {
  const spk = dataList.find((s) => s.idSpk === idSpk);
  if (!spk) return;
  document.getElementById('spkDetailModalTitle').textContent = spk.idSpk;
  const body = document.getElementById('spkDetailModalBody');
  body.innerHTML = `
    <p><span class="status-pill ${spkStatusPillClass(spk.status)}">${spk.status}</span></p>
    <p><b>${spk.jenisPengerjaan}</b>${spk.jenisPengerjaan === 'Fabrikasi' ? ' — ' + spk.namaItemFabrikasi + ' (' + spk.area + ')' : ' — ' + spk.jenisUnit + ' (' + spk.nomorUnit + ')'}</p>
    <p>${spk.deskripsi}</p>
    ${spk.targetTanggalPengerjaan ? '<p>Target Tanggal Pengerjaan: ' + spk.targetTanggalPengerjaan + '</p>' : ''}
    ${spk.catatanApproval ? '<p>Catatan: ' + spk.catatanApproval + '</p>' : ''}
    ${spkFotoHtml_(spk.fotoSebelum, 'Foto Sebelum')}
    ${spkFotoHtml_(spk.fotoSelesai, 'Foto Selesai')}
    <div id="spkDetailLogList"><div class="empty-state">Memuat riwayat...</div></div>
  `;
  document.getElementById('spkDetailModalBackdrop').hidden = false;
  document.getElementById('spkDetailModal').hidden = false;

  try {
    const res = await Api.getSpkLog({ idSpk: idSpk });
    const logs = res.data || [];
    const logBox = document.getElementById('spkDetailLogList');
    if (!logs.length) {
      logBox.innerHTML = '<div class="empty-state">Belum ada feedback/update.</div>';
      return;
    }
    logBox.innerHTML = logs.map((l) => `
      <div class="spk-log-item ${l.tipe === 'Feedback Kebutuhan' ? 'log-feedback' : ''}">
        <div class="spk-log-meta">${l.tipe} · ${l.oleh} · ${l.tanggal}</div>
        <div class="spk-log-isi">${l.isi}</div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('spkDetailLogList').innerHTML = '<div class="empty-state">Gagal memuat riwayat: ' + err.message + '</div>';
  }
}

function closeSpkDetail() {
  document.getElementById('spkDetailModalBackdrop').hidden = true;
  document.getElementById('spkDetailModal').hidden = true;
}

function wireSpkDetailModal() {
  document.getElementById('btnCloseSpkDetailModal').addEventListener('click', closeSpkDetail);
  document.getElementById('spkDetailModalBackdrop').addEventListener('click', closeSpkDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('spkDetailModal').hidden) closeSpkDetail();
  });
}

function initSpkPage() {
  if (!spkPageLoadedOnce) {
    spkPageLoadedOnce = true;
    wireSpkTabs();
    wireSpkJenisPengerjaanToggle();
    wireSpkFotoUpload();
    wireSpkForm();
    wireSpkDetailModal();
  }
}
