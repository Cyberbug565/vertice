// Generador determinista de distritos exteriores (megápolis y alrededores) e interiores asociados.
// Trazado común: avenidas en y=30..33 y x=46..49; calles en y=12..13, y=50..51, x=20..21, x=72..73. Las puertas de borde conectan distritos.

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const THEMES = {
  colinas: {
    name: 'Colinas Doradas', base: 'grass', street: 'asphalt', side: 'sidewalk', styles: ['block', 'glass', 'arcology'], heights: [3, 9], tallChance: 0.12, tallHeights: [16, 26],
    colors: ['#5a6a7a', '#6a5a7a', '#4a6a6a', '#7a6a5a', '#5a5a7a'], signs: ['VILLA SOL', 'KAITEN HOMES', 'CLUB PRIVADO', 'ÁMBAR', 'OKAMI SPA', 'JARDINES'], signColors: ['#ffbf00', '#7dd3a0', '#ff8a3d'],
    police: 3, ambient: 14, gangs: [], props: ['palm', 'palm', 'lamp', 'bench'], sleepQuality: 0.4, extraGround: 'grass',
  },
  'neon-rojo': {
    name: 'Neón Rojo', base: 'plaza', street: 'asphalt', side: 'tile', styles: ['club', 'tower', 'spire', 'glass', 'club'], heights: [6, 18], tallChance: 0.3, tallHeights: [24, 40],
    colors: ['#3a1a3a', '#2a1a40', '#401a2a', '#1a1a3a', '#3a2a50'], signs: ['LOTO', 'KITSUNE', 'SAKURA', 'NEKO BAR', 'PARAÍSO', 'KARAOKE 24', 'DRAGÓN', 'ESTRELLA', 'VELVET', 'MOMIJI'], signColors: ['#ff3fa4', '#b46cff', '#43f3ff', '#ff5a5a', '#ffd23f'],
    police: 1, ambient: 22, gangs: [{ faction: 'kitsune', count: 6 }, { faction: 'furias', count: 4 }], props: ['neonstrip', 'lamp', 'billboard', 'holo'], sleepQuality: 0.3,
    holos: ['KITSUNE · PROTECCIÓN', 'CASINO LOTO', 'NEKO BAR ★', 'NOCHES SAKURA', 'TESELIA · SUEÑA'],
  },
  forja: {
    name: 'Forja', base: 'gravel', street: 'asphalt', side: 'metal', styles: ['industrial', 'industrial', 'block'], heights: [4, 10], tallChance: 0.08, tallHeights: [14, 20],
    colors: ['#4a4038', '#3a3a3a', '#504030', '#403a34'], signs: ['FUNDICIÓN 7', 'AURORA DEPÓSITO', 'NAVE 12', 'ACERÍAS', 'ENGRANAJES'], signColors: ['#ff3040', '#ff8a3d', '#ffd23f'],
    police: 0, ambient: 10, gangs: [{ faction: 'engranajes', count: 8 }], props: ['smokestack', 'pipe', 'crate', 'crate', 'wreck'], sleepQuality: 0.25,
  },
  arrabal: {
    name: 'El Arrabal', base: 'dirt', street: 'asphalt', side: 'sidewalk', styles: ['mega', 'mega', 'block', 'arcology'], heights: [12, 24], tallChance: 0.25, tallHeights: [26, 34],
    colors: ['#5a4a3a', '#4a3a3a', '#5a4a4a', '#4a4a3a', '#3a3a4a'], signs: ['BLOQUE 22', 'BLOQUE 41', 'SAN CIRO', 'LA ESPERANZA', 'BLOQUE 7', 'TACOS 24H'], signColors: ['#ffb347', '#ffd23f', '#43f3ff'],
    police: 0, ambient: 26, gangs: [{ faction: 'hermandad-sol', count: 7 }, { faction: 'voces-vacio', count: 4 }], props: ['trash', 'stall', 'crate', 'lamp'], sleepQuality: 0.3,
  },
};

