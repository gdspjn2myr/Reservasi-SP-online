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
  document.getElementById('spkFotoPreview').hidden = true;
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
    ${spk.fotoSebelum ? '<p><a href="' + spk.fotoSebelum + '" target="_blank" rel="noopener">Lihat Foto Sebelum</a></p>' : ''}
    ${spk.fotoSelesai ? '<p><a href="' + spk.fotoSelesai + '" target="_blank" rel="noopener">Lihat Foto Selesai</a></p>' : ''}
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
