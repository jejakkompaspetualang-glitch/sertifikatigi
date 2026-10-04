'use strict';

/**
 * Frontend Sistem Sertifikat Otomatis (GitHub Pages).
 * Semua pemeriksaan izin, validasi, pembuatan PDF, dan pengiriman email terjadi di backend Apps Script.
 * File ini hanya menampilkan data dan memanggil API. Jangan menaruh kata sandi, token, atau ID rahasia di sini.
 */

// Alamat Web App Apps Script (berakhiran /exec). Alamat ini publik, bukan rahasia.
const API_URL = 'https://script.google.com/macros/s/AKfycbyJuN4OO3pHJxnuFSLOZkArDKUz_XWbhX5Q1FOxab09MXTr86aVA431aeq6t5iHFbch/exec';
const REQUEST_TIMEOUT_MS = 90000; // membuat PDF + mengirim email dapat memakan waktu puluhan detik

let adminToken = '';
let adminRole = ''; // 'super' = super admin (semua fitur), 'validator' = admin validasi saja
let actionRunning = false;

const $ = function (id) { return document.getElementById(id); };

function apiConfigured() {
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[^/]+\/exec$/.test(API_URL);
}

/**
 * Panggil backend. POST memakai Content-Type text/plain agar browser tidak mengirim preflight CORS
 * (Apps Script tidak menjawab OPTIONS). Backend selalu membalas JSON {ok, data|error}.
 */
const BACKEND_HINT = 'Backend Apps Script belum benar: fungsi doGet/doPost tidak ditemukan. Simpan Code.gs, lalu Deploy > Kelola deployment > Edit > Versi baru > Deploy.';

/** Apps Script membalas HTML (bukan JSON) saat deployment salah; terjemahkan menjadi pesan yang jelas. */
function parseBackend(text) {
  try { return JSON.parse(text); } catch (e) { /* bukan JSON */ }
  console.error(/Script function not found/i.test(text) ? BACKEND_HINT : 'Respons backend bukan JSON. Pastikan Web App di-deploy dengan akses "Anyone" dan URL berakhiran /exec.');
  throw new Error('Layanan sedang mengalami gangguan. Silakan coba beberapa saat lagi atau hubungi panitia.');
}

async function api(action, payload) {
  if (!apiConfigured()) { console.error('API_URL belum diatur dengan URL Web App berakhiran /exec.'); throw new Error('Layanan belum dapat diakses. Silakan hubungi panitia.'); }
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
  let text;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      signal: controller.signal
    });
    text = await res.text();
  } catch (err) {
    throw new Error(err && err.name === 'AbortError'
      ? 'Server belum merespons dalam batas waktu. Silakan muat ulang daftar untuk memeriksa hasilnya sebelum mencoba kembali.'
      : 'Tidak dapat terhubung ke server. Silakan periksa koneksi internet Anda.');
  } finally {
    clearTimeout(timer);
  }
  const json = parseBackend(text);
  if (!json || json.ok !== true) throw new Error((json && json.error) || 'Permintaan tidak dapat diproses.');
  return json.data;
}

const CFG_KEY = 'ngabasoCfg';

function applyConfig(cfg) {
  // Teks bawaan ada di index.html; nilai dari backend hanya menimpa jika terisi.
  if (cfg.eventName) { $('eventName').textContent = cfg.eventName; document.title = cfg.eventName + ' - Sertifikat Digital'; }
  if (cfg.eventTheme) $('eventTheme').textContent = cfg.eventTheme;
  if (cfg.eventDescription) $('eventDesc').textContent = cfg.eventDescription;
  $('eventDate').textContent = cfg.eventDate || '';
  $('eventDate').classList.toggle('hidden', !cfg.eventDate);
  if (cfg.orgName) $('orgName').textContent = cfg.orgName;
  renderLineup(cfg);
}

/** Tampilkan konfigurasi tersimpan dulu (instan), lalu segarkan dari server. */
function loadCachedConfig() {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); if (c && typeof c === 'object') applyConfig(c); } catch (e) { /* abaikan */ }
}

async function loadConfig() {
  if (!apiConfigured()) return;
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 20000);
  try {
    const res = await fetch(API_URL + '?action=config', { signal: controller.signal });
    const json = parseBackend(await res.text());
    if (!json || json.ok !== true) return;
    const cfg = json.data || {};
    applyConfig(cfg);
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* kuota/izin */ }
  } catch (err) {
    // Konfigurasi hanya mempercantik judul; formulir tetap dapat dipakai.
    console.warn('[config] ' + (err && err.message));
  } finally {
    clearTimeout(timer);
  }
}

function showView(view) {
  $('publicView').classList.toggle('hidden', view !== 'public');
  $('adminView').classList.toggle('hidden', view !== 'admin');
  $('publicTab').classList.toggle('active', view === 'public');
  $('adminTab').classList.toggle('active', view === 'admin');
  $('publicTab').setAttribute('aria-pressed', String(view === 'public'));
  $('adminTab').setAttribute('aria-pressed', String(view === 'admin'));
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
  message('publicMessage', 'Formulir sedang dikirim...', '');
  try {
    const res = await api('submit', { form: data });
    const ok = !res || res.ok !== false;
    message('publicMessage', (res && res.message) || (ok ? 'Formulir berhasil dikirim.' : 'Formulir belum dapat diproses.'), ok ? 'success' : 'warning');
    if (ok) form.reset();
  } catch (err) {
    message('publicMessage', err.message || 'Terjadi kesalahan. Silakan coba kembali.', 'error');
  } finally {
    setBusy('submitBtn', false, 'Kirim Formulir');
  }
}

async function onLogin(ev) {
  ev.preventDefault();
  const password = $('adminPassword').value;
  setBusy('loginBtn', true, 'Memverifikasi...');
  message('loginMessage', 'Memverifikasi akses...', '');
  try {
    const res = await api('login', { password: password, name: $('adminName').value });
    if (!res || !res.token) throw new Error('Sesi tidak dapat dibuat. Silakan coba kembali.');
    adminToken = res.token;
    adminRole = res.role === 'validator' ? 'validator' : 'super';
    try { localStorage.setItem('igiAdminName', res.name || ''); } catch (e) { /* abaikan */ }
    applyRole();
    $('loginPanel').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('adminPassword').value = '';
    message('loginMessage', '', '');
    message('adminMessage', 'Berhasil masuk sebagai ' + (adminRole === 'validator' ? 'Admin Validasi' : 'Super Admin') + ' (' + (res.name || '-') + '). ' + 'Sesi berlaku hingga 6 jam.', 'success');
    loadSubmissions();
  } catch (err) {
    message('loginMessage', err.message || 'Gagal masuk.', 'error');
  } finally {
    setBusy('loginBtn', false, 'Masuk');
  }
}

