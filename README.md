# Space Suspects

Tarayıcıda çalışan, tek oyunculu, botlarla oynanan 2D sosyal çıkarım oyunu. Uzay istasyonunda 8 bakım robotu var: 6 mürettebat, 2 hain. Sen birini oynarsın, diğer 7'si bot.

Harici kütüphane, görsel veya ses dosyası yok. Bütün grafikler Canvas 2D ile, bütün sesler Web Audio ile üretiliyor.

## Çalıştırma

Klasörde basit bir statik sunucu başlatıp tarayıcıda aç:

```bash
python3 -m http.server 8765
```

Ardından `http://localhost:8765` adresine git. Oyun ES modülü kullanmadığı için `index.html` dosyasına çift tıklayarak da açılabilmeli (bkz. bilinen eksikler).

Geliştirici modu: `http://localhost:8765/?dev=1`. Sol altta görev bitirme, sabotaj başlatma, bekleme süresini sıfırlama, beş mini oyunu doğrudan açma ve zafer tetikleme düğmeleri çıkar. Normal oyunda gizlidir.

## Kontroller

| Eylem | Masaüstü | Mobil |
|---|---|---|
| Hareket | WASD / Yön tuşları | Sol altta sanal joystick (sol yarıda herhangi bir yere dokun) |
| Görev / kullan / onar / havalandırma | E | Kullan butonu |
| Ceset rapor et | R | Rapor butonu |
| Saldır (hain) | Q | Saldır butonu |
| Sabotaj paneli (hain) | F | Sabotaj butonu |
| Harita | Tab / M | Sağ üstte Harita |
| Havalandırmada bağlı çıkış | 1 / 2 | Ekrandaki ok butonları |
| Panel kapat / duraklat | Esc | Sağ üstte Ayarlar |

Pasif butonların altında nedeni yazar ("Bekleme 12 sn", "Yakında ceset yok" gibi). Pasif butona basınca neden kısa bir bildirimle de gösterilir.

## Kod yapısı

Oyun mantığı (`js/core`) DOM'a dokunmaz; çizim ve arayüz (`js/ui`) yalnızca okur ve olay dinler.

```
index.html            Ekranlar ve HUD iskeleti
css/style.css         Arayüz, duyarlı düzen
js/core/util.js       Tohumlanabilir rastgele sayı, olay yolu
js/core/data.js       Sabitler, karakterler, odalar, koridorlar, eşyalar, görev noktaları
js/core/map.js        Karo ızgarası, kapı tespiti, çarpışma/opaklık ızgaraları
js/core/physics.js    Daire–karo çarpışması, alt adımlı hareket, serbest nokta bulma
js/core/vision.js     DDA ışın yürüyüşüyle görüş hattı ve görüş poligonu
js/core/pathfinding.js A* (8 yön, köşe kesme yok), yol düzeltme, kare başına sınırlı istek kuyruğu
js/core/sabotage.js   Elektrik, oksijen, kapı sabotajları
js/core/bots.js       Bot algısı, hafızası, kararları, toplantı cümleleri ve oyları
js/core/meeting.js    Tartışma → oylama → sonuç, oy sayımı
js/core/game.js       Durum makinesi, maç verisi, kurallar, oyuncu eylemleri, zafer kontrolü
js/ui/audio.js        Web Audio efektleri, sessiz mod
js/ui/sprites.js      Robot karakterler, gövdeler, avatarlar
js/ui/render.js       Harita katmanı, kamera, görüş sisi, efektler, göstergeler
js/ui/minigames.js    5 görev + 2 onarım mini oyunu
js/ui/input.js        Klavye, joystick, duruma göre giriş süzme
js/ui/hud.js          Görev çubuğu/listesi, aksiyon butonları, harita, sabotaj paneli
js/ui/screens.js      Menü, rol, toplantı, atılma, duraklatma, maç sonu, geliştirici modu
js/main.js            Tek seferlik açılış ve tek animasyon döngüsü
tests/run-tests.js    Node ile DOM'suz kural testleri ve 40 maçlık bot simülasyonu
tests/browser-smoke.js Tarayıcıda gerçek buton/klavye/pointer olaylarıyla uçtan uca test
```

Durumlar: `MENU`, `ROLE_REVEAL`, `PLAYING`, `TASK`, `MEETING_DISCUSSION`, `MEETING_VOTE`, `MEETING_RESULT`, `PAUSED`, `GAME_OVER`. Bütün zamanlayıcılar maç nesnesinin içinde tutulur ve yalnızca oyun döngüsünde ilerler (`setTimeout` yok). Yeni maç her şeyi baştan kurar, olay dinleyicileri açılışta bir kez eklenir.

## Testler

```bash
node tests/run-tests.js
```

Tarayıcı testi (oyun açıkken konsolda):

```js
const s = document.createElement('script'); s.src = 'tests/browser-smoke.js'; document.body.appendChild(s);
// yüklendikten sonra:
await __smoke()
```

## Bilinen eksikler ve notlar

- Gerçek bir telefonda denenmedi. Mobil düzen ve dokunma, tarayıcının mobil emülasyonunda (375×812 dikey, 844×390 yatay) test edildi.
- Seslerin kulakla doğrulaması yapılamadı. Ses kodu hatasız çalışıyor; ses bağlamı ilk kullanıcı etkileşiminde açılıyor.
- `file://` ile doğrudan açma bu ortamda denenemedi. Modül veya `fetch` kullanılmadığı için çalışması beklenir; sorun olursa yukarıdaki sunucu komutunu kullan.
- Toplantı sonunda yalnızca raporlanan değil, o an haritadaki bütün cesetler temizlenir.
- Ölü bot mürettebat haritada hayalet olarak dolaşmaz; kalan görevleri 14–22 saniyede bir arka planda tamamlanır.
- Hain botlar kendi kurbanlarını rapor etmez (kendini rapor etme taktiği yok).
- Oyuncu hayalet mürettebatken görevlerini yapmazsa görev zaferi gecikir; maç yine de hainlerin saldırıları ve oylamalarla sonuçlanır.
- Bot-bot simülasyonunda maçlar yaklaşık 1,5–2,5 dakika sürüyor (oyuncu da bot). Gerçek oyuncuyla, oyuncunun kendi görevleri de gerektiği için daha uzun sürer.
