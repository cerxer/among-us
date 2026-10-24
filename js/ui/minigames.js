// Görev mini oyunları: kablo, enerji, kart, filtre, hafıza + sabotaj onarımı (şalter, tuş takımı).
// Fare ve dokunmatik giriş Pointer Events ile ortak çalışır.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;
  const W = 520, H = 400, INK = '#080a1c';
  const rr = (c, x, y, w, h, r) => SS.Sprites.rr(c, x, y, w, h, r);

  function panel(c, title) {
    c.fillStyle = '#1a2050'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,150,255,0.15)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    if (title) {
      c.fillStyle = '#c8d4ff'; c.font = '700 15px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(title, W / 2, 24);
    }
  }
  function button(c, x, y, w, h, label, col) {
    c.fillStyle = col || '#3fd46c'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, x, y, w, h, 12); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = '900 20px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x + w / 2, y + h / 2 + 1);
  }
  function inRect(x, y, r) { return x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3]; }
  function symbol(c, kind, x, y, s, fill) {
    c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath();
    if (kind === 'circle') c.arc(x, y, s, 0, Math.PI * 2);
    else if (kind === 'square') c.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
    else if (kind === 'triangle') { c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.lineTo(x - s, y + s * 0.8); c.closePath(); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
    c.fill(); c.stroke();
  }

  // ------------------------------------------------------------ Kablo eşleştirme
  function Wires(api) {
    const syms = ['circle', 'triangle', 'square', 'star'];
    const cols = ['#ff4f60', '#3f8cff', '#ffd23f', '#3fd46c'];
    const left = U.shuffle([0, 1, 2, 3]), right = U.shuffle([0, 1, 2, 3]);
    const LX = 74, RX = 446, ly = i => 92 + i * 80;
    const conn = {};
    let drag = null, wrong = null;
    api.hint('Soldaki kabloyu aynı renk ve sembollü sağ uca sürükle.');
    return {
      dbg: () => ({ left, right, LX, RX, ys: [0, 1, 2, 3].map(ly) }),
      down(x, y) {
        for (let i = 0; i < 4; i++) if (!conn[left[i]] && U.dist(x, y, LX, ly(i)) < 38) { drag = { k: left[i], i, x, y }; return; }
      },
      move(x, y) { if (drag) { drag.x = x; drag.y = y; } },
      up(x, y) {
        if (!drag) return;
        let hit = -1;
        for (let j = 0; j < 4; j++) if (U.dist(x, y, RX, ly(j)) < 44) hit = j;
        if (hit >= 0) {
          if (right[hit] === drag.k) {
            conn[drag.k] = true; api.sfx('ok');
            if (Object.keys(conn).length === 4) api.success();
            else api.hint('Doğru! ' + (4 - Object.keys(conn).length) + ' kablo kaldı.');
          } else { wrong = { j: hit, t: 0.5 }; api.hint('Yanlış eşleşme! Renge ve sembole dikkat et.', true); api.sfx('bad'); }
        }
        drag = null;
      },
      update(dt) { if (wrong) { wrong.t -= dt; if (wrong.t <= 0) wrong = null; } },
      draw(c) {
        panel(c, 'Kabloları eşle');
        const wire = (x1, y1, x2, y2, col) => {
          c.lineCap = 'round';
          c.strokeStyle = INK; c.lineWidth = 16;
          c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(x1 + 120, y1, x2 - 120, y2, x2, y2); c.stroke();
          c.strokeStyle = col; c.lineWidth = 10; c.stroke();
        };
        for (let i = 0; i < 4; i++) {
          const k = left[i];
          if (conn[k]) wire(LX, ly(i), RX, ly(right.indexOf(k)), cols[k]);
        }
        if (drag) wire(LX, ly(drag.i), drag.x, drag.y, cols[drag.k]);
        for (let i = 0; i < 4; i++) {
          const k = left[i];
          c.fillStyle = '#2a3168'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, LX - 56, ly(i) - 26, 52, 52, 10); c.fill(); c.stroke();
          symbol(c, syms[k], LX - 30, ly(i), 13, cols[k]);
          c.fillStyle = cols[k]; c.beginPath(); c.arc(LX, ly(i), 14, 0, Math.PI * 2); c.fill(); c.stroke();
          const kr = right[i];
          const bad = wrong && wrong.j === i;
          c.fillStyle = bad ? '#ff4f60' : '#2a3168'; rr(c, RX + 4, ly(i) - 26, 52, 52, 10); c.fill(); c.stroke();
          symbol(c, syms[kr], RX + 30, ly(i), 13, cols[kr]);
          c.fillStyle = conn[kr] ? cols[kr] : '#11163a'; c.beginPath(); c.arc(RX, ly(i), 14, 0, Math.PI * 2); c.fill(); c.stroke();
        }
      },
    };
  }

  // ------------------------------------------------------------ Enerji dağıtımı
  function Power(api) {
    const xs = [140, 260, 380], y0 = 64, y1 = 292;
    const sl = xs.map(x => {
      const center = U.range(0.25, 0.82);
      let v; do { v = U.range(0.02, 0.98); } while (Math.abs(v - center) < 0.22);
      return { x, center, half: 0.085, v, bad: 0 };
    });
    const btn = [180, 320, 160, 54];
    let drag = -1;
    api.hint('Sürgüleri yeşil aralıklara getir ve ONAYLA\'ya bas.');
    const setV = (i, y) => { sl[i].v = U.clamp((y1 - y) / (y1 - y0), 0, 1); };
    return {
      dbg: () => ({ sl, y0, y1, btn }),
      down(x, y) {
        if (inRect(x, y, btn)) {
          const badIdx = sl.map((s, i) => (Math.abs(s.v - s.center) <= s.half ? -1 : i)).filter(i => i >= 0);
          if (!badIdx.length) api.success();
          else { badIdx.forEach(i => { sl[i].bad = 0.8; }); api.hint(badIdx.map(i => (i + 1) + '.').join(', ') + ' sürgü aralık dışında.', true); api.sfx('bad'); }
          return;
        }
        for (let i = 0; i < 3; i++) if (Math.abs(x - sl[i].x) < 40 && y > y0 - 24 && y < y1 + 24) { drag = i; setV(i, y); return; }
      },
      move(x, y) { if (drag >= 0) setV(drag, y); },
      up() { drag = -1; },
      update(dt) { sl.forEach(s => { if (s.bad > 0) s.bad -= dt; }); },
      draw(c) {
        panel(c, 'Enerjiyi dağıt');
        sl.forEach((s, i) => {
          const ok = Math.abs(s.v - s.center) <= s.half;
          c.fillStyle = '#0e1335'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, s.x - 16, y0 - 10, 32, y1 - y0 + 20, 10); c.fill(); c.stroke();
          const bt = y1 - (s.center + s.half) * (y1 - y0), bb = y1 - (s.center - s.half) * (y1 - y0);
          c.fillStyle = 'rgba(63,212,108,0.55)'; c.fillRect(s.x - 13, bt, 26, bb - bt);
          c.strokeStyle = '#7dffb0'; c.lineWidth = 2; c.strokeRect(s.x - 13, bt, 26, bb - bt);
          const hy = y1 - s.v * (y1 - y0);
          c.fillStyle = s.bad > 0 ? '#ff4f60' : ok ? '#3fd46c' : '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 4;
          rr(c, s.x - 32, hy - 14, 64, 28, 8); c.fill(); c.stroke();
          c.fillStyle = INK; c.font = '800 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(Math.round(s.v * 100) + '%', s.x, hy + 1);
          c.fillStyle = '#c8d4ff'; c.font = '800 14px system-ui'; c.fillText((i + 1) + '. hat', s.x, y1 + 24);
        });
        button(c, btn[0], btn[1], btn[2], btn[3], 'ONAYLA');
      },
    };
  }

  // ------------------------------------------------------------ Kart tarama
  function Card(api) {
    const MIN = 0.55, MAX = 1.5;
    const startX = 40, endX = 360, cw = 120, chH = 76, slotY = 150;
    let phase = 'wallet', cardX = startX, cardY = 290, anim = 0, drag = null, clock = 0, last = null, flash = null;
    api.hint('Cüzdandaki karta dokun, okuyucuya yerleşsin.');
    const reset = () => { cardX = startX; drag = null; };
    return {
      dbg: () => ({ phase, cardX, slotY, cw, endX }),
      down(x, y) {
        if (phase === 'wallet') { if (x > 160 && x < 360 && y > 260) { phase = 'lift'; anim = 0; api.sfx('ok'); } return; }
        if (phase === 'ready' && x >= cardX - 10 && x <= cardX + cw + 10 && y >= slotY - 10 && y <= slotY + chH + 10) {
          drag = { off: x - cardX, t0: clock };
        }
      },
      move(x) {
        if (!drag) return;
        cardX = U.clamp(x - drag.off, startX, endX);
        if (cardX >= endX - 2) {
          const d = clock - drag.t0;
          last = d; drag = null;
          if (d < MIN) { api.hint('Çok hızlı! Daha yavaş kaydır. (' + d.toFixed(2) + ' sn)', true); flash = { ok: false, t: 0.6 }; api.sfx('bad'); reset(); }
          else if (d > MAX) { api.hint('Çok yavaş! Biraz daha hızlı kaydır. (' + d.toFixed(2) + ' sn)', true); flash = { ok: false, t: 0.6 }; api.sfx('bad'); reset(); }
          else { flash = { ok: true, t: 1 }; api.success(); }
        }
      },
      up() {
        if (drag) { api.hint('Kartı okuyucunun sonuna kadar kaydır.', true); api.sfx('bad'); reset(); }
      },
      update(dt) {
        clock += dt;
        if (flash) { flash.t -= dt; if (flash.t <= 0 && !flash.ok) flash = null; }
        if (phase === 'lift') {
          anim += dt / 0.4;
          cardY = U.lerp(290, slotY, Math.min(1, anim));
          if (anim >= 1) { phase = 'ready'; api.hint('Kartı sağa doğru düzgün bir hızla kaydır. İdeal süre: ' + MIN + '–' + MAX + ' sn'); }
        }
      },
      draw(c) {
        panel(c, 'Kartı okut');
        c.fillStyle = '#0e1335'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, 24, slotY - 22, 472, chH + 44, 14); c.fill(); c.stroke();
        c.fillStyle = '#05081c'; c.fillRect(34, slotY + chH / 2 - 4, 452, 8);
        const led = flash ? (flash.ok ? '#3fd46c' : '#ff4f60') : (drag ? '#ffd23f' : '#3a4380');
        c.fillStyle = led; c.beginPath(); c.arc(470, slotY - 6, 8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#c8d4ff'; c.font = '800 13px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(flash && flash.ok ? 'KABUL EDİLDİ' : (last !== null ? 'Son geçiş: ' + last.toFixed(2) + ' sn' : 'OKUYUCU HAZIR'), 40, slotY - 6);
        if (phase === 'wallet' || phase === 'lift') {
          c.fillStyle = '#6b4a2b'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, 150, 270, 220, 120, 16); c.fill(); c.stroke();
        }
        const cy = phase === 'ready' ? slotY : cardY, cx = phase === 'ready' ? cardX : 200;
        c.fillStyle = '#e8eefc'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, cx, cy, cw, chH, 10); c.fill(); c.stroke();
        c.fillStyle = '#3f8cff'; c.fillRect(cx + 4, cy + 10, cw - 8, 12);
        SS.Sprites.robot(c, cx + 28, cy + 70, { def: SS.Game.player().def, facing: 1, t: 0, scale: 0.75 });
        c.fillStyle = '#2a3168'; c.fillRect(cx + 54, cy + 34, 54, 6); c.fillRect(cx + 54, cy + 48, 40, 6);
        if (phase === 'wallet') { c.fillStyle = '#c8d4ff'; c.font = '800 15px system-ui'; c.textAlign = 'center'; c.fillText('Karta dokun', 260, 250); }
      },
    };
  }

  // ------------------------------------------------------------ Filtre temizleme
  function Filter(api) {
    const cx = 260, cy = 212, R = 156;
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const a = U.range(0, Math.PI * 2), d = U.range(20, R - 30);
      parts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: U.range(14, 20), vx: U.range(-20, 20), vy: U.range(-20, 20), rot: U.range(0, 6), kind: i % 3, puff: 0 });
    }
    let down = false;
    api.hint('Paneldeki parçacıklara dokun ya da üzerlerinden sürükleyerek temizle.');
    const zap = (x, y) => {
      let hit = false;
      parts.forEach(p => { if (!p.puff && U.dist(x, y, p.x, p.y) < p.r + 10) { p.puff = 0.001; hit = true; } });
      if (hit) {
        api.sfx('ok');
        const left = parts.filter(p => !p.puff).length;
        if (left === 0) api.success(); else api.hint('Kalan parçacık: ' + left);
      }
    };
    return {
      dbg: () => ({ parts: parts.filter(p => !p.puff).map(p => [p.x, p.y]) }),
      down(x, y) { down = true; zap(x, y); },
      move(x, y) { if (down) zap(x, y); },
      up() { down = false; },
      update(dt) {
        parts.forEach(p => {
          if (p.puff) { p.puff += dt; return; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt;
          const d = U.dist(p.x, p.y, cx, cy);
          if (d > R - p.r - 6) { const nx = (p.x - cx) / d, ny = (p.y - cy) / d; p.vx -= nx * 40; p.vy -= ny * 40; }
        });
      },
      draw(c) {
        panel(c, 'Filtreyi temizle');
        c.fillStyle = '#0e2a3d'; c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(127,227,255,0.18)'; c.lineWidth = 2;
        for (let i = 1; i < 4; i++) { c.beginPath(); c.arc(cx, cy, R * i / 4, 0, Math.PI * 2); c.stroke(); }
        parts.forEach(p => {
          if (p.puff) {
            if (p.puff > 0.35) return;
            c.fillStyle = 'rgba(200,240,255,' + (1 - p.puff / 0.35) + ')';
            c.beginPath(); c.arc(p.x, p.y, p.r + p.puff * 60, 0, Math.PI * 2); c.fill();
            return;
          }
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillStyle = ['#8bbd4a', '#a07a4a', '#b9a0d8'][p.kind]; c.strokeStyle = INK; c.lineWidth = 3;
          c.beginPath();
          if (p.kind === 0) c.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
          else if (p.kind === 1) { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = p.r * (i % 2 ? 0.7 : 1); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
          else c.arc(0, 0, p.r * 0.8, 0, Math.PI * 2);
          c.fill(); c.stroke();
          c.restore();
        });
      },
    };
  }

  // ------------------------------------------------------------ Hafıza paneli
  function Memory(api) {
    const N = 5, cell = 82, gap = 14, ox = (W - (cell * 3 + gap * 2)) / 2, oy = 64;
    const seq = [];
    while (seq.length < N) { const k = U.int(0, 8); if (k !== seq[seq.length - 1]) seq.push(k); }
    let phase = 'pre', timer = 0.8, idx = 0, lit = -1, input = 0, flash = null;
    api.hint('Işık dizisini izle, sonra aynı sırayla dokun.');
    const cellAt = (x, y) => {
      for (let i = 0; i < 9; i++) {
        const cx = ox + (i % 3) * (cell + gap), cy = oy + Math.floor(i / 3) * (cell + gap);
        if (x >= cx && y >= cy && x <= cx + cell && y <= cy + cell) return i;
      }
      return -1;
    };
    return {
      dbg: () => ({ seq, phase, cells: seq.map(k => [ox + (k % 3) * (cell + gap) + cell / 2, oy + Math.floor(k / 3) * (cell + gap) + cell / 2]) }),
      down(x, y) {
        if (phase !== 'input') return;
        const k = cellAt(x, y);
        if (k < 0) return;
        if (k === seq[input]) {
          input++; flash = { k, ok: true, t: 0.25 }; api.sfx('ok');
          if (input >= N) { phase = 'done'; api.success(); }
        } else {
          flash = { k: -1, ok: false, t: 0.6 }; api.sfx('bad');
          api.hint('Yanlış! Diziyi tekrar izle.', true);
          phase = 'pre'; timer = 1.0; input = 0;
        }
      },
      move() {}, up() {},
      update(dt) {
        if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
        if (phase === 'pre') { timer -= dt; if (timer <= 0) { phase = 'show'; idx = 0; timer = 0.5; lit = seq[0]; } }
        else if (phase === 'show') {
          timer -= dt;
          if (timer <= 0) {
            if (lit >= 0) { lit = -1; timer = 0.18; idx++; }
            else if (idx < N) { lit = seq[idx]; timer = 0.5; }
            if (idx >= N && lit < 0) { phase = 'input'; api.hint('Şimdi sıra sende: ' + N + ' ışığı aynı sırayla tekrarla.'); }
          }
        }
      },
      draw(c) {
        panel(c, phase === 'input' ? 'Tekrarla' : 'İzle');
        for (let i = 0; i < 9; i++) {
          const x = ox + (i % 3) * (cell + gap), y = oy + Math.floor(i / 3) * (cell + gap);
          let col = '#232a62';
          if (lit === i) col = '#4fd8ff';
          if (flash && flash.ok && flash.k === i) col = '#3fd46c';
          if (flash && !flash.ok) col = '#a8303d';
          c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 4; rr(c, x, y, cell, cell, 14); c.fill(); c.stroke();
          if (lit === i) { c.fillStyle = 'rgba(255,255,255,0.35)'; rr(c, x + 8, y + 8, cell - 16, 18, 8); c.fill(); }
        }
        for (let i = 0; i < N; i++) {
          c.fillStyle = i < input ? '#3fd46c' : '#3a4380'; c.strokeStyle = INK; c.lineWidth = 3;
          c.beginPath(); c.arc(W / 2 - (N - 1) * 14 + i * 28, H - 26, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        }
      },
    };
  }

  // ------------------------------------------------------------ Elektrik onarımı (şalterler)
  function Lights(api) {
    const n = 5, st = [];
    for (let i = 0; i < n; i++) st.push(U.chance(0.5));
    let offs = st.filter(v => !v).length;
    while (offs < 2) { st[U.int(0, n - 1)] = false; offs = st.filter(v => !v).length; }
    const sx = i => 70 + i * 95;
    api.hint('Bütün şalterleri AÇIK konuma getir.');
    return {
      dbg: () => ({ st, xs: st.map((v, i) => sx(i)) }),
      down(x, y) {
        for (let i = 0; i < n; i++) if (Math.abs(x - sx(i)) < 40 && y > 90 && y < 320) {
          st[i] = !st[i]; api.sfx('ok');
          if (st.every(v => v)) api.success();
        }
      },
      move() {}, up() {}, update() {},
      draw(c) {
        panel(c, 'Elektrik paneli');
        for (let i = 0; i < n; i++) {
          const x = sx(i);
          c.fillStyle = '#0e1335'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, x - 34, 96, 68, 210, 12); c.fill(); c.stroke();
          const on = st[i];
          c.fillStyle = on ? '#3fd46c' : '#ff4f60'; rr(c, x - 24, on ? 108 : 210, 48, 86, 10); c.fill(); c.stroke();
          c.fillStyle = '#c8d4ff'; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(on ? 'AÇIK' : 'KAPALI', x, 330);
          c.fillStyle = on ? '#ffe36b' : '#2a2f55'; c.beginPath(); c.arc(x, 76, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        }
      },
    };
  }

  // ------------------------------------------------------------ Oksijen onarımı (tuş takımı)
  function Keypad(api) {
    const code = String(U.int(1000, 9999));
    let entry = '', bad = 0;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    const kx = i => 238 + (i % 3) * 82, ky = i => 60 + Math.floor(i / 3) * 76;
    api.hint('Nottaki kodu tuşla ve OK\'ye bas.');
    return {
      dbg: () => ({ code, keys: keys.map((k, i) => [k, kx(i) + 36, ky(i) + 33]) }),
      down(x, y) {
        for (let i = 0; i < keys.length; i++) {
          if (!inRect(x, y, [kx(i), ky(i), 72, 66])) continue;
          const k = keys[i];
          api.sfx('ok');
          if (k === 'C') entry = '';
          else if (k === 'OK') {
            if (entry === code) api.success();
            else { bad = 0.6; entry = ''; api.hint('Hatalı kod! Tekrar dene.', true); api.sfx('bad'); }
          } else if (entry.length < 4) entry += k;
          return;
        }
      },
      move() {}, up() {},
      update(dt) { if (bad > 0) bad -= dt; },
      draw(c) {
        panel(c, 'Oksijen paneli');
        c.save(); c.translate(110, 150); c.rotate(-0.06);
        c.fillStyle = '#ffe98a'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, -80, -60, 160, 120, 6); c.fill(); c.stroke();
        c.fillStyle = '#5a4300'; c.font = '700 14px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('BUGÜNÜN KODU', 0, -30);
        c.font = '900 36px ui-monospace, monospace'; c.fillText(code, 0, 12);
        c.restore();
        c.fillStyle = bad > 0 ? '#a8303d' : '#0e1335'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, 40, 260, 150, 58, 10); c.fill(); c.stroke();
        c.fillStyle = '#7dffb0'; c.font = '900 32px ui-monospace, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText((entry + '____').slice(0, 4).split('').join(' '), 115, 290);
        keys.forEach((k, i) => {
          c.fillStyle = k === 'OK' ? '#3fd46c' : k === 'C' ? '#ff9a3d' : '#2f3a80'; c.strokeStyle = INK; c.lineWidth = 4;
          rr(c, kx(i), ky(i), 72, 66, 10); c.fill(); c.stroke();
          c.fillStyle = k === 'OK' || k === 'C' ? INK : '#e8eefc'; c.font = '900 24px system-ui'; c.fillText(k, kx(i) + 36, ky(i) + 34);
        });
      },
    };
  }

  const FACTORY = { wires: Wires, power: Power, card: Card, filter: Filter, memory: Memory, lights: Lights, keypad: Keypad };
  const TITLES = { wires: 'Kablo eşleştirme', power: 'Enerji dağıtımı', card: 'Kart tarama', filter: 'Filtre temizleme', memory: 'Hafıza paneli', lights: 'Işıkları onar', keypad: 'Oksijeni onar' };

  const MG = (SS.Minigames = {
    el: null, canvas: null, ctx: null, game: null, forTask: null, doneT: 0, pointerId: null,

    init() {
      MG.el = document.getElementById('taskModal');
      MG.canvas = document.getElementById('taskCanvas');
      MG.canvas.width = W; MG.canvas.height = H;
      MG.ctx = MG.canvas.getContext('2d');
      MG.titleEl = document.getElementById('taskTitle');
      MG.msgEl = document.getElementById('taskMsg');
      document.getElementById('taskClose').addEventListener('click', () => { SS.Audio.click(); if (SS.Game.state === 'TASK') SS.Game.closeTask(); });
      const pos = e => {
        const r = MG.canvas.getBoundingClientRect();
        return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
      };
      const live = () => MG.game && SS.Game.state === 'TASK' && MG.doneT <= 0;
      MG.canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!live()) return;
        MG.pointerId = e.pointerId;
        try { MG.canvas.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
        const p = pos(e); MG.game.down(p[0], p[1]);
      });
      MG.canvas.addEventListener('pointermove', e => {
        if (!live() || (MG.pointerId !== null && e.pointerId !== MG.pointerId)) return;
        const p = pos(e); MG.game.move(p[0], p[1]);
      });
      const end = e => {
        if (MG.pointerId !== null && e.pointerId !== MG.pointerId) return;
        MG.pointerId = null;
        if (!live()) return;
        const p = pos(e); MG.game.up(p[0], p[1]);
      };
      MG.canvas.addEventListener('pointerup', end);
      MG.canvas.addEventListener('pointercancel', end);
    },

    open(at) {
      const api = {
        hint: (txt, bad) => { MG.msgEl.textContent = txt; MG.msgEl.classList.toggle('bad', !!bad); },
        sfx: k => { if (k === 'ok') SS.Audio.blip(760, 0.05); else SS.Audio.blip(160, 0.12); },
        success: () => {
          if (MG.doneT > 0) return;
          SS.Game.completeActiveTask();
          MG.doneT = 0.85;
          MG.msgEl.textContent = at.kind === 'fix' ? 'Onarıldı!' : 'Görev tamamlandı!';
          MG.msgEl.classList.remove('bad');
          if (at.kind === 'fix') SS.Audio.fixed();
        },
      };
      MG.forTask = at;
      MG.doneT = 0;
      MG.pointerId = null;
      MG.titleEl.textContent = TITLES[at.type] + (at.station ? ' — ' + SS.Map.roomById[at.station.room].name : '');
      MG.game = FACTORY[at.type](api);
      MG.el.classList.remove('hidden');
    },

    close() {
      MG.game = null; MG.forTask = null; MG.doneT = 0; MG.pointerId = null;
      MG.el.classList.add('hidden');
    },

    // Görünürlük her kare oyun durumundan türetilir; görünmez katman kalmaz.
    frame(dt) {
      const G = SS.Game;
      const want = (G.state === 'TASK' || (G.state === 'PAUSED' && G.prevState === 'TASK')) && G.activeTask;
      if (want && MG.forTask !== G.activeTask) MG.open(G.activeTask);
      if (!want && MG.game) MG.close();
      if (!MG.game) return;
      if (G.state === 'TASK') {
        MG.game.update(dt);
        if (MG.doneT > 0) {
          MG.doneT -= dt;
          if (MG.doneT <= 0) { G.closeTask(); MG.close(); return; }
        }
      }
      MG.game.draw(MG.ctx);
      if (MG.doneT > 0) {
        const c = MG.ctx;
        c.fillStyle = 'rgba(20,60,40,0.55)'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#7dffb0'; c.strokeStyle = INK; c.lineWidth = 6;
        c.font = '900 40px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeText('TAMAMLANDI!', W / 2, H / 2); c.fillText('TAMAMLANDI!', W / 2, H / 2);
      }
    },
  });
})();
