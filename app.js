'use strict';

/**
 * Frontend Sistem Sertifikat Otomatis (GitHub Pages).
 * Semua pemeriksaan izin, validasi, pembuatan PDF, dan pengiriman email terjadi di backend Apps Script.
 * File ini hanya menampilkan data dan memanggil API. Jangan menaruh kata sandi, token, atau ID rahasia di sini.
 */

// Alamat Web App Apps Script (berakhiran /exec). Alamat ini publik, bukan rahasia.
const API_URL = 'GANTI_DENGAN_URL_WEB_APP_EXEC';
const REQUEST_TIMEOUT_MS = 90000; // membuat PDF + mengirim email dapat memakan waktu puluhan detik

let adminToken = '';
let actionRunning = false;

const $ = function (id) { return document.getElementById(id); };

function apiConfigured() {
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[^/]+\/exec$/.test(API_URL);
}

/**
 * Panggil backend. POST memakai Content-Type text/plain agar browser tidak mengirim preflight CORS
 * (Apps Script tidak menjawab OPTIONS). Backend selalu membalas JSON {ok, data|error}.
 */
async function api(action, payload) {
  if (!apiConfigured()) throw new Error('Alamat server belum diatur. Isi API_URL di app.js dengan URL Web App berakhiran /exec.');
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      signal: controller.signal
    });
  } catch (err) {
    throw new Error(err && err.name === 'AbortError'
      ? 'Server tidak merespons tepat waktu. Muat ulang daftar untuk memeriksa hasilnya sebelum mencoba lagi.'
      : 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  } finally {
    clearTimeout(timer);
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone" dan URL berakhiran /exec.');
  }
  if (!json || json.ok !== true) throw new Error((json && json.error) || 'Permintaan gagal.');
  return json.data;
}

async function loadConfig() {
  if (!apiConfigured()) return;
  try {
    const res = await fetch(API_URL + '?action=config');
    const json = await res.json();
    if (!json || json.ok !== true) return;
    const cfg = json.data || {};
    if (cfg.eventName) { $('eventName').textContent = cfg.eventName; document.title = cfg.eventName + ' - Sertifikat Digital'; }
    $('eventDesc').textContent = cfg.eventDescription || '';
    if (cfg.eventDate) { $('eventDate').textContent = cfg.eventDate; $('eventDate').classList.remove('hidden'); }
  } catch (err) {
    // Konfigurasi hanya mempercantik judul; formulir tetap dapat dipakai.
  }
}

function showView(view) {
  $('publicView').classList.toggle('hidden', view !== 'public');
  $('adminView').classList.toggle('hidden', view !== 'admin');
  $('publicTab').classList.toggle('active', view === 'public');
  $('adminTab').classList.toggle('active', view === 'admin');
}

function message(id, text, kind) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'message' + (kind ? ' ' + kind : '');
}

function setBusy(buttonId, busy, label) {
  const btn = $(buttonId);
  btn.disabled = busy;
  if (label) btn.textContent = label;
}

function isSessionError(err) {
  return String((err && err.message) || '').toLowerCase().indexOf('sesi admin') !== -1;
}

async function onSubmitAttendance(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  if (!form.reportValidity()) return;
  const data = {
    fullName: $('fullName').value.trim(),
    email: $('email').value.trim(),
    category: $('category').value,
    organization: $('organization').value.trim(),
    attendanceNote: $('attendanceNote').value.trim(),
    website: $('website').value
  };
  setBusy('submitBtn', true, 'Mengirim...');
  message('publicMessage', 'Sedang mengirim formulir...', '');
  try {
    const res = await api('submit', { form: data });
    message('publicMessage', res.message, res.ok ? 'success' : 'warning');
    if (res.ok) form.reset();
  } catch (err) {
    message('publicMessage', err.message || 'Terjadi kesalahan. Coba lagi.', 'error');
  } finally {
    setBusy('submitBtn', false, 'Kirim Formulir');
  }
}

async function onLogin(ev) {
  ev.preventDefault();
  const password = $('adminPassword').value;
  setBusy('loginBtn', true, 'Memeriksa...');
  message('adminMessage', 'Memeriksa akses...', '');
  try {
    const res = await api('login', { password: password });
    adminToken = res.token;
    $('loginPanel').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('adminPassword').value = '';
    message('adminMessage', 'Berhasil masuk. Sesi berlaku hingga 6 jam atau cache berakhir.', 'success');
    loadSubmissions();
  } catch (err) {
    message('adminMessage', err.message || 'Gagal masuk.', 'error');
  } finally {
    setBusy('loginBtn', false, 'Masuk');
  }
}

async function loadSubmissions() {
  if (!adminToken) return;
  const list = $('submissionList');
  const filter = $('statusFilter').value;
  const tokenAtRequest = adminToken;
  list.textContent = 'Memuat data...';
  try {
    const items = await api('list', { token: tokenAtRequest, filter: filter });
    if (tokenAtRequest !== adminToken) return; // pengguna sudah keluar saat menunggu
    if ($('statusFilter').value !== filter) return; // filter berganti; permintaan yang lebih baru yang menang
    renderSubmissions(items);
  } catch (err) {
    list.textContent = err.message || 'Gagal memuat data.';
    if (isSessionError(err)) logoutAdmin(false);
  }
}