let listSeq = 0;
async function loadSubmissions() {
  if (!adminToken) return;
  const list = $('submissionList');
  const filter = $('statusFilter').value;
  const tokenAtRequest = adminToken;
  const seq = ++listSeq;
  list.textContent = 'Memuat data...';
  try {
    const items = await api('list', { token: tokenAtRequest, filter: filter });
    if (seq !== listSeq || tokenAtRequest !== adminToken) return; // ada permintaan lebih baru / sudah keluar
    renderSubmissions(Array.isArray(items) ? items : []);
  } catch (err) {
    if (seq !== listSeq || tokenAtRequest !== adminToken) return;
    list.textContent = err.message || 'Gagal memuat data.';
    if (isSessionError(err)) logoutAdmin(false, err.message);
  }
}

function fmtDate(v) {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toLocaleString('id-ID') : '-';
}

function renderSubmissions(items) {
  const list = $('submissionList');
  list.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Tidak ada data untuk filter yang dipilih.'; list.appendChild(p); return;
  }
  items.forEach(function (item) {
    const card = document.createElement('article'); card.className = 'submissionCard';
    const title = document.createElement('div'); title.className = 'cardTitle';
    const name = document.createElement('h3'); name.textContent = item.fullName;
    const badge = document.createElement('span'); badge.className = 'status'; badge.textContent = item.status; badge.dataset.s = item.status;
    title.append(name, badge); card.appendChild(title);
    const details = document.createElement('div'); details.className = 'details';
    [
      ['Email', item.email], ['Kategori', item.category], ['Instansi', item.organization || '-'],
      ['Catatan', item.attendanceNote || '-'], ['Dikirim pada', fmtDate(item.timestamp)],
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
      actions.appendChild(actionButton('Setujui & kirim sertifikat', 'primary', async function () {
        const ok = await showDialog({
          title: 'Setujui dan kirim sertifikat?',
          message: 'Sertifikat akan dibuat dan dikirim melalui email kepada penerima berikut. Tindakan ini tidak dapat dibatalkan.',
          details: [['Penerima', item.fullName], ['Email', item.email], ['Kategori', item.category]],
          confirmText: 'Setujui & kirim', tone: 'primary'
        });
        if (ok) runAction('approve', item.id, note.value);
      }));
      actions.appendChild(actionButton('Tolak data', 'danger', async function () {
        if (!note.value.trim()) {
          await showDialog({
            title: 'Alasan penolakan diperlukan',
            message: 'Mohon isi kolom catatan admin dengan alasan penolakan agar dapat ditindaklanjuti oleh penerima.',
            confirmText: 'Mengerti', cancelText: null, tone: 'warning'
          });
          note.focus();
          return;
        }
        const ok = await showDialog({
          title: 'Tolak data ini?',
          message: 'Data akan ditandai sebagai ditolak dan alasan penolakan dicatat.',
          details: [['Penerima', item.fullName], ['Email', item.email], ['Alasan', note.value.trim()]],
          confirmText: 'Tolak data', tone: 'danger'
        });
        if (ok) runAction('reject', item.id, note.value);
      }));
    } else if (item.status === 'GAGAL' || item.status === 'DISETUJUI' || item.status === 'SEDANG DIPROSES') {
      actions.appendChild(actionButton('Coba kirim ulang', 'primary', async function () {
        const ok = await showDialog({
          title: 'Kirim ulang sertifikat?',
          message: 'Sistem akan mencoba kembali membuat dan mengirim sertifikat ke penerima berikut.',
          details: [['Penerima', item.fullName], ['Email', item.email]],
          confirmText: 'Kirim ulang', tone: 'primary'
        });
        if (ok) runAction('retry', item.id, '');
      }));
    }
    if (/^https:\/\//i.test(item.fileUrl || '')) {
      const link = document.createElement('a'); link.className = 'fileLink';
      link.href = item.fileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Buka PDF di Drive'; actions.appendChild(link);
    }
    card.appendChild(actions);
    list.appendChild(card);
  });
}

/**
 * Kotak dialog kustom (pengganti confirm/alert bawaan browser). Mengembalikan Promise<boolean>.
 * opts: title, message, details [[label, nilai]], confirmText, cancelText (null = hanya satu tombol), tone (primary|danger|warning).
 * Semua teks dipasang lewat textContent sehingga aman terhadap isian pengguna.
 */
const DIALOG_ICONS = {
  primary: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  danger: '<path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  warning: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>'
};

function showDialog(opts) {
  return new Promise(function (resolve) {
    const tone = DIALOG_ICONS[opts.tone] ? opts.tone : 'primary';
    const previous = document.activeElement;
    const overlay = el('div', 'dialogOverlay');
    const box = el('div', 'dialogBox tone-' + tone);
    box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'dialogTitle'); box.setAttribute('aria-describedby', 'dialogMessage');

    const icon = el('span', 'dialogIcon'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + DIALOG_ICONS[tone] + '</svg>';
    const title = el('h3', 'dialogTitle', opts.title || 'Konfirmasi'); title.id = 'dialogTitle';
    const msg = el('p', 'dialogMessage', opts.message || ''); msg.id = 'dialogMessage';
    box.append(icon, title, msg);

    if (opts.details && opts.details.length) {
      const dl = el('dl', 'dialogDetails');
      opts.details.forEach(function (d) { dl.append(el('dt', null, d[0]), el('dd', null, d[1] || '-')); });
      box.appendChild(dl);
    }

    const bar = el('div', 'dialogActions');
    const done = function (value) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove(); document.body.classList.remove('dialogOpen');
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    let cancelBtn = null;
    if (opts.cancelText !== null) {
      cancelBtn = el('button', 'secondary', opts.cancelText || 'Batal'); cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', function () { done(false); });
      bar.appendChild(cancelBtn);
    }
    const okBtn = el('button', tone === 'danger' ? 'danger' : 'primary', opts.confirmText || 'Ya, lanjutkan'); okBtn.type = 'button';
    okBtn.addEventListener('click', function () { done(true); });
    bar.appendChild(okBtn);
    box.appendChild(bar);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(cancelBtn ? false : true); }
      else if (e.key === 'Tab') { // fokus tetap berada di dalam dialog
        const f = Array.from(box.querySelectorAll('button'));
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && cancelBtn) done(false); });
    overlay.appendChild(box);
    document.body.appendChild(overlay); document.body.classList.add('dialogOpen');
    (tone === 'danger' && cancelBtn ? cancelBtn : okBtn).focus();
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
  message('adminMessage', 'Sedang memproses. Pembuatan PDF dan pengiriman email memerlukan beberapa saat.', '');
  try {
    const res = await api(action, { token: adminToken, id: id, note: note });
    message('adminMessage', (res && res.message) || 'Proses selesai.', res && res.ok === false ? 'warning' : 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Proses tidak berhasil.', 'error');
    if (isSessionError(err)) { actionRunning = false; logoutAdmin(false, err.message); return; }
  } finally {
    actionRunning = false;
  }
  loadSubmissions();
}

