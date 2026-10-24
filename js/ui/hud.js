// Oyun içi arayüz: görev çubuğu, görev listesi, aksiyon butonları, sabotaj uyarısı, harita ve sabotaj panelleri.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;
  const $ = id => document.getElementById(id);

  const H = (SS.HUD = {
    panel: null, toastT: 0, cache: {}, sabT: 0, ventSig: '', inflSel: [],

    init() {
      H.el = {
        hud: $('hud'), fill: $('taskFill'), pct: $('taskPct'), alert: $('sabAlert'), list: $('taskList'), items: $('taskItems'),
        badge: $('roleBadge'), killInfo: $('killInfo'), prompt: $('prompt'), toast: $('toast'), ghost: $('ghostBanner'),
        vent: $('ventBar'), use: $('btnUse'), report: $('btnReport'), kill: $('btnKill'), sab: $('btnSab'), vitals: $('btnVitals'), interro: $('btnInterrogate'), trackBtn: $('btnTrack'), protectBtn: $('btnProtect'), inflBtn: $('btnInfluence'), inflPanel: $('inflPanel'), inflChoices: $('inflChoices'), inflSlots: $('inflSlots'), inflTarget: $('inflTarget'), inflCd: $('inflCd'), inflSend: $('inflSend'), inflRefresh: $('inflRefresh'), inflPop: $('inflPop'), inflPopIcons: $('inflPopIcons'), vanishBtn: $('btnVanish'), shiftBtn: $('btnShift'), shiftModal: $('shiftModal'), shiftGrid: $('shiftGrid'), actions: $('actions'), caseBtn: $('btnCase'),
        caseModal: $('caseModal'), caseTabs: $('caseTabs'), caseBody: $('caseBody'),
        vitalsModal: $('vitalsModal'), vitalsGrid: $('vitalsGrid'), vitalsBat: $('vitalsBattery'), vitalsBatTxt: $('vitalsBatteryTxt'),
        mapModal: $('mapModal'), mapCanvas: $('mapCanvas'), sabModal: $('sabModal'), sabBody: $('sabBody'),
      };
      const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
      press(H.el.use, () => H.action('use'));
      press(H.el.report, () => H.action('report'));
      press(H.el.kill, () => H.action('kill'));
      press(H.el.sab, () => H.action('sab'));
      press(H.el.vitals, () => H.action('vitals'));
      press(H.el.interro, () => H.action('interro'));
      press(H.el.trackBtn, () => H.action('track'));
      press(H.el.protectBtn, () => H.action('protect'));
      press(H.el.inflBtn, () => H.action('infl'));
      H.el.inflPanel.addEventListener('pointerdown', e => e.stopPropagation());
      press(H.el.inflSend, () => { if (SS.Game.playerInflSend(H.inflSel)) H.inflSel = []; });
      press(H.el.inflRefresh, () => { if (SS.Game.playerInflRefresh()) { SS.Audio.click(); H.inflSel = []; } });
      H.el.inflChoices.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-icon]');
        if (!b) return;
        e.preventDefault();
        const i = +b.dataset.icon, k = H.inflSel.indexOf(i);
        if (k >= 0) H.inflSel.splice(k, 1);
        else if (H.inflSel.length < SS.C.INFLUENCE_MAX_ICONS) H.inflSel.push(i);
        else { SS.events.emit('denied', 'En fazla ' + SS.C.INFLUENCE_MAX_ICONS + ' resim'); return; }
        SS.Audio.click();
      });
      press(H.el.vanishBtn, () => H.action('vanish'));
      press(H.el.shiftBtn, () => H.action('shift'));
      press(H.el.caseBtn, () => { SS.Audio.click(); H.togglePanel('case'); });
      press($('btnMap'), () => { SS.Audio.click(); H.togglePanel('map'); });
      press($('btnSettings'), () => { SS.Audio.click(); H.closePanels(); SS.Game.pause(); });
      press($('taskListHead'), () => H.el.list.classList.toggle('collapsed'));
      document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { SS.Audio.click(); H.closePanels(); }));
      [H.el.mapModal, H.el.sabModal, H.el.vitalsModal, H.el.caseModal, H.el.shiftModal].forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) H.closePanels(); }));
      const mc = H.el.mapCanvas;
      mc.width = 900; mc.height = Math.round(900 * SS.Map.pxH / SS.Map.pxW);
      if (window.innerWidth < 600) H.el.list.classList.add('collapsed');

      SS.events.on('denied', msg => { if (msg) H.toast(msg, 1.4); });
      SS.events.on('protect', e => { if (e.angel.isPlayer) H.toast(e.target.name + ' ' + SS.C.PROTECT_DURATION + ' sn boyunca korunuyor.', 1.8); });
      SS.events.on('inflFollow', e => { if (e.c.isPlayer) { H.inflSel = []; H.toast(e.target.name + ' takip ediliyor. Resim seç ve gönder.', 1.8); } });
      SS.events.on('inflUnfollow', e => { if (e.c.isPlayer && e.why === 'dead') H.toast('Takip ettiğin ' + e.target.name + ' artık yaşamıyor.', 2); });
      SS.events.on('influence', e => { if (e.from.isPlayer) H.toast('Mesaj gönderildi: ' + e.target.name + '.', 1.6); });
      SS.events.on('killBlocked', e => {
        if (e.killer.isPlayer) H.toast('Hedef korunuyordu! Saldırı engellendi.', 2.2);
        else if (e.victim.isPlayer) H.toast('Bir koruyucu melek seni korudu! ' + SS.Game.displayOf(e.killer).name + ' sana saldırdı.', 3);
      });
      SS.events.on('interrogate', r => {
        if (!r.detective.isPlayer) return;
        const v = SS.Game.match.chars[SS.Game.match.cases.find(c => c.id === r.caseId).victimId];
        const where = r.answer === null ? 'nerede olduğu bilinmiyor' : r.answer === 'vent' ? 'havalandırmalardaydı' : SS.Map.roomInfo(r.answer).loc + ' idi';
        H.toast('Sorgu: ' + r.target.name + ', ' + v.name + ' öldürüldüğünde ' + where + (r.atBody ? ' — cesedin olduğu oda!' : '.'), 2.8);
        H.cache.caseSig = null;
      });
      SS.events.on('caseOpen', () => { H.caseSel = null; H.cache.caseSig = null; });
      SS.events.on('vitalsClosed', e => {
        if (!e.c.isPlayer) return;
        if (H.panel === 'vitals') H.closePanels();
        if (e.why === 'battery') H.toast('Pil bitti. Şarj oluyor…', 1.6);
      });
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
        if (e.to === 'ROLE_REVEAL') { H.cache = {}; H.ventSig = ''; H.inflSel = []; H.toastT = 0; H.el.toast.classList.add('hidden'); }
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
      } else if (kind === 'shift') {
        const p = G.player();
        if (!ctx.shift || !ctx.shift.ok) { SS.events.emit('denied', ctx.shift ? ctx.shift.reason : 'Sadece şekil değiştirici'); return; }
        SS.Audio.click();
        if (p.disguise !== null) G.playerShift(); else H.togglePanel('shift');
      } else if (kind === 'vanish') {
        if (!ctx.vanish || !ctx.vanish.ok) { SS.events.emit('denied', ctx.vanish ? ctx.vanish.reason : 'Sadece fantom'); return; }
        SS.Audio.click(); G.playerVanish();
      } else if (kind === 'protect') {
        if (!ctx.protect) { SS.events.emit('denied', ctx.protectReason); return; }
        SS.Audio.click(); G.playerProtect();
      } else if (kind === 'infl') {
        const f = ctx.infl;
        if (!f) { SS.events.emit('denied', 'Sadece influencer'); return; }
        if (!f.following && !f.target) { SS.events.emit('denied', f.reason); return; }
        SS.Audio.click(); G.playerInflToggle();
      } else if (kind === 'track') {
        if (!ctx.track) { SS.events.emit('denied', ctx.trackReason); return; }
        SS.Audio.click(); G.playerTrack();
      } else if (kind === 'interro') {
        if (!ctx.interrogate) { SS.events.emit('denied', ctx.intReason); return; }
        SS.Audio.click(); G.playerInterrogate();
      } else if (kind === 'vitals') {
        SS.Audio.click(); H.togglePanel('vitals');
      }
    },

    togglePanel(name) {
      const G = SS.Game, p = G.player();
      if (G.state !== 'PLAYING') return;
      if (name === 'sab' && (!p || p.role !== 'impostor' || !p.alive)) { if (p && p.role !== 'impostor') return; SS.events.emit('denied', 'Elendin'); return; }
      if (name === 'vitals' && (!p || p.sub !== 'doctor')) return;
      if (name === 'case' && (!p || p.sub !== 'detective')) return;
      if (name === 'shift' && H.panel !== 'shift') {
        const chk = G.canShift(p);
        if (!chk.ok || p.disguise !== null) { SS.events.emit('denied', chk.ok ? 'Önce kendi hâline dön' : chk.reason); return; }
      }
      if (H.panel === name) { H.closePanels(); return; }
      H.closePanels();
      if (name === 'vitals' && !G.playerVitals(true)) return;
      H.panel = name;
      G.uiBlock = true;
      ({ map: H.el.mapModal, sab: H.el.sabModal, vitals: H.el.vitalsModal, case: H.el.caseModal, shift: H.el.shiftModal })[name].classList.remove('hidden');
      if (name === 'case') { H.cache.caseSig = null; H.renderCase(); }
      if (name === 'shift') H.buildShift();
      if (name === 'vitals') H.buildVitals();
      if (name === 'sab') H.renderSab(true);
    },

    closePanels() {
      H.panel = null;
      if (SS.Game) SS.Game.uiBlock = false;
      if (!H.el) return;
      H.el.mapModal.classList.add('hidden');
      H.el.sabModal.classList.add('hidden');
      H.el.vitalsModal.classList.add('hidden');
      H.el.caseModal.classList.add('hidden');
      H.el.shiftModal.classList.add('hidden');
      const p = SS.Game.match && SS.Game.player();
      if (p && p.vitalsOpen) SS.Game.closeVitals(p);
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
      const ghostTxt = p.alive ? '' : p.angel ? 'Koruyucu meleksin: yaşayanlara kalkan verebilir (P), kalan görevlerini tamamlayabilirsin.' : p.influencer ? 'Influencersın: yaşayan birini takip et (O) ve ona resimli ipuçları gönder.' : (p.role === 'crew' ? 'Hayaletsin: duvarlardan geçebilir, kalan görevlerini tamamlayabilirsin.' : 'Elendin: maçın kalanını hayalet olarak izliyorsun.');
      H.set('ghost', p.inflFollow !== null ? '' : ghostTxt, v => { H.el.ghost.textContent = v; H.el.ghost.classList.toggle('hidden', !v); });
      if (H.panel === 'map') H.drawMap(m, p);
      if (H.panel === 'vitals') H.updateVitals(m, p);
      if (H.panel === 'case') H.renderCase();
      if (H.panel === 'sab') { H.sabT -= dt; if (H.sabT <= 0) H.renderSab(false); }
    },

    updateList(m, p) {
      const M = SS.Map;
      const sig = p.role + p.sub + p.alive + p.tasks.map(t => (t.done ? 1 : 0)).join('') + m.id;
      H.set('listSig', sig, () => {
        const badge = H.el.badge;
        badge.className = 'role-badge ' + (p.alive ? p.role : 'ghost');
        const roleName = p.role === 'impostor' ? (p.sub === 'phantom' ? 'HAİN · FANTOM' : p.sub === 'shapeshifter' ? 'HAİN · ŞEKİL DEĞİŞTİRİCİ' : 'HAİN') : (p.sub === 'engineer' ? 'MÜHENDİS' : p.sub === 'doctor' ? 'DOKTOR' : p.sub === 'detective' ? 'DEDEKTİF' : p.sub === 'tracker' ? 'İZ SÜRÜCÜ' : p.sub === 'judge' ? 'YARGIÇ' : p.angel ? 'KORUYUCU MELEK' : p.influencer ? 'INFLUENCER' : 'MÜRETTEBAT') + (p.angel && p.sub ? ' · MELEK' : '') + (p.influencer && p.sub ? ' · INFLUENCER' : '');
        badge.textContent = p.alive ? roleName : 'HAYALET · ' + roleName;
        const rows = [];
        if (p.role === 'impostor') {
          const mates = m.chars.filter(c => c.role === 'impostor' && c !== p).map(c => c.name).join(', ');
          rows.push('<li class="note">' + (mates.indexOf(',') >= 0 ? 'Takım arkadaşların' : 'Takım arkadaşın') + ': <b>' + mates + '</b></li>');
          rows.push('<li class="note">Sahte görevler — ilerleme sağlamaz</li>');
          if (p.sub === 'shapeshifter' && p.alive) rows.push('<li class="note">Yaşayan birinin kılığına gir (H); kılıktayken saldırabilirsin</li>');
          if (p.sub === 'phantom' && p.alive) rows.push('<li class="note">10 sn görünmez olabilirsin (G); görünmezken saldıramazsın</li>');
        }
        if (p.influencer) rows.push('<li class="note eng">' + (p.alive ? 'Öldüğünde influencer olursun' : 'Birini takip et (O), resimli mesaj gönder') + '</li>');
        if (p.angel) rows.push('<li class="note eng">' + (p.alive ? 'Öldüğünde koruyucu melek olursun' : 'Yaşayanlara kalkan ver (P)') + '</li>');
        if (p.sub === 'judge' && p.alive) rows.push('<li class="note eng">Toplantıda bir kez birini atabilirsin: hainse yalnızca o gider, değilse ikiniz de elenirsiniz</li>');
        if (p.sub === 'tracker' && p.alive) rows.push('<li class="note eng">Yakınındakine iz cihazı tak (T); konumu haritada görünür</li>');
        if (p.sub === 'detective' && p.alive) rows.push('<li class="note eng">Ceset rapor edilince temas ettiğin kişiyi sorgula (I)</li>');
        if (p.sub === 'doctor' && p.alive) rows.push('<li class="note eng">Yaşam belirtilerini her yerden görebilirsin (V)</li>');
        if (p.sub === 'engineer' && p.alive) rows.push('<li class="note eng">Havalandırmaları kullanabilirsin (en fazla ' + SS.C.ENGINEER_VENT_MAX + ' sn)</li>');
        p.tasks.forEach(t => {
          const st = M.stations[t.station];
          rows.push('<li class="' + (t.done ? 'done' : '') + '"><span>' + (t.done ? '✓' : '•') + '</span><span>' + st.name + ' <span class="room">' + M.roomById[st.room].name + '</span></span></li>');
        });
        H.el.items.innerHTML = rows.join('');
      });
      let ki = p.role === 'impostor' && p.alive ? (p.killCd > 0 ? 'Saldırı bekleme: ' + Math.ceil(p.killCd) + ' sn' : 'Saldırı hazır') : '';
      if (p.sub === 'shapeshifter' && p.alive) ki += p.disguise !== null ? ' · Kılık: ' + m.chars[p.disguise].name + ' · ' + Math.ceil(p.shiftLeft) + ' sn' : (p.shiftAnim > 0 ? ' · Dönüşüyor' : p.shiftCd > 0 ? ' · Dönüşüm: ' + Math.ceil(p.shiftCd) + ' sn' : ' · Dönüşüm hazır');
      if (p.sub === 'phantom' && p.alive) ki += p.invis && !p.fading ? ' · Görünmezsin: ' + Math.ceil(p.invisLeft) + ' sn' : (p.vanishCd > 0 ? ' · Kaybolma: ' + Math.ceil(p.vanishCd) + ' sn' : ' · Kaybolma hazır');
      if (p.sub === 'engineer' && p.alive) ki = p.inVent !== null ? 'Havalandırmada: ' + Math.max(0, Math.ceil(SS.C.ENGINEER_VENT_MAX - p.ventTime)) + ' sn kaldı' : (p.ventUseCd > 0 ? 'Havalandırma bekleme: ' + Math.ceil(p.ventUseCd) + ' sn' : 'Havalandırma hazır');
      if (p.influencer && !p.alive) ki = (p.inflFollow !== null ? 'Takip: ' + m.chars[p.inflFollow].name + ' · ' : '') + (p.inflCd > 0 ? 'Mesaj bekleme: ' + Math.ceil(p.inflCd) + ' sn' : 'Mesaj hazır');
      if (p.angel && !p.alive) ki = p.protectCd > 0 ? 'Koruma bekleme: ' + Math.ceil(p.protectCd) + ' sn' : 'Koruma hazır';
      if (p.sub === 'judge' && p.alive) ki = 'Yargılama hakkı: ' + p.judgeLeft;
      if (p.sub === 'tracker' && p.alive) {
        const tr = p.track;
        ki = tr ? 'İz: ' + m.chars[tr.id].name + ' · ' + (tr.lost ? 'sinyal kesildi' : SS.Map.roomInfo(tr.room).name) + ' · ' + Math.ceil(tr.left) + ' sn' : (p.trackCd > 0 ? 'İz cihazı bekleme: ' + Math.ceil(p.trackCd) + ' sn' : 'İz cihazı hazır');
      }
      if (p.sub === 'detective' && p.alive) ki = m.activeCase ? 'Dava #' + m.activeCase.id + ' · sorgu hakkı: ' + p.caseLeft + '/' + SS.C.INTERROGATIONS : 'Henüz dava yok';
      if (p.sub === 'doctor' && p.alive) ki = p.vitalsCd > 0 ? 'Pil şarj oluyor: ' + Math.ceil(p.vitalsCd) + ' sn' : 'Pil: ' + Math.ceil(p.battery) + ' sn';
      H.set('kiEng', !!p.sub, v => H.el.killInfo.classList.toggle('eng', v));
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
      const ang = !!p.angel && !p.alive;
      H.set('isAng', ang, v => H.el.protectBtn.classList.toggle('hidden', !v));
      if (ang) H.setBtn(H.el.protectBtn, 'prt', !!ctx.protect, ctx.protect ? ctx.protect.name : ctx.protectReason);
      const inf = !!p.influencer && !p.alive;
      H.set('isInf', inf, v => H.el.inflBtn.classList.toggle('hidden', !v));
      if (inf) {
        const f = ctx.infl || {};
        H.setBtn(H.el.inflBtn, 'inf', !!(f.following || f.target), f.following ? f.following.name : f.target ? f.target.name : f.reason, f.following ? 'Bırak' : 'Takip');
        H.set('infOn', !!f.following, v => H.el.inflBtn.classList.toggle('tracking', v));
      }
      H.updateInfl(m, p, ctx);
      const trk = p.sub === 'tracker';
      H.set('isTrk', trk, v => H.el.trackBtn.classList.toggle('hidden', !v));
      if (trk) {
        const tr = p.track;
        H.setBtn(H.el.trackBtn, 'trk', !!ctx.track, tr ? m.chars[tr.id].name + ' · ' + Math.ceil(tr.left) + ' sn' : (ctx.track ? ctx.track.target.name : ctx.trackReason), tr ? 'Bırak' : 'İz sür');
        H.set('trkOn', !!tr, v => H.el.trackBtn.classList.toggle('tracking', v));
      }
      const det = p.sub === 'detective';
      H.set('isDet', det, v => { H.el.interro.classList.toggle('hidden', !v); H.el.caseBtn.classList.toggle('hidden', !v); });
      if (det) H.setBtn(H.el.interro, 'int', !!ctx.interrogate, ctx.interrogate ? ctx.interrogate.name : ctx.intReason);
      const doc = p.sub === 'doctor';
      H.set('isDoc', doc, v => H.el.vitals.classList.toggle('hidden', !v));
      if (doc) { const vc = ctx.vitals || SS.Game.canVitals(p); H.setBtn(H.el.vitals, 'vit', vc.ok, vc.reason); }
      const ph = p.sub === 'phantom';
      const shp = p.sub === 'shapeshifter';
      H.set('isPh', ph, v => H.el.vanishBtn.classList.toggle('hidden', !v));
      H.set('isShp', shp, v => H.el.shiftBtn.classList.toggle('hidden', !v));
      H.set('three', ph || shp, v => H.el.actions.classList.toggle('three', v));
      if (shp) {
        const sc = ctx.shift || { ok: false, reason: 'Elendin', label: 'Dönüş' };
        H.setBtn(H.el.shiftBtn, 'shf', sc.ok, sc.reason, sc.label);
        H.set('shfOn', p.disguise !== null || p.shiftAnim > 0, v => H.el.shiftBtn.classList.toggle('tracking', v));
      }
      if (ph) {
        const vc = ctx.vanish || { ok: false, reason: 'Elendin', label: 'Kaybol' };
        H.setBtn(H.el.vanishBtn, 'van', vc.ok, vc.reason, vc.label);
        H.set('vanOn', p.invis || !!p.fading, v => H.el.vanishBtn.classList.toggle('tracking', v));
      }
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
      const tm = H.el.vent.querySelector('.vent-timer');
      if (tm && sig) H.set('ventLeft', Math.max(0, Math.ceil(SS.C.ENGINEER_VENT_MAX - p.ventTime)), v => { tm.textContent = v + ' sn'; tm.classList.toggle('low', v <= 3); });
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
      if (p.sub === 'engineer') {
        const tm = document.createElement('span');
        tm.className = 'vent-timer';
        bar.appendChild(tm);
      }
      const ex = document.createElement('button');
      ex.className = 'btn primary';
      ex.innerHTML = 'Dışarı çık' + (document.body.classList.contains('touch') ? '' : ' <kbd>E</kbd>');
      ex.addEventListener('pointerdown', e => { e.preventDefault(); SS.Game.exitVent(SS.Game.player()); });
      bar.appendChild(ex);
      bar.classList.remove('hidden');
      delete H.cache.ventLeft;
    },

    // Kılık seçimi: yaşayan diğer karakterler.
    // Influencer resmi: renk için robot, oda ve çıkartmalar için simge ve kısa ad.
    inflIcon(idx) {
      const ic = SS.INFLUENCE_ICONS[idx], el = document.createElement('div');
      el.className = 'infl-ic ' + ic.type;
      el.dataset.icon = idx;
      el.title = ic.label;
      if (ic.type === 'color') {
        const cv = document.createElement('canvas'); cv.width = 68; cv.height = 68;
        SS.Sprites.avatar(cv, SS.CHARACTERS[ic.char], {});
        el.appendChild(cv);
      } else {
        const em = document.createElement('span'); em.className = 'em'; em.textContent = ic.type === 'room' ? '🚪' : ic.emoji;
        el.appendChild(em);
      }
      const nm = document.createElement('small'); nm.textContent = ic.label;
      if (ic.type === 'color') nm.style.color = SS.CHARACTERS[ic.char].color;
      el.appendChild(nm);
      return el;
    },
    updateInfl(m, p, ctx) {
      const f = ctx.infl, open = !!(f && f.following) && SS.Game.state === 'PLAYING';
      H.set('inflOpen', open, v => H.el.inflPanel.classList.toggle('hidden', !v));
      if (open) {
        H.inflSel = H.inflSel.filter(i => p.inflChoices.indexOf(i) >= 0);
        H.set('inflSig', p.inflChoices.join(',') + '|' + H.inflSel.join(','), () => {
          H.el.inflChoices.innerHTML = '';
          p.inflChoices.forEach(i => { const el = H.inflIcon(i); if (H.inflSel.indexOf(i) >= 0) el.classList.add('sel'); H.el.inflChoices.appendChild(el); });
          H.el.inflSlots.innerHTML = '';
          for (let k = 0; k < SS.C.INFLUENCE_MAX_ICONS; k++) {
            if (H.inflSel[k] !== undefined) H.el.inflSlots.appendChild(H.inflIcon(H.inflSel[k]));
            else { const s = document.createElement('div'); s.className = 'slot'; H.el.inflSlots.appendChild(s); }
          }
        });
        H.set('inflTgt', f.following.name, v => { H.el.inflTarget.textContent = 'Takip: ' + v; H.el.inflTarget.style.color = f.following.def.color; });
        H.set('inflCdTxt', f.send.ok ? 'Mesaj hazır' : f.send.reason, v => { H.el.inflCd.textContent = v; });
        H.set('inflSendOn', f.send.ok && H.inflSel.length > 0, v => H.el.inflSend.classList.toggle('off', !v));
        H.set('inflRefOn', p.inflCd <= 0, v => H.el.inflRefresh.classList.toggle('off', !v));
      }
      const box = p.alive && p.inbox && SS.Game.state === 'PLAYING' ? p.inbox : null;
      H.set('inflPop', box ? box.at + ':' + box.icons.join(',') : '', v => {
        H.el.inflPop.classList.toggle('hidden', !v);
        if (!v) return;
        H.el.inflPopIcons.innerHTML = '';
        box.icons.forEach(i => H.el.inflPopIcons.appendChild(H.inflIcon(i)));
      });
    },

    buildShift() {
      const G = SS.Game, m = G.match, p = G.player(), g = H.el.shiftGrid;
      g.innerHTML = '';
      m.chars.forEach(c => {
        if (c === p || !c.alive) return;
        const b = document.createElement('button');
        b.className = 'shift-opt';
        b.dataset.id = c.id;
        const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
        SS.Sprites.avatar(cv, c.def, {});
        const nm = document.createElement('span'); nm.textContent = c.name; nm.style.color = c.def.color;
        b.appendChild(cv); b.appendChild(nm);
        b.addEventListener('click', () => {
          SS.Audio.click();
          H.closePanels();
          G.playerShift(c.id);
        });
        g.appendChild(b);
      });
    },

    // Dava dosyası: cesedin yeri, sorgu sonuçları ve oyuncunun şüpheli listesi (notlar).
    renderCase() {
      const G = SS.Game, m = G.match, p = G.player();
      if (!m.cases.length) {
        H.set('caseSig', 'empty', () => { H.el.caseTabs.innerHTML = ''; H.el.caseBody.innerHTML = '<p class="case-empty">Henüz rapor edilmiş bir ceset yok. Bir ceset rapor edildiğinde burada dava açılır.</p>'; });
        return;
      }
      const sel = m.cases.find(c => c.id === H.caseSel) || m.activeCase || m.cases[m.cases.length - 1];
      const asked = sel.asked[p.id] || {};
      const sig = [m.cases.length, sel.id, JSON.stringify(asked), JSON.stringify(sel.suspects), p.caseLeft, m.chars.map(c => c.alive ? 1 : 0).join('')].join('|');
      if (H.cache.caseSig === sig) return;
      H.cache.caseSig = sig;
      H.el.caseTabs.innerHTML = '';
      m.cases.forEach(cs => {
        const b = document.createElement('button');
        b.className = 'case-tab' + (cs === sel ? ' on' : '') + (cs === m.activeCase ? ' active' : '');
        b.textContent = 'Dava #' + cs.id + (cs === m.activeCase ? ' (aktif)' : '');
        b.addEventListener('click', () => { SS.Audio.click(); H.caseSel = cs.id; H.cache.caseSig = null; H.renderCase(); });
        H.el.caseTabs.appendChild(b);
      });
      const v = m.chars[sel.victimId], rep = m.chars[sel.reporterId];
      const left = sel === m.activeCase ? 'Sorgu hakkı: ' + p.caseLeft + '/' + SS.C.INTERROGATIONS : 'Kapalı dava: yalnızca en son dava sorgulanabilir';
      let html = '<div class="case-facts"><div><span>Kurban</span><b style="color:' + v.def.color + '">' + v.name + '</b></div>' +
        '<div><span>Ceset</span><b>' + SS.Map.roomInfo(sel.room).name + '</b></div>' +
        '<div><span>Rapor eden</span><b style="color:' + rep.def.color + '">' + rep.name + '</b></div>' +
        '<div><span>Durum</span><b>' + left + '</b></div></div>';
      html += '<div class="case-rows">';
      m.chars.forEach(c => {
        if (c.id === sel.victimId) return;
        const a = asked[c.id];
        const ans = a === undefined ? '<em>Sorgulanmadı</em>' : (a === null ? 'Bilinmiyor' : G.answerLabel(a) + (a === sel.room ? ' <i class="hot">cesedin yanı</i>' : ''));
        const sus = !!sel.suspects[c.id];
        html += '<div class="case-row' + (c.alive ? '' : ' dead') + (a === sel.room ? ' hot' : '') + '">' +
          '<span class="vdot" style="background:' + c.def.color + '"></span><b>' + c.name + (c === p ? ' (Sen)' : '') + '</b>' +
          '<span class="ans">' + ans + '</span>' +
          (c === p ? '<span></span>' : '<button class="sus' + (sus ? ' on' : '') + '" data-id="' + c.id + '" aria-pressed="' + sus + '">' + (sus ? '★ Şüpheli' : '☆ Şüpheli') + '</button>') +
          '</div>';
      });
      html += '</div>';
      H.el.caseBody.innerHTML = html;
      H.el.caseBody.querySelectorAll('button.sus').forEach(b => b.addEventListener('click', () => {
        SS.Audio.click();
        const id = +b.dataset.id;
        if (sel.suspects[id]) delete sel.suspects[id]; else sel.suspects[id] = true;
        H.cache.caseSig = null; H.renderCase();
      }));
    },

    // Yaşam belirtileri: herkesin durumu, konum yok.
    buildVitals() {
      const m = SS.Game.match, g = H.el.vitalsGrid;
      g.innerHTML = '';
      H.vitalCells = m.chars.map(c => {
        const d = document.createElement('div');
        d.className = 'vital';
        d.innerHTML = '<span class="vdot" style="background:' + c.def.color + '"></span><b>' + c.name + '</b>' +
          '<svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline class="ecg" points="0,12 30,12 36,4 42,20 48,12 62,12 66,8 70,12 100,12"/><line class="flat" x1="0" y1="12" x2="100" y2="12"/></svg>' +
          '<span class="vstat"></span>';
        g.appendChild(d);
        return d;
      });
      H.cache.vit = {};
    },
    updateVitals(m, p) {
      const L = { alive: 'HAYATTA', dead: 'ÖLDÜ', ejected: 'ELENDİ' };
      SS.Game.vitals().forEach(v => {
        const el = H.vitalCells && H.vitalCells[v.id];
        if (!el || H.cache.vit[v.id] === v.status) return;
        H.cache.vit[v.id] = v.status;
        el.className = 'vital ' + v.status;
        el.querySelector('.vstat').textContent = L[v.status];
      });
      const k = U.clamp(p.battery / SS.C.VITALS_BATTERY, 0, 1);
      H.el.vitalsBat.style.width = (k * 100).toFixed(1) + '%';
      H.el.vitalsBat.classList.toggle('low', k < 0.3);
      H.set('batTxt', Math.ceil(p.battery), v => { H.el.vitalsBatTxt.textContent = 'Pil: ' + v + ' sn'; });
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
      if (SS.Game.canVent(p)) {
        M.vents.forEach(v => { g.fillStyle = p.role === 'impostor' ? '#a8303d' : '#2b9fc4'; g.fillRect(v.x * k - 5, v.y * k - 4, 10, 8); });
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
      if (p.track) {
        const tr = p.track, tc = m.chars[tr.id];
        g.strokeStyle = tc.def.color; g.lineWidth = 3;
        g.beginPath(); g.arc(tr.x * k, tr.y * k, 11 + (t * 12) % 10, 0, Math.PI * 2); g.stroke();
        g.fillStyle = tr.lost ? '#555b80' : tc.def.color; g.strokeStyle = '#080a1c'; g.lineWidth = 2;
        g.beginPath(); g.arc(tr.x * k, tr.y * k, 7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.fillText(tc.name + (tr.lost ? ' (sinyal yok)' : ''), tr.x * k, tr.y * k - 16);
      }
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
