// Çarpışma: daire (karakter) ile karo ızgarası arasında itme tabanlı çözüm.
(function () {
  'use strict';
  const SS = window.SS;

  const P = (SS.Physics = {
    // Dairenin hiçbir katı karoya değmediğini doğrular.
    circleFree(x, y, r) {
      const M = SS.Map, T = M.T;
      const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
      const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!M.isSolidTile(tx, ty)) continue;
        const cx = Math.max(tx * T, Math.min(x, tx * T + T));
        const cy = Math.max(ty * T, Math.min(y, ty * T + T));
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < r * r - 0.01) return false;
      }
      return true;
    },

    // Daireyi katı karolardan dışarı iter (kayarak hareket sağlar).
    resolve(e, r) {
      const M = SS.Map, T = M.T;
      for (let iter = 0; iter < 4; iter++) {
        let pushed = false;
        const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T);
        const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (!M.isSolidTile(tx, ty)) continue;
          const l = tx * T, t = ty * T;
          const cx = Math.max(l, Math.min(e.x, l + T));
          const cy = Math.max(t, Math.min(e.y, t + T));
          let dx = e.x - cx, dy = e.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            e.x += (dx / d) * (r - d);
            e.y += (dy / d) * (r - d);
          } else {
            // Merkez karonun içinde: en yakın kenara it.
            const dl = e.x - l, dr = l + T - e.x, dt = e.y - t, db = t + T - e.y;
            const m = Math.min(dl, dr, dt, db);
            if (m === dl) e.x = l - r; else if (m === dr) e.x = l + T + r;
            else if (m === dt) e.y = t - r; else e.y = t + T + r;
          }
          pushed = true;
        }
        if (!pushed) break;
      }
    },

    // Kare hızından bağımsız, tünellemeyi önlemek için alt adımlı hareket.
    move(e, dx, dy, noclip) {
      const M = SS.Map, r = SS.C.RADIUS;
      const ox = e.x, oy = e.y;
      if (noclip) {
        e.x = Math.max(r, Math.min(M.pxW - r, e.x + dx));
        e.y = Math.max(r, Math.min(M.pxH - r, e.y + dy));
      } else {
        const len = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
        const sx = dx / steps, sy = dy / steps;
        for (let i = 0; i < steps; i++) {
          e.x += sx; P.resolve(e, r);
          e.y += sy; P.resolve(e, r);
        }
      }
      return Math.sqrt((e.x - ox) * (e.x - ox) + (e.y - oy) * (e.y - oy));
    },

    // Verilen noktaya en yakın serbest yeri bulur (kapı kapanınca sıkışmayı önler).
    findFreeSpot(x, y, r, avoidTiles) {
      const M = SS.Map, T = M.T;
      const ok = (px, py) => {
        if (!P.circleFree(px, py, r + 1)) return false;
        if (avoidTiles) {
          const ti = Math.floor(py / T) * M.W + Math.floor(px / T);
          if (avoidTiles.has(ti)) return false;
        }
        return true;
      };
      if (ok(x, y)) return { x, y };
      for (let rad = 6; rad <= 320; rad += 6) {
        const steps = Math.max(8, Math.floor(rad / 3));
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
          if (ok(px, py)) return { x: px, y: py };
        }
      }
      return { x, y };
    },
  });
})();
