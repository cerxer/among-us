// Bot yapay zekâsı. Adil bilgi: her bot yalnızca kendi gördüğünü ve toplantıda duyduğunu bilir.
// Mürettebat botları gizli rol listesini okumaz; hain botlar yalnızca takım arkadaşını tanır.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;

  function addSusp(b, id, v) { b.susp[id] = U.clamp((b.susp[id] || 0) + v, -60, 120); }
  function loc(idx) { return SS.Map.roomInfo(idx).loc; }

  const B = (SS.Bots = {
    init(m) {
      m.chars.forEach(c => {
        c.brain = (!c.isPlayer || m.autopilot) ? B.newBrain(c) : null;
      });
    },

    newBrain(c) {
      return {
        mode: 'wait', waitT: U.range(0.3, 1.6), thinkT: 0, perceiveT: U.range(0, 0.25),
        goal: null, path: null, pathIdx: 0, pathPending: false, pathToken: 0, needRepath: false,
        stuckT: 0, lastX: c.x, lastY: c.y, repaths: 0,
        taskIdx: -1, station: null, target: null, body: null, fixKey: null, vent: null,
        huntT: 0, checkT: 0, repathT: 0, patience: U.range(SS.C.IMP_PATIENCE[0], SS.C.IMP_PATIENCE[1]), ventHops: 0, ventT: 0, ventTries: 0,
        wantButton: false, reactT: 0, ghostT: 0,
        vitalsT: U.range(15, 30), vAlive: {}, knownDead: new Set(),
        seen: [], events: [], lastSeen: {}, roomLog: [], susp: {}, knownBodies: new Set(),
      };
    },

    isTeammate(c, o) { return c.role === 'impostor' && o.role === 'impostor'; },

    update(m, dt) {
      B.teamSabotage(m, dt);
      for (const c of m.chars) {
        if (!c.brain) continue;
        if (!SS.Game.worldActive() || m.over) return;
        if (!c.alive) { B.ghostWork(m, c, dt); if (c.angel) B.angelWork(m, c, dt); if (c.influencer) B.influencerWork(m, c, dt); continue; }
        B.updateBot(m, c, dt);
      }
    },

    // Ölü mürettebat botlarının kalan görevleri arka planda tamamlanır.
    ghostWork(m, c, dt) {
      if (c.role !== 'crew') return;
      const b = c.brain;
      b.ghostT -= dt;
      if (b.ghostT <= 0) {
        b.ghostT = U.range(14, 22);
        const i = c.tasks.findIndex(t => !t.done);
        if (i >= 0) SS.Game.completeTask(c, i);
      }
    },

    updateBot(m, c, dt) {
      const b = c.brain;
      b.perceiveT -= dt;
      if (b.perceiveT <= 0) { b.perceiveT = 0.25; B.perceive(m, c); }
      if (c.inVent !== null) { B.ventLogic(m, c, dt); return; }
      if (c.sub === 'phantom' && c.invis && !c.fading && SS.C.VANISH_DURATION - c.invisLeft > 3 && !B.wouldBeSeen(m, c)) SS.Game.appear(c);
      if (c.sub === 'shapeshifter' && c.disguise !== null && c.shiftAnim <= 0 && c.brain.mode !== 'hunt' && SS.C.SHIFT_DURATION - c.shiftLeft > 8 && !B.wouldBeSeen(m, c)) SS.Game.unshift(c);
      if (c.sub === 'doctor' && ['report', 'reportDelay', 'fix', 'fixing', 'button', 'vitals'].indexOf(b.mode) < 0) {
        b.vitalsT -= dt;
        if (b.vitalsT <= 0) {
          b.vitalsT = U.range(25, 45);
          if (SS.Game.openVitals(c)) { B.setIdle(c); b.mode = 'vitals'; b.waitT = U.range(1.5, 2.5); }
        }
      }
      if (c.sub === 'tracker' && !c.track && c.trackCd <= 0) B.maybeTrack(m, c);
      b.thinkT -= dt;
      if (b.thinkT <= 0) {
        b.thinkT = 0.5;
        if (c.role === 'crew') B.thinkCrew(m, c); else B.thinkImp(m, c);
      }
      if (b.mode === 'idle') { if (c.role === 'crew') B.thinkCrew(m, c); else B.thinkImp(m, c); }
      B.act(m, c, dt);
    },

    // ---------------------------------------------------------------- algı
    perceive(m, c) {
      const b = c.brain, G = SS.Game, R = G.visionRadius(c);
      const myRoom = SS.Map.roomIndexAt(c.x, c.y);
      const lr = b.roomLog[b.roomLog.length - 1];
      if (!lr || lr.room !== myRoom || m.time - lr.t > 3) {
        b.roomLog.push({ t: m.time, room: myRoom });
        if (b.roomLog.length > 90) b.roomLog.shift();
      }
      for (const o of m.chars) {
        if (o === c || !o.alive || o.inVent !== null || SS.Game.hiddenFrom(c, o)) continue;
        if (!SS.Vision.sees(c, o.x, o.y, R)) continue;
        // Kılık değiştirmiş biri, kılığındaki kişi olarak kaydedilir (bot gerçeği bilemez).
        const vid = SS.Game.displayOf(o).id;
        if (vid === c.id) continue;
        const room = SS.Map.roomIndexAt(o.x, o.y);
        const ls = b.lastSeen[vid];
        b.lastSeen[vid] = { t: m.time, room };
        if (!ls || ls.room !== room || m.time - ls.t > 4) {
          b.seen.push({ t: m.time, id: vid, room, withMe: room === myRoom });
          if (b.seen.length > 260) b.seen.shift();
        }
      }
      if (c.role !== 'crew') return;
      for (const body of m.bodies) {
        if (body.reported || b.knownBodies.has(body.id)) continue;
        if (!SS.Vision.sees(c, body.x, body.y, R)) continue;
        b.knownBodies.add(body.id);
        b.knownDead.add(body.victimId);
        b.events.push({ type: 'body', t: m.time, room: body.room, victim: body.victimId, bodyId: body.id });
        const nearIds = new Set();
        for (const o of m.chars) {
          if (o === c || !o.alive || o.inVent !== null || SS.Game.hiddenFrom(c, o)) continue;
          const vid = SS.Game.displayOf(o).id;
          if (vid !== c.id && U.dist(o.x, o.y, body.x, body.y) < 200 && SS.Vision.sees(c, o.x, o.y, R)) { addSusp(b, vid, 20); nearIds.add(vid); }
        }
        const recent = new Set();
        for (const s of b.seen) if (s.room === body.room && body.room >= 0 && m.time - s.t < 25 && s.id !== c.id) recent.add(s.id);
        recent.forEach(id => { if (!nearIds.has(id)) addSusp(b, id, 10); });
        if (b.mode !== 'report' && b.mode !== 'reportDelay') {
          B.setIdle(c);
          b.mode = 'reportDelay';
          b.body = body;
          b.reactT = U.range(0.3, 1.0);
        }
      }
    },

    witnesses(m, imp, target) {
      let n = 0;
      for (const o of m.chars) {
        if (o === imp || o === target || !o.alive || o.inVent !== null || o.role === 'impostor') continue;
        const R = SS.Game.visionRadius(o);
        const seesImp = !SS.Game.hiddenFrom(o, imp) && SS.Vision.sees(o, imp.x, imp.y, R);
        if (seesImp || (target && SS.Vision.sees(o, target.x, target.y, R))) n++;
      }
      return n;
    },

    // Saldırıya tanıklık: saldıranı gören mürettebat botları kesin kanıt kaydeder.
    onKill(m, k, v) {
      for (const c of m.chars) {
        if (!c.brain || !c.alive || c === k || c === v || c.inVent !== null || c.role !== 'crew') continue;
        const R = SS.Game.visionRadius(c);
        const kid = SS.Game.displayOf(k).id; // kılıktaki hain, kılığındaki kişiyi suçlu gösterir
        if (kid !== c.id && SS.Vision.sees(c, k.x, k.y, R)) {
          c.brain.events.push({ type: 'kill', t: m.time, room: SS.Map.roomIndexAt(v.x, v.y), who: kid, victim: v.id });
          c.brain.susp[kid] = Math.max(c.brain.susp[kid] || 0, 100);
          c.brain.knownDead.add(v.id);
        }
      }
    },

    onVent(m, c, vent, kind) {
      for (const o of m.chars) {
        if (!o.brain || !o.alive || o === c || o.inVent !== null || o.role !== 'crew') continue;
        if (!SS.Vision.sees(o, c.x, c.y, SS.Game.visionRadius(o))) continue;
        const vid = SS.Game.displayOf(c).id;
        if (vid === o.id) continue;
        o.brain.events.push({ type: 'vent', t: m.time, room: SS.Map.roomIndexAt(vent.x, vent.y), who: vid, kind });
        // Mühendis varken havalandırma kullanmak tek başına kesin kanıt değildir.
        o.brain.susp[vid] = Math.max(o.brain.susp[vid] || 0, m.engineers ? 55 : 90);
        if (!o.emergencyUsed && (!m.engineers || U.chance(0.35))) o.brain.wantButton = true;
      }
    },

    onSabotageStart(m) {
      const s = m.sab;
      const crew = m.chars.filter(c => c.brain && c.alive && c.role === 'crew');
      const assign = (key, n, extra) => {
        const p = SS.Map.panels[key];
        crew.slice().sort((a, b) => U.dist(a.x, a.y, p.x, p.y) - U.dist(b.x, b.y, p.x, p.y))
          .forEach((c, i) => { if (!c.brain.fixKey && (i < n || U.chance(extra))) c.brain.fixKey = key; });
      };
      if (s.active === 'lights') assign('lights', 2, 0.2);
      else if (s.active === 'oxygen') { assign('o2a', 2, 0.2); assign('o2b', 2, 0.2); }
    },

    // ---------------------------------------------------------------- hareket
    setIdle(c) {
      const b = c.brain;
      if (!b) return;
      b.mode = 'idle';
      b.path = null; b.goal = null; b.pathPending = false; b.pathToken++;
      b.target = null;
      c.busyT = 0;
    },
    wait(c, t) { B.setIdle(c); c.brain.mode = 'wait'; c.brain.waitT = t; },

    goTo(c, x, y) {
      const b = c.brain;
      b.goal = { x, y };
      b.stuckT = 0; b.lastX = c.x; b.lastY = c.y; b.repaths = 0;
      SS.Path.request(c, x, y);
    },

    follow(m, c, dt) {
      const b = c.brain;
      if (b.needRepath && b.goal) { b.needRepath = false; SS.Path.request(c, b.goal.x, b.goal.y); }
      if (b.pathPending) return 'waiting';
      if (!b.path) return 'nopath';
      if (b.pathIdx >= b.path.length) return 'arrived';
      const wp = b.path[b.pathIdx];
      const dx = wp.x - c.x, dy = wp.y - c.y, d = Math.sqrt(dx * dx + dy * dy);
      const step = SS.C.SPEED * dt;
      if (d <= Math.max(3, step)) {
        SS.Game.moveChar(c, dx, dy);
        b.pathIdx++;
        if (b.pathIdx >= b.path.length) return 'arrived';
      } else {
        SS.Game.moveChar(c, (dx / d) * step, (dy / d) * step);
      }
      // Takılma algılama: bir saniyede yeterince ilerlemediyse yeniden rota hesapla.
      b.stuckT += dt;
      if (b.stuckT >= 1) {
        const moved = U.dist(c.x, c.y, b.lastX, b.lastY);
        b.stuckT = 0; b.lastX = c.x; b.lastY = c.y;
        if (moved < 16) {
          b.repaths++;
          if (b.repaths > 3) { b.repaths = 0; b.path = null; return 'nopath'; }
          SS.Path.request(c, b.goal.x, b.goal.y);
          return 'waiting';
        }
        b.repaths = 0;
      }
      return 'moving';
    },

    nearestUndoneTask(c) {
      let best = -1, bd = 1e9;
      c.tasks.forEach((t, i) => {
        if (t.done) return;
        const st = SS.Map.stations[t.station];
        const d = U.dist(c.x, c.y, st.bx, st.by) + U.range(0, 400);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    },

    wander(c) {
      const b = c.brain;
      const rooms = SS.Map.rooms.filter(r => r.index !== SS.Map.roomIndexAt(c.x, c.y));
      const r = U.pick(rooms);
      b.mode = 'wander';
      const p = SS.Physics.findFreeSpot(r.cx + U.range(-80, 80), r.cy + U.range(-60, 60), SS.C.RADIUS);
      B.goTo(c, p.x, p.y);
    },

    // ---------------------------------------------------------------- karar: mürettebat
    thinkCrew(m, c) {
      const b = c.brain, G = SS.Game, M = SS.Map;
      if (b.mode === 'report' || b.mode === 'reportDelay') {
        if (!b.body || b.body.reported || m.bodies.indexOf(b.body) < 0) B.setIdle(c);
        else return;
      }
      if (b.fixKey && !SS.Sabotage.needs(m, b.fixKey)) {
        const other = b.fixKey === 'o2a' ? 'o2b' : b.fixKey === 'o2b' ? 'o2a' : null;
        b.fixKey = (other && SS.Sabotage.needs(m, other) && U.chance(0.6)) ? other : null;
        if (b.mode === 'fix' || b.mode === 'fixing') B.setIdle(c);
      }
      if (b.fixKey) {
        if (b.mode !== 'fix' && b.mode !== 'fixing') {
          B.setIdle(c);
          b.mode = 'fix';
          const p = M.panels[b.fixKey];
          B.goTo(c, p.bx, p.by);
        }
        return;
      }
      if (b.wantButton) {
        const chk = G.canEmergency(c, true);
        if (chk.ok) {
          if (b.mode !== 'button') { B.setIdle(c); b.mode = 'button'; B.goTo(c, M.button.x, M.button.y + 108); }
          return;
        }
        if (c.emergencyUsed) b.wantButton = false;
      }
      if (b.mode === 'idle' && c.sub === 'detective' && B.planInterrogation(m, c)) return;
      if (b.mode === 'idle') {
        const i = B.nearestUndoneTask(c);
        if (i >= 0) {
          const st = M.stations[c.tasks[i].station];
          const sc = c.sub === 'engineer' && c.ventUseCd <= 0 && U.chance(0.85) ? B.ventShortcut(c, st.bx, st.by) : null;
          if (sc) {
            b.mode = 'toVent'; b.vent = sc.from; b.ventTarget = sc.to;
            B.goTo(c, sc.from.x, sc.from.y);
            return;
          }
          b.mode = 'task'; b.taskIdx = i;
          B.goTo(c, st.bx, st.by);
        } else B.wander(c);
      }
    },

    // Kaybolma/belirme animasyonunu gören mürettebat botu neredeyse kesin kanıt kaydeder (bunu yalnızca hain yapabilir).
    // Dönüşümü gören bot gerçek kimliği öğrenir ve kılığına girilen kişiyi aklar.
    // Engellenen saldırıya tanık olan bot, saldırganı (görünen kimliğiyle) kesin şüpheli sayar.
    onBlockedKill(m, k, v) {
      for (const c of m.chars) {
        if (!c.brain || !c.alive || c === k || c.inVent !== null || c.role !== 'crew') continue;
        const kid = SS.Game.displayOf(k).id;
        if (kid === c.id || !SS.Vision.sees(c, k.x, k.y, SS.Game.visionRadius(c))) continue;
        c.brain.events.push({ type: 'attack', t: m.time, room: SS.Map.roomIndexAt(v.x, v.y), who: kid, victim: v.id });
        c.brain.susp[kid] = Math.max(c.brain.susp[kid] || 0, 100);
        if (!c.emergencyUsed) c.brain.wantButton = true;
      }
      // Kurban da saldıranı gördü.
      if (v.brain && v.role === 'crew' && v.alive) {
        const kid = SS.Game.displayOf(k).id;
        v.brain.events.push({ type: 'attack', t: m.time, room: SS.Map.roomIndexAt(v.x, v.y), who: kid, victim: v.id });
        v.brain.susp[kid] = Math.max(v.brain.susp[kid] || 0, 100);
        if (!v.emergencyUsed) v.brain.wantButton = true;
      }
    },
    // Influencer bot (hayalet): hainleri görür; bir mürettebatı takip edip ona en yakın haini resimlerle işaret eder.
    // Yalnızca o an sunulan 6 resmi kullanabilir; uygun resim yoksa yeniler (yarım bekleme cezası).
    influencerWork(m, c, dt) {
      const b = c.brain, G = SS.Game, I = SS.INFLUENCE_ICONS;
      b.inflT = (b.inflT || U.range(1, 3)) - dt;
      if (b.inflT > 0) return;
      b.inflT = U.range(1.5, 3.5);
      const imps = m.chars.filter(o => o.alive && o.role === 'impostor');
      if (!imps.length) return;
      let t = c.inflFollow !== null ? m.chars[c.inflFollow] : null;
      if (!t || !t.alive) {
        const crew = m.chars.filter(o => o.alive && o.role === 'crew' && o.inVent === null);
        if (!crew.length) return;
        const p = G.player();
        if (!m.autopilot && crew.indexOf(p) >= 0 && U.chance(0.35)) t = p;
        else {
          let bd = 1e9;
          crew.forEach(o => imps.forEach(k => { const d = U.dist(o.x, o.y, k.x, k.y); if (d < bd) { bd = d; t = o; } }));
        }
        c.x = t.x; c.y = t.y; // hayalet duvardan geçer
        if (!G.follow(c, t)) return;
      }
      if (c.inflCd > 0) return;
      let k = null, kd = 1e9;
      imps.forEach(o => { const d = U.dist(o.x, o.y, t.x, t.y); if (d < kd) { kd = d; k = o; } });
      const ch = c.inflChoices, kr = SS.Map.roomIndexAt(k.x, k.y);
      // Önce en yakın hainin rengi, yoksa başka bir yaşayan hainin rengi.
      const kIcon = G.inflIconOf(k);
      const colorK = ch.indexOf(kIcon) >= 0 ? kIcon : ch.find(i => imps.indexOf(G.inflCharOf(i)) >= 0);
      const badI = ch.find(i => I[i].tone === 'bad');
      const roomK = ch.find(i => I[i].type === 'room' && I[i].room === kr);
      let msg = null;
      if (colorK !== undefined) msg = [colorK].concat(badI !== undefined ? [badI] : [], roomK !== undefined ? [roomK] : []);
      else if (roomK !== undefined && badI !== undefined) msg = [roomK, badI];
      if (msg) { if (G.inflSend(c, msg) && U.chance(0.4)) G.unfollow(c, 'switch'); }
      else G.inflRefresh(c);
    },
    // Mesajı alan bot resimleri yorumlar: renk + kötü işaret şüphe, renk + iyi işaret güven demektir.
    onInfluence(m, from, t, icons) {
      if (!t.brain || !t.alive || t.role !== 'crew') return;
      const I = SS.INFLUENCE_ICONS, b = t.brain, its = icons.map(i => I[i]);
      const bad = its.some(x => x.tone === 'bad'), good = its.some(x => x.tone === 'good');
      const w = SS.C.INFLUENCE_TRUST;
      icons.forEach(i => {
        const o = SS.Game.inflCharOf(i);
        if (!o || o === t || !o.alive) return;
        const v = bad && !good ? w : good && !bad ? -w * 0.7 : bad && good ? 0 : w * 0.3;
        if (!v) return;
        addSusp(b, o.id, v);
        b.events.push({ type: 'hint', t: m.time, who: o.id, bad: v > 0 });
      });
    },
    // Melek bot (hayalet): görünmeden en az şüphelendiği yaşayan mürettebatın yanına geçip kalkan verir.
    angelWork(m, c, dt) {
      const b = c.brain;
      if (c.protectCd > 0) return;
      b.angelT = (b.angelT || U.range(1, 4)) - dt;
      if (b.angelT > 0) return;
      b.angelT = U.range(2, 6);
      // Hayaletler hainleri görür: saldırısı hazır bir haine en yakın mürettebatı korur.
      const imps = m.chars.filter(o => o.alive && o.role === 'impostor' && o.killCd < 6);
      let t = null, bd = 700;
      m.chars.forEach(o => {
        if (!o.alive || o.role !== 'crew' || o.inVent !== null || o.shieldT > 0) return;
        imps.forEach(k => { const d = U.dist(o.x, o.y, k.x, k.y); if (d < bd) { bd = d; t = o; } });
      });
      if (!t) t = U.pick(m.chars.filter(o => o.alive && o.role === 'crew' && o.inVent === null));
      if (!t) return;
      c.x = t.x; c.y = t.y; // hayalet duvardan geçer, görünmez
      SS.Game.protect(c, t);
    },

    // Yargıç bot yalnızca neredeyse kesin kanıtı olan birini yargılar.
    // Kalabalığın suçlaması yetmez: kendi gözüyle gördüğü bir cinayet, kaybolma veya dönüşüm gerekir.
    judgeTarget(m, mt, c) {
      const b = c.brain;
      const hard = b.events.filter(e => (e.type === 'kill' || e.type === 'attack' || e.type === 'vanish' || e.type === 'shift' || (e.type === 'vent' && !m.engineers))
        && m.chars[e.who].alive && m.chars[e.who] !== c && (b.susp[e.who] || 0) >= 90);
      if (!hard.length) return null;
      return m.chars[hard[hard.length - 1].who];
    },
    // Yargılananın rolü duyurulduğu için onu suçlamış olanlara olan güven buna göre değişir.
    onJudge(m, mt, res) {
      if (res.guilty) return;
      const acc = (mt.accusers[res.target.id] || []).filter(a => a.w >= 15);
      m.chars.forEach(o => {
        if (!o.brain || !o.alive || o.role !== 'crew') return;
        acc.forEach(a => { if (a.id !== o.id) addSusp(o.brain, a.id, 15); });
      });
    },

    onShift(m, c, t, kind) {
      for (const o of m.chars) {
        if (!o.brain || !o.alive || o === c || o.inVent !== null || o.role !== 'crew') continue;
        if (!SS.Vision.sees(o, c.x, c.y, SS.Game.visionRadius(o))) continue;
        o.brain.events.push({ type: 'shift', t: m.time, room: SS.Map.roomIndexAt(c.x, c.y), who: c.id, other: t ? t.id : null, kind });
        o.brain.susp[c.id] = Math.max(o.brain.susp[c.id] || 0, 95);
        if (t && t !== o) {
          // Kılıktan çıkışı gördüyse: o kılığa yazdığı yakın tarihli tanıklıklar aslında bu kişiye ait.
          let moved = false;
          if (kind === 'out') o.brain.events.forEach(e => {
            if ((e.type === 'kill' || e.type === 'vent') && e.who === t.id && m.time - e.t <= SS.C.SHIFT_DURATION + 2) { e.who = c.id; moved = true; }
          });
          if (moved) o.brain.susp[t.id] = Math.min(o.brain.susp[t.id] || 0, 10);
          else addSusp(o.brain, t.id, -30);
        }
        if (!o.emergencyUsed) o.brain.wantButton = true;
      }
    },

    onVanish(m, c, kind) {
      for (const o of m.chars) {
        if (!o.brain || !o.alive || o === c || o.inVent !== null || o.role !== 'crew') continue;
        if (!SS.Vision.sees(o, c.x, c.y, SS.Game.visionRadius(o))) continue;
        o.brain.events.push({ type: 'vanish', t: m.time, room: SS.Map.roomIndexAt(c.x, c.y), who: c.id, kind });
        o.brain.susp[c.id] = Math.max(o.brain.susp[c.id] || 0, 95);
        if (!o.emergencyUsed) o.brain.wantButton = true;
      }
    },
    // Görünür olsaydı kimse görür müydü? (fantom bot belirmek için bunu bekler)
    wouldBeSeen(m, c) {
      return m.chars.some(o => o !== c && o.alive && o.role === 'crew' && o.inVent === null && SS.Vision.sees(o, c.x, c.y, SS.Game.visionRadius(o)));
    },

    // İz sürücü bot: menzildeki en şüpheli kişiye cihaz takar (kovalamaz, görevini bırakmaz).
    maybeTrack(m, c) {
      const b = c.brain;
      let best = null, bs = -1e9;
      m.chars.forEach(o => {
        if (o === c || !o.alive || o.inVent !== null) return;
        if (U.dist(c.x, c.y, o.x, o.y) > SS.C.TRACK_RANGE || !SS.Vision.los(c.x, c.y, o.x, o.y)) return;
        const s = (b.susp[o.id] || 0) + U.range(0, 10) - (b.tracked && b.tracked[o.id] ? 25 : 0);
        if (s > bs) { bs = s; best = o; }
      });
      if (best && SS.Game.startTrack(c, best)) {
        (b.tracked = b.tracked || {})[best.id] = true;
        b.trackPrev = null;
      }
    },
    // Gecikmeli konum, görülmüş gibi kayda geçer; bir örnekten diğerine yürünemeyecek sıçrama havalandırma demektir.
    onTrackSample(m, c, t, tr) {
      const b = c.brain;
      if (tr.lost) return;
      const ls = b.lastSeen[t.id];
      if (!ls || ls.room !== tr.room || m.time - ls.t > 4) b.seen.push({ t: m.time, id: t.id, room: tr.room, withMe: false, tracked: true });
      b.lastSeen[t.id] = { t: m.time, room: tr.room };
      const prev = b.trackPrev && b.trackPrev.id === t.id ? b.trackPrev : null;
      if (prev) {
        const d = U.dist(prev.x, prev.y, tr.x, tr.y), walk = SS.C.SPEED * (m.time - prev.t) * 1.3 + 60;
        if (d > walk) {
          b.events.push({ type: 'vent', t: m.time, room: tr.room, who: t.id, kind: 'tracked' });
          addSusp(b, t.id, m.engineers ? 45 : 75);
          if (!c.emergencyUsed && U.chance(0.5)) b.wantButton = true;
        }
      }
      b.trackPrev = { id: t.id, x: tr.x, y: tr.y, t: m.time };
    },

    // Dedektif bot: aktif davada henüz sorgulamadığı en yakın kişiye gider.
    planInterrogation(m, c) {
      const b = c.brain, cs = m.activeCase;
      if (!cs || c.caseLeft <= 0 || c.intCd > 0) return false;
      const asked = cs.asked[c.id] || {};
      b.intSkip = b.intSkip && b.intSkip.caseId === cs.id ? b.intSkip : { caseId: cs.id, ids: {} };
      let best = null, bd = 450; // yalnızca yakındakiler: dedektif görevlerini bırakmasın
      m.chars.forEach(o => {
        if (o === c || !o.alive || o.inVent !== null || asked[o.id] !== undefined || b.intSkip.ids[o.id]) return;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d < bd) { bd = d; best = o; }
      });
      if (!best) return false;
      B.setIdle(c);
      b.mode = 'interro'; b.target = best; b.huntT = 6; b.repathT = 0;
      return true;
    },
    actInterro(m, c, dt) {
      const b = c.brain, G = SS.Game, C = SS.C, t = b.target;
      b.huntT -= dt;
      if (!t || !t.alive || t.inVent !== null || b.huntT <= 0 || !m.activeCase) {
        if (t && b.intSkip) b.intSkip.ids[t.id] = true;
        B.setIdle(c);
        return;
      }
      const d = U.dist(c.x, c.y, t.x, t.y);
      if (d <= C.INTERROGATE_RANGE - 6 && SS.Vision.los(c.x, c.y, t.x, t.y)) {
        const res = G.interrogate(c, t);
        if (res) B.learnInterrogation(m, c, res);
        else if (b.intSkip) b.intSkip.ids[t.id] = true;
        // Hakkı kaldıysa beklemeyi olduğu yerde geçirip sorguya devam eder.
        B.wait(c, c.caseLeft > 0 ? c.intCd + U.range(0.2, 0.6) : U.range(0.3, 0.8));
        return;
      }
      if (d < 200 && SS.Path.walkClear(c.x, c.y, t.x, t.y, C.RADIUS)) {
        const step = C.SPEED * dt;
        G.moveChar(c, ((t.x - c.x) / d) * Math.min(step, d - C.INTERROGATE_RANGE + 10), ((t.y - c.y) / d) * Math.min(step, d - C.INTERROGATE_RANGE + 10));
        return;
      }
      b.repathT -= dt;
      if (b.repathT <= 0) { b.repathT = 0.7; B.goTo(c, t.x, t.y); }
      B.follow(m, c, dt);
    },
    // Sorgu cevabı şüpheyi günceller: cesedin odasında olan şüphelenilir, uzakta olanın mazereti doğrulanır.
    learnInterrogation(m, c, res) {
      const b = c.brain, cs = m.cases.find(x => x.id === res.caseId);
      if (res.answer === null) return;
      const atBody = res.atBody, inVent = res.answer === 'vent';
      addSusp(b, res.target.id, atBody ? 60 : inVent ? 20 : -12);
      b.events.push({ type: 'interro', t: m.time, who: res.target.id, answer: res.answer, atBody, victim: cs.victimId });
      if (atBody && !c.emergencyUsed) b.wantButton = true; // güçlü bulgu: hemen toplantı çağır
    },

    // Doktor bot ekrandan durumları okur; cesedi bilinmeyen yeni bir ölüm zaman aralığıyla kaydedilir.
    readVitals(m, c) {
      const b = c.brain;
      let fresh = 0;
      SS.Game.vitals().forEach(v => {
        if (v.id === c.id) return;
        if (v.status === 'alive') { b.vAlive[v.id] = m.time; return; }
        if (b.knownDead.has(v.id)) return;
        b.knownDead.add(v.id);
        if (v.status !== 'dead') return;
        b.events.push({ type: 'vitals', t: m.time, victim: v.id, tFrom: b.vAlive[v.id] === undefined ? null : b.vAlive[v.id] });
        fresh++;
      });
      if (fresh && !c.emergencyUsed && U.chance(0.3)) b.wantButton = true;
      return fresh;
    },

    // Yakındaki bir havalandırmadan bağlı çıkışa geçmek yolu belirgin kısaltıyorsa planı döndür.
    ventShortcut(c, gx, gy) {
      const M = SS.Map, direct = U.dist(c.x, c.y, gx, gy);
      let best = null, bestSave = 420;
      M.vents.forEach(v => {
        const dv = U.dist(c.x, c.y, v.x, v.y);
        if (dv > 460) return;
        v.links.forEach(id => {
          const to = M.vents[id];
          const save = direct - (dv + U.dist(to.x, to.y, gx, gy));
          if (save > bestSave) { bestSave = save; best = { from: v, to: id }; }
        });
      });
      return best;
    },

    // ---------------------------------------------------------------- karar: hain
    findKillTarget(m, c) {
      let best = null, bd = 1e9;
      for (const o of m.chars) {
        if (o === c || !o.alive || o.role === 'impostor' || o.inVent !== null) continue;
        const d = U.dist(c.x, c.y, o.x, o.y);
        if (d > 300 || d >= bd) continue;
        if (!SS.Vision.sees(c, o.x, o.y, SS.C.VISION_IMP)) continue;
        if (B.witnesses(m, c, o) > 0) continue;
        best = o; bd = d;
      }
      return best;
    },

    thinkImp(m, c) {
      const b = c.brain, M = SS.Map;
      if (b.mode === 'hunt' || b.mode === 'flee' || b.mode === 'toVent') return;
      if (c.killCd <= 0 && !SS.Game.busyPhantom(c)) {
        b.patience -= 0.5;
        if (b.patience <= 0) {
          if (c.sub === 'shapeshifter' && c.disguise === null && SS.Game.canShift(c).ok && !B.wouldBeSeen(m, c) && U.chance(0.8)) {
            const cands = m.chars.filter(o => o !== c && o.alive && o.role === 'crew' && !SS.Vision.sees(c, o.x, o.y, SS.C.VISION_IMP));
            const t = U.pick(cands.length ? cands : m.chars.filter(o => o !== c && o.alive && o.role === 'crew'));
            if (t && SS.Game.shift(c, t)) { B.wait(c, SS.C.SHIFT_ANIM + 0.1); return; }
          }
          const t = B.findKillTarget(m, c);
          if (t) {
            B.setIdle(c);
            b.mode = 'hunt'; b.target = t; b.huntT = 7; b.checkT = 0; b.repathT = 0;
            return;
          }
        }
      }
      if (b.mode !== 'idle') return;
      // Ara sıra havalandırma ile yer değiştir.
      if (U.chance(0.1)) {
        const v = M.vents.slice().sort((a, z) => U.dist(c.x, c.y, a.x, a.y) - U.dist(c.x, c.y, z.x, z.y))[0];
        if (U.dist(c.x, c.y, v.x, v.y) < 320 && B.witnesses(m, c, null) === 0) {
          b.mode = 'toVent'; b.vent = v; b.ventHops = U.int(0, 1);
          B.goTo(c, v.x, v.y);
          return;
        }
      }
      if (U.chance(0.72)) {
        // Sahte görev: önce kendi listesinden, sonra rastgele bir noktada.
        const undone = c.tasks.map((t, i) => (t.done ? -1 : i)).filter(i => i >= 0);
        let st;
        if (undone.length) { b.taskIdx = U.pick(undone); st = M.stations[c.tasks[b.taskIdx].station]; }
        else { b.taskIdx = -1; st = U.pick(M.stations); }
        b.mode = 'fake'; b.station = st;
        B.goTo(c, st.bx, st.by);
      } else B.wander(c);
    },

    startFlee(m, c) {
      if (c.sub === 'phantom' && SS.Game.canVanish(c).ok && U.chance(0.75) && SS.Game.vanish(c)) {
        const b0 = c.brain, here0 = SS.Map.roomIndexAt(c.x, c.y);
        B.setIdle(c);
        b0.patience = U.range(SS.C.IMP_PATIENCE[0], SS.C.IMP_PATIENCE[1]);
        const r0 = U.pick(SS.Map.rooms.filter(r => r.index !== here0));
        b0.mode = 'flee';
        const p0 = SS.Physics.findFreeSpot(r0.cx, r0.cy, SS.C.RADIUS);
        B.goTo(c, p0.x, p0.y);
        return;
      }
      const b = c.brain, M = SS.Map;
      B.setIdle(c);
      b.patience = U.range(SS.C.IMP_PATIENCE[0], SS.C.IMP_PATIENCE[1]);
      const v = M.vents.slice().sort((a, z) => U.dist(c.x, c.y, a.x, a.y) - U.dist(c.x, c.y, z.x, z.y))[0];
      if (U.dist(c.x, c.y, v.x, v.y) < 400 && U.chance(0.55)) {
        b.mode = 'toVent'; b.vent = v; b.ventHops = U.int(0, 2);
        B.goTo(c, v.x, v.y);
        return;
      }
      const here = M.roomIndexAt(c.x, c.y);
      const far = M.rooms.filter(r => r.index !== here)
        .sort((a, z) => U.dist(c.x, c.y, z.cx, z.cy) - U.dist(c.x, c.y, a.cx, a.cy)).slice(0, 3);
      const r = U.pick(far);
      b.mode = 'flee';
      const p = SS.Physics.findFreeSpot(r.cx, r.cy, SS.C.RADIUS);
      B.goTo(c, p.x, p.y);
    },

    ventLogic(m, c, dt) {
      const b = c.brain;
      b.ventT -= dt;
      if (b.ventT > 0) return;
      const cur = SS.Map.vents[c.inVent];
      if (c.role === 'crew') {
        if (b.ventTarget !== null && b.ventTarget !== undefined && c.inVent !== b.ventTarget) {
          SS.Game.moveVent(c, b.ventTarget);
          b.ventTarget = null;
          b.ventT = U.range(0.4, 0.9);
          return;
        }
        SS.Game.exitVent(c);
        B.setIdle(c);
        return;
      }
      if (b.ventHops > 0) {
        b.ventHops--;
        SS.Game.moveVent(c, U.pick(cur.links));
        b.ventT = U.range(0.8, 1.6);
        return;
      }
      // Çıkışta tanık varsa biraz bekle.
      const seen = m.chars.some(o => o.alive && o.role === 'crew' && o.inVent === null && SS.Vision.sees(o, cur.x, cur.y, SS.Game.visionRadius(o)));
      if (seen && b.ventTries < 4) { b.ventTries++; b.ventT = 1; return; }
      b.ventTries = 0;
      SS.Game.exitVent(c);
      B.setIdle(c);
    },

    teamSabotage(m, dt) {
      const s = m.sab;
      s.botTimer -= dt;
      if (s.botTimer > 0) return;
      s.botTimer = 1;
      if (m.time < 25) return;
      const imps = m.chars.filter(c => c.brain && c.alive && c.role === 'impostor');
      if (!imps.length) return;
      const p = m.chars[0];
      const rate = (p.role === 'impostor' && p.alive && !m.autopilot) ? 0.025 : 0.05;
      if (SS.Sabotage.canStart(m, 'lights').ok && U.chance(rate)) {
        const type = (m.time > 50 && U.chance(0.4)) ? 'oxygen' : 'lights';
        SS.Sabotage.start(m, type, null, imps[0]);
      } else if (SS.Sabotage.canStart(m, 'doors', 0).ok && U.chance(rate * 0.6)) {
        const counts = SS.Map.rooms.map(() => 0);
        m.chars.forEach(c => { if (c.alive && c.role === 'crew') { const r = SS.Map.roomIndexAt(c.x, c.y); if (r >= 0) counts[r]++; } });
        let best = U.int(0, counts.length - 1);
        counts.forEach((n, i) => { if (n > counts[best]) best = i; });
        SS.Sabotage.start(m, 'doors', best, imps[0]);
      }
    },

    // ---------------------------------------------------------------- eylem
    act(m, c, dt) {
      const b = c.brain, G = SS.Game, C = SS.C, M = SS.Map;
      let r;
      switch (b.mode) {
        case 'wait':
          b.waitT -= dt;
          if (b.waitT <= 0) B.setIdle(c);
          break;
        case 'task': {
          const st = M.stations[c.tasks[b.taskIdx].station];
          r = B.follow(m, c, dt);
          if (r === 'arrived' || U.dist(c.x, c.y, st.x, st.y) < C.USE_RANGE - 10) {
            const tt = SS.TASK_TYPES[st.type].botTime;
            b.mode = 'doing'; b.waitT = U.range(tt[0], tt[1]) * SS.C.BOT_TASK_SCALE; c.busyT = b.waitT;
            c.facing = st.x >= c.x ? 1 : -1;
          } else if (r === 'nopath') B.wait(c, 1);
          break;
        }
        case 'doing':
          b.waitT -= dt;
          c.busyT = Math.max(c.busyT, 0.05);
          if (b.waitT <= 0) {
            G.completeTask(c, b.taskIdx);
            if (U.chance(0.35)) B.wander(c); else B.wait(c, U.range(1, 3.5));
          }
          break;
        case 'wander':
          r = B.follow(m, c, dt);
          if (r === 'arrived' || r === 'nopath') B.wait(c, U.range(1, 3));
          break;
        case 'reportDelay':
          b.reactT -= dt;
          if (b.reactT <= 0) { b.mode = 'report'; B.goTo(c, b.body.x, b.body.y); }
          break;
        case 'report': {
          const body = b.body;
          if (!body || body.reported) { B.setIdle(c); break; }
          if (U.dist(c.x, c.y, body.x, body.y) < C.REPORT_RANGE * 0.85 && SS.Vision.los(c.x, c.y, body.x, body.y)) {
            G.report(c, body);
            return;
          }
          r = B.follow(m, c, dt);
          if (r === 'arrived' || r === 'nopath') B.goTo(c, body.x, body.y);
          break;
        }
        case 'fix': {
          const p = M.panels[b.fixKey];
          if (!p || !SS.Sabotage.needs(m, b.fixKey)) { B.setIdle(c); break; }
          r = B.follow(m, c, dt);
          if (r === 'arrived' || U.dist(c.x, c.y, p.x, p.y) < C.USE_RANGE - 10) {
            b.mode = 'fixing'; b.waitT = U.range(2, 3.5); c.busyT = b.waitT;
          } else if (r === 'nopath') B.goTo(c, p.bx, p.by);
          break;
        }
        case 'fixing':
          if (!SS.Sabotage.needs(m, b.fixKey)) { b.fixKey = null; B.setIdle(c); break; }
          b.waitT -= dt;
          if (b.waitT <= 0) { G.fixPanel(c, b.fixKey); b.fixKey = null; B.wait(c, 0.5); }
          break;
        case 'button':
          if (U.dist(c.x, c.y, M.button.x, M.button.y) < C.BUTTON_RANGE - 10) {
            b.wantButton = false;
            if (G.callEmergency(c)) return;
            B.setIdle(c);
            break;
          }
          r = B.follow(m, c, dt);
          if (r === 'nopath') B.goTo(c, M.button.x, M.button.y + 108);
          break;
        case 'fake': {
          r = B.follow(m, c, dt);
          if (r === 'arrived' || (b.station && U.dist(c.x, c.y, b.station.x, b.station.y) < C.USE_RANGE - 10)) {
            b.mode = 'fakeDoing'; b.waitT = U.range(3, 7); c.busyT = b.waitT;
            if (b.station) c.facing = b.station.x >= c.x ? 1 : -1;
          } else if (r === 'nopath') B.wait(c, 1);
          break;
        }
        case 'fakeDoing':
          b.waitT -= dt;
          c.busyT = Math.max(c.busyT, 0.05);
          if (b.waitT <= 0) {
            if (b.taskIdx >= 0 && c.tasks[b.taskIdx]) c.tasks[b.taskIdx].done = true; // sahte: ilerleme artmaz
            B.wait(c, U.range(0.3, 1.5));
          }
          break;
        case 'hunt': B.actHunt(m, c, dt); break;
        case 'interro': B.actInterro(m, c, dt); break;
        case 'vitals':
          b.waitT -= dt;
          if (b.waitT <= 0 || !c.vitalsOpen) { B.readVitals(m, c); G.closeVitals(c); B.wait(c, 0.3); }
          break;
        case 'flee':
          r = B.follow(m, c, dt);
          if (r === 'arrived' || r === 'nopath') B.wait(c, U.range(0.5, 2));
          break;
        case 'toVent': {
          const v = b.vent;
          if (U.dist(c.x, c.y, v.x, v.y) <= C.USE_RANGE) {
            const hidden = c.role !== 'impostor' || B.witnesses(m, c, null) === 0;
            if (hidden && G.enterVent(c, v)) { b.ventT = c.role === 'impostor' ? U.range(1.2, 2.4) : U.range(0.6, 1.2); b.ventTries = 0; }
            else B.setIdle(c);
            break;
          }
          r = B.follow(m, c, dt);
          if (r === 'nopath') B.setIdle(c);
          else if (r === 'arrived') B.goTo(c, v.x, v.y);
          break;
        }
        default: break;
      }
    },

    actHunt(m, c, dt) {
      const b = c.brain, C = SS.C, G = SS.Game;
      const t = b.target;
      b.huntT -= dt;
      if (!t || !t.alive || t.inVent !== null || b.huntT <= 0 || c.killCd > 0) { B.setIdle(c); return; }
      b.checkT -= dt;
      if (b.checkT <= 0) {
        b.checkT = 0.25;
        if (B.witnesses(m, c, t) > 0) { b.patience = U.range(2, 6); B.setIdle(c); return; }
      }
      const d = U.dist(c.x, c.y, t.x, t.y);
      if (d <= C.KILL_RANGE - 8 && SS.Vision.los(c.x, c.y, t.x, t.y)) {
        if (B.witnesses(m, c, t) === 0 && G.kill(c, t)) { if (G.worldActive()) B.startFlee(m, c); }
        return;
      }
      if (d < 230 && SS.Path.walkClear(c.x, c.y, t.x, t.y, C.RADIUS)) {
        const step = C.SPEED * dt;
        G.moveChar(c, ((t.x - c.x) / d) * step, ((t.y - c.y) / d) * step);
        return;
      }
      b.repathT -= dt;
      if (b.repathT <= 0) { b.repathT = 0.6; B.goTo(c, t.x, t.y); }
      B.follow(m, c, dt);
    },

    // ---------------------------------------------------------------- toplantı
    alibiRoom(m, c) {
      const b = c.brain, counts = {};
      for (const e of b.roomLog) if (m.time - e.t < 30 && e.room >= 0) counts[e.room] = (counts[e.room] || 0) + 1;
      let best = SS.Map.roomIndexAt(c.x, c.y), bn = 0;
      Object.keys(counts).forEach(k => { if (counts[k] > bn) { bn = counts[k]; best = +k; } });
      return best;
    },
    companion(m, c) {
      const b = c.brain, counts = {};
      for (const s of b.seen) if (s.withMe && m.time - s.t < 35) counts[s.id] = (counts[s.id] || 0) + 1;
      let best = null, bn = 1;
      Object.keys(counts).forEach(k => { const o = m.chars[+k]; if (o.alive && counts[k] > bn) { bn = counts[k]; best = +k; } });
      return best;
    },

    // Kurbanı en son kiminle gördüm? Bot kendi gözlemlerinden çıkarım yapar.
    onMeetingStart(m, mt) {
      m.chars.forEach(c => {
        const b = c.brain;
        if (!b) return;
        b.lastWith = null;
        if (b.mode === 'hunt') b.patience = U.range(4, 10);
        if (!c.alive || c.role !== 'crew' || mt.victimId === null) return;
        const vs = b.seen.filter(s => s.id === mt.victimId);
        if (!vs.length) return;
        const last = vs[vs.length - 1];
        if (m.time - last.t > 70 || last.room < 0) return;
        const withIds = new Set();
        b.seen.forEach(s => {
          if (s.id !== mt.victimId && s.id !== c.id && s.room === last.room && Math.abs(s.t - last.t) < 8 && m.chars[s.id].alive) withIds.add(s.id);
        });
        if (!withIds.size || withIds.size > 2) return;
        const ids = Array.from(withIds);
        ids.forEach(id => addSusp(b, id, 30 / ids.length));
        b.lastWith = { withId: ids[0], room: last.room, n: ids.length };
      });
    },

    // Botların tartışma cümleleri yalnızca kendi hafızalarından üretilir.
    buildStatements(m, mt) {
      const speakers = U.shuffle(m.chars.filter(c => c.brain && c.alive));
      const ci = speakers.findIndex(c => c.id === mt.callerId);
      if (ci > 0) speakers.unshift(speakers.splice(ci, 1)[0]);
      const out = [];
      let t = 1.4;
      speakers.forEach(c => {
        const st = c.role === 'crew' ? B.crewStatements(m, mt, c) : B.impStatements(m, mt, c);
        const strong = c.id === mt.callerId || st.some(s => s.kind === 'accuse' || s.kind === 'defend');
        if (!strong && U.chance(0.55)) return; // söyleyecek kanıtı olmayanların çoğu dinler
        st.slice(0, 2).forEach(s => { s.at = t; t += U.range(1.2, 2.0); out.push(s); });
      });
      const limit = SS.C.DISCUSS_TIME - 4;
      if (t > limit) out.forEach(s => { s.at = (s.at / t) * limit; });
      return out;
    },

    crewStatements(m, mt, c) {
      const b = c.brain, out = [], ch = id => m.chars[id];
      const S = (kind, text, targetId, weight) => ({ speakerId: c.id, kind, text, targetId, weight: weight || 0 });
      const alive = id => ch(id) && ch(id).alive;
      if (mt.callerId === c.id && mt.type === 'report') {
        const v = ch(mt.victimId);
        out.push(S('info', U.chance(0.5) ? 'Cesedi ' + loc(mt.bodyRoom) + ' buldum.' : v.def.gen + ' gövdesini ' + loc(mt.bodyRoom) + ' buldum.'));
      }
      const kills = b.events.filter(e => e.type === 'kill' && alive(e.who));
      const vents = b.events.filter(e => e.type === 'vent' && alive(e.who) && m.time - e.t < 150);
      const vanishes = b.events.filter(e => e.type === 'vanish' && alive(e.who));
      const shifts = b.events.filter(e => e.type === 'shift' && alive(e.who));
      const attacks = b.events.filter(e => e.type === 'attack' && alive(e.who));
      if (kills.length) {
        const e = kills[kills.length - 1], k = ch(e.who), v = ch(e.victim);
        out.push(S('accuse', k.def.acc + ' ' + v.def.acc + ' devre dışı bırakırken gördüm! Hain o!', k.id, 70));
      } else if (attacks.length) {
        const e = attacks[attacks.length - 1], k = ch(e.who), v = ch(e.victim);
        out.push(S('accuse', e.victim === c.id ? k.name + ' bana saldırdı ama bir kalkan beni korudu! Hain o!'
          : k.def.acc + ' ' + loc(e.room) + ' saldırırken gördüm! ' + v.name + ' korunuyordu, kalkan saldırıyı durdurdu.', k.id, 70));
      } else if (shifts.length) {
        const e = shifts[shifts.length - 1], x = ch(e.who), y = e.other !== null ? ch(e.other) : null;
        const txt = e.kind === 'in' ? x.def.acc + ' ' + loc(e.room) + ' kılık değiştirip ' + y.name + ' kılığına girerken gördüm! Hain o!'
          : (y ? y.name + ' kılığındaki birinin ' + loc(e.room) + ' ' + x.name + ' olarak geri döndüğünü gördüm! Kılık değiştiren hain o!' : x.def.acc + ' kılık değiştirirken gördüm!');
        out.push(S('accuse', txt, x.id, 70));
      } else if (vanishes.length) {
        const e = vanishes[vanishes.length - 1], x = ch(e.who);
        out.push(S('accuse', e.kind === 'vanish' ? x.def.acc + ' ' + loc(e.room) + ' gözümün önünde görünmez olurken gördüm! Hain o!' : x.def.gen + ' ' + loc(e.room) + ' birden havadan belirdiğini gördüm! Görünmez olabiliyor, hain o!', x.id, 60));
      } else if (vents.length) {
        const e = vents[vents.length - 1], x = ch(e.who);
        const txt = e.kind === 'tracked' ? x.def.acc + ' iz cihazıyla izliyordum: bir anda ' + loc(e.room) + ' belirdi, havalandırma kullandı!'
          : e.kind === 'exit' ? x.def.gen + ' havalandırmadan çıktığını gördüm!' : x.def.gen + ' havalandırmaya girdiğini gördüm.';
        if (mt.callerId === c.id && mt.type === 'emergency') out.unshift(S('info', 'Acil toplantı çağırdım, bir şey gördüm.'));
        const st = S('accuse', txt, x.id, m.engineers ? 38 : 55);
        st.topic = 'vent';
        out.push(st);
      } else if (b.lastWith && alive(b.lastWith.withId)) {
        const v = ch(mt.victimId), x = ch(b.lastWith.withId);
        out.push(S('accuse', v.def.acc + ' en son ' + x.name + ' ile birlikte ' + loc(b.lastWith.room) + ' gördüm.', x.id, b.lastWith.n === 1 ? 24 : 14));
      } else if (mt.type === 'report' && mt.bodyRoom >= 0) {
        const cand = b.seen.filter(s => s.room === mt.bodyRoom && s.id !== c.id && alive(s.id) && m.time - s.t < 40).sort((a, z) => z.t - a.t);
        if (cand.length && U.chance(0.85)) {
          const x = ch(cand[0].id);
          out.push(S('accuse', x.def.acc + ' ' + loc(cand[0].room) + ' gördüm.', x.id, m.time - cand[0].t < 15 ? 22 : 15));
        }
      }
      const hints = b.events.filter(e => e.type === 'hint' && !e.told && alive(e.who));
      if (hints.length) {
        const e = hints[hints.length - 1], x = ch(e.who);
        if (e.bad && (b.susp[x.id] || 0) >= 50) out.push(S('accuse', 'Bir hayalet bana resimlerle ' + x.def.acc + ' işaret etti. Bence ' + x.name + ' hain!', x.id, 18));
        else if (!e.bad) out.push(S('defend', 'Bir hayalet bana ' + x.def.gen + ' temiz olduğunu gösterdi.', x.id, 10));
        hints.forEach(h => { h.told = true; });
      }
      if (mt.callerId === c.id && mt.type === 'emergency' && !out.length) out.push(S('info', 'Acil toplantı çağırdım, konuşmamız lazım.'));
      const intr = b.events.filter(e => e.type === 'interro' && !e.told && alive(e.who)).sort((a, z) => (z.atBody ? 1 : 0) - (a.atBody ? 1 : 0));
      intr.slice(0, 2).forEach(e => {
        const t = ch(e.who), v = ch(e.victim);
        const where = e.answer === 'vent' ? 'havalandırmalardaydı' : loc(e.answer) + ' idi';
        const st = S(e.atBody || e.answer === 'vent' ? 'accuse' : 'defend', 'Sorguladım: ' + t.name + ', ' + v.name + ' öldürüldüğünde ' + where + (e.atBody ? ', cesedin olduğu yerde!' : '.'), t.id, e.atBody ? 45 : e.answer === 'vent' ? 18 : 12);
        st.topic = 'interro';
        out.unshift(st);
        e.told = true;
      });
      const vit = b.events.filter(e => e.type === 'vitals' && !e.told && e.victim !== mt.victimId);
      if (vit.length) {
        const e = vit[vit.length - 1], v = ch(e.victim);
        const when = e.tFrom === null ? 'Ne zaman olduğunu bilmiyorum.' : 'Son ' + Math.max(1, Math.ceil(m.time - e.tFrom)) + ' saniye içinde olmuş.';
        const head = mt.callerId === c.id && mt.type === 'emergency' ? 'Acil toplantı çağırdım: yaşam belirtilerinde ' + v.name + ' ölü görünüyor. ' : 'Yaşam belirtilerine baktım, ' + v.name + ' ölmüş! ';
        for (let k = out.length - 1; k >= 0; k--) if (out[k].kind === 'info' && /^Acil toplantı/.test(out[k].text)) out.splice(k, 1);
        out.unshift(S('info', head + when));
        e.told = true;
      }
      const accused = out.some(s => s.kind === 'accuse');
      if (!accused) {
        let top = null, tv = 44;
        m.chars.forEach(o => { if (o !== c && o.alive && (b.susp[o.id] || 0) >= tv) { tv = b.susp[o.id]; top = o; } });
        if (top && U.chance(0.7)) out.push(S('accuse', 'Bence ' + top.name + ' şüpheli davranıyor.', top.id, 15));
        else if (U.chance(0.55)) {
          const ar = B.alibiRoom(m, c);
          out.push(S('info', 'Ben ' + loc(ar) + ' görev yapıyordum.'));
          const comp = B.companion(m, c);
          if (comp !== null && U.chance(0.6)) out.push(S('defend', ch(comp).name + ' benimleydi.', comp, 12));
        } else out.push(S('noevidence', U.pick(['Elimizde yeterli kanıt yok.', 'Bir şey görmedim.', 'Kimseyi şüpheli bir yerde görmedim.'])));
      }
      return out;
    },

    impStatements(m, mt, c) {
      const b = c.brain, out = [], ch = id => m.chars[id];
      const S = (kind, text, targetId, weight) => ({ speakerId: c.id, kind, text, targetId, weight: weight || 0 });
      // Gerçek bir gözlemi yanıltıcı biçimde kullan (rastgele suçlama yok).
      if (mt.type === 'report' && mt.bodyRoom >= 0) {
        const cand = b.seen.filter(s => s.room === mt.bodyRoom && ch(s.id).alive && ch(s.id).role === 'crew' && m.time - s.t < 40).sort((a, z) => z.t - a.t);
        if (cand.length && U.chance(0.55)) {
          const x = ch(cand[0].id);
          out.push(S('accuse', x.def.acc + ' ' + loc(cand[0].room) + ' gördüm.', x.id, 18));
        }
      }
      if (U.chance(0.7)) {
        const rooms = SS.Map.rooms.filter(r => r.index !== mt.bodyRoom);
        out.push(S('info', 'Ben ' + U.pick(rooms).loc + ' görev yapıyordum.'));
      }
      if (!out.length) out.push(S('noevidence', U.pick(['Bir şey görmedim.', 'Elimizde yeterli kanıt yok.'])));
      return out;
    },

    // Bir suçlamaya verilen tepkiler (göreli gecikmeyle).
    reactions(m, mt, msg) {
      const out = [], ch = id => m.chars[id];
      const t = ch(msg.targetId), a = ch(msg.speakerId);
      if (!t || !a) return out;
      if (t.brain && t.alive && !mt.responded.has(t.id)) {
        mt.responded.add(t.id);
        // Havalandırma suçlamasına mühendis rolünü açıklayarak (ya da hain olarak yalan söyleyerek) cevap ver.
        const ventTalk = msg.topic === 'vent' && m.engineers > 0;
        if (ventTalk && (t.sub === 'engineer' || (t.role === 'impostor' && U.chance(0.45)))) {
          out.push({ speakerId: t.id, kind: 'defend', claim: 'engineer', targetId: t.id, weight: 30, text: 'Ben mühendisim, havalandırmayı kullanabiliyorum!', delay: U.range(0.8, 1.6) });
          return out;
        }
        if (t.role === 'crew') {
          const ar = B.alibiRoom(m, t);
          const counter = (t.brain.susp[a.id] || 0) >= 60;
          out.push({ speakerId: t.id, kind: counter ? 'accuse' : 'defend', targetId: counter ? a.id : t.id, weight: counter ? 20 : 8,
            text: 'Ben değilim! ' + (ar >= 0 ? loc(ar).charAt(0).toUpperCase() + loc(ar).slice(1) + ' görev yapıyordum.' : 'Görevlerimi yapıyordum.') + (counter ? ' Asıl ' + a.name + ' şüpheli!' : ''),
            delay: U.range(0.9, 1.8) });
        } else if (msg.weight >= 50 && U.chance(0.5)) {
          out.push({ speakerId: t.id, kind: 'accuse', targetId: a.id, weight: 15, text: 'Yalan söylüyor! ' + a.name + ' dikkati dağıtmaya çalışıyor.', delay: U.range(0.9, 1.6) });
        } else {
          const rooms = SS.Map.rooms.filter(r => r.index !== mt.bodyRoom);
          out.push({ speakerId: t.id, kind: 'defend', targetId: t.id, weight: 8, text: 'Ben değilim! ' + U.pick(rooms).name + ' tarafındaydım.', delay: U.range(0.9, 1.8) });
        }
      }
      // Hain botlar mürettebata yönelik suçlamaya katılabilir veya takım arkadaşını savunabilir.
      m.chars.forEach(o => {
        if (!o.brain || !o.alive || o.role !== 'impostor' || o === t || o === a) return;
        if ((mt.msgCount[o.id] || 0) >= 3) return;
        if (t.role === 'crew' && msg.weight >= 15 && U.chance(0.4)) {
          out.push({ speakerId: o.id, kind: 'accuse', targetId: t.id, weight: 10, text: 'Ben de ' + t.def.abl + ' şüpheleniyorum.', delay: U.range(2, 3.5) });
        } else if (t.role === 'impostor' && msg.weight < 50 && U.chance(0.35)) {
          out.push({ speakerId: o.id, kind: 'defend', targetId: t.id, weight: 10, text: t.name + ' temiz bence, onu görev yaparken gördüm.', delay: U.range(2, 3.5) });
        }
      });
      return out;
    },

    trust(c, speakerId) { return U.clamp(1 - (c.brain.susp[speakerId] || 0) / 100, 0, 1); },

    hear(m, mt, msg) {
      if (msg.targetId === undefined || msg.targetId === null) {
        if (msg.kind === 'noevidence') mt.noEvidence++;
        return;
      }
      if (msg.kind === 'accuse') mt.publicSusp[msg.targetId] = (mt.publicSusp[msg.targetId] || 0) + msg.weight;
      if (msg.kind === 'defend' && msg.targetId !== msg.speakerId) mt.publicSusp[msg.targetId] = (mt.publicSusp[msg.targetId] || 0) - msg.weight;
      if (msg.kind === 'accuse') (mt.accusers[msg.targetId] = mt.accusers[msg.targetId] || []).push({ id: msg.speakerId, w: msg.weight });
      let conflict = null;
      if (msg.claim === 'engineer') {
        if (m.engClaims.indexOf(msg.speakerId) < 0) m.engClaims.push(msg.speakerId);
        const liveClaims = m.engClaims.filter(id => m.chars[id].alive || m.chars[id].ejected === false);
        if (liveClaims.length > m.engineers) conflict = liveClaims; // birden fazla iddia: biri yalan söylüyor
      }
      m.chars.forEach(c => {
        if (!c.brain || !c.alive || c.id === msg.speakerId || c.role !== 'crew') return;
        const b = c.brain;
        if (msg.targetId === c.id) {
          if (msg.kind === 'accuse') addSusp(b, msg.speakerId, msg.weight * 0.6); // beni suçlayan şüpheli
          return;
        }
        const tr = B.trust(c, msg.speakerId);
        if (msg.claim === 'engineer') {
          if (conflict) conflict.forEach(id => { if (id !== c.id) addSusp(b, id, 30); });
          else addSusp(b, msg.speakerId, -msg.weight * tr);
          return;
        }
        if (msg.kind === 'accuse') addSusp(b, msg.targetId, msg.weight * tr);
        else if (msg.kind === 'defend') addSusp(b, msg.targetId, -msg.weight * tr * (msg.targetId === msg.speakerId ? 0.5 : 1));
      });
    },

    decideVote(m, mt, c) {
      const b = c.brain;
      if (c.role === 'crew') {
        let best = null, bv = -1e9;
        m.chars.forEach(o => {
          if (o === c || !o.alive) return;
          const v = (b.susp[o.id] || 0) + U.range(-6, 6);
          if (v > bv) { bv = v; best = o; }
        });
        const thr = 36 + mt.noEvidence * 5;
        return { target: best && bv >= thr ? best.id : 'skip', confidence: bv };
      }
      // Hain: kamuoyunun şüphelendiği mürettebata, ya da takımını suçlayana oy.
      let best = null, bv = -1e9;
      m.chars.forEach(o => {
        if (o === c || !o.alive || o.role === 'impostor') return;
        let v = (mt.publicSusp[o.id] || 0) + U.range(-3, 3);
        m.chars.forEach(tm => {
          if (tm.role === 'impostor' && mt.accusers[tm.id] && mt.accusers[tm.id].some(a => a.id === o.id)) v += 25;
        });
        if (v > bv) { bv = v; best = o; }
      });
      return { target: best && bv >= 15 ? best.id : 'skip', confidence: bv };
    },

    afterEject(m, mt, ejected) {
      if (ejected.role !== 'crew') return;
      const acc = (mt.accusers[ejected.id] || []).filter(a => a.w >= 15);
      m.chars.forEach(c => {
        if (!c.brain || c.role !== 'crew') return;
        acc.forEach(a => { if (a.id !== c.id) addSusp(c.brain, a.id, 15); });
      });
    },

    afterMeeting(m) {
      m.chars.forEach(c => {
        const b = c.brain;
        if (!b) return;
        Object.keys(b.susp).forEach(k => { if (b.susp[k] < 90) b.susp[k] *= 0.7; });
        b.events.forEach(e => { e.told = true; });
        m.chars.forEach(o => { if (!o.alive) b.knownDead.add(o.id); });
        b.fixKey = null;
        b.wantButton = false;
        b.body = null;
        b.patience = U.range(SS.C.IMP_PATIENCE[0], SS.C.IMP_PATIENCE[1]);
        if (c.alive) B.wait(c, U.range(0.3, 1.5));
      });
    },
  });
})();
