// Görüş: karo ızgarasında DDA ışın yürüyüşü ile görüş hattı ve görüş poligonu.
(function () {
  'use strict';
  const SS = window.SS;

  const V = (SS.Vision = {
    // İki nokta arasında opak karo var mı?
    los(x1, y1, x2, y2) {
      const M = SS.Map, T = M.T;
      let tx = Math.floor(x1 / T), ty = Math.floor(y1 / T);
      const ex = Math.floor(x2 / T), ey = Math.floor(y2 / T);
      const dx = x2 - x1, dy = y2 - y1;
      const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
      const tDX = dx !== 0 ? Math.abs(T / dx) : Infinity;
      const tDY = dy !== 0 ? Math.abs(T / dy) : Infinity;
      let tMX = dx !== 0 ? (dx > 0 ? (tx + 1) * T - x1 : x1 - tx * T) / Math.abs(dx) : Infinity;
      let tMY = dy !== 0 ? (dy > 0 ? (ty + 1) * T - y1 : y1 - ty * T) / Math.abs(dy) : Infinity;
      for (let guard = 0; guard < 600; guard++) {
        if (tx === ex && ty === ey) return true;
        if (tMX < tMY) { if (tMX > 1) return true; tMX += tDX; tx += stepX; }
        else { if (tMY > 1) return true; tMY += tDY; ty += stepY; }
        if (M.isOpaqueTile(tx, ty)) return false;
      }
      return true;
    },

    // Birim yönde ilk opak karoya olan uzaklık.
    rayDist(x, y, dirx, diry, max) {
      const M = SS.Map, T = M.T;
      let tx = Math.floor(x / T), ty = Math.floor(y / T);
      const stepX = dirx > 0 ? 1 : -1, stepY = diry > 0 ? 1 : -1;
      const tDX = dirx !== 0 ? Math.abs(T / dirx) : 1e9;
      const tDY = diry !== 0 ? Math.abs(T / diry) : 1e9;
      let tMX = dirx !== 0 ? (dirx > 0 ? (tx + 1) * T - x : x - tx * T) / Math.abs(dirx) : 1e9;
      let tMY = diry !== 0 ? (diry > 0 ? (ty + 1) * T - y : y - ty * T) / Math.abs(diry) : 1e9;
      for (let guard = 0; guard < 400; guard++) {
        let t;
        if (tMX < tMY) { t = tMX; tMX += tDX; tx += stepX; }
        else { t = tMY; tMY += tDY; ty += stepY; }
        if (t >= max) return max;
        if (M.isOpaqueTile(tx, ty)) return t;
      }
      return max;
    },

    // Görüş poligonu: duvar yüzleri aydınlansın diye ışın biraz uzatılır.
    polygon(x, y, radius, rays) {
      const pts = new Float32Array(rays * 2);
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        let d = V.rayDist(x, y, c, s, radius);
        if (d < radius) d = Math.min(radius, d + 16);
        pts[i * 2] = x + c * d;
        pts[i * 2 + 1] = y + s * d;
      }
      return pts;
    },

    sees(viewer, x, y, radius) {
      const dx = x - viewer.x, dy = y - viewer.y;
      if (dx * dx + dy * dy > radius * radius) return false;
      return V.los(viewer.x, viewer.y, x, y);
    },
  });
})();
