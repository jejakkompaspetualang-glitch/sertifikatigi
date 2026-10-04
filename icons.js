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
  // Klik tab: gulir ke panel terkait. Tidak mengubah logika tab di app.js.
  [['publicTab', 'publicView'], ['adminTab', 'adminView']].forEach(function (p) {
    var tab = document.getElementById(p[0]);
    if (!tab) return;
    tab.addEventListener('click', function () {
      var panel = document.getElementById(p[1]);
      if (panel && panel.scrollIntoView) setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 30);
    });
  });
})();

/* Navigasi mengambang: tandai bagian halaman yang sedang dilihat. */
(function () {
  var links = document.querySelectorAll('.topnav a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {};
  Array.prototype.forEach.call(links, function (a) { var t = document.querySelector(a.getAttribute('href')); if (t) map[t.id] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      Array.prototype.forEach.call(links, function (a) { a.classList.remove('on'); });
      map[e.target.id].classList.add('on');
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  Object.keys(map).forEach(function (k) { io.observe(document.getElementById(k)); });
})();
