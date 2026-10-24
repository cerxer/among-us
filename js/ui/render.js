// Dünya çizimi: önceden çizilmiş harita katmanı, dinamik nesneler, karakterler, görüş sisi, göstergeler.
// Yalnızca okur; oyun durumunu değiştirmez.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;
  const INK = '#080a1c';

  const R = (SS.Render = {
    canvas: null, ctx: null, dpr: 1, w: 0, h: 0, scale: 1,
    cam: { x: 0, y: 0 }, camSnap: true, t: 0, last: 0,
    mapLayer: null, fog: null, fogCtx: null, stars: [], blinkers: [],
    deathFx: null,

    init(canvas) {
      R.canvas = canvas;
      R.ctx = canvas.getContext('2d');
      R.fog = document.createElement('canvas');
      R.fogCtx = R.fog.getContext('2d');
      R.buildStars();
      R.buildMapLayer();
      R.resize();
      SS.events.on('matchStart', () => { R.camSnap = true; R.deathFx = null; });
      SS.events.on('meetingEnd', () => { R.camSnap = true; });
      SS.events.on('kill', e => { if (e.victim.isPlayer) R.deathFx = { t: 0, killer: SS.Game.displayOf(e.killer), victim: e.victim }; });
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      R.dpr = dpr; R.w = w; R.h = h;
      R.canvas.width = Math.round(w * dpr);
      R.canvas.height = Math.round(h * dpr);
      R.canvas.style.width = w + 'px';
      R.canvas.style.height = h + 'px';
      // Alan tabanlı ölçek: dikey telefonda da yeterli genişlik, masaüstünde yeterli yakınlık.
      R.scale = U.clamp(Math.sqrt(w * h) / 780, 0.6, 1.5);
      R.fog.width = Math.max(1, Math.round(w / 2));
      R.fog.height = Math.max(1, Math.round(h / 2));
      R.camSnap = true;
    },

    buildStars() {
      R.stars = [];
      for (let layer = 0; layer < 3; layer++) {
        const arr = [];
        for (let i = 0; i < 110; i++) arr.push({ x: Math.random() * 1200, y: Math.random() * 1200, r: Math.random() * (0.6 + layer * 0.55) + 0.4, tw: Math.random() * 6 });
        R.stars.push(arr);
      }
    },

    // ------------------------------------------------------------ statik harita katmanı
    buildMapLayer() {
      const M = SS.Map, T = M.T;
      const L = document.createElement('canvas');
      L.width = M.pxW; L.height = M.pxH;
      const g = L.getContext('2d');
      const floorAt = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H && M.floor[y * M.W + x] === 1;
      const isWall = (x, y) => {
        if (floorAt(x, y)) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floorAt(x + dx, y + dy)) return true;
        return false;
      };
      // zemin
      for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
        if (!floorAt(x, y)) continue;
        const ri = M.roomGrid[y * M.W + x];
        g.fillStyle = ri >= 0 ? M.rooms[ri].floor : SS.CORRIDOR_INFO.floor;
        g.fillRect(x * T, y * T, T, T);
        if ((x + y) % 2) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x * T, y * T, T, T); }
        g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
        g.strokeRect(x * T + 2.5, y * T + 2.5, T - 5, T - 5);
        if (ri < 0) { g.fillStyle = 'rgba(120,200,255,0.06)'; g.fillRect(x * T + 17, y * T + 17, 6, 6); }
      }
      // koridor yön çizgileri
      g.strokeStyle = 'rgba(120,190,255,0.12)'; g.lineWidth = 3; g.setLineDash([14, 14]);
      SS.CORRIDORS.forEach(c => {
        g.beginPath();
        if (c.w >= c.h) { g.moveTo(c.x * T, (c.y + c.h / 2) * T); g.lineTo((c.x + c.w) * T, (c.y + c.h / 2) * T); }
        else { g.moveTo((c.x + c.w / 2) * T, c.y * T); g.lineTo((c.x + c.w / 2) * T, (c.y + c.h) * T); }
        g.stroke();
      });
      g.setLineDash([]);
      // duvarlar
      for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
        if (!isWall(x, y)) continue;
        g.fillStyle = '#161b42';
        g.fillRect(x * T, y * T, T, T);
        if (floorAt(x, y + 1)) {
          // üst duvarın ön yüzü (derinlik hissi)
          g.fillStyle = '#28316c';
          g.fillRect(x * T, y * T + T * 0.3, T, T * 0.7);
          g.fillStyle = '#3a4795';
          g.fillRect(x * T, y * T + T * 0.3, T, 3);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x * T + T - 2, y * T + T * 0.3, 2, T * 0.7);
          const hash = (x * 73 + y * 31) % 7;
          if (hash === 0) { // ışık paneli
            g.fillStyle = '#7fe3ff'; g.fillRect(x * T + 8, y * T + 22, T - 16, 4);
            g.fillStyle = 'rgba(127,227,255,0.25)'; g.fillRect(x * T + 4, y * T + 18, T - 8, 12);
          } else if (hash === 3) { // boru
            g.fillStyle = '#4b5aa8'; g.fillRect(x * T, y * T + 30, T, 6);
            g.fillStyle = '#6c7fd6'; g.fillRect(x * T, y * T + 30, T, 2);
          }
        }
        g.strokeStyle = 'rgba(90,110,210,0.35)'; g.lineWidth = 2;
        [[0, -1, 0, 0, T, 0], [0, 1, 0, T, T, T], [-1, 0, 0, 0, 0, T], [1, 0, T, 0, T, T]].forEach(d => {
          if (!floorAt(x + d[0], y + d[1]) && !isWall(x + d[0], y + d[1])) {
            g.beginPath(); g.moveTo(x * T + d[2], y * T + d[3]); g.lineTo(x * T + d[4], y * T + d[5]); g.stroke();
          }
        });
      }
      // pencereler: oda üst duvarlarında yıldızlar görünsün diye saydam cam
      M.rooms.forEach(r => {
        for (let x = r.x + 2; x < r.x + r.w - 2; x += 5) {
          const wy = r.y - 1;
          if (!isWall(x, wy) || !isWall(x + 1, wy) || M.doorGrid[wy * M.W + x] >= 0) continue;
          if (M.furniture.some(f => f.y === r.y && x + 2 > f.x && x < f.x + f.w)) continue;
          const px = x * T + 6, py = wy * T + 8, pw = T * 2 - 12, ph = T - 16;
          g.clearRect(px, py, pw, ph);
          g.fillStyle = 'rgba(70,120,255,0.16)'; g.fillRect(px, py, pw, ph);
          g.strokeStyle = '#8fa3ff'; g.lineWidth = 3; g.strokeRect(px, py, pw, ph);
          g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(px + 6, py + ph - 4); g.lineTo(px + 16, py + 4); g.stroke();
        }
      });
      // kalın zemin kenar çizgileri
      g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
      for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
        if (!floorAt(x, y)) continue;
        if (!floorAt(x, y - 1)) { g.beginPath(); g.moveTo(x * T, y * T); g.lineTo(x * T + T, y * T); g.stroke(); }
        if (!floorAt(x, y + 1)) { g.beginPath(); g.moveTo(x * T, y * T + T); g.lineTo(x * T + T, y * T + T); g.stroke(); }
        if (!floorAt(x - 1, y)) { g.beginPath(); g.moveTo(x * T, y * T); g.lineTo(x * T, y * T + T); g.stroke(); }
        if (!floorAt(x + 1, y)) { g.beginPath(); g.moveTo(x * T + T, y * T); g.lineTo(x * T + T, y * T + T); g.stroke(); }
      }
      // kapı çerçeveleri
      M.doors.forEach(d => {
        g.fillStyle = '#4a5490'; g.strokeStyle = INK; g.lineWidth = 3;
        const posts = d.horiz
          ? [[d.px - 4, d.py + T / 2 - 8, 8, 16], [d.px + d.pw - 4, d.py + T / 2 - 8, 8, 16]]
          : [[d.px + T / 2 - 8, d.py - 4, 16, 8], [d.px + T / 2 - 8, d.py + d.ph - 4, 16, 8]];
        posts.forEach(p => { g.fillRect(p[0], p[1], p[2], p[3]); g.strokeRect(p[0], p[1], p[2], p[3]); });
      });
      // oda adları
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 34px "Trebuchet MS", system-ui, sans-serif';
      M.rooms.forEach(r => {
        g.fillStyle = 'rgba(255,255,255,0.075)';
        g.fillText(r.name.toLocaleUpperCase('tr-TR'), r.cx, r.py + r.ph - 40);
      });
      // havalandırmalar
      M.vents.forEach(v => {
        g.fillStyle = '#10142e'; g.strokeStyle = INK; g.lineWidth = 4;
        SS.Sprites.rr(g, v.x - 18, v.y - 13, 36, 26, 5); g.fill(); g.stroke();
        g.strokeStyle = '#5d6aa8'; g.lineWidth = 3;
        for (let i = -10; i <= 10; i += 6.5) { g.beginPath(); g.moveTo(v.x + i, v.y - 8); g.lineTo(v.x + i, v.y + 8); g.stroke(); }
      });
      // eşyalar
      R.blinkers = [];
      M.furniture.forEach(f => R.drawFurniture(g, f));
      R.mapLayer = L;
    },

    drawFurniture(g, f) {
      const T = SS.Map.T, x = f.x * T, y = f.y * T, w = f.w * T, h = f.h * T;
      const rr = SS.Sprites.rr;
      const box = (fill, ix, iy, iw, ih, r) => { g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 4; rr(g, ix, iy, iw, ih, r || 8); g.fill(); g.stroke(); };
      const screen = (sx, sy, sw, sh, col) => {
        g.fillStyle = '#0d1636'; g.strokeStyle = INK; g.lineWidth = 3; rr(g, sx, sy, sw, sh, 4); g.fill(); g.stroke();
        g.fillStyle = col || '#4fd8ff'; g.globalAlpha = 0.75;
        for (let i = 0; i < 3; i++) g.fillRect(sx + 5, sy + 5 + i * 5, (sw - 10) * (0.4 + ((i * 37 + sx) % 6) / 10), 2);
        g.globalAlpha = 1;
      };
      const blink = (bx, by, col) => R.blinkers.push({ x: bx, y: by, col, ph: Math.random() * 6 });
      switch (f.type) {
        case 'table': {
          const cx = x + w / 2, cy = y + h / 2;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + 4, cy + 8, 86, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3e4a95'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 84, 0, Math.PI * 2); g.fill(); g.stroke();
          g.fillStyle = '#2f3978'; g.beginPath(); g.arc(cx, cy, 64, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(140,170,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 74, 0, Math.PI * 2); g.stroke();
          break;
        }
        case 'vending': box('#5b3f9a', x + 4, y + 2, w - 8, h + 10); screen(x + 12, y + 8, w - 24, 18, '#ff8ad8'); break;
        case 'bench': box('#3c4687', x + 2, y + 8, w - 4, h - 14, 6); break;
        case 'server':
          box('#2a3166', x + 3, y + 3, w - 6, h - 6, 6);
          for (let i = 0; i < 4; i++) { g.fillStyle = '#121838'; g.fillRect(x + 10, y + 10 + i * 15, w - 20, 9); blink(x + w - 16, y + 14 + i * 15, i % 2 ? '#7dffb0' : '#4fd8ff'); }
          break;
        case 'crates':
          for (let iy = 0; iy < f.h; iy++) for (let ix = 0; ix < f.w; ix++) {
            const cx = x + ix * T + 3, cy = y + iy * T + 3;
            box(((ix + iy) % 2) ? '#8a6a3e' : '#9c7a48', cx, cy, T - 6, T - 6, 4);
            g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(cx + 5, cy + 5); g.lineTo(cx + T - 11, cy + T - 11); g.moveTo(cx + T - 11, cy + 5); g.lineTo(cx + 5, cy + T - 11); g.stroke();
          }
          break;
        case 'tanks':
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
            const cx = x + T * (i * 2 + 1), cy = y + T * (j * 2 + 1);
            g.fillStyle = '#3f8fd6'; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill(); g.stroke();
            g.fillStyle = '#8ad4ff'; g.beginPath(); g.arc(cx - 10, cy - 10, 9, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#e8f6ff'; g.font = '900 20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('O₂', cx + 4, cy + 6);
          }
          break;
        case 'plants':
          box('#5b4a3a', x + 6, y + 10, w - 12, h - 16, 8);
          g.fillStyle = '#4fe08a'; g.strokeStyle = INK; g.lineWidth = 3;
          for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x + 18 + i * 11, y + 22 + (i % 2) * 14, 9, 14, i - 2, 0, Math.PI * 2); g.fill(); g.stroke(); }
          break;
        case 'reactor': {
          const cx = x + w / 2, cy = y + h / 2;
          g.fillStyle = '#2a2058'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 96, 0, Math.PI * 2); g.fill(); g.stroke();
          g.fillStyle = '#3f2f84'; g.beginPath(); g.arc(cx, cy, 72, 0, Math.PI * 2); g.fill(); g.stroke();
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillStyle = '#5d4bb8'; g.beginPath(); g.arc(cx + Math.cos(a) * 84, cy + Math.sin(a) * 84, 7, 0, Math.PI * 2); g.fill(); g.stroke(); }
          R.reactorPos = { x: cx, y: cy };
          break;
        }
        case 'console': box('#323c7d', x + 3, y + 4, w - 6, h - 8, 8); screen(x + 14, y + 14, w - 28, h - 30); blink(x + 12, y + h - 14, '#ffd23f'); break;
        case 'generator':
          box('#3b3170', x + 3, y + 3, w - 6, h - 6, 10);
          g.fillStyle = '#ffd23f'; g.strokeStyle = INK; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x + w / 2 + 6, y + 18); g.lineTo(x + w / 2 - 12, y + h / 2 + 4); g.lineTo(x + w / 2, y + h / 2 + 4); g.lineTo(x + w / 2 - 6, y + h - 18); g.lineTo(x + w / 2 + 14, y + h / 2 - 6); g.lineTo(x + w / 2 + 2, y + h / 2 - 6); g.closePath(); g.fill(); g.stroke();
          blink(x + 14, y + 14, '#ff4f60'); blink(x + w - 14, y + 14, '#7dffb0');
          break;
        case 'bed':
          box('#cfd8ff', x + 4, y + 4, w - 8, h - 8, 10);
          box('#ffffff', x + 10, y + 8, w - 20, 22, 8);
          g.fillStyle = '#7aa7ff'; g.fillRect(x + 6, y + h / 2, w - 12, h / 2 - 8);
          break;
        case 'scanner':
          box('#2b3a78', x + 3, y + 3, w - 6, h - 6, 10);
          g.fillStyle = 'rgba(80,255,180,0.35)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 22, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#7dffb0'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h / 2, 22, 0, Math.PI * 2); g.stroke();
          break;
        case 'desk':
          box('#334184', x + 2, y + 4, w - 4, h - 8, 10);
          for (let i = 0; i < 3; i++) { screen(x + 12 + i * (w - 24) / 3, y + 12, (w - 24) / 3 - 8, 30, i === 1 ? '#7dffb0' : '#4fd8ff'); blink(x + 20 + i * (w - 24) / 3, y + h - 18, '#ffd23f'); }
          break;
        case 'wirepanel':
          box('#3a4a8a', x + 3, y + 3, w - 6, h - 6, 6);
          ['#ff4f60', '#3f8cff', '#ffd23f', '#3fd46c'].forEach((c, i) => {
            g.strokeStyle = c; g.lineWidth = 4;
            const vx = f.w >= f.h;
            g.beginPath();
            if (vx) { g.moveTo(x + 12 + i * ((w - 24) / 3), y + 10); g.lineTo(x + 12 + i * ((w - 24) / 3), y + h - 10); }
            else { g.moveTo(x + 10, y + 14 + i * ((h - 28) / 3)); g.lineTo(x + w - 10, y + 14 + i * ((h - 28) / 3)); }
            g.stroke();
          });
          break;
        case 'powerpanel':
          box('#3d3a86', x + 3, y + 4, w - 6, h - 8, 6);
          for (let i = 0; i < f.w * 2; i++) { g.fillStyle = '#141a3c'; g.fillRect(x + 10 + i * 17, y + 10, 7, h - 20); g.fillStyle = '#ffd23f'; g.fillRect(x + 8 + i * 17, y + 14 + (i * 7) % 12, 11, 5); }
          break;
        case 'memorypanel':
          box('#3a3d8f', x + 3, y + 3, w - 6, h - 6, 8);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const vx = f.w >= f.h;
            const bx = vx ? x + 14 + i * ((w - 28) / 3) : x + 10 + i * ((w - 20) / 3);
            const by = vx ? y + 8 + j * ((h - 16) / 3) * 0.9 : y + 14 + j * ((h - 28) / 3);
            blink(bx + 6, by + 5, ['#ff4f60', '#3fd46c', '#4fd8ff'][(i + j) % 3]);
          }
          break;
        case 'filterunit':
          box('#2c5a7a', x + 3, y + 3, w - 6, h - 6, 10);
          g.fillStyle = '#183447'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 10, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#7fe3ff'; g.lineWidth = 3;
          for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + Math.cos(a) * 22, y + h / 2 + Math.sin(a) * 22); g.stroke(); }
          break;
        case 'comms': {
          box('#2d3e7e', x + 3, y + 3, w - 6, h - 6, 10);
          const cx = x + w / 2, cy = y + h / 2;
          g.fillStyle = '#c9d6ff'; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, cy, 34, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke();
          g.fillStyle = '#8fa3ff'; g.beginPath(); g.ellipse(cx, cy, 20, 13, 0, 0, Math.PI * 2); g.fill();
          blink(cx, cy, '#ff4f60');
          break;
        }
        case 'cardreader':
          box('#384a92', x + 3, y + 4, w - 6, h - 8, 6);
          if (f.w >= f.h) { g.fillStyle = '#0d1636'; g.fillRect(x + 12, y + h / 2 - 3, w - 24, 6); blink(x + w - 16, y + 12, '#7dffb0'); }
          else { g.fillStyle = '#0d1636'; g.fillRect(x + w / 2 - 3, y + 12, 6, h - 24); blink(x + w / 2, y + 10, '#7dffb0'); }
          break;
        case 'lightpanel':
          box('#4a3d22', x + 3, y + 3, w - 6, h - 6, 6);
          for (let i = 0; i < 5; i++) { g.fillStyle = '#1a1a1a'; g.fillRect(x + 12, y + 14 + i * 20, w - 24, 10); g.fillStyle = '#ffd23f'; g.fillRect(x + 12, y + 14 + i * 20, 8, 10); }
          break;
        case 'o2panel':
          box('#2f6a8a', x + 3, y + 4, w - 6, h - 8, 6);
          g.fillStyle = '#e8f6ff'; g.font = '900 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('O₂', x + w / 2, y + h / 2 + 1);
          break;
        default:
          box('#3a4385', x + 3, y + 3, w - 6, h - 6, 8);
      }
    },

    // ------------------------------------------------------------ kare çizimi
    draw(now) {
      const ctx = R.ctx, G = SS.Game, m = G.match;
      const dt = R.last ? Math.min(0.1, (now - R.last) / 1000) : 0.016;
      R.last = now;
      R.t += dt;
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      ctx.fillStyle = '#060818';
      ctx.fillRect(0, 0, R.w, R.h);
      const showWorld = m && ['PLAYING', 'TASK', 'MEETING_DISCUSSION', 'MEETING_VOTE', 'MEETING_RESULT', 'PAUSED', 'GAME_OVER', 'ROLE_REVEAL'].indexOf(G.state) >= 0;
      R.drawStars(ctx, showWorld ? R.cam.x : R.t * 30, showWorld ? R.cam.y : R.t * 8);
      if (!showWorld) return;
      const p = G.player();
      R.updateCamera(p, dt);
      const s = R.scale;
      ctx.save();
      ctx.scale(s, s);
      ctx.translate(-R.cam.x, -R.cam.y);
      const vw = R.w / s, vh = R.h / s;
      const sx = Math.max(0, Math.floor(R.cam.x)), sy = Math.max(0, Math.floor(R.cam.y));
      const sw = Math.min(R.mapLayer.width - sx, Math.ceil(vw) + 2), sh = Math.min(R.mapLayer.height - sy, Math.ceil(vh) + 2);
      if (sw > 0 && sh > 0) ctx.drawImage(R.mapLayer, sx, sy, sw, sh, sx, sy, sw, sh);
      R.drawDynamic(ctx, m, vw, vh);
      R.drawEntities(ctx, m);
      R.drawEffects(ctx, m);
      ctx.restore();
      R.drawFog(ctx, m, p);
      ctx.save();
      ctx.scale(s, s);
      ctx.translate(-R.cam.x, -R.cam.y);
      R.drawHighlights(ctx, m, p);
      ctx.restore();
      R.drawIndicators(ctx, m, p);
      R.drawTracker(ctx, m, p);
      if (m.sab.active === 'oxygen' && G.worldActive()) {
        const a = 0.12 + Math.sin(R.t * 6) * 0.08;
        ctx.fillStyle = 'rgba(255,40,60,' + a + ')';
        ctx.fillRect(0, 0, R.w, R.h);
      }
      if (R.deathFx) R.drawDeath(ctx, dt);
    },

    drawStars(ctx, cx, cy) {
      R.stars.forEach((layer, li) => {
        const par = 0.08 + li * 0.12;
        layer.forEach(st => {
          const x = ((st.x - cx * par) % 1200 + 1200) % 1200;
          const y = ((st.y - cy * par) % 1200 + 1200) % 1200;
          const a = 0.45 + Math.sin(R.t * 1.5 + st.tw) * 0.3;
          ctx.fillStyle = li === 2 ? 'rgba(190,210,255,' + a + ')' : 'rgba(150,160,255,' + a * 0.8 + ')';
          for (let ox = 0; ox < R.w; ox += 1200) for (let oy = 0; oy < R.h; oy += 1200) {
            ctx.beginPath(); ctx.arc(x + ox, y + oy, st.r, 0, Math.PI * 2); ctx.fill();
          }
        });
      });
    },

    updateCamera(p, dt) {
      const M = SS.Map, s = R.scale, vw = R.w / s, vh = R.h / s;
      let tx = p.x - vw / 2, ty = p.y - vh / 2 - 10;
      tx = vw >= M.pxW ? (M.pxW - vw) / 2 : U.clamp(tx, 0, M.pxW - vw);
      ty = vh >= M.pxH ? (M.pxH - vh) / 2 : U.clamp(ty, 0, M.pxH - vh);
      if (R.camSnap) { R.cam.x = tx; R.cam.y = ty; R.camSnap = false; }
      else {
        const k = Math.min(1, dt * 9);
        R.cam.x += (tx - R.cam.x) * k;
        R.cam.y += (ty - R.cam.y) * k;
      }
    },

    inView(x, y, pad) {
      const s = R.scale;
      return x > R.cam.x - pad && y > R.cam.y - pad && x < R.cam.x + R.w / s + pad && y < R.cam.y + R.h / s + pad;
    },

    drawDynamic(ctx, m) {
      const M = SS.Map, T = M.T, t = R.t;
      // yanıp sönen ışıklar
      R.blinkers.forEach(b => {
        if (!R.inView(b.x, b.y, 20)) return;
        const on = Math.sin(t * 3 + b.ph) > -0.2;
        ctx.fillStyle = on ? b.col : '#1a1f3d';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
      });
      // reaktör çekirdeği
      if (R.reactorPos && R.inView(R.reactorPos.x, R.reactorPos.y, 120)) {
        const rp = R.reactorPos, pulse = 0.6 + Math.sin(t * 2.5) * 0.25;
        const gr = ctx.createRadialGradient(rp.x, rp.y, 4, rp.x, rp.y, 60);
        gr.addColorStop(0, 'rgba(180,255,255,' + pulse + ')');
        gr.addColorStop(0.5, 'rgba(90,160,255,' + pulse * 0.6 + ')');
        gr.addColorStop(1, 'rgba(90,60,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(rp.x, rp.y, 60, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#bff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, 30 + Math.sin(t * 2.5) * 4, t, t + 4); ctx.stroke();
      }
      // acil durum butonu
      const b = M.button;
      if (R.inView(b.x, b.y, 100)) {
        ctx.fillStyle = '#20264d'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(b.x, b.y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const used = m.chars[0].emergencyUsed;
        ctx.fillStyle = used ? '#7a4b55' : '#ff3d55';
        ctx.beginPath(); ctx.arc(b.x, b.y - 3, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(b.x - 5, b.y - 9, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd6dc'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('ACİL', b.x, b.y + 40);
      }
      // kapılar
      M.doors.forEach(d => {
        d.anim = U.clamp(d.anim + (d.closed ? 0.12 : -0.12), 0, 1);
        if (d.anim <= 0 || !R.inView(d.px, d.py, 80)) return;
        const k = d.anim;
        ctx.fillStyle = '#5b6390'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
        if (d.horiz) {
          const half = d.pw / 2 * k;
          [[d.px, half], [d.px + d.pw - half, half]].forEach(([x0, wv]) => { ctx.fillRect(x0, d.py + 10, wv, T - 20); ctx.strokeRect(x0, d.py + 10, wv, T - 20); });
          ctx.fillStyle = '#ffd23f';
          for (let x = d.px + 6; x < d.px + half - 4; x += 16) ctx.fillRect(x, d.py + 16, 7, T - 32);
          for (let x = d.px + d.pw - half + 6; x < d.px + d.pw - 4; x += 16) ctx.fillRect(x, d.py + 16, 7, T - 32);
        } else {
          const half = d.ph / 2 * k;
          [[d.py, half], [d.py + d.ph - half, half]].forEach(([y0, hv]) => { ctx.fillRect(d.px + 10, y0, T - 20, hv); ctx.strokeRect(d.px + 10, y0, T - 20, hv); });
          ctx.fillStyle = '#ffd23f';
          for (let y = d.py + 6; y < d.py + half - 4; y += 16) ctx.fillRect(d.px + 16, y, T - 32, 7);
          for (let y = d.py + d.ph - half + 6; y < d.py + d.ph - 4; y += 16) ctx.fillRect(d.px + 16, y, T - 32, 7);
        }
      });
      // sabotaj panelleri
      ['lights', 'o2a', 'o2b'].forEach(k => {
        if (!SS.Sabotage.needs(m, k)) return;
        const pn = M.panels[k], f = pn.f;
        const a = 0.5 + Math.sin(t * 8) * 0.4;
        ctx.strokeStyle = 'rgba(255,60,80,' + a + ')'; ctx.lineWidth = 6;
        SS.Sprites.rr(ctx, f.x * T - 4, f.y * T - 4, f.w * T + 8, f.h * T + 8, 10); ctx.stroke();
      });
    },

    drawEntities(ctx, m) {
      const G = SS.Game, p = G.player(), t = R.t;
      for (const b of m.bodies) {
        if (!R.inView(b.x, b.y, 60)) continue;
        if (!G.canSee(p, b.x, b.y)) continue;
        SS.Sprites.body(ctx, b.x, b.y, m.chars[b.victimId].def, b.facing, t);
      }
      const list = m.chars.filter(c => {
        if (!R.inView(c.x, c.y, 80)) return false;
        if (c === p) return c.inVent === null;
        return G.playerSeesChar(c);
      }).sort((a, z) => a.y - z.y);
      ctx.textAlign = 'center';
      for (const c of list) {
        const ghost = !c.alive;
        // Fantom: animasyonda saydamlaşır; görünmezken yalnızca görebilenlere soluk çizilir.
        let alpha = c.sub === 'phantom' ? G.phantomAlpha(c) : 1;
        if (c.sub === 'phantom' && G.isHidden(c)) alpha = 0.32 + Math.sin(t * 6 + c.id) * 0.06;
        ctx.save();
        ctx.globalAlpha = alpha;
        const look = G.lookOf(c); // şekil değiştirici: başkasının görünümü ve adı
        SS.Sprites.robot(ctx, c.x, c.y, { def: look.def, facing: c.facing, phase: c.phase, moving: c.moving, t: t + c.id, ghost, busy: c.busyT > 0, wings: ghost && c.angel });
        if (c.shieldT > 0 && !p.alive) { // kalkanı yalnızca melek ve hayaletler görür
          ctx.strokeStyle = 'rgba(255,226,90,' + (0.55 + Math.sin(t * 5) * 0.25) + ')'; ctx.lineWidth = 3;
          ctx.fillStyle = 'rgba(255,226,90,0.08)';
          ctx.beginPath(); ctx.arc(c.x, c.y - 20, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        const mate = p.role === 'impostor' && c.role === 'impostor' && c !== p;
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,6,20,0.85)';
        const ny = c.y - (ghost ? 66 : 58);
        ctx.strokeText(look.name, c.x, ny);
        ctx.fillStyle = mate ? '#ff6b7a' : (c === p ? '#ffffff' : '#dfe6ff');
        ctx.fillText(look.name, c.x, ny);
        if (ghost && c.influencer) { ctx.font = '16px system-ui'; ctx.fillText('📱', c.x + 26, ny + 2); } // influencer hayaleti
        if (mate) { ctx.font = '800 10px system-ui'; const tag = c.sub === 'phantom' ? 'HAİN · FANTOM' : c.sub === 'shapeshifter' ? (look !== c ? 'HAİN · asıl ' + c.name : 'HAİN · ŞEKİL DEĞ.') : 'HAİN'; ctx.strokeText(tag, c.x, ny - 13); ctx.fillText(tag, c.x, ny - 13); }
        ctx.restore();
      }
    },

    drawEffects(ctx, m) {
      const G = SS.Game, p = G.player();
      m.effects.forEach(e => {
        if (!G.canSee(p, e.x, e.y)) return;
        const k = e.t / e.dur;
        if (e.type === 'bonk') {
          ctx.save();
          ctx.translate(e.x, e.y - 20);
          const sc = 0.6 + Math.sin(Math.min(1, k * 2) * Math.PI / 2) * 0.7;
          ctx.scale(sc, sc);
          ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
          ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
          ctx.beginPath();
          for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 18 : 40; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff4f60'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('BONK!', 0, 1);
          ctx.restore();
        } else if (e.type === 'shield') {
          // engellenen saldırı: altın kalkan parlaması
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 6;
          ctx.fillStyle = 'rgba(255,226,90,0.25)';
          ctx.beginPath(); ctx.arc(e.x, e.y, 26 + k * 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.restore();
        } else if (e.type === 'shimmer') {
          // kaybolma/belirme pırıltısı
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = e.color; ctx.lineWidth = 3;
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + k * 2, r1 = 14 + k * 26, r2 = r1 + 8;
            ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1); ctx.lineTo(e.x + Math.cos(a) * r2, e.y + Math.sin(a) * r2); ctx.stroke();
          }
          ctx.restore();
        } else if (e.type === 'puff') {
          ctx.fillStyle = 'rgba(190,200,240,' + (0.6 * (1 - k)) + ')';
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * k * 30, e.y + Math.sin(a) * k * 20, 8 + k * 8, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    },

    drawFog(ctx, m, p) {
      if (!p.alive) {
        ctx.fillStyle = 'rgba(40,60,140,0.12)';
        ctx.fillRect(0, 0, R.w, R.h);
        return;
      }
      const f = R.fogCtx, fw = R.fog.width, fh = R.fog.height;
      const rad = SS.Game.visionRadius(p);
      const k = (fw / R.w) * R.scale;
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, fw, fh);
      f.fillStyle = 'rgba(3,4,16,0.9)';
      f.fillRect(0, 0, fw, fh);
      f.globalCompositeOperation = 'destination-out';
      f.setTransform(k, 0, 0, k, -R.cam.x * k, -R.cam.y * k);
      const pts = SS.Vision.polygon(p.x, p.y - 8, rad, 200);
      const gr = f.createRadialGradient(p.x, p.y, rad * 0.55, p.x, p.y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = gr;
      f.beginPath();
      f.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) f.lineTo(pts[i], pts[i + 1]);
      f.closePath();
      f.fill();
      f.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(R.fog, 0, 0, R.w, R.h);
    },

    drawHighlights(ctx, m, p) {
      const G = SS.Game, M = SS.Map, T = M.T, t = R.t, ctxP = G.ctx;
      const target = ctxP && ctxP.use;
      const outline = (f, strong) => {
        const a = strong ? 0.75 + Math.sin(t * 7) * 0.25 : 0.35 + Math.sin(t * 3) * 0.12;
        ctx.strokeStyle = 'rgba(255,226,90,' + a + ')';
        ctx.lineWidth = strong ? 5 : 3;
        SS.Sprites.rr(ctx, f.x * T - 3, f.y * T - 3, f.w * T + 6, f.h * T + 6, 9);
        ctx.stroke();
      };
      if (p.role === 'crew' || (p.role === 'impostor' && p.alive)) {
        p.tasks.forEach(tk => {
          if (tk.done) return;
          const st = M.stations[tk.station];
          if (!R.inView(st.x, st.y, 100)) return;
          const strong = target && (target.kind === 'task' || target.kind === 'fake') && target.station === st;
          outline(st.f, strong);
        });
      }
      if (target && target.kind === 'fix') outline(target.panel.f, true);
      if (target && target.kind === 'button') {
        ctx.strokeStyle = 'rgba(255,226,90,' + (0.7 + Math.sin(t * 7) * 0.3) + ')'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(M.button.x, M.button.y, 32, 0, Math.PI * 2); ctx.stroke();
      }
      if (G.canVent(p)) {
        const rgb = p.role === 'impostor' ? '255,90,110' : '95,216,255';
        M.vents.forEach(v => {
          if (!R.inView(v.x, v.y, 60)) return;
          const strong = (target && target.kind === 'vent' && target.vent === v) || p.inVent === v.id;
          ctx.strokeStyle = strong ? 'rgba(' + rgb + ',' + (0.7 + Math.sin(t * 7) * 0.3) + ')' : 'rgba(' + rgb + ',0.3)';
          ctx.lineWidth = strong ? 4 : 2;
          SS.Sprites.rr(ctx, v.x - 22, v.y - 17, 44, 34, 7); ctx.stroke();
        });
        if (p.inVent !== null) {
          const cur = M.vents[p.inVent];
          cur.links.forEach(id => {
            const to = M.vents[id];
            const a = Math.atan2(to.y - cur.y, to.x - cur.x);
            const d = 62 + Math.sin(t * 5) * 4;
            ctx.save();
            ctx.translate(cur.x + Math.cos(a) * d, cur.y + Math.sin(a) * d);
            ctx.rotate(a);
            ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -13); ctx.lineTo(-8, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
          });
        }
      }
      if (target && target.kind === 'task' && G.state === 'PLAYING') {
        const st = target.station;
        ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        const by = st.f.y * T - 14 + Math.sin(t * 5) * 3;
        ctx.beginPath(); ctx.moveTo(st.x - 8, by - 10); ctx.lineTo(st.x + 8, by - 10); ctx.lineTo(st.x, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    },

    // Ekran dışındaki sabotaj panellerine ok
    // İz sürücü: izlenen kişinin gecikmeli konumu (ekran dışındaysa kenarda renkli ok, içindeyse halka).
    drawTracker(ctx, m, p) {
      if (!p.track || !SS.Game.worldActive()) return;
      const tr = p.track, tc = m.chars[tr.id], s = R.scale;
      const sx = (tr.x - R.cam.x) * s, sy = (tr.y - R.cam.y) * s;
      const col = tr.lost ? '#8a90b8' : tc.def.color;
      if (sx > 30 && sy > 30 && sx < R.w - 30 && sy < R.h - 30) {
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(sx, sy - 20 * s, 26 * s + Math.sin(R.t * 5) * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const cx = R.w / 2, cy = R.h / 2, a = Math.atan2(sy - cy, sx - cx);
      const mx = R.w / 2 - 60, my = R.h / 2 - 110;
      const f = Math.min(Math.abs(mx / Math.cos(a)), Math.abs(my / Math.sin(a)));
      const x = cx + Math.cos(a) * f, y = cy + Math.sin(a) * f;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = col; ctx.strokeStyle = '#080a1c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(15, -9); ctx.lineTo(15, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(5,6,20,.9)'; ctx.lineWidth = 3;
      ctx.strokeText(tc.name, x, y + 30); ctx.fillText(tc.name, x, y + 30);
    },

    drawIndicators(ctx, m, p) {
      if (!SS.Game.worldActive() || !p.alive) return;
      const M = SS.Map, s = R.scale;
      ['lights', 'o2a', 'o2b'].forEach(k => {
        if (!SS.Sabotage.needs(m, k)) return;
        const pn = M.panels[k];
        const sx = (pn.x - R.cam.x) * s, sy = (pn.y - R.cam.y) * s;
        if (sx > 20 && sy > 20 && sx < R.w - 20 && sy < R.h - 20) return;
        const cx = R.w / 2, cy = R.h / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const mx = R.w / 2 - 46, my = R.h / 2 - 90;
        const f = Math.min(Math.abs(mx / Math.cos(a)), Math.abs(my / Math.sin(a)));
        const x = cx + Math.cos(a) * f, y = cy + Math.sin(a) * f;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = '#ff3d55'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -15); ctx.lineTo(-4, 0); ctx.lineTo(-10, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
    },

    drawDeath(ctx, dt) {
      const fx = R.deathFx;
      fx.t += dt;
      const D = 2.4;
      if (fx.t > D) { R.deathFx = null; return; }
      const a = Math.min(1, fx.t * 4) * (fx.t > D - 0.4 ? (D - fx.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,6,30,0.82)';
      ctx.fillRect(0, R.h / 2 - 110, R.w, 220);
      const cx = R.w / 2, cy = R.h / 2 + 50;
      const k = Math.min(1, fx.t / 0.5);
      SS.Sprites.robot(ctx, cx - 70 + k * 30, cy, { def: fx.killer.def, facing: 1, t: R.t, scale: 1.6, moving: fx.t < 0.5, phase: fx.t * 20 });
      if (fx.t < 0.55) SS.Sprites.robot(ctx, cx + 60, cy, { def: fx.victim.def, facing: -1, t: R.t, scale: 1.6 });
      else SS.Sprites.body(ctx, cx + 70, cy - 10, fx.victim.def, 1, R.t);
      if (fx.t > 0.45 && fx.t < 1.2) {
        ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2, r = i % 2 ? 20 : 44; ctx.lineTo(cx + 30 + Math.cos(an) * r, cy - 60 + Math.sin(an) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff4f60'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BONK!', cx + 30, cy - 54);
      }
      ctx.fillStyle = '#fff'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Devre dışı kaldın!', cx, R.h / 2 - 72);
      ctx.restore();
    },
  });
})();
