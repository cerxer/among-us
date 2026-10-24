// Açılış: modülleri bir kez başlatır ve tek bir animasyon döngüsü kurar.
(function () {
  'use strict';
  const SS = window.SS;
  let loopStarted = false, last = 0, errors = 0;

  function frame(now) {
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0.016;
    last = now;
    try {
      SS.Input.frame();
      SS.Game.update(dt);
      SS.Audio.tick(dt);
      SS.Render.draw(now);
      SS.Minigames.frame(dt);
      SS.HUD.frame(dt);
      SS.Screens.frame(dt);
      errors = 0;
    } catch (e) {
      console.error(e);
      if (++errors > 5) { window.__ssFatal('Oyun döngüsü hatası: ' + (e && e.message)); return; }
    }
    requestAnimationFrame(frame);
  }

  function pauseForFocus() {
    if (SS.Game.state === 'PAUSED') return;
    SS.Screens.focusPause = true;
    if (!SS.Game.pause()) SS.Screens.focusPause = false;
    SS.Input.keys.clear();
  }

  function boot() {
    try {
      const canvas = document.getElementById('game');
      if (!canvas.getContext || !canvas.getContext('2d')) throw new Error('Tarayıcın Canvas 2D desteklemiyor.');
      SS.Game.init();
      SS.Audio.init();
      SS.Render.init(canvas);
      SS.Minigames.init();
      SS.Input.init();
      SS.HUD.init();
      SS.Screens.init();
      window.addEventListener('resize', () => { SS.Render.resize(); SS.Input.resetJoy(); });
      window.addEventListener('orientationchange', () => setTimeout(() => { SS.Render.resize(); SS.Input.resetJoy(); }, 150));
      document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForFocus(); });
      window.addEventListener('blur', pauseForFocus);
      window.__ssBooted = true;
      if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
    } catch (e) {
      console.error(e);
      window.__ssFatal((e && e.message) || String(e));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Ana ekrana eklenince çevrimdışı da açılsın. file:// ve gömülü sayfalarda (iframe) kaydedilmez.
  try {
    if ('serviceWorker' in navigator && window.isSecureContext && window.top === window) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker kaydedilemedi', e)));
    }
  } catch (e) { /* çevrimdışı destek olmadan da oyun çalışır */ }
})();
