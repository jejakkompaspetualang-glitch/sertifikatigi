/* Hiasan tampilan saja: avatar + lencana peran pada "Susunan Pengisi Acara" dan pemisahan baris judul hero.
   Tidak menyentuh logika app.js. MutationObserver menjaga hiasan tetap ada saat app.js memuat ulang data. */
(function () {
  'use strict';
  var ic = function (inner) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'; };
  // Siluet netral: tidak bergantung pada jenis kelamin pembicara. Peran dibedakan oleh lencana.
  var NEUTRAL = '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="33" r="13" fill="#1d4fb8"/><path d="M14 84c1-17 12-25 28-25s27 8 28 25z" fill="#1d4fb8"/></svg>';
  var SILS = { keynote: NEUTRAL, narasumber: NEUTRAL, moderator: NEUTRAL, mc: NEUTRAL, other: NEUTRAL };
  var BADGE = {
    keynote: ic('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'),
    narasumber: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    moderator: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    mc: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    other: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>')
  };

  function pick(label) {
    var t = String(label || '').toLowerCase();
    if (t.indexOf('keynote') > -1 || t.indexOf('pembicara utama') > -1) return 'keynote';
    if (t.indexOf('narasumber') > -1) return 'narasumber';
    if (t.indexOf('moderator') > -1) return 'moderator';
    if (/(^|\s)mc(\s|$)/.test(t) || t.indexOf('pembawa acara') > -1) return 'mc';
    return 'other';
  }

  // Istilah tampilan yang lebih formal; data dan logika tetap memakai istilah asli.
  var LABELS = { 'keynote speaker': 'Pembicara Utama', 'mc': 'Pembawa Acara' };

  function avatars() {
    var list = document.getElementById('peopleList');
    if (!list) return;
    var dts = list.querySelectorAll('dt');
    for (var d = 0; d < dts.length; d++) {
      var key = dts[d].textContent.trim().toLowerCase();
      if (LABELS[key]) {
        var av0 = dts[d].parentNode.querySelector('.avatar');
        if (av0 && !av0.getAttribute('data-icon')) { /* ikon dipilih dari teks asli dulu */
          var kk = pick(dts[d].textContent);
          av0.innerHTML = SILS[kk] + '<i class="badge b-' + kk + '">' + BADGE[kk] + '</i>';
          av0.setAttribute('data-icon', '1');
        }
        dts[d].textContent = LABELS[key];
      }
    }
    var items = list.querySelectorAll('.avatar');
    for (var i = 0; i < items.length; i++) {
      var av = items[i];
      if (av.getAttribute('data-icon')) continue;
      var dt = av.parentNode && av.parentNode.querySelector('dt');
      var k = pick(dt && dt.textContent);
      av.innerHTML = SILS[k] + '<i class="badge b-' + k + '">' + BADGE[k] + '</i>';
      av.setAttribute('data-icon', '1');
    }
  }

  function span(cls, text) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  // "NGABASO IGA EDISI #22" -> dua baris: judul putih dan edisi emas.
  function title() {
    var h = document.getElementById('eventName');
    if (!h || h.querySelector('.ed')) return;
    var m = /^(.*?)\s*(EDISI\s*#?\s*\d+.*)$/i.exec(h.textContent.trim());
    if (!m || !m[1]) return;
    h.textContent = '';
    h.appendChild(span('t1', m[1]));
    h.appendChild(span('ed', m[2]));
  }

  // "Ikatan Guru Indonesia (IGI) Kabupaten Garut" -> baris pertama bergaris emas, baris kedua di bawahnya.
  function org() {
    var o = document.getElementById('orgName');
    if (!o || o.querySelector('.o1')) return;
    var m = /^(.*?\))\s+(.+)$/.exec(o.textContent.trim());
    if (!m) return;
    o.textContent = '';
    o.appendChild(span('o1', m[1]));
    o.appendChild(span('o2', m[2]));
  }

  function run() { avatars(); title(); org(); }
  run();
  if ('MutationObserver' in window) {
    ['peopleList', 'eventName', 'orgName'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) new MutationObserver(run).observe(el, { childList: true, subtree: true, characterData: true });
    });
  }
})();

/* Tab & subtab: tanpa gulir otomatis (penyebab loncatan di ponsel). Saat panel berganti tinggi,
   posisi bilah tab dijaga tetap di tempat yang sama pada layar. */
(function () {
  ['.tabs', '#subtabs'].forEach(function (sel) {
    var bar = document.querySelector(sel);
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('button'))) return;
      var before = bar.getBoundingClientRect().top;
      requestAnimationFrame(function () { // setelah handler app.js mengganti panel
        var d = bar.getBoundingClientRect().top - before;
        if (Math.abs(d) > 1) window.scrollBy({ top: d, left: 0, behavior: 'instant' });
      });
    }, true);
  });
})();

/* Menu mengambang: sorotan mengikuti posisi gulir, tetapi dikunci selama gulir otomatis
   setelah menu diketuk agar tidak berkedip melewati menu di antaranya. */
(function () {
  var nav = document.querySelector('.topnav');
  if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  var items = links.map(function (a) { return { a: a, t: document.querySelector(a.getAttribute('href')) }; }).filter(function (x) { return x.t; });
  if (!items.length) return;
  var current = null, locked = false, lockTimer = 0, ticking = false;
  function mark(a) {
    if (a === current) return;
    current = a;
    links.forEach(function (x) { x.classList.toggle('on', x === a); });
    var left = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2; // geser menu horizontal saja, bukan halaman
    if (nav.scrollTo) nav.scrollTo({ left: left, behavior: 'smooth' }); else nav.scrollLeft = left;
  }
  function spy() {
    ticking = false;
    if (locked) return;
    var line = window.innerHeight * 0.4, pick = items[0];
    items.forEach(function (x) { if (x.t.getBoundingClientRect().top <= line) pick = x; });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) pick = items[items.length - 1];
    mark(pick.a);
  }
  function unlock() { locked = false; clearTimeout(lockTimer); spy(); }
  window.addEventListener('scroll', function () {
    if (locked) { clearTimeout(lockTimer); lockTimer = setTimeout(unlock, 150); return; } // selesai bila gulir diam 150 ms
    if (!ticking) { ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  links.forEach(function (a) {
    a.addEventListener('click', function () { locked = true; mark(a); clearTimeout(lockTimer); lockTimer = setTimeout(unlock, 500); });
  });
  spy();
})();
