# Space Suspects

Tarayıcıda çalışan, tek oyunculu, botlarla oynanan 2D sosyal çıkarım oyunu. Uzay istasyonunda 15 bakım robotu var: 12 mürettebat, 3 hain. Sen birini oynarsın, diğer 14'ü bot. Tartışma 35 sn, oylama 30 sn sürer.

**Mühendis:** Her maçta mürettebattan ikisi mühendistir (kim oldukları gizli, sayıları herkesçe bilinir). Görev yapar ve havalandırmaları kullanabilir: içeride en fazla 10 sn kalır, çıktıktan sonra 20 sn bekler. Saldıramaz, sabotaj yapamaz. Botlar bu yüzden havalandırma tanıklığını kesin kanıt saymaz; suçlanan mühendis rolünü açıklar, hainler de aynı iddiayı yalan olarak kullanabilir. Mühendis sayısından fazla kişi mühendis olduğunu iddia ederse botlar iddia sahiplerinden şüphelenir. Menüdeki rol tercihinden doğrudan mühendis olarak başlayabilirsin.

**Doktor** (Among Us'taki Bilim İnsanı mekaniği): Her maçta mürettebattan ikisi doktordur; kim oldukları gizli. Yaşam belirtileri ekranını (V tuşu / Yaşam butonu) haritanın her yerinden açıp herkesin hayatta, ölü ya da elenmiş olduğunu görür; konum gösterilmez. Pil 10 sn sürer, bitince 15 sn şarj olur; her tamamlanan görev pile 5 sn ekler ve şarjı bitirir. Ekran açıkken yürüyemez. Doktor botlar ara sıra ekrana bakar; cesedi bulunmamış bir ölüm görürlerse acil toplantı çağırabilir ve toplantıda ölümün zaman aralığını söylerler.

**Dedektif** (Among Us 17.0.0'daki rol): Her maçta mürettebattan ikisi dedektiftir; kim oldukları gizli. Her dedektifin sorgu hakları ve sonuçları kendine aittir. Bir ceset rapor edilince dava açılır. Dedektif temas ettiği karakteri sorgular (I tuşu / Sorgula butonu) ve cinayet anında hangi odada olduğunu öğrenir; havalandırmadaysa "Havalandırmalar" cevabı gelir. Dava başına 3 sorgu, sorgular arası 8 sn; aynı anda yalnızca en son dava sorgulanabilir. Dava dosyasında (N tuşu / Dava butonu) kurban, cesedin yeri, rapor eden, sorgu sonuçları ve şüpheli listen tutulur. Toplantıda kartlarda sorgu cevabı görünür ve "Sorgu sonuçlarını söyle" ile bulgular paylaşılır. Dedektif botlar toplantıdan sonra yakınlarındakileri sorgular; cesedin odasında çıkan birini bulursa acil toplantı çağırır.

Resmi oyunda sorgunun tam olarak ne gösterdiği ve varsayılan sayılar kaynaklarda yer almıyor. Bu sürümde sorgu, cinayet anındaki odayı doğru olarak söyler; tek hain türü olduğu için "hain türü" notu yok.

**İz Sürücü** (Among Us'taki Tracker, Haziran 2024): Her maçta mürettebattan ikisi iz sürücüdür; kim oldukları gizli. Yakınındaki birine iz cihazı takar (T tuşu / İz sür butonu); o kişinin konumu 30 sn boyunca haritada ve ekran kenarındaki renkli okta görünür, bilgi satırında odası yazar. Konum saniyede bir güncellenir (gecikmeli). İz istendiği an bırakılabilir; ardından 15 sn bekleme. Toplantı izi bitirir; hedef ölürse sinyal kesilir. İz sürücü botlar şüphelendikleri kişiye cihaz takar; hedef bir saniyede yürünemeyecek kadar uzağa sıçrarsa bunu havalandırma kullanımı olarak yakalayıp toplantıda söyler. Resmi oyunun varsayılan süreleri kaynaklarda bulunamadı; 30/15/1 sn değerleri bu sürümün seçimi.

**Yargıç** (Among Us modlarındaki Judge; resmi oyunda yok): Her maçta mürettebattan biri yargıçtır (`JUDGES`); kim olduğu gizli. Toplantıda, tartışma ya da oylama sırasında, maç boyunca bir kez (`JUDGE_USES`) birini yargılayabilir: "⚖ Yargıla" → kart seç → onay. Yargı anında tartışma/oylama biter ve atılma ekranına geçilir. Önce atılan kişi uzaya fırlatılır ve hain olup olmadığı yazılır. Atılan hainse yalnızca o gider, yargıç kalır. Hain değilse ardından yargıç da uzaya fırlatılır ve onun da hain olmadığı yazılır (ikisi de hayalet olur). Masum birini suçlamış olanlara botların güveni azalır. Son hain yargılanırsa atılma gösterildikten sonra maç biter. Yargıç bot yalnızca kendi gözüyle gördüğü bir cinayet, kaybolma veya dönüşüm varsa yargılar (kalabalığın suçlaması yetmez); bu yüzden botlar nadiren, ama isabetle yargılar.

**Koruyucu Melek** (Among Us'taki Guardian Angel, hayalet rolü): Mürettebattan 5 kişi (`GUARDIAN_ANGELS`) öldüğünde koruyucu melek olur. Melek ayrı bir hayalet rolü katmanıdır: önce özel rolü olmayan mürettebat seçilir, yer kalmazsa özel rollüler de seçilir (12 mürettebatta 9 özel rol var, bu yüzden 5 meleğin 2'si özel rollüdür; ör. bir mühendis öldükten sonra melek olabilir). Melek, yaşarken kendi rolünü oynar ve öldüğünde (kanatlı hayalet). Yakınındaki yaşayan birine 10 sn kalkan verir (P tuşu / Koru butonu); kalkanlı kişiye yapılan saldırı başarısız olur, hainin bekleme süresi 10 sn'ye sıfırlanır ve altın bir parlama görünür. Saldırı girişimini gören ya da saldırıya uğrayan bot bunu kesin kanıt sayar, toplantı çağırır ve söyler. Kalkanı yalnızca melek ve hayaletler görür. Koruma beklemesi 60 sn, melek olunca ilk bekleme 10 sn; toplantı kalkanları kaldırır. Melek bot, hayaletler hainleri görebildiği için kalkanı saldırısı hazır bir haine en yakın mürettebata verir. 10/60/10 sn değerleri ve kalkanın görünürlüğü bu sürümün seçimi.

**Influencer** (hayalet rolü, kullanıcının verdiği tarife göre): Mürettebattan 5 kişi (`INFLUENCERS`) öldüğünde ya da atıldığında influencer olur. Melekle aynı kişiye verilmez; önce özel rolsüzler seçilir, onlar meleklere gittiği için influencer'ların çoğu özel rollüdür. Hayalet olarak yakınındaki yaşayan birini takip eder (O tuşu / Takip butonu); takip ederken hayalet hedefin yanında kalır. Hedefe aynı anda en fazla 3 resimden oluşan bir mesaj gönderir. 56 resim vardır (15 renk, 8 oda, 33 çıkartma) ve her seferinde 6 tanesi sunulur. Yenilemek 6 yeni resim getirir, ama yarım bekleme süresi (10 sn) cezası verir. Mesaj alıcının ekranında 5 sn kalır. Göndermeden sonra 20 sn bekleme vardır, influencer olunca ilk bekleme 10 sn'dir; toplantı takibi bitirir. Bot influencer'lar hainleri görür ve yalnızca sunulan resimlerle (gerekirse yenileyerek) hedefe en yakın hainin rengini, bir "kötü" çıkartmayı (🔪, ⚠️…) ve odasını gönderir. Bot alıcı "renk + kötü çıkartma" mesajını şüphe olarak (+30, `INFLUENCE_TRUST`), "renk + iyi çıkartma" (🛡️, ✅…) mesajını güven olarak yorumlar ve toplantıda söyleyebilir. 20/10/5 sn değerleri ve botların yorumu bu sürümün seçimi.

**Fantom** (Among Us'taki Phantom, hain rolü, Haziran 2024): İki hainden biri fantomdur. 10 sn görünmez olabilir (G tuşu / Kaybol butonu); bu sırada yaşayan mürettebat onu göremez, diğer hain ve hayaletler soluk olarak görür. Görünmezken saldıramaz; havalandırma, rapor, görev ve acil buton da kullanılamaz. Süre dolunca ya da istediği an yeniden belirir; ardından 15 sn bekleme. Kaybolma ve belirme 0,8 sn'lik bir animasyonla olur ve bu an görülebilir: bunu gören mürettebat botu neredeyse kesin kanıt kaydeder, acil toplantı çağırır ve toplantıda söyler. Fantom botlar cinayetten sonra kaybolarak kaçar, kimse bakmıyorken yeniden belirir. Toplantı başlayınca fantom görünür olur. Resmi oyunda "Phantom" adlı bu rolün varsayılan süreleri kaynaklarda bulunamadı; 10/15/0,8 sn değerleri bu sürümün seçimi. Ölü oyuncular için zaten "hayalet" dendiği için rolün adı Fantom.

**Şekil Değiştirici** (Among Us'taki Shapeshifter, hain rolü): Hainlerden biri şekil değiştiricidir (fantomdan ayrı). Yaşayan birinin kılığına 30 sn girer (H tuşu / Dönüş butonu, açılan panelden kişi seçilir); başkaları onu o kişi olarak görür, adı da değişir. Kılıktayken saldırabilir ve havalandırma kullanabilir. Botlar gördüklerini görünen kimlikle kaydeder, yani kılıktaki hainin cinayetini gören bot masumu suçlar. 0,8 sn'lik dönüşüm anı görülebilir: bunu gören bot gerçek kimliği öğrenir, kılık süresinde o kişiye yazdığı tanıklıkları gerçek haine aktarır ve toplantıda söyler. İstendiği an geri dönülür; ardından 15 sn bekleme. Toplantı kılığı bozar. Şekil değiştirici botlar saldırmadan önce kimse bakmıyorken uzaktaki birinin kılığına girer, sonra kimse bakmıyorken geri döner. Kaynaklar dönüşümün görülebildiğini, iz bıraktığını ve toplantıda asıl kimliğin göründüğünü doğruluyor; 30/15/0,8 sn ve kılıktayken saldırı izni bu sürümün seçimi.

Harici kütüphane, görsel veya ses dosyası yok. Bütün grafikler Canvas 2D ile, bütün sesler Web Audio ile üretiliyor.

## Çalıştırma

Klasörde basit bir statik sunucu başlatıp tarayıcıda aç:

```bash
python3 -m http.server 8765
```

Ardından `http://localhost:8765` adresine git. Oyun ES modülü kullanmadığı için `index.html` dosyasına çift tıklayarak da açılabilmeli (bkz. bilinen eksikler).

Karakter seçimi: Ana menüdeki robot dizisinden kendi karakterini seç. Hiç seçim yapılmadıysa Kırmızı ile başlarsın. Seçimin tarayıcıda hatırlanır; diğer 7 karakter her maçta rastgele dağıtılır. Rol, rol tercihine göre belirlenir.

Geliştirici modu: `http://localhost:8765/?dev=1`. Sol altta görev bitirme, sabotaj başlatma, bekleme süresini sıfırlama, beş mini oyunu doğrudan açma ve zafer tetikleme düğmeleri çıkar. Normal oyunda gizlidir.

## Telefona uygulama olarak ekleme

Oyun yayında: **https://cerxer.github.io/among-us/**

- **iPhone / iPad:** Adresi **Safari** ile aç → alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle** → **Ekle**. Ana ekranda Space Suspects ikonu çıkar; dokununca tam ekran açılır.
- **Android:** Chrome ile aç → menü (⋮) → **Ana ekrana ekle** / **Uygulamayı yükle**.

İlk açılıştan sonra oyun internet olmadan da çalışır (service worker, `sw.js`). İnternet varken her açılışta en yeni sürüm yüklenir. Oyunu güncellemek için `main` dalına push etmek yeterli; GitHub Pages birkaç dakika içinde yayınlar.

## Kontroller

| Eylem | Masaüstü | Mobil |
|---|---|---|
| Hareket | WASD / Yön tuşları | Sol altta sanal joystick (sol yarıda herhangi bir yere dokun) |
| Görev / kullan / onar / havalandırma | E | Kullan butonu |
| Ceset rapor et | R | Rapor butonu |
| Saldır (hain) | Q | Saldır butonu |
| Sabotaj paneli (hain) | F | Sabotaj butonu |
| Yaşam belirtileri (doktor) | V | Yaşam butonu |
| Sorgula / Dava dosyası (dedektif) | I / N | Sorgula butonu / sağ üstte Dava |
| İz cihazı tak / bırak (iz sürücü) | T | İz sür butonu |
| Kaybol / görün (fantom) | G | Kaybol butonu |
| Kılık değiştir / geri dön (şekil değiştirici) | H | Dönüş butonu |
| Kalkan ver (koruyucu melek, hayaletken) | P | Koru butonu |
| Takip et / bırak, resim gönder (influencer, hayaletken) | O, paneldeki resimler | Takip butonu ve panel |
| Harita | Tab / M | Sağ üstte Harita |
| Havalandırmada bağlı çıkış (hain, mühendis) | 1 / 2 | Ekrandaki ok butonları |
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
- Bot-bot simülasyonunda maçlar ortalama 2,5 dakika sürüyor (oyuncu da bot); 450 maçta mürettebat yaklaşık %52 kazanıyor. 15 kişi, her özel rolden 2 kişi, 5 koruyucu melek ve 5 influencer ile denge için bot görev süreleri çarpanı 1,3 (melekler ve influencer'lar mürettebatı güçlendirdiği için 1,0'dan yükseltildi), hain botlar saldırıdan önce 3–8 sn bekliyor (`BOT_TASK_SCALE`, `IMP_PATIENCE`). Özel rol sayıları `ENGINEERS`, `DOCTORS`, `DETECTIVES`, `TRACKERS` ile değiştirilebilir. Gerçek oyuncuyla, oyuncunun kendi görevleri de gerektiği için maç daha uzun sürer.
