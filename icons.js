/* Ikon peran untuk "Pembicara dan petugas". Hanya mengubah tampilan; tidak menyentuh logika app.js.
   Daftar yang dirender ulang dari konfigurasi server ikut diberi ikon lewat MutationObserver. */
(function () {
  'use strict';
  var wrap = function (inner) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'; };
  var ICONS = {
    keynote: wrap('<polygon points="12 2.5 14.9 8.6 21.5 9.4 16.6 14 17.9 20.6 12 17.3 6.1 20.6 7.4 14 2.5 9.4 9.1 8.6"/>'),
    narasumber: wrap('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/><path d="M7.5 12l3-3 2 2 3.5-3.5"/>'),
    moderator: wrap('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    mc: wrap('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    other: wrap('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>')
  };

  function pick(label) {
    var t = String(label || '').toLowerCase();
    if (t.indexOf('keynote') > -1) return 'keynote';
    if (t.indexOf('narasumber') > -1) return 'narasumber';
    if (t.indexOf('moderator') > -1) return 'moderator';
    if (/(^|\s)mc(\s|$)/.test(t)) return 'mc';
    return 'other';
  }

  function apply() {
    var list = document.getElementById('peopleList');
    if (!list) return;
    var items = list.querySelectorAll('.avatar');
    for (var i = 0; i < items.length; i++) {
      var av = items[i];
      if (av.getAttribute('data-icon')) continue;
      var dt = av.parentNode && av.parentNode.querySelector('dt');
      av.innerHTML = ICONS[pick(dt && dt.textContent)];
      av.setAttribute('data-icon', '1');
    }
  }

  apply();
  var list = document.getElementById('peopleList');
  if (list && 'MutationObserver' in window) {
    new MutationObserver(apply).observe(list, { childList: true, subtree: true });
  }
})();
