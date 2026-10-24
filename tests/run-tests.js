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
  const N = SS.CHARACTERS.length;
  for (let i = 0; i < N; i++) {
    const p = G.spawnPoint(i, N);
    assert(SS.Physics.circleFree(p.x, p.y, SS.C.RADIUS), 'spawn ' + i);
    assert(reachable(p.x, p.y), 'spawn ulaşılamıyor ' + i);
    assert(U.dist(p.x, p.y, M.button.x, M.button.y) < SS.C.BUTTON_RANGE - 4, 'doğma noktası buton menzili dışında ' + i);
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
  for (let i = 0; i < 30 * (SS.C.VOTE_TIME + 1) && G.state === 'MEETING_VOTE'; i++) G.update(DT);
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
  const need = crew.length - SS.C.IMPOSTORS; // hain sayısı mürettebata eşitlenene kadar
  for (let i = 0; i < need; i++) {
    assert(m.winner === null, 'erken bitti: ' + i);
    imp.killCd = 0; crew[i].x = imp.x + 30; crew[i].y = imp.y; assert(G.kill(imp, crew[i]), 'kill ' + i);
  }
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

// ------------------------------------------------------------------ karakter seçimi
console.log('\nKarakter seçimi');
test('oyuncu seçtiği karakterle başlar; diğerleri benzersiz ve rastgele', () => {
  const orders = new Set();
  SS.CHARACTERS.forEach((d, i) => {
    G.newMatch({ seed: 600 + i, charKey: d.key, rolePref: ['random', 'impostor', 'doctor'][i % 3] });
    const ks = G.match.chars.map(c => c.def.key);
    assert(ks[0] === d.key, 'oyuncu ' + ks[0] + ' != ' + d.key);
    assert(new Set(ks).size === SS.CHARACTERS.length, 'tekrarlı karakter');
    orders.add(ks.slice(1).join(','));
  });
  assert(orders.size > 1, 'diğer karakterler hep aynı sırada');
  for (let i = 0; i < 5; i++) { G.newMatch({ seed: 620 + i }); assert(G.player().def.key === 'kirmizi', 'varsayılan ' + G.player().def.key); }
  G.newMatch({ seed: 610, charKey: 'yok-boyle-biri' });
  assert(new Set(G.match.chars.map(c => c.def.key)).size === SS.CHARACTERS.length, 'geçersiz anahtar bozdu');
});

// ------------------------------------------------------------------ mühendis
console.log('\nMühendis rolü');
test('her maçta ayarlanan sayıda mühendis, her zaman mürettebattan', () => {
  for (let i = 0; i < 30; i++) {
    G.newMatch({ seed: 300 + i, rolePref: ['random', 'crew', 'impostor'][i % 3] });
    const e = G.match.chars.filter(c => c.sub === 'engineer');
    assert(e.length === SS.C.ENGINEERS && e.every(c => c.role === 'crew') && G.match.engineers === SS.C.ENGINEERS, 'seed ' + (300 + i));
    if (i % 3 === 1) assert(!G.player().sub, 'mürettebat tercihinde oyuncu mühendis oldu');
  }
  G.newMatch({ seed: 331, rolePref: 'engineer' });
  assert(G.player().sub === 'engineer' && G.player().role === 'crew', 'mühendis tercihi');
});
test('mühendis havalandırmayı kullanır; sıradan mürettebat kullanamaz', () => {
  G.newMatch({ seed: 332, rolePref: 'engineer' }); G.setState('PLAYING');
  const m = G.match, p = G.player(), v0 = M.vents[0];
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const plain = m.chars.find(c => c.role === 'crew' && !c.sub);
  plain.x = v0.x; plain.y = v0.y;
  assert(!G.enterVent(plain, v0), 'sıradan mürettebat girdi');
  p.x = v0.x + 10; p.y = v0.y;
  assert(!G.enterVent(p, v0), 'başlangıç beklemesinde girdi');
  p.ventUseCd = 0;
  assert(G.enterVent(p, v0) && p.inVent === 0, 'mühendis giremedi');
  p.ventCd = 0;
  const notLinked = M.vents.find(v => v.id !== 0 && v0.links.indexOf(v.id) < 0);
  assert(!G.moveVent(p, notLinked.id) && G.moveVent(p, v0.links[0]), 'bağlantı kuralı');
  assert(G.ctx === null || true);
  assert(G.context().use.kind === 'ventExit', 'içeride çıkış seçeneği yok');
});
test('mühendis en fazla 10 sn içeride kalır, çıkınca 20 sn bekler', () => {
  const p = G.player();
  step(SS.C.ENGINEER_VENT_MAX + 0.2);
  assert(p.inVent === null, 'süre dolunca atılmadı');
  assert(SS.Physics.circleFree(p.x, p.y, SS.C.RADIUS), 'çıkış noktası duvarda');
  assert(Math.abs(p.ventUseCd - SS.C.ENGINEER_VENT_COOLDOWN) < 0.3, 'bekleme ' + p.ventUseCd);
  const v = M.vents.find(x => U.dist(p.x, p.y, x.x, x.y) < 80);
  assert(!G.enterVent(p, v), 'beklemede tekrar girdi');
  const u = G.context().use;
  assert(u && u.kind === 'vent' && u.disabled && /bekleme/.test(u.reason), 'pasif sebebi yok: ' + JSON.stringify(u && u.reason));
  step(SS.C.ENGINEER_VENT_COOLDOWN + 0.2);
  p.ventCd = 0;
  assert(G.enterVent(p, v), 'bekleme bittikten sonra giremedi');
});
test('mühendis saldıramaz, sabotaj yapamaz, görevleri gerçek ilerlemedir', () => {
  G.newMatch({ seed: 333, rolePref: 'engineer' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const v = m.chars.find(c => c.role === 'crew' && c !== p);
  p.killCd = 0; v.x = p.x + 30; v.y = p.y;
  assert(!G.kill(p, v) && v.alive, 'mühendis saldırdı');
  m.sab.cooldown = 0;
  assert(!G.playerSabotage('lights'), 'mühendis sabotaj yaptı');
  assert(G.completeTask(p, 0) && m.tasksDone === 1, 'görev ilerletmedi');
});
test('havalandırma tanıklığı mühendis varken kesin kanıt sayılmaz; çakışan iddia şüphe doğurur', () => {
  G.newMatch({ seed: 334, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, imp = m.chars.find(c => c.role === 'impostor');
  const watcher = m.chars.find(c => c.role === 'crew' && !c.isPlayer && !c.sub);
  const v0 = M.vents[0];
  m.chars.forEach(c => { if (c !== watcher && c.brain) c.brain = null; });
  imp.x = v0.x + 10; imp.y = v0.y; watcher.x = v0.x + 120; watcher.y = v0.y;
  assert(SS.Vision.los(watcher.x, watcher.y, imp.x, imp.y), 'kurulum');
  assert(G.enterVent(imp, v0));
  assert(watcher.brain.susp[imp.id] < 90 && watcher.brain.susp[imp.id] >= 50, 'şüphe ' + watcher.brain.susp[imp.id]);
  // Mühendis sayısı kadar iddia normaldir; fazlası çakışmadır ve iddia sahiplerine şüphe doğurur.
  const engs = m.chars.filter(c => c.sub === 'engineer');
  const mt = { publicSusp: {}, accusers: {}, noEvidence: 0, msgCount: {} };
  const claim = c => SS.Bots.hear(m, mt, { speakerId: c.id, kind: 'defend', claim: 'engineer', targetId: c.id, weight: 30 });
  claim(imp);
  engs.slice(0, m.engineers - 1).forEach(claim);
  const lastEng = engs[m.engineers - 1];
  const before = watcher.brain.susp[lastEng.id] || 0;
  assert(m.engClaims.length === m.engineers, 'kurulum: iddia sayısı');
  claim(lastEng); // iddia sayısı mühendis sayısını aştı
  assert((watcher.brain.susp[lastEng.id] || 0) > before && watcher.brain.susp[imp.id] > 60, 'çakışan iddia şüphe doğurmadı');
});

// ------------------------------------------------------------------ doktor
console.log('\nDoktor rolü');
test('her maçta ayarlanan sayıda doktor; mühendislerden ayrı ve mürettebattan', () => {
  for (let i = 0; i < 40; i++) {
    const pref = ['random', 'crew', 'impostor', 'engineer', 'doctor'][i % 5];
    G.newMatch({ seed: 400 + i, rolePref: pref });
    const d = G.match.chars.filter(c => c.sub === 'doctor'), e = G.match.chars.filter(c => c.sub === 'engineer');
    assert(d.length === SS.C.DOCTORS && e.length === SS.C.ENGINEERS && d.every(c => c.role === 'crew' && e.indexOf(c) < 0), 'seed ' + (400 + i));
    if (pref === 'doctor') assert(G.player().sub === 'doctor', 'doktor tercihi');
    if (pref === 'crew' || pref === 'engineer') assert(G.player().sub !== 'doctor', 'oyuncuya istenmeden doktor verildi');
  }
});
test('yaşam belirtileri: pil azalır, bitince kapanır, şarj olur; açıkken yürünmez', () => {
  G.newMatch({ seed: 441, rolePref: 'doctor' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  assert(G.playerVitals() && p.vitalsOpen, 'açılmadı');
  const x0 = p.x; G.input.x = 1; G.input.y = 0; step(1); G.input.x = 0;
  assert(p.x === x0, 'ekran açıkken yürüdü');
  assert(Math.abs(p.battery - (SS.C.VITALS_BATTERY - 1)) < 0.1, 'pil ' + p.battery);
  step(SS.C.VITALS_BATTERY);
  assert(!p.vitalsOpen && p.battery === 0 && p.vitalsCd > SS.C.VITALS_COOLDOWN - 1.5, 'pil bitince kapanmadı');
  assert(!G.playerVitals() && !p.vitalsOpen, 'şarjda açıldı');
  step(SS.C.VITALS_COOLDOWN + 0.1);
  assert(p.vitalsCd === 0 && p.battery === SS.C.VITALS_BATTERY, 'şarj olmadı');
});
test('görev pili şarj eder ve şarj beklemesini bitirir', () => {
  const p = G.player();
  p.battery = 0; p.vitalsCd = 12;
  G.completeTask(p, 0);
  assert(p.vitalsCd === 0 && p.battery === SS.C.VITALS_TASK_RECHARGE, 'pil ' + p.battery + ' cd ' + p.vitalsCd);
});
test('yaşam belirtileri durumları doğru; toplantı ekranı kapatır; hayalet kullanamaz', () => {
  G.newMatch({ seed: 442, rolePref: 'doctor' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const imp = m.chars.find(c => c.role === 'impostor'), v = m.chars.find(c => c.role === 'crew' && !c.isPlayer);
  imp.killCd = 0; v.x = imp.x + 30; v.y = imp.y; G.kill(imp, v);
  const ej = m.chars.find(c => c.role === 'crew' && c.alive && !c.isPlayer); ej.alive = false; ej.ejected = true;
  const vs = G.vitals();
  assert(vs[v.id].status === 'dead' && vs[ej.id].status === 'ejected' && vs[p.id].status === 'alive', JSON.stringify(vs));
  assert(G.playerVitals() && p.vitalsOpen, 'açılmadı');
  const caller = m.chars.find(c => c.alive && c.role === 'crew' && !c.isPlayer);
  m.emergencyCooldown = 0; caller.x = M.button.x; caller.y = M.button.y + 110;
  assert(G.callEmergency(caller) && G.state === 'MEETING_DISCUSSION', 'toplantı başlamadı');
  assert(!p.vitalsOpen, 'toplantı ekranı kapatmadı');
  p.alive = false;
  assert(!G.canVitals(p).ok && !G.openVitals(p), 'hayalet kullandı');
});
test('doktor bot cesedi bulunmamış ölümü görür, toplantıda zaman aralığıyla söyler', () => {
  G.newMatch({ seed: 443, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, doc = m.chars.find(c => c.sub === 'doctor');
  m.chars.forEach(c => { if (c !== doc && c.brain) c.brain = null; });
  SS.Bots.readVitals(m, doc);
  step(5);
  const imp = m.chars.find(c => c.role === 'impostor'), v = m.chars.find(c => c.role === 'crew' && c !== doc && !c.isPlayer);
  const r = M.roomById.reaktor; v.x = r.cx; v.y = r.cy + 120; imp.x = v.x + 30; imp.y = v.y; imp.killCd = 0;
  doc.x = M.roomById.oksijen.cx; doc.y = M.roomById.oksijen.cy;
  assert(G.kill(imp, v), 'saldırı');
  assert(SS.Bots.readVitals(m, doc) === 1, 'yeni ölüm görülmedi');
  assert(SS.Bots.readVitals(m, doc) === 0, 'aynı ölüm iki kez sayıldı');
  doc.emergencyUsed = false; m.emergencyCooldown = 0; doc.x = M.button.x; doc.y = M.button.y + 110;
  assert(G.callEmergency(doc));
  const st = m.meeting.schedule.find(s => s.speakerId === doc.id);
  assert(st && /yaşam belirtilerinde .* ölü görünüyor\. Son \d+ saniye içinde olmuş\./.test(st.text), st && st.text);
});

// ------------------------------------------------------------------ dedektif
console.log('\nDedektif rolü');
test('her maçta ayarlanan sayıda dedektif; diğer rollerden ayrı, mürettebattan', () => {
  for (let i = 0; i < 36; i++) {
    const pref = ['random', 'crew', 'impostor', 'engineer', 'doctor', 'detective'][i % 6];
    G.newMatch({ seed: 700 + i, rolePref: pref });
    const subs = G.match.chars.filter(c => c.role === 'crew').map(c => c.sub).filter(Boolean);
    const det = G.match.chars.filter(c => c.sub === 'detective');
    assert(det.length === SS.C.DETECTIVES && det.every(c => c.role === 'crew') && subs.length === SS.C.ENGINEERS + SS.C.DOCTORS + SS.C.DETECTIVES + SS.C.TRACKERS + SS.C.JUDGES, 'seed ' + (700 + i) + ' ' + subs);
    if (pref === 'detective') assert(G.player().sub === 'detective', 'dedektif tercihi');
  }
});
function detectiveSetup(seed) {
  G.newMatch({ seed, rolePref: 'detective' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const imp = m.chars.find(c => c.role === 'impostor'), mate = m.chars.find(c => c.role === 'impostor' && c !== imp);
  const v = m.chars.find(c => c.role === 'crew' && !c.isPlayer);
  const far = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c !== v);
  const dep = M.roomById.depo, el = M.roomById.elektrik;
  v.x = dep.cx; v.y = dep.cy; imp.x = dep.cx + 30; imp.y = dep.cy; imp.killCd = 0;
  far.x = el.cx; far.y = el.cy;
  mate.ventCd = 0; mate.x = M.vents[0].x + 10; mate.y = M.vents[0].y; G.enterVent(mate, M.vents[0]);
  return { m, p, imp, mate, v, far };
}
test('sorgu yalnızca rapor edilmiş cesetten sonra ve temas mesafesinde; cevap cinayet anındaki oda', () => {
  const { m, p, imp, mate, v, far } = detectiveSetup(740);
  p.x = far.x + 30; p.y = far.y;
  assert(!G.canInterrogate(p, far).ok && /rapor/.test(G.canInterrogate(p, far).reason), 'davasız sorgu');
  assert(G.kill(imp, v));
  G.exitVent(mate, true);
  const reporter = m.chars.find(c => c.alive && c.role === 'crew' && !c.isPlayer && c !== far);
  reporter.x = v.x + 40; reporter.y = v.y;
  assert(G.report(reporter, m.bodies[0]) && m.activeCase && p.caseLeft === SS.C.INTERROGATIONS, 'dava açılmadı');
  SS.Meeting.skipDiscussion(); for (let i = 0; i < 30 * 40 && G.state !== 'PLAYING'; i++) G.update(DT);
  assert(G.state === 'PLAYING', 'toplantı bitmedi: ' + G.state);
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  // uzak: temas yok
  far.x = p.x + 120; far.y = p.y;
  assert(!G.canInterrogate(p, far).ok && /Temas/.test(G.canInterrogate(p, far).reason), 'uzaktan sorgu');
  far.x = p.x + 30; far.y = p.y;
  const r1 = G.interrogate(p, far);
  assert(r1 && r1.answer === M.roomById.elektrik.index && !r1.atBody, 'uzaktaki mürettebatın cevabı ' + JSON.stringify(r1 && r1.label));
  assert(!G.interrogate(p, far), 'aynı kişi iki kez / bekleme');
  p.intCd = 0;
  assert(!G.interrogate(p, far) && /zaten/.test(G.canInterrogate(p, far).reason), 'aynı kişi iki kez');
  if (imp.alive) {
    imp.x = p.x - 30; imp.y = p.y; p.intCd = 0;
    const r2 = G.interrogate(p, imp);
    assert(r2 && r2.atBody && r2.label === 'Depo', 'katil cesedin odasında görünmeli: ' + (r2 && r2.label));
  }
  if (mate.alive) {
    mate.x = p.x; mate.y = p.y + 30; p.intCd = 0;
    const r3 = G.interrogate(p, mate);
    assert(r3 && r3.label === 'Havalandırmalar', 'havalandırmadaki: ' + (r3 && r3.label));
  }
});
test('dava başına 3 sorgu; yeni rapor yeni dava açar ve hakları yeniler; hayalet sorgulayamaz', () => {
  const m = G.match, p = G.player();
  assert(p.caseLeft === 0, 'kalan ' + p.caseLeft);
  const other = m.chars.find(c => c.alive && !c.isPlayer && (m.activeCase.asked[p.id] || {})[c.id] === undefined);
  if (other) { other.x = p.x + 30; other.y = p.y; p.intCd = 0; assert(!G.canInterrogate(p, other).ok && /bitti/.test(G.canInterrogate(p, other).reason), 'hak bitmedi'); }
  const imp = m.chars.find(c => c.alive && c.role === 'impostor'), v = m.chars.find(c => c.alive && c.role === 'crew' && !c.isPlayer);
  if (imp && v) {
    imp.killCd = 0; v.x = imp.x + 30; v.y = imp.y; G.kill(imp, v);
    if (G.state === 'PLAYING') {
      p.x = v.x + 50; p.y = v.y;
      assert(G.report(p, m.bodies[m.bodies.length - 1]), 'rapor');
      assert(m.cases.length === 2 && m.activeCase.id === 2 && p.caseLeft === SS.C.INTERROGATIONS, 'ikinci dava');
    }
  }
  p.alive = false;
  assert(!G.canInterrogate(p, null).ok, 'hayalet sorguladı');
});
test('dedektif bot toplantıdan sonra sorgular ve sonraki toplantıda bulgusunu söyler', () => {
  G.newMatch({ seed: 760, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, det = m.chars.find(c => c.sub === 'detective');
  m.chars.forEach(c => { if (c !== det && c.brain) c.brain = null; });
  const imp = m.chars.find(c => c.role === 'impostor'), v = m.chars.find(c => c.role === 'crew' && c !== det && !c.isPlayer);
  const dep = M.roomById.depo; v.x = dep.cx; v.y = dep.cy; imp.x = dep.cx + 30; imp.y = dep.cy; imp.killCd = 0;
  assert(G.kill(imp, v));
  const rep = m.chars.find(c => c.alive && c.role === 'crew' && c !== det && !c.isPlayer);
  rep.x = v.x + 40; rep.y = v.y;
  assert(G.report(rep, m.bodies[0]));
  SS.Meeting.skipDiscussion();
  m.chars.forEach(c => { if (c.alive) SS.Meeting.castVote(c.id, 'skip'); });
  for (let i = 0; i < 30 * 40 && G.state !== 'PLAYING'; i++) G.update(DT);
  imp.killCd = 999;
  step(25);
  const asked = Object.keys(m.activeCase.asked[det.id] || {}).length;
  assert(asked >= 2, 'dedektif bot yeterince sorgulamadı: ' + asked);
  det.emergencyUsed = false; m.emergencyCooldown = 0; det.x = M.button.x; det.y = M.button.y + 110;
  if (G.state === 'PLAYING') {
    assert(G.callEmergency(det));
    const st = m.meeting.schedule.filter(s => s.speakerId === det.id && /^Sorguladım: /.test(s.text));
    assert(st.length >= 1, 'bulgu söylenmedi: ' + m.meeting.schedule.filter(s => s.speakerId === det.id).map(s => s.text).join(' | '));
  }
});

// ------------------------------------------------------------------ iz sürücü
console.log('\nİz sürücü rolü');
test('her maçta ayarlanan sayıda iz sürücü, mürettebattan; tercihle oyuncuya verilir', () => {
  for (let i = 0; i < 21; i++) {
    const pref = ['random', 'crew', 'impostor', 'engineer', 'doctor', 'detective', 'tracker'][i % 7];
    G.newMatch({ seed: 800 + i, rolePref: pref });
    const t = G.match.chars.filter(c => c.sub === 'tracker');
    assert(t.length === SS.C.TRACKERS && t.every(c => c.role === 'crew'), 'seed ' + (800 + i));
    if (pref === 'tracker') assert(G.player().sub === 'tracker', 'tercih');
    else if (pref !== 'random') assert(G.player().sub !== 'tracker', 'istenmeden iz sürücü');
  }
});
test('iz cihazı: menzil, görüş hattı, bekleme; konum gecikmeli güncellenir; süre dolunca biter', () => {
  G.newMatch({ seed: 830, rolePref: 'tracker' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const t = m.chars.find(c => !c.isPlayer && c.role === 'crew');
  t.x = p.x + 50; t.y = p.y;
  assert(!G.startTrack(p, t) && /Bekleme/.test(G.canTrack(p, t).reason), 'başlangıç beklemesi yok');
  p.trackCd = 0;
  t.x = p.x + 200;
  assert(!G.startTrack(p, t), 'menzil dışı');
  const rr = M.roomById.reaktor; p.x = rr.px + 30; p.y = rr.py + 20; t.x = rr.px + 30; t.y = rr.py - 45;
  assert(!G.startTrack(p, t), 'duvar arkası');
  p.x = M.roomById.merkez.cx - 100; p.y = M.roomById.merkez.cy + 100; t.x = p.x + 50; t.y = p.y;
  assert(G.startTrack(p, t) && p.track.id === t.id, 'takılamadı');
  const x0 = p.track.x;
  t.x += 120; G.update(DT);
  assert(p.track.x === x0 || p.track.x === t.x, 'örnek');
  const firstSample = p.track.x;
  t.x += 100; step(0.4);
  assert(p.track.x === firstSample, 'gecikme olmadan güncellendi');
  step(SS.C.TRACK_DELAY);
  assert(p.track.x === t.x, 'gecikmeyle güncellenmedi');
  step(SS.C.TRACK_DURATION);
  assert(!p.track && Math.abs(p.trackCd - SS.C.TRACK_COOLDOWN) < 2, 'süre dolunca bitmedi: ' + p.trackCd);
});
test('elle bırakma beklemeyi başlatır; toplantı izi bitirir; ölen hedefte sinyal kesilir', () => {
  const m = G.match, p = G.player();
  const t = m.chars.find(c => !c.isPlayer && c.role === 'crew' && c.alive);
  p.trackCd = 0; t.x = p.x + 40; t.y = p.y;
  assert(G.startTrack(p, t));
  assert(G.playerTrack() === true && !p.track && p.trackCd === SS.C.TRACK_COOLDOWN, 'elle bırakma');
  p.trackCd = 0; assert(G.startTrack(p, t));
  const imp = m.chars.find(c => c.role === 'impostor'); imp.killCd = 0; imp.x = t.x + 30; imp.y = t.y;
  assert(G.kill(imp, t));
  step(SS.C.TRACK_DELAY + 0.1);
  assert(p.track && p.track.lost, 'sinyal kesilmedi');
  const caller = m.chars.find(c => c.alive && !c.isPlayer && c.role === 'crew'); caller.x = t.x + 40; caller.y = t.y;
  assert(G.report(caller, m.bodies[0]) && !p.track, 'toplantı izi bitirmedi');
});
test('iz sürücü bot havalandırma sıçramasını yakalar ve toplantıda söyler', () => {
  G.newMatch({ seed: 840, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, tr = m.chars.find(c => c.sub === 'tracker');
  m.chars.forEach(c => { if (c !== tr && c.brain) c.brain = null; });
  const imp = m.chars.find(c => c.role === 'impostor');
  tr.brain.susp[imp.id] = 50;
  imp.x = tr.x + 40; imp.y = tr.y; tr.trackCd = 0;
  step(0.6);
  assert(tr.track && tr.track.id === imp.id, 'bot iz takmadı: ' + JSON.stringify(tr.track));
  const v0 = M.vents[0], v1 = M.vents[v0.links[0]];
  imp.x = v0.x + 10; imp.y = v0.y; step(SS.C.TRACK_DELAY + 0.1);
  imp.ventCd = 0; assert(G.enterVent(imp, v0)); imp.ventCd = 0; assert(G.moveVent(imp, v1.id));
  step(SS.C.TRACK_DELAY + 0.1);
  assert(tr.brain.events.some(e => e.type === 'vent' && e.kind === 'tracked' && e.who === imp.id), 'sıçrama yakalanmadı');
  G.exitVent(imp, true);
  tr.emergencyUsed = false; m.emergencyCooldown = 0; tr.x = M.button.x; tr.y = M.button.y + 110;
  tr.track = null;
  assert(G.callEmergency(tr));
  const st = m.meeting.schedule.find(s => s.speakerId === tr.id && /iz cihazıyla izliyordum/.test(s.text));
  assert(st, 'söylenmedi: ' + m.meeting.schedule.filter(s => s.speakerId === tr.id).map(s => s.text).join(' | '));
});

// ------------------------------------------------------------------ fantom
console.log('\nFantom rolü (hain)');
test('her maçta hainlerden tam biri fantom; tercihle oyuncuya verilir', () => {
  for (let i = 0; i < 24; i++) {
    const pref = ['random', 'impostor', 'phantom', 'crew'][i % 4];
    G.newMatch({ seed: 900 + i, rolePref: pref });
    const ph = G.match.chars.filter(c => c.sub === 'phantom');
    assert(ph.length === 1 && ph[0].role === 'impostor', 'seed ' + (900 + i));
    if (pref === 'phantom') assert(G.player().sub === 'phantom', 'tercih');
    if (pref === 'impostor') assert(G.player().role === 'impostor' && G.player().sub !== 'phantom', 'hain tercihinde fantom verildi');
  }
});
function phantomSetup(seed, pref) {
  G.newMatch({ seed, rolePref: pref || 'phantom' }); G.setState('PLAYING');
  const m = G.match, ph = m.chars.find(c => c.sub === 'phantom');
  m.chars.forEach(c => { if (!c.isPlayer && c !== ph) c.brain = null; });
  if (ph.brain) ph.brain = null;
  return { m, ph };
}
test('kaybolma: animasyon, 10 sn görünmezlik, otomatik belirme, bekleme', () => {
  const { ph } = phantomSetup(930);
  assert(!G.vanish(ph) && /Bekleme/.test(G.canVanish(ph).reason), 'başlangıç beklemesi');
  ph.vanishCd = 0;
  assert(G.vanish(ph) && ph.fading === 'out' && !G.isHidden(ph), 'animasyon başlamadı');
  step(SS.C.VANISH_FADE + 0.05);
  assert(ph.invis && !ph.fading && G.isHidden(ph), 'görünmez olmadı');
  step(SS.C.VANISH_DURATION);
  assert(ph.fading === 'in' && !G.isHidden(ph), 'süre dolunca belirmedi');
  step(SS.C.VANISH_FADE + 0.05);
  assert(!ph.invis && !ph.fading && Math.abs(ph.vanishCd - SS.C.VANISH_COOLDOWN) < 0.2, 'bekleme ' + ph.vanishCd);
  ph.vanishCd = 0; G.vanish(ph); step(SS.C.VANISH_FADE + 0.05);
  assert(G.playerVanish() && ph.fading === 'in', 'elle belirme');
});
test('görünmezken saldıramaz, havalandırma/rapor/buton kullanamaz; saldırı beklemesi işler', () => {
  const { m, ph } = phantomSetup(931);
  ph.vanishCd = 0; ph.killCd = 3; G.vanish(ph); step(SS.C.VANISH_FADE + 0.05);
  const v = m.chars.find(c => c.role === 'crew');
  v.x = ph.x + 30; v.y = ph.y;
  step(3.1);
  assert(ph.killCd === 0, 'saldırı beklemesi işlemedi');
  assert(!G.kill(ph, v) && v.alive, 'görünmezken saldırdı');
  assert(/Görünmezken saldıramazsın/.test(G.context().killReason), G.context().killReason);
  const v0 = M.vents[0]; ph.x = v0.x + 10; ph.y = v0.y; ph.ventCd = 0;
  assert(!G.enterVent(ph, v0), 'görünmezken havalandırma');
  m.emergencyCooldown = 0; ph.x = M.button.x; ph.y = M.button.y + 110;
  assert(!G.canEmergency(ph).ok, 'görünmezken buton');
});
test('görünmez fantomu mürettebat göremez; hain takım arkadaşı ve hayaletler görür', () => {
  const crewView = phantomSetup(932, 'crew');
  crewView.ph.vanishCd = 0; crewView.ph.x = G.player().x + 60; crewView.ph.y = G.player().y;
  assert(G.playerSeesChar(crewView.ph), 'görünürken görünmedi');
  G.vanish(crewView.ph); step(SS.C.VANISH_FADE + 0.05);
  assert(!G.playerSeesChar(crewView.ph), 'mürettebat görünmezi gördü');
  G.player().alive = false;
  assert(G.playerSeesChar(crewView.ph), 'hayalet görmedi');
  const impView = phantomSetup(933, 'impostor');
  const p = G.player(); impView.ph.vanishCd = 0; impView.ph.x = p.x + 60; impView.ph.y = p.y;
  G.vanish(impView.ph); step(SS.C.VANISH_FADE + 0.05);
  assert(impView.ph !== p && G.playerSeesChar(impView.ph), 'hain takım arkadaşını görmedi');
});
test('bot algısı ve tanıklık görünmez fantomu hesaba katmaz; kaybolmayı gören kanıt kaydeder ve söyler', () => {
  G.newMatch({ seed: 934, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, ph = m.chars.find(c => c.sub === 'phantom');
  const w = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c.brain);
  m.chars.forEach(c => { if (c !== w && c.brain) c.brain = null; });
  const r = M.roomById.merkez; w.x = r.cx - 200; w.y = r.py + 60; ph.x = r.cx; ph.y = r.py + 60;
  m.chars.forEach(c => { if (c !== w && c !== ph && c.alive) { c.x = M.roomById.depo.cx; c.y = M.roomById.depo.cy; } });
  assert(SS.Vision.sees(w, ph.x, ph.y, G.visionRadius(w)), 'kurulum');
  ph.vanishCd = 0; assert(G.vanish(ph));
  assert(w.brain.events.some(e => e.type === 'vanish' && e.who === ph.id) && w.brain.susp[ph.id] >= 95, 'kaybolma kanıtı yok');
  step(SS.C.VANISH_FADE + 0.05);
  const before = w.brain.seen.filter(s => s.id === ph.id).length;
  w.brain.lastSeen[ph.id] = null; ph.x += 100; step(1);
  assert(w.brain.seen.filter(s => s.id === ph.id).length === before, 'görünmez fantom algılandı');
  assert(SS.Bots.witnesses(m, ph, null) === 0, 'görünmez fantoma tanık sayıldı');
  w.emergencyUsed = false; m.emergencyCooldown = 0; w.x = M.button.x; w.y = M.button.y + 110;
  assert(G.callEmergency(w) && !ph.invis && !ph.fading, 'toplantı görünür yapmadı');
  const st = m.meeting.schedule.find(s => s.speakerId === w.id && /görünmez olurken gördüm/.test(s.text));
  assert(st, 'söylenmedi: ' + m.meeting.schedule.filter(s => s.speakerId === w.id).map(s => s.text).join(' | '));
});

// ------------------------------------------------------------------ şekil değiştirici
console.log('\nŞekil değiştirici rolü (hain)');
test('hainlerden biri şekil değiştirici, fantomdan ayrı; tercihle oyuncuya verilir', () => {
  for (let i = 0; i < 25; i++) {
    const pref = ['random', 'impostor', 'phantom', 'shapeshifter', 'crew'][i % 5];
    G.newMatch({ seed: 1000 + i, rolePref: pref });
    const ss = G.match.chars.filter(c => c.sub === 'shapeshifter'), ph = G.match.chars.filter(c => c.sub === 'phantom');
    assert(ss.length === 1 && ph.length === 1 && ss[0] !== ph[0] && ss[0].role === 'impostor', 'seed ' + (1000 + i));
    if (pref === 'shapeshifter') assert(G.player().sub === 'shapeshifter', 'tercih');
    if (pref === 'impostor') assert(!G.player().sub, 'hain tercihinde özel rol verildi');
  }
});
function ssSetup(seed, pref) {
  G.newMatch({ seed, rolePref: pref || 'shapeshifter' }); G.setState('PLAYING');
  const m = G.match, sh = m.chars.find(c => c.sub === 'shapeshifter');
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  return { m, sh };
}
test('dönüşüm: animasyon, 30 sn kılık, geri dönüş, bekleme; yalnız yaşayan birinin kılığı', () => {
  const { m, sh } = ssSetup(1030);
  const t = m.chars.find(c => c.role === 'crew');
  assert(!G.shift(sh, t) && /Bekleme/.test(G.canShift(sh, t).reason), 'başlangıç beklemesi');
  sh.shiftCd = 0;
  assert(!G.shift(sh, sh), 'kendi kılığı');
  const dead = m.chars.find(c => c.role === 'crew' && c !== t); dead.alive = false;
  assert(!G.shift(sh, dead), 'ölünün kılığı'); dead.alive = true;
  assert(G.shift(sh, t) && sh.shiftAnim > 0 && G.lookOf(sh) === sh, 'animasyon başı');
  step(SS.C.SHIFT_ANIM + 0.05);
  assert(sh.disguise === t.id && G.displayOf(sh) === t, 'kılığa girmedi');
  step(SS.C.SHIFT_DURATION);
  assert(sh.shiftAnim > 0, 'süre dolunca geri dönmedi');
  step(SS.C.SHIFT_ANIM + 0.05);
  assert(sh.disguise === null && Math.abs(sh.shiftCd - SS.C.SHIFT_COOLDOWN) < 0.2, 'bekleme ' + sh.shiftCd);
});
test('kılıktayken saldırabilir ve havalandırma kullanabilir; animasyonda saldıramaz; toplantı kılığı bozar', () => {
  const { m, sh } = ssSetup(1031);
  const t = m.chars.find(c => c.role === 'crew'), v = m.chars.find(c => c.role === 'crew' && c !== t);
  sh.shiftCd = 0; sh.killCd = 0; G.shift(sh, t);
  v.x = sh.x + 30; v.y = sh.y;
  assert(!G.kill(sh, v), 'animasyonda saldırdı');
  step(SS.C.SHIFT_ANIM + 0.05);
  sh.killCd = 0; v.x = sh.x + 30; v.y = sh.y;
  assert(G.kill(sh, v), 'kılıktayken saldıramadı');
  const v0 = M.vents[0]; sh.x = v0.x + 10; sh.y = v0.y; sh.ventCd = 0;
  assert(G.enterVent(sh, v0), 'kılıktayken havalandırma'); G.exitVent(sh, true);
  const rep = m.chars.find(c => c.alive && c.role === 'crew' && c !== t); rep.x = m.bodies[0].x + 40; rep.y = m.bodies[0].y;
  assert(G.report(rep, m.bodies[0]) && sh.disguise === null, 'toplantı kılığı bozmadı');
});
test('çerçeveleme: kılıktaki hainin cinayetini gören bot masumu suçlar; dönüşümü gören gerçeği bilir', () => {
  G.newMatch({ seed: 1032, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, sh = m.chars.find(c => c.sub === 'shapeshifter');
  const w = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c.brain);
  const t = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c !== w);
  const v = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c !== w && c !== t);
  m.chars.forEach(c => { if (c !== w && c.brain) c.brain = null; });
  const dep = M.roomById.depo;
  m.chars.forEach(c => { if (c !== w && c !== sh && c !== v) { c.x = M.roomById.oksijen.cx; c.y = M.roomById.oksijen.cy; } });
  // önce kimse görmeden kılık değiştirir
  sh.x = M.roomById.reaktor.cx; sh.y = M.roomById.reaktor.cy; sh.shiftCd = 0;
  assert(G.shift(sh, t)); step(SS.C.SHIFT_ANIM + 0.05);
  // tanığın gözü önünde öldürür
  w.x = dep.cx - 120; w.y = dep.cy; v.x = dep.cx; v.y = dep.cy; sh.x = dep.cx + 30; sh.y = dep.cy; sh.killCd = 0;
  assert(G.kill(sh, v));
  const ev = w.brain.events.find(e => e.type === 'kill');
  assert(ev && ev.who === t.id && w.brain.susp[t.id] >= 100 && !(w.brain.susp[sh.id] > 0), 'çerçeveleme olmadı: ' + JSON.stringify(ev));
  // geri dönüşünü görür: gerçek kimliği öğrenir, masum aklanır
  sh.x = w.x + 80; sh.y = w.y;
  assert(G.unshift(sh));
  assert(w.brain.events.some(e => e.type === 'shift' && e.who === sh.id && e.kind === 'out') && w.brain.susp[sh.id] >= 95 && w.brain.susp[t.id] < 100, 'dönüşüm kanıtı yok');
  step(SS.C.SHIFT_ANIM + 0.05);
  assert(ev.who === sh.id, 'tanıklık gerçek kişiye aktarılmadı');
  if (!m.meeting) { w.emergencyUsed = false; m.emergencyCooldown = 0; w.x = M.button.x; w.y = M.button.y + 110; assert(G.callEmergency(w)); }
  const mine = m.meeting.schedule.filter(s => s.speakerId === w.id);
  const acc = mine.find(s => s.kind === 'accuse');
  assert(acc && acc.targetId === sh.id && /devre dışı bırakırken gördüm/.test(acc.text), 'gerçek hain suçlanmadı: ' + mine.map(s => s.text).join(' | '));
});

// ------------------------------------------------------------------ yargıç
console.log('\nYargıç rolü');
function judgeMeeting(seed, pref) {
  G.newMatch({ seed, rolePref: pref || 'judge' }); G.setState('PLAYING');
  const m = G.match;
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  const caller = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c.sub !== 'judge');
  m.emergencyCooldown = 0; caller.x = M.button.x; caller.y = M.button.y + 110;
  return { m, caller };
}
test('her maçta ayarlanan sayıda yargıç, mürettebattan; tercihle oyuncuya verilir', () => {
  for (let i = 0; i < 12; i++) {
    const pref = ['random', 'crew', 'judge'][i % 3];
    G.newMatch({ seed: 1100 + i, rolePref: pref });
    const j = G.match.chars.filter(c => c.sub === 'judge');
    assert(j.length === SS.C.JUDGES && j.every(c => c.role === 'crew'), 'seed ' + (1100 + i));
    if (pref === 'judge') assert(G.player().sub === 'judge', 'tercih');
    if (pref === 'crew') assert(G.player().sub !== 'judge', 'istenmeden yargıç');
  }
});
test('yargı: yalnızca toplantıda; hain hedef tek başına atılır, oylama anında biter, yargıç kalır', () => {
  const { m, caller } = judgeMeeting(1130);
  const p = G.player(), imp = m.chars.find(c => c.role === 'impostor');
  assert(!SS.Meeting.playerJudge(imp.id) && imp.alive, 'toplantı dışında yargıladı');
  assert(G.callEmergency(caller));
  SS.Meeting.skipDiscussion(); // oylama sırasında da yargılanabilir
  const r = SS.Meeting.playerJudge(imp.id);
  assert(r && r.guilty && !imp.alive && imp.judged && p.alive && p.judgeLeft === 0, 'hain atılmadı / yargıç gitti');
  assert(G.state === 'MEETING_RESULT' && m.meeting.judged && m.meeting.resultDur < 2 * SS.C.JUDGE_EJECT_SEG, 'oylama bitmedi: ' + G.state);
  const other = m.chars.find(c => c.alive && c.role === 'impostor');
  assert(!SS.Meeting.playerJudge(other.id) && other.alive, 'sonuç ekranında ikinci yargılama');
  step(SS.C.JUDGE_EJECT_SEG + 0.5);
  assert(G.state === 'PLAYING' && p.alive, 'atılma sonrası oyun devam etmedi: ' + G.state);
});
test('oylamada elenmiş birine verilmiş oy pas sayılır', () => {
  const { m, caller } = judgeMeeting(1135, 'crew');
  assert(G.callEmergency(caller));
  SS.Meeting.skipDiscussion();
  const dead = m.chars.find(c => c.alive && !c.isPlayer && c !== caller);
  const voter = m.chars.find(c => c.alive && !c.isPlayer && c !== dead);
  SS.Meeting.castVote(voter.id, dead.id);
  dead.alive = false; // oylama sırasında elendi
  m.chars.forEach(c => { if (c.alive && !m.meeting.votes.hasOwnProperty(c.id)) SS.Meeting.castVote(c.id, 'skip'); });
  for (let i = 0; i < 30 * 40 && G.state === 'MEETING_VOTE'; i++) G.update(DT);
  assert(m.meeting.votes[voter.id] === 'skip' && m.meeting.tally.ejected === null, 'elenmişe oy sayıldı');
});
test('yanlış yargı: masum hedef de yargıç da elenir; masumu suçlayanlara güven azalır', () => {
  G.newMatch({ seed: 1131, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, j = m.chars.find(c => c.sub === 'judge');
  const t = m.chars.find(c => c.role === 'crew' && c !== j && !c.isPlayer);
  const w = m.chars.find(c => c.role === 'crew' && c !== j && c !== t && !c.isPlayer && c.brain);
  const accuser = m.chars.find(c => c.alive && c !== j && c !== t && c !== w);
  m.chars.forEach(c => { if (c !== w && c.brain) c.brain = null; });
  m.emergencyCooldown = 0; w.x = M.button.x; w.y = M.button.y + 110; w.emergencyUsed = false;
  assert(G.callEmergency(w));
  m.meeting.accusers[t.id] = [{ id: accuser.id, w: 25 }];
  const before = w.brain.susp[accuser.id] || 0;
  const r = SS.Meeting.judge(j, t);
  assert(r && !r.guilty && !j.alive && j.judged && !t.alive && t.judged, 'ikisi birden elenmedi');
  assert(G.state === 'MEETING_RESULT' && Math.abs(m.meeting.resultDur - (2 * SS.C.JUDGE_EJECT_SEG + 0.3)) < 1e-6, 'iki atılma sırası kurulmadı');
  assert((w.brain.susp[accuser.id] || 0) > before, 'masumu suçlayana güven azalmadı');
});
test('son haini yargılamak: önce atılma gösterilir, sonra maç biter (tek sonuç)', () => {
  const { m, caller } = judgeMeeting(1132);
  const imps = m.chars.filter(c => c.role === 'impostor');
  imps.slice(1).forEach(c => { c.alive = false; });
  assert(G.callEmergency(caller));
  SS.Meeting.playerJudge(imps[0].id);
  assert(G.state === 'MEETING_RESULT' && !m.over, 'atılma gösterilmeden bitti: ' + G.state);
  step(SS.C.JUDGE_EJECT_SEG + 0.5);
  assert(G.state === 'GAME_OVER' && m.winner === 'crew', 'maç bitmedi: ' + G.state);
});
test('yargıç bot neredeyse kesin kanıtla toplantıda yargılar, kanıtsız yargılamaz', () => {
  G.newMatch({ seed: 1133, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, j = m.chars.find(c => c.sub === 'judge');
  const imp = m.chars.find(c => c.role === 'impostor');
  m.chars.forEach(c => { if (c !== j && c.brain) c.brain = null; });
  j.brain.susp[imp.id] = 100;
  j.brain.events.push({ type: 'kill', t: m.time, room: 0, who: imp.id, victim: m.chars.find(c => c.role === 'crew' && c !== j).id });
  const caller = m.chars.find(c => c.role === 'crew' && c !== j && !c.isPlayer);
  m.emergencyCooldown = 0; caller.x = M.button.x; caller.y = M.button.y + 110;
  assert(G.callEmergency(caller));
  step(13);
  assert(!imp.alive && imp.judged && j.judgeLeft === 0, 'bot yargılamadı');
  G.newMatch({ seed: 1134, rolePref: 'crew' }); G.setState('PLAYING');
  const m2 = G.match, j2 = m2.chars.find(c => c.sub === 'judge');
  m2.chars.forEach(c => { if (c !== j2 && c.brain) c.brain = null; });
  m2.chars.forEach(c => { if (c !== j2) j2.brain.susp[c.id] = 110; }); // yüksek şüphe ama kendi gördüğü olay yok
  const c2 = m2.chars.find(c => c.role === 'crew' && c !== j2 && !c.isPlayer);
  m2.emergencyCooldown = 0; c2.x = M.button.x; c2.y = M.button.y + 110;
  assert(G.callEmergency(c2));
  step(13);
  assert(j2.judgeLeft === SS.C.JUDGE_USES, 'kanıtsız yargıladı');
});

// ------------------------------------------------------------------ koruyucu melek
console.log('\nKoruyucu melek (hayalet rolü)');
test('ayarlanan sayıda melek, mürettebattan; tercihle oyuncuya verilir', () => {
  for (let i = 0; i < 12; i++) {
    const pref = ['random', 'crew', 'angel'][i % 3];
    G.newMatch({ seed: 1200 + i, rolePref: pref });
    const a = G.match.chars.filter(c => c.angel);
    assert(a.length === SS.C.GUARDIAN_ANGELS && a.every(c => c.role === 'crew'), 'seed ' + (1200 + i));
    // Önce özel rolsüzler seçilir; onlar yetmeyince bazı özel rollüler de melek olur.
    const plain = G.match.chars.filter(c => c.role === 'crew' && !c.sub && (pref !== 'crew' || !c.isPlayer)).length;
    assert(a.filter(c => c.sub).length === Math.max(0, SS.C.GUARDIAN_ANGELS - plain), 'özel rollü melek sayısı ' + (1200 + i));
    if (pref === 'angel') assert(G.player().angel && !G.player().sub, 'tercih');
    if (pref === 'crew') assert(!G.player().angel, 'crew tercihi melek değil');
  }
});
function angelSetup(seed) {
  G.newMatch({ seed, rolePref: 'angel' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  return { m, p, imp: m.chars.find(c => c.role === 'impostor'), t: m.chars.find(c => c.role === 'crew' && !c.isPlayer) };
}
test('melek yalnızca ölünce koruyabilir; menzil ve başlangıç beklemesi', () => {
  const { m, p, imp, t } = angelSetup(1230);
  t.x = p.x + 30; t.y = p.y;
  assert(!G.protect(p, t) && /Öldüğünde/.test(G.canProtect(p, t).reason), 'canlıyken korudu');
  imp.killCd = 0; imp.x = p.x - 30; imp.y = p.y; assert(G.kill(imp, p));
  t.x = p.x + 30; t.y = p.y;
  assert(!G.protect(p, t) && /Bekleme/.test(G.canProtect(p, t).reason), 'ilk bekleme yok');
  step(SS.C.PROTECT_COOLDOWN_START + 0.1);
  t.x = p.x + 300; assert(!G.protect(p, t), 'menzil dışı');
  t.x = p.x + 60; t.y = p.y;
  assert(G.protect(p, t) && t.shieldT === SS.C.PROTECT_DURATION && p.protectCd === SS.C.PROTECT_COOLDOWN, 'koruyamadı');
});
test('kalkan saldırıyı engeller; hainin beklemesi 10 sn olur; tanık ve kurban kanıt kaydeder; süre dolunca biter', () => {
  G.newMatch({ seed: 1231, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, imp = m.chars.find(c => c.role === 'impostor');
  const v = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c.brain);
  const w = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c !== v && c.brain);
  m.chars.forEach(c => { if (c !== v && c !== w && c.brain) c.brain = null; });
  const r = M.roomById.merkez; v.x = r.cx - 150; v.y = r.py + 60; imp.x = v.x + 40; imp.y = v.y; w.x = r.cx + 100; w.y = r.py + 60;
  v.shieldT = SS.C.PROTECT_DURATION; imp.killCd = 0;
  assert(!G.kill(imp, v) && v.alive, 'kalkan engellemedi');
  assert(imp.killCd === SS.C.PROTECT_KILL_RESET, 'bekleme ' + imp.killCd);
  assert(w.brain.events.some(e => e.type === 'attack' && e.who === imp.id) && v.brain.events.some(e => e.type === 'attack' && e.who === imp.id), 'kanıt yok');
  step(SS.C.PROTECT_DURATION + 0.1);
  assert(v.shieldT === 0, 'kalkan bitmedi');
  imp.killCd = 0; imp.x = v.x + 40; imp.y = v.y;
  if (G.state === 'PLAYING') assert(G.kill(imp, v), 'kalkan bitince saldırı yine engellendi');
});
test('toplantı kalkanı kaldırır; saldırı tanığı toplantıda söyler', () => {
  G.newMatch({ seed: 1232, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, imp = m.chars.find(c => c.role === 'impostor');
  const v = m.chars.find(c => c.role === 'crew' && !c.isPlayer && c.brain);
  m.chars.forEach(c => { if (c !== v && c.brain) c.brain = null; });
  v.shieldT = 5; imp.killCd = 0; imp.x = v.x + 40; imp.y = v.y;
  G.kill(imp, v);
  v.emergencyUsed = false; m.emergencyCooldown = 0; v.x = M.button.x; v.y = M.button.y + 110;
  assert(G.callEmergency(v) && v.shieldT === 0, 'kalkan kalktı mı');
  const st = m.meeting.schedule.find(s => s.speakerId === v.id && /bana saldırdı ama bir kalkan beni korudu/.test(s.text));
  assert(st && st.targetId === imp.id, 'söylenmedi: ' + m.meeting.schedule.filter(s => s.speakerId === v.id).map(s => s.text).join(' | '));
});
test('melek bot ölünce yaşayanları korur', () => {
  G.newMatch({ seed: 1233, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, a = m.chars.find(c => c.angel), imp = m.chars.find(c => c.role === 'impostor');
  m.chars.forEach(c => { if (c !== a && c.brain) c.brain = null; });
  let protects = 0; SS.events.on('protect', e => { if (e.angel === a) protects++; });
  imp.killCd = 0; imp.x = a.x + 30; imp.y = a.y; assert(G.kill(imp, a));
  step(SS.C.PROTECT_COOLDOWN_START + 8);
  assert(protects >= 1 && m.chars.some(c => c.alive && c.shieldT > 0), 'melek bot korumadı');
});

// ------------------------------------------------------------------ influencer
console.log('\nInfluencer (hayalet rolü)');
test('5 influencer, mürettebattan, meleklerle çakışmaz; özel rollüler de olabilir; tercih çalışır', () => {
  let specials = 0;
  for (let i = 0; i < 12; i++) {
    const pref = ['random', 'crew', 'influencer', 'angel'][i % 4];
    G.newMatch({ seed: 1300 + i, rolePref: pref });
    const inf = G.match.chars.filter(c => c.influencer);
    assert(inf.length === SS.C.INFLUENCERS && inf.every(c => c.role === 'crew' && !c.angel), 'seed ' + (1300 + i));
    assert(G.match.chars.filter(c => c.angel).length === SS.C.GUARDIAN_ANGELS, 'melek sayısı bozuldu');
    specials += inf.filter(c => c.sub).length;
    if (pref === 'influencer') assert(G.player().influencer && !G.player().sub && !G.player().angel, 'tercih');
    if (pref === 'crew' || pref === 'angel') assert(!G.player().influencer, pref + ' tercihi influencer olmamalı');
  }
  assert(specials > 0, 'hiç özel rollü influencer yok');
  assert(SS.INFLUENCE_ICONS.length === 56, 'resim sayısı ' + SS.INFLUENCE_ICONS.length);
});
function inflSetup(seed) {
  G.newMatch({ seed, rolePref: 'influencer' }); G.setState('PLAYING');
  const m = G.match, p = G.player();
  m.chars.forEach(c => { if (!c.isPlayer) c.brain = null; });
  return { m, p, imp: m.chars.find(c => c.role === 'impostor'), t: m.chars.find(c => c.role === 'crew' && !c.isPlayer) };
}
test('influencer yalnızca ölünce takip eder; menzil; en fazla 3 resim; yalnızca sunulan resimler; bekleme', () => {
  const { m, p, imp, t } = inflSetup(1320);
  m.chars.forEach(c => { if (c !== p && c !== t) { c.x = p.x + 2000; } });
  t.x = p.x + 40; t.y = p.y;
  assert(!G.follow(p, t) && /Öldüğünde/.test(G.canInfluence(p).reason), 'canlıyken takip etti');
  imp.killCd = 0; imp.x = p.x - 30; imp.y = p.y; assert(G.kill(imp, p)); imp.x = p.x + 2000;
  t.x = p.x + 400; t.y = p.y;
  assert(!G.inflTargetFor(p).target, 'menzil dışı hedef');
  t.x = p.x + 60;
  assert(G.inflTargetFor(p).target === t && G.follow(p, t) && p.inflFollow === t.id, 'takip etmedi');
  step(0.2);
  assert(U.dist(p.x, p.y, t.x, t.y) < 40, 'takip eden hayalet hedefin yanında değil');
  assert(p.inflChoices.length === SS.C.INFLUENCE_CHOICES, 'seçenek sayısı');
  assert(!G.inflSend(p, p.inflChoices.slice(0, 1)) && /Bekleme/.test(G.canInflSend(p).reason), 'ilk bekleme yok');
  step(SS.C.INFLUENCE_COOLDOWN_START + 0.1);
  assert(!G.inflSend(p, p.inflChoices.slice(0, 4)), '4 resim gönderildi');
  const notOffered = Array.from({ length: 56 }, (_, i) => i).find(i => p.inflChoices.indexOf(i) < 0);
  assert(!G.inflSend(p, [notOffered]), 'sunulmayan resim gönderildi');
  const pick = p.inflChoices.slice(0, 3);
  assert(G.inflSend(p, pick) && t.inbox && t.inbox.icons.join() === pick.join() && p.inflCd === SS.C.INFLUENCE_COOLDOWN, 'gönderilemedi');
  step(SS.C.INFLUENCE_SHOW - 0.3); assert(t.inbox, 'mesaj erken kayboldu');
  step(0.5); assert(!t.inbox, 'mesaj 5 sn sonra kaybolmadı');
});
test('yenileme yeni 6 resim verir ve yarım bekleme cezası verir; hedef ölünce takip biter; toplantı takibi bitirir', () => {
  const { m, p, imp, t } = inflSetup(1321);
  p.alive = false; p.inflCd = 0; G.tickInfluence(p, 0);
  const before = p.inflChoices.join();
  assert(G.inflRefresh(p) && p.inflCd === SS.C.INFLUENCE_COOLDOWN / 2 && p.inflChoices.length === 6, 'yenileme');
    assert(!G.inflRefresh(p), 'beklemedeyken yenilendi');
  t.x = p.x + 30; t.y = p.y; assert(G.follow(p, t));
  imp.killCd = 0; imp.x = t.x + 30; imp.y = t.y; assert(G.kill(imp, t));
  step(0.1);
  assert(p.inflFollow === null, 'ölen hedef takip ediliyor');
  const t2 = m.chars.find(c => c.alive && c.role === 'crew' && !c.isPlayer);
  assert(G.follow(p, t2));
  t2.emergencyUsed = false; m.emergencyCooldown = 0; t2.x = M.button.x; t2.y = M.button.y + 110;
  assert(G.callEmergency(t2) && p.inflFollow === null, 'toplantı takibi bitirmedi');
});
test('bot alıcı "renk + kötü işaret" mesajında o kişiden şüphelenir, toplantıda söyler; "iyi işaret" güven verir', () => {
  G.newMatch({ seed: 1322, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, I = SS.INFLUENCE_ICONS;
  const inf = m.chars.find(c => c.influencer && !c.isPlayer), imp = m.chars.find(c => c.role === 'impostor');
  const v = m.chars.find(c => c.role === 'crew' && c.brain && c !== inf && !c.isPlayer);
  const good = m.chars.find(c => c.role === 'crew' && c !== v && c !== inf);
  m.chars.forEach(c => { if (c !== v && c.brain) c.brain = null; });
  inf.alive = false; inf.inflCd = 0; assert(G.follow(inf, v));
  const knife = I.findIndex(x => x.key === 'knife'), ok = I.findIndex(x => x.key === 'ok');
  inf.inflChoices = [G.inflIconOf(imp), knife, 0, 1, 2, 3];
  assert(G.inflSend(inf, [G.inflIconOf(imp), knife]), 'gönderilemedi');
  assert((v.brain.susp[imp.id] || 0) >= SS.C.INFLUENCE_TRUST, 'şüphe artmadı: ' + v.brain.susp[imp.id]);
  inf.inflCd = 0; inf.inflChoices = [G.inflIconOf(good), ok, 0, 1, 2, 3];
  assert(G.inflSend(inf, [G.inflIconOf(good), ok]));
  assert((v.brain.susp[good.id] || 0) < 0, 'güven vermedi');
  v.brain.susp[imp.id] = 60;
  v.emergencyUsed = false; m.emergencyCooldown = 0; v.x = M.button.x; v.y = M.button.y + 110;
  assert(G.callEmergency(v));
  const st = m.meeting.schedule.find(s => s.speakerId === v.id && /Bir hayalet bana/.test(s.text));
  assert(st, 'toplantıda söylemedi: ' + m.meeting.schedule.filter(s => s.speakerId === v.id).map(s => s.text).join(' | '));
});
test('influencer bot ölünce takip eder ve yalnızca sunulan resimlerle doğru haini işaret eder', () => {
  G.newMatch({ seed: 1323, rolePref: 'crew' }); G.setState('PLAYING');
  const m = G.match, inf = m.chars.find(c => c.influencer && !c.isPlayer);
  m.chars.forEach(c => { if (c !== inf && c.brain) c.brain = null; });
  const sent = [];
  SS.events.on('influence', e => { if (e.from === inf) sent.push(e); });
  inf.alive = false;
  for (let i = 0; i < 30 * 90 && G.state === 'PLAYING'; i++) G.update(DT);
  assert(sent.length >= 1, 'bot hiç mesaj göndermedi');
  sent.forEach(e => {
    assert(e.icons.length >= 1 && e.icons.length <= 3, 'resim sayısı');
    const cols = e.icons.map(i => G.inflCharOf(i)).filter(Boolean);
    assert(cols.every(c => c.role === 'impostor'), 'yanlış renk işaret edildi: ' + cols.map(c => c.name + '/' + c.role));
  });
});

// ------------------------------------------------------------------ simülasyon
console.log('\nHızlandırılmış maç simülasyonu (oyuncu da bot)');
test('40 tam maç: hatasız biter, botlar görev yapar, saldırır, toplantı yapar', () => {
  const stats = { crew: 0, impostor: 0, reasons: {}, meetings: 0, kills: 0, tasks: 0, maxTime: 0, ejections: 0, ejectedImp: 0, sabotages: 0, vents: 0, engVents: 0, vitals: 0, interro: 0, tracks: 0, vanishes: 0, shifts: 0, judged: 0, judgedImp: 0, protects: 0, blocked: 0, msgs: 0 };
  SS.events.on('sabotage', () => stats.sabotages++);
  SS.events.on('vent', e => { if (e.kind === 'enter') { if (e.c.role === 'impostor') stats.vents++; else stats.engVents++; } });
  SS.events.on('meetingResult', mt => { if (mt.ejectedId !== null) { stats.ejections++; if (G.match.chars[mt.ejectedId].role === 'impostor') stats.ejectedImp++; } });
  SS.events.on('meetingMessage', () => stats.msgs++);
  SS.events.on('vitalsOpen', () => stats.vitals++);
  SS.events.on('interrogate', () => stats.interro++);
  SS.events.on('track', () => stats.tracks++);
  SS.events.on('vanish', e => { if (e.kind === 'vanish') stats.vanishes++; });
  SS.events.on('shift', e => { if (e.kind === 'in') stats.shifts++; });
  SS.events.on('judge', e => { stats.judged++; if (e.guilty) stats.judgedImp++; });
  SS.events.on('protect', () => stats.protects++);
  SS.events.on('killBlocked', () => stats.blocked++);
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
  assert(stats.engVents > 0, 'mühendis botlar havalandırma kullanmadı');
  assert(stats.vitals > 0, 'doktor botlar yaşam belirtilerine bakmadı');
  assert(stats.interro > 0, 'dedektif botlar sorgulamadı');
  assert(stats.tracks > 0, 'iz sürücü botlar iz takmadı');
  assert(stats.vanishes > 0, 'fantom botlar kaybolmadı');
  assert(stats.shifts > 0, 'şekil değiştirici botlar kılık değiştirmedi');
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