function logoutAdmin(callServer, reason) {
  const shouldCall = callServer !== false;
  const oldToken = adminToken;
  adminToken = '';
  adminRole = '';
  if (shouldCall && oldToken) api('logout', { token: oldToken }).catch(function () { /* sesi kedaluwarsa sendiri */ });
  $('dashboard').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');
  $('adminPassword').value = '';
  settingsLoaded = false;
  showAdminPanel('validation');
  $('submissionList').textContent = 'Silakan masuk untuk memuat data.';
  $('adminStats').textContent = '';
  $('adminHistory').textContent = '';
  message('loginMessage', reason || 'Anda telah keluar.', reason ? 'warning' : '');
}

/* ===== Daftar pembicara (publik) dan pengaturan acara (admin) ===== */
const ROLES = [
  { key: 'keynote', label: 'Pembicara Utama', max: 3 },
  { key: 'narasumber', label: 'Narasumber', max: 10 },
  { key: 'moderator', label: 'Moderator', max: 5 },
  { key: 'mc', label: 'Pembawa Acara', max: 3 }
];
const ASSETS = [
  { key: 'logo', label: 'Logo', hint: 'Ditampilkan pada bagian atas sertifikat.' },
  { key: 'signature', label: 'Tanda tangan & stempel', hint: 'Satu gambar berisi tanda tangan beserta stempel; diletakkan di atas nama penandatangan.' },
  { key: 'background', label: 'Latar sertifikat', wide: true, hint: 'Gambar JPG/PNG ukuran A4 landscape (disarankan 1684 x 1190 px). Gambar dipotong otomatis ke rasio A4 dan dikompres. Hapus untuk memakai latar bawaan. Logo ada di bagian atas tengah, ornamen sebaiknya di sudut agar teks tetap terbaca.' }
];
const SETTING_FIELDS = ['orgName', 'eventName', 'eventTheme', 'eventDate', 'eventDescription', 'eventKind', 'eventDuration', 'certificateCode', 'certificatePlace', 'certificateDate', 'signerName', 'signerTitle', 'signerNta'];
let settingsLoaded = false;
let DEFAULT_LINEUP = '';
let customLineup = false;
let DEFAULT_DESC = '';
let DEFAULT_PEOPLE = {};

