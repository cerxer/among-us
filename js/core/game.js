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
    settings: { rolePref: 'random' },
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
      const m = {
        id: ++matchCounter, time: 0, chars: [], bodies: [], tasksTotal: 0, tasksDone: 0,
        emergencyCooldown: C.EMERGENCY_COOLDOWN, sab: SS.Sabotage.create(), meeting: null, lastMeeting: null,
        over: false, winner: null, reason: '', endTime: 0, effects: [], nextBodyId: 1,
        meetings: 0, kills: 0, autopilot: !!opts.autopilot,
      };
      const pref = opts.rolePref || this.settings.rolePref || 'random';
      const others = U.shuffle([1, 2, 3, 4, 5, 6, 7]);
      let imps;
      if (pref === 'impostor') imps = [0, others[0]];
      else if (pref === 'crew') imps = [others[0], others[1]];
      else imps = U.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, C.IMPOSTORS);

      defs.forEach((d, i) => {
        m.chars.push({
          id: i, def: d, name: d.name, color: d.color, isPlayer: i === 0,
          role: imps.indexOf(i) >= 0 ? 'impostor' : 'crew',
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
      return SS.Physics.findFreeSpot(b.x + Math.cos(a) * 150, b.y + Math.sin(a) * 150, SS.C.RADIUS);
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
      const can = this.state === 'PLAYING' && !this.uiBlock && p.inVent === null && p.busyT <= 0;
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
    playerSeesChar(o) {
      const p = this.player();
      if (o === p) return true;
      if (o.inVent !== null) return false;
      if (!o.alive) return false;
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
      if (!k || !k.alive || k.role !== 'impostor' || k.inVent !== null || k.killCd > 0) return false;
      if (!v || v === k || !v.alive || v.role === 'impostor' || v.inVent !== null) return false;
      if (U.dist(k.x, k.y, v.x, v.y) > C.KILL_RANGE) return false;
      if (!SS.Vision.los(k.x, k.y, v.x, v.y)) return false;
      SS.Bots.onKill(m, k, v);
      v.alive = false;
      v.deathT = m.time;
      v.busyT = 0;
      if (v.brain) { SS.Bots.setIdle(v); v.brain.ghostT = U.range(14, 22); }
      const body = { id: m.nextBodyId++, victimId: v.id, x: v.x, y: v.y, room: SS.Map.roomIndexAt(v.x, v.y), t: m.time, reported: false, facing: v.facing };
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
      if (!c.alive || c.inVent !== null) return false;
      if (!body || body.reported || m.bodies.indexOf(body) < 0) return false;
      if (U.dist(c.x, c.y, body.x, body.y) > SS.C.REPORT_RANGE) return false;
      if (!SS.Vision.los(c.x, c.y, body.x, body.y)) return false;
      body.reported = true;
      SS.events.emit('report', { by: c, body });
      SS.Meeting.start(m, { type: 'report', caller: c, body });
      return true;
    },

    canEmergency(c, ignoreRange) {
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
      if (!c.alive || c.role !== 'impostor' || c.inVent !== null || c.ventCd > 0) return false;
      if (U.dist(c.x, c.y, vent.x, vent.y) > SS.C.USE_RANGE + 12) return false;
      SS.Bots.onVent(m, c, vent, 'enter');
      c.inVent = vent.id;
      c.x = vent.x; c.y = vent.y;
      c.ventCd = 0.45;
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
        ctx.use = { kind: 'ventExit', label: 'Çık', desc: 'Havalandırmadan çık' };
        ctx.reportReason = 'Havalandırmadasın';
        ctx.killReason = 'Havalandırmadasın';
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
        if (p.role === 'impostor') {
          M.vents.forEach(v => {
            const d = U.dist(p.x, p.y, v.x, v.y);
            if (d <= C.USE_RANGE + 12) consider({ kind: 'vent', vent: v, label: 'Havalandırma', desc: 'Havalandırmaya gir (' + v.name + ')' }, d);
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
        case 'vent': return this.enterVent(p, u.vent);
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
