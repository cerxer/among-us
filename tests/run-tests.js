// Oyun çekirdeğinin DOM'suz testleri ve hızlandırılmış maç simülasyonları.
// Çalıştırma:  node tests/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CORE = ['util', 'data', 'map', 'physics', 'vision', 'pathfinding', 'sabotage', 'bots', 'meeting', 'game'];

function loadCore() {
  const ctx = { console, Math, Date, Set, Map, Object, Array, Float32Array, Uint8Array, Int8Array, Int16Array, Int32Array, Uint32Array, JSON, Error };
  ctx.window = ctx;
  vm.createContext(ctx);
  CORE.forEach(f => {
    const file = path.join(ROOT, 'js/core', f + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  });
  ctx.SS.Game.init();
  return ctx.SS;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

const SS = loadCore();
const G = SS.Game, M = SS.Map, U = SS.util;
const DT = 1 / 30;

function step(seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) G.update(DT);
}

// ------------------------------------------------------------------ harita
console.log('\nHarita ve yol bulma');
function bfsReach(fromTx, fromTy) {
  const seen = new Uint8Array(M.W * M.H), q = [[fromTx, fromTy]];
  seen[fromTy * M.W + fromTx] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (M.isSolidTile(nx, ny) || seen[ny * M.W + nx]) return;
      seen[ny * M.W + nx] = 1; q.push([nx, ny]);
    });
  }
  return seen;
}
const reach = bfsReach(40, 6);
const reachable = (x, y) => reach[Math.floor(y / M.T) * M.W + Math.floor(x / M.T)] === 1;

test('8 oda ve kapılar oluştu', () => {
  assert(M.rooms.length === 8, 'oda sayısı');
  assert(M.doors.length >= 16, 'kapı sayısı ' + M.doors.length);
  M.rooms.forEach(r => assert(M.doors.some(d => d.room === r.index), r.name + ' kapısız'));
});
test('bütün görev noktaları ulaşılabilir ve serbest', () => {
  M.stations.forEach(s => {
    assert(reachable(s.bx, s.by), s.id + ' ulaşılamıyor');
    assert(SS.Physics.circleFree(s.bx, s.by, SS.C.RADIUS), s.id + ' bekleme noktası duvarda');
  });
});
test('sabotaj panelleri ve havalandırmalar ulaşılabilir', () => {
  Object.values(M.panels).forEach(p => assert(reachable(p.bx, p.by) && SS.Physics.circleFree(p.bx, p.by, SS.C.RADIUS), p.key));
  M.vents.forEach(v => assert(reachable(v.x, v.y) && SS.Physics.circleFree(v.x, v.y, SS.C.RADIUS), 'vent ' + v.id));
});
test('doğma noktaları duvar/eşya içinde değil', () => {
  for (let i = 0; i < 8; i++) {
    const p = G.spawnPoint(i, 8);
    assert(SS.Physics.circleFree(p.x, p.y, SS.C.RADIUS), 'spawn ' + i);
    assert(reachable(p.x, p.y), 'spawn ulaşılamıyor ' + i);
  }
});
test('her oda çifti arasında A* yolu var', () => {
  M.rooms.forEach(a => M.rooms.forEach(b => {
    if (a === b) return;
    const pa = SS.Physics.findFreeSpot(a.cx, a.cy, 14), pb = SS.Physics.findFreeSpot(b.cx, b.cy, 14);
    const p = SS.Path.find(pa.x, pa.y, pb.x, pb.y);
    assert(p && p.length, a.name + ' -> ' + b.name);
  }));
});
test('en az iki dolaşım rotası (Merkez-Depo koridoru kapalıyken de yol var)', () => {
  const corr = SS.CORRIDORS[6];
  const saved = [];
  for (let x = corr.x; x < corr.x + corr.w; x++) { const i = 30 * M.W + x; saved.push(i); M.furn[i] = 1; }
  M.recompute();
  const p = SS.Path.find(M.roomById.merkez.cx, M.roomById.merkez.cy - 150, M.roomById.depo.cx, M.roomById.depo.cy);
  saved.forEach(i => { M.furn[i] = 0; }); M.recompute();
  assert(p && p.length > 3, 'alternatif rota yok');
});
test('görüş hattı duvardan geçmez, açık alanda geçer', () => {
  const r = M.roomById.merkez, e = M.roomById.elektrik;
  assert(SS.Vision.los(r.cx - 200, r.cy - 150, r.cx + 200, r.cy - 150), 'oda içi görüş');
  assert(!SS.Vision.los(r.cx, r.cy, e.cx, e.cy), 'odalar arası duvar');
});

