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
      try { const r = localStorage.getItem('ss_role'); if (['crew', 'engineer', 'doctor', 'detective', 'tracker', 'judge', 'angel', 'influencer', 'impostor', 'phantom', 'shapeshifter', 'random'].indexOf(r) >= 0) G.settings.rolePref = r; } catch (e) { /* önemli değil */ }
      S.syncRolePref();
      S.syncMute();
      S.buildCharPick();

      SS.events.on('state', e => {
        if (e.to === 'ROLE_REVEAL') S.showReveal();
        if (e.to === 'PAUSED') $('pauseInfo').textContent = S.focusPause ? 'Sekme arka plana alındığı için maç duraklatıldı.' : 'Maç süresi ve bekleme süreleri durdu.';
        if (e.to !== 'PAUSED') S.focusPause = false;
        S.pick = null; S.judgeSel = null;
        if (e.to === 'MEETING_VOTE') S.selected = null;
      });
      SS.events.on('meetingStart', mt => S.buildMeeting(mt));
      SS.events.on('meetingMessage', msg => S.addMsg(msg));
      SS.events.on('meetingVote', () => S.sysMsg('Tartışma bitti. Oylama başladı!'));
      SS.events.on('judge', r => {
        S.sysMsg(r.guilty
          ? '⚖ Yargıç ' + r.judge.name + ', ' + r.target.def.acc + ' attı: ' + r.target.name + ' bir HAİNDİ ve elendi!'
          : '⚖ Yargıç ' + r.judge.name + ', ' + r.target.def.acc + ' attı ama ' + r.target.name + ' hain değildi. İkisi de elendi.');
        S.pick = null; S.judgeSel = null; S.cache.act = null;
      });
      SS.events.on('meetingResult', mt => S.showTally(mt));
      SS.events.on('gameOver', e => S.showGameOver(e));
      S.ejectCanvas = $('ejectCanvas');
      for (let i = 0; i < 160; i++) S.starsE.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2 });
      if (/[?&]dev=1/.test(location.search)) S.initDev();
    },

    start() {
      S.howtoOpen = false;
      SS.HUD.closePanels();
      SS.Game.startGame({ rolePref: SS.Game.settings.rolePref, charKey: SS.Game.settings.charKey });
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
      const ejAt = mt && mt.ejectAt !== undefined ? mt.ejectAt : EJECT_AT;
      const inMeeting = under === 'MEETING_DISCUSSION' || under === 'MEETING_VOTE' || (under === 'MEETING_RESULT' && mt && mt.resultT < ejAt);
      const inEject = under === 'MEETING_RESULT' && mt && mt.resultT >= ejAt;
      S.vis(S.el.menu, st === 'MENU');
      S.vis(S.el.howto, S.howtoOpen && (st === 'MENU' || st === 'PAUSED'));
      S.vis(S.el.reveal, under === 'ROLE_REVEAL');
      S.vis(S.el.meeting, !!inMeeting);
      S.vis(S.el.eject, !!inEject);
      S.vis(S.el.pause, paused && !S.howtoOpen);
      S.vis(S.el.over, st === 'GAME_OVER');
      if (st === 'MENU') S.drawCharPick();
      if (inMeeting && m.meeting) S.updateMeeting(m, m.meeting);
      if (inEject) S.drawEject(m, mt, dt, !paused);
    },

    // ------------------------------------------------------------ menü & rol ekranı
    // Karakter seçici: menüdeki robot dizisi; seçili robot yürür, diğerleri bekler.
    buildCharPick() {
      const G = SS.Game, box = $('charPick');
      try {
        const k = localStorage.getItem('ss_char');
        if (SS.CHARACTERS.some(d => d.key === k)) G.settings.charKey = k;
      } catch (e) { /* önemli değil */ }
      box.innerHTML = '';
      S.charCanvases = SS.CHARACTERS.map(d => {
        const b = document.createElement('button');
        b.className = 'char-opt';
        b.dataset.key = d.key;
        b.setAttribute('role', 'radio');
        b.title = d.name + ' — ' + d.accName;
        const cv = document.createElement('canvas');
        cv.width = 120; cv.height = 132;
        const nm = document.createElement('span');
        nm.textContent = d.name;
        nm.style.color = d.color;
        b.appendChild(cv); b.appendChild(nm);
        b.addEventListener('click', () => {
          SS.Audio.unlock(); SS.Audio.click();
          G.settings.charKey = d.key;
          try { localStorage.setItem('ss_char', d.key); } catch (e) { /* önemli değil */ }
          S.syncCharPick();
          b.blur();
        });
        box.appendChild(b);
        return { def: d, cv, b };
      });
      S.syncCharPick();
    },
    syncCharPick() {
      const key = SS.Game.settings.charKey;
      S.charCanvases.forEach(o => {
        const on = o.def.key === key;
        o.b.classList.toggle('on', on);
        o.b.setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) $('charName').innerHTML = '<span style="color:' + o.def.color + '">' + esc(o.def.name) + '</span> · ' + esc(o.def.accName);
      });
    },
    drawCharPick() {
      const t = performance.now() / 1000, key = SS.Game.settings.charKey;
      S.charCanvases.forEach((o, i) => {
        const g = o.cv.getContext('2d'), on = o.def.key === key;
        g.clearRect(0, 0, o.cv.width, o.cv.height);
        if (on) {
          const gr = g.createRadialGradient(60, 118, 4, 60, 118, 54);
          gr.addColorStop(0, 'rgba(255,226,90,0.45)'); gr.addColorStop(1, 'rgba(255,226,90,0)');
          g.fillStyle = gr; g.fillRect(0, 60, 120, 72);
        }
        SS.Sprites.robot(g, 60, 118 + (on ? Math.sin(t * 4) * 2 : 0), { def: o.def, facing: i < 4 ? 1 : -1, t: t + i, moving: on, phase: t * 8, scale: 2 });
      });
    },

    showReveal() {
      const G = SS.Game, m = G.match, p = G.player();
      const role = $('revealRole');
      const eng = p.sub === 'engineer', doc = p.sub === 'doctor', det = p.sub === 'detective', trk = p.sub === 'tracker', jdg = p.sub === 'judge', ang = !!p.angel, inf = !!p.influencer;
      role.textContent = p.role === 'crew' ? (eng ? 'MÜHENDİS' : doc ? 'DOKTOR' : det ? 'DEDEKTİF' : trk ? 'İZ SÜRÜCÜ' : jdg ? 'YARGIÇ' : ang ? 'KORUYUCU MELEK' : inf ? 'INFLUENCER' : 'MÜRETTEBAT') : (p.sub === 'phantom' ? 'FANTOM' : p.sub === 'shapeshifter' ? 'ŞEKİL DEĞİŞTİRİCİ' : 'HAİN');
      role.className = p.role;
      const mates = m.chars.filter(c => c.role === 'impostor' && c !== p);
      $('revealDesc').innerHTML = p.role === 'crew'
        ? 'Karakterin: <b style="color:' + p.def.color + '">' + esc(p.name) + '</b> (' + esc(p.def.accName) + '). Aranızda <b class="c-imp">' + SS.C.IMPOSTORS + ' hain</b> var. Görevlerini tamamla ve hainleri bul.' + (eng ? ' <b class="c-crew">Mühendis</b> olarak havalandırmaları kullanabilirsin: içeride en fazla ' + SS.C.ENGINEER_VENT_MAX + ' sn, sonra ' + SS.C.ENGINEER_VENT_COOLDOWN + ' sn bekleme.' : '') + (doc ? ' <b class="c-crew">Doktor</b> olarak yaşam belirtilerini her yerden görebilirsin (V): pil ' + SS.C.VITALS_BATTERY + ' sn, görevler pili şarj eder.' : '') + (det ? ' <b class="c-crew">Dedektif</b> olarak ceset rapor edildikten sonra temas ettiğin kişiyi sorgulayabilirsin (I): cinayet anında nerede olduğunu öğrenirsin. Dava başına ' + SS.C.INTERROGATIONS + ' sorgu.' : '') + (trk ? ' <b class="c-crew">İz Sürücü</b> olarak yakınındakine iz cihazı takabilirsin (T): konumu ' + SS.C.TRACK_DURATION + ' sn boyunca haritada görünür.' : '') + (jdg ? ' <b class="c-crew">Yargıç</b> olarak toplantıda bir kez birini atabilirsin: hainse yalnızca o gider, değilse ikiniz de elenirsiniz.' : '') + (ang ? (p.sub ? ' Öldüğünde ayrıca' : ' Hayattayken sıradan mürettebatsın. Öldüğünde') + ' <b class="c-crew">Koruyucu Melek</b> olursun: yaşayanlara kalkan verip (P) onları saldırılardan korursun.' : '') + (inf ? (p.sub ? ' Öldüğünde ayrıca' : ' Hayattayken sıradan mürettebatsın. Öldüğünde') + ' <b class="c-crew">Influencer</b> olursun: yaşayan birini takip edip (O) ona en fazla ' + SS.C.INFLUENCE_MAX_ICONS + ' resimlik ipuçları gönderirsin.' : '')
        : 'Karakterin: <b style="color:' + p.def.color + '">' + esc(p.name) + '</b>. ' + (mates.length > 1 ? 'Takım arkadaşların' : 'Takım arkadaşın') + ': <b class="c-imp">' + mates.map(c => esc(c.name)).join(', ') + '</b>. Fark edilmeden mürettebatı devre dışı bırak.' + (p.sub === 'phantom' ? ' <b class="c-imp">Fantom</b> olarak ' + SS.C.VANISH_DURATION + ' sn görünmez olabilirsin (G). Görünmezken saldıramazsın; kaybolurken görülme!' : '') + (p.sub === 'shapeshifter' ? ' <b class="c-imp">Şekil Değiştirici</b> olarak yaşayan birinin kılığına ' + SS.C.SHIFT_DURATION + ' sn girebilirsin (H). Kılıktayken saldırırsan suç onun üstüne kalır; dönerken görülme!' : '');
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
        // Dedektif: kartta son sorgu cevabı ve şüpheli işareti (yalnızca oyuncu görür)
        if (p.sub === 'detective' && c !== p) {
          const cs = m.cases.slice().reverse().find(x => (x.asked[p.id] || {})[c.id] !== undefined);
          if (cs) { const a = cs.asked[p.id][c.id]; sub = (sub ? sub + ' · ' : '') + 'Sorgu: ' + (a === null ? '?' : SS.Game.answerLabel(a)) + (a === cs.room ? ' ⚠' : ''); }
          if (m.activeCase && m.activeCase.suspects[c.id]) sub = (sub ? sub + ' · ' : '') + '★ Şüpheli';
        }
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
      if (S.pick === 'judge' && (G.state === 'MEETING_DISCUSSION' || G.state === 'MEETING_VOTE')) {
        if (!c.alive || c === p) return;
        SS.Audio.click();
        S.judgeSel = id;
        return;
      }
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
        const pickable = c.alive && c !== p && p.alive && ((st === 'MEETING_DISCUSSION' && S.pick) || S.pick === 'judge' || (st === 'MEETING_VOTE' && !mt.votes.hasOwnProperty(p.id)));
        if (!c.alive && !card._deadSub) { card._deadSub = true; const sb = card.querySelector('.sub'); if (sb) sb.textContent = c.judged ? 'Yargılandı' : c.ejected ? 'Elendi' : 'Devre dışı'; }
        const voted = st === 'MEETING_VOTE' && mt.votes.hasOwnProperty(c.id);
        const key = c.id + ':' + pickable + voted + (S.selected === c.id) + (S.judgeSel === c.id) + c.alive;
        if (card._k === key) return;
        card._k = key;
        card.classList.toggle('pickable', !!pickable);
        card.classList.toggle('selected', S.selected === c.id || S.judgeSel === c.id);
        card.classList.toggle('dead', !c.alive);
        let badge = card.querySelector('.voted');
        if (voted && !badge) { badge = document.createElement('span'); badge.className = 'voted'; badge.textContent = 'OY VERDİ'; card.appendChild(badge); }
        if (!voted && badge && st !== 'MEETING_RESULT') badge.remove();
      });
      const sig = [st, S.pick, S.selected, S.judgeSel, p.judgeLeft, JSON.stringify(mt.playerActs), mt.votes.hasOwnProperty(p.id) ? mt.votes[p.id] : '-', p.alive].join('|');
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
      // Yargıç: seçim ve onay adımı (tartışma ve oylama sırasında)
      if (S.pick === 'judge' && p.alive && st !== 'MEETING_RESULT') {
        if (S.judgeSel !== null && S.judgeSel !== undefined) {
          const t = m.chars[S.judgeSel];
          note(t.name + ' hainse yalnızca o elenir. Hain değilse ikiniz de elenirsiniz. Emin misin?');
          btn('Eminim, ' + t.name + ' atılsın', () => { SS.Meeting.playerJudge(t.id); S.pick = null; S.judgeSel = null; }, 'danger');
        } else note('Yargılamak istediğin karakteri seç.');
        btn('İptal', () => { S.pick = null; S.judgeSel = null; });
        return;
      }
      const canJudge = p.sub === 'judge' && p.alive && p.judgeLeft > 0;
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
        if (m.engineers) btn('Mühendis olduğumu söyle', () => SS.Meeting.playerSay('claim'), '', acts.claim);
        if (p.sub === 'detective' && m.cases.some(cs => Object.keys(cs.asked[p.id] || {}).length)) btn('Sorgu sonuçlarını söyle', () => SS.Meeting.playerSay('findings'), '', acts.findings);
        btn('Yeterli kanıt yok', () => SS.Meeting.playerSay('noevidence'), '', acts.noevidence);
        if (canJudge) btn('⚖ Yargıla', () => { S.pick = 'judge'; S.judgeSel = null; }, 'danger');
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
        if (canJudge) btn('⚖ Yargıla', () => { S.pick = 'judge'; S.judgeSel = null; S.selected = null; }, 'danger');
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
      if (mt.judged) return; // yargı sonrası oy dağılımı yok, doğrudan atılma ekranı
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

    // Atılma sırası: oylamada tek atılma; yargıda önce hedef, hedef masumsa ardından yargıç.
    ejectSegments(m, mt) {
      if (mt.judged) {
        const j = m.chars[mt.judged.judgeId], t = m.chars[mt.judged.targetId];
        const left = m.chars.filter(x => x.alive && x.role === 'impostor').length;
        const segs = [{ id: t.id, title: 'Yargıç ' + j.name + ' kararını verdi: ' + t.name + ' uzaya atıldı.',
          sub: mt.judged.guilty ? t.name + ' bir HAİNDİ. Kalan hain: ' + left : t.name + ' hain değildi.' }];
        if (!mt.judged.guilty) segs.push({ id: j.id, title: 'Yanlış karar! Yargıç ' + j.name + ' uzaya atıldı.', sub: j.name + ' hain değildi. Kalan hain: ' + left });
        return { segs, dur: SS.C.JUDGE_EJECT_SEG, start: 0 };
      }
      const res = S.resultText(m, mt);
      return { segs: [{ id: mt.tally ? mt.tally.ejected : null, title: res.title, sub: res.sub }], dur: SS.C.RESULT_TIME - EJECT_AT, start: EJECT_AT };
    },

    drawEject(m, mt, dt, run) {
      const c = S.ejectCanvas, g = c.getContext('2d');
      const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#04050f'; g.fillRect(0, 0, w, h);
      const E = S.ejectSegments(m, mt);
      const tt = Math.max(0, mt.resultT - E.start);
      const si = Math.min(E.segs.length - 1, Math.floor(tt / E.dur));
      const seg = E.segs[si];
      const k = U.clamp((tt - si * E.dur) / E.dur, 0, 1);
      S.starsE.forEach(s => {
        if (run) { s.x -= s.z * dt * 0.25; if (s.x < 0) { s.x = 1; s.y = Math.random(); } }
        g.fillStyle = 'rgba(200,210,255,' + s.z + ')';
        g.fillRect(s.x * w, s.y * h, s.z * 3, s.z * 2);
      });
      const res = seg;
      if (seg.id !== null && seg.id !== undefined) {
        const ej = m.chars[seg.id];
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
        info.innerHTML = '<b style="color:' + c.def.color + '">' + esc(c.name) + (c.isPlayer ? ' (Sen)' : '') + '</b><span>' + (c.role === 'impostor' ? (c.sub === 'phantom' ? 'Fantom' : c.sub === 'shapeshifter' ? 'Şekil Değiştirici' : 'Hain') : (c.sub === 'engineer' ? 'Mühendis' : c.sub === 'doctor' ? 'Doktor' : c.sub === 'detective' ? 'Dedektif' : c.sub === 'tracker' ? 'İz Sürücü' : c.sub === 'judge' ? 'Yargıç' : c.angel ? 'Koruyucu Melek' : c.influencer ? 'Influencer' : 'Mürettebat') + (c.angel && c.sub ? ' · Melek' : '') + (c.influencer && c.sub ? ' · Influencer' : '')) + '</span><em>' + (c.alive ? 'Hayatta' : c.judged ? 'Yargılandı' : c.ejected ? 'Elendi' : 'Devre dışı') + '</em>';
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