function cityDistrict(id, seed, gates, interiorPlan) {
  const T = THEMES[id], r = rng(seed), W = 96, H = 64;
  const pick = (a) => a[Math.floor(r() * a.length)];
  const ground = [
    { type: T.side, rect: [0, 0, W, H] },
    { type: T.street, rect: [0, 30, W, 4] }, { type: T.street, rect: [46, 0, 4, H] },
    { type: T.street, rect: [0, 12, W, 2] }, { type: T.street, rect: [0, 50, W, 2] }, { type: T.street, rect: [20, 0, 2, H] }, { type: T.street, rect: [72, 0, 2, H] },
    { type: 'crosswalk', rect: [44, 30, 2, 4] }, { type: 'crosswalk', rect: [50, 30, 2, 4] }, { type: 'crosswalk', rect: [46, 28, 4, 2] }, { type: 'crosswalk', rect: [46, 34, 4, 2] },
  ];
  const xs = [[0, 19], [22, 45], [50, 71], [74, 95]], ys = [[0, 11], [14, 29], [34, 49], [52, 63]];
  const buildings = [], props = [], objects = [], doors = [], waypoints = [], blocks = [];
  let bi = 0;
  const interiorsOut = [];
  const plan = [...interiorPlan];
  for (const [y0, y1] of ys) for (const [x0, x1] of xs) {
    // Una plaza o parque por distrito en lugar de un bloque.
    if (x0 === 74 && y0 === 14) {
      ground.push({ type: T.extraGround ?? 'plaza', rect: [x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1] });
      for (let k = 0; k < 5; k++) props.push({ type: T.props[k % T.props.length] === 'holo' ? 'lamp' : T.props[k % T.props.length], at: [x0 + 3 + k * 3, y0 + 3 + (k % 2) * 5] });
      continue;
    }
    const bw = x1 - x0 - 1, bh = y1 - y0 - 1;
    const split = bw > 12 && r() < 0.65;
    const parts = split ? [[x0 + 1, Math.floor(bw / 2) - 1], [x0 + 1 + Math.floor(bw / 2) + 1, bw - Math.floor(bw / 2) - 2]] : [[x0 + 1, bw - 1]];
    for (const [bx, bww] of parts) {
      if (bww < 3) continue;
      const tall = r() < T.tallChance;
      const [hmin, hmax] = tall ? T.tallHeights : T.heights;
      const height = Math.round(hmin + r() * (hmax - hmin));
      const by = y0 + 1, bhh = bh - 1;
      const b = { id: `${id}-b${bi++}`, rect: [bx, by, bww, bhh], height, style: pick(T.styles), color: pick(T.colors) };
      const doorX = bx + Math.floor(bww / 2), doorY = by + bhh;
      const intr = plan.length && r() < 0.6 && doorY < H - 1 ? plan.shift() : null;
      if (intr || r() < 0.45) { b.sign = intr?.sign ?? pick(T.signs); b.signColor = pick(T.signColors); }
      if (intr) {
        b.name = intr.name; b.style = intr.style ?? b.style; b.height = intr.height ?? b.height;
        doors.push({ id: `puerta-${intr.id}`, name: intr.name, at: [doorX, doorY], to: { zone: intr.id, at: intr.inAt }, danger: intr.danger ?? 'protected' });
        interiorsOut.push({ ...intr, out: [id, doorX, doorY + 1 <= H - 1 ? doorY + 1 : doorY] });
      }
      buildings.push(b);
    }
  }
  if (plan.length) throw new Error(`${id}: no caben los interiores ${plan.map((p) => p.id)}`);
  // Decoración a lo largo de las avenidas.
  for (let x = 4; x < W - 2; x += 9) { if (x >= 44 && x <= 51) continue; props.push({ type: 'lamp', at: [x, 29] }); props.push({ type: 'lamp', at: [x + 4, 34] }); }
  for (let y = 4; y < H - 2; y += 9) { if (y >= 28 && y <= 35) continue; props.push({ type: 'lamp', at: [45, y] }); props.push({ type: 'lamp', at: [50, y] }); }
  if (T.holos) T.holos.forEach((h, i) => props.push({ type: 'holo', at: [10 + i * 18, i % 2 ? 34 : 29], blocking: false, color: pick(T.signColors), text: h, z: 8 + (i % 3) * 3 }));
  for (let i = 0; i < 6; i++) props.push({ type: 'antenna', at: [5 + i * 16, 5], blocking: false, z: 20 + i * 2 });
  // Cajeros, máquinas y contenedores en las aceras de las avenidas.
  [[18, 29], [70, 34], [44, 14], [51, 48]].forEach(([x, y], i) => objects.push({ id: `${id}-cajero-${i + 1}`, name: 'Cajero automático', at: [x, y], kind: 'atm' }));
  [[24, 29], [62, 34]].forEach(([x, y], i) => objects.push({ id: `${id}-vending-${i + 1}`, name: 'Máquina Aurora', at: [x, y], kind: 'vending', shop: 'aurora-vending' }));
  [[30, 34], [66, 29], [19, 52], [74, 11]].forEach(([x, y], i) => objects.push({ id: `${id}-basura-${i + 1}`, name: 'Contenedor de basura', at: [x, y], kind: 'trash' }));
  // Coches aparcados en el carril exterior de la avenida.
  [[8, 30], [38, 33], [58, 30], [86, 33]].forEach(([x, y]) => props.push({ type: 'car', at: [x, y], color: pick(['#ffd23f', '#ff5a5a', '#43f3ff', '#e8e8f0', '#2a2a2a']) }));
  for (const [x, y] of [[5, 31], [15, 32], [30, 31], [40, 32], [56, 31], [66, 32], [80, 31], [92, 32], [47, 6], [48, 20], [47, 44], [48, 58], [21, 6], [21, 22], [21, 44], [21, 58], [73, 6], [73, 22], [73, 44], [73, 58], [10, 12], [60, 13], [85, 50], [30, 51]]) waypoints.push([x, y]);
  for (const g of gates) doors.push(g);
  const zone = {
    id, name: T.name, kind: 'exterior', width: W, height: H, chunkSize: 32, danger: 'public', base: T.base, ambient: T.ambient, police: T.police,
    gangs: T.gangs.map((g) => ({ ...g, area: [48, 32, 40] })), sleepQuality: T.sleepQuality, ground, blocks, buildings, props, doors, objects,
    sectors: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(([cx, cy]) => ({ chunk: [cx, cy], name: `${T.name} · ${['Norte oeste', 'Norte centro', 'Norte este', 'Sur oeste', 'Sur centro', 'Sur este'][cy * 3 + cx]}` })),
    dangerAreas: [], waypoints, safePoint: [47, 31], skybridges: [],
  };
  return { zone, interiors: interiorsOut };
}

