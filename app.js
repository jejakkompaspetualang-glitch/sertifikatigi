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
    // Teks bawaan ada di index.html; nilai dari backend hanya menimpa jika terisi.
    if (cfg.eventName) { $('eventName').textContent = cfg.eventName; document.title = cfg.eventName + ' - Sertifikat Digital'; }
    if (cfg.eventTheme) $('eventTheme').textContent = cfg.eventTheme;
    if (cfg.eventDescription) $('eventDesc').textContent = cfg.eventDescription;
    if (cfg.eventDate) { $('eventDate').textContent = cfg.eventDate; $('eventDate').classList.remove('hidden'); }
    if (cfg.orgName) $('orgName').textContent = cfg.orgName;
    renderLineup(cfg);
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
  settingsLoaded = false;
  showAdminPanel('validation');
  $('submissionList').textContent = 'Masuk untuk memuat data.';
  message('adminMessage', 'Anda telah keluar.', '');
}

/* ===== Daftar pembicara (publik) dan pengaturan acara (admin) ===== */
const ROLES = [
  { key: 'keynote', label: 'Keynote Speaker', max: 3 },
  { key: 'narasumber', label: 'Narasumber', max: 10 },
  { key: 'moderator', label: 'Moderator', max: 5 },
  { key: 'mc', label: 'MC', max: 3 }
];
const ASSETS = [
  { key: 'logo', label: 'Logo', hint: 'Tampil di atas sertifikat.' },
  { key: 'stamp', label: 'Stempel', hint: 'Di samping tanda tangan.' },
  { key: 'signature', label: 'Tanda tangan', hint: 'Di atas nama penandatangan.' }
];
const SETTING_FIELDS = ['orgName', 'eventName', 'eventTheme', 'eventDate', 'eventDescription', 'certificateText', 'signerName', 'signerTitle'];
let settingsLoaded = false;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function initials(name) {
  return String(name).replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
}

function renderLineup(cfg) {
  const groups = ROLES.filter(function (r) { return Array.isArray(cfg[r.key]) && cfg[r.key].length; });
  if (!groups.length) return; // tidak ada data: pertahankan tampilan bawaan di HTML
  const dl = $('peopleList');
  dl.textContent = '';
  groups.forEach(function (r) {
    cfg[r.key].forEach(function (p) {
      const item = el('div');
      const av = el('span', 'avatar', initials(p.name)); av.setAttribute('aria-hidden', 'true');
      const dd = el('dd', null, p.name);
      if (p.title) dd.appendChild(el('small', null, p.title));
      item.append(av, el('dt', null, r.label), dd);
      dl.appendChild(item);
    });
  });
}

function showAdminPanel(which) {
  const isSettings = which === 'settings';
  $('validationPanel').classList.toggle('hidden', isSettings);
  $('settingsPanel').classList.toggle('hidden', !isSettings);
  $('validationTab').classList.toggle('active', !isSettings);
  $('settingsTab').classList.toggle('active', isSettings);
  if (isSettings && !settingsLoaded) loadSettings();
}

function buildPeopleEditor() {
  const box = $('peopleEditor');
  box.textContent = '';
  ROLES.forEach(function (r) {
    const head = el('div', 'groupHead');
    head.appendChild(el('h4', null, r.label));
    const count = el('span', 'muted'); count.id = 'count-' + r.key; head.appendChild(count);
    const rows = el('div', 'rows'); rows.id = 'rows-' + r.key;
    const add = actionButton('Tambah ' + r.label, 'secondary', function () { addPersonRow(r, { name: '', title: '' }); });
    add.id = 'add-' + r.key;
    box.append(head, rows, add);
  });
}

function updateCount(role) {
  const n = $('rows-' + role.key).children.length;
  $('count-' + role.key).textContent = n + ' dari maksimal ' + role.max;
  $('add-' + role.key).disabled = n >= role.max;
}

function addPersonRow(role, person) {
  const rows = $('rows-' + role.key);
  if (rows.children.length >= role.max) return;
  const row = el('div', 'personRow');
  const name = el('input'); name.maxLength = 120; name.placeholder = 'Nama lengkap dan gelar'; name.value = person.name || '';
  name.setAttribute('aria-label', 'Nama ' + role.label);
  const title = el('input'); title.maxLength = 120; title.placeholder = 'Jabatan / asal (opsional)'; title.value = person.title || '';
  title.setAttribute('aria-label', 'Jabatan ' + role.label);
  const rm = actionButton('Hapus', 'danger', function () { row.remove(); updateCount(role); });
  row.append(name, title, rm);
  rows.appendChild(row);
  updateCount(role);
}

function readPeople(role) {
  return Array.from($('rows-' + role.key).children).map(function (row) {
    const f = row.querySelectorAll('input');
    return { name: f[0].value.trim(), title: f[1].value.trim() };
  }).filter(function (p) { return p.name || p.title; });
}

