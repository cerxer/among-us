// Giriş: klavye ve sanal joystick. Her durumda hangi girişin geçerli olduğu burada süzülür.
(function () {
  'use strict';
  const SS = window.SS;

  const MOVE = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };

  const I = (SS.Input = {
    keys: new Set(),
    joy: { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 },
    touch: false,

    init() {
      I.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      document.body.classList.toggle('touch', I.touch);
      window.addEventListener('keydown', I.onKey);
      window.addEventListener('keyup', e => { I.keys.delete(e.code); });
      window.addEventListener('blur', () => { I.keys.clear(); I.resetJoy(); });
      window.addEventListener('touchstart', () => {
        if (!I.touch) { I.touch = true; document.body.classList.add('touch'); }
      }, { passive: true });
      // Sayfa kaymasını ve yakınlaştırmayı engelle.
      document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
      document.addEventListener('gesturestart', e => e.preventDefault());
      document.addEventListener('dblclick', e => e.preventDefault());

      const zone = document.getElementById('joyZone');
      const base = document.getElementById('joyBase');
      const knob = document.getElementById('joyKnob');
      I.joyEls = { zone, base, knob };
      zone.addEventListener('pointerdown', e => {
        if (I.joy.active) return;
        e.preventDefault();
        const r = zone.getBoundingClientRect();
        I.joy.active = true; I.joy.id = e.pointerId;
        I.joy.bx = e.clientX - r.left; I.joy.by = e.clientY - r.top;
        I.joy.x = I.joy.y = 0;
        try { zone.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
        I.drawJoy();
      });
      zone.addEventListener('pointermove', e => {
        if (!I.joy.active || e.pointerId !== I.joy.id) return;
        const r = zone.getBoundingClientRect();
        const R = 56;
        let dx = e.clientX - r.left - I.joy.bx, dy = e.clientY - r.top - I.joy.by;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        I.joy.x = dx / R; I.joy.y = dy / R;
        I.drawJoy();
      });
      const end = e => { if (e.pointerId === I.joy.id) I.resetJoy(); };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
      I.resetJoy();
    },

    resetJoy() {
      I.joy.active = false; I.joy.id = null; I.joy.x = I.joy.y = 0;
      if (I.joyEls) {
        const z = I.joyEls.zone.getBoundingClientRect();
        I.joy.bx = Math.max(78, Math.min(110, z.width / 2)); I.joy.by = Math.max(78, z.height - 100);
        I.drawJoy();
        I.joyEls.base.classList.remove('active');
      }
    },
    drawJoy() {
      const { base, knob } = I.joyEls;
      base.style.transform = 'translate(' + (I.joy.bx - 64) + 'px,' + (I.joy.by - 64) + 'px)';
      knob.style.transform = 'translate(' + (I.joy.x * 56) + 'px,' + (I.joy.y * 56) + 'px)';
      base.classList.toggle('active', I.joy.active);
    },

    // Her kare oyuna hareket vektörü yazılır (kare hızından bağımsız).
    frame() {
      // Joystick bölgesi görünür olunca (veya boyutu değişince) taban konumunu yeniden hesapla.
      const zw = I.joyEls.zone.clientWidth + 'x' + I.joyEls.zone.clientHeight;
      if (!I.joy.active && zw !== I.joyZoneSize) { I.joyZoneSize = zw; I.resetJoy(); }
      let x = 0, y = 0;
      I.keys.forEach(k => { const v = MOVE[k]; if (v) { x += v[0]; y += v[1]; } });
      if (I.joy.active) {
        const m = Math.sqrt(I.joy.x * I.joy.x + I.joy.y * I.joy.y);
        if (m > 0.18) { x += I.joy.x; y += I.joy.y; }
      }
      const len = Math.sqrt(x * x + y * y);
      if (len > 1) { x /= len; y /= len; }
      SS.Game.input.x = x; SS.Game.input.y = y;
    },

    onKey(e) {
      const G = SS.Game, st = G.state;
      if (MOVE[e.code] || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (MOVE[e.code]) { I.keys.add(e.code); return; }
      if (e.repeat) return;
      const hud = SS.HUD;
      switch (e.code) {
        case 'Escape':
          if (st === 'TASK') { G.closeTask(); return; }
          if (st === 'PLAYING' && hud.panel) { hud.closePanels(); return; }
          if (st === 'PAUSED') { SS.Screens.resume(); return; }
          if (G.pause()) return;
          if (st === 'MENU' || st === 'GAME_OVER') SS.Screens.closeHowto();
          return;
        case 'KeyE':
          if (st === 'PLAYING' && !hud.panel) G.playerUse();
          return;
        case 'KeyR':
          if (st === 'PLAYING' && !hud.panel) G.playerReport();
          return;
        case 'KeyQ':
          if (st === 'PLAYING' && !hud.panel) G.playerKill();
          return;
        case 'KeyF':
          if (st === 'PLAYING') hud.togglePanel('sab');
          return;
        case 'KeyH':
          if (st === 'PLAYING') { const p = G.player(); if (p && p.disguise !== null) { if (!hud.panel) G.playerShift(); } else hud.togglePanel('shift'); }
          return;
        case 'KeyG':
          if (st === 'PLAYING' && !hud.panel) G.playerVanish();
          return;
        case 'KeyP':
          if (st === 'PLAYING' && !hud.panel) G.playerProtect();
          return;
        case 'KeyO':
          if (st === 'PLAYING' && !hud.panel) G.playerInflToggle();
          return;
        case 'KeyT':
          if (st === 'PLAYING' && !hud.panel) G.playerTrack();
          return;
        case 'KeyI':
          if (st === 'PLAYING' && !hud.panel) G.playerInterrogate();
          return;
        case 'KeyN':
          if (st === 'PLAYING') hud.togglePanel('case');
          return;
        case 'KeyV':
          if (st === 'PLAYING') hud.togglePanel('vitals');
          return;
        case 'Tab':
        case 'KeyM':
          if (st === 'PLAYING') hud.togglePanel('map');
          return;
        case 'Digit1':
        case 'Digit2': {
          const p = G.player();
          if (st === 'PLAYING' && p && p.inVent !== null) {
            const id = SS.Map.vents[p.inVent].links[e.code === 'Digit1' ? 0 : 1];
            if (id !== undefined) G.playerVentMove(id);
          }
          return;
        }
        case 'Enter':
          if (st === 'ROLE_REVEAL') G.setState('PLAYING');
          return;
      }
    },
  });
})();