/** El Yermo: desierto con autopista, motel, gasolinera, campamento nómada y territorio de saqueadores. */
function yermo(gates) {
  const W = 128, H = 96, r = rng(777);
  const ground = [
    { type: 'asphalt', rect: [0, 46, W, 4] }, { type: 'crosswalk', rect: [0, 46, 1, 4] },
    { type: 'dirt', rect: [30, 20, 4, 26] }, { type: 'dirt', rect: [90, 50, 4, 30] },
    { type: 'gravel', rect: [18, 34, 22, 10] }, { type: 'dirt', rect: [20, 8, 30, 12] }, { type: 'gravel', rect: [84, 70, 30, 18] },
    { type: 'water', rect: [60, 70, 8, 6] },
  ];
  const buildings = [
    { id: 'yermo-motel', name: 'Motel Atardecer', rect: [20, 36, 12, 6], height: 3, style: 'shop', color: '#6a4a3a', sign: 'MOTEL ATARDECER', signColor: '#ff8a3d' },
    { id: 'yermo-gasolinera', name: 'Gasolinera Ruta 9', rect: [44, 38, 8, 6], height: 2, style: 'shop', color: '#4a5a6a', sign: 'RUTA 9', signColor: '#7dff7a' },
    { id: 'yermo-taller', name: 'Taller del convoy', rect: [24, 10, 8, 6], height: 3, style: 'industrial', color: '#5a4a3a', sign: 'TALLER', signColor: '#d9a066' },
    { id: 'yermo-silo', rect: [70, 20, 6, 6], height: 8, style: 'industrial', color: '#4a4a44' },
    { id: 'yermo-antena', rect: [110, 10, 4, 4], height: 18, style: 'spire', color: '#3a3a44', sign: 'HALCÓN', signColor: '#43f3ff' },
    { id: 'yermo-ruinas', rect: [96, 74, 10, 8], height: 4, style: 'block', color: '#4a3a34' },
  ];
  const props = [];
  for (let i = 0; i < 40; i++) { const x = 2 + Math.floor(r() * (W - 4)), y = 2 + Math.floor(r() * (H - 4)); if (y >= 44 && y <= 51) continue; props.push({ type: r() < 0.6 ? 'wreck' : 'crate', at: [x, y], color: '#6a5a4a' }); }
  for (const [x, y] of [[36, 12], [38, 14], [40, 11], [42, 15], [44, 12]]) props.push({ type: 'tent', at: [x, y], color: '#d9a066' });
  for (const [x, y] of [[88, 74], [92, 78], [100, 72], [104, 84]]) props.push({ type: 'tent', at: [x, y], color: '#8a6a3a' });
  for (let x = 6; x < W; x += 14) props.push({ type: 'lamp', at: [x, 51] });
  props.push({ type: 'billboard', at: [60, 44], blocking: true, color: '#ff8a3d', text: 'BIENVENIDO A CIUDAD VÉRTICE' });
  const objects = [
    { id: 'yermo-tienda-nomada', name: 'Puesto de los Nómadas del Polvo', at: [40, 17], kind: 'shop', shop: 'nomadas-tienda' },
    { id: 'yermo-cajero', name: 'Cajero de la gasolinera', at: [43, 44], kind: 'atm' },
    { id: 'yermo-basura', name: 'Bidón de basura', at: [34, 43], kind: 'trash' },
  ];
  const doors = [
    { id: 'puerta-motel-atardecer', name: 'Motel Atardecer', at: [26, 42], to: { zone: 'motel-int', at: [13, 5] }, danger: 'public' },
    { id: 'puerta-gasolinera', name: 'Gasolinera Ruta 9', at: [48, 44], to: { zone: 'gasolinera-int', at: [9, 4] }, danger: 'public' },
    ...gates,
  ];
  const zone = {
    id: 'yermo', name: 'El Yermo', kind: 'exterior', width: W, height: H, chunkSize: 32, danger: 'public', base: 'sand', ambient: 4, police: 0,
    gangs: [{ faction: 'nomadas-polvo', count: 6, area: [38, 14, 10] }, { faction: 'saqueadores', count: 6, area: [96, 78, 12] }],
    sleepQuality: 0.3, ground, blocks: [], buildings, props, doors, objects, skybridges: [],
    sectors: [], dangerAreas: [{ rect: [84, 64, 40, 30], level: 'disputed' }],
    waypoints: [[5, 47], [20, 48], [40, 47], [60, 48], [80, 47], [100, 48], [120, 47], [31, 30], [31, 22], [92, 60], [92, 72], [38, 18], [26, 44]], safePoint: [26, 44],
  };
  const interiors = [
    { id: 'motel-int', name: 'Motel Atardecer', size: 'big', base: 'wood', wall: '#6a4a3a', out: ['yermo', 26, 43], danger: 'protected', capsules: { quality: 0.75, price: 10, at: [[2, 1], [5, 1], [8, 1], [11, 1]] },
      counters: [[2, 6, 4, 1]], objects: [{ id: 'barra-motel', name: 'Barra del motel', at: [7, 6], kind: 'shop', shop: 'motel-barra' }] },
    { id: 'gasolinera-int', name: 'Gasolinera Ruta 9', size: 'small', base: 'tile', wall: '#4a5a6a', out: ['yermo', 48, 45], danger: 'public',
      shelves: [[1, 1], [2, 1], [3, 1], [4, 1]], objects: [{ id: 'caja-gasolinera', name: 'Caja de la gasolinera', at: [7, 4], kind: 'shop', shop: 'gasolinera-tienda' }] },
  ];
  return { zone, interiors };
}