/** Baca daftar pengisi acara bawaan di index.html agar muncul (dan dapat diedit) di Pengaturan Acara bila server belum menyimpan data. */
function parseDefaultPeople(html) {
  const out = {};
  const box = document.createElement('div'); box.innerHTML = html;
  Array.from(box.children).forEach(function (item) {
    const dt = item.querySelector('dt'), dd = item.querySelector('dd');
    if (!dt || !dd) return;
    const role = ROLES.filter(function (r) { return r.label.toLowerCase() === dt.textContent.trim().toLowerCase(); })[0];
    if (!role) return;
    const small = dd.querySelector('small');
    const name = Array.from(dd.childNodes).filter(function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('').trim();
    (out[role.key] = out[role.key] || []).push({ name: name, title: small ? small.textContent.trim() : '' });
  });
  return out;
}

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
  const dl = $('peopleList');
  if (!groups.length) { // tidak ada data: pakai tampilan bawaan di HTML
    if (customLineup) { dl.innerHTML = DEFAULT_LINEUP; customLineup = false; }
    return;
  }
  customLineup = true;
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

/* ===== Redaksi sertifikat dan email (admin) ===== */
const WORDING_UI = [
  { key: 'certTitle', label: 'Judul sertifikat', rows: 1 },
  { key: 'certIntro', label: 'Kalimat pembuka (sebelum nama penerima)', rows: 1 },
  { key: 'rolePeserta', label: 'Kalimat untuk Peserta', rows: 1 },
  { key: 'roleNarasumber', label: 'Kalimat untuk Narasumber', rows: 1 },
  { key: 'rolePanitia', label: 'Kalimat untuk Panitia', rows: 1 },
  { key: 'certEventLine', label: 'Kalimat kegiatan', rows: 1 },
  { key: 'certThemeLine', label: 'Kalimat tema (boleh 2 baris)', rows: 2 },
  { key: 'certClosing', label: 'Kalimat penutup', rows: 2 },
  { key: 'emailSubject', label: 'Subjek email', rows: 1 },
  { key: 'emailBody', label: 'Isi email', rows: 9 }
];
const PLACEHOLDER_HELP = {
  nama: 'nama penerima', instansi: 'instansi/sekolah', kategori: 'Peserta/Narasumber/Panitia', kegiatan: 'jenis + judul kegiatan',
  jenis_kegiatan: 'jenis kegiatan', nama_kegiatan: 'judul kegiatan', tema: 'tema', tanggal: 'tanggal pelaksanaan',
  durasi: 'durasi (JP)', organisasi: 'nama organisasi', nomor: 'nomor sertifikat', pengirim: 'nama pengirim email'
};
// Cadangan di browser: dipakai bila server (Code.gs) belum diperbarui, agar kolom redaksi tetap terisi dan terlihat.
const FALLBACK_WORDING = {
  certTitle: 'SERTIFIKAT',
  certIntro: 'Diberikan kepada:',
  rolePeserta: 'Atas partisipasi aktifnya sebagai Peserta',
  roleNarasumber: 'Atas kontribusi dan dedikasinya sebagai Narasumber',
  rolePanitia: 'Atas dedikasi dan kerja samanya sebagai Panitia',
  certEventLine: 'dalam kegiatan {kegiatan}',
  certThemeLine: 'dengan tema:\n\u201C{tema}\u201D',
  certClosing: 'diselenggarakan oleh {organisasi}[ setara dengan {durasi} Jam Pelajaran (JP)].',
  emailSubject: 'Sertifikat {kategori} \u2013 {nama_kegiatan}',
  emailBody: 'Yth. Bapak/Ibu {nama},\n\nAssalamu\u2019alaikum warahmatullahi wabarakatuh.\n\nTerima kasih atas partisipasi dan kontribusi Bapak/Ibu sebagai {kategori} dalam kegiatan "{nama_kegiatan}". Sebagai bentuk penghargaan, bersama email ini kami lampirkan sertifikat digital dalam format PDF.\n\nNomor sertifikat: {nomor}\n\nSemoga ilmu dan pengalaman yang diperoleh bermanfaat bagi peningkatan kualitas pembelajaran. Kami berharap dapat kembali bersilaturahmi pada kegiatan berikutnya.\n\nHormat kami,\n{pengirim}'
};
let WORDING_DEFAULTS = FALLBACK_WORDING;
let wordingSupported = true;

function buildWordingEditor() {
  const box = $('wordingEditor');
  box.textContent = '';
  WORDING_UI.forEach(function (f) {
    const lab = el('label', null, f.label); lab.setAttribute('for', 'w_' + f.key);
    const inp = f.rows > 1 ? el('textarea') : el('input');
    inp.id = 'w_' + f.key; if (f.rows > 1) inp.rows = f.rows; inp.maxLength = f.key === 'emailBody' ? 1500 : 300;
    inp.spellcheck = true;
    box.append(lab, inp);
  });
  const help = $('placeholderHelp');
  help.textContent = 'Kode tersedia: ';
  Object.keys(PLACEHOLDER_HELP).forEach(function (k, i) {
    if (i) help.appendChild(document.createTextNode(' '));
    const c = el('code', null, '{' + k + '}'); c.title = PLACEHOLDER_HELP[k]; help.appendChild(c);
  });
}

function fillWording(values) {
  WORDING_UI.forEach(function (f) { $('w_' + f.key).value = (values && values[f.key]) || ''; });
  renderWordingPreview();
}

function readWording() {
  const out = {};
  WORDING_UI.forEach(function (f) { out[f.key] = $('w_' + f.key).value; });
  return out;
}

/** Sama dengan renderTemplate_ di Code.gs, dipakai untuk pratinjau. */
function renderTemplate(tpl, vars) {
  const ph = /\{([a-z_]+)\}/g;
  const keysOf = function (str) { const ks = []; String(str).replace(ph, function (m, k) { ks.push(k); return m; }); return ks; };
  const out = [];
  String(tpl || '').split('\n').forEach(function (line) {
    const keys = keysOf(line);
    if (keys.length && keys.every(function (k) { return !vars[k]; })) return;
    const opt = line.replace(/\[([^\[\]]*)\]/g, function (m, inner) { return keysOf(inner).some(function (k) { return !vars[k]; }) ? '' : inner; });
    out.push(opt.replace(ph, function (m, k) { return vars[k] == null ? '' : String(vars[k]); }).replace(/ {2,}/g, ' ').replace(/ +([,.;:])/g, '$1').trim());
  });
  return out.join('\n');
}

function renderWordingPreview() {
  const val = function (id) { return ($(id) && $(id).value || '').trim(); };
  const kind = val('s_eventKind'), name = val('s_eventName');
  const cat = $('previewCategory').value;
  const W = {};
  WORDING_UI.forEach(function (f) { W[f.key] = val('w_' + f.key) || WORDING_DEFAULTS[f.key] || ''; });
  const V = {
    nama: 'Nama Penerima Contoh', instansi: 'Instansi Contoh', kategori: cat,
    kegiatan: (kind ? kind + ' ' : '') + name, jenis_kegiatan: kind, nama_kegiatan: name,
    tema: val('s_eventTheme'), tanggal: val('s_eventDate'), durasi: val('s_eventDuration').replace(/\s*JP\s*$/i, ''),
    organisasi: val('s_orgName'), nomor: '001/' + (val('s_certificateCode') || 'KODE') + '/X/2026', pengirim: 'Panitia Kegiatan'
  };
  const role = cat === 'Narasumber' ? W.roleNarasumber : cat === 'Panitia' ? W.rolePanitia : W.rolePeserta;
  const box = $('wordingPreview');
  box.textContent = '';
  const add = function (cls, text) { if (text) box.appendChild(el('p', cls, text)); };
  add('pvTitle', W.certTitle.toUpperCase());
  add('pvSmall', 'Nomor: ' + V.nomor);
  add('pvSmall', renderTemplate(W.certIntro, V));
  add('pvName', V.nama);
  add('pvSmall', V.instansi);
  add('pvRole', renderTemplate(role, V));
  add('pvEvent', renderTemplate(W.certEventLine, V));
  add('pvSmall pvPre', renderTemplate(W.certThemeLine, V));
  add('pvSmall', renderTemplate(W.certClosing, V));
  box.appendChild(el('hr'));
  add('pvMail', 'Subjek: ' + renderTemplate(W.emailSubject, V));
  add('pvMail pvPre', renderTemplate(W.emailBody, V));
}

/** Admin validasi melihat Validasi, Rekapitulasi, dan Histori; Pengaturan Acara khusus super admin. */
function applyRole() {
  const isSuper = adminRole === 'super';
  $('settingsTab').classList.toggle('hidden', !isSuper);
  $('dashDesc').textContent = isSuper
    ? 'Verifikasi data, pantau rekapitulasi dan histori persetujuan, serta kelola informasi kegiatan.'
    : 'Verifikasi data, pantau rekapitulasi, dan lihat histori persetujuan.';
  showAdminPanel('validation');
}

const ADMIN_PANELS = {
  validation: ['validationPanel', 'validationTab'], stats: ['statsPanel', 'statsTab'],
  history: ['historyPanel', 'historyTab'], settings: ['settingsPanel', 'settingsTab']
};

function showAdminPanel(which) {
  if (which === 'settings' && adminRole !== 'super') which = 'validation';
  Object.keys(ADMIN_PANELS).forEach(function (k) {
    $(ADMIN_PANELS[k][0]).classList.toggle('hidden', k !== which);
    $(ADMIN_PANELS[k][1]).classList.toggle('active', k === which);
  });
  if (!adminToken) return;
  if (which === 'settings' && !settingsLoaded) loadSettings();
  if (which === 'stats') loadAdminStats();
  if (which === 'history') loadHistory();
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
    const card = el('div', 'assetCard' + (a.wide ? ' wide' : ''));
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
    r.onerror = function () { reject(new Error('Berkas tidak dapat dibaca.')); };
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const i = new Image();
    i.onload = function () { resolve(i); };
    i.onerror = function () { reject(new Error('Berkas gambar tidak dapat dibaca.')); };
    i.src = src;
  });
}

/** Kecilkan di browser (PNG, transparansi dipertahankan) agar unggahan ringan dan cepat. */
async function shrinkImage(file) {
  const img = await loadImage(await readFileAsDataUrl(file));
  let max = 1000;
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
  throw new Error('Ukuran gambar terlalu besar. Silakan gunakan gambar dengan resolusi lebih rendah.');
}

/** Latar sertifikat: dipotong ke rasio A4 landscape (cover), diekspor JPEG dan dikompres hingga di bawah ~950 KB. */
async function shrinkBackground(file) {
  const img = await loadImage(await readFileAsDataUrl(file));
  const RATIO = 842 / 595;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (sw / sh > RATIO) { sw = sh * RATIO; sx = (img.width - sw) / 2; } else { sh = sw / RATIO; sy = (img.height - sh) / 2; }
  let outW = Math.min(1684, Math.round(sw));
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = outW; c.height = Math.round(outW / RATIO);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    for (let q = 0.9; q >= 0.5; q -= 0.1) {
      const out = c.toDataURL('image/jpeg', q);
      if (out.length < 1290000) return out;
    }
    outW = Math.round(outW * 0.8);
  }
  throw new Error('Ukuran gambar latar terlalu besar. Silakan gunakan gambar dengan resolusi lebih rendah.');
}

