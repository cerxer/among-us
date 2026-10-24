// Ekranlar: menü, nasıl oynanır, rol, toplantı, atılma, duraklatma, maç sonu, geliştirici modu.
// Ekran görünürlüğü her kare oyun durumundan türetilir; görünmez katmanlar girişi engellemez.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const EJECT_AT = 2.6; // sonuç ekranında oy dağılımından sonra atılma animasyonu

  const S = (SS.Screens = {
    howtoOpen: false, pick: null, selected: null, focusPause: false, cache: {}, cards: {}, starsE: [],

    init() {
      const G = SS.Game;
      S.el = {
        menu: $('menu'), howto: $('howto'), reveal: $('roleReveal'), meeting: $('meeting'), eject: $('eject'),
        pause: $('pause'), over: $('gameOver'), roster: $('roster'), chat: $('chat'), actions: $('meetActions'),
      };
      const click = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); SS.Audio.unlock(); SS.Audio.click(); fn(); e.currentTarget.blur(); });
      click('btnStart', () => S.start());
      click('btnHowto', () => S.openHowto());
      click('btnHowtoClose', () => S.closeHowto());
      click('btnMute', () => S.toggleMute());
      click('btnPauseMute', () => S.toggleMute());
      click('btnPauseHowto', () => S.openHowto());
      click('btnResume', () => S.resume());
      click('btnPauseMenu', () => { S.howtoOpen = false; G.toMenu(); });
      click('btnAgain', () => S.start());
      click('btnOverMenu', () => G.toMenu());
      click('btnRevealGo', () => { if (G.state === 'ROLE_REVEAL') G.setState('PLAYING'); });
      document.querySelectorAll('#rolePref button').forEach(b => b.addEventListener('click', () => {
        SS.Audio.click();
        G.settings.rolePref = b.dataset.role;
        try { localStorage.setItem('ss_role', b.dataset.role); } catch (e) { /* önemli değil */ }
        S.syncRolePref();
      }));
      try { const r = localStorage.getItem('ss_role'); if (r === 'crew' || r === 'impostor' || r === 'random') G.settings.rolePref = r; } catch (e) { /* önemli değil */ }
      S.syncRolePref();
      S.syncMute();

      SS.events.on('state', e => {
        if (e.to === 'ROLE_REVEAL') S.showReveal();
        if (e.to === 'PAUSED') $('pauseInfo').textContent = S.focusPause ? 'Sekme arka plana alındığı için maç duraklatıldı.' : 'Maç süresi ve bekleme süreleri durdu.';
        if (e.to !== 'PAUSED') S.focusPause = false;
        S.pick = null;
        if (e.to === 'MEETING_VOTE') S.selected = null;
      });
      SS.events.on('meetingStart', mt => S.buildMeeting(mt));
      SS.events.on('meetingMessage', msg => S.addMsg(msg));
      SS.events.on('meetingVote', () => S.sysMsg('Tartışma bitti. Oylama başladı!'));
      SS.events.on('meetingResult', mt => S.showTally(mt));
      SS.events.on('gameOver', e => S.showGameOver(e));
      S.ejectCanvas = $('ejectCanvas');
      for (let i = 0; i < 160; i++) S.starsE.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2 });
      if (/[?&]dev=1/.test(location.search)) S.initDev();
    },

    start() {
      S.howtoOpen = false;
      SS.HUD.closePanels();
      SS.Game.startGame({ rolePref: SS.Game.settings.rolePref });
    },
    resume() { S.howtoOpen = false; SS.Game.resume(); },
    openHowto() { S.howtoOpen = true; },
    closeHowto() { S.howtoOpen = false; },
    toggleMute() { SS.Audio.setMuted(!SS.Audio.muted); S.syncMute(); },
    syncMute() { const t = 'Ses: ' + (SS.Audio.muted ? 'Kapalı' : 'Açık'); $('btnMute').textContent = t; $('btnPauseMute').textContent = t; },
    syncRolePref() {
      document.querySelectorAll('#rolePref button').forEach(b => {
        const on = b.dataset.role === SS.Game.settings.rolePref;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    },

    vis(el, on) { if (el._on !== on) { el._on = on; el.classList.toggle('hidden', !on); } },

    frame(dt) {
      const G = SS.Game, st = G.state, prev = G.prevState, m = G.match;
      const paused = st === 'PAUSED';
      const under = paused ? prev : st;
      const mt = m && (m.meeting || m.lastMeeting);
      const inMeeting = under === 'MEETING_DISCUSSION' || under === 'MEETING_VOTE' || (under === 'MEETING_RESULT' && mt && mt.resultT < EJECT_AT);
      const inEject = under === 'MEETING_RESULT' && mt && mt.resultT >= EJECT_AT;
      S.vis(S.el.menu, st === 'MENU');
      S.vis(S.el.howto, S.howtoOpen && (st === 'MENU' || st === 'PAUSED'));
      S.vis(S.el.reveal, under === 'ROLE_REVEAL');
      S.vis(S.el.meeting, !!inMeeting);
      S.vis(S.el.eject, !!inEject);
      S.vis(S.el.pause, paused && !S.howtoOpen);
      S.vis(S.el.over, st === 'GAME_OVER');
      if (st === 'MENU') S.drawMenuArt();
      if (inMeeting && m.meeting) S.updateMeeting(m, m.meeting);
      if (inEject) S.drawEject(m, mt, dt, !paused);
    },

    // ------------------------------------------------------------ menü & rol ekranı
    drawMenuArt() {
      const c = $('menuArt'), g = c.getContext('2d'), t = performance.now() / 1000;
      g.clearRect(0, 0, c.width, c.height);
      SS.CHARACTERS.forEach((d, i) => {
        const x = 50 + i * 77, y = 160 + Math.sin(t * 2 + i) * 6;
        SS.Sprites.robot(g, x, y, { def: d, facing: i < 4 ? 1 : -1, t: t + i, moving: true, phase: t * 6 + i, scale: 1.25 });
      });
    },

    showReveal() {
      const G = SS.Game, m = G.match, p = G.player();
      const role = $('revealRole');
      role.textContent = p.role === 'crew' ? 'MÜRETTEBAT' : 'HAİN';
      role.className = p.role;
      const mates = m.chars.filter(c => c.role === 'impostor' && c !== p);
      $('revealDesc').innerHTML = p.role === 'crew'
        ? 'Karakterin: <b style="color:' + p.def.color + '">' + esc(p.name) + '</b> (' + esc(p.def.accName) + '). Aranızda <b class="c-imp">2 hain</b> var. Görevlerini tamamla ve hainleri bul.'
        : 'Karakterin: <b style="color:' + p.def.color + '">' + esc(p.name) + '</b>. Takım arkadaşın: <b class="c-imp">' + mates.map(c => esc(c.name)).join(', ') + '</b>. Fark edilmeden mürettebatı devre dışı bırak.';
      const c = $('revealArt'), g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const show = p.role === 'crew' ? m.chars.filter(o => o !== p).slice(0, 4) : mates;
      const gl = g.createRadialGradient(c.width / 2, 120, 10, c.width / 2, 120, 200);
      gl.addColorStop(0, p.role === 'crew' ? 'rgba(95,184,255,0.45)' : 'rgba(255,93,110,0.5)');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl; g.fillRect(0, 0, c.width, c.height);
      show.forEach((o, i) => {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
        g.globalAlpha = p.role === 'crew' ? 0.55 : 1;
        SS.Sprites.robot(g, c.width / 2 + side * (95 * k), 170, { def: o.def, facing: -side, t: 0, scale: 1.4 - k * 0.15 });
      });
      g.globalAlpha = 1;
      SS.Sprites.robot(g, c.width / 2, 178, { def: p.def, facing: 1, t: 0, scale: 2 });
    },

    // ------------------------------------------------------------ toplantı
    buildMeeting(mt) {
      const G = SS.Game, m = G.match, p = G.player();
      const caller = m.chars[mt.callerId];
      if (mt.type === 'report') {
        const v = m.chars[mt.victimId];
        $('meetTitle').textContent = 'CESET BULUNDU!';
        $('meetSub').textContent = caller.name + ', ' + v.def.gen + ' gövdesini buldu · Konum: ' + SS.Map.roomInfo(mt.bodyRoom).name;
      } else {
        $('meetTitle').textContent = 'ACİL TOPLANTI';
        $('meetSub').textContent = caller.name + ' acil toplantı çağırdı · Konum: ' + SS.Map.roomInfo(mt.callRoom).name;
      }
      S.el.chat.innerHTML = '';
      S.el.roster.innerHTML = '';
      S.cards = {};
      S.cache = {};
      S.pick = null; S.selected = null;
      m.chars.forEach(c => {
        const card = document.createElement('div');
        card.className = 'card' + (c === p ? ' me' : '') + (c.alive ? '' : ' dead');
        const cv = document.createElement('canvas'); cv.width = 108; cv.height = 108;
        SS.Sprites.avatar(cv, c.def, { dead: !c.alive });
        const info = document.createElement('div');
        let sub = c.alive ? (c === p ? 'Sen' : '') : (c.ejected ? 'Elendi' : 'Devre dışı');
        if (c.id === mt.callerId) sub = mt.type === 'report' ? 'Rapor etti' : 'Toplantıyı çağırdı';
        const mate = p.role === 'impostor' && c.role === 'impostor' && c !== p;
        info.innerHTML = '<div class="nm" style="color:' + c.def.color + '">' + esc(c.name) + '</div><div class="sub">' + esc(sub) + '</div>' + (mate ? '<div class="mate">HAİN</div>' : '') + '<div class="chips"></div>';
        card.appendChild(cv); card.appendChild(info);
        card.addEventListener('click', () => S.cardClick(c.id));
        S.el.roster.appendChild(card);
        S.cards[c.id] = card;
      });
      S.sysMsg(mt.type === 'report' ? 'Tartışma başladı. Kim şüpheli?' : 'Acil toplantı! Tartışma başladı.');
    },

    sysMsg(text) {
      const d = document.createElement('div');
      d.className = 'msg sys';
      d.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
      S.el.chat.appendChild(d);
      S.el.chat.scrollTop = S.el.chat.scrollHeight;
    },
    addMsg(msg) {
      const m = SS.Game.match, c = m.chars[msg.speakerId];
      const d = document.createElement('div');
      d.className = 'msg' + (c.isPlayer ? ' me' : '');
      d.innerHTML = '<span class="dot" style="background:' + c.def.color + '"></span><div class="bubble"><span class="who" style="color:' + c.def.color + '">' + esc(c.name) + '</span>' + esc(msg.text) + '</div>';
      S.el.chat.appendChild(d);
      S.el.chat.scrollTop = S.el.chat.scrollHeight;
    },

    cardClick(id) {
      const G = SS.Game, m = G.match, p = G.player(), mt = m && m.meeting;
      if (!mt || !p.alive) return;
      const c = m.chars[id];
      if (G.state === 'MEETING_DISCUSSION' && S.pick) {
        if (!c.alive || c === p) return;
        SS.Audio.click();
        SS.Meeting.playerSay(S.pick, id);
        S.pick = null;
      } else if (G.state === 'MEETING_VOTE' && !mt.votes.hasOwnProperty(p.id)) {
        if (!c.alive || c === p) return;
        SS.Audio.click();
        S.selected = S.selected === id ? null : id;
      }
    },

    updateMeeting(m, mt) {
      const G = SS.Game, p = G.player(), st = G.state === 'PAUSED' ? G.prevState : G.state;
      const phaseName = st === 'MEETING_DISCUSSION' ? 'Tartışma' : st === 'MEETING_VOTE' ? 'Oylama' : 'Sonuç';
      const tm = st === 'MEETING_RESULT' ? '' : Math.max(0, Math.ceil(mt.timer)) + '';
      if (S.cache.phase !== phaseName) { S.cache.phase = phaseName; $('meetPhase').textContent = phaseName; }
      if (S.cache.tm !== tm) { S.cache.tm = tm; $('meetTime').textContent = tm; }
      m.chars.forEach(c => {
        const card = S.cards[c.id];
        if (!card) return;
        const pickable = c.alive && c !== p && p.alive && ((st === 'MEETING_DISCUSSION' && S.pick) || (st === 'MEETING_VOTE' && !mt.votes.hasOwnProperty(p.id)));
        const voted = st === 'MEETING_VOTE' && mt.votes.hasOwnProperty(c.id);
        const key = c.id + ':' + pickable + voted + (S.selected === c.id) + c.alive;
        if (card._k === key) return;
        card._k = key;
        card.classList.toggle('pickable', !!pickable);
        card.classList.toggle('selected', S.selected === c.id);
        card.classList.toggle('dead', !c.alive);
        let badge = card.querySelector('.voted');
        if (voted && !badge) { badge = document.createElement('span'); badge.className = 'voted'; badge.textContent = 'OY VERDİ'; card.appendChild(badge); }
        if (!voted && badge && st !== 'MEETING_RESULT') badge.remove();
      });
      const sig = [st, S.pick, S.selected, JSON.stringify(mt.playerActs), mt.votes.hasOwnProperty(p.id) ? mt.votes[p.id] : '-', p.alive].join('|');
      if (S.cache.act === sig) return;
      S.cache.act = sig;
      const A = S.el.actions;
      A.innerHTML = '';
      const btn = (label, fn, cls, used) => {
        const b = document.createElement('button');
        b.className = 'btn ' + (cls || '') + (used ? ' used' : '');
        b.textContent = label;
        b.addEventListener('click', () => { SS.Audio.click(); fn(); });
        A.appendChild(b);
        return b;
      };
      const note = txt => { const n = document.createElement('div'); n.className = 'note'; n.textContent = txt; A.appendChild(n); };
      if (st === 'MEETING_DISCUSSION') {
        if (!p.alive) { note('Hayaletler konuşamaz ve oy kullanamaz.'); btn('Oylamaya geç ▶', () => SS.Meeting.skipDiscussion(), 'primary'); return; }
        if (S.pick) {
          note(S.pick === 'accuse' ? 'Suçlamak istediğin karakteri seç.' : 'Savunmak istediğin karakteri seç.');
          btn('İptal', () => { S.pick = null; });
          return;
        }
        const acts = mt.playerActs;
        btn('Bir karakteri suçla', () => { if (!acts.accuse) S.pick = 'accuse'; }, '', acts.accuse);
        btn('Bir karakteri savun', () => { if (!acts.defend) S.pick = 'defend'; }, '', acts.defend);
        btn('Bulunduğum odayı söyle', () => SS.Meeting.playerSay('room'), '', acts.room);
        btn('Yeterli kanıt yok', () => SS.Meeting.playerSay('noevidence'), '', acts.noevidence);
        btn('Oylamaya geç ▶', () => SS.Meeting.skipDiscussion(), 'primary');
      } else if (st === 'MEETING_VOTE') {
        if (!p.alive) { note('Hayaletler oy kullanamaz. Oylama sürüyor…'); return; }
        if (mt.votes.hasOwnProperty(p.id)) {
          const v = mt.votes[p.id];
          note('Oyun verildi: ' + (v === 'skip' ? 'Pas' : m.chars[v].name) + '. Diğerleri bekleniyor…');
          return;
        }
        note(S.selected !== null ? m.chars[S.selected].name + ' seçildi. Onaylıyor musun?' : 'Oy vermek için bir karaktere dokun ya da pas geç.');
        if (S.selected !== null) btn('Oy ver: ' + m.chars[S.selected].name, () => { SS.Meeting.castVote(p.id, S.selected); S.selected = null; }, 'primary');
        btn('Pas geç', () => { SS.Meeting.castVote(p.id, 'skip'); S.selected = null; });
      } else {
        note(S.resultText(m, mt).title);
      }
    },

    resultText(m, mt) {
      const r = mt.tally;
      if (!r) return { title: '', sub: '' };
      if (r.ejected === null) return { title: 'Kimse elenmedi.', sub: r.reason === 'tie' ? 'Oylar eşit çıktı.' : 'Pas oyları çoğunluktaydı.' };
      const c = m.chars[r.ejected];
      const left = m.chars.filter(x => x.alive && x.role === 'impostor').length;
      return {
        title: c.name + ' elendi.',
        sub: (c.role === 'impostor' ? c.name + ' bir HAİNDİ.' : c.name + ' hain değildi.') + ' Kalan hain: ' + left,
      };
    },

    showTally(mt) {
      const m = SS.Game.match;
      Object.keys(S.cards).forEach(id => {
        const card = S.cards[id];
        const b = card.querySelector('.voted'); if (b) b.remove();
        card.classList.remove('pickable', 'selected');
        const chips = card.querySelector('.chips');
        chips.innerHTML = '';
        Object.keys(mt.votes).forEach(v => {
          if (String(mt.votes[v]) !== String(id)) return;
          const s = document.createElement('span'); s.className = 'chip'; s.style.background = m.chars[v].def.color; s.title = m.chars[v].name;
          chips.appendChild(s);
        });
      });
      const skippers = Object.keys(mt.votes).filter(v => mt.votes[v] === 'skip');
      S.sysMsg('Pas: ' + skippers.length + (skippers.length ? ' (' + skippers.map(v => m.chars[v].name + (mt.autoSkip[v] ? '*' : '')).join(', ') + ')' : '') + (Object.keys(mt.autoSkip).length ? ' · *süre bitti' : ''));
      const res = S.resultText(m, mt);
      S.sysMsg(res.title + (mt.tally.ejected === null ? ' ' + res.sub : ''));
      S.ejectStart = performance.now();
    },

    drawEject(m, mt, dt, run) {
      const c = S.ejectCanvas, g = c.getContext('2d');
      const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#04050f'; g.fillRect(0, 0, w, h);
      const k = U.clamp((mt.resultT - EJECT_AT) / (SS.C.RESULT_TIME - EJECT_AT), 0, 1);
      S.starsE.forEach(s => {
        if (run) { s.x -= s.z * dt * 0.25; if (s.x < 0) { s.x = 1; s.y = Math.random(); } }
        g.fillStyle = 'rgba(200,210,255,' + s.z + ')';
        g.fillRect(s.x * w, s.y * h, s.z * 3, s.z * 2);
      });
      const res = S.resultText(m, mt);
      if (mt.tally && mt.tally.ejected !== null) {
        const ej = m.chars[mt.tally.ejected];
        g.save();
        g.translate(-80 + k * (w + 160), h * 0.42);
        g.rotate(k * Math.PI * 3);
        SS.Sprites.robot(g, 0, 30, { def: ej.def, facing: 1, t: 0, scale: 1.8 });
        g.restore();
      }
      const txt = esc(k > 0.15 ? res.title : '') + (k > 0.45 ? '<small>' + esc(res.sub) + '</small>' : '');
      if (S.cache.ej !== txt) { S.cache.ej = txt; $('ejectText').innerHTML = txt; }
    },

    // ------------------------------------------------------------ maç sonu
    showGameOver(e) {
      const m = e.match, p = m.chars[0];
      const title = $('overTitle');
      title.textContent = e.winner === 'crew' ? 'MÜRETTEBAT KAZANDI!' : 'HAİNLER KAZANDI!';
      title.className = e.winner;
      $('overReason').textContent = e.reason;
      const win = (e.winner === 'crew') === (p.role === 'crew');
      $('overYou').innerHTML = 'Rolün: <span class="' + (p.role === 'crew' ? 'c-crew' : 'c-imp') + '">' + (p.role === 'crew' ? 'Mürettebat' : 'Hain') + '</span> — ' + (win ? 'Kazandın!' : 'Kaybettin.');
      const box = $('overRoles');
      box.innerHTML = '';
      m.chars.forEach(c => {
        const d = document.createElement('div');
        d.className = 'rc' + (c.role === 'impostor' ? ' imp' : '');
        const cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
        SS.Sprites.avatar(cv, c.def, { dead: !c.alive && !c.ejected });
        d.appendChild(cv);
        const info = document.createElement('div');
        info.innerHTML = '<b style="color:' + c.def.color + '">' + esc(c.name) + (c.isPlayer ? ' (Sen)' : '') + '</b><span>' + (c.role === 'impostor' ? 'Hain' : 'Mürettebat') + '</span><em>' + (c.alive ? 'Hayatta' : c.ejected ? 'Elendi' : 'Devre dışı') + '</em>';
        d.appendChild(info);
        box.appendChild(d);
      });
      $('overTasks').textContent = m.tasksDone + ' / ' + m.tasksTotal;
      $('overTime').textContent = U.fmtTime(m.endTime);
    },

    // ------------------------------------------------------------ geliştirici modu (?dev=1)
    initDev() {
      const G = SS.Game, panel = $('devPanel');
      panel.classList.remove('hidden');
      const add = (label, fn) => {
        const b = document.createElement('button'); b.textContent = label;
        b.addEventListener('click', e => { e.preventDefault(); try { fn(); } catch (err) { console.error(err); } b.blur(); });
        panel.appendChild(b);
      };
      panel.innerHTML = '<b>Geliştirici modu</b>';
      const m = () => G.match;
      add('Görevlerimi bitir', () => { const p = G.player(); p.tasks.forEach((t, i) => G.completeTask(p, i)); });
      add('+%25 ilerleme', () => {
        const crew = m().chars.filter(c => c.role === 'crew' && !c.isPlayer);
        let n = Math.ceil(m().tasksTotal / 4);
        crew.forEach(c => c.tasks.forEach((t, i) => { if (n > 0 && !t.done) { G.completeTask(c, i); n--; } }));
      });
      add('Işık sabotajı', () => { m().sab.cooldown = 0; SS.Sabotage.start(m(), 'lights', null, null); });
      add('Oksijen sabotajı', () => { m().sab.cooldown = 0; SS.Sabotage.start(m(), 'oxygen', null, null); });
      add('Kapı: Merkez', () => { m().sab.doorCooldown = 0; SS.Sabotage.start(m(), 'doors', 0, null); });
      add('Saldırı bekleme 0', () => { m().chars.forEach(c => { if (c.role === 'impostor') c.killCd = 0; }); });
      add('Acil toplantı', () => { const p = G.player(); m().emergencyCooldown = 0; p.emergencyUsed = false; const b = SS.Map.button; p.x = b.x; p.y = b.y + 110; G.callEmergency(p); });
      ['wires', 'power', 'card', 'filter', 'memory', 'lights', 'keypad'].forEach(t => add('Mini: ' + t, () => G.openTask({ kind: 'dev', type: t })));
      add('Merkeze ışınlan', () => { const p = G.player(); const b = SS.Map.button; p.x = b.x; p.y = b.y + 120; });
      add('Rolleri konsola yaz', () => console.table(m().chars.map(c => ({ ad: c.name, rol: c.role, canlı: c.alive }))));
      add('Mürettebat kazansın', () => G.endGame('crew', 'Geliştirici modu'));
      add('Hainler kazansın', () => G.endGame('impostor', 'Geliştirici modu'));
    },
  });
})();