export function districts() {
  const out = { zones: [], interiors: [] };
  const add = (d) => { out.zones.push(d.zone); out.interiors.push(...d.interiors); };
  const gate = (id, name, at, zone, to) => ({ id, name, at, to: { zone, at: to }, danger: 'public' });
  add(cityDistrict('colinas', 101, [gate('colinas-sur', 'Avenida hacia Cénit', [47, 63], 'cenit', [47, 1]), gate('colinas-este', 'Avenida hacia Neón Rojo', [95, 31], 'neon-rojo', [1, 31])], [
    { id: 'ambar-hq-int', name: 'Sede de Rescate Ámbar', sign: 'ÁMBAR', size: 'big', base: 'tile', wall: '#3a3020', inAt: [13, 5], style: 'glass', height: 22, beds: [[3, 8, '#ffbf00']], screens: [[5, 1, '#ffbf00'], [9, 1, '#ffbf00']],
      objects: [{ id: 'ambar-mostrador', name: 'Mostrador de suscripciones Ámbar', at: [7, 4], kind: 'ambar' }] },
    { id: 'boutique-int', name: 'Boutique Aurelia', sign: 'AURELIA', size: 'small', base: 'tile', wall: '#5a4a6a', inAt: [9, 4], style: 'shop', shelves: [[1, 1], [2, 1], [3, 1], [4, 1]], objects: [{ id: 'caja-boutique', name: 'Caja de la boutique', at: [7, 4], kind: 'shop', shop: 'boutique-aurelia' }] },
    { id: 'club-campo-int', name: 'Club de Campo Kaiten', sign: 'CLUB KAITEN', size: 'big', base: 'wood', wall: '#4a6a5a', inAt: [13, 5], style: 'block', tables: [[4, 4], [8, 4], [4, 8], [8, 8]], counters: [[2, 2, 1, 4]], objects: [{ id: 'barra-club-campo', name: 'Barra del club', at: [3, 7], kind: 'shop', shop: 'club-campo' }] },
  ]));
  add(cityDistrict('neon-rojo', 202, [gate('neon-oeste', 'Avenida hacia Colinas', [0, 31], 'colinas', [94, 31]), gate('neon-sur', 'Avenida hacia Forja', [47, 63], 'forja', [47, 1])], [
    { id: 'club-kitsune-int', name: 'Club Kitsune', sign: 'KITSUNE', size: 'big', base: 'metal', wall: '#3a1a3a', inAt: [13, 5], style: 'club', counters: [[2, 3, 1, 5]], neon: [[6, 1, '#b46cff'], [10, 1, '#ff3fa4']], tables: [[7, 7], [10, 7]], objects: [{ id: 'barra-kitsune', name: 'Barra del Kitsune', at: [3, 8], kind: 'shop', shop: 'kitsune-barra' }], danger: 'public' },
    { id: 'casino-loto-int', name: 'Casino Loto', sign: 'CASINO LOTO', size: 'mid', base: 'tile', wall: '#401a2a', inAt: [11, 5], style: 'tower', height: 30, screens: [[2, 1, '#ffd23f'], [5, 1, '#ff3fa4'], [8, 1, '#43f3ff']], objects: [{ id: 'cajero-casino', name: 'Cajero del casino', at: [10, 8], kind: 'atm' }], danger: 'public' },
    { id: 'armeria-callejon-int', name: 'Armería del Callejón', sign: 'ARMAS', size: 'small', base: 'metal', wall: '#2a1a1a', inAt: [9, 4], style: 'shop', shelves: [[1, 1], [2, 1], [3, 1]], objects: [{ id: 'mostrador-callejon', name: 'Mostrador del callejón', at: [7, 4], kind: 'shop', shop: 'armeria-callejon' }], danger: 'public' },
    { id: 'yuki-int', name: 'Consulta de Doc Yuki', sign: 'DOC YUKI', size: 'small', base: 'metal', wall: '#2a1a40', inAt: [9, 4], style: 'clinic', beds: [[3, 5, '#b46cff']], screens: [[5, 1, '#b46cff']], danger: 'public' },
  ]));
  add(cityDistrict('forja', 303, [gate('forja-oeste', 'Avenida hacia Cénit', [0, 31], 'cenit', [94, 31]), gate('forja-norte', 'Avenida hacia Neón Rojo', [47, 0], 'neon-rojo', [47, 62]), gate('forja-este', 'Autopista hacia El Yermo', [95, 31], 'yermo', [1, 47])], [
    { id: 'taller-engranajes-int', name: 'Taller de Los Engranajes', sign: 'ENGRANAJES', size: 'big', base: 'metal', wall: '#4a1a1a', inAt: [13, 5], style: 'industrial', crates: [[2, 2], [3, 2], [10, 8]], beds: [[5, 7, '#ff3040']], objects: [{ id: 'mostrador-engranajes', name: 'Banco de los Engranajes', at: [7, 3], kind: 'shop', shop: 'engranajes-chop' }], danger: 'public' },
    { id: 'comedor-obrero-int', name: 'Comedor obrero', sign: 'COMEDOR', size: 'small', base: 'wood', wall: '#504030', inAt: [9, 4], style: 'shop', tables: [[3, 6], [6, 6]], objects: [{ id: 'barra-comedor', name: 'Barra del comedor', at: [7, 2], kind: 'shop', shop: 'comedor-obrero' }] },
  ]));
  add(cityDistrict('arrabal', 404, [gate('arrabal-norte', 'Avenida hacia Ferro', [47, 0], 'ferro', [31, 62])], [
    { id: 'iglesia-sanciro-int', name: 'Iglesia de San Ciro', sign: 'SAN CIRO', size: 'big', base: 'wood', wall: '#5a4a3a', inAt: [13, 5], style: 'block', tables: [[4, 4], [4, 7], [8, 4], [8, 7]], objects: [{ id: 'comedor-sanciro', name: 'Comedor social de San Ciro', at: [12, 2], kind: 'shop', shop: 'sanciro-comedor' }] },
    { id: 'mercadillo-int', name: 'Mercadillo del Bloque 22', sign: 'MERCADILLO', size: 'big', base: 'dirt', wall: '#4a3a3a', inAt: [13, 5], style: 'mega', crates: [[2, 2], [2, 8]], shelves: [[5, 1], [6, 1], [7, 1]], objects: [{ id: 'puesto-mercadillo', name: 'Puesto del mercadillo', at: [8, 5], kind: 'shop', shop: 'mercadillo-arrabal' }], danger: 'public' },
    { id: 'nodo-vacio-int', name: 'Nodo del Vacío', sign: 'NODO', size: 'small', base: 'metal', wall: '#0a2a3a', inAt: [9, 4], style: 'block', screens: [[2, 1, '#43f3ff'], [5, 1, '#43f3ff'], [8, 1, '#43f3ff']], objects: [{ id: 'mostrador-nodo', name: 'Mostrador del Nodo', at: [7, 5], kind: 'shop', shop: 'nodo-vacio' }], danger: 'public' },
  ]));
  add(yermo([gate('yermo-oeste', 'Autopista hacia Forja', [0, 47], 'forja', [94, 31])]));
  return out;
}
