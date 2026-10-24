// Karakter çizimi: küçük bakım robotları. Tamamen Canvas ile, görsel dosya gerekmez.
(function () {
  'use strict';
  const SS = window.SS;
  const INK = '#0a0c20';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawAccessory(ctx, def, f, t, top) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    switch (def.accessory) {
      case 'antenna':
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(f * 3, top - 11); ctx.stroke();
        ctx.fillStyle = (Math.sin(t * 5) > 0) ? '#ffe36b' : '#ffb13d';
        ctx.beginPath(); ctx.arc(f * 3, top - 13, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'headphones':
        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, top + 11, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.lineWidth = 3;
        ctx.fillStyle = '#2b2f55';
        rr(ctx, -18, top + 5, 7, 12, 3); ctx.fill(); ctx.stroke();
        rr(ctx, 11, top + 5, 7, 12, 3); ctx.fill(); ctx.stroke();
        break;
      case 'propeller': {
        ctx.fillStyle = '#ff5d73';
        ctx.beginPath(); ctx.arc(0, top + 2, 8, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, top - 5); ctx.lineTo(0, top - 1); ctx.stroke();
        const s = Math.cos(t * 14) * 11;
        ctx.fillStyle = '#ffe36b';
        ctx.beginPath(); ctx.ellipse(0, top - 6, Math.abs(s) + 1, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      }
      case 'sprout':
        ctx.beginPath(); ctx.moveTo(0, top); ctx.quadraticCurveTo(f * 2, top - 6, 0, top - 10); ctx.stroke();
        ctx.fillStyle = '#5ef08a';
        ctx.beginPath(); ctx.ellipse(-5, top - 11, 6, 3.5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(5, top - 12, 6, 3.5, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'headlamp':
        ctx.fillStyle = '#30345c';
        rr(ctx, -14, top + 3, 28, 5, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff4a8';
        ctx.beginPath(); ctx.arc(f * 7, top + 2, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,244,168,0.18)';
        ctx.beginPath(); ctx.moveTo(f * 9, top + 2); ctx.lineTo(f * 34, top - 8); ctx.lineTo(f * 34, top + 12); ctx.closePath(); ctx.fill();
        break;
      case 'bowtie':
        ctx.fillStyle = '#ff4f9a';
        ctx.beginPath(); ctx.moveTo(0, top + 24); ctx.lineTo(-9, top + 19); ctx.lineTo(-9, top + 29); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, top + 24); ctx.lineTo(9, top + 19); ctx.lineTo(9, top + 29); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, top + 24, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'catears':
        ctx.fillStyle = def.color;
        [-1, 1].forEach(s => {
          ctx.beginPath(); ctx.moveTo(s * 4, top + 3); ctx.lineTo(s * 10, top - 8); ctx.lineTo(s * 13, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffd0ee';
          ctx.beginPath(); ctx.moveTo(s * 7, top + 2); ctx.lineTo(s * 10, top - 3); ctx.lineTo(s * 11, top + 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = def.color;
        });
        break;
      case 'tophat':
        ctx.fillStyle = '#1b1c2e';
        rr(ctx, -12, top - 1, 24, 5, 2); ctx.fill(); ctx.stroke();
        rr(ctx, -8, top - 15, 16, 15, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff4f60';
        ctx.fillRect(-7, top - 5, 14, 3);
        break;
      case 'cap': // kasket: siperlik bakılan yöne
        ctx.fillStyle = '#e9d7a8';
        ctx.beginPath(); ctx.arc(0, top + 4, 12, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        rr(ctx, f > 0 ? 2 : -18, top + 1, 16, 5, 2.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8a86a'; ctx.beginPath(); ctx.arc(0, top - 7, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'goggles': // kaynak gözlüğü alnın üstünde
        ctx.fillStyle = '#4b4f6b';
        rr(ctx, -14, top + 1, 28, 5, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffb13d';
        [-6, 6].forEach(dx => { ctx.beginPath(); ctx.arc(dx, top + 2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        [-7.5, 4.5].forEach(dx => ctx.fillRect(dx, top, 2.5, 2));
        break;
      case 'flower': // tepede papatya
        ctx.beginPath(); ctx.moveTo(f * 4, top + 1); ctx.lineTo(f * 6, top - 6); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(f * 6 + Math.cos(a) * 5, top - 9 + Math.sin(a) * 5, 3.5, 2.5, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(f * 6, top - 9, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'beret': // yana yatık bere
        ctx.fillStyle = '#2b2f55';
        ctx.beginPath(); ctx.ellipse(-f * 3, top + 1, 14, 6, -f * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-f * 3, top - 5); ctx.lineTo(-f * 3, top - 9); ctx.stroke();
        break;
      case 'mustache': // vizörün altında bıyık
        ctx.fillStyle = '#2b1d12';
        [-1, 1].forEach(s => {
          ctx.beginPath(); ctx.ellipse(f * 3 + s * 5, top + 21, 5.5, 2.6, s * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
        break;
      case 'scarf': // boyunda atkı, ucu arkaya sarkar
        ctx.fillStyle = '#ffd23f';
        rr(ctx, -15, top + 19, 30, 6, 3); ctx.fill(); ctx.stroke();
        rr(ctx, -f * 13 - 3, top + 22, 6, 12, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff4f60'; ctx.fillRect(-9, top + 20, 3, 4); ctx.fillRect(3, top + 20, 3, 4);
        break;
      case 'starclip': // başın yanında yıldız toka
        ctx.fillStyle = '#ffe36b';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.8 : 6.5;
          ctx.lineTo(-f * 9 + Math.cos(a) * r, top + 1 + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
    }
  }

  const Sprites = (SS.Sprites = {
    rr,
    // (x, y) ayak merkezi. o: { def, facing, phase, moving, t, alpha, ghost, dead, busy, scale }
    robot(ctx, x, y, o) {
      const def = o.def, f = o.facing || 1, t = o.t || 0, s = o.scale || 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.globalAlpha *= (o.alpha === undefined ? 1 : o.alpha);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const walk = o.moving ? Math.sin(o.phase || 0) : 0;
      const bob = o.moving ? -Math.abs(Math.sin(o.phase || 0)) * 2.2 : Math.sin(t * 2.2) * 0.6;

      if (o.ghost) {
        const fl = Math.sin(t * 3) * 3;
        ctx.translate(0, fl - 6);
        ctx.globalAlpha *= 0.55;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 1, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
        // ayaklar (yürüme animasyonu)
        ctx.fillStyle = def.dark; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        rr(ctx, -11, -8 - Math.max(0, walk) * 3, 9, 8, 3); ctx.fill(); ctx.stroke();
        rr(ctx, 2, -8 - Math.max(0, -walk) * 3, 9, 8, 3); ctx.fill(); ctx.stroke();
      }

      ctx.translate(0, bob);
      const top = -40;
      // sırt çantası (batarya)
      ctx.fillStyle = def.dark; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rr(ctx, -f * 15 - 5, top + 9, 10, 20, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7dffb0';
      ctx.fillRect(-f * 15 - 2, top + 13, 4, 3);
      // gövde
      if (o.ghost) {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(-14, top + 12);
        ctx.arcTo(-14, top, 0, top, 13);
        ctx.arcTo(14, top, 14, top + 12, 13);
        ctx.lineTo(14, top + 34);
        for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(10 - i * 7, top + 40 + (i % 2 ? -4 : 4), 7 - i * 7, top + 34);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = def.color;
        rr(ctx, -14, top, 28, 34, 12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        rr(ctx, -9, top + 4, 7, 12, 3); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        rr(ctx, -10, top + 21, 20, 9, 4); ctx.fill();
      }
      // vizör
      ctx.fillStyle = '#16204a';
      rr(ctx, -10 + f * 3, top + 6, 20, 12, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(140,220,255,0.35)';
      rr(ctx, -7 + f * 3, top + 8, 7, 3, 1.5); ctx.fill();
      if (o.dead) {
        ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 2;
        [-4, 4].forEach(dx => {
          const ex = dx + f * 4, ey = top + 12;
          ctx.beginPath(); ctx.moveTo(ex - 2.5, ey - 2.5); ctx.lineTo(ex + 2.5, ey + 2.5);
          ctx.moveTo(ex + 2.5, ey - 2.5); ctx.lineTo(ex - 2.5, ey + 2.5); ctx.stroke();
        });
      } else {
        const blink = (t % 4) > 3.85;
        ctx.fillStyle = '#86f6ff';
        [-4, 4].forEach(dx => {
          if (blink) ctx.fillRect(dx + f * 4 - 2.5, top + 12, 5, 1.5);
          else { ctx.beginPath(); ctx.arc(dx + f * 4, top + 12, 2.4, 0, Math.PI * 2); ctx.fill(); }
        });
      }
      drawAccessory(ctx, def, f, t, top);
      if (o.ghost) {
        ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(0, top - 10, 10, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (o.wings) { // koruyucu melek: çırpınan beyaz kanatlar
        const flap = Math.sin(t * 6) * 0.25;
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        [-1, 1].forEach(sd => {
          ctx.save();
          ctx.translate(sd * 13, top + 14);
          ctx.rotate(sd * (0.35 + flap));
          ctx.beginPath(); ctx.ellipse(sd * 9, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(sd * 6, 7, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.restore();
        });
      }
      if (o.busy && !o.dead) {
        // görev yaparken dönen küçük dişli (sahte ya da gerçek ayırt edilemez)
        ctx.save();
        ctx.translate(f * 18, top - 4);
        ctx.rotate(t * 4);
        ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2, r = i % 2 ? 4 : 7;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },

    // Devre dışı kalmış robot gövdesi (kan veya gerçekçi şiddet yok).
    body(ctx, x, y, def, facing, t) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 2, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.rotate((facing || 1) * Math.PI / 2);
      ctx.translate(0, 20);
      Sprites.robot(ctx, 0, 0, { def, facing: 1, t: 0, dead: true });
      ctx.restore();
      // kıvılcımlar ve duman
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.7 + i / 3) % 1);
        ctx.fillStyle = 'rgba(200,210,255,' + (0.35 * (1 - k)) + ')';
        ctx.beginPath(); ctx.arc(-6 + i * 6, -14 - k * 26, 4 + k * 6, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.sin(t * 9) > 0.6) {
        ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(13, -12); ctx.lineTo(10, -12); ctx.lineTo(15, -18); ctx.stroke();
      }
      ctx.restore();
    },

    // Küçük avatar (toplantı listesi, sonuç ekranı vb.)
    avatar(canvas, def, opts) {
      opts = opts || {};
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const s = Math.min(w, h) / 56;
      if (opts.dead) {
        ctx.globalAlpha = 0.9;
        Sprites.body(ctx, w / 2, h * 0.62, def, 1, 0);
        ctx.globalAlpha = 1;
      } else Sprites.robot(ctx, w / 2, h * 0.9, { def, facing: opts.facing || 1, t: opts.t || 0, scale: s });
    },
  });
})();
