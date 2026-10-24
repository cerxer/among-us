// Toplantı akışı: tartışma -> oylama -> sonuç. Dünya bu sırada duraklar.
(function () {
  'use strict';
  const SS = window.SS, U = SS.util;

  const MT = (SS.Meeting = {
    start(m, opts) {
      const G = SS.Game, C = SS.C, M = SS.Map;
      if (m.meeting || m.over) return false;
      m.chars.forEach(c => {
        if (c.inVent !== null) G.exitVent(c, true); // geçerli bir konuma çıkar
        c.busyT = 0; c.moving = false;
      });
      SS.Sabotage.cancelAll(m);
      m.chars.forEach(c => { if (c.vitalsOpen) G.closeVitals(c, 'meeting'); if (c.track) G.stopTrack(c, 'meeting'); G.forceVisible(c); G.revertShift(c); c.shieldT = 0; c.shieldBy = null; if (c.angel) c.protectCd = Math.max(c.protectCd, SS.C.PROTECT_COOLDOWN_START); c.inbox = null; if (c.influencer) { G.unfollow(c, 'meeting'); c.inflCd = Math.max(c.inflCd, SS.C.INFLUENCE_COOLDOWN_START); } });
      G.activeTask = null;
      G.uiBlock = false;
      const body = opts.body || null;
      const p = G.player();
      const mt = {
        type: opts.type, callerId: opts.caller.id,
        victimId: body ? body.victimId : null,
        bodyRoom: body ? body.room : -1,
        callRoom: M.roomIndexAt(opts.caller.x, opts.caller.y),
        playerRoom: M.roomIndexAt(p.x, p.y),
        phase: 'discussion', timer: C.DISCUSS_TIME, elapsed: 0, voteElapsed: 0,
        messages: [], schedule: [], votes: {}, autoSkip: {}, voteAt: {}, voteDecision: {},
        publicSusp: {}, accusers: {}, playerActs: {}, msgCount: {}, responded: new Set(),
        noEvidence: 0, tally: null, ejectedId: null, resultT: 0, seq: 0,
        aliveAtStart: m.chars.filter(c => c.alive).map(c => c.id),
      };
      m.meeting = mt;
      m.lastMeeting = mt;
      m.meetings++;
      SS.Bots.onMeetingStart(m, mt);
      mt.schedule = SS.Bots.buildStatements(m, mt);
      G.setState('MEETING_DISCUSSION');
      SS.events.emit('meetingStart', mt);
      return true;
    },

    update(m, dt) {
      const mt = m.meeting, G = SS.Game, C = SS.C;
      if (!mt) return;
      if (G.state === 'MEETING_DISCUSSION') {
        mt.elapsed += dt;
        mt.timer -= dt;
        while (mt.schedule.length && mt.schedule[0].at <= mt.elapsed) MT.say(m, mt, mt.schedule.shift());
        MT.botJudges(m, mt, mt.elapsed);
        if (G.state !== 'MEETING_DISCUSSION') return; // yargılama maçı bitirmiş olabilir
        if (mt.timer <= 0) MT.beginVote(m);
      } else if (G.state === 'MEETING_VOTE') {
        mt.timer -= dt;
        mt.voteElapsed += dt;
        MT.botJudges(m, mt, mt.elapsed + mt.voteElapsed);
        if (G.state !== 'MEETING_VOTE') return;
        m.chars.forEach(c => {
          if (!c.brain || !c.alive || mt.votes.hasOwnProperty(c.id)) return;
          if (mt.voteElapsed >= mt.voteAt[c.id]) MT.castVote(c.id, mt.voteDecision[c.id]);
        });
        if (MT.allVoted(m) && mt.timer > 1.2) mt.timer = 1.2;
        if (mt.timer <= 0) MT.resolve(m);
      } else if (G.state === 'MEETING_RESULT') {
        mt.resultT += dt;
        if (mt.resultT >= (mt.resultDur || C.RESULT_TIME)) MT.finish(m);
      }
    },

    say(m, mt, s) {
      const sp = m.chars[s.speakerId];
      if (!sp || !sp.alive) return null;
      if ((mt.msgCount[sp.id] || 0) >= 4) return null;
      mt.msgCount[sp.id] = (mt.msgCount[sp.id] || 0) + 1;
      const msg = { seq: ++mt.seq, speakerId: s.speakerId, text: s.text, kind: s.kind, targetId: s.targetId, weight: s.weight || 0, t: mt.elapsed, topic: s.topic || null, claim: s.claim || null };
      mt.messages.push(msg);
      SS.Bots.hear(m, mt, msg);
      if (msg.kind === 'accuse' && msg.targetId !== undefined && msg.targetId !== null) {
        SS.Bots.reactions(m, mt, msg).forEach(r => {
          r.at = mt.elapsed + r.delay;
          let i = 0;
          while (i < mt.schedule.length && mt.schedule[i].at <= r.at) i++;
          mt.schedule.splice(i, 0, r);
        });
      }
      SS.events.emit('meetingMessage', msg);
      return msg;
    },

    // Oyuncunun tartışma seçenekleri (her biri toplantıda bir kez).
    playerSay(kind, targetId) {
      const G = SS.Game, m = G.match, mt = m && m.meeting;
      if (!mt || G.state !== 'MEETING_DISCUSSION') return false;
      const p = G.player();
      if (!p.alive || mt.playerActs[kind]) return false;
      const t = targetId !== undefined && targetId !== null ? m.chars[targetId] : null;
      let s;
      if (kind === 'accuse' || kind === 'defend') {
        if (!t || !t.alive || t === p) return false;
        s = kind === 'accuse'
          ? { kind: 'accuse', text: 'Bence ' + t.name + ' hain! ' + t.def.acc + ' çok şüpheli buluyorum.', targetId: t.id, weight: 25 }
          : { kind: 'defend', text: t.name + ' temiz, ona güveniyorum.', targetId: t.id, weight: 18 };
      } else if (kind === 'room') {
        s = { kind: 'info', text: 'Ben ' + SS.Map.roomInfo(mt.playerRoom).loc + ' idim.' };
      } else if (kind === 'findings') {
        return MT.sayFindings(m, mt, p);
      } else if (kind === 'claim') {
        if (!m.engineers) return false;
        s = { kind: 'defend', claim: 'engineer', text: 'Ben mühendisim, havalandırmayı kullanabiliyorum.', targetId: p.id, weight: 30 };
      } else if (kind === 'noevidence') {
        s = { kind: 'noevidence', text: 'Elimizde yeterli kanıt yok, pas geçelim.' };
      } else return false;
      mt.playerActs[kind] = true;
      s.speakerId = p.id;
      mt.msgCount[p.id] = 0; // oyuncunun mesajları sınırlanmaz (her seçenek zaten bir kez)
      return !!MT.say(m, mt, s);
    },

    // Dedektifin sorgu sonuçları: cesedin odasındaysa suçlama, değilse savunma olarak duyurulur.
    sayFindings(m, mt, c) {
      if (mt.playerActs && c.isPlayer) { if (mt.playerActs.findings) return false; }
      const out = [];
      m.cases.slice().reverse().forEach(cs => {
        const asked = cs.asked[c.id] || {};
        Object.keys(asked).forEach(id => {
          const t = m.chars[+id];
          if (!t.alive || asked[id] === null) return;
          const v = m.chars[cs.victimId], at = asked[id] === cs.room;
          const where = asked[id] === 'vent' ? 'havalandırmalardaydı' : SS.Map.roomInfo(asked[id]).loc + ' idi';
          out.push({ speakerId: c.id, kind: at ? 'accuse' : 'defend', targetId: t.id, weight: at ? 45 : 12, topic: 'interro',
            text: 'Sorguladım: ' + t.name + ', ' + v.name + ' öldürüldüğünde ' + where + (at ? ', cesedin olduğu yerde!' : '.') });
        });
      });
      if (!out.length) return false;
      if (c.isPlayer) { mt.playerActs.findings = true; mt.msgCount[c.id] = 0; }
      out.slice(0, 3).forEach(s => MT.say(m, mt, s));
      return true;
    },

    // ---------------------------------------------------------------- yargıç
    canJudge(c, t) {
      const G = SS.Game, m = G.match, mt = m && m.meeting;
      if (!c || c.sub !== 'judge') return { ok: false, reason: 'Sadece yargıç' };
      if (!mt || (G.state !== 'MEETING_DISCUSSION' && G.state !== 'MEETING_VOTE')) return { ok: false, reason: 'Yalnızca toplantıda' };
      if (!c.alive) return { ok: false, reason: 'Elendin' };
      if (c.judgeLeft <= 0) return { ok: false, reason: 'Yargılama hakkın bitti' };
      if (t !== undefined && (!t || t === c || !t.alive)) return { ok: false, reason: 'Yaşayan başka birini seç' };
      return { ok: true, reason: '' };
    },
    // Yargıç hedefi atar. Hedef hainse yalnızca hain gider; hain değilse hedef de yargıç da elenir.
    judge(c, t) {
      const G = SS.Game, m = G.match, mt = m.meeting;
      if (!MT.canJudge(c, t).ok) return null;
      c.judgeLeft--;
      const guilty = t.role === 'impostor';
      const outs = guilty ? [t] : [t, c];
      outs.forEach(o => {
        o.alive = false; o.ejected = true; o.judged = true; o.deathT = m.time;
        if (o.brain) o.brain.ghostT = U.range(14, 22);
        delete mt.votes[o.id];
      });
      const res = { judge: c, target: t, guilty, out: outs };
      mt.judgments = (mt.judgments || []).concat([{ judgeId: c.id, targetId: t.id, guilty }]);
      SS.Bots.onJudge(m, mt, res);
      SS.events.emit('judge', res);
      // Yargı anında tartışma/oylama biter; atılma ekranına geçilir. Zafer kontrolü atılmalar gösterildikten sonra yapılır.
      mt.schedule.length = 0;
      mt.phase = 'result';
      mt.judged = { judgeId: c.id, targetId: t.id, guilty };
      mt.tally = { counts: {}, skip: 0, ejected: t.id, reason: 'judge', max: 0 };
      mt.ejectedId = t.id;
      mt.ejectAt = 0;
      mt.resultDur = outs.length * SS.C.JUDGE_EJECT_SEG + 0.3;
      mt.resultT = 0;
      G.setState('MEETING_RESULT');
      SS.events.emit('meetingResult', mt);
      return res;
    },
    playerJudge(targetId) {
      const G = SS.Game, p = G.player(), t = G.match.chars[targetId];
      const chk = MT.canJudge(p, t);
      if (!chk.ok) { SS.events.emit('denied', chk.reason); return null; }
      return MT.judge(p, t);
    },
    botJudges(m, mt, at) {
      m.chars.forEach(c => {
        if (!c.brain || c.sub !== 'judge' || !c.alive || c.judgeLeft <= 0) return;
        if (mt.judgeAt === undefined) mt.judgeAt = {};
        if (mt.judgeAt[c.id] === undefined) mt.judgeAt[c.id] = U.range(5, 12);
        if (at < mt.judgeAt[c.id]) return;
        mt.judgeAt[c.id] = Infinity; // toplantı başına bir kez karar verir
        const t = SS.Bots.judgeTarget(m, mt, c);
        if (t) MT.judge(c, t);
      });
    },

    skipDiscussion() {
      const G = SS.Game;
      if (G.state !== 'MEETING_DISCUSSION') return false;
      MT.beginVote(G.match);
      return true;
    },

    beginVote(m) {
      const mt = m.meeting, C = SS.C;
      mt.phase = 'vote';
      mt.timer = C.VOTE_TIME;
      mt.voteElapsed = 0;
      mt.schedule.length = 0;
      m.chars.forEach(c => {
        if (!c.brain || !c.alive) return;
        const d = SS.Bots.decideVote(m, mt, c);
        mt.voteDecision[c.id] = d.target;
        mt.voteAt[c.id] = d.confidence >= 80 ? U.range(1, 4) : U.range(3, C.VOTE_TIME - 6);
      });
      SS.Game.setState('MEETING_VOTE');
      SS.events.emit('meetingVote', mt);
    },

    allVoted(m) {
      const mt = m.meeting;
      return m.chars.every(c => !c.alive || mt.votes.hasOwnProperty(c.id));
    },

    castVote(voterId, target) {
      const G = SS.Game, m = G.match, mt = m && m.meeting;
      if (!mt || G.state !== 'MEETING_VOTE') return false;
      const v = m.chars[voterId];
      if (!v || !v.alive || mt.votes.hasOwnProperty(voterId)) return false;
      if (target !== 'skip') {
        const t = m.chars[target];
        if (!t || !t.alive || t === v) return false;
      }
      mt.votes[voterId] = target;
      SS.events.emit('vote', { voterId, target });
      return true;
    },

    // Saf sayım fonksiyonu: tek başına en çok oyu alan ve pastan fazla oy alan elenir.
    tally(votes, voterIds) {
      const counts = {};
      let skip = 0;
      voterIds.forEach(v => {
        const t = Object.prototype.hasOwnProperty.call(votes, v) ? votes[v] : 'skip';
        if (t === 'skip') skip++; else counts[t] = (counts[t] || 0) + 1;
      });
      let max = 0, top = [];
      Object.keys(counts).forEach(k => {
        if (counts[k] > max) { max = counts[k]; top = [+k]; }
        else if (counts[k] === max) top.push(+k);
      });
      let ejected = null, reason;
      if (max === 0) reason = 'skip';
      else if (top.length > 1) reason = 'tie';
      else if (max <= skip) reason = 'skip';
      else { ejected = top[0]; reason = 'eject'; }
      return { counts, skip, ejected, reason, max };
    },

    resolve(m) {
      const mt = m.meeting, G = SS.Game;
      const voters = m.chars.filter(c => c.alive).map(c => c.id);
      voters.forEach(id => { if (!mt.votes.hasOwnProperty(id)) { mt.votes[id] = 'skip'; mt.autoSkip[id] = true; } });
      Object.keys(mt.votes).forEach(v => { if (voters.indexOf(+v) < 0) delete mt.votes[v]; else if (mt.votes[v] !== 'skip' && !m.chars[mt.votes[v]].alive) mt.votes[v] = 'skip'; });
      const r = MT.tally(mt.votes, voters);
      mt.tally = r;
      mt.ejectedId = r.ejected;
      if (r.ejected !== null) {
        const c = m.chars[r.ejected];
        c.alive = false; c.ejected = true; c.deathT = m.time;
        if (c.brain) c.brain.ghostT = U.range(14, 22);
        SS.Bots.afterEject(m, mt, c);
      }
      mt.phase = 'result';
      mt.resultT = 0;
      G.setState('MEETING_RESULT');
      SS.events.emit('meetingResult', mt);
    },

    finish(m) {
      const mt = m.meeting, G = SS.Game, C = SS.C;
      m.bodies.length = 0; // bütün cesetler toplantıyla duyurulmuş sayılır ve temizlenir
      G.placeAtSpawns(m);
      m.chars.forEach(c => {
        if (c.role === 'impostor') c.killCd = Math.max(c.killCd, C.KILL_COOLDOWN_START);
        if (c.sub === 'engineer') c.ventUseCd = Math.max(c.ventUseCd, C.ENGINEER_VENT_COOLDOWN_START);
      });
      m.emergencyCooldown = C.EMERGENCY_COOLDOWN;
      m.sab.cooldown = Math.max(m.sab.cooldown, 15);
      m.sab.doorCooldown = Math.max(m.sab.doorCooldown, 10);
      SS.Bots.afterMeeting(m);
      SS.Path.clear();
      m.meeting = null;
      G.setState('PLAYING');
      SS.events.emit('meetingEnd', mt);
      G.checkWin();
    },
  });
})();