function renderSubmissions(items) {
  const list = $('submissionList');
  list.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Tidak ada data untuk filter ini.'; list.appendChild(p); return;
  }
  items.forEach(function (item) {
    const card = document.createElement('article'); card.className = 'submissionCard';
    const title = document.createElement('div'); title.className = 'cardTitle';
    const name = document.createElement('h3'); name.textContent = item.fullName;
    const badge = document.createElement('span'); badge.className = 'status'; badge.textContent = item.status;
    title.append(name, badge); card.appendChild(title);
    const details = document.createElement('div'); details.className = 'details';
    [
      ['Email', item.email], ['Kategori', item.category], ['Instansi', item.organization || '-'],
      ['Catatan', item.attendanceNote || '-'], ['Dikirim pada', item.timestamp ? new Date(item.timestamp).toLocaleString('id-ID') : '-'],
      ['Nomor sertifikat', item.certificateNo || '-'], ['Pesan terakhir', item.lastError || '-']
    ].forEach(function (pair) {
      const p = document.createElement('p');
      const strong = document.createElement('strong'); strong.textContent = pair[0] + ': ';
      p.append(strong, document.createTextNode(pair[1])); details.appendChild(p);
    });
    card.appendChild(details);
    const note = document.createElement('textarea'); note.rows = 2; note.maxLength = 500;
    note.placeholder = 'Catatan admin / alasan penolakan'; note.value = item.adminNote || '';
    note.setAttribute('aria-label', 'Catatan admin untuk ' + item.fullName); card.appendChild(note);
    const actions = document.createElement('div'); actions.className = 'actions';
    if (item.status === 'MENUNGGU VALIDASI') {
      actions.appendChild(actionButton('Setujui & kirim sertifikat', 'primary', function () {
        if (!confirm('Setujui data ' + item.fullName + ' dan kirim sertifikat ke ' + item.email + '?')) return;
        runAction('approve', item.id, note.value);
      }));
      actions.appendChild(actionButton('Tolak data', 'danger', function () {
        if (!note.value.trim()) { alert('Tuliskan alasan penolakan terlebih dahulu.'); return; }
        if (!confirm('Tolak data ' + item.fullName + '?')) return;
        runAction('reject', item.id, note.value);
      }));
    } else if (item.status === 'GAGAL' || item.status === 'DISETUJUI' || item.status === 'SEDANG DIPROSES') {
      actions.appendChild(actionButton('Coba kirim ulang', 'primary', function () {
        if (!confirm('Coba kirim ulang sertifikat ke ' + item.email + '?')) return;
        runAction('retry', item.id, '');
      }));
    }
    if (item.fileUrl) {
      const link = document.createElement('a'); link.className = 'fileLink';
      link.href = item.fileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Buka PDF di Drive'; actions.appendChild(link);
    }
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function actionButton(label, cls, callback) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = cls + ' small';
  btn.textContent = label; btn.addEventListener('click', callback); return btn;
}

async function runAction(action, id, note) {
  if (actionRunning) return;
  actionRunning = true;
  const buttons = $('submissionList').querySelectorAll('button');
  buttons.forEach(function (b) { b.disabled = true; });
  message('adminMessage', 'Memproses tindakan... (membuat PDF dan mengirim email dapat memakan waktu beberapa detik)', '');
  try {
    const res = await api(action, { token: adminToken, id: id, note: note });
    message('adminMessage', (res && res.message) || 'Selesai.', res && res.ok === false ? 'warning' : 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Tindakan gagal.', 'error');
    if (isSessionError(err)) { actionRunning = false; logoutAdmin(false); message('adminMessage', err.message, 'error'); return; }
  } finally {
    actionRunning = false;
  }
  loadSubmissions();
}

function logoutAdmin(callServer) {
  const shouldCall = callServer !== false;
  const oldToken = adminToken;
  adminToken = '';
  if (shouldCall && oldToken) api('logout', { token: oldToken }).catch(function () { /* sesi kedaluwarsa sendiri */ });
  $('dashboard').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');
  $('adminPassword').value = '';
  $('submissionList').textContent = 'Masuk untuk memuat data.';
  message('adminMessage', 'Anda telah keluar.', '');
}

$('publicTab').addEventListener('click', function () { showView('public'); });
$('adminTab').addEventListener('click', function () { showView('admin'); });
$('attendanceForm').addEventListener('submit', onSubmitAttendance);
$('loginForm').addEventListener('submit', onLogin);
$('logoutBtn').addEventListener('click', function () { logoutAdmin(); });
$('reloadBtn').addEventListener('click', loadSubmissions);
$('statusFilter').addEventListener('change', loadSubmissions);

if (!apiConfigured()) {
  message('publicMessage', 'Konfigurasi belum lengkap: isi API_URL di app.js dengan URL Web App Apps Script.', 'warning');
}
loadConfig();
