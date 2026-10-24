// Tarayıcı duman testi: gerçek DOM butonları, klavye ve pointer olaylarıyla oyunu uçtan uca sürer.
// Kullanım (oyun sayfası açıkken konsolda):
//   const s = document.createElement('script'); s.src = 'tests/browser-smoke.js'; document.body.appendChild(s);
//   ...ardından: await __smoke()
(function () {
  'use strict';
  const SS = window.SS, G = SS.Game, M = SS.Map;
  const $ = id => document.getElementById(id);
  const visible = id => !$(id).classList.contains('hidden');
  const results = [];
  const ok = (name, cond, info) => { results.push({ test: name, ok: !!cond, info: info === undefined ? '' : String(info) }); };

  // Oyun döngüsünü elle ilerlet (gizli sekmede rAF yavaşladığı için).
  function step(sec) {
    const dt = 1 / 30, n = Math.max(1, Math.round(sec / dt));
    for (let i = 0; i < n; i++) {
      SS.Input.frame();
      G.update(dt); SS.Audio.tick(dt); SS.Minigames.frame(dt); SS.HUD.frame(dt); SS.Screens.frame(dt);
    }
    SS.Render.draw(performance.now());
  }
  const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type || 'keydown', { code, key: code, bubbles: true }));
  const tap = code => { key(code, 'keydown'); key(code, 'keyup'); };
  const click = id => $(id).click();
  const down = el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: 'touch' }));
  function ptr(type, x, y, id) {
    const c = $('taskCanvas'), r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x * r.width / 520, clientY: r.top + y * r.height / 400, pointerId: id || 1, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse' }));
  }
  const drag = (x1, y1, x2, y2) => { ptr('pointerdown', x1, y1); ptr('pointermove', (x1 + x2) / 2, (y1 + y2) / 2); ptr('pointermove', x2, y2); ptr('pointerup', x2, y2); };
  const mg = () => SS.Minigames.game;
  const quiet = () => { G.match.chars.forEach(c => { if (!c.isPlayer) c.brain = null; }); }; // botları durdur (deterministik test)

  function startAs(role) {
    G.settings.rolePref = role;
    click('btnStart');
    step(0.1);
    const r = G.state === 'ROLE_REVEAL' && visible('roleReveal');
    click('btnRevealGo');
    step(0.1);
    return r && G.state === 'PLAYING';
  }

  function solve(type) {
    const d = mg().dbg();
    if (type === 'wires') {
      // önce bilerek yanlış bir eşleşme dene (kilitlenmemeli)
      const wrongJ = d.right.findIndex(k => k !== d.left[0]);
      drag(d.LX, d.ys[0], d.RX, d.ys[wrongJ]);
      results.push({ test: 'kablo: yanlış eşleşme geri bildirimi', ok: $('taskMsg').classList.contains('bad'), info: $('taskMsg').textContent });
      d.left.forEach((k, i) => drag(d.LX, d.ys[i], d.RX, d.ys[d.right.indexOf(k)]));
    } else if (type === 'power') {
      ptr('pointerdown', d.btn[0] + 10, d.btn[1] + 10); ptr('pointerup', d.btn[0] + 10, d.btn[1] + 10);
      results.push({ test: 'enerji: aralık dışı onay geri bildirimi', ok: /aralık dışında/.test($('taskMsg').textContent), info: $('taskMsg').textContent });
      d.sl.forEach(s => { const y = d.y1 - s.center * (d.y1 - d.y0); ptr('pointerdown', s.x, y); ptr('pointerup', s.x, y); });
      ptr('pointerdown', d.btn[0] + 10, d.btn[1] + 10); ptr('pointerup', d.btn[0] + 10, d.btn[1] + 10);
    } else if (type === 'card') {
      ptr('pointerdown', 260, 330); ptr('pointerup', 260, 330);
      step(0.6);
      const swipe = (secs) => {
        const q = mg().dbg(); const y = q.slotY + 30; let x = q.cardX + 40;
        ptr('pointerdown', x, y);
        const n = 12;
        for (let i = 1; i <= n; i++) { step(secs / n); x = q.cardX + 40 + (q.endX - 40 + 4) * i / n; ptr('pointermove', x, y); }
        ptr('pointerup', x, y);
      };
      swipe(0.2);
      results.push({ test: 'kart: çok hızlı geri bildirimi', ok: /Çok hızlı/.test($('taskMsg').textContent), info: $('taskMsg').textContent });
      swipe(2.2);
      results.push({ test: 'kart: çok yavaş geri bildirimi', ok: /Çok yavaş/.test($('taskMsg').textContent), info: $('taskMsg').textContent });
      swipe(0.9);
    } else if (type === 'filter') {
      for (let k = 0; k < 4 && mg().dbg().parts.length; k++) mg().dbg().parts.forEach(p => { ptr('pointerdown', p[0], p[1]); ptr('pointerup', p[0], p[1]); });
    } else if (type === 'memory') {
      ptr('pointerdown', 10, 10); ptr('pointerup', 10, 10);
      let g = 0; while (mg().dbg().phase !== 'input' && g++ < 200) step(0.1);
      // önce yanlış hücre: dizi yeniden gösterilmeli, kilitlenmemeli
      const first = d.seq[0], wrong = (first + 1) % 9;
      const cx = k => 123 + (k % 3) * 96 + 41, cy = k => 64 + Math.floor(k / 3) * 96 + 41;
      ptr('pointerdown', cx(wrong), cy(wrong)); ptr('pointerup', cx(wrong), cy(wrong));
      results.push({ test: 'hafıza: yanlış deneme geri bildirimi', ok: $('taskMsg').classList.contains('bad'), info: $('taskMsg').textContent });
      g = 0; while (mg().dbg().phase !== 'input' && g++ < 200) step(0.1);
      mg().dbg().cells.forEach(c => { ptr('pointerdown', c[0], c[1]); ptr('pointerup', c[0], c[1]); });
    } else if (type === 'lights') {
      d.st.forEach((v, i) => { if (!v) { ptr('pointerdown', d.xs[i], 200); ptr('pointerup', d.xs[i], 200); } });
    } else if (type === 'keypad') {
      const at = k => d.keys.find(q => q[0] === k);
      ['1', '1', '1', '1', 'OK'].forEach(k => { const q = at(k); ptr('pointerdown', q[1], q[2]); ptr('pointerup', q[1], q[2]); });
      results.push({ test: 'tuş takımı: hatalı kod geri bildirimi', ok: d.code === '1111' || /Hatalı/.test($('taskMsg').textContent), info: $('taskMsg').textContent });
      (d.code + 'K').split('').forEach(ch => { const q = at(ch === 'K' ? 'OK' : ch); ptr('pointerdown', q[1], q[2]); ptr('pointerup', q[1], q[2]); });
    }
  }

  window.__smoke = async function () {
    results.length = 0;
    const errs = [];
    const onErr = e => errs.push(e.message);
    window.addEventListener('error', onErr);
    try {
      // 1) Menü -> rol -> oyun
      if (G.state !== 'MENU') G.toMenu();
      step(0.1);
      ok('menü görünür', visible('menu'));
      ok('Oyuna Başla maçı başlatır (tek tık)', startAs('crew'), G.state);
      ok('HUD görünür, menü gizli', visible('hud') && !visible('menu'));
      quiet();
      const p = G.player();

      // 2) Hareket ve duvar
      const r0 = M.roomById.merkez;
      p.x = r0.cx - 200; p.y = r0.py + 80;
      const x0 = p.x;
      key('KeyD'); step(0.5); key('KeyD', 'keyup');
      ok('klavye ile hareket (D)', p.x > x0 + 60, (p.x - x0).toFixed(1));
      key('KeyW'); step(2); key('KeyW', 'keyup');
      ok('duvardan geçemez (W)', p.y >= r0.py + SS.C.RADIUS - 0.5, p.y.toFixed(1));
      key('KeyD'); key('KeyS'); const sx = p.x, sy = p.y; step(0.5); key('KeyD', 'keyup'); key('KeyS', 'keyup');
      const dd = Math.hypot(p.x - sx, p.y - sy);
      ok('çapraz hız düz hızı aşmaz', dd <= SS.C.SPEED * 0.5 + 2, dd.toFixed(1));

      // 3) Beş görev türü: aç, tamamla, kapan
      const types = ['wires', 'power', 'card', 'filter', 'memory'];
      const sts = types.map(t => M.stations.find(s => s.type === t));
      G.match.tasksTotal += sts.length - p.tasks.length;
      p.tasks = sts.map(s => ({ station: s.idx, done: false, fake: false }));
      for (let i = 0; i < sts.length; i++) {
        const s = sts[i];
        p.x = s.bx; p.y = s.by; step(0.05);
        tap('KeyE'); step(0.05);
        const opened = G.state === 'TASK' && visible('taskModal') && mg();
        ok('görev açılır: ' + s.type, opened, G.state);
        if (!opened) continue;
        if (i === 0) {
          tap('Escape'); step(0.05);
          ok('Esc görevi kapatır, ilerleme olmaz', G.state === 'PLAYING' && !visible('taskModal') && !p.tasks[0].done);
          const bx = p.x; key('KeyA'); step(0.3); key('KeyA', 'keyup');
          ok('görev kapandıktan sonra hareket edebilir', Math.abs(p.x - bx) > 10);
          p.x = s.bx; p.y = s.by; step(0.05);
          tap('KeyE'); step(0.05);
          const mx = p.x; key('KeyA'); step(0.3); key('KeyA', 'keyup');
          ok('görev açıkken hareket edemez', p.x === mx);
        }
        const before = G.match.tasksDone;
        solve(s.type);
        step(1.2);
        ok('görev tamamlanır ve kapanır: ' + s.type, p.tasks[i].done && G.state === 'PLAYING' && !visible('taskModal'), $('taskMsg').textContent + ' state=' + G.state);
        ok('ortak ilerleme arttı: ' + s.type, G.match.tasksDone === before + 1);
        tap('KeyE'); step(0.05);
        ok('tamamlanan görev tekrar açılmaz: ' + s.type, G.state === 'PLAYING');
      }
      ok('görev çubuğu güncellenir', parseFloat($('taskFill').style.width) > 0, $('taskPct').textContent);

      // 4) Harita
      tap('KeyM'); step(0.05);
      ok('harita açılır (M) ve hareketi kilitler', visible('mapModal') && G.uiBlock);
      tap('Escape'); step(0.05);
      ok('harita Esc ile kapanır', !visible('mapModal') && !G.uiBlock);

      // 5) Elektrik sabotajı ve onarım (gerçek panel üzerinden)
      const m = G.match;
      m.sab.cooldown = 0; SS.Sabotage.start(m, 'lights', null, null); step(1.5);
      ok('elektrik sabotajı görüşü azaltır + uyarı', G.visionRadius(p) < SS.C.VISION_CREW * 0.6 && visible('sabAlert'), $('sabAlert').textContent);
      const lp = M.panels.lights; p.x = lp.bx; p.y = lp.by; step(0.05);
      tap('KeyE'); step(0.05);
      ok('elektrik paneli açılır', G.state === 'TASK' && mg());
      solve('lights'); step(1.2);
      ok('ışıklar onarıldı', m.sab.active === null && G.state === 'PLAYING');

      // 6) Oksijen: iki panel, tuş takımı
      m.sab.cooldown = 0; SS.Sabotage.start(m, 'oxygen', null, null); step(0.1);
      m.emergencyCooldown = 0; p.x = M.button.x; p.y = M.button.y + 110; step(0.05);
      ok('oksijen krizinde acil buton pasif', G.ctx.use && G.ctx.use.kind === 'button' && G.ctx.use.disabled && $('btnUse').classList.contains('off'), G.ctx.use && G.ctx.use.reason);
      ['o2a', 'o2b'].forEach(k => {
        const pn = M.panels[k]; p.x = pn.bx; p.y = pn.by; step(0.05);
        tap('KeyE'); step(0.05);
        if (mg()) { solve('keypad'); step(1.2); }
      });
      ok('oksijen iki panelle onarıldı', m.sab.active === null, JSON.stringify(m.sab.o2));

      // 7) Rapor ve toplantı (hain bot birini devre dışı bırakır)
      const imp = m.chars.find(c => c.role === 'impostor');
      const vic = m.chars.find(c => c.role === 'crew' && !c.isPlayer);
      const dep = M.roomById.depo;
      vic.x = dep.cx; vic.y = dep.cy; imp.x = dep.cx + 40; imp.y = dep.cy; imp.killCd = 0;
      ok('hain bot saldırısı', G.kill(imp, vic));
      p.x = dep.cx + 200; p.y = dep.cy - 120; step(0.05);
      ok('uzaktaki ceset rapor edilemez', !G.ctx.report && $('btnReport').classList.contains('off'), $('btnReport').textContent.trim());
      p.x = dep.cx + 60; p.y = dep.cy + 30; step(0.05);
      ok('yakındaki ceset için Rapor aktif', !!G.ctx.report && !$('btnReport').classList.contains('off'));
      down($('btnReport')); step(0.1);
      ok('Rapor butonu toplantıyı başlatır', G.state === 'MEETING_DISCUSSION' && visible('meeting') && !visible('hud'));
      ok('toplantıda rapor eden ve oda gösterilir', /Depo/.test($('meetSub').textContent) && /gövdesini/.test($('meetSub').textContent), $('meetSub').textContent);
      ok('8 karakter kartı, ölü pasif', $('roster').children.length === 8 && $('roster').querySelectorAll('.card.dead').length >= 1);
      const btns = () => Array.from($('meetActions').querySelectorAll('button'));
      btns().find(b => /odayı söyle/.test(b.textContent)).click(); step(0.05);
      ok('oyuncu "odamı söyle"', /Ben depoda idim/.test($('chat').textContent), $('chat').lastChild.textContent);
      btns().find(b => /suçla/.test(b.textContent)).click(); step(0.05);
      const target = m.chars.find(c => c.alive && !c.isPlayer);
      $('roster').children[target.id].click(); step(0.05);
      ok('oyuncu bir karakteri suçlar', $('chat').textContent.indexOf('Bence ' + target.name + ' hain') >= 0);
      btns().find(b => /Oylamaya geç/.test(b.textContent)).click(); step(0.05);
      ok('oylama aşaması', G.state === 'MEETING_VOTE');
      $('roster').children[target.id].click(); step(0.05);
      const voteBtn = btns().find(b => /Oy ver/.test(b.textContent));
      ok('kart seçilince Oy ver onayı çıkar', !!voteBtn);
      voteBtn.click(); step(0.05);
      ok('oyuncu oyu kaydedildi', m.meeting.votes[p.id] === target.id);
      step(SS.C.VOTE_TIME + 0.5);
      ok('sonuç ekranı ve oy dağılımı', G.state === 'MEETING_RESULT' && $('roster').querySelectorAll('.chip').length >= 1);
      step(3);
      ok('atılma animasyonu ekranı', visible('eject'), $('ejectText').textContent);
      step(SS.C.RESULT_TIME);
      ok('toplantı sonrası oyun devam eder veya biter', G.state === 'PLAYING' || G.state === 'GAME_OVER', G.state);
      ok('cesetler temizlendi', m.bodies.length === 0);

      // 8) Hain rolü: saldırı, duvar arkası, bekleme, havalandırma, sabotaj paneli
      G.toMenu(); step(0.05);
      ok('hain olarak başlar', startAs('impostor') && G.player().role === 'impostor');
      quiet();
      const q = G.player(), m2 = G.match;
      ok('Saldır ve Sabotaj butonları görünür', visible('btnKill') && visible('btnSab'));
      ok('başlangıç saldırı beklemesi gösterilir', $('btnKill').querySelector('.cd').textContent !== '', $('btnKill').querySelector('.cd').textContent);
      q.killCd = 0;
      const crewT = m2.chars.find(c => c.role === 'crew');
      const rr = M.roomById.reaktor;
      q.x = rr.px + 30; q.y = rr.py + 20; crewT.x = rr.px + 30; crewT.y = rr.py - 45; step(0.05);
      tap('KeyQ'); step(0.05);
      ok('duvar arkasındaki hedefe Q çalışmaz', crewT.alive && $('btnKill').classList.contains('off'), $('btnKill').querySelector('.why').textContent);
      crewT.x = q.x + 50; crewT.y = q.y; step(0.05);
      tap('KeyQ'); step(0.05);
      ok('menzildeki hedefe Q ile saldırı', !crewT.alive && m2.bodies.length === 1);
      ok('saldırı sonrası 25 sn bekleme', Math.abs(q.killCd - SS.C.KILL_COOLDOWN) < 0.2 && $('btnKill').querySelector('.cd').textContent === '25', q.killCd.toFixed(2));
      const v0 = M.vents[0]; q.x = v0.x + 20; q.y = v0.y; step(0.05);
      ok('havalandırma etkileşimi görünür', G.ctx.use && G.ctx.use.kind === 'vent');
      tap('KeyE'); step(0.05);
      ok('havalandırmaya girildi, çıkış butonları', q.inVent === 0 && visible('ventBar') && $('ventBar').querySelectorAll('button').length === v0.links.length + 1);
      step(0.6); tap('Digit1'); step(0.05);
      ok('bağlı havalandırmaya geçiş (1)', q.inVent === v0.links[0]);
      step(0.6); tap('KeyE'); step(0.05);
      ok('havalandırmadan çıkış (E)', q.inVent === null && !visible('ventBar'));
      m2.sab.cooldown = 0; m2.sab.doorCooldown = 0;
      tap('KeyF'); step(0.05);
      ok('sabotaj paneli açılır (F)', visible('sabModal') && $('sabBody').querySelectorAll('.sab-btn').length === 10);
      const lightsBtn = Array.from($('sabBody').querySelectorAll('.sab-btn')).find(b => /Işıkları/.test(b.textContent));
      lightsBtn.click(); step(0.05);
      ok('sabotaj paneli: ışıklar başlatıldı', m2.sab.active === 'lights' && !visible('sabModal'));
      tap('KeyF'); step(0.05);
      const oxyBtn = Array.from($('sabBody').querySelectorAll('.sab-btn')).find(b => /Oksijen/.test(b.textContent));
      ok('aktif sabotajda ikinci ana sabotaj pasif', oxyBtn.classList.contains('off') && /aktif/.test(oxyBtn.textContent), oxyBtn.textContent);
      const doorBtn = Array.from($('sabBody').querySelectorAll('.sab-btn.door'))[6];
      doorBtn.click(); step(0.05);
      ok('kapı sabotajı paneli', m2.sab.doors && m2.sab.doors.room === 6, JSON.stringify(m2.sab.doors));
      tap('Escape'); step(0.05);

      // 9) Oyuncu elenir: hayalet (mürettebat)
      G.toMenu(); step(0.05);
      startAs('crew'); quiet();
      const g = G.player(), m3 = G.match;
      const k3 = m3.chars.find(c => c.role === 'impostor');
      k3.killCd = 0; k3.x = g.x + 40; k3.y = g.y;
      G.kill(k3, g); step(0.1);
      ok('oyuncu elendi -> hayalet bilgisi', !g.alive && visible('ghostBanner') && G.state === 'PLAYING', $('ghostBanner').textContent);
      const top = M.roomById.merkez.py;
      g.x = M.roomById.merkez.cx; g.y = top + 30;
      key('KeyW'); step(1); key('KeyW', 'keyup');
      ok('hayalet duvardan geçer', g.y < top - 20, g.y.toFixed(0));
      ok('hayalet rapor edemez / toplantı çağıramaz', !G.ctx.report && !G.canEmergency(g).ok);
      const st0 = M.stations[g.tasks[0].station]; g.x = st0.bx; g.y = st0.by; step(0.05);
      tap('KeyE'); step(0.05);
      ok('hayalet görev açabilir', G.state === 'TASK');
      solve(st0.type); step(1.2);
      ok('hayalet görevi ilerlemeye sayılır', g.tasks[0].done && m3.tasksDone >= 1);
      m3.emergencyCooldown = 0;
      const alive = m3.chars.find(c => c.alive && c.role === 'crew');
      G.callEmergency(alive); step(0.1);
      ok('hayalet toplantıda oy veremez', G.state === 'MEETING_DISCUSSION' && /Hayaletler/.test($('meetActions').textContent));
      SS.Meeting.skipDiscussion(); step(SS.C.VOTE_TIME + SS.C.RESULT_TIME + 1);
      ok('hayalet varken toplantı kilitlenmez', G.state === 'PLAYING' || G.state === 'GAME_OVER', G.state);

      // 10) Duraklatma (odak kaybı) ve devam
      if (G.state === 'PLAYING') {
        const t0 = m3.time;
        window.dispatchEvent(new Event('blur')); step(0.5);
        ok('odak kaybında duraklatma ekranı', G.state === 'PAUSED' && visible('pause') && /arka plan/.test($('pauseInfo').textContent));
        ok('duraklatmada süre ilerlemez', m3.time === t0);
        click('btnResume'); step(0.1);
        ok('Devam Et', G.state === 'PLAYING' && !visible('pause'));
      }

      // 11) Maç sonu + Tekrar Oyna x3
      for (let i = 0; i < 3; i++) {
        G.endGame(i % 2 ? 'impostor' : 'crew', 'test'); step(0.05);
        const before = G.match.id;
        ok('sonuç ekranı ' + (i + 1), visible('gameOver') && $('overRoles').children.length === 8 && /\//.test($('overTasks').textContent));
        G.endGame('crew', 'ikinci sonuç'); step(0.05);
        ok('ikinci sonuç oluşmaz ' + (i + 1), $('overReason').textContent === 'test');
        click('btnAgain'); step(0.1);
        ok('Tekrar Oyna ' + (i + 1), G.state === 'ROLE_REVEAL' && G.match.id === before + 1 && G.match.tasksDone === 0 && SS.Path.queue.length === 0);
        click('btnRevealGo'); step(2);
      }
      G.endGame('crew', 'test'); step(0.05);
      click('btnOverMenu'); step(0.05);
      ok('Ana Menü butonu', G.state === 'MENU' && visible('menu') && !visible('gameOver'));
    } catch (e) {
      results.push({ test: 'İSTİSNA', ok: false, info: e.stack });
    }
    window.removeEventListener('error', onErr);
    ok('yakalanmamış JS hatası yok', errs.length === 0, errs.join(' | '));
    const failed = results.filter(r => !r.ok);
    return { total: results.length, failed: failed.length, failures: failed, all: results.map(r => (r.ok ? '✓ ' : '✗ ') + r.test + (r.info ? ' [' + r.info.slice(0, 80) + ']' : '')) };
  };
})();
