// Harita: karo ızgarası, odalar, kapılar, görev noktaları, havalandırmalar.
// solid  = çarpışma (duvar + eşya + kapalı kapı)
// opaque = görüşü engelleyen (duvar + kapalı kapı); eşyalar alçaktır, görüşü kesmez.
(function () {
  'use strict';
  const SS = window.SS;

  function facePoint(f, face, T) {
    let x, y, bx, by;
    const out = 4, stand = 24;
    if (face === 'bottom') { x = (f.x + f.w / 2) * T; y = (f.y + f.h) * T + out; bx = x; by = y + stand; }
    else if (face === 'top') { x = (f.x + f.w / 2) * T; y = f.y * T - out; bx = x; by = y - stand; }
    else if (face === 'left') { x = f.x * T - out; y = (f.y + f.h / 2) * T; bx = x - stand; by = y; }
    else { x = (f.x + f.w) * T + out; y = (f.y + f.h / 2) * T; bx = x + stand; by = y; }
    return { x, y, bx, by };
  }

  const M = (SS.Map = {
    build() {
      const C = SS.C, W = C.MAP_W, H = C.MAP_H, T = C.TILE, n = W * H;
      M.W = W; M.H = H; M.T = T; M.pxW = W * T; M.pxH = H * T;
      M.floor = new Uint8Array(n);
      M.furn = new Uint8Array(n);
      M.solid = new Uint8Array(n);
      M.opaque = new Uint8Array(n);
      M.nearWall = new Uint8Array(n);
      M.roomGrid = new Int8Array(n).fill(-1);
      M.doorGrid = new Int16Array(n).fill(-1);

      M.rooms = SS.ROOMS.map((r, i) => Object.assign({}, r, {
        index: i,
        px: r.x * T, py: r.y * T, pw: r.w * T, ph: r.h * T,
        cx: (r.x + r.w / 2) * T, cy: (r.y + r.h / 2) * T,
      }));
      M.roomById = {};
      M.rooms.forEach(r => { M.roomById[r.id] = r; });

      M.rooms.forEach(r => {
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          const i = y * W + x; M.floor[i] = 1; M.roomGrid[i] = r.index;
        }
      });
      SS.CORRIDORS.forEach(c => {
        for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) M.floor[y * W + x] = 1;
      });

      // Eşyalar: dekor + görev + sabotaj panelleri
      M.furniture = SS.FURNITURE.map(f => Object.assign({}, f));
      M.stations = SS.STATIONS.map((s, idx) => {
        const f = Object.assign({}, s.f);
        M.furniture.push(f);
        const p = facePoint(f, s.face, T);
        return Object.assign({ idx, id: s.id, type: s.type, room: s.room, f, face: s.face, name: SS.TASK_TYPES[s.type].name }, p);
      });
      M.panels = {};
      Object.keys(SS.PANELS).forEach(k => {
        const s = SS.PANELS[k];
        const f = Object.assign({}, s.f);
        M.furniture.push(f);
        M.panels[k] = Object.assign({ key: k, name: s.name, room: s.room, f, face: s.face }, facePoint(f, s.face, T));
      });
      M.furniture.forEach(f => {
        for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) M.furn[y * W + x] = 1;
      });

      M.vents = SS.VENTS.map(v => ({
        id: v.id, room: v.room, links: v.links.slice(), tx: v.tx, ty: v.ty,
        x: (v.tx + 0.5) * T, y: (v.ty + 0.5) * T,
        name: M.roomById[v.room].name,
      }));

      M.button = { x: SS.BUTTON_TILE.x * T, y: SS.BUTTON_TILE.y * T, r: 82 };

      M._detectDoors();
      M.recompute();

      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (M.solid[i]) continue;
        let near = 0;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (M.isSolidTile(x + dx, y + dy)) { near = 1; break; }
        }
        M.nearWall[i] = near;
      }
      return M;
    },

    // Oda sınırının hemen dışındaki koridor karoları kapı olur.
    _detectDoors() {
      const W = M.W, T = M.T;
      M.doors = [];
      M.rooms.forEach(r => {
        const sides = [
          { horiz: true, fixed: r.y - 1, from: r.x, to: r.x + r.w - 1 },
          { horiz: true, fixed: r.y + r.h, from: r.x, to: r.x + r.w - 1 },
          { horiz: false, fixed: r.x - 1, from: r.y, to: r.y + r.h - 1 },
          { horiz: false, fixed: r.x + r.w, from: r.y, to: r.y + r.h - 1 },
        ];
        sides.forEach(s => {
          let run = [];
          const flush = () => {
            if (!run.length) return;
            const xs = run.map(i => i % W), ys = run.map(i => Math.floor(i / W));
            const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
            const d = { id: M.doors.length, room: r.index, tiles: run.slice(), horiz: s.horiz, closed: false,
              px: x0 * T, py: y0 * T, pw: (x1 - x0 + 1) * T, ph: (y1 - y0 + 1) * T, anim: 0 };
            run.forEach(i => { M.doorGrid[i] = d.id; });
            M.doors.push(d);
            run = [];
          };
          for (let k = s.from; k <= s.to; k++) {
            const x = s.horiz ? k : s.fixed, y = s.horiz ? s.fixed : k;
            const i = y * W + x;
            if (x >= 0 && y >= 0 && x < W && y < M.H && M.floor[i] && M.roomGrid[i] === -1) run.push(i);
            else flush();
          }
          flush();
        });
      });
    },

    recompute() {
      const n = M.W * M.H;
      for (let i = 0; i < n; i++) {
        const d = M.doorGrid[i];
        const closedDoor = d >= 0 && M.doors[d].closed;
        M.opaque[i] = (!M.floor[i] || closedDoor) ? 1 : 0;
        M.solid[i] = (M.opaque[i] || M.furn[i]) ? 1 : 0;
      }
    },

    isSolidTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) return true;
      return M.solid[ty * M.W + tx] === 1;
    },
    isOpaqueTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) return true;
      return M.opaque[ty * M.W + tx] === 1;
    },
    roomIndexAt(x, y) {
      const tx = Math.floor(x / M.T), ty = Math.floor(y / M.T);
      if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) return -1;
      return M.roomGrid[ty * M.W + tx];
    },
    roomAt(x, y) {
      const i = M.roomIndexAt(x, y);
      return i >= 0 ? M.rooms[i] : null;
    },
    roomInfo(idxOrNull) {
      if (idxOrNull === null || idxOrNull === undefined || idxOrNull < 0) return SS.CORRIDOR_INFO;
      return M.rooms[idxOrNull];
    },

    setRoomDoors(roomIndex, closed) {
      let changed = false;
      M.doors.forEach(d => { if (d.room === roomIndex && d.closed !== closed) { d.closed = closed; changed = true; } });
      if (changed) M.recompute();
      return changed;
    },
    resetDoors() {
      M.doors.forEach(d => { d.closed = false; d.anim = 0; });
      M.recompute();
    },
    doorTilesOfRoom(roomIndex) {
      const out = [];
      M.doors.forEach(d => { if (d.room === roomIndex) out.push(...d.tiles); });
      return out;
    },
  });
})();