function buildAssetEditor() {
  const box = $('assetEditor');
  box.textContent = '';
  ASSETS.forEach(function (a) {
    const card = el('div', 'assetCard');
    card.append(el('strong', null, a.label), el('p', 'muted', a.hint));
    const img = el('img', 'assetPreview hidden'); img.id = 'asset-img-' + a.key; img.alt = 'Pratinjau ' + a.label;
    const empty = el('div', 'assetEmpty', 'Belum ada gambar'); empty.id = 'asset-empty-' + a.key;
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg'; file.setAttribute('aria-label', 'Unggah ' + a.label);
    file.addEventListener('change', function () { onAssetChosen(a, file); });
    const rm = actionButton('Hapus', 'danger', function () { removeAsset(a); });
    rm.id = 'asset-rm-' + a.key;
    card.append(img, empty, file, rm);
    box.appendChild(card);
  });
}

function setAssetPreview(key, dataUrl) {
  const img = $('asset-img-' + key);
  if (dataUrl) img.src = dataUrl; else img.removeAttribute('src');
  img.classList.toggle('hidden', !dataUrl);
  $('asset-empty-' + key).classList.toggle('hidden', !!dataUrl);
  $('asset-rm-' + key).classList.toggle('hidden', !dataUrl);
}

function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(new Error('File tidak dapat dibaca.')); };
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const i = new Image();
    i.onload = function () { resolve(i); };
    i.onerror = function () { reject(new Error('File gambar tidak dapat dibaca.')); };
    i.src = src;
  });
}

/** Kecilkan di browser (PNG, transparansi dipertahankan) agar unggahan ringan dan cepat. */
async function shrinkImage(file) {
  const img = await loadImage(await readFileAsDataUrl(file));
  let max = 700;
  for (let k = 0; k < 4; k++) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/png');
    if (out.length < 1200000) return out;
    max = Math.round(max * 0.7);
  }
  throw new Error('Gambar terlalu rumit. Gunakan gambar yang lebih sederhana.');
}

async function onAssetChosen(asset, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  message('adminMessage', 'Mengunggah ' + asset.label.toLowerCase() + '...', '');
  try {
    if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Gunakan gambar PNG atau JPG.');
    const res = await api('uploadAsset', { token: adminToken, kind: asset.key, dataUrl: await shrinkImage(file) });
    setAssetPreview(asset.key, res.preview);
    message('adminMessage', asset.label + ' berhasil disimpan.', 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Unggah gagal.', 'error');
    if (isSessionError(err)) logoutAdmin(false);
  } finally {
    input.value = '';
  }
}

async function removeAsset(asset) {
  if (!confirm('Hapus ' + asset.label.toLowerCase() + ' dari pengaturan?')) return;
  try {
    await api('removeAsset', { token: adminToken, kind: asset.key });
    setAssetPreview(asset.key, '');
    message('adminMessage', asset.label + ' dihapus.', 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Gagal menghapus.', 'error');
    if (isSessionError(err)) logoutAdmin(false);
  }
}

async function loadSettings() {
  message('adminMessage', 'Memuat pengaturan...', '');
  try {
    const res = await api('getSettings', { token: adminToken });
    SETTING_FIELDS.forEach(function (k) { $('s_' + k).value = res.settings[k] || ''; });
    ROLES.forEach(function (r) {
      $('rows-' + r.key).textContent = '';
      (res.settings[r.key] || []).forEach(function (p) { addPersonRow(r, p); });
      updateCount(r);
    });
    ASSETS.forEach(function (a) { setAssetPreview(a.key, (res.assets && res.assets[a.key]) || ''); });
    settingsLoaded = true;
    message('adminMessage', '', '');
  } catch (err) {
    message('adminMessage', err.message || 'Gagal memuat pengaturan.', 'error');
    if (isSessionError(err)) logoutAdmin(false);
  }
}

async function onSaveSettings(ev) {
  ev.preventDefault();
  const settings = {};
  SETTING_FIELDS.forEach(function (k) { settings[k] = $('s_' + k).value.trim(); });
  if (!settings.eventName) { message('adminMessage', 'Judul kegiatan wajib diisi.', 'error'); return; }
  ROLES.forEach(function (r) { settings[r.key] = readPeople(r); });
  setBusy('saveSettingsBtn', true, 'Menyimpan...');
  try {
    const res = await api('saveSettings', { token: adminToken, settings: settings });
    message('adminMessage', res.message, 'success');
    loadConfig();
  } catch (err) {
    message('adminMessage', err.message || 'Gagal menyimpan.', 'error');
    if (isSessionError(err)) logoutAdmin(false);
  } finally {
    setBusy('saveSettingsBtn', false, 'Simpan pengaturan');
  }
}

buildPeopleEditor();
buildAssetEditor();

$('validationTab').addEventListener('click', function () { showAdminPanel('validation'); });
$('settingsTab').addEventListener('click', function () { showAdminPanel('settings'); });
$('settingsPanel').addEventListener('submit', onSaveSettings);
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
