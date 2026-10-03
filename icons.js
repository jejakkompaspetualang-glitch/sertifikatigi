/* Hiasan tampilan saja: avatar + lencana peran pada "Susunan Pengisi Acara" dan pemisahan baris judul hero.
   Tidak menyentuh logika app.js. MutationObserver menjaga hiasan tetap ada saat app.js memuat ulang data. */
(function () {
  'use strict';
  var ic = function (inner) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'; };
  var SILS = {
    keynote: '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><path d="M25 44c0-18 8-28 17-28s17 10 17 28v20H25z" fill="#1b1f3a"/><path d="M8 84c1-19 15-25 34-25s33 6 34 25z" fill="#1d4fb8"/><path d="M34 61l8 14 8-14 6 2-14 21-14-21z" fill="#fff"/><rect x="37" y="50" width="10" height="13" rx="3" fill="#efc3a2"/><ellipse cx="42" cy="38" rx="11" ry="13" fill="#f6d5bd"/><path d="M30 37c1-11 8-16 14-14 6 1 9 7 9 14-5-6-14-9-23 0z" fill="#1b1f3a"/></svg>',
    narasumber: '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><path d="M8 84c1-19 15-25 34-25s33 6 34 25z" fill="#0f2a63"/><path d="M34 60l8 15 8-15z" fill="#fff"/><path d="M40 64h4l1.5 14-3.5 3-3.5-3z" fill="#1d5bff"/><rect x="37" y="49" width="10" height="13" rx="3" fill="#efc3a2"/><ellipse cx="42" cy="37" rx="11" ry="13" fill="#f6d5bd"/><path d="M30 34c0-11 6-17 12-17s12 6 12 17c-4-5-8-7-12-7s-8 2-12 7z" fill="#1b1f3a"/></svg>',
    moderator: '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><path d="M22 48c0-20 8-31 20-31s20 11 20 31v20H22z" fill="#0f3a8a"/><path d="M8 84c1-18 15-24 34-24s33 6 34 24z" fill="#1d4fb8"/><ellipse cx="42" cy="40" rx="10" ry="12" fill="#f6d5bd"/><path d="M31 38c1-9 7-13 11-13s10 4 11 13c-4-4-8-5-11-5s-7 1-11 5z" fill="#0f3a8a"/></svg>',
    mc: '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><path d="M27 46c0-15 6-27 15-27s15 12 15 27c0 6-2 11-4 13H31c-2-2-4-7-4-13z" fill="#3a2418"/><path d="M8 84c1-19 15-25 34-25s33 6 34 25z" fill="#2f6bff"/><path d="M35 60l7 12 7-12z" fill="#f6d5bd"/><rect x="37" y="50" width="10" height="12" rx="3" fill="#efc3a2"/><ellipse cx="42" cy="38" rx="11" ry="13" fill="#f6d5bd"/><path d="M30 36c1-10 8-15 14-13 6 1 9 6 9 13-5-5-14-8-23 0z" fill="#3a2418"/></svg>',
    other: '<svg class="sil" viewBox="0 0 84 84" aria-hidden="true"><path d="M25 44c0-18 8-28 17-28s17 10 17 28v20H25z" fill="#1b1f3a"/><path d="M8 84c1-19 15-25 34-25s33 6 34 25z" fill="#1d4fb8"/><path d="M34 61l8 14 8-14 6 2-14 21-14-21z" fill="#fff"/><rect x="37" y="50" width="10" height="13" rx="3" fill="#efc3a2"/><ellipse cx="42" cy="38" rx="11" ry="13" fill="#f6d5bd"/><path d="M30 37c1-11 8-16 14-14 6 1 9 7 9 14-5-6-14-9-23 0z" fill="#1b1f3a"/></svg>'
  };
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
