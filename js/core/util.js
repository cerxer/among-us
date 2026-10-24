// Ortak yardımcılar: tohumlanabilir rastgele sayı, matematik, olay yolu.
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const U = (SS.util = {
    _rng: mulberry32((Date.now() ^ 0x5bd1e995) >>> 0),
    seed(s) { U._rng = mulberry32(s >>> 0); },
    rand() { return U._rng(); },
    range(a, b) { return a + U._rng() * (b - a); },
    int(a, b) { return Math.floor(a + U._rng() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(U._rng() * arr.length)]; },
    chance(p) { return U._rng() < p; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(U._rng() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
    fmtTime(sec) {
      sec = Math.max(0, sec);
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
  });

  // Basit olay yolu: oyun mantığı olay yayınlar, arayüz/ses dinler.
  // Dinleyiciler açılışta bir kez eklenir; yeni maçta çoğalmaz.
  SS.events = {
    _h: {},
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    emit(ev, data) {
      const list = this._h[ev];
      if (!list) return;
      for (const fn of list.slice()) {
        try { fn(data); } catch (e) { console.error('[olay ' + ev + ']', e); }
      }
    },
    clear() { this._h = {}; },
  };
})();