async function onAssetChosen(asset, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  message('adminMessage', 'Mengunggah ' + asset.label.toLowerCase() + '...', '');
  try {
    if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Gunakan gambar PNG atau JPG.');
    const res = await api('uploadAsset', { token: adminToken, kind: asset.key, dataUrl: asset.key === 'background' ? await shrinkBackground(file) : await shrinkImage(file) });
    setAssetPreview(asset.key, res.preview);
    message('adminMessage', asset.label + ' berhasil disimpan.', 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Unggah tidak berhasil.', 'error');
    if (isSessionError(err)) logoutAdmin(false, err.message);
  } finally {
    input.value = '';
  }
}

async function removeAsset(asset) {
  const ok = await showDialog({
    title: 'Hapus ' + asset.label.toLowerCase() + '?',
    message: 'Gambar akan dihapus dari pengaturan dan tidak lagi tampil pada sertifikat berikutnya.',
    confirmText: 'Hapus', tone: 'danger'
  });
  if (!ok) return;
  try {
    await api('removeAsset', { token: adminToken, kind: asset.key });
    setAssetPreview(asset.key, '');
    message('adminMessage', asset.label + ' dihapus.', 'success');
  } catch (err) {
    message('adminMessage', err.message || 'Gagal menghapus.', 'error');
    if (isSessionError(err)) logoutAdmin(false, err.message);
  }
}

async function loadSettings() {
  message('adminMessage', 'Memuat pengaturan...', '');
  try {
    const res = await api('getSettings', { token: adminToken });
    SETTING_FIELDS.forEach(function (k) { $('s_' + k).value = res.settings[k] || ''; });
    if (!$('s_eventDescription').value) $('s_eventDescription').value = DEFAULT_DESC;
    ROLES.forEach(function (r) {
      $('rows-' + r.key).textContent = '';
      const saved = res.settings[r.key];
      (saved && saved.length ? saved : (DEFAULT_PEOPLE[r.key] || [])).forEach(function (p) { addPersonRow(r, p); });
      updateCount(r);
    });
    ASSETS.forEach(function (a) { setAssetPreview(a.key, (res.assets && res.assets[a.key]) || ''); });
    wordingSupported = !!(res.wording && res.wordingDefaults);
    WORDING_DEFAULTS = res.wordingDefaults || FALLBACK_WORDING;
    fillWording(res.wording || WORDING_DEFAULTS);
    settingsLoaded = true;
    message('adminMessage', wordingSupported ? '' : 'Server (Code.gs) belum diperbarui. Redaksi dan latar sertifikat baru dapat disimpan setelah Code.gs versi terbaru di-deploy sebagai versi baru.', wordingSupported ? '' : 'warning');
  } catch (err) {
    message('adminMessage', err.message || 'Gagal memuat pengaturan.', 'error');
    if (isSessionError(err)) logoutAdmin(false, err.message);
  }
}

async function onSaveSettings(ev) {
  ev.preventDefault();
  const settings = {};
  SETTING_FIELDS.forEach(function (k) { settings[k] = $('s_' + k).value.trim(); });
  if (!settings.eventName) { message('adminMessage', 'Judul kegiatan wajib diisi.', 'error'); return; }
  ROLES.forEach(function (r) { settings[r.key] = readPeople(r); });
  if (wordingSupported) settings.wording = readWording();
  setBusy('saveSettingsBtn', true, 'Menyimpan...');
  try {
    const res = await api('saveSettings', { token: adminToken, settings: settings });
    message('adminMessage', wordingSupported ? res.message : 'Pengaturan lain disimpan, tetapi redaksi belum tersimpan karena Code.gs belum diperbarui dan di-deploy.', wordingSupported ? 'success' : 'warning');
    loadConfig();
  } catch (err) {
    message('adminMessage', err.message || 'Gagal menyimpan.', 'error');
    if (isSessionError(err)) logoutAdmin(false, err.message);
  } finally {
    setBusy('saveSettingsBtn', false, 'Simpan pengaturan');
  }
}

buildPeopleEditor();
buildAssetEditor();
buildWordingEditor();
$('settingsPanel').addEventListener('input', renderWordingPreview);
$('previewCategory').addEventListener('change', renderWordingPreview);
$('wordingResetBtn').addEventListener('click', async function () {
  const ok = await showDialog({
    title: 'Kembalikan redaksi ke bawaan?',
    message: 'Seluruh kalimat sertifikat dan email akan diisi ulang dengan redaksi bawaan. Perubahan baru berlaku setelah Anda menekan "Simpan pengaturan".',
    confirmText: 'Kembalikan', tone: 'warning'
  });
  if (ok) fillWording(WORDING_DEFAULTS);
});

$('validationTab').addEventListener('click', function () { showAdminPanel('validation'); });
$('settingsTab').addEventListener('click', function () { showAdminPanel('settings'); });
$('statsTab').addEventListener('click', function () { showAdminPanel('stats'); });
$('historyTab').addEventListener('click', function () { showAdminPanel('history'); });
$('reloadStatsBtn').addEventListener('click', loadAdminStats);
$('reloadHistoryBtn').addEventListener('click', loadHistory);
$('settingsPanel').addEventListener('submit', onSaveSettings);
$('publicTab').addEventListener('click', function () { showView('public'); });
$('adminTab').addEventListener('click', function () { showView('admin'); });
$('attendanceForm').addEventListener('submit', onSubmitAttendance);
$('loginForm').addEventListener('submit', onLogin);
$('logoutBtn').addEventListener('click', function () { logoutAdmin(); });
$('reloadBtn').addEventListener('click', loadSubmissions);
$('statusFilter').addEventListener('change', loadSubmissions);

if (!apiConfigured()) {
  message('publicMessage', 'Layanan pendaftaran belum tersedia. Silakan hubungi panitia.', 'warning');
}
DEFAULT_LINEUP = $('peopleList').innerHTML;
DEFAULT_DESC = $('eventDesc').textContent.trim();
DEFAULT_PEOPLE = parseDefaultPeople(DEFAULT_LINEUP);
try { $('adminName').value = localStorage.getItem('igiAdminName') || ''; } catch (e) { /* abaikan */ }
showView('public');
loadCachedConfig();
loadConfig();
loadPublicStats();


/* ===== Rekapitulasi (infografis), histori persetujuan, dan dasbor publik ===== */
const SVGNS = 'http://www.w3.org/2000/svg';
const CATEGORIES = ['Peserta', 'Narasumber', 'Panitia'];

function svgEl(tag, attrs, text) {
  const n = document.createElementNS(SVGNS, tag);
  Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  if (text != null) n.textContent = text;
  return n;
}
function fmtNum(n) { return Number(n || 0).toLocaleString('id-ID'); }

/* ===== Infografis interaktif ===== */
let uid = 0;
const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
  es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); countUp(e.target); } });
}, { threshold: 0.2 }) : null;
function reveal(node) { if (revealIO) revealIO.observe(node); else { node.classList.add('in'); countUp(node); } }
function countUp(root) {
  root.querySelectorAll('[data-to]').forEach(function (n) {
    const to = Number(n.dataset.to) || 0;
    if (REDUCE || !to) { n.textContent = fmtNum(to); return; }
    const t0 = performance.now();
    (function tick(t) { const p = Math.min(1, (t - t0) / 1100); n.textContent = fmtNum(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); })(t0);
  });
}
/** Kurva halus tanpa overshoot (S-curve horizontal antar titik). */
function smooth(p) {
  let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (let i = 1; i < p.length; i++) { const mx = ((p[i - 1][0] + p[i][0]) / 2).toFixed(1); d += ' C' + mx + ' ' + p[i - 1][1].toFixed(1) + ' ' + mx + ' ' + p[i][1].toFixed(1) + ' ' + p[i][0].toFixed(1) + ' ' + p[i][1].toFixed(1); }
  return d;
}
function sparkline(vals) {
  const W = 84, H = 30, max = Math.max.apply(null, vals.concat(1));
  const pts = vals.map(function (v, i) { return [i / (vals.length - 1) * W, H - 3 - (H - 6) * v / max]; });
  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('path', { d: smooth(pts), class: 'sparkLn' }));
  return svg;
}
function kpiCard(label, value, cls, note, onClick, spark) {
  const c = el(onClick ? 'button' : 'div', 'kpi ' + (cls || '') + (onClick ? ' link' : ''));
  if (onClick) { c.type = 'button'; c.addEventListener('click', onClick); }
  const s = el('strong', null, fmtNum(value)); s.dataset.to = value || 0;
  c.append(s, el('span', null, label));
  if (note) c.appendChild(el('small', null, note));
  if (spark && spark.length > 1) c.appendChild(sparkline(spark));
  return c;
}

