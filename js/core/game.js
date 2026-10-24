// Oyun çekirdeği: durum makinesi, maç verisi, oyuncu eylemleri, saldırı/rapor/görev/havalandırma kuralları.
// Bu dosya DOM'a dokunmaz; arayüz SS.events ile haberdar edilir.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;

  const STATES = ['MENU', 'ROLE_REVEAL', 'PLAYING', 'TASK', 'MEETING_DISCUSSION', 'MEETING_VOTE', 'MEETING_RESULT', 'PAUSED', 'GAME_OVER'];
  const PAUSABLE = ['ROLE_REVEAL', 'PLAYING', 'TASK', 'MEETING_DISCUSSION', 'MEETING_VOTE', 'MEETING_RESULT'];
  let matchCounter = 0;

  const G = (SS.Game = {
    STATES,
    state: 'MENU',
    prevState: null,
    savedStateTime: 0,
    stateTime: 0,
    match: null,
    settings: { rolePref: 'random', charKey: 'kirmizi' }, // seçim yoksa Kırmızı
    input: { x: 0, y: 0 },   // arayüzün yazdığı hareket vektörü
    uiBlock: false,           // harita / sabotaj paneli açıkken hareket yok
    activeTask: null,
    ctx: null,                // her kare hesaplanan oyuncu bağlamı

    init() {
      SS.Map.build();
      SS.Path.init();
    },

    setState(s) {
      if (STATES.indexOf(s) < 0) throw new Error('Geçersiz durum: ' + s);
      const from = this.state;
      this.state = s;
      this.stateTime = 0;
      SS.events.emit('state', { from, to: s });
    },

    // ---------------------------------------------------------------- doktor: yaşam belirtileri
    canVitals(c) {
      if (!c || c.sub !== 'doctor') return { ok: false, reason: 'Sadece doktor' };
      if (!c.alive) return { ok: false, reason: 'Hayaletler kullanamaz' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın' };
      if (c.vitalsCd > 0) return { ok: false, reason: 'Şarj ' + Math.ceil(c.vitalsCd) + ' sn' };
      if (c.battery <= 0) return { ok: false, reason: 'Pil bitti' };
      return { ok: true, reason: 'Pil ' + Math.ceil(c.battery) + ' sn' };
    },
    openVitals(c) {
      if (!this.worldActive() || c.vitalsOpen || !this.canVitals(c).ok) return false;
      c.vitalsOpen = true;
      c.busyT = 0;
      SS.events.emit('vitalsOpen', { c });
      return true;
    },
    closeVitals(c, why) {
      if (!c || !c.vitalsOpen) return false;
      c.vitalsOpen = false;
      SS.events.emit('vitalsClosed', { c, why: why || 'closed' });
      return true;
    },
    tickVitals(c, dt) {
      const C = SS.C;
      if (c.vitalsOpen) {
        c.battery = Math.max(0, c.battery - dt);
        if (c.battery <= 0 || !c.alive) { c.vitalsCd = C.VITALS_COOLDOWN; this.closeVitals(c, 'battery'); }
      } else if (c.vitalsCd > 0) {
        c.vitalsCd = Math.max(0, c.vitalsCd - dt);
        if (c.vitalsCd <= 0) c.battery = C.VITALS_BATTERY;
      }
    },
    // Yaşam belirtileri ekranının gösterdiği bilgi: herkesin durumu (konum yok).
    vitals() {
      const m = this.match;
      return m.chars.map(c => ({ id: c.id, status: c.alive ? 'alive' : (c.ejected ? 'ejected' : 'dead') }));
    },
    // ---------------------------------------------------------------- koruyucu melek (hayalet)
    canProtect(c, t) {
      const C = SS.C;
      if (!c || !c.angel) return { ok: false, reason: 'Sadece koruyucu melek' };
      if (c.alive) return { ok: false, reason: 'Öldüğünde melek olursun' };
      if (c.protectCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.protectCd) + ' sn' };
      if (!t) return { ok: false, reason: 'Yaşayan birine yaklaş' };
      if (!t.alive || t.inVent !== null) return { ok: false, reason: 'Korunamaz' };
      if (U.dist(c.x, c.y, t.x, t.y) > C.PROTECT_RANGE) return { ok: false, reason: 'Yaşayan birine yaklaş' };
      return { ok: true, reason: '' };
    },
    protectTargetFor(c) {
      let best = null, bd = 1e9;
      for (const o of this.match.chars) {
        if (o === c || !o.alive || o.inVent !== null) continue;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d <= SS.C.PROTECT_RANGE && d < bd) { best = o; bd = d; }
      }
      const chk = this.canProtect(c, best);
      return chk.ok ? { target: best, reason: '' } : { target: null, reason: chk.reason };
    },
    protect(c, t) {
      if (!this.worldActive() || !this.canProtect(c, t).ok) return false;
      t.shieldT = SS.C.PROTECT_DURATION; t.shieldBy = c.id;
      c.protectCd = SS.C.PROTECT_COOLDOWN;
      SS.events.emit('protect', { angel: c, target: t });
      return true;
    },
    playerProtect() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player(), t = this.protectTargetFor(p);
      if (!t.target) { SS.events.emit('denied', t.reason); return false; }
      return this.protect(p, t.target);
    },

    // ---------------------------------------------------------------- influencer (hayalet)
    // Ölü influencer yaşayan birini takip eder ve ona aynı anda en fazla 3 resimlik mesaj gönderir.
    inflRoll(c) {
      const all = Array.from({ length: SS.INFLUENCE_ICONS.length }, (_, i) => i);
      c.inflChoices = U.shuffle(all).slice(0, SS.C.INFLUENCE_CHOICES);
    },
    // Renk resmi karakter tanımına bağlıdır (maçtaki sıra, oyuncunun seçimine göre değişir).
    inflCharOf(idx) {
      const ic = SS.INFLUENCE_ICONS[idx];
      return ic && ic.type === 'color' ? this.match.chars.find(c => c.def === SS.CHARACTERS[ic.char]) || null : null;
    },
    inflIconOf(c) { return SS.INFLUENCE_ICONS.findIndex(ic => ic.type === 'color' && SS.CHARACTERS[ic.char] === c.def); },
    canInfluence(c) {
      if (!c || !c.influencer) return { ok: false, reason: 'Sadece influencer' };
      if (c.alive) return { ok: false, reason: 'Öldüğünde influencer olursun' };
      return { ok: true, reason: '' };
    },
    inflTargetFor(c) {
      const chk = this.canInfluence(c);
      if (!chk.ok) return { target: null, reason: chk.reason };
      let best = null, bd = 1e9;
      for (const o of this.match.chars) {
        if (o === c || !o.alive || o.inVent !== null) continue;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d <= SS.C.INFLUENCE_RANGE && d < bd) { best = o; bd = d; }
      }
      return best ? { target: best, reason: '' } : { target: null, reason: 'Yaşayan birine yaklaş' };
    },
    inflSnap(c, t) { c.x = t.x - 24 * (t.facing || 1); c.y = t.y - 16; },
    follow(c, t) {
      if (!this.worldActive() || !this.canInfluence(c).ok || !t || t === c || !t.alive) return false;
      c.inflFollow = t.id;
      this.inflSnap(c, t);
      SS.events.emit('inflFollow', { c, target: t });
      return true;
    },
    unfollow(c, why) {
      if (c.inflFollow === null) return;
      const t = this.match.chars[c.inflFollow];
      c.inflFollow = null;
      SS.events.emit('inflUnfollow', { c, target: t, why: why || 'manual' });
    },
    canInflSend(c) {
      const chk = this.canInfluence(c);
      if (!chk.ok) return chk;
      if (c.inflFollow === null) return { ok: false, reason: 'Önce birini takip et' };
      if (c.inflCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.inflCd) + ' sn' };
      return { ok: true, reason: '' };
    },
    // Yenileme yeni 6 resim getirir, karşılığında yarım bekleme süresi verir.
    inflRefresh(c) {
      if (!this.worldActive()) return false;
      const chk = this.canInfluence(c);
      if (!chk.ok || c.inflCd > 0) return false;
      this.inflRoll(c);
      c.inflCd = SS.C.INFLUENCE_COOLDOWN / 2;
      SS.events.emit('inflRefresh', { c });
      return true;
    },
    inflSend(c, icons) {
      if (!this.worldActive() || !this.canInflSend(c).ok) return false;
      const picks = [];
      (icons || []).forEach(i => { if (c.inflChoices.indexOf(i) >= 0 && picks.indexOf(i) < 0) picks.push(i); });
      if (!picks.length || picks.length > SS.C.INFLUENCE_MAX_ICONS) return false;
      const t = this.match.chars[c.inflFollow];
      if (!t || !t.alive) return false;
      t.inbox = { icons: picks, from: c.id, t: SS.C.INFLUENCE_SHOW, at: this.match.time };
      c.inflCd = SS.C.INFLUENCE_COOLDOWN;
      this.inflRoll(c);
      SS.events.emit('influence', { from: c, target: t, icons: picks });
      SS.Bots.onInfluence(this.match, c, t, picks);
      return true;
    },
    tickInfluence(c, dt) {
      if (c.inflCd > 0) c.inflCd = Math.max(0, c.inflCd - dt);
      if (!c.inflChoices.length) this.inflRoll(c);
      if (c.inflFollow !== null) {
        const t = this.match.chars[c.inflFollow];
        if (!t.alive) this.unfollow(c, 'dead');
        else this.inflSnap(c, t);
      }
    },
    playerInflToggle() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player();
      if (p.inflFollow !== null) { this.unfollow(p, 'manual'); return true; }
      const t = this.inflTargetFor(p);
      if (!t.target) { SS.events.emit('denied', t.reason); return false; }
      return this.follow(p, t.target);
    },
    playerInflSend(icons) {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player(), chk = this.canInflSend(p);
      if (!chk.ok) { SS.events.emit('denied', chk.reason); return false; }
      return this.inflSend(p, icons);
    },
    playerInflRefresh() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player();
      if (p.inflCd > 0) { SS.events.emit('denied', 'Bekleme ' + Math.ceil(p.inflCd) + ' sn'); return false; }
      return this.inflRefresh(p);
    },

    // ---------------------------------------------------------------- şekil değiştirici: kılık
    canShift(c, t) {
      if (!c || c.sub !== 'shapeshifter') return { ok: false, reason: 'Sadece şekil değiştirici', label: 'Dönüş' };
      if (!c.alive) return { ok: false, reason: 'Elendin', label: 'Dönüş' };
      if (c.shiftAnim > 0) return { ok: false, reason: 'Dönüşüyor', label: 'Dönüşüyor' };
      if (c.disguise !== null) return { ok: true, reason: this.match.chars[c.disguise].name + ' · ' + Math.ceil(c.shiftLeft) + ' sn', label: 'Geri dön' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın', label: 'Dönüş' };
      if (c.shiftCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.shiftCd) + ' sn', label: 'Dönüş' };
      if (t !== undefined && (!t || t === c || !t.alive)) return { ok: false, reason: 'Yalnızca yaşayan birinin kılığına girebilirsin', label: 'Dönüş' };
      return { ok: true, reason: 'Kılık seç', label: 'Dönüş' };
    },
    shift(c, t) {
      if (!this.worldActive() || c.disguise !== null || !this.canShift(c, t).ok) return false;
      c.shiftAnim = SS.C.SHIFT_ANIM; c.shiftTo = t.id; c.busyT = 0;
      SS.Bots.onShift(this.match, c, t, 'in'); // dönüşümü görenler kanıt kaydeder
      this.match.effects.push({ type: 'puff', x: c.x, y: c.y - 10, t: 0, dur: 0.8 });
      SS.events.emit('shift', { c, target: t, kind: 'in' });
      return true;
    },
    unshift(c) {
      if (c.disguise === null || c.shiftAnim > 0) return false;
      c.shiftAnim = SS.C.SHIFT_ANIM; c.shiftTo = null;
      SS.Bots.onShift(this.match, c, this.match.chars[c.disguise], 'out');
      this.match.effects.push({ type: 'puff', x: c.x, y: c.y - 10, t: 0, dur: 0.8 });
      SS.events.emit('shift', { c, target: null, kind: 'out' });
      return true;
    },
    // Toplantı veya ölüm: animasyonsuz, anında kendi hâline döner.
    revertShift(c) {
      if (c.disguise === null && c.shiftAnim <= 0) return;
      c.disguise = null; c.shiftAnim = 0; c.shiftTo = null; c.shiftLeft = 0;
      c.shiftCd = Math.max(c.shiftCd, SS.C.SHIFT_COOLDOWN_START);
    },
    tickShift(c, dt) {
      const C = SS.C;
      if (!c.alive) { this.revertShift(c); return; }
      if (c.shiftAnim > 0) {
        c.shiftAnim -= dt;
        if (c.shiftAnim <= 0) {
          c.shiftAnim = 0;
          if (c.shiftTo !== null) {
            const t = this.match.chars[c.shiftTo];
            if (t.alive) { c.disguise = t.id; c.shiftLeft = C.SHIFT_DURATION; } else c.shiftCd = C.SHIFT_COOLDOWN;
            c.shiftTo = null;
          } else { c.disguise = null; c.shiftCd = C.SHIFT_COOLDOWN; }
        }
      } else if (c.disguise !== null) {
        c.shiftLeft -= dt;
        if (c.shiftLeft <= 0) this.unshift(c);
      } else if (c.shiftCd > 0) c.shiftCd = Math.max(0, c.shiftCd - dt);
    },
    // Animasyonun ilk yarısında eski, ikinci yarısında yeni görünüm.
    lookOf(c) {
      if (c.shiftAnim > 0) {
        const half = c.shiftAnim < SS.C.SHIFT_ANIM / 2;
        if (c.shiftTo !== null) return half ? this.match.chars[c.shiftTo] : c;
        return half ? c : this.match.chars[c.disguise];
      }
      return this.displayOf(c);
    },
    playerShift(targetId) {
      if (this.state !== 'PLAYING') return false;
      const p = this.player();
      if (p.disguise !== null) return this.unshift(p);
      const t = this.match.chars[targetId];
      const chk = this.canShift(p, t);
      if (!chk.ok) { SS.events.emit('denied', chk.reason); return false; }
      return this.shift(p, t);
    },

    // ---------------------------------------------------------------- fantom: kaybolma / belirme
    canVanish(c) {
      if (!c || c.sub !== 'phantom') return { ok: false, reason: 'Sadece fantom', label: 'Kaybol' };
      if (!c.alive) return { ok: false, reason: 'Elendin', label: 'Kaybol' };
      if (c.fading) return { ok: false, reason: 'Görünürlük değişiyor', label: c.fading === 'out' ? 'Kayboluyor' : 'Beliriyor' };
      if (c.invis) return { ok: true, reason: Math.ceil(c.invisLeft) + ' sn kaldı', label: 'Görün' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın', label: 'Kaybol' };
      if (c.vanishCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.vanishCd) + ' sn', label: 'Kaybol' };
      return { ok: true, reason: 'Görünmez ol', label: 'Kaybol' };
    },
    vanish(c) {
      if (!this.worldActive() || c.invis || c.fading || !this.canVanish(c).ok) return false;
      c.fading = 'out'; c.fadeT = SS.C.VANISH_FADE; c.busyT = 0;
      if (c.vitalsOpen) this.closeVitals(c);
      SS.Bots.onVanish(this.match, c, 'vanish'); // animasyonu görenler kanıt kaydeder
      this.match.effects.push({ type: 'shimmer', x: c.x, y: c.y - 20, t: 0, dur: 0.9, color: c.def.color });
      SS.events.emit('vanish', { c, kind: 'vanish' });
      return true;
    },
    appear(c) {
      if (!c.invis || c.fading) return false;
      c.fading = 'in'; c.fadeT = SS.C.VANISH_FADE;
      SS.Bots.onVanish(this.match, c, 'appear');
      this.match.effects.push({ type: 'shimmer', x: c.x, y: c.y - 20, t: 0, dur: 0.9, color: c.def.color });
      SS.events.emit('vanish', { c, kind: 'appear' });
      return true;
    },
    // Toplantı veya ölüm: animasyonsuz, anında görünür olur.
    forceVisible(c) {
      if (!c.invis && !c.fading) return;
      c.invis = false; c.fading = null; c.fadeT = 0; c.invisLeft = 0;
      c.vanishCd = Math.max(c.vanishCd, SS.C.VANISH_COOLDOWN_START);
    },
    tickPhantom(c, dt) {
      const C = SS.C;
      if (!c.alive) { this.forceVisible(c); return; }
      if (c.fading) {
        c.fadeT -= dt;
        if (c.fadeT <= 0) {
          if (c.fading === 'out') { c.invis = true; c.invisLeft = C.VANISH_DURATION; }
          else { c.invis = false; c.vanishCd = C.VANISH_COOLDOWN; }
          c.fading = null; c.fadeT = 0;
        }
      } else if (c.invis) {
        c.invisLeft -= dt;
        if (c.invisLeft <= 0) this.appear(c);
      } else if (c.vanishCd > 0) c.vanishCd = Math.max(0, c.vanishCd - dt);
    },
    // Görünürlük animasyonunda 0..1 arası saydamlık (1 = tam görünür).
    phantomAlpha(c) {
      const F = SS.C.VANISH_FADE;
      if (c.fading === 'out') return U.clamp(c.fadeT / F, 0, 1);
      if (c.fading === 'in') return U.clamp(1 - c.fadeT / F, 0, 1);
      return c.invis ? 0 : 1;
    },
    playerVanish() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player();
      const chk = this.canVanish(p);
      if (!chk.ok) { SS.events.emit('denied', chk.reason); return false; }
      return p.invis ? this.appear(p) : this.vanish(p);
    },

    // ---------------------------------------------------------------- iz sürücü: iz cihazı
    canTrack(c, t) {
      const C = SS.C;
      if (!c || c.sub !== 'tracker') return { ok: false, reason: 'Sadece iz sürücü' };
      if (!c.alive) return { ok: false, reason: 'Hayaletler iz süremez' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın' };
      if (c.track) return { ok: false, reason: 'Zaten birini izliyorsun' };
      if (c.trackCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.trackCd) + ' sn' };
      if (!t) return { ok: false, reason: 'Menzilde kimse yok' };
      if (t === c || !t.alive || t.inVent !== null) return { ok: false, reason: 'İz sürülemez' };
      if (U.dist(c.x, c.y, t.x, t.y) > C.TRACK_RANGE || !SS.Vision.los(c.x, c.y, t.x, t.y)) return { ok: false, reason: 'Menzilde kimse yok' };
      return { ok: true, reason: '' };
    },
    trackTargetFor(c) {
      const m = this.match;
      let best = null, bd = 1e9;
      for (const o of m.chars) {
        if (o === c || !o.alive || o.inVent !== null) continue;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d > SS.C.TRACK_RANGE || d >= bd || !SS.Vision.los(c.x, c.y, o.x, o.y)) continue;
        best = o; bd = d;
      }
      const chk = this.canTrack(c, best);
      return chk.ok ? { target: best, reason: '' } : { target: null, reason: chk.reason };
    },
    // Cihaz takılır; konum TRACK_DELAY aralıklarla örneklenir (gecikmeli harita).
    startTrack(c, t) {
      if (!this.worldActive() || !this.canTrack(c, t).ok) return false;
      c.track = { id: t.id, left: SS.C.TRACK_DURATION, sampleT: 0, x: t.x, y: t.y, room: SS.Map.roomIndexAt(t.x, t.y), lost: false };
      SS.events.emit('track', { c, target: t });
      return true;
    },
    stopTrack(c, why) {
      if (!c.track) return false;
      const id = c.track.id;
      c.track = null;
      c.trackCd = why === 'meeting' ? SS.C.TRACK_COOLDOWN_START : SS.C.TRACK_COOLDOWN;
      SS.events.emit('trackEnd', { c, targetId: id, why: why || 'manual' });
      return true;
    },
    tickTrack(c, dt) {
      if (!c.track) { if (c.trackCd > 0) c.trackCd = Math.max(0, c.trackCd - dt); return; }
      if (!c.alive) { this.stopTrack(c, 'dead'); return; }
      const tr = c.track, t = this.match.chars[tr.id];
      tr.left -= dt;
      tr.sampleT -= dt;
      if (tr.sampleT <= 0 && !tr.lost) {
        tr.sampleT = SS.C.TRACK_DELAY;
        if (!t.alive) tr.lost = true; // sinyal kesildi: son konum kalır
        else { tr.x = t.x; tr.y = t.y; tr.room = SS.Map.roomIndexAt(t.x, t.y); }
        SS.events.emit('trackSample', { c, target: t, x: tr.x, y: tr.y, room: tr.room, lost: tr.lost });
        if (c.brain) SS.Bots.onTrackSample(this.match, c, t, tr);
      }
      if (tr.left <= 0) this.stopTrack(c, 'expired');
    },
    playerTrack() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player();
      if (p.track) return this.stopTrack(p, 'manual');
      const t = this.trackTargetFor(p);
      if (!t.target) { SS.events.emit('denied', t.reason); return false; }
      return this.startTrack(p, t.target);
    },

    // ---------------------------------------------------------------- dedektif: dava ve sorgu
    openCase(body, reporter) {
      const m = this.match;
      const cs = { id: m.cases.length + 1, victimId: body.victimId, room: body.room, bodyT: body.t, reportT: m.time,
        reporterId: reporter.id, where: body.where || {}, asked: {}, suspects: {} };
      m.cases.push(cs);
      m.activeCase = cs; // aynı anda yalnızca bir dava sorgulanabilir
      m.chars.forEach(c => { if (c.sub === 'detective') { c.caseLeft = SS.C.INTERROGATIONS; c.intCd = 0; } });
      SS.events.emit('caseOpen', cs);
      return cs;
    },
    answerLabel(a) {
      if (a === 'vent') return 'Havalandırmalar';
      return SS.Map.roomInfo(a).name;
    },
    canInterrogate(c, t) {
      const m = this.match, C = SS.C;
      if (!c || c.sub !== 'detective') return { ok: false, reason: 'Sadece dedektif' };
      if (!c.alive) return { ok: false, reason: 'Hayaletler sorgulayamaz' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın' };
      if (!m.activeCase) return { ok: false, reason: 'Henüz rapor edilmiş ceset yok' };
      if (c.caseLeft <= 0) return { ok: false, reason: 'Bu davada sorgu hakkın bitti' };
      if (c.intCd > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(c.intCd) + ' sn' };
      if (!t) return { ok: false, reason: 'Birine temas edecek kadar yaklaş' };
      if (t === c || !t.alive || t.inVent !== null) return { ok: false, reason: 'Sorgulanamaz' };
      if ((m.activeCase.asked[c.id] || {})[t.id] !== undefined) return { ok: false, reason: t.name + ' zaten sorgulandı' };
      if (U.dist(c.x, c.y, t.x, t.y) > C.INTERROGATE_RANGE || !SS.Vision.los(c.x, c.y, t.x, t.y)) return { ok: false, reason: 'Temas etmen gerekiyor' };
      return { ok: true, reason: '' };
    },
    // En yakın uygun hedef; yoksa nedeniyle birlikte döner.
    interrogateTargetFor(c) {
      const m = this.match;
      let best = null, bd = 1e9;
      for (const o of m.chars) {
        if (o === c || !o.alive || o.inVent !== null) continue;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d > SS.C.INTERROGATE_RANGE || d >= bd) continue;
        best = o; bd = d;
      }
      const chk = this.canInterrogate(c, best);
      return chk.ok ? { target: best, reason: '' } : { target: null, reason: chk.reason };
    },
    interrogate(c, t) {
      const m = this.match;
      if (!this.worldActive() || !this.canInterrogate(c, t).ok) return null;
      const cs = m.activeCase;
      const a = cs.where[t.id] !== undefined ? cs.where[t.id] : null;
      (cs.asked[c.id] = cs.asked[c.id] || {})[t.id] = a;
      c.caseLeft--;
      c.intCd = SS.C.INTERROGATE_COOLDOWN;
      const res = { caseId: cs.id, detective: c, target: t, answer: a, label: a === null ? 'Bilinmiyor' : this.answerLabel(a), atBody: a === cs.room };
      SS.events.emit('interrogate', res);
      return res;
    },
    playerInterrogate() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player();
      const t = this.interrogateTargetFor(p);
      if (!t.target) { SS.events.emit('denied', t.reason); return false; }
      return !!this.interrogate(p, t.target);
    },

    playerVitals(open) {
      const p = this.player();
      if (open === false) return this.closeVitals(p);
      if (p.vitalsOpen) return this.closeVitals(p);
      if (this.state !== 'PLAYING') return false;
      const chk = this.canVitals(p);
      if (!chk.ok) { SS.events.emit('denied', chk.reason); return false; }
      return this.openVitals(p);
    },

    // Havalandırmayı hainler ve yaşayan mühendisler kullanabilir.
    canVent(c) { return !!c && c.alive && (c.role === 'impostor' || c.sub === 'engineer'); },

    worldActive() { return this.state === 'PLAYING' || this.state === 'TASK'; },
    player() { return this.match ? this.match.chars[0] : null; },

    startGame(opts) {
      this.newMatch(opts || {});
      this.setState('ROLE_REVEAL');
      return this.match;
    },

    newMatch(opts) {
      opts = opts || {};
      if (opts.seed !== undefined) U.seed(opts.seed);
      const C = SS.C;
      SS.Map.resetDoors();
      SS.Path.clear();
      const defs = U.shuffle(SS.CHARACTERS.slice());
      // Oyuncu kendi karakterini seçer (indeks 0); diğerleri rastgele dağılır.
      const key = opts.charKey !== undefined ? opts.charKey : this.settings.charKey;
      const ci = defs.findIndex(d => d.key === key);
      if (ci > 0) defs.unshift(defs.splice(ci, 1)[0]);
      const m = {
        id: ++matchCounter, time: 0, chars: [], bodies: [], tasksTotal: 0, tasksDone: 0,
        emergencyCooldown: C.EMERGENCY_COOLDOWN, sab: SS.Sabotage.create(), meeting: null, lastMeeting: null,
        over: false, winner: null, reason: '', endTime: 0, effects: [], nextBodyId: 1,
        meetings: 0, kills: 0, autopilot: !!opts.autopilot,
      };
      const pref = opts.rolePref || this.settings.rolePref || 'random';
      const N = SS.CHARACTERS.length, ALL = Array.from({ length: N }, (_, i) => i);
      const others = U.shuffle(ALL.slice(1));
      let imps;
      if (pref === 'impostor' || pref === 'phantom' || pref === 'shapeshifter') imps = [0].concat(others.slice(0, C.IMPOSTORS - 1));
      else if (pref === 'crew' || pref === 'engineer' || pref === 'doctor' || pref === 'detective' || pref === 'tracker' || pref === 'judge' || pref === 'angel' || pref === 'influencer') imps = others.slice(0, C.IMPOSTORS);
      else imps = U.shuffle(ALL.slice()).slice(0, C.IMPOSTORS);
      // Mürettebata özel roller (mühendis, doktor): kim oldukları gizli, sayıları herkesçe bilinir.
      const subOf = {};
      const pool = U.shuffle(ALL.filter(i => imps.indexOf(i) < 0 && (pref === 'random' || i !== 0)));
      [['engineer', C.ENGINEERS], ['doctor', C.DOCTORS], ['detective', C.DETECTIVES], ['tracker', C.TRACKERS], ['judge', C.JUDGES]].forEach(([sub, n]) => {
        for (let k = 0; k < n; k++) {
          if (pref === sub && k === 0) { subOf[0] = sub; continue; }
          const i = pool.find(j => !subOf[j]);
          if (i !== undefined) subOf[i] = sub;
        }
      });
      const subs = Object.keys(subOf).map(k => subOf[k]);
      m.engineers = subs.filter(s => s === 'engineer').length;
      m.doctors = subs.filter(s => s === 'doctor').length;
      m.detectives = subs.filter(s => s === 'detective').length;
      m.trackers = subs.filter(s => s === 'tracker').length;
      m.judges = subs.filter(s => s === 'judge').length;
      // Koruyucu melek ayrı bir hayalet rolüdür: önce özel rolü olmayan mürettebata, yer kalmazsa özel rollülere verilir.
      const angelOf = {};
      if (pref === 'angel' && C.GUARDIAN_ANGELS > 0) angelOf[0] = true;
      const crewPool = U.shuffle(ALL.filter(i => imps.indexOf(i) < 0 && !angelOf[i] && (pref === 'random' || i !== 0)));
      crewPool.sort((a, z) => (subOf[a] ? 1 : 0) - (subOf[z] ? 1 : 0));
      crewPool.slice(0, Math.max(0, C.GUARDIAN_ANGELS - Object.keys(angelOf).length)).forEach(i => { angelOf[i] = true; });
      m.angels = Object.keys(angelOf).length;
      // Influencer da ayrı bir hayalet rolüdür: melek olmayan mürettebattan, önce özel rolsüzlerden seçilir.
      const inflOf = {};
      if (pref === 'influencer' && C.INFLUENCERS > 0) inflOf[0] = true;
      const inflPool = U.shuffle(ALL.filter(i => imps.indexOf(i) < 0 && !angelOf[i] && !inflOf[i] && (pref === 'random' || i !== 0)));
      inflPool.sort((a, z) => (subOf[a] ? 1 : 0) - (subOf[z] ? 1 : 0));
      inflPool.slice(0, Math.max(0, C.INFLUENCERS - Object.keys(inflOf).length)).forEach(i => { inflOf[i] = true; });
      m.influencers = Object.keys(inflOf).length;
      // Hainlerden biri fantom olur (görünmez olabilir).
      // Hainlere özel roller: fantom (görünmez olur) ve şekil değiştirici (kılık değiştirir).
      const impPool = U.shuffle(imps.filter(i => pref === 'random' || i !== 0));
      [['phantom', C.PHANTOMS], ['shapeshifter', C.SHAPESHIFTERS]].forEach(([sub, n]) => {
        for (let k = 0; k < n; k++) {
          if (pref === sub && k === 0) { subOf[0] = sub; continue; }
          const i = impPool.find(j => !subOf[j]);
          if (i !== undefined) subOf[i] = sub;
        }
      });
      m.phantoms = Object.keys(subOf).filter(k => subOf[k] === 'phantom').length;
      m.shapeshifters = Object.keys(subOf).filter(k => subOf[k] === 'shapeshifter').length;
      m.cases = [];
      m.activeCase = null;
      m.engClaims = [];

      defs.forEach((d, i) => {
        m.chars.push({
          id: i, def: d, name: d.name, color: d.color, isPlayer: i === 0,
          role: imps.indexOf(i) >= 0 ? 'impostor' : 'crew',
          sub: subOf[i] || null,
          ventUseCd: C.ENGINEER_VENT_COOLDOWN_START, ventTime: 0,
          battery: C.VITALS_BATTERY, vitalsCd: 0, vitalsOpen: false,
          caseLeft: 0, intCd: 0, judgeLeft: C.JUDGE_USES,
          influencer: !!inflOf[i], inflCd: C.INFLUENCE_COOLDOWN_START, inflFollow: null, inflChoices: [], inbox: null,
          angel: !!angelOf[i], shieldT: 0, shieldBy: null, protectCd: C.PROTECT_COOLDOWN_START,
          track: null, trackCd: C.TRACK_COOLDOWN_START,
          invis: false, fading: null, fadeT: 0, invisLeft: 0, vanishCd: C.VANISH_COOLDOWN_START,
          disguise: null, shiftLeft: 0, shiftCd: C.SHIFT_COOLDOWN_START, shiftAnim: 0, shiftTo: null,
          alive: true, ejected: false, x: 0, y: 0, facing: 1, phase: 0, moving: false,
          tasks: [], emergencyUsed: false, inVent: null, ventCd: 0,
          killCd: C.KILL_COOLDOWN_START, busyT: 0, deathT: null, brain: null, room: -1,
        });
      });
      m.chars.forEach(c => {
        c.tasks = this.pickTasks().map(st => ({ station: st.idx, done: false, fake: c.role === 'impostor' }));
        if (c.role === 'crew') m.tasksTotal += c.tasks.length;
      });
      this.match = m;
      this.placeAtSpawns(m);
      this.activeTask = null;
      this.input.x = this.input.y = 0;
      this.uiBlock = false;
      SS.Bots.init(m);
      this.ctx = this.context();
      SS.events.emit('matchStart', m);
      return m;
    },

    // Her karaktere farklı türde 4 görev (5 tür var).
    pickTasks() {
      const list = U.shuffle(SS.Map.stations.slice());
      const out = [], types = {};
      for (const st of list) {
        if (out.length >= SS.C.TASKS_PER_CREW) break;
        if (!types[st.type]) { types[st.type] = 1; out.push(st); }
      }
      for (const st of list) {
        if (out.length >= SS.C.TASKS_PER_CREW) break;
        if (out.indexOf(st) < 0) out.push(st);
      }
      return out;
    },

    spawnPoint(i, n) {
      const b = SS.Map.button;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      // Halka buton menzilinin içinde kalır: doğduğun yerden acil butona basılabilir.
      return SS.Physics.findFreeSpot(b.x + Math.cos(a) * 140, b.y + Math.sin(a) * 140, SS.C.RADIUS);
    },

    placeAtSpawns(m) {
      m.chars.forEach((c, i) => {
        if (!c.alive) return;
        const p = this.spawnPoint(i, m.chars.length);
        c.x = p.x; c.y = p.y; c.inVent = null; c.moving = false; c.busyT = 0;
        c.facing = p.x < SS.Map.button.x ? 1 : -1;
      });
    },

    // ---------------------------------------------------------------- döngü
    update(dt) {
      this.stateTime += dt;
      const m = this.match;
      switch (this.state) {
        case 'ROLE_REVEAL':
          if (this.stateTime >= SS.C.ROLE_REVEAL_TIME) this.setState('PLAYING');
          break;
        case 'PLAYING':
        case 'TASK':
          this.tickWorld(dt);
          break;
        case 'MEETING_DISCUSSION':
        case 'MEETING_VOTE':
        case 'MEETING_RESULT':
          SS.Meeting.update(m, dt);
          break;
        default:
          break;
      }
      if (m) this.ctx = this.context();
    },

    tickWorld(dt) {
      const m = this.match;
      if (!m || m.over) return;
      m.time += dt;
      if (m.emergencyCooldown > 0) m.emergencyCooldown = Math.max(0, m.emergencyCooldown - dt);
      for (const c of m.chars) {
        c.moving = false;
        if (c.killCd > 0) c.killCd = Math.max(0, c.killCd - dt);
        if (c.busyT > 0) c.busyT = Math.max(0, c.busyT - dt);
        if (c.ventCd > 0) c.ventCd -= dt;
        if (c.sub === 'doctor') this.tickVitals(c, dt);
        if (c.intCd > 0) c.intCd = Math.max(0, c.intCd - dt);
        if (c.shieldT > 0) { c.shieldT = Math.max(0, c.shieldT - dt); if (c.shieldT === 0) c.shieldBy = null; }
        if (c.angel && !c.alive && c.protectCd > 0) c.protectCd = Math.max(0, c.protectCd - dt);
        if (c.inbox) { c.inbox.t -= dt; if (c.inbox.t <= 0) c.inbox = null; }
        if (c.influencer && !c.alive) this.tickInfluence(c, dt);
        if (c.sub === 'tracker') this.tickTrack(c, dt);
        if (c.sub === 'phantom') this.tickPhantom(c, dt);
        if (c.sub === 'shapeshifter') this.tickShift(c, dt);
        if (c.sub === 'engineer') {
          if (c.inVent !== null) {
            c.ventTime += dt;
            if (c.ventTime >= SS.C.ENGINEER_VENT_MAX) { // süre dolunca bulunduğu çıkıştan atılır
              c.ventCd = 0;
              this.exitVent(c);
              if (c.brain) SS.Bots.setIdle(c);
            }
          } else if (c.ventUseCd > 0) c.ventUseCd = Math.max(0, c.ventUseCd - dt);
        }
      }
      if (!m.autopilot) this.updatePlayer(dt);
      SS.Sabotage.update(m, dt);
      if (m.over) return;
      SS.Bots.update(m, dt);
      if (m.over || !this.worldActive()) return;
      SS.Path.process(m.autopilot ? 50 : 4);
      for (const c of m.chars) c.room = SS.Map.roomIndexAt(c.x, c.y);
      for (let i = m.effects.length - 1; i >= 0; i--) {
        const e = m.effects[i]; e.t += dt;
        if (e.t >= e.dur) m.effects.splice(i, 1);
      }
      // Onarım paneli açıkken sabotaj başkası tarafından çözülürse paneli kapat.
      const at = this.activeTask;
      if (this.state === 'TASK' && at && at.kind === 'fix' && !at.completed && !SS.Sabotage.needs(m, at.key)) {
        this.closeTask();
      }
    },

    updatePlayer(dt) {
      const p = this.player();
      if (!p) return;
      let ix = this.input.x, iy = this.input.y;
      const can = this.state === 'PLAYING' && !this.uiBlock && !p.vitalsOpen && p.inVent === null && p.busyT <= 0 && p.inflFollow === null;
      if (!can) { ix = 0; iy = 0; }
      const len = Math.sqrt(ix * ix + iy * iy);
      if (len > 1) { ix /= len; iy /= len; } // çapraz hareket daha hızlı olmasın
      const ghost = !p.alive;
      const sp = ghost ? SS.C.GHOST_SPEED : SS.C.SPEED;
      this.moveChar(p, ix * sp * dt, iy * sp * dt, ghost);
    },

    moveChar(c, dx, dy, noclip) {
      if (dx === 0 && dy === 0) return 0;
      const d = SS.Physics.move(c, dx, dy, !!noclip);
      if (Math.abs(dx) > 0.05) c.facing = dx > 0 ? 1 : -1;
      if (d > 0.05) { c.moving = true; c.phase += d * 0.085; }
      return d;
    },

    // ---------------------------------------------------------------- görüş
    visionRadius(c) {
      const C = SS.C;
      if (!c.alive) return 1e6;
      if (c.role === 'impostor') return C.VISION_IMP;
      const lv = this.match ? this.match.sab.lightLevel : 1;
      return U.lerp(C.VISION_LIGHTS, C.VISION_CREW, lv);
    },
    canSee(c, x, y) {
      if (!c.alive) return true;
      return SS.Vision.sees(c, x, y, this.visionRadius(c));
    },
    // Görünmez fantomu yalnızca hainler ve hayaletler görür (animasyon sırasında herkes görür).
    isHidden(c) { return c.invis && c.fading !== 'in'; },
    hiddenFrom(viewer, c) { return this.isHidden(c) && viewer.alive && viewer.role !== 'impostor'; },
    busyPhantom(c) { return c.invis || c.fading !== null || c.shiftAnim > 0; },
    // Başkalarının gördüğü kimlik: kılık değiştirmişse kılığındaki karakter.
    displayOf(c) { return c.disguise !== null && c.disguise !== undefined ? this.match.chars[c.disguise] : c; },
    playerSeesChar(o) {
      const p = this.player();
      if (o === p) return true;
      if (o.inVent !== null) return false;
      if (!o.alive) return false;
      if (this.hiddenFrom(p, o)) return false;
      return this.canSee(p, o.x, o.y);
    },

    // ---------------------------------------------------------------- kurallar
    killTargetFor(k) {
      const m = this.match;
      let best = null, bd = 1e9;
      for (const v of m.chars) {
        if (v === k || !v.alive || v.role === 'impostor' || v.inVent !== null) continue;
        const d = U.dist(k.x, k.y, v.x, v.y);
        if (d > SS.C.KILL_RANGE || d >= bd) continue;
        if (!SS.Vision.los(k.x, k.y, v.x, v.y)) continue;
        best = v; bd = d;
      }
      return best;
    },

    kill(k, v) {
      const m = this.match, C = SS.C;
      if (!m || m.over || !this.worldActive()) return false;
      if (!k || !k.alive || k.role !== 'impostor' || k.inVent !== null || k.killCd > 0 || this.busyPhantom(k)) return false;
      if (!v || v === k || !v.alive || v.role === 'impostor' || v.inVent !== null) return false;
      if (U.dist(k.x, k.y, v.x, v.y) > C.KILL_RANGE) return false;
      if (!SS.Vision.los(k.x, k.y, v.x, v.y)) return false;
      if (v.shieldT > 0) { // koruyucu meleğin kalkanı saldırıyı engeller
        k.killCd = C.PROTECT_KILL_RESET;
        m.effects.push({ type: 'shield', x: v.x, y: v.y - 20, t: 0, dur: 0.9 });
        SS.Bots.onBlockedKill(m, k, v);
        SS.events.emit('killBlocked', { killer: k, victim: v });
        return false;
      }
      SS.Bots.onKill(m, k, v);
      v.alive = false;
      v.deathT = m.time;
      v.busyT = 0;
      v.vitalsOpen = false;
      this.revertShift(v);
      if (v.brain) { SS.Bots.setIdle(v); v.brain.ghostT = U.range(14, 22); }
      const body = { id: m.nextBodyId++, victimId: v.id, x: v.x, y: v.y, room: SS.Map.roomIndexAt(v.x, v.y), t: m.time, reported: false, facing: v.facing };
      // Cinayet anında herkesin nerede olduğu kaydedilir; dedektifin sorgusu bunu öğrenir.
      body.where = {};
      m.chars.forEach(o => { if (o.alive && o !== v) body.where[o.id] = o.inVent !== null ? 'vent' : SS.Map.roomIndexAt(o.x, o.y); });
      body.where[k.id] = body.room;
      m.bodies.push(body);
      // Çizgi film tarzı kısa atılma: saldıran hedefin yanına sıçrar.
      const sx = k.x, sy = k.y;
      k.x = v.x + (sx < v.x ? -10 : 10); k.y = v.y;
      SS.Physics.resolve(k, C.RADIUS);
      k.killCd = C.KILL_COOLDOWN;
      m.kills++;
      m.effects.push({ type: 'bonk', x: v.x, y: v.y - 10, t: 0, dur: 0.9 });
      if (v.isPlayer && this.state === 'TASK') this.closeTask();
      SS.events.emit('kill', { killer: k, victim: v, body });
      this.checkWin();
      return true;
    },

    nearestBodyFor(c) {
      const m = this.match;
      let best = null, bd = 1e9;
      for (const b of m.bodies) {
        if (b.reported) continue;
        const d = U.dist(c.x, c.y, b.x, b.y);
        if (d > SS.C.REPORT_RANGE || d >= bd) continue;
        if (!SS.Vision.sees(c, b.x, b.y, Math.max(SS.C.REPORT_RANGE, this.visionRadius(c)))) continue;
        best = b; bd = d;
      }
      return best;
    },

    report(c, body) {
      const m = this.match;
      if (!m || m.over || !this.worldActive()) return false;
      if (!c.alive || c.inVent !== null || this.busyPhantom(c)) return false;
      if (!body || body.reported || m.bodies.indexOf(body) < 0) return false;
      if (U.dist(c.x, c.y, body.x, body.y) > SS.C.REPORT_RANGE) return false;
      if (!SS.Vision.los(c.x, c.y, body.x, body.y)) return false;
      body.reported = true;
      this.openCase(body, c);
      SS.events.emit('report', { by: c, body });
      SS.Meeting.start(m, { type: 'report', caller: c, body });
      return true;
    },

    canEmergency(c, ignoreRange) {
      if (this.busyPhantom(c)) return { ok: false, reason: 'Görünmezken kullanamazsın' };
      const m = this.match;
      if (!c.alive) return { ok: false, reason: 'Hayaletler toplantı çağıramaz' };
      if (c.inVent !== null) return { ok: false, reason: 'Havalandırmadasın' };
      if (c.emergencyUsed) return { ok: false, reason: 'Acil toplantı hakkını kullandın' };
      if (m.sab.active === 'oxygen') return { ok: false, reason: 'Oksijen krizi sürerken çağrılamaz' };
      if (m.emergencyCooldown > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(m.emergencyCooldown) + ' sn' };
      if (!ignoreRange && U.dist(c.x, c.y, SS.Map.button.x, SS.Map.button.y) > SS.C.BUTTON_RANGE) return { ok: false, reason: 'Butona yaklaş' };
      return { ok: true, reason: '' };
    },

    callEmergency(c) {
      const m = this.match;
      if (!m || m.over || !this.worldActive()) return false;
      if (!this.canEmergency(c).ok) return false;
      c.emergencyUsed = true;
      SS.Meeting.start(m, { type: 'emergency', caller: c });
      return true;
    },

    completeTask(c, idx) {
      const m = this.match;
      if (!m || m.over || !this.worldActive()) return false;
      const t = c.tasks[idx];
      if (!t || t.done) return false;
      t.done = true;
      if (c.sub === 'doctor') { // görev pili şarj eder ve şarj beklemesini bitirir
        c.battery = Math.min(SS.C.VITALS_BATTERY, c.battery + SS.C.VITALS_TASK_RECHARGE);
        c.vitalsCd = 0;
      }
      if (!t.fake && c.role === 'crew') {
        m.tasksDone = Math.min(m.tasksTotal, m.tasksDone + 1);
        SS.events.emit('taskComplete', { c, task: t });
        this.checkWin();
      }
      return true;
    },

    fixPanel(c, key) {
      const m = this.match;
      if (!m || m.over || !this.worldActive() || !c.alive) return false;
      return SS.Sabotage.fix(m, key, c);
    },

    enterVent(c, vent) {
      const m = this.match;
      if (!m || !this.worldActive()) return false;
      if (!this.canVent(c) || c.inVent !== null || c.ventCd > 0 || this.busyPhantom(c)) return false;
      if (c.sub === 'engineer' && c.ventUseCd > 0) return false;
      if (U.dist(c.x, c.y, vent.x, vent.y) > SS.C.USE_RANGE + 12) return false;
      SS.Bots.onVent(m, c, vent, 'enter');
      c.inVent = vent.id;
      c.x = vent.x; c.y = vent.y;
      c.ventCd = 0.45;
      c.ventTime = 0;
      c.busyT = 0;
      m.effects.push({ type: 'puff', x: vent.x, y: vent.y, t: 0, dur: 0.6 });
      SS.events.emit('vent', { c, vent, kind: 'enter' });
      return true;
    },

    moveVent(c, toId) {
      if (c.inVent === null || c.ventCd > 0 || !this.worldActive()) return false;
      const cur = SS.Map.vents[c.inVent];
      if (cur.links.indexOf(toId) < 0) return false;
      const v = SS.Map.vents[toId];
      c.inVent = toId; c.x = v.x; c.y = v.y; c.ventCd = 0.3;
      SS.events.emit('vent', { c, vent: v, kind: 'move' });
      return true;
    },

    exitVent(c, force) {
      const m = this.match;
      if (c.inVent === null) return false;
      if (!force && (c.ventCd > 0 || !this.worldActive())) return false;
      const v = SS.Map.vents[c.inVent];
      c.inVent = null;
      if (c.sub === 'engineer') { c.ventUseCd = SS.C.ENGINEER_VENT_COOLDOWN; c.ventTime = 0; }
      const p = SS.Physics.findFreeSpot(v.x, v.y, SS.C.RADIUS);
      c.x = p.x; c.y = p.y;
      c.ventCd = 0.45;
      if (!force) {
        SS.Bots.onVent(m, c, v, 'exit');
        m.effects.push({ type: 'puff', x: v.x, y: v.y, t: 0, dur: 0.6 });
        SS.events.emit('vent', { c, vent: v, kind: 'exit' });
      }
      return true;
    },

    // ---------------------------------------------------------------- oyuncu bağlamı
    context() {
      const m = this.match, p = this.player(), C = SS.C, M = SS.Map;
      const ctx = { use: null, useReason: '', report: null, reportReason: '', kill: null, killReason: '', killCd: 0, canSab: false, inVent: false };
      if (!m || !p) return ctx;
      const ghost = !p.alive;
      if (p.role === 'impostor') { ctx.killCd = p.killCd; ctx.canSab = p.alive; }
      if (p.inVent !== null) {
        ctx.inVent = true;
        const left = p.sub === 'engineer' ? ' (kalan ' + Math.max(0, Math.ceil(SS.C.ENGINEER_VENT_MAX - p.ventTime)) + ' sn)' : '';
        ctx.use = { kind: 'ventExit', label: 'Çık', desc: 'Havalandırmadan çık' + left };
        ctx.reportReason = 'Havalandırmadasın';
        ctx.killReason = 'Havalandırmadasın';
        return ctx;
      }
      if (p.sub === 'phantom' && p.alive) ctx.vanish = this.canVanish(p);
      if (p.sub === 'shapeshifter' && p.alive) ctx.shift = this.canShift(p);
      if (p.alive && this.busyPhantom(p)) {
        const r = p.shiftAnim > 0 ? 'Dönüşüyor' : p.invis && !p.fading ? 'Görünmezken kullanamazsın' : 'Görünürlük değişiyor';
        ctx.useReason = r; ctx.reportReason = r; ctx.killReason = p.invis && !p.fading ? 'Görünmezken saldıramazsın' : r;
        return ctx;
      }
      let best = null, bd = 1e9;
      const consider = (o, d) => { if (d < bd) { best = o; bd = d; } };
      if (!(ghost && p.role === 'impostor')) {
        p.tasks.forEach((t, i) => {
          if (t.done) return;
          const st = M.stations[t.station];
          const d = U.dist(p.x, p.y, st.x, st.y);
          if (d > C.USE_RANGE) return;
          if (!ghost && !SS.Vision.los(p.x, p.y, st.x, st.y)) return;
          consider({ kind: t.fake ? 'fake' : 'task', idx: i, station: st, label: t.fake ? 'Sahte görev' : 'Görev', desc: st.name + ' — ' + M.roomById[st.room].name }, d);
        });
      }
      if (!ghost) {
        ['lights', 'o2a', 'o2b'].forEach(k => {
          if (!SS.Sabotage.needs(m, k)) return;
          const pn = M.panels[k];
          const d = U.dist(p.x, p.y, pn.x, pn.y);
          if (d <= C.USE_RANGE && SS.Vision.los(p.x, p.y, pn.x, pn.y)) consider({ kind: 'fix', key: k, panel: pn, label: 'Onar', desc: pn.name }, d - 30);
        });
        const db = U.dist(p.x, p.y, M.button.x, M.button.y);
        if (db <= C.BUTTON_RANGE) {
          const chk = this.canEmergency(p, true);
          consider({ kind: 'button', label: 'Toplantı', desc: 'Acil toplantı butonu', disabled: !chk.ok, reason: chk.reason }, db - 60);
        }
        if (this.canVent(p)) {
          const cd = p.sub === 'engineer' ? p.ventUseCd : 0;
          M.vents.forEach(v => {
            const d = U.dist(p.x, p.y, v.x, v.y);
            if (d > C.USE_RANGE + 12) return;
            if (cd > 0) consider({ kind: 'vent', vent: v, label: 'Havalandırma', desc: 'Havalandırma', disabled: true, reason: 'Havalandırma bekleme ' + Math.ceil(cd) + ' sn' }, d);
            else consider({ kind: 'vent', vent: v, label: 'Havalandırma', desc: 'Havalandırmaya gir (' + v.name + ')' }, d);
          });
        }
      }
      ctx.use = best;
      if (!best) ctx.useReason = ghost ? (p.role === 'crew' ? 'Görev noktasına git' : 'Maçı izliyorsun') : 'Yakında kullanılacak bir şey yok';
      if (ghost) ctx.reportReason = 'Hayaletler rapor edemez';
      else {
        ctx.report = this.nearestBodyFor(p);
        if (!ctx.report) ctx.reportReason = 'Yakında ceset yok';
      }
      if (p.role === 'impostor') {
        if (ghost) ctx.killReason = 'Elendin';
        else if (p.killCd > 0) ctx.killReason = 'Bekleme ' + Math.ceil(p.killCd) + ' sn';
        else {
          ctx.kill = this.killTargetFor(p);
          if (!ctx.kill) ctx.killReason = 'Menzilde hedef yok';
        }
      } else ctx.killReason = 'Sadece hainler';
      if (p.sub === 'doctor') ctx.vitals = this.canVitals(p);
      if (p.angel && !p.alive) {
        const t = this.protectTargetFor(p);
        ctx.protect = t.target; ctx.protectReason = t.reason;
      }
      if (p.influencer && !p.alive) {
        const following = p.inflFollow !== null ? m.chars[p.inflFollow] : null;
        const t = following ? null : this.inflTargetFor(p);
        ctx.infl = { following, target: t ? t.target : null, reason: t ? t.reason : '', send: this.canInflSend(p) };
      }
      if (p.sub === 'tracker') {
        if (p.track) ctx.track = { untrack: true };
        else { const t = this.trackTargetFor(p); ctx.track = t.target ? { target: t.target } : null; ctx.trackReason = t.reason; }
      }
      if (p.sub === 'detective') {
        const t = this.interrogateTargetFor(p);
        ctx.interrogate = t ? t.target : null;
        ctx.intReason = t ? t.reason : '';
      }
      return ctx;
    },

    // ---------------------------------------------------------------- oyuncu eylemleri
    playerUse() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const p = this.player(), ctx = this.context(), u = ctx.use;
      if (p.busyT > 0) return false;
      if (!u) { SS.events.emit('denied', ctx.useReason); return false; }
      switch (u.kind) {
        case 'task': return this.openTask({ kind: 'task', idx: u.idx, type: u.station.type, station: u.station });
        case 'fake':
          p.busyT = SS.C.FAKE_TASK_TIME;
          p.tasks[u.idx].done = true;
          SS.events.emit('fakeTask', { c: p, station: u.station });
          return true;
        case 'fix': return this.openTask({ kind: 'fix', key: u.key, type: u.key === 'lights' ? 'lights' : 'keypad' });
        case 'button':
          if (u.disabled) { SS.events.emit('denied', u.reason); return false; }
          return this.callEmergency(p);
        case 'vent':
          if (u.disabled) { SS.events.emit('denied', u.reason); return false; }
          return this.enterVent(p, u.vent);
        case 'ventExit': return this.exitVent(p);
      }
      return false;
    },
    playerReport() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const ctx = this.context();
      if (!ctx.report) { SS.events.emit('denied', ctx.reportReason); return false; }
      return this.report(this.player(), ctx.report);
    },
    playerKill() {
      if (this.state !== 'PLAYING' || this.uiBlock) return false;
      const ctx = this.context();
      if (!ctx.kill) { if (this.player().role === 'impostor') SS.events.emit('denied', ctx.killReason); return false; }
      return this.kill(this.player(), ctx.kill);
    },
    playerSabotage(type, roomIndex) {
      const p = this.player();
      if (!this.worldActive() || !p.alive || p.role !== 'impostor') return false;
      return SS.Sabotage.start(this.match, type, roomIndex, p);
    },
    playerVentMove(toId) { return this.moveVent(this.player(), toId); },

    openTask(at) {
      if (this.state !== 'PLAYING') return false;
      this.activeTask = at;
      at.completed = false;
      this.setState('TASK');
      SS.events.emit('taskOpen', at);
      return true;
    },
    completeActiveTask() {
      const at = this.activeTask;
      if (!at || at.completed || this.state !== 'TASK') return false;
      at.completed = true;
      const p = this.player();
      if (at.kind === 'task') return this.completeTask(p, at.idx);
      if (at.kind === 'fix') return this.fixPanel(p, at.key);
      return false;
    },
    closeTask() {
      this.activeTask = null;
      if (this.state === 'TASK') this.setState('PLAYING');
      SS.events.emit('taskClose', {});
    },

    pause() {
      if (PAUSABLE.indexOf(this.state) < 0) return false;
      this.prevState = this.state;
      this.savedStateTime = this.stateTime;
      this.setState('PAUSED');
      return true;
    },
    resume() {
      if (this.state !== 'PAUSED') return false;
      const s = this.prevState || 'PLAYING';
      this.setState(s);
      this.stateTime = this.savedStateTime;
      return true;
    },
    toMenu() {
      this.activeTask = null;
      this.uiBlock = false;
      if (this.match) this.match.over = true;
      SS.Map.resetDoors();
      SS.Path.clear();
      this.setState('MENU');
    },

    // ---------------------------------------------------------------- zafer
    checkWin() {
      const m = this.match;
      if (!m || m.over) return null;
      let imp = 0, crew = 0;
      for (const c of m.chars) if (c.alive) { if (c.role === 'impostor') imp++; else crew++; }
      if (imp === 0) return this.endGame('crew', 'Bütün hainler elendi!');
      if (m.tasksDone >= m.tasksTotal) return this.endGame('crew', 'Bütün görevler tamamlandı!');
      if (imp >= crew) return this.endGame('impostor', 'Hainler mürettebatı alt etti!');
      return null;
    },
    endGame(winner, reason) {
      const m = this.match;
      if (!m || m.over) return null; // sonuç yalnızca bir kez oluşur
      m.over = true;
      m.winner = winner;
      m.reason = reason;
      m.endTime = m.time;
      this.activeTask = null;
      this.uiBlock = false;
      this.setState('GAME_OVER');
      SS.events.emit('gameOver', { winner, reason, match: m });
      return winner;
    },
  });
})();
