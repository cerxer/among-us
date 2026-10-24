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
        if (mt.timer <= 0) MT.beginVote(m);
      } else if (G.state === 'MEETING_VOTE') {
        mt.timer -= dt;
        mt.voteElapsed += dt;
        m.chars.forEach(c => {
          if (!c.brain || !c.alive || mt.votes.hasOwnProperty(c.id)) return;
          if (mt.voteElapsed >= mt.voteAt[c.id]) MT.castVote(c.id, mt.voteDecision[c.id]);
        });
        if (MT.allVoted(m) && mt.timer > 1.2) mt.timer = 1.2;
        if (mt.timer <= 0) MT.resolve(m);
      } else if (G.state === 'MEETING_RESULT') {
        mt.resultT += dt;
        if (mt.resultT >= C.RESULT_TIME) MT.finish(m);
      }
    },

    say(m, mt, s) {
      const sp = m.chars[s.speakerId];
      if (!sp || !sp.alive) return null;
      if ((mt.msgCount[sp.id] || 0) >= 4) return null;
      mt.msgCount[sp.id] = (mt.msgCount[sp.id] || 0) + 1;
      const msg = { seq: ++mt.seq, speakerId: s.speakerId, text: s.text, kind: s.kind, targetId: s.targetId, weight: s.weight || 0, t: mt.elapsed };
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
      } else if (kind === 'noevidence') {
        s = { kind: 'noevidence', text: 'Elimizde yeterli kanıt yok, pas geçelim.' };
      } else return false;
      mt.playerActs[kind] = true;
      s.speakerId = p.id;
      mt.msgCount[p.id] = 0; // oyuncunun mesajları sınırlanmaz (her seçenek zaten bir kez)
      return !!MT.say(m, mt, s);
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
      m.chars.forEach(c => { if (c.role === 'impostor') c.killCd = Math.max(c.killCd, C.KILL_COOLDOWN_START); });
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
