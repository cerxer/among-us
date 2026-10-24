// Çevrimdışı oynama: dosyalar önbelleğe alınır. Ağ varsa her zaman en yeni sürüm kullanılır
// (önce ağ, olmazsa önbellek), böylece güncellemeler hemen gelir.
const CACHE = 'space-suspects-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/core/util.js', 'js/core/data.js', 'js/core/map.js', 'js/core/physics.js', 'js/core/vision.js', 'js/core/pathfinding.js',
  'js/core/sabotage.js', 'js/core/bots.js', 'js/core/meeting.js', 'js/core/game.js',
  'js/ui/audio.js', 'js/ui/sprites.js', 'js/ui/render.js', 'js/ui/minigames.js', 'js/ui/input.js', 'js/ui/hud.js', 'js/ui/screens.js', 'js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
