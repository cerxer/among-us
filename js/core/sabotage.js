// Sabotajlar: elektrik (görüş azalır), oksijen (45 sn, iki panel), kapılar (oda kilitlenir).
(function () {
  'use strict';
  const SS = window.SS;

  const S = (SS.Sabotage = {
    create() {
      return {
        active: null,          // 'lights' | 'oxygen' | null  (aynı anda tek ana sabotaj)
        timer: 0,              // oksijen geri sayımı
        o2: { o2a: false, o2b: false },
        cooldown: SS.C.SAB_COOLDOWN_START,
        doors: null,           // { room, timer }
        doorCooldown: 12,
        lightLevel: 1,         // 1 = normal, 0 = karanlık (yumuşak geçiş)
        botTimer: 3,
        startedAt: 0,
      };
    },

    canStart(m, type, roomIndex) {
      const s = m.sab;
      if (type === 'doors') {
        if (s.doors) return { ok: false, reason: 'Kapılar zaten kilitli' };
        if (s.doorCooldown > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(s.doorCooldown) + ' sn' };
        if (roomIndex === undefined || roomIndex === null || !SS.Map.rooms[roomIndex]) return { ok: false, reason: 'Oda seç' };
        return { ok: true };
      }
      if (s.active) return { ok: false, reason: 'Başka sabotaj aktif' };
      if (s.cooldown > 0) return { ok: false, reason: 'Bekleme ' + Math.ceil(s.cooldown) + ' sn' };
      return { ok: true };
    },

    start(m, type, roomIndex, by) {
      const chk = S.canStart(m, type, roomIndex);
      if (!chk.ok) return false;
      const s = m.sab;
      if (type === 'doors') {
        S.closeDoors(m, roomIndex);
        s.doors = { room: roomIndex, timer: SS.C.DOOR_TIME };
        s.doorCooldown = SS.C.DOOR_COOLDOWN;
        SS.events.emit('sabotage', { type, room: roomIndex, by });
        return true;
      }
      s.active = type;
      s.startedAt = m.time;
      if (type === 'oxygen') { s.timer = SS.C.OXY_TIME; s.o2.o2a = false; s.o2.o2b = false; }
      SS.events.emit('sabotage', { type, by });
      if (SS.Bots) SS.Bots.onSabotageStart(m);
      return true;
    },

    // Kapı kapanırken kapı karolarındaki karakterleri güvenli yere taşı.
    closeDoors(m, roomIndex) {
      const M = SS.Map, r = SS.C.RADIUS;
      const tiles = new Set(M.doorTilesOfRoom(roomIndex));
      M.setRoomDoors(roomIndex, true);
      m.chars.forEach(c => {
        if (c.inVent !== null || !c.alive) return; // hayaletler zaten duvardan geçer
        if (!SS.Physics.circleFree(c.x, c.y, r)) {
          const p = SS.Physics.findFreeSpot(c.x, c.y, r, tiles);
          c.x = p.x; c.y = p.y;
        }
      });
      // Yolu kapıdan geçen botlar yeniden rota hesaplasın.
      m.chars.forEach(c => { if (c.brain && c.brain.goal && c.alive) c.brain.needRepath = true; });
    },

    needs(m, key) {
      const s = m.sab;
      if (key === 'lights') return s.active === 'lights';
      if (key === 'o2a' || key === 'o2b') return s.active === 'oxygen' && !s.o2[key];
      return false;
    },

    fix(m, key, by) {
      const s = m.sab;
      if (!S.needs(m, key)) return false;
      if (key === 'lights') {
        S._end(m, 'lights', by);
        return true;
      }
      s.o2[key] = true;
      SS.events.emit('sabotagePanel', { key, by });
      if (s.o2.o2a && s.o2.o2b) S._end(m, 'oxygen', by);
      return true;
    },

    _end(m, type, by) {
      const s = m.sab;
      s.active = null;
      s.timer = 0;
      s.cooldown = SS.C.SAB_COOLDOWN;
      SS.events.emit('sabotageEnd', { type, by });
    },

    // Toplantı başlarken bütün sabotajlar güvenli biçimde iptal edilir.
    cancelAll(m) {
      const s = m.sab;
      const had = s.active;
      s.active = null;
      s.timer = 0;
      s.o2.o2a = s.o2.o2b = false;
      if (s.doors) { SS.Map.setRoomDoors(s.doors.room, false); s.doors = null; }
      if (had) SS.events.emit('sabotageEnd', { type: had, by: null, cancelled: true });
    },

    update(m, dt) {
      const s = m.sab;
      if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
      if (s.doorCooldown > 0) s.doorCooldown = Math.max(0, s.doorCooldown - dt);
      const target = s.active === 'lights' ? 0 : 1;
      s.lightLevel += (target - s.lightLevel) * Math.min(1, dt * 2.5);
      if (s.doors) {
        s.doors.timer -= dt;
        if (s.doors.timer <= 0) {
          SS.Map.setRoomDoors(s.doors.room, false);
          s.doors = null;
          SS.events.emit('doorsOpen', {});
        }
      }
      if (s.active === 'oxygen') {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.timer = 0;
          SS.Game.endGame('impostor', 'Oksijen tükendi!');
        }
      }
    },
  });
})();