// ------------------------------------------------------------------ hareket & çarpışma
console.log('\nHareket ve çarpışma');
test('karakter duvarın içinden geçemez', () => {
  G.newMatch({ seed: 1 });
  const c = G.match.chars[1];
  const r = M.roomById.merkez;
  c.x = r.cx; c.y = r.py + 30;
  for (let i = 0; i < 120; i++) G.moveChar(c, 0, -10);
  assert(c.y >= r.py + SS.C.RADIUS - 0.5, 'duvara girdi y=' + c.y);
  for (let i = 0; i < 60; i++) G.moveChar(c, 0, -400); // çok büyük adım (tünelleme denemesi)
  assert(c.y >= r.py + SS.C.RADIUS - 0.5, 'tünelleme');
});
test('çapraz hareket düz hareketten hızlı değil', () => {
  G.newMatch({ seed: 2, rolePref: 'crew' }); G.setState('PLAYING');
  const p = G.player(); const r = M.roomById.merkez;
  p.x = r.cx - 200; p.y = r.cy + 120; const sx = p.x, sy = p.y;
  G.input.x = 1; G.input.y = 1; G.updatePlayer(0.2);
  const d = Math.hypot(p.x - sx, p.y - sy);
  G.input.x = G.input.y = 0;
  assert(Math.abs(d - SS.C.SPEED * 0.2) < 1, 'çapraz mesafe ' + d);
});

// ------------------------------------------------------------------ saldırı
console.log('\nHain kuralları');
test('duvar arkasındaki hedefe saldırı yapılamaz; menzil ve bekleme süresi uygulanır', () => {
  G.newMatch({ seed: 3, rolePref: 'impostor' }); G.setState('PLAYING');
  const m = G.match, k = G.player(); const v = m.chars.find(c => c.role === 'crew');
  k.killCd = 0;
  // Duvarın iki yanı: Reaktör üst duvarı (y=22) ve İletişim-Reaktör koridoru dışı
  const rr = M.roomById.reaktor;
  k.x = rr.px + 30; k.y = rr.py + 20; v.x = rr.px + 30; v.y = rr.py - 45;
  assert(!SS.Vision.los(k.x, k.y, v.x, v.y), 'test kurulumu: duvar olmalı');
  assert(!G.kill(k, v), 'duvar arkası saldırı');
  v.x = k.x + 50; v.y = k.y;
  k.killCd = 5; assert(!G.kill(k, v), 'bekleme süresi');
  k.killCd = 0; v.x = k.x + 200; assert(!G.kill(k, v), 'menzil dışı');
  v.x = k.x + 50; assert(G.kill(k, v), 'geçerli saldırı');
  assert(!v.alive && m.bodies.length === 1 && Math.abs(k.killCd - SS.C.KILL_COOLDOWN) < 1e-6, 'sonuç');
  const mate = m.chars.find(c => c.role === 'impostor' && c !== k);
  k.killCd = 0; mate.x = k.x + 30; mate.y = k.y;
  assert(!G.kill(k, mate), 'takım arkadaşına saldırı');
  assert(!G.kill(k, v), 'ölüye saldırı');
});
test('havalandırma: sadece hain, sadece bağlı çıkışlar', () => {
  G.newMatch({ seed: 4, rolePref: 'impostor' }); G.setState('PLAYING');
  const m = G.match, p = G.player(), crew = m.chars.find(c => c.role === 'crew');
  const v0 = M.vents[0];
  crew.x = v0.x; crew.y = v0.y;
  assert(!G.enterVent(crew, v0), 'mürettebat girdi');
  p.x = v0.x + 10; p.y = v0.y;
  assert(G.enterVent(p, v0) && p.inVent === 0, 'hain giremedi');
  p.ventCd = 0;
  const notLinked = M.vents.find(v => v.id !== 0 && v0.links.indexOf(v.id) < 0);
  assert(!G.moveVent(p, notLinked.id), 'bağlı olmayan çıkış');
  assert(G.moveVent(p, v0.links[0]) && p.inVent === v0.links[0], 'bağlı çıkış');
  p.killCd = 0; const t = crew; t.x = p.x + 30; t.y = p.y;
  assert(!G.kill(p, t), 'havalandırmadan saldırı');
  p.ventCd = 0; assert(G.exitVent(p) && p.inVent === null, 'çıkış');
});