/** Kerangka abu berdenyut selama data dimuat. */
function skeleton(box) {
  box.innerHTML = '';
  const g = el('div', 'kpiGrid');
  for (let i = 0; i < 4; i++) g.appendChild(el('div', 'kpi sk'));
  box.append(g, el('div', 'statCard wide sk skBlock'));
}

/** Buka tab Validasi dengan filter status tertentu (dari kartu angka admin). */
function gotoValidation(status) {
  $('statusFilter').value = status;
  showAdminPanel('validation');
  loadSubmissions();
}

const SERIES = [
  { key: 'submitted', cls: 'sub', label: 'Mengisi formulir' },
  { key: 'verified', cls: 'ver', label: 'Hadir terverifikasi' },
  { key: 'sent', cls: 'sent', label: 'Sertifikat terkirim' }
];

/** Grafik garis per pekan: kursor + tooltip, legenda yang dapat dinyalakan/dimatikan. */
function weeklyChartBlock(weekly) {
  const wrap = el('div', 'chartWrap'), n = weekly.length;
  if (!n) { wrap.appendChild(el('p', 'muted', 'Belum ada data pekan.')); return wrap; }
  const narrow = window.innerWidth < 640, W = narrow ? 420 : 720, H = 280, L = 34, R = 16, T = 16, B = 34;
  const pw = W - L - R, ph = H - T - B, gid = 'wg' + (++uid), on = { submitted: true, verified: true, sent: true }, els = {};
  let max = 4; weekly.forEach(function (w) { SERIES.forEach(function (s) { max = Math.max(max, w[s.key] || 0); }); });
  const top = Math.ceil(max / 4) * 4;
  const X = function (i) { return n > 1 ? L + pw * i / (n - 1) : L + pw / 2; };
  const Y = function (v) { return T + ph - ph * (v || 0) / top; };
  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Grafik kehadiran per pekan' });
  const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.append(svgEl('stop', { offset: '0', class: 'gs' }), svgEl('stop', { offset: '1', class: 'ge' }));
  svg.appendChild(svgEl('defs')); svg.firstChild.appendChild(lg);
  for (let i = 0; i <= 4; i++) {
    const v = top / 4 * i, y = Y(v);
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }), svgEl('text', { x: L - 8, y: y + 4, class: 'axis end' }, String(v)));
  }
  weekly.forEach(function (w, i) { if (!narrow || i % 2 === n % 2) svg.appendChild(svgEl('text', { x: X(i), y: H - B + 20, class: 'axis mid' }, w.label)); });
  const layer = svgEl('g', { class: 'reveal' }); svg.appendChild(layer);
  SERIES.forEach(function (s) {
    const pts = weekly.map(function (w, i) { return [X(i), Y(w[s.key])]; });
    const g = svgEl('g', { class: 'ser' });
    if (s.key === 'verified') g.appendChild(svgEl('path', { d: smooth(pts) + ' L' + X(n - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z', fill: 'url(#' + gid + ')' }));
    g.appendChild(svgEl('path', { d: smooth(pts), class: 'ln ln-' + s.cls }));
    layer.appendChild(g); els[s.key] = g;
  });
  const cur = svgEl('line', { x1: 0, x2: 0, y1: T, y2: T + ph, class: 'cursor' }), dots = svgEl('g');
  svg.append(cur, dots);
  const tip = el('div', 'tip'), plot = el('div', 'plot');
  function show(i) {
    const w = weekly[i], x = X(i);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x);
    dots.textContent = ''; tip.textContent = '';
    tip.appendChild(el('b', null, 'Pekan ' + w.label));
    SERIES.forEach(function (s) {
      if (!on[s.key]) return;
      dots.appendChild(svgEl('circle', { cx: x, cy: Y(w[s.key]), r: 4.5, class: 'dot dot-' + s.cls }));
      const r = el('p'); r.append(el('i', 'sw sw-' + s.cls), el('span', null, s.label), el('strong', null, fmtNum(w[s.key])));
      tip.appendChild(r);
    });
    const pct = x / W * 100;
    tip.style.left = pct + '%'; tip.style.transform = 'translateX(' + (pct > 68 ? '-106%' : pct < 32 ? '6%' : '-50%') + ')';
    wrap.classList.add('hov');
  }
  function hide() { wrap.classList.remove('hov'); dots.textContent = ''; }
  const cw = n > 1 ? pw / (n - 1) : pw;
  weekly.forEach(function (w, i) {
    const hit = svgEl('rect', { x: X(i) - cw / 2, y: T, width: cw, height: ph, class: 'hit', tabindex: '0', 'aria-label': 'Pekan ' + w.label + ': ' + w.submitted + ' mengisi formulir, ' + w.verified + ' terverifikasi, ' + w.sent + ' sertifikat terkirim' });
    ['pointerenter', 'pointermove', 'pointerdown', 'focus'].forEach(function (ev) { hit.addEventListener(ev, function () { show(i); }); });
    hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
    svg.appendChild(hit);
  });
  const legend = el('div', 'legend');
  SERIES.forEach(function (s) {
    const b = el('button', 'lgBtn'); b.type = 'button'; b.setAttribute('aria-pressed', 'true');
    b.append(el('i', 'sw sw-' + s.cls), document.createTextNode(s.label));
    b.addEventListener('click', function () {
      on[s.key] = !on[s.key]; els[s.key].classList.toggle('off', !on[s.key]);
      b.classList.toggle('off', !on[s.key]); b.setAttribute('aria-pressed', String(on[s.key])); hide();
    });
    legend.appendChild(b);
  });
  plot.append(svg, tip); wrap.append(legend, plot); reveal(wrap);
  return wrap;
}

/** Donat komposisi kehadiran; sorot kategori lewat kursor, sentuhan, atau fokus. */
function categoryCard(byCategory) {
  const card = el('div', 'statCard');
  card.appendChild(el('h3', null, 'Komposisi kehadiran'));
  card.appendChild(el('p', 'muted small2', 'Arahkan kursor atau sentuh untuk melihat rincian tiap kategori.'));
  let total = 0;
  CATEGORIES.forEach(function (c) { total += (byCategory[c] || {}).verified || 0; });
  const box = el('div', 'donutBox'), list = el('ul', 'dLegend');
  const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'donut', role: 'img', 'aria-label': 'Komposisi hadir per kategori' });
  svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 38, class: 'dTrack' }));
  const num = svgEl('text', { x: 50, y: 52, class: 'dNum' }, fmtNum(total)), lab = svgEl('text', { x: 50, y: 62, class: 'dLab' }, 'hadir terverifikasi');
  const parts = {};
  function focusCat(c) {
    svg.classList.toggle('dim', !!c);
    CATEGORIES.forEach(function (k) { parts[k].seg.classList.toggle('act', k === c); parts[k].li.classList.toggle('act', k === c); });
    const v = c ? (byCategory[c] || {}).verified || 0 : total;
    num.textContent = fmtNum(v); lab.textContent = c ? c + ' (' + (total ? Math.round(v / total * 100) : 0) + '%)' : 'hadir terverifikasi';
  }
  let acc = 0;
  CATEGORIES.forEach(function (c) {
    const d = byCategory[c] || { submitted: 0, verified: 0, sent: 0 }, pct = total ? d.verified / total * 100 : 0, k = c.toLowerCase();
    const seg = svgEl('circle', { cx: 50, cy: 50, r: 38, class: 'seg seg-' + k, pathLength: 100, 'stroke-dashoffset': -acc, transform: 'rotate(-90 50 50)' });
    seg.style.setProperty('--d', Math.max(0, pct - 0.8).toFixed(2)); acc += pct;
    const li = el('li'); li.tabIndex = 0;
    const head = el('b'); head.append(el('span', null, c), el('span', null, fmtNum(d.verified) + ' (' + Math.round(pct) + '%)'));
    li.append(el('i', 'sw sw-' + k), head, el('small', null, 'Mengisi ' + fmtNum(d.submitted) + ', terkirim ' + fmtNum(d.sent)));
    parts[c] = { seg: seg, li: li };
    [seg, li].forEach(function (n) {
      ['pointerenter', 'focus'].forEach(function (ev) { n.addEventListener(ev, function () { focusCat(c); }); });
      ['pointerleave', 'blur'].forEach(function (ev) { n.addEventListener(ev, function () { focusCat(null); }); });
    });
    svg.appendChild(seg); list.appendChild(li);
  });
  svg.append(num, lab); box.append(svg, list); card.appendChild(box);
  return card;
}

