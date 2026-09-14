// ============================================================================
// KONFIGURASI FRONTEND — Reservasi Sparepart & SPK Online
// Isi WORKER_URL setelah Worker (worker/worker.js) di-deploy ke Cloudflare —
// Worker INI TERPISAH dari Worker W-SMART (repo utama), walau dua-duanya
// manggil backend GAS yang SAMA. Token rahasia TIDAK ada di sini — disimpan
// sebagai secret di Cloudflare Worker saja.
// ============================================================================

window.RESERVASI_CONFIG = {
  WORKER_URL: 'https://reservasisp.gdsp-jn2myr.workers.dev/',
  APP_NAME: 'Reservasi & SPK Online'
};
