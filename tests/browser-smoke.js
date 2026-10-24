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
      // 1) Menü -> karakter seçimi -> rol -> oyun
      if (G.state !== 'MENU') G.toMenu();
      step(0.1);
      ok('menü görünür', visible('menu'));
      const opts = $('charPick').querySelectorAll('.char-opt');
      ok('karakter seçicide ' + SS.CHARACTERS.length + ' robot', opts.length === SS.CHARACTERS.length);
      const pickKey = SS.CHARACTERS[5].key;
      opts[5].click(); step(0.05);
      ok('seçilen robot vurgulanır ve adı yazılır', opts[5].classList.contains('on') && $('charPick').querySelectorAll('.on').length === 1 && $('charName').textContent.indexOf(SS.CHARACTERS[5].name) === 0, $('charName').textContent);
      let stored = null; try { stored = localStorage.getItem('ss_char'); } catch (e) { /* yok */ }
      ok('seçim hatırlanır', stored === pickKey, stored);
      ok('Oyuna Başla maçı başlatır (tek tık)', startAs('crew'), G.state);
      ok('oyuncu seçtiği karakterle oynar', G.player().def.key === pickKey, G.player().def.key);
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
      ok(SS.CHARACTERS.length + ' karakter kartı, ölü pasif', $('roster').children.length === SS.CHARACTERS.length && $('roster').querySelectorAll('.card.dead').length >= 1);
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

      // 8b) Mühendis rolü
      G.toMenu(); step(0.05);
      ok('mühendis tercihi menüde var', !!document.querySelector('#rolePref [data-role="engineer"]'));
      ok('mühendis olarak başlar', startAs('engineer') && G.player().sub === 'engineer' && /MÜHENDİS/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const e = G.player(), me = G.match;
      ok('görev listesinde mühendis rozeti', /MÜHENDİS/.test($('roleBadge').textContent) && !visible('btnKill') && !visible('btnSab'));
      const ve = M.vents[1]; e.x = ve.x + 20; e.y = ve.y; step(0.05);
      ok('başlangıç beklemesinde havalandırma pasif + neden', $('btnUse').classList.contains('off') && /bekleme/i.test($('btnUse').textContent), $('btnUse').querySelector('.why').textContent);
      e.ventUseCd = 0; step(0.05);
      ok('mühendis havalandırma etkileşimi', G.ctx.use && G.ctx.use.kind === 'vent' && !$('btnUse').classList.contains('off'));
      tap('KeyE'); step(0.05);
      ok('mühendis havalandırmaya girer, süre sayacı görünür', e.inVent === 1 && !!$('ventBar').querySelector('.vent-timer'), $('ventBar').textContent);
      step(0.6); tap('Digit1'); step(0.05);
      ok('mühendis bağlı çıkışa geçer', e.inVent === ve.links[0]);
      step(SS.C.ENGINEER_VENT_MAX);
      ok('10 sn dolunca otomatik çıkış', e.inVent === null && !visible('ventBar'));
      ok('çıkıştan sonra bekleme gösterilir', /Havalandırma bekleme/.test($('killInfo').textContent), $('killInfo').textContent);
      me.emergencyCooldown = 0; e.x = M.button.x; e.y = M.button.y + 110; step(0.05);
      tap('KeyE'); step(0.1);
      ok('mühendis acil toplantı çağırır', G.state === 'MEETING_DISCUSSION');
      const claimBtn = Array.from($('meetActions').querySelectorAll('button')).find(b => /Mühendis olduğumu/.test(b.textContent));
      ok('toplantıda "Mühendis olduğumu söyle" seçeneği', !!claimBtn);
      if (claimBtn) { claimBtn.click(); step(0.05); }
      ok('mühendis iddiası sohbete düşer', /Ben mühendisim/.test($('chat').textContent));
      SS.Meeting.skipDiscussion(); step(SS.C.VOTE_TIME + SS.C.RESULT_TIME + 1);
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol Mühendis', /Mühendis/.test($('overRoles').textContent));

      // 8c) Doktor rolü
      G.toMenu(); step(0.05);
      ok('doktor tercihi menüde var', !!document.querySelector('#rolePref [data-role="doctor"]'));
      ok('doktor olarak başlar', startAs('doctor') && G.player().sub === 'doctor' && /DOKTOR/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const d = G.player(), md = G.match;
      ok('Yaşam butonu görünür, Saldır/Sabotaj gizli', visible('btnVitals') && !visible('btnKill') && !visible('btnSab') && /DOKTOR/.test($('roleBadge').textContent));
      const dv = md.chars.find(c => c.role === 'crew' && !c.isPlayer), di = md.chars.find(c => c.role === 'impostor');
      dv.x = M.roomById.depo.cx; dv.y = M.roomById.depo.cy; di.x = dv.x + 30; di.y = dv.y; di.killCd = 0; G.kill(di, dv);
      tap('KeyV'); step(0.1);
      ok('V ile yaşam belirtileri açılır', visible('vitalsModal') && d.vitalsOpen && $('vitalsGrid').children.length === SS.CHARACTERS.length);
      ok('ölen karakter ÖLDÜ görünür', $('vitalsGrid').children[dv.id].classList.contains('dead') && /ÖLDÜ/.test($('vitalsGrid').children[dv.id].textContent));
      ok('canlı karakter HAYATTA görünür', /HAYATTA/.test($('vitalsGrid').children[d.id].textContent));
      const dx = d.x; key('KeyD'); step(0.5); key('KeyD', 'keyup');
      ok('ekran açıkken yürünmez', d.x === dx);
      tap('Escape'); step(0.05);
      ok('Esc ekranı kapatır, pil korunur', !visible('vitalsModal') && !d.vitalsOpen && d.battery > 8 && d.battery < SS.C.VITALS_BATTERY, d.battery.toFixed(2));
      down($('btnVitals')); step(SS.C.VITALS_BATTERY);
      ok('pil bitince ekran kapanır ve şarj başlar', !visible('vitalsModal') && d.vitalsCd > 0 && $('btnVitals').classList.contains('off') && /Şarj/.test($('btnVitals').textContent), $('btnVitals').querySelector('.why').textContent);
      const ds = M.stations[d.tasks[0].station]; d.x = ds.bx; d.y = ds.by; step(0.05);
      tap('KeyE'); step(0.05); solve(ds.type); step(1.2);
      ok('görev pili şarj eder', d.vitalsCd === 0 && Math.abs(d.battery - SS.C.VITALS_TASK_RECHARGE) < 0.01 && !$('btnVitals').classList.contains('off'), d.battery);
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol Doktor', /Doktor/.test($('overRoles').textContent));

      // 8d) Dedektif rolü
      G.toMenu(); step(0.05);
      ok('dedektif tercihi menüde var', !!document.querySelector('#rolePref [data-role="detective"]'));
      ok('dedektif olarak başlar', startAs('detective') && G.player().sub === 'detective' && /DEDEKTİF/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const q2 = G.player(), mq = G.match;
      ok('Sorgula ve Dava butonları görünür', visible('btnInterrogate') && visible('btnCase') && !visible('btnKill'));
      const qi = mq.chars.find(c => c.role === 'impostor'), qv = mq.chars.find(c => c.role === 'crew' && !c.isPlayer);
      const qo = mq.chars.find(c => c.role === 'crew' && !c.isPlayer && c !== qv);
      qo.x = q2.x + 30; qo.y = q2.y; step(0.05);
      ok('dava yokken Sorgula pasif + neden', $('btnInterrogate').classList.contains('off') && /rapor/.test($('btnInterrogate').textContent), $('btnInterrogate').querySelector('.why').textContent);
      const dep2 = M.roomById.depo; qv.x = dep2.cx; qv.y = dep2.cy; qi.x = dep2.cx + 30; qi.y = dep2.cy; qi.killCd = 0;
      G.kill(qi, qv);
      q2.x = qv.x + 60; q2.y = qv.y; step(0.05);
      tap('KeyR'); step(0.1);
      ok('rapor dava açar', mq.cases.length === 1 && G.state === 'MEETING_DISCUSSION');
      SS.Meeting.skipDiscussion(); mq.chars.forEach(c => { if (c.alive) SS.Meeting.castVote(c.id, 'skip'); });
      for (let i = 0; i < 400 && G.state !== 'PLAYING' && G.state !== 'GAME_OVER'; i++) step(0.05);
      quiet();
      if (G.state === 'PLAYING') {
        qi.x = q2.x + 30; qi.y = q2.y; q2.intCd = 0; step(0.05);
        ok('temas edince Sorgula aktif ve hedef adı', !$('btnInterrogate').classList.contains('off') && $('btnInterrogate').textContent.indexOf(qi.name) >= 0, $('btnInterrogate').querySelector('.why').textContent);
        tap('KeyI'); step(0.05);
        ok('I ile sorgu: katil cesedin odasında çıkar', (mq.activeCase.asked[q2.id] || {})[qi.id] === mq.activeCase.room && /cesedin olduğu oda/.test($('toast').textContent), $('toast').textContent);
        tap('KeyN'); step(0.05);
        ok('N ile dava dosyası açılır', visible('caseModal') && /Depo/.test($('caseBody').textContent) && $('caseBody').querySelectorAll('.case-row.hot').length === 1);
        const susBtn = $('caseBody').querySelector('button.sus[data-id="' + qi.id + '"]');
        susBtn.click(); step(0.05);
        ok('şüpheli işaretlenir', !!mq.activeCase.suspects[qi.id] && $('caseBody').querySelector('button.sus.on'));
        tap('Escape'); step(0.05);
        ok('dava dosyası Esc ile kapanır', !visible('caseModal') && !G.uiBlock);
        q2.emergencyUsed = false; mq.emergencyCooldown = 0; q2.x = M.button.x; q2.y = M.button.y + 110; step(0.05);
        tap('KeyE'); step(0.1);
        ok('toplantıda kartta sorgu cevabı ve şüpheli işareti', G.state === 'MEETING_DISCUSSION' && /Sorgu: Depo/.test($('roster').children[qi.id].textContent) && /Şüpheli/.test($('roster').children[qi.id].textContent), $('roster').children[qi.id].textContent);
        const fb = Array.from($('meetActions').querySelectorAll('button')).find(b => /Sorgu sonuçlarını/.test(b.textContent));
        ok('"Sorgu sonuçlarını söyle" seçeneği', !!fb);
        if (fb) { fb.click(); step(0.05); }
        ok('bulgu sohbete düşer', $('chat').textContent.indexOf('Sorguladım: ' + qi.name) >= 0);
      }
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol Dedektif', /Dedektif/.test($('overRoles').textContent));

      // 8e) İz sürücü rolü
      G.toMenu(); step(0.05);
      ok('iz sürücü tercihi menüde var', !!document.querySelector('#rolePref [data-role="tracker"]'));
      ok('iz sürücü olarak başlar', startAs('tracker') && G.player().sub === 'tracker' && /İZ SÜRÜCÜ/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const tk = G.player(), mt2 = G.match;
      ok('İz sür butonu görünür', visible('btnTrack') && !visible('btnKill') && /İZ SÜRÜCÜ/.test($('roleBadge').textContent));
      const tt = mt2.chars.find(c => !c.isPlayer && c.role === 'crew');
      tt.x = tk.x + 50; tt.y = tk.y; step(0.05);
      ok('başlangıç beklemesinde pasif + neden', $('btnTrack').classList.contains('off') && /Bekleme/.test($('btnTrack').textContent), $('btnTrack').querySelector('.why').textContent);
      tk.trackCd = 0; step(0.05);
      ok('menzildeyken aktif ve hedef adı', !$('btnTrack').classList.contains('off') && $('btnTrack').textContent.indexOf(tt.name) >= 0);
      tap('KeyT'); step(0.05);
      ok('T ile iz cihazı takılır, buton Bırak olur', tk.track && tk.track.id === tt.id && /Bırak/.test($('btnTrack').textContent) && $('btnTrack').classList.contains('tracking'));
      tt.x = M.roomById.reaktor.cx; tt.y = M.roomById.reaktor.cy; step(SS.C.TRACK_DELAY + 0.1);
      ok('izlenen kişinin odası bilgi satırında', /Reaktör/.test($('killInfo').textContent), $('killInfo').textContent);
      tap('KeyM'); step(0.1);
      ok('harita açık ve iz konumu çiziliyor', visible('mapModal') && Math.abs(tk.track.x - tt.x) < 1);
      tap('Escape'); step(0.05);
      tap('KeyT'); step(0.05);
      ok('T ile iz bırakılır, bekleme başlar', !tk.track && tk.trackCd > 14 && $('btnTrack').classList.contains('off'));
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol İz Sürücü', /İz Sürücü/.test($('overRoles').textContent));

      // 8f) Fantom rolü (hain)
      G.toMenu(); step(0.05);
      ok('fantom tercihi menüde var', !!document.querySelector('#rolePref [data-role="phantom"]'));
      ok('fantom olarak başlar', startAs('phantom') && G.player().sub === 'phantom' && /FANTOM/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const fp = G.player(), mf = G.match;
      ok('Kaybol, Saldır, Sabotaj görünür; üç sütun', visible('btnVanish') && visible('btnKill') && visible('btnSab') && $('actions').classList.contains('three'));
      ok('başlangıç beklemesinde Kaybol pasif + neden', $('btnVanish').classList.contains('off') && /Bekleme/.test($('btnVanish').textContent), $('btnVanish').querySelector('.why').textContent);
      fp.vanishCd = 0; step(0.05);
      tap('KeyG'); step(SS.C.VANISH_FADE + 0.1);
      ok('G ile görünmez olur, buton Görün olur', fp.invis && !fp.fading && /Görün/.test($('btnVanish').textContent) && /Görünmezsin/.test($('killInfo').textContent), $('killInfo').textContent);
      const fv = mf.chars.find(c => c.role === 'crew'); fp.killCd = 0; fv.x = fp.x + 30; fv.y = fp.y; step(0.05);
      ok('görünmezken Saldır pasif + neden', $('btnKill').classList.contains('off') && /Görünmezken/.test($('btnKill').textContent), $('btnKill').querySelector('.why').textContent);
      tap('KeyQ'); step(0.05);
      ok('görünmezken Q saldırmaz', fv.alive);
      tap('KeyG'); step(SS.C.VANISH_FADE + 0.1);
      ok('G ile yeniden görünür, bekleme başlar', !fp.invis && !fp.fading && fp.vanishCd > 13);
      tap('KeyQ'); step(0.05);
      ok('görünürken saldırabilir', !fv.alive);
      G.endGame('impostor', 'test'); step(0.05);
      ok('sonuç ekranında rol Fantom', /Fantom/.test($('overRoles').textContent));

      // 8g) Şekil değiştirici (hain)
      G.toMenu(); step(0.05);
      ok('şekil değiştirici tercihi menüde var', !!document.querySelector('#rolePref [data-role="shapeshifter"]'));
      ok('şekil değiştirici olarak başlar', startAs('shapeshifter') && G.player().sub === 'shapeshifter' && /ŞEKİL DEĞİŞTİRİCİ/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const sp = G.player(), ms = G.match;
      ok('Dönüş butonu görünür; üç sütun', visible('btnShift') && $('actions').classList.contains('three'));
      ok('başlangıç beklemesinde Dönüş pasif + neden', $('btnShift').classList.contains('off') && /Bekleme/.test($('btnShift').textContent), $('btnShift').querySelector('.why').textContent);
      sp.shiftCd = 0; step(0.05);
      tap('KeyH'); step(0.05);
      const alivesOthers = ms.chars.filter(c => c !== sp && c.alive).length;
      ok('H ile kılık paneli açılır (yaşayan herkes)', visible('shiftModal') && $('shiftGrid').children.length === alivesOthers, $('shiftGrid').children.length + '/' + alivesOthers);
      const disg = ms.chars.find(c => c.role === 'crew');
      $('shiftGrid').querySelector('.shift-opt[data-id="' + disg.id + '"]').click(); step(SS.C.SHIFT_ANIM + 0.1);
      ok('seçilen kişinin kılığına girer, bilgi satırı', sp.disguise === disg.id && !visible('shiftModal') && $('killInfo').textContent.indexOf('Kılık: ' + disg.name) >= 0, $('killInfo').textContent);
      ok('buton Geri dön olur', /Geri dön/.test($('btnShift').textContent));
      const sv = ms.chars.find(c => c.role === 'crew' && c !== disg); sp.killCd = 0; sv.x = sp.x + 30; sv.y = sp.y; step(0.05);
      tap('KeyQ'); step(0.05);
      ok('kılıktayken saldırabilir', !sv.alive);
      tap('KeyH'); step(SS.C.SHIFT_ANIM + 0.1);
      ok('H ile kendi hâline döner, bekleme başlar', sp.disguise === null && sp.shiftCd > 13);
      G.endGame('impostor', 'test'); step(0.05);
      ok('sonuç ekranında rol Şekil Değiştirici', /Şekil Değiştirici/.test($('overRoles').textContent));

      // 8h) Yargıç
      G.toMenu(); step(0.05);
      ok('yargıç tercihi menüde var', !!document.querySelector('#rolePref [data-role="judge"]'));
      ok('yargıç olarak başlar', startAs('judge') && G.player().sub === 'judge' && /YARGIÇ/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const jp = G.player(), mj = G.match;
      ok('bilgi satırında yargılama hakkı', /Yargılama hakkı: 1/.test($('killInfo').textContent), $('killInfo').textContent);
      mj.emergencyCooldown = 0; jp.x = M.button.x; jp.y = M.button.y + 110; step(0.05);
      tap('KeyE'); step(0.1);
      const jbtn = () => Array.from($('meetActions').querySelectorAll('button'));
      const jb = jbtn().find(b => /Yargıla/.test(b.textContent));
      ok('toplantıda Yargıla seçeneği', G.state === 'MEETING_DISCUSSION' && !!jb);
      jb.click(); step(0.05);
      const jimp = mj.chars.find(c => c.role === 'impostor');
      $('roster').children[jimp.id].click(); step(0.05);
      const conf = jbtn().find(b => /Eminim/.test(b.textContent));
      ok('kart seçilince onay adımı ve uyarı', !!conf && /hainse yalnızca o elenir.*ikiniz de elenirsiniz/.test($('meetActions').textContent));
      conf.click(); step(0.05);
      ok('yargı anında oylama biter, atılma ekranı açılır', G.state === 'MEETING_RESULT' && visible('eject') && !visible('meeting'), G.state);
      step(2.6); // alt satır (hain mi) animasyonun ortasında belirir
      ok('hain uzaya atılır ve hain olduğu söylenir', /uzaya atıldı/.test($('ejectText').textContent) && $('ejectText').textContent.indexOf(jimp.name + ' bir HAİNDİ') >= 0, $('ejectText').textContent);
      ok('yargıç atılmaz', jp.alive && !jimp.alive && jimp.judged);
      step(SS.C.JUDGE_EJECT_SEG);
      ok('tek atılmadan sonra oyun sürer', G.state === 'PLAYING' || G.state === 'GAME_OVER', G.state);
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında Yargıç ve Yargılandı', /Yargıç/.test($('overRoles').textContent) && /Yargılandı/.test($('overRoles').textContent));
      // yanlış yargı
      G.toMenu(); step(0.05); startAs('judge'); quiet();
      const jp2 = G.player(), mj2 = G.match;
      mj2.emergencyCooldown = 0; jp2.x = M.button.x; jp2.y = M.button.y + 110; step(0.05);
      tap('KeyE'); step(0.1);
      SS.Meeting.skipDiscussion(); step(0.05); // oylama sırasında yargıla
      jbtn().find(b => /Yargıla/.test(b.textContent)).click(); step(0.05);
      const innocent = mj2.chars.find(c => c.role === 'crew' && !c.isPlayer);
      $('roster').children[innocent.id].click(); step(0.05);
      ok('onay uyarısı: ikiniz de elenirsiniz', /ikiniz de elenirsiniz/.test($('meetActions').textContent));
      jbtn().find(b => /Eminim/.test(b.textContent)).click(); step(0.05);
      ok('oylama sırasında yargı da oylamayı bitirir', G.state === 'MEETING_RESULT' && visible('eject'));
      step(2.6);
      ok('önce masum atılır ve hain olmadığı söylenir', $('ejectText').textContent.indexOf(innocent.name + ' uzaya atıldı') >= 0 && $('ejectText').textContent.indexOf(innocent.name + ' hain değildi') >= 0, $('ejectText').textContent);
      step(SS.C.JUDGE_EJECT_SEG);
      ok('sonra yargıç da atılır ve hain olmadığı söylenir', /Yanlış karar! Yargıç/.test($('ejectText').textContent) && $('ejectText').textContent.indexOf(jp2.name + ' hain değildi') >= 0, $('ejectText').textContent);
      ok('ikisi de elendi', !jp2.alive && !innocent.alive);
      step(SS.C.JUDGE_EJECT_SEG);
      ok('iki atılmadan sonra toplantı kapanır', G.state === 'PLAYING' || G.state === 'GAME_OVER', G.state);
      G.endGame('crew', 'test'); step(0.05);

      // 8i) Koruyucu melek
      G.toMenu(); step(0.05);
      ok('melek tercihi menüde var', !!document.querySelector('#rolePref [data-role="angel"]'));
      ok('melek olarak başlar', startAs('angel') && G.player().angel && /KORUYUCU MELEK/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const ap = G.player(), ma = G.match;
      ok('hayattayken Koru butonu yok', !visible('btnProtect') && /Öldüğünde koruyucu melek/.test($('taskItems').textContent));
      const ak = ma.chars.find(c => c.role === 'impostor'); ak.killCd = 0; ak.x = ap.x + 30; ak.y = ap.y; G.kill(ak, ap); step(0.1);
      ok('ölünce Koru butonu ve melek bilgisi', visible('btnProtect') && /Koruyucu meleksin/.test($('ghostBanner').textContent));
      ok('ilk beklemede Koru pasif + neden', $('btnProtect').classList.contains('off') && /Bekleme/.test($('btnProtect').textContent), $('btnProtect').querySelector('.why').textContent);
      step(SS.C.PROTECT_COOLDOWN_START + 0.2);
      const at = ma.chars.find(c => c.role === 'crew' && c.alive && !c.isPlayer);
      ma.chars.forEach(c => { if (c !== at && !c.isPlayer && c.alive) { c.x = M.roomById.oksijen.cx; c.y = M.roomById.oksijen.cy; } }); // en yakın tek kişi o olsun
      ap.x = at.x + 40; ap.y = at.y; step(0.05);
      ok('yaşayana yakınken Koru aktif ve hedef adı', !$('btnProtect').classList.contains('off') && $('btnProtect').textContent.indexOf(at.name) >= 0);
      tap('KeyP'); step(0.05);
      ok('P ile kalkan verilir, bekleme başlar', at.shieldT > 9 && ap.protectCd > 59 && /korunuyor/.test($('toast').textContent));
      ak.killCd = 0; ak.x = at.x + 30; ak.y = at.y;
      ok('kalkanlı kişiye saldırı başarısız', !G.kill(ak, at) && at.alive && ak.killCd === SS.C.PROTECT_KILL_RESET);
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol Koruyucu Melek', /Koruyucu Melek/.test($('overRoles').textContent));

      // 8j) Influencer
      G.toMenu(); step(0.05);
      ok('influencer tercihi menüde var', !!document.querySelector('#rolePref [data-role="influencer"]'));
      ok('influencer olarak başlar', startAs('influencer') && G.player().influencer && /INFLUENCER/.test($('revealRole').textContent), $('revealRole').textContent);
      quiet();
      const ip = G.player(), mi = G.match;
      ok('hayattayken Takip butonu ve panel yok', !visible('btnInfluence') && !visible('inflPanel') && /Öldüğünde influencer/.test($('taskItems').textContent));
      const ik = mi.chars.find(c => c.role === 'impostor'); ik.killCd = 0; ik.x = ip.x + 30; ik.y = ip.y; G.kill(ik, ip); step(0.1);
      ok('ölünce Takip butonu ve bilgi', visible('btnInfluence') && /Influencersın/.test($('ghostBanner').textContent));
      const it = mi.chars.find(c => c.role === 'crew' && c.alive && !c.isPlayer);
      mi.chars.forEach(c => { if (c !== it && !c.isPlayer && c.alive) { c.x = M.roomById.oksijen.cx; c.y = M.roomById.oksijen.cy; } });
      ip.x = it.x + 40; ip.y = it.y; step(0.05);
      ok('yakındaki kişi Takip butonunda yazar', !$('btnInfluence').classList.contains('off') && $('btnInfluence').textContent.indexOf(it.name) >= 0);
      tap('KeyO'); step(0.05);
      ok('O ile takip başlar, panel açılır, 6 resim', ip.inflFollow === it.id && visible('inflPanel') && document.querySelectorAll('#inflChoices .infl-ic').length === 6);
      step(SS.C.INFLUENCE_COOLDOWN_START + 0.2);
      const tiles = () => [...document.querySelectorAll('#inflChoices .infl-ic')];
      const pd = el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      tiles().slice(0, 4).forEach(pd); step(0.05);
      ok('en fazla 3 resim seçilir', SS.HUD.inflSel.length === 3 && document.querySelectorAll('#inflSlots .infl-ic').length === 3);
      const chosen = SS.HUD.inflSel.slice();
      pd($('inflSend')); step(0.05);
      ok('Gönder: hedefe mesaj gider, bekleme başlar', it.inbox && it.inbox.icons.join() === chosen.join() && ip.inflCd > 19 && /Mesaj gönderildi/.test($('toast').textContent));
      ok('yenileme beklemedeyken olmaz', !G.playerInflRefresh());
      tap('KeyO'); step(0.05);
      ok('O ile takip bırakılır, panel kapanır', ip.inflFollow === null && !visible('inflPanel'));
      G.endGame('crew', 'test'); step(0.05);
      ok('sonuç ekranında rol Influencer', /Influencer/.test($('overRoles').textContent));
      // Canlı oyuncuya gelen mesaj ekranda görünür
      G.toMenu(); step(0.05);
      startAs('crew'); quiet();
      const rp = G.player(), mr = G.match, ri = mr.chars.find(c => c.influencer && !c.isPlayer);
      ri.alive = false; ri.inflCd = 0; G.tickInfluence(ri, 0); G.follow(ri, rp);
      G.inflSend(ri, ri.inflChoices.slice(0, 2)); step(0.05);
      ok('mesaj alıcının ekranında açılır', visible('inflPop') && document.querySelectorAll('#inflPopIcons .infl-ic').length === 2);
      step(SS.C.INFLUENCE_SHOW + 0.2);
      ok('5 sn sonra kapanır', !visible('inflPop'));
      G.endGame('crew', 'test'); step(0.05);

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
        ok('sonuç ekranı ' + (i + 1), visible('gameOver') && $('overRoles').children.length === SS.CHARACTERS.length && /\//.test($('overTasks').textContent));
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