/** Corong: dari pengisi formulir sampai sertifikat terkirim. */
function funnelCard(t) {
  const card = el('div', 'statCard'), sub = t.submitted || 0;
  card.appendChild(el('h3', null, 'Alur menuju sertifikat'));
  card.appendChild(el('p', 'muted small2', 'Persentase dihitung dari seluruh pengisi formulir.'));
  [['Mengisi formulir', t.submitted, 'sub'], ['Hadir terverifikasi', t.verified, 'ver'], ['Sertifikat terkirim', t.sent, 'sent']].forEach(function (s) {
    const pct = sub ? Math.round((s[1] || 0) / sub * 100) : 0, row = el('div', 'fn'), head = el('div', 'fnHead'), track = el('div', 'fnTrack'), fill = el('i', 'fnBar fn-' + s[2]);
    head.append(el('span', null, s[0]), el('b', null, fmtNum(s[1]) + ' (' + pct + '%)'));
    fill.style.setProperty('--w', pct + '%'); track.appendChild(fill); row.append(head, track); card.appendChild(row);
  });
  return card;
}

function leaderCard(d, isAdmin) {
  const card = el('div', 'statCard');
  card.appendChild(el('h3', null, 'Guru paling rajin hadir'));
  if (!d.leaderboard) { card.appendChild(el('p', 'muted', 'Daftar ini tidak ditampilkan.')); return card; }
  if (!d.top || !d.top.length) { card.appendChild(el('p', 'muted', 'Belum ada kehadiran terverifikasi.')); return card; }
  card.appendChild(el('p', 'muted small2', 'Dihitung dari jumlah pekan berbeda dengan kehadiran terverifikasi (dari ' + fmtNum(d.activeWeeks) + ' pekan kegiatan).'));
  const podium = el('div', 'podium');
  d.top.slice(0, 3).forEach(function (p, i) {
    const c = el('div', 'pod p' + (i + 1));
    c.appendChild(el('span', 'av', initials(p.name) || String(i + 1)));
    c.appendChild(el('span', 'medal', ['Juara 1', 'Juara 2', 'Juara 3'][i]));
    c.appendChild(el('b', null, p.name));
    const sub = (isAdmin ? [p.org, p.email] : [p.org]).filter(Boolean).join(' | ');
    if (sub) c.appendChild(el('small', null, sub));
    c.appendChild(el('em', null, p.weeks + ' pekan'));
    podium.appendChild(c);
  });
  card.appendChild(podium);
  if (d.top.length > 3) {
    const list = el('ol', 'rank');
    d.top.slice(3).forEach(function (p, i) {
      const li = el('li');
      li.appendChild(el('span', 'pos', String(i + 4)));
      const who = el('div', 'who');
      who.appendChild(el('b', null, p.name));
      const sub = (isAdmin ? [p.org, p.email] : [p.org]).filter(Boolean).join(' | ');
      if (sub) who.appendChild(el('small', null, sub));
      const track = el('div', 'meter'); const fill = el('i', 'cat-peserta');
      fill.style.width = (d.activeWeeks ? Math.min(100, Math.round(p.weeks / d.activeWeeks * 100)) : 0) + '%';
      track.appendChild(fill); who.appendChild(track);
      li.append(who, el('span', 'score', p.weeks + ' pekan'));
      list.appendChild(li);
    });
    card.appendChild(list);
  }
  return card;
}

function updateHeroStats(t, d) {
  const box = $('heroStats'); if (!box) return;
  box.textContent = '';
  [['Guru berbeda hadir', d.uniqueTeachers], ['Hadir terverifikasi', t.verified], ['Sertifikat terkirim', t.sent]].forEach(function (x) {
    const c = el('div', 'hs'), s = el('strong', null, fmtNum(x[1])); s.dataset.to = x[1] || 0;
    c.append(s, el('span', null, x[0])); box.appendChild(c);
  });
  box.classList.remove('hidden'); reveal(box);
}