// ------------------------------------------------------------------ oylama
console.log('\nOylama');
test('sayım: tek en yüksek > pas -> elenir', () => {
  const r = SS.Meeting.tally({ 0: 3, 1: 3, 2: 3, 3: 'skip', 4: 1 }, [0, 1, 2, 3, 4]);
  assert(r.ejected === 3 && r.reason === 'eject', JSON.stringify(r));
});
test('sayım: eşitlik -> kimse elenmez', () => {
  const r = SS.Meeting.tally({ 0: 3, 1: 3, 2: 4, 3: 4, 4: 'skip' }, [0, 1, 2, 3, 4]);
  assert(r.ejected === null && r.reason === 'tie', JSON.stringify(r));
});
test('sayım: pas en yüksek veya eşit -> kimse elenmez', () => {
  let r = SS.Meeting.tally({ 0: 3, 1: 3, 2: 'skip', 3: 'skip', 4: 'skip' }, [0, 1, 2, 3, 4]);
  assert(r.ejected === null && r.reason === 'skip');
  r = SS.Meeting.tally({ 0: 3, 1: 3, 2: 'skip', 3: 'skip' }, [0, 1, 2, 3]);
  assert(r.ejected === null && r.reason === 'skip', 'pas=en yüksek eşit');
});
test('sayım: oy kullanılmayanlar pas sayılır', () => {
  const r = SS.Meeting.tally({ 0: 3 }, [0, 1, 2, 3]);
  assert(r.skip === 3 && r.ejected === null, JSON.stringify(r));
});
test('rapor -> toplantı -> oylama -> sonuç akışı ve sıfırlamalar', () => {
  G.newMatch({ seed: 5, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  const imp = m.chars.find(c => c.role === 'impostor'), v = m.chars.find(c => c.role === 'crew' && !c.isPlayer);
  imp.killCd = 0; imp.x = v.x + 30; imp.y = v.y;
  assert(G.kill(imp, v));
  SS.Sabotage.start(m, 'lights', null, imp) || (m.sab.cooldown = 0, SS.Sabotage.start(m, 'lights', null, imp));
  p.x = v.x + 40; p.y = v.y;
  assert(G.playerReport(), 'rapor edilemedi');
  assert(G.state === 'MEETING_DISCUSSION' && m.sab.active === null, 'toplantı başlamadı / sabotaj iptal edilmedi');
  step(3);
  assert(m.meeting.messages.length > 0, 'bot mesajı yok');
  assert(SS.Meeting.playerSay('room'), 'oyuncu konuşamadı');
  assert(!SS.Meeting.playerSay('room'), 'aynı seçenek iki kez');
  assert(!SS.Meeting.castVote(p.id, 'skip'), 'tartışmada oy');
  SS.Meeting.skipDiscussion();
  assert(G.state === 'MEETING_VOTE');
  assert(SS.Meeting.castVote(p.id, 'skip'));
  assert(!SS.Meeting.castVote(p.id, imp.id), 'iki kez oy');
  assert(!SS.Meeting.castVote(v.id, 'skip'), 'ölü oy');
  step(SS.C.VOTE_TIME + 1);
  assert(G.state === 'MEETING_RESULT', 'sonuç yok: ' + G.state);
  step(SS.C.RESULT_TIME + 0.5);
  assert(G.state === 'PLAYING' || G.state === 'GAME_OVER', G.state);
  assert(m.bodies.length === 0, 'cesetler temizlenmedi');
});
test('oksijen sırasında acil toplantı çağrılamaz', () => {
  G.newMatch({ seed: 6, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.emergencyCooldown = 0; m.sab.cooldown = 0;
  p.x = M.button.x; p.y = M.button.y + 110;
  SS.Sabotage.start(m, 'oxygen', null, m.chars.find(c => c.role === 'impostor'));
  assert(!G.canEmergency(p).ok && !G.callEmergency(p), 'oksijende toplantı');
  SS.Sabotage.fix(m, 'o2a', p);
  assert(m.sab.active === 'oxygen', 'tek panel yetmemeli');
  SS.Sabotage.fix(m, 'o2b', p);
  assert(m.sab.active === null, 'iki panel çözmeliydi');
  assert(G.callEmergency(p) && G.state === 'MEETING_DISCUSSION', 'toplantı çağrılamadı');
  assert(p.emergencyUsed, 'hak işaretlenmedi');
});
test('acil buton maç boyunca karakter başına bir kez', () => {
  const m = G.match, p = G.player();
  SS.Meeting.skipDiscussion(); step(SS.C.VOTE_TIME + SS.C.RESULT_TIME + 2);
  if (G.state !== 'PLAYING') return;
  m.emergencyCooldown = 0; p.x = M.button.x; p.y = M.button.y + 110;
  assert(!G.callEmergency(p), 'ikinci kez çağrıldı');
});

// ------------------------------------------------------------------ sabotaj
console.log('\nSabotaj');
test('oksijen süresi dolunca hainler kazanır (tek sonuç)', () => {
  G.newMatch({ seed: 7, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match; m.sab.cooldown = 0;
  m.chars.forEach(c => { if (c.brain) c.brain = null; }); // botları devre dışı bırak
  let overs = 0; SS.events.on('gameOver', () => overs++);
  SS.Sabotage.start(m, 'oxygen', null, m.chars.find(c => c.role === 'impostor'));
  step(SS.C.OXY_TIME + 1);
  assert(G.state === 'GAME_OVER' && m.winner === 'impostor', m.winner);
  G.endGame('crew', 'x'); G.checkWin();
  assert(m.winner === 'impostor' && overs === 1, 'iki sonuç ' + overs);
});
test('kapı sabotajı karakteri sıkıştırmaz, süre sonunda açılır', () => {
  G.newMatch({ seed: 8, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  const d = M.doors.find(x => x.room === M.roomById.depo.index);
  p.x = d.px + d.pw / 2; p.y = d.py + d.ph / 2;
  m.sab.doorCooldown = 0;
  assert(SS.Sabotage.start(m, 'doors', d.room, m.chars.find(c => c.role === 'impostor')));
  assert(SS.Physics.circleFree(p.x, p.y, SS.C.RADIUS), 'oyuncu sıkıştı');
  assert(M.doors.filter(x => x.room === d.room).every(x => x.closed), 'kapılar kapanmadı');
  m.chars.forEach(c => { if (c.brain) c.brain = null; });
  step(SS.C.DOOR_TIME + 0.5);
  assert(M.doors.every(x => !x.closed), 'kapılar açılmadı');
});
test('elektrik sabotajı görüşü azaltır ve onarılır', () => {
  G.newMatch({ seed: 9, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, p = G.player(); m.sab.cooldown = 0;
  m.chars.forEach(c => { if (c.brain) c.brain = null; });
  const before = G.visionRadius(p);
  SS.Sabotage.start(m, 'lights', null, m.chars.find(c => c.role === 'impostor'));
  step(2);
  assert(G.visionRadius(p) < before * 0.6, 'görüş azalmadı');
  assert(SS.Sabotage.fix(m, 'lights', p) && m.sab.active === null);
});

// ------------------------------------------------------------------ görev & zafer
console.log('\nGörev ve zafer');
test('sahte görev ilerleme artırmaz; gerçek görev artırır; tümü bitince mürettebat kazanır', () => {
  G.newMatch({ seed: 10, rolePref: 'impostor' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (c.brain) c.brain = null; });
  G.completeTask(p, 0);
  assert(m.tasksDone === 0, 'sahte görev ilerletti');
  const crew = m.chars.filter(c => c.role === 'crew');
  assert(m.tasksTotal === crew.length * 4, 'toplam');
  G.completeTask(crew[0], 0); assert(m.tasksDone === 1);
  assert(!G.completeTask(crew[0], 0), 'tamamlanan görev tekrarlandı');
  crew.forEach(c => c.tasks.forEach((t, i) => G.completeTask(c, i)));
  assert(m.winner === 'crew' && G.state === 'GAME_OVER');
});
test('hainler mürettebata eşitlenince hainler kazanır', () => {
  G.newMatch({ seed: 11, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match;
  m.chars.forEach(c => { if (c.brain) c.brain = null; });
  const imp = m.chars.find(c => c.role === 'impostor');
  const crew = m.chars.filter(c => c.role === 'crew');
  for (let i = 0; i < 4; i++) { imp.killCd = 0; crew[i].x = imp.x + 30; crew[i].y = imp.y; assert(G.kill(imp, crew[i]), 'kill ' + i); }
  assert(m.winner === 'impostor', 'kazanan ' + m.winner);
});
test('bütün hainler elenince mürettebat kazanır', () => {
  G.newMatch({ seed: 12, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match;
  m.chars.filter(c => c.role === 'impostor').forEach(c => { c.alive = false; });
  G.checkWin();
  assert(m.winner === 'crew');
});
test('duraklatma süreleri durdurur, devam ettirir', () => {
  G.newMatch({ seed: 13, rolePref: 'impostor' }); G.setState('PLAYING');
  const m = G.match, p = G.player(); const cd = p.killCd, t = m.time;
  G.pause(); step(5);
  assert(p.killCd === cd && m.time === t, 'duraklatmada süre ilerledi');
  G.resume(); assert(G.state === 'PLAYING');
  step(1); assert(p.killCd < cd);
});

// ------------------------------------------------------------------ simülasyon
console.log('\nHızlandırılmış maç simülasyonu (oyuncu da bot)');
test('40 tam maç: hatasız biter, botlar görev yapar, saldırır, toplantı yapar', () => {
  const stats = { crew: 0, impostor: 0, reasons: {}, meetings: 0, kills: 0, tasks: 0, maxTime: 0, ejections: 0, ejectedImp: 0, sabotages: 0, vents: 0, msgs: 0 };
  SS.events.on('sabotage', () => stats.sabotages++);
  SS.events.on('vent', e => { if (e.kind === 'enter') stats.vents++; });
  SS.events.on('meetingResult', mt => { if (mt.ejectedId !== null) { stats.ejections++; if (G.match.chars[mt.ejectedId].role === 'impostor') stats.ejectedImp++; } });
  SS.events.on('meetingMessage', () => stats.msgs++);
  for (let s = 0; s < 40; s++) {
    G.startGame({ seed: 1000 + s, autopilot: true, rolePref: s % 3 === 0 ? 'impostor' : 'random' });
    const m = G.match;
    let guard = 0;
    while (G.state !== 'GAME_OVER' && guard < 30 * 60 * 15) { G.update(DT); guard++; }
    assert(G.state === 'GAME_OVER', 'maç bitmedi seed=' + (1000 + s) + ' t=' + m.time.toFixed(0) + ' görev=' + m.tasksDone + '/' + m.tasksTotal);
    stats[m.winner]++;
    stats.reasons[m.reason] = (stats.reasons[m.reason] || 0) + 1;
    stats.meetings += m.meetings; stats.kills += m.kills; stats.tasks += m.tasksDone;
    stats.maxTime = Math.max(stats.maxTime, m.time);
  }
  console.log('     ' + JSON.stringify(stats));
  assert(stats.crew > 0 && stats.impostor > 0, 'iki taraf da kazanabilmeli');
  assert(stats.kills > 0 && stats.meetings > 0 && stats.tasks > 0 && stats.sabotages > 0, 'mekanikler tetiklenmedi');
});
test('Tekrar Oyna: art arda 3 yeni maç temiz başlar', () => {
  for (let i = 0; i < 3; i++) {
    const m = G.startGame({ seed: 50 + i });
    assert(G.state === 'ROLE_REVEAL' && m.tasksDone === 0 && m.bodies.length === 0 && !m.meeting && m.chars.every(c => c.alive && c.inVent === null), 'temiz değil');
    assert(M.doors.every(d => !d.closed) && m.sab.active === null, 'sabotaj/kapı kaldı');
    step(SS.C.ROLE_REVEAL_TIME + 0.2); assert(G.state === 'PLAYING');
    step(20);
  }
});

console.log('\n' + passed + ' geçti, ' + failed + ' başarısız\n');
process.exit(failed ? 1 : 0);
