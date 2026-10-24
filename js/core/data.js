// Oyun verisi: sabitler, karakterler, odalar, koridorlar, eşyalar, görev noktaları.
// Bütün harita koordinatları karo (tile) cinsindendir.
(function () {
  'use strict';
  const SS = window.SS;

  SS.C = {
    TILE: 40,
    MAP_W: 80,
    MAP_H: 57,
    RADIUS: 14,
    SPEED: 190,             // piksel / saniye
    GHOST_SPEED: 240,
    VISION_CREW: 300,
    VISION_IMP: 360,
    VISION_LIGHTS: 115,
    USE_RANGE: 66,
    BUTTON_RANGE: 150,
    REPORT_RANGE: 105,
    KILL_RANGE: 74,
    KILL_COOLDOWN: 25,
    KILL_COOLDOWN_START: 15,
    TASKS_PER_CREW: 4,
    IMPOSTORS: 3,
    DISCUSS_TIME: 35,
    VOTE_TIME: 30,
    RESULT_TIME: 6.5,
    EMERGENCY_COOLDOWN: 15,
    SAB_COOLDOWN: 30,
    SAB_COOLDOWN_START: 20,
    OXY_TIME: 45,
    DOOR_TIME: 10,
    DOOR_COOLDOWN: 25,
    ROLE_REVEAL_TIME: 4,
    FAKE_TASK_TIME: 2.5,
    BOT_TASK_SCALE: 1.3,       // bot görev sürelerinin çarpanı (15 kişi, her özel rolden 2)
    IMP_PATIENCE: [3, 8],      // hain botun saldırıdan önce beklediği süre aralığı (denge)
    ENGINEERS: 2,              // maç başına mühendis sayısı (herkes bilir)
    ENGINEER_VENT_COOLDOWN: 20,
    ENGINEER_VENT_COOLDOWN_START: 10,
    ENGINEER_VENT_MAX: 10,     // havalandırmada kalabileceği en uzun süre
    DOCTORS: 2,                // maç başına doktor sayısı (herkes bilir)
    VITALS_BATTERY: 10,        // yaşam belirtileri pil süresi (sn)
    VITALS_COOLDOWN: 15,       // pil bitince şarj süresi
    VITALS_TASK_RECHARGE: 5,   // görev başına pile eklenen süre
    DETECTIVES: 2,             // maç başına dedektif sayısı (herkes bilir)
    INTERROGATIONS: 3,         // dava başına sorgu hakkı
    INTERROGATE_RANGE: 46,     // sorgu için temas mesafesi (iki gövde değmeli)
    INTERROGATE_COOLDOWN: 8,
    JUDGES: 1,                 // maç başına yargıç sayısı (herkes bilir)
    JUDGE_USES: 1,             // yargıcın maç boyunca yargılama hakkı
    JUDGE_EJECT_SEG: 4.2,      // yargı sonrası her atılma animasyonunun süresi
    GUARDIAN_ANGELS: 5,        // öldüğünde koruyucu melek olan mürettebat sayısı (ayrı hayalet rolü katmanı)
    PROTECT_DURATION: 10,      // kalkan süresi
    PROTECT_COOLDOWN: 60,
    PROTECT_COOLDOWN_START: 10,// melek olunca ilk bekleme
    PROTECT_RANGE: 110,        // meleğin kalkan verebileceği uzaklık
    PROTECT_KILL_RESET: 10,    // engellenen saldırıdan sonra hainin bekleme süresi
    INFLUENCERS: 5,            // öldüğünde influencer olan mürettebat sayısı (ayrı hayalet rolü katmanı, melekle çakışmaz)
    INFLUENCE_RANGE: 140,      // takip başlatmak için yaşayan birine uzaklık
    INFLUENCE_COOLDOWN: 20,    // mesaj gönderdikten sonra bekleme
    INFLUENCE_COOLDOWN_START: 10, // influencer olunca ilk bekleme
    INFLUENCE_SHOW: 5,         // mesajın alıcının ekranında kalma süresi
    INFLUENCE_MAX_ICONS: 3,    // bir mesajdaki en fazla resim
    INFLUENCE_TRUST: 30,       // bot alıcının 'renk + kötü işaret' mesajıyla eklediği şüphe
    INFLUENCE_CHOICES: 6,      // aynı anda sunulan resim sayısı (yenilemek yarım bekleme cezası verir)
    TRACKERS: 2,               // maç başına iz sürücü sayısı (herkes bilir)
    TRACK_RANGE: 74,           // iz cihazı takma mesafesi
    TRACK_DURATION: 30,        // cihazın çalışma süresi
    TRACK_COOLDOWN: 15,
    TRACK_COOLDOWN_START: 10,
    TRACK_DELAY: 1,            // haritadaki konum bu aralıkla güncellenir
    PHANTOMS: 1,               // hainlerden kaçının fantom olduğu
    VANISH_DURATION: 10,       // görünmezlik süresi
    VANISH_COOLDOWN: 15,
    VANISH_COOLDOWN_START: 10,
    VANISH_FADE: 0.8,          // kaybolma / belirme animasyonu (bu sırada görülebilir)
    SHAPESHIFTERS: 1,          // hainlerden kaçının şekil değiştirici olduğu
    SHIFT_DURATION: 30,        // kılıkta kalma süresi
    SHIFT_COOLDOWN: 15,
    SHIFT_COOLDOWN_START: 10,
    SHIFT_ANIM: 0.8,           // dönüşüm animasyonu (görülebilir, iz bırakır)
  };

  // Her karakterin rengi, Türkçe ek biçimleri ve ayırt edici aksesuarı vardır.
  SS.CHARACTERS = [
    { key: 'turuncu', name: 'Turuncu', acc: 'Turuncuyu', gen: 'Turuncunun', abl: 'Turuncudan', color: '#ff8a2a', dark: '#b4520b', accessory: 'antenna', accName: 'Anten' },
    { key: 'mor', name: 'Mor', acc: 'Moru', gen: 'Morun', abl: 'Mordan', color: '#a66bff', dark: '#6533c2', accessory: 'headphones', accName: 'Kulaklık' },
    { key: 'mavi', name: 'Mavi', acc: 'Maviyi', gen: 'Mavinin', abl: 'Maviden', color: '#3f8cff', dark: '#1d52b5', accessory: 'propeller', accName: 'Pervaneli şapka' },
    { key: 'yesil', name: 'Yeşil', acc: 'Yeşili', gen: 'Yeşilin', abl: 'Yeşilden', color: '#3fd46c', dark: '#1d8a3d', accessory: 'sprout', accName: 'Filiz' },
    { key: 'kirmizi', name: 'Kırmızı', acc: 'Kırmızıyı', gen: 'Kırmızının', abl: 'Kırmızıdan', color: '#ff4f60', dark: '#b1222f', accessory: 'headlamp', accName: 'Kafa lambası' },
    { key: 'sari', name: 'Sarı', acc: 'Sarıyı', gen: 'Sarının', abl: 'Sarıdan', color: '#ffd23f', dark: '#bf960c', accessory: 'bowtie', accName: 'Papyon' },
    { key: 'pembe', name: 'Pembe', acc: 'Pembeyi', gen: 'Pembenin', abl: 'Pembeden', color: '#ff7ed8', dark: '#c03d9a', accessory: 'catears', accName: 'Kedi kulakları' },
    { key: 'beyaz', name: 'Beyaz', acc: 'Beyazı', gen: 'Beyazın', abl: 'Beyazdan', color: '#e8eefc', dark: '#949dc4', accessory: 'tophat', accName: 'Silindir şapka' },
    { key: 'kahve', name: 'Kahve', acc: 'Kahveyi', gen: 'Kahvenin', abl: 'Kahveden', color: '#a0683a', dark: '#5e3a1c', accessory: 'cap', accName: 'Kasket' },
    { key: 'turkuaz', name: 'Turkuaz', acc: 'Turkuazı', gen: 'Turkuazın', abl: 'Turkuazdan', color: '#33e3d2', dark: '#139488', accessory: 'goggles', accName: 'Kaynak gözlüğü' },
    { key: 'fistik', name: 'Fıstık', acc: 'Fıstığı', gen: 'Fıstığın', abl: 'Fıstıktan', color: '#b8f03c', dark: '#6f9a12', accessory: 'flower', accName: 'Çiçek' },
    { key: 'bordo', name: 'Bordo', acc: 'Bordoyu', gen: 'Bordonun', abl: 'Bordodan', color: '#a3244a', dark: '#5e0f27', accessory: 'beret', accName: 'Bere' },
    { key: 'gri', name: 'Gri', acc: 'Griyi', gen: 'Grinin', abl: 'Griden', color: '#a2a8b8', dark: '#5f6578', accessory: 'mustache', accName: 'Bıyık' },
    { key: 'lacivert', name: 'Lacivert', acc: 'Laciverti', gen: 'Lacivertin', abl: 'Lacivertten', color: '#3348b8', dark: '#1a2468', accessory: 'scarf', accName: 'Atkı' },
    { key: 'mercan', name: 'Mercan', acc: 'Mercanı', gen: 'Mercanın', abl: 'Mercandan', color: '#ff8a72', dark: '#c24a35', accessory: 'starclip', accName: 'Yıldız toka' },
  ];

  SS.ROOMS = [
    { id: 'merkez', name: 'Merkez', loc: 'merkezde', x: 30, y: 3, w: 20, h: 16, floor: '#383e80' },
    { id: 'iletisim', name: 'İletişim Odası', loc: 'iletişim odasında', x: 4, y: 3, w: 14, h: 10, floor: '#2f4275' },
    { id: 'oksijen', name: 'Oksijen Odası', loc: 'oksijen odasında', x: 62, y: 3, w: 14, h: 10, floor: '#294b74' },
    { id: 'reaktor', name: 'Reaktör', loc: 'reaktörde', x: 3, y: 22, w: 14, h: 14, floor: '#443377' },
    { id: 'kontrol', name: 'Kontrol Merkezi', loc: 'kontrol merkezinde', x: 63, y: 22, w: 14, h: 14, floor: '#2d3e76' },
    { id: 'elektrik', name: 'Elektrik Odası', loc: 'elektrik odasında', x: 14, y: 40, w: 14, h: 12, floor: '#3c356d' },
    { id: 'depo', name: 'Depo', loc: 'depoda', x: 33, y: 38, w: 16, h: 14, floor: '#373a62' },
    { id: 'saglik', name: 'Sağlık Bölümü', loc: 'sağlık bölümünde', x: 52, y: 40, w: 14, h: 12, floor: '#2f4877' },
  ];
  SS.CORRIDOR_INFO = { name: 'Koridor', loc: 'koridorda', floor: '#262b5e' };

  // Koridorlar odaları en az iki ayrı döngüyle bağlar.
  SS.CORRIDORS = [
    { x: 18, y: 6, w: 12, h: 3 },  // İletişim - Merkez
    { x: 50, y: 6, w: 12, h: 3 },  // Merkez - Oksijen
    { x: 8, y: 13, w: 3, h: 9 },   // İletişim - Reaktör
    { x: 67, y: 13, w: 3, h: 9 },  // Oksijen - Kontrol
    { x: 14, y: 36, w: 3, h: 4 },  // Reaktör - Elektrik
    { x: 63, y: 36, w: 3, h: 4 },  // Kontrol - Sağlık
    { x: 39, y: 19, w: 3, h: 19 }, // Merkez - Depo
    { x: 28, y: 44, w: 5, h: 3 },  // Elektrik - Depo
    { x: 49, y: 44, w: 3, h: 3 },  // Depo - Sağlık
    { x: 17, y: 27, w: 46, h: 3 }, // Orta koridor: Reaktör - Kontrol
  ];

  // Dekoratif ve katı eşyalar (çarpışmaya sahip).
  SS.FURNITURE = [
    { x: 38, y: 9, w: 4, h: 4, type: 'table' },
    { x: 31, y: 3, w: 2, h: 1, type: 'vending' },
    { x: 32, y: 15, w: 4, h: 1, type: 'bench' },
    { x: 44, y: 15, w: 4, h: 1, type: 'bench' },
    { x: 13, y: 3, w: 2, h: 2, type: 'server' },
    { x: 4, y: 10, w: 2, h: 2, type: 'crates' },
    { x: 71, y: 4, w: 4, h: 4, type: 'tanks' },
    { x: 73, y: 10, w: 2, h: 2, type: 'plants' },
    { x: 6, y: 26, w: 5, h: 5, type: 'reactor' },
    { x: 68, y: 28, w: 3, h: 2, type: 'console' },
    { x: 63, y: 22, w: 2, h: 2, type: 'server' },
    { x: 18, y: 46, w: 4, h: 3, type: 'generator' },
    { x: 34, y: 39, w: 3, h: 2, type: 'crates' },
    { x: 43, y: 39, w: 3, h: 2, type: 'crates' },
    { x: 35, y: 49, w: 4, h: 2, type: 'crates' },
    { x: 46, y: 47, w: 2, h: 2, type: 'crates' },
    { x: 54, y: 41, w: 2, h: 3, type: 'bed' },
    { x: 57, y: 41, w: 2, h: 3, type: 'bed' },
    { x: 60, y: 41, w: 3, h: 2, type: 'scanner' },
  ];

  SS.TASK_TYPES = {
    wires: { name: 'Kablo eşleştirme', botTime: [6, 9] },
    power: { name: 'Enerji dağıtımı', botTime: [6, 9] },
    card: { name: 'Kart tarama', botTime: [5, 7] },
    filter: { name: 'Filtre temizleme', botTime: [7, 10] },
    memory: { name: 'Hafıza paneli', botTime: [7, 11] },
  };

  // Görev noktaları: her biri bir eşyaya bağlıdır; "face" etkileşim yüzüdür.
  SS.STATIONS = [
    { id: 's1', type: 'wires', room: 'elektrik', f: { x: 19, y: 40, w: 2, h: 1, type: 'wirepanel' }, face: 'bottom' },
    { id: 's2', type: 'power', room: 'elektrik', f: { x: 23, y: 40, w: 3, h: 1, type: 'powerpanel' }, face: 'bottom' },
    { id: 's3', type: 'memory', room: 'reaktor', f: { x: 3, y: 32, w: 2, h: 3, type: 'memorypanel' }, face: 'right' },
    { id: 's4', type: 'power', room: 'reaktor', f: { x: 12, y: 22, w: 3, h: 1, type: 'powerpanel' }, face: 'bottom' },
    { id: 's5', type: 'filter', room: 'oksijen', f: { x: 63, y: 10, w: 3, h: 2, type: 'filterunit' }, face: 'top' },
    { id: 's6', type: 'card', room: 'kontrol', f: { x: 71, y: 22, w: 5, h: 2, type: 'desk' }, face: 'bottom' },
    { id: 's7', type: 'wires', room: 'kontrol', f: { x: 76, y: 28, w: 1, h: 2, type: 'wirepanel' }, face: 'left' },
    { id: 's8', type: 'memory', room: 'saglik', f: { x: 60, y: 51, w: 3, h: 1, type: 'memorypanel' }, face: 'top' },
    { id: 's9', type: 'card', room: 'saglik', f: { x: 65, y: 47, w: 1, h: 2, type: 'cardreader' }, face: 'left' },
    { id: 's10', type: 'filter', room: 'depo', f: { x: 42, y: 50, w: 3, h: 2, type: 'filterunit' }, face: 'top' },
    { id: 's11', type: 'wires', room: 'depo', f: { x: 48, y: 40, w: 1, h: 2, type: 'wirepanel' }, face: 'left' },
    { id: 's12', type: 'memory', room: 'iletisim', f: { x: 5, y: 3, w: 4, h: 2, type: 'comms' }, face: 'bottom' },
    { id: 's13', type: 'power', room: 'iletisim', f: { x: 15, y: 3, w: 2, h: 1, type: 'powerpanel' }, face: 'bottom' },
    { id: 's14', type: 'card', room: 'merkez', f: { x: 45, y: 3, w: 3, h: 1, type: 'cardreader' }, face: 'bottom' },
  ];

  // Sabotaj onarım panelleri.
  SS.PANELS = {
    lights: { name: 'Elektrik paneli', room: 'elektrik', f: { x: 14, y: 48, w: 1, h: 3, type: 'lightpanel' }, face: 'right' },
    o2a: { name: 'Oksijen paneli', room: 'oksijen', f: { x: 66, y: 3, w: 2, h: 1, type: 'o2panel' }, face: 'bottom' },
    o2b: { name: 'İletişim oksijen paneli', room: 'iletisim', f: { x: 11, y: 3, w: 2, h: 1, type: 'o2panel' }, face: 'bottom' },
  };

  // Havalandırmalar halka biçiminde bağlıdır.
  SS.VENTS = [
    { id: 0, room: 'reaktor', tx: 13, ty: 33, links: [1, 3] },
    { id: 1, room: 'elektrik', tx: 25, ty: 49, links: [0, 2] },
    { id: 2, room: 'saglik', tx: 55, ty: 49, links: [1, 3] },
    { id: 3, room: 'kontrol', tx: 74, ty: 33, links: [2, 0] },
  ];

  SS.BUTTON_TILE = { x: 40, y: 11 }; // masanın merkezi (karo köşesi)

  // Influencer resimleri: 15 renk + 8 oda + 33 çıkartma = 56. tone: bir renkle birlikte okununca
  // 'bad' şüphe, 'good' güven anlamı taşır (botlar mesajı böyle yorumlar).
  SS.INFLUENCE_ICONS = [].concat(
    SS.CHARACTERS.map((c, i) => ({ type: 'color', char: i, label: c.name })),
    SS.ROOMS.map((r, i) => ({ type: 'room', room: i, label: r.name })),
    [
      ['knife', '🔪', 'Hain', 'bad'], ['body', '💀', 'Ceset', 'bad'], ['vent', '🕳️', 'Havalandırma', 'bad'], ['liar', '🤥', 'Yalancı', 'bad'],
      ['warn', '⚠️', 'Tehlike', 'bad'], ['run', '🏃', 'Kaç', 'bad'], ['follow', '👣', 'Peşinde', 'bad'], ['fire', '🔥', 'Sabotaj', 'bad'],
      ['safe', '🛡️', 'Güvenli', 'good'], ['ok', '✅', 'Temiz', 'good'], ['heart', '❤️', 'Güven', 'good'], ['thumbs', '👍', 'İyi', 'good'],
      ['no', '❌', 'Hayır'], ['ask', '❓', 'Soru'], ['eye', '👀', 'İzliyorum'], ['alarm', '🚨', 'Toplantı'], ['task', '🔧', 'Görev'],
      ['light', '💡', 'Işık'], ['dark', '🌑', 'Karanlık'], ['wait', '⏳', 'Bekle'], ['fast', '⚡', 'Acele'], ['here', '📍', 'Burada'],
      ['there', '👉', 'Orada'], ['up', '⬆️', 'Yukarı'], ['down', '⬇️', 'Aşağı'], ['left', '⬅️', 'Sol'], ['right', '➡️', 'Sağ'],
      ['together', '👥', 'Birlikte kal'], ['alone', '🚶', 'Yalnız'], ['hide', '🙈', 'Saklan'], ['vote', '🗳️', 'Oy ver'], ['skip', '⏭️', 'Geç'], ['ghost', '👻', 'Hayalet'],
    ].map(([key, emoji, label, tone]) => ({ type: 'sticker', key, emoji, label, tone: tone || null }))
  );
})();
