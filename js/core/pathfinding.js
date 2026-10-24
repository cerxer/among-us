// Yol bulma: 8 yönlü A* (köşe kesmeden), duvar kenarı cezası, yol düzeltme ve istek kuyruğu.
(function () {
  'use strict';
  const SS = window.SS;

  const SQ2 = Math.SQRT2;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

  const P = (SS.Path = {
    init() {
      const n = SS.Map.W * SS.Map.H;
      P.g = new Float32Array(n);
      P.f = new Float32Array(n);
      P.parent = new Int32Array(n);
      P.openStamp = new Uint32Array(n);
      P.closedStamp = new Uint32Array(n);
      P.stamp = 0;
      P.heap = new Int32Array(n * 8);
      P.queue = [];
      P.stats = { searches: 0 };
    },

    clear() { P.queue.length = 0; },

    walkableTile(tx, ty) { return !SS.Map.isSolidTile(tx, ty); },

    nearestWalkable(tx, ty) {
      if (P.walkableTile(tx, ty)) return [tx, ty];
      for (let r = 1; r < 8; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (P.walkableTile(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
      return null;
    },

    _push(node, size) {
      const h = P.heap, f = P.f;
      let i = size;
      h[i] = node;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[h[p]] <= f[h[i]]) break;
        const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
      }
    },
    _pop(size) {
      const h = P.heap, f = P.f;
      const top = h[0];
      h[0] = h[size - 1];
      let i = 0; const n = size - 1;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < n && f[h[l]] < f[h[m]]) m = l;
        if (r < n && f[h[r]] < f[h[m]]) m = r;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
      return top;
    },

    // Karo yolunu döndürür (dizi: karo indeksleri) veya null.
    astar(sx, sy, gx, gy) {
      const M = SS.Map, W = M.W, H = M.H;
      const s = P.nearestWalkable(sx, sy), g = P.nearestWalkable(gx, gy);
      if (!s || !g) return null;
      const start = s[1] * W + s[0], goal = g[1] * W + g[0];
      P.stats.searches++;
      P.stamp++;
      const st = P.stamp;
      let size = 0;
      P.g[start] = 0;
      P.f[start] = 0;
      P.parent[start] = -1;
      P.openStamp[start] = st;
      P._push(start, size++);
      const gxT = g[0], gyT = g[1];
      while (size > 0) {
        const cur = P._pop(size--);
        if (P.closedStamp[cur] === st) continue;
        P.closedStamp[cur] = st;
        if (cur === goal) {
          const out = [];
          for (let c = cur; c !== -1; c = P.parent[c]) out.push(c);
          return out.reverse();
        }
        const cx = cur % W, cy = (cur / W) | 0;
        for (let k = 0; k < 8; k++) {
          const d = DIRS[k];
          const nx = cx + d[0], ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (M.solid[ni] || P.closedStamp[ni] === st) continue;
          if (d[0] !== 0 && d[1] !== 0) {
            if (M.solid[cy * W + nx] || M.solid[ny * W + cx]) continue; // köşe kesme yok
          }
          const ng = P.g[cur] + d[2] + (M.nearWall[ni] ? 0.6 : 0);
          if (P.openStamp[ni] === st && ng >= P.g[ni]) continue;
          P.openStamp[ni] = st;
          P.g[ni] = ng;
          const hx = Math.abs(nx - gxT), hy = Math.abs(ny - gyT);
          P.f[ni] = ng + (hx + hy) + (SQ2 - 2) * Math.min(hx, hy);
          P.parent[ni] = cur;
          if (size < P.heap.length) P._push(ni, size++);
        }
      }
      return null;
    },

    walkClear(ax, ay, bx, by, r) {
      const d = SS.util.dist(ax, ay, bx, by);
      const steps = Math.max(1, Math.ceil(d / 8));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (!SS.Physics.circleFree(ax + (bx - ax) * t, ay + (by - ay) * t, r)) return false;
      }
      return true;
    },

    // Dünya koordinatlarında düzeltilmiş yol noktaları.
    find(sx, sy, gx, gy) {
      const M = SS.Map, T = M.T, W = M.W;
      const tiles = P.astar(Math.floor(sx / T), Math.floor(sy / T), Math.floor(gx / T), Math.floor(gy / T));
      if (!tiles) return null;
      const pts = tiles.map(i => ({ x: (i % W + 0.5) * T, y: (((i / W) | 0) + 0.5) * T }));
      pts[0] = { x: sx, y: sy };
      const r = SS.C.RADIUS + 3;
      if (SS.Physics.circleFree(gx, gy, SS.C.RADIUS) && P.walkClear(pts[pts.length - 1].x, pts[pts.length - 1].y, gx, gy, SS.C.RADIUS)) {
        pts.push({ x: gx, y: gy });
      }
      // İp çekme (string pulling) ile gereksiz köşeleri at.
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !P.walkClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y, r)) j--;
        out.push(pts[j]);
        i = j;
      }
      out.shift();
      return out;
    },

    // Botlar yol isteğini kuyruğa atar; her karede sınırlı sayıda hesaplanır.
    request(c, gx, gy) {
      const b = c.brain;
      b.pathToken = (b.pathToken || 0) + 1;
      b.pathPending = true;
      b.path = null;
      b.pathIdx = 0;
      for (let k = P.queue.length - 1; k >= 0; k--) if (P.queue[k].c === c) P.queue.splice(k, 1);
      P.queue.push({ c, gx, gy, token: b.pathToken });
    },

    process(max) {
      let n = 0;
      while (P.queue.length && n < max) {
        const q = P.queue.shift();
        const b = q.c.brain;
        if (!b || b.pathToken !== q.token) continue;
        b.path = P.find(q.c.x, q.c.y, q.gx, q.gy);
        b.pathIdx = 0;
        b.pathPending = false;
        n++;
      }
    },
  });
})();
