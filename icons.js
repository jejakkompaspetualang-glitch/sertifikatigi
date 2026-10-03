/* Hiasan tampilan saja: avatar + lencana peran pada "Pembicara dan Petugas" dan pemisahan baris judul hero.
   Tidak menyentuh logika app.js. MutationObserver menjaga hiasan tetap ada saat app.js memuat ulang data. */
(function () {
  'use strict';
  var ic = function (inner) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'; };
  var SIL = '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="33" r="14"/><path d="M12 84c2-22 16-29 30-29s28 7 30 29z"/></svg>';
  var BADGE = {
    keynote: ic('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'),
    narasumber: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    moderator: ic('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    mc: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    other: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>')
  };

  function pick(label) {
    var t = String(label || '').toLowerCase();
    if (t.indexOf('keynote') > -1) return 'keynote';
    if (t.indexOf('narasumber') > -1) return 'narasumber';
    if (t.indexOf('moderator') > -1) return 'moderator';
    if (/(^|\s)mc(\s|$)/.test(t)) return 'mc';
    return 'other';
  }

  function avatars() {
    var list = document.getElementById('peopleList');
    if (!list) return;
    var items = list.querySelectorAll('.avatar');
    for (var i = 0; i < items.length; i++) {
      var av = items[i];
      if (av.getAttribute('data-icon')) continue;
      var dt = av.parentNode && av.parentNode.querySelector('dt');
      var k = pick(dt && dt.textContent);
      av.innerHTML = SIL + '<i class="badge b-' + k + '">' + BADGE[k] + '</i>';
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
