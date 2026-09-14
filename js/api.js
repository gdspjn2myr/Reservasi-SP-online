// ============================================================================
// API WRAPPER — sama persis polanya dengan W-SMART (js/api.js), disesuaikan
// nama config (RESERVASI_CONFIG) & daftar action yang dipakai repo ini saja.
// Dikirim sebagai text/plain (bukan application/json) supaya tidak memicu
// CORS preflight (OPTIONS) yang tidak perlu.
// ============================================================================

const API_TIMEOUT_MS = 30000;
// Upload foto (base64) dikasih waktu lebih lama dari action biasa.
const API_TIMEOUT_MS_LONG = { uploadFotoSpk: 45000 };

const API_ACTIONS_NO_SESSION = { login: true, register: true };

// ID unik per "percobaan simpan" — anti-dobel-simpan (lihat withIdempotency_
// di Code.gs), sama seperti W-SMART: dipakai pas createReservasi/createSpk/
// issueReservasi supaya retry submit (sinyal lemah dsb) tidak kesimpan 2x.
function generateClientRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

async function callApi(action, payload) {
  const cfg = window.RESERVASI_CONFIG;
  if (!cfg.WORKER_URL || cfg.WORKER_URL.indexOf('PASTE_CLOUDFLARE_WORKER_URL') !== -1) {
    throw new Error('WORKER_URL belum di-set di js/config.js');
  }

  const finalPayload = Object.assign({}, payload || {});
  if (!API_ACTIONS_NO_SESSION[action] && typeof Auth !== 'undefined') {
    finalPayload.sessionToken = Auth.getToken();
  }

  const body = JSON.stringify({ action: action, payload: finalPayload });
  const timeoutMs = API_TIMEOUT_MS_LONG[action] || API_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(cfg.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Server tidak merespons dalam ' + Math.round(timeoutMs / 1000) + ' detik (timeout). Coba lagi, atau cek koneksi.');
    }
    throw new Error('Gagal menghubungi server: ' + err.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' saat memanggil server.');
  }

  const json = await res.json();
  if (!json.ok) {
    if (json.sessionExpired && typeof window.handleSessionExpired === 'function') {
      window.handleSessionExpired();
    }
    throw new Error(json.error || 'Terjadi kesalahan pada server.');
  }
  return json;
}

const Api = {
  login: (payload) => callApi('login', payload),
  register: (payload) => callApi('register', payload),
  logout: (payload) => callApi('logout', payload),

  getStockMilikUser: () => callApi('getStockMilikUser'),

  createReservasi: (payload) => callApi('createReservasi', payload),
  getReservasiList: (payload) => callApi('getReservasiList', payload),

  createSpk: (payload) => callApi('createSpk', payload),
  getSpkList: (payload) => callApi('getSpkList', payload),
  getSpkLog: (payload) => callApi('getSpkLog', payload),
  uploadFotoSpk: (payload) => callApi('uploadFotoSpk', payload)
};
