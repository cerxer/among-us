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
    IMPOSTORS: 2,
    DISCUSS_TIME: 25,
    VOTE_TIME: 25,
    RESULT_TIME: 6.5,
    EMERGENCY_COOLDOWN: 15,
    SAB_COOLDOWN: 30,
    SAB_COOLDOWN_START: 20,
    OXY_TIME: 45,
    DOOR_TIME: 10,
    DOOR_COOLDOWN: 25,
    ROLE_REVEAL_TIME: 4,
    FAKE_TASK_TIME: 2.5,
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
})();
