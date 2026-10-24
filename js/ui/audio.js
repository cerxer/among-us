// Ses: Web Audio ile üretilen özgün efektler. Kullanıcı etkileşimi gelmeden ses bağlamı açılmaz.
// Ses sistemi başarısız olursa oyun sessizce devam eder.
(function () {
  'use strict';
  const SS = window.SS;

  const A = (SS.Audio = {
    ctx: null, master: null, muted: false, unlocked: false, alarmT: 0,

    init() {
      try { A.muted = localStorage.getItem('ss_muted') === '1'; } catch (e) { A.muted = false; }
      const unlock = () => A.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      SS.events.on('taskComplete', e => { if (e.c.isPlayer) A.task(); });
      SS.events.on('fakeTask', () => A.blip(520, 0.08));
      SS.events.on('sabotage', e => { if (e.type !== 'doors') A.alarm(); else A.door(); });
      SS.events.on('sabotageEnd', e => { if (!e.cancelled) A.fixed(); });
      SS.events.on('meetingStart', () => A.meeting());
      SS.events.on('vote', e => { if (e.voterId === 0) A.blip(700, 0.06); else A.blip(380, 0.03, 0.05); });
      SS.events.on('meetingMessage', () => A.blip(900, 0.03, 0.05));
      SS.events.on('meetingResult', () => A.whoosh());
      SS.events.on('gameOver', e => {
        const p = SS.Game.player();
        const win = (e.winner === 'crew') === (p.role === 'crew');
        if (win) A.win(); else A.lose();
      });
      SS.events.on('kill', e => { if (SS.Game.canSee(SS.Game.player(), e.victim.x, e.victim.y)) A.bonk(); });
      SS.events.on('vent', e => { if (e.c.isPlayer || SS.Game.canSee(SS.Game.player(), e.vent.x, e.vent.y)) A.vent(); });
      SS.events.on('denied', () => A.blip(180, 0.07));
    },

    unlock() {
      if (A.unlocked && A.ctx && A.ctx.state === 'running') return;
      try {
        if (!A.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          A.ctx = new AC();
          A.master = A.ctx.createGain();
          A.master.gain.value = A.muted ? 0 : 0.5;
          A.master.connect(A.ctx.destination);
        }
        if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
        A.unlocked = true;
      } catch (e) { A.ctx = null; }
    },

    setMuted(v) {
      A.muted = !!v;
      try { localStorage.setItem('ss_muted', A.muted ? '1' : '0'); } catch (e) { /* depolama yoksa önemli değil */ }
      if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
    },

    tone(freq, dur, type, vol, delay, slideTo) {
      if (!A.ctx || A.muted || A.ctx.state !== 'running') return;
      try {
        const t0 = A.ctx.currentTime + (delay || 0);
        const o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(A.master);
        o.start(t0); o.stop(t0 + dur + 0.05);
      } catch (e) { /* sessiz geç */ }
    },
    noise(dur, vol, delay, filterFreq) {
      if (!A.ctx || A.muted || A.ctx.state !== 'running') return;
      try {
        const t0 = A.ctx.currentTime + (delay || 0);
        const len = Math.floor(A.ctx.sampleRate * dur);
        const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = A.ctx.createBufferSource(); src.buffer = buf;
        const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
        const g = A.ctx.createGain(); g.gain.value = vol || 0.2;
        src.connect(f); f.connect(g); g.connect(A.master);
        src.start(t0);
      } catch (e) { /* sessiz geç */ }
    },

    click() { A.tone(660, 0.06, 'square', 0.08); },
    blip(f, d, v) { A.tone(f, d || 0.06, 'triangle', v || 0.12); },
    task() { [523, 659, 784, 1047].forEach((f, i) => A.tone(f, 0.16, 'triangle', 0.16, i * 0.07)); },
    fixed() { A.tone(440, 0.12, 'sine', 0.16); A.tone(880, 0.2, 'sine', 0.16, 0.1); },
    alarm() { for (let i = 0; i < 3; i++) { A.tone(880, 0.18, 'sawtooth', 0.09, i * 0.36); A.tone(620, 0.18, 'sawtooth', 0.09, i * 0.36 + 0.18); } },
    alarmBeep() { A.tone(760, 0.14, 'square', 0.05); },
    meeting() { A.tone(392, 0.25, 'square', 0.12); A.tone(523, 0.25, 'square', 0.12, 0.2); A.tone(784, 0.45, 'square', 0.12, 0.4); },
    bonk() { A.tone(300, 0.18, 'square', 0.18, 0, 80); A.noise(0.15, 0.15, 0, 900); },
    vent() { A.noise(0.25, 0.12, 0, 600); A.tone(200, 0.2, 'triangle', 0.08, 0, 90); },
    door() { A.tone(140, 0.3, 'sawtooth', 0.1, 0, 70); A.noise(0.2, 0.1, 0.05, 500); },
    whoosh() { A.noise(0.8, 0.12, 0, 700); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone(f, 0.28, 'triangle', 0.15, i * 0.12)); },
    lose() { [440, 392, 330, 262].forEach((f, i) => A.tone(f, 0.35, 'sawtooth', 0.09, i * 0.18)); },

    // Aktif sabotajda periyodik alarm bip'i (oyun döngüsünden çağrılır, kare hızından bağımsız).
    tick(dt) {
      const G = SS.Game, m = G.match;
      if (!m || !G.worldActive() || !m.sab.active) { A.alarmT = 0; return; }
      A.alarmT -= dt;
      if (A.alarmT <= 0) {
        A.alarmT = m.sab.active === 'oxygen' ? 1.0 : 2.6;
        A.alarmBeep();
      }
    },
  });
})();
