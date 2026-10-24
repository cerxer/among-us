// Oyun içi arayüz: görev çubuğu, görev listesi, aksiyon butonları, sabotaj uyarısı, harita ve sabotaj panelleri.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;
  const $ = id => document.getElementById(id);

  const H = (SS.HUD = {
    panel: null, toastT: 0, cache: {}, sabT: 0, ventSig: '',

    init() {
      H.el = {
        hud: $('hud'), fill: $('taskFill'), pct: $('taskPct'), alert: $('sabAlert'), list: $('taskList'), items: $('taskItems'),
        badge: $('roleBadge'), killInfo: $('killInfo'), prompt: $('prompt'), toast: $('toast'), ghost: $('ghostBanner'),
        vent: $('ventBar'), use: $('btnUse'), report: $('btnReport'), kill: $('btnKill'), sab: $('btnSab'),
        mapModal: $('mapModal'), mapCanvas: $('mapCanvas'), sabModal: $('sabModal'), sabBody: $('sabBody'),
      };
      const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
      press(H.el.use, () => H.action('use'));
      press(H.el.report, () => H.action('report'));
      press(H.el.kill, () => H.action('kill'));
      press(H.el.sab, () => H.action('sab'));
      press($('btnMap'), () => { SS.Audio.click(); H.togglePanel('map'); });
      press($('btnSettings'), () => { SS.Audio.click(); H.closePanels(); SS.Game.pause(); });
      press($('taskListHead'), () => H.el.list.classList.toggle('collapsed'));
      document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { SS.Audio.click(); H.closePanels(); }));
      [H.el.mapModal, H.el.sabModal].forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) H.closePanels(); }));
      const mc = H.el.mapCanvas;
      mc.width = 900; mc.height = Math.round(900 * SS.Map.pxH / SS.Map.pxW);
      if (window.innerWidth < 600) H.el.list.classList.add('collapsed');

      SS.events.on('denied', msg => { if (msg) H.toast(msg, 1.4); });
      SS.events.on('taskComplete', e => { if (e.c.isPlayer) H.toast('Görev tamamlandı!', 1.4); });
      SS.events.on('fakeTask', () => H.toast('Sahte görev yapılıyor… (ilerleme sağlamaz)', 1.8));
      SS.events.on('sabotage', e => {
        const p = SS.Game.player();
        if (e.type === 'doors') H.toast(SS.Map.rooms[e.room].name + ' kapıları kilitlendi!', 1.8);
        else if (p.role === 'impostor' && e.by === p) H.toast(e.type === 'lights' ? 'Işıklar kesildi!' : 'Oksijen krizi başladı!', 1.6);
      });
      SS.events.on('sabotageEnd', e => { if (!e.cancelled) H.toast(e.type === 'lights' ? 'Işıklar geri geldi.' : 'Oksijen sistemi onarıldı.', 1.6); });
      SS.events.on('kill', e => { if (e.victim.isPlayer) H.toast(e.victim.role === 'crew' ? 'Artık bir hayaletsin. Görevlerini bitirmeye devam edebilirsin.' : 'Elendin.', 3); });
      SS.events.on('state', e => {
        if (e.to !== 'PLAYING' && e.to !== 'PAUSED') H.closePanels();
        if (e.to === 'ROLE_REVEAL') { H.cache = {}; H.ventSig = ''; H.toastT = 0; H.el.toast.classList.add('hidden'); }
      });
    },

    toast(msg, dur) {
      H.el.toast.textContent = msg;
      H.el.toast.classList.remove('hidden');
      H.toastT = dur || 1.6;
    },

    action(kind) {
      const G = SS.Game, ctx = G.ctx;
      if (G.state !== 'PLAYING' || H.panel) return;
      if (kind === 'use') {
        if (ctx.use && ctx.use.disabled) { SS.events.emit('denied', ctx.use.reason); return; }
        if (!ctx.use) { SS.events.emit('denied', ctx.useReason); return; }
        SS.Audio.click(); G.playerUse();
      } else if (kind === 'report') {
        if (!ctx.report) { SS.events.emit('denied', ctx.reportReason); return; }
        G.playerReport();
      } else if (kind === 'kill') {
        if (!ctx.kill) { SS.events.emit('denied', ctx.killReason); return; }
        G.playerKill();
      } else if (kind === 'sab') {
        SS.Audio.click(); H.togglePanel('sab');
      }
    },

    togglePanel(name) {
      const G = SS.Game, p = G.player();
      if (G.state !== 'PLAYING') return;
      if (name === 'sab' && (!p || p.role !== 'impostor' || !p.alive)) { if (p && p.role !== 'impostor') return; SS.events.emit('denied', 'Elendin'); return; }
      if (H.panel === name) { H.closePanels(); return; }
      H.closePanels();
      H.panel = name;
      G.uiBlock = true;
      (name === 'map' ? H.el.mapModal : H.el.sabModal).classList.remove('hidden');
      if (name === 'sab') H.renderSab(true);
    },

    closePanels() {
      H.panel = null;
      if (SS.Game) SS.Game.uiBlock = false;
      if (!H.el) return;
      H.el.mapModal.classList.add('hidden');
      H.el.sabModal.classList.add('hidden');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    },

    set(key, val, fn) { if (H.cache[key] !== val) { H.cache[key] = val; fn(val); } },
    setBtn(el, key, on, why, label) {
      H.set(key + 'on', on, v => el.classList.toggle('off', !v));
      H.set(key + 'why', why || '', v => { el.querySelector('.why').textContent = v; });
      if (label !== undefined) H.set(key + 'lb', label, v => { el.querySelector('b').textContent = v; });
    },

    frame(dt) {
      const G = SS.Game, m = G.match, st = G.state;
      const show = m && (st === 'PLAYING' || st === 'TASK' || (st === 'PAUSED' && (G.prevState === 'PLAYING' || G.prevState === 'TASK')));
      H.set('hudShow', !!show, v => H.el.hud.classList.toggle('hidden', !v));
      if (H.toastT > 0) { H.toastT -= dt; if (H.toastT <= 0) H.el.toast.classList.add('hidden'); }
      if (!show) return;
      const p = G.player(), ctx = G.ctx || G.context();
      const pct = m.tasksTotal ? Math.round((m.tasksDone / m.tasksTotal) * 100) : 0;
      H.set('pct', pct, v => { H.el.fill.style.width = v + '%'; H.el.pct.textContent = v + '%'; });
      H.updateList(m, p);
      H.updateAlert(m, p);
      H.updateButtons(m, p, ctx);
      H.updatePrompt(m, p, ctx);
      H.updateVent(m, p);
      const ghostTxt = p.alive ? '' : (p.role === 'crew' ? 'Hayaletsin: duvarlardan geçebilir, kalan görevlerini tamamlayabilirsin.' : 'Elendin: maçın kalanını hayalet olarak izliyorsun.');
      H.set('ghost', ghostTxt, v => { H.el.ghost.textContent = v; H.el.ghost.classList.toggle('hidden', !v); });
      if (H.panel === 'map') H.drawMap(m, p);
      if (H.panel === 'sab') { H.sabT -= dt; if (H.sabT <= 0) H.renderSab(false); }
    },

    updateList(m, p) {
      const M = SS.Map;
      const sig = p.role + p.alive + p.tasks.map(t => (t.done ? 1 : 0)).join('') + m.id;
      H.set('listSig', sig, () => {
        const badge = H.el.badge;
        badge.className = 'role-badge ' + (p.alive ? p.role : 'ghost');
        badge.textContent = p.alive ? (p.role === 'crew' ? 'MÜRETTEBAT' : 'HAİN') : (p.role === 'crew' ? 'HAYALET · MÜRETTEBAT' : 'HAYALET · HAİN');
        const rows = [];
        if (p.role === 'impostor') {
          const mates = m.chars.filter(c => c.role === 'impostor' && c !== p).map(c => c.name).join(', ');
          rows.push('<li class="note">Takım arkadaşın: <b>' + mates + '</b></li>');
          rows.push('<li class="note">Sahte görevler — ilerleme sağlamaz</li>');
        }
        p.tasks.forEach(t => {
          const st = M.stations[t.station];
          rows.push('<li class="' + (t.done ? 'done' : '') + '"><span>' + (t.done ? '✓' : '•') + '</span><span>' + st.name + ' <span class="room">' + M.roomById[st.room].name + '</span></span></li>');
        });
        H.el.items.innerHTML = rows.join('');
      });
      const ki = p.role === 'impostor' && p.alive ? (p.killCd > 0 ? 'Saldırı bekleme: ' + Math.ceil(p.killCd) + ' sn' : 'Saldırı hazır') : '';
      H.set('killInfo', ki, v => { H.el.killInfo.textContent = v; H.el.killInfo.classList.toggle('hidden', !v); });
    },

    updateAlert(m) {
      const s = m.sab;
      let html = '';
      if (s.active === 'lights') html = 'IŞIKLAR KESİLDİ!<small>Elektrik Odası\'ndaki panelden onar</small>';
      else if (s.active === 'oxygen') {
        html = 'OKSİJEN KRİZİ · ' + U.fmtTime(Math.ceil(s.timer)) +
          '<small>Oksijen Odası ' + (s.o2.o2a ? '✓' : '✗') + ' · İletişim Odası ' + (s.o2.o2b ? '✓' : '✗') + '</small>';
      }
      if (s.doors) html += (html ? '<small>' : '') + 'KAPILAR KİLİTLİ: ' + SS.Map.rooms[s.doors.room].name + ' (' + Math.ceil(s.doors.timer) + ' sn)' + (html ? '</small>' : '');
      H.set('alert', html, v => { H.el.alert.innerHTML = v; H.el.alert.classList.toggle('hidden', !v); });
    },

    updateButtons(m, p, ctx) {
      const imp = p.role === 'impostor';
      H.set('isImp', imp, v => { H.el.kill.classList.toggle('hidden', !v); H.el.sab.classList.toggle('hidden', !v); });
      const u = ctx.use;
      const useOn = !!u && !u.disabled && p.busyT <= 0;
      const useWhy = u ? (u.disabled ? u.reason : (p.busyT > 0 ? 'Meşgul' : u.desc)) : ctx.useReason;
      H.setBtn(H.el.use, 'use', useOn, useWhy, u ? u.label : 'Kullan');
      H.setBtn(H.el.report, 'rep', !!ctx.report, ctx.report ? 'Cesedi bildir' : ctx.reportReason);
      if (imp) {
        H.setBtn(H.el.kill, 'kill', !!ctx.kill, ctx.kill ? ctx.kill.name : ctx.killReason);
        H.set('killCd', p.alive && ctx.killCd > 0 ? Math.ceil(ctx.killCd) : '', v => { H.el.kill.querySelector('.cd').textContent = v; H.el.kill.classList.toggle('cooling', v !== ''); });
        const sabReady = p.alive && (SS.Sabotage.canStart(m, 'lights').ok || SS.Sabotage.canStart(m, 'doors', 0).ok);
        const why = !p.alive ? 'Elendin' : sabReady ? 'Panel aç' : (m.sab.active ? 'Sabotaj aktif' : 'Bekleme ' + Math.ceil(Math.min(m.sab.cooldown || 99, m.sab.doorCooldown || 99)) + ' sn');
        H.setBtn(H.el.sab, 'sab', p.alive, why);
        H.set('sabReady', sabReady, v => H.el.sab.classList.toggle('ready', v));
      }
    },

    updatePrompt(m, p, ctx) {
      const touch = document.body.classList.contains('touch');
      const k = key => (touch ? '' : '<kbd>' + key + '</kbd>');
      let txt = '';
      const u = ctx.use;
      if (SS.Game.state !== 'PLAYING') txt = '';
      else if (u && u.kind !== 'ventExit') txt = u.disabled ? '⛔ ' + u.reason : k('E') + u.label + ': ' + u.desc;
      else if (ctx.report) txt = k('R') + 'Cesedi rapor et';
      else if (ctx.kill) txt = k('Q') + 'Saldır: ' + ctx.kill.name;
      H.set('prompt', txt, v => { H.el.prompt.innerHTML = v; H.el.prompt.classList.toggle('hidden', !v); });
    },

    updateVent(m, p) {
      const sig = p.inVent === null ? '' : 'v' + p.inVent;
      if (sig === H.ventSig) return;
      H.ventSig = sig;
      const bar = H.el.vent;
      bar.innerHTML = '';
      if (!sig) { bar.classList.add('hidden'); return; }
      const cur = SS.Map.vents[p.inVent];
      cur.links.forEach((id, i) => {
        const b = document.createElement('button');
        b.className = 'btn';
        b.innerHTML = '→ ' + SS.Map.vents[id].name + (document.body.classList.contains('touch') ? '' : ' <kbd>' + (i + 1) + '</kbd>');
        b.addEventListener('pointerdown', e => { e.preventDefault(); SS.Audio.click(); SS.Game.playerVentMove(id); });
        bar.appendChild(b);
      });
      const ex = document.createElement('button');
      ex.className = 'btn primary';
      ex.innerHTML = 'Dışarı çık' + (document.body.classList.contains('touch') ? '' : ' <kbd>E</kbd>');
      ex.addEventListener('pointerdown', e => { e.preventDefault(); SS.Game.exitVent(SS.Game.player()); });
      bar.appendChild(ex);
      bar.classList.remove('hidden');
    },

    // Harita: yalnızca oyuncunun konumu ve kendi görevleri; diğer karakterler veya gizli bilgi yok.
    drawMap(m, p) {
      const M = SS.Map, c = H.el.mapCanvas, g = c.getContext('2d');
      const k = c.width / M.pxW, T = M.T, t = performance.now() / 1000;
      g.fillStyle = '#070a1e'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#26306a';
      for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (M.floor[y * M.W + x]) g.fillRect(x * T * k, y * T * k, T * k + 0.6, T * k + 0.6);
      g.strokeStyle = '#8fa3ff'; g.lineWidth = 2;
      M.rooms.forEach(r => { g.strokeRect(r.px * k, r.py * k, r.pw * k, r.ph * k); });
      M.doors.forEach(d => { if (d.closed) { g.fillStyle = '#ff3d55'; g.fillRect(d.px * k, d.py * k, d.pw * k, d.ph * k); } });
      g.fillStyle = '#dfe6ff'; g.font = '800 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      M.rooms.forEach(r => g.fillText(r.name, r.cx * k, r.cy * k));
      if (p.role === 'impostor' && p.alive) {
        M.vents.forEach(v => { g.fillStyle = '#a8303d'; g.fillRect(v.x * k - 5, v.y * k - 4, 10, 8); });
      }
      p.tasks.forEach(tk => {
        if (tk.done) return;
        const st = M.stations[tk.station];
        g.fillStyle = '#ffd23f'; g.strokeStyle = '#080a1c'; g.lineWidth = 2;
        g.beginPath(); g.arc(st.x * k, st.y * k, 7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#080a1c'; g.font = '900 10px system-ui'; g.fillText('!', st.x * k, st.y * k + 1);
      });
      ['lights', 'o2a', 'o2b'].forEach(key => {
        if (!SS.Sabotage.needs(m, key)) return;
        const pn = M.panels[key];
        g.fillStyle = Math.sin(t * 8) > 0 ? '#ff3d55' : '#ff9aa6';
        g.beginPath(); g.arc(pn.x * k, pn.y * k, 9, 0, Math.PI * 2); g.fill();
      });
      const r = 7 + Math.sin(t * 6) * 2;
      g.fillStyle = p.def.color; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(p.x * k, p.y * k, r, 0, Math.PI * 2); g.fill(); g.stroke();
    },

    renderSab(force) {
      const G = SS.Game, m = G.match, p = G.player();
      H.sabT = 0.25;
      if (!m || !p) return;
      const can = t => SS.Sabotage.canStart(m, t, t === 'doors' ? 0 : undefined);
      const lights = can('lights'), doors = can('doors');
      const sig = JSON.stringify([lights, doors, p.alive]);
      if (!force && sig === H.cache.sabSig) return;
      H.cache.sabSig = sig;
      const body = H.el.sabBody;
      body.innerHTML = '';
      const mk = (cls, label, sub, ok, fn) => {
        const b = document.createElement('button');
        b.className = 'sab-btn ' + cls + (ok ? '' : ' off');
        b.innerHTML = label + '<small>' + sub + '</small>';
        b.addEventListener('click', () => {
          if (!ok) { SS.events.emit('denied', sub); return; }
          if (fn()) { SS.Audio.click(); H.closePanels(); }
        });
        return b;
      };
      const h1 = document.createElement('h4'); h1.textContent = 'ANA SABOTAJ (aynı anda bir tane)'; body.appendChild(h1);
      const main = document.createElement('div'); main.className = 'sab-main';
      main.appendChild(mk('', 'Işıkları Kes', lights.ok ? 'Mürettebatın görüşü daralır' : lights.reason, lights.ok, () => G.playerSabotage('lights')));
      main.appendChild(mk('', 'Oksijen Krizi', lights.ok ? '45 sn · iki panel onarılmalı' : lights.reason, lights.ok, () => G.playerSabotage('oxygen')));
      body.appendChild(main);
      const h2 = document.createElement('h4'); h2.textContent = 'KAPILARI KİLİTLE (' + SS.C.DOOR_TIME + ' sn)'; body.appendChild(h2);
      const dw = document.createElement('div'); dw.className = 'sab-doors';
      SS.Map.rooms.forEach(r => dw.appendChild(mk('door', r.name, doors.ok ? 'Kilitle' : doors.reason, doors.ok, () => G.playerSabotage('doors', r.index))));
      body.appendChild(dw);
    },
  });
})();
