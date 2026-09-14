// ============================================================================
// DAFTAR DEPARTEMENT PER PLANT — dipakai dropdown Departement di form Daftar
// (auth.js) & buat cek akses menu SPK Online (SPK_ELIGIBLE_DEPARTEMEN, harus
// SAMA PERSIS dengan SPK_ELIGIBLE_DEPARTEMEN_ di gas/Code.gs — kalau daftar
// Departement per Plant di bawah berubah, backend TIDAK perlu ikut berubah
// karena backend cuma peduli 4 nama ini buat SPK, tapi kalau daftar Plant
// atau Departement di form Daftar berubah, sesuaikan juga di sini.
// ============================================================================

const DEPARTEMEN_PER_PLANT = {
  '1111': [
    'Produksi Waferflat', 'Produksi Waferstick', 'Teknik Waferflat', 'Teknik Waferstick',
    'Utility Wafer', 'PPIC Wafer', 'QC Waferflat', 'QC Waferstick', 'PDQC', 'CI', 'IRGA',
    'Purchasing', 'QS', 'GDRM', 'GDPM', 'GDSP', 'GDFG'
  ],
  '1112': ['Proses', 'Packing', 'Teknik Proses', 'Teknik Packing', 'QC', 'PPIC', 'Utility'],
  '1113': ['Proses', 'Packing', 'Teknik Proses', 'Teknik Packing', 'QC', 'PPIC', 'Utility']
};

// Departement yang punya akses menu "SPK Online" — HARUS SAMA dengan
// SPK_ELIGIBLE_DEPARTEMEN_ di gas/Code.gs (backend tetap yang menentukan
// sesungguhnya, ini cuma buat UX sembunyikan menu di frontend).
const SPK_ELIGIBLE_DEPARTEMEN = ['GDPM', 'GDSP', 'GDFG', 'GDRM'];

function populatePlantDepartemenDropdown(plantSelectId, departemenSelectId) {
  const plantSelect = document.getElementById(plantSelectId);
  const deptSelect = document.getElementById(departemenSelectId);
  if (!plantSelect || !deptSelect) return;

  function refreshDeptOptions() {
    const list = DEPARTEMEN_PER_PLANT[plantSelect.value] || [];
    deptSelect.innerHTML = '<option value="">Pilih Departement</option>' +
      list.map((d) => `<option value="${d}">${d}</option>`).join('');
  }

  plantSelect.addEventListener('change', refreshDeptOptions);
  refreshDeptOptions();
}