function renderStats(box, d, isAdmin) {
  box.innerHTML = '';
  const t = d.totals || {}, wk = d.weekly || [];
  const sp = function (k) { return wk.map(function (w) { return w[k] || 0; }); };
  const grid = el('div', 'kpiGrid');
  grid.append(
    kpiCard('Mengisi formulir', t.submitted, '', '', null, sp('submitted')),
    kpiCard('Hadir terverifikasi', t.verified, '', t.submitted ? Math.round((t.verified || 0) / t.submitted * 100) + '% dari pengisi' : '', null, sp('verified')),
    kpiCard('Sertifikat terkirim', t.sent, 'k-gold', '', null, sp('sent')),
    kpiCard('Guru berbeda hadir', d.uniqueTeachers, '', fmtNum(d.activeWeeks) + ' pekan kegiatan')
  );
  box.appendChild(grid); reveal(grid);
  if (isAdmin) {
    const todo = el('div', 'kpiGrid todo');
    todo.append(
      kpiCard('Menunggu validasi', t.pending, 'k-amber warn', 'Klik untuk memvalidasi', function () { gotoValidation('MENUNGGU VALIDASI'); }),
      kpiCard('Diproses / tertahan', t.processing, 'k-amber warn', '', function () { gotoValidation('DISETUJUI'); }),
      kpiCard('Gagal kirim', t.failed, 'k-red warn', '', function () { gotoValidation('GAGAL'); }),
      kpiCard('Ditolak', t.rejected, 'k-red warn', '', function () { gotoValidation('DITOLAK'); })
    );
    box.appendChild(todo); reveal(todo);
  }
  const chart = el('div', 'statCard wide');
  chart.appendChild(el('h3', null, 'Kehadiran dari pekan ke pekan'));
  chart.appendChild(el('p', 'muted small2', '12 pekan terakhir (Senin-Minggu), berdasarkan waktu pengisian formulir. Sentuh grafik untuk melihat angka tiap pekan.'));
  chart.appendChild(weeklyChartBlock(wk));
  box.appendChild(chart);
  const cols = el('div', 'statCols');
  cols.append(funnelCard(t), categoryCard(d.byCategory || {}));
  box.appendChild(cols); reveal(cols);
  box.appendChild(leaderCard(d, isAdmin));
  box.appendChild(el('p', 'muted small2', 'Hadir terverifikasi = data yang sudah disetujui admin. Diperbarui ' + fmtDate(d.generatedAt) + '.'));
  if (!isAdmin) updateHeroStats(t, d);
}

async function loadPublicStats() {
  if (!apiConfigured()) { $('publicStats').classList.add('hidden'); return; }
  const box = $('publicStatsBody');
  skeleton(box);
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 25000);
  try {
    const res = await fetch(API_URL + '?action=stats', { signal: controller.signal });
    const json = parseBackend(await res.text());
    if (!json || json.ok !== true) throw new Error('stats');
    renderStats(box, json.data || {}, false);
  } catch (err) {
    box.innerHTML = '';
    box.appendChild(el('p', 'muted', 'Statistik belum dapat dimuat saat ini.'));
    console.warn('[stats] ' + (err && err.message));
  } finally {
    clearTimeout(timer);
  }
}

async function loadAdminStats() {
  if (!adminToken) return;
  const box = $('adminStats'), tok = adminToken;
  skeleton(box);
  try {
    const d = await api('stats', { token: tok });
    if (tok !== adminToken) return;
    renderStats(box, d, true);
  } catch (err) {
    if (tok !== adminToken) return;
    box.textContent = err.message || 'Gagal memuat rekapitulasi.';
    if (isSessionError(err)) logoutAdmin(false, err.message);
  }
}

function historyLabel(a) { return a === 'DISETUJUI' ? 'Disetujui' : a === 'DITOLAK' ? 'Ditolak' : a === 'KIRIM ULANG' ? 'Kirim ulang' : a; }

function renderHistory(box, data) {
  box.innerHTML = '';
  const reviewers = data.reviewers || [], items = data.items || [];
  if (!items.length) { box.appendChild(el('p', 'muted', 'Belum ada riwayat persetujuan.')); return; }
  const sum = el('div', 'statCard wide');
  sum.appendChild(el('h3', null, 'Rekap per petugas'));
  let max = 1;
  reviewers.forEach(function (r) { max = Math.max(max, r.approved + r.rejected + r.retried); });
  reviewers.forEach(function (r) {
    const row = el('div', 'catRow');
    const head = el('div', 'catHead');
    head.append(el('span', null, r.name + (r.role === 'super' ? ' (Super Admin)' : ' (Admin Validasi)')),
      el('b', null, r.approved + ' disetujui | ' + r.rejected + ' ditolak' + (r.retried ? ' | ' + r.retried + ' kirim ulang' : '')));
    const track = el('div', 'meter'); const fill = el('i', 'cat-peserta');
    fill.style.width = Math.round((r.approved + r.rejected + r.retried) / max * 100) + '%';
    track.appendChild(fill);
    row.append(head, track, el('small', null, 'Aktivitas terakhir ' + fmtDate(r.last)));
    sum.appendChild(row);
  });
  box.appendChild(sum);

  const wrap = el('div', 'tableWrap');
  const table = el('table', 'histTable');
  const thead = el('thead'); const hr = el('tr');
  ['Waktu', 'Aksi', 'Penerima', 'Petugas', 'Catatan'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = el('tbody');
  items.forEach(function (it) {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(it.timestamp)));
    const tdA = el('td'); tdA.appendChild(el('span', 'tag tag-' + (it.action === 'DISETUJUI' ? 'ok' : it.action === 'DITOLAK' ? 'no' : 're'), historyLabel(it.action)));
    tr.appendChild(tdA);
    const tdP = el('td'); tdP.append(el('b', null, it.fullName), el('small', null, it.category + ' | ' + it.email));
    tr.appendChild(tdP);
    const tdR = el('td'); tdR.append(el('b', null, it.reviewer), el('small', null, it.role === 'super' ? 'Super Admin' : 'Admin Validasi'));
    tr.appendChild(tdR);
    tr.appendChild(el('td', null, it.note || '-'));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table); box.appendChild(wrap);
  if (items.length >= 300) box.appendChild(el('p', 'muted small2', 'Menampilkan 300 catatan terbaru. Riwayat lengkap ada di sheet ApprovalHistory.'));
}

async function loadHistory() {
  if (!adminToken) return;
  const box = $('adminHistory'), tok = adminToken;
  skeleton(box);
  try {
    const d = await api('history', { token: tok });
    if (tok !== adminToken) return;
    renderHistory(box, d || {});
  } catch (err) {
    if (tok !== adminToken) return;
    box.textContent = err.message || 'Gagal memuat histori.';
    if (isSessionError(err)) logoutAdmin(false, err.message);
  }
}
