import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Uso: node tools/ensanche/trazado.mjs <mapa-v031> <mapa-ampliado>');
const zone = JSON.parse(readFileSync(input, 'utf8'));
if (zone.id !== 'vertice' || zone.width !== 608 || zone.height !== 344) throw Error('Se necesita el trazado de Vértice 0.31.');

const GRID = { oldW: zone.width, oldH: zone.height, w: 744, h: 432 };
const DISTRICTS = [
  { id: 'llanos-orientales', name: 'Llanos Orientales', rect: [608, 8, 128, 104], type: 'outskirts', danger: 'lawless', ambient: 3 },
  { id: 'darsena-este', name: 'Dársena Este', rect: [608, 120, 128, 104], type: 'port', danger: 'public', ambient: 9 },
  { id: 'salobre', name: 'Polígono Salobre', rect: [608, 232, 128, 104], type: 'industry', danger: 'lawless', ambient: 5 },
  { id: 'ronda-del-rio', name: 'Ronda del Río', rect: [8, 344, 142, 80], type: 'outskirts', danger: 'public', ambient: 5 },
  { id: 'arco-sur', name: 'Arco Sur', rect: [158, 344, 142, 80], type: 'urban', danger: 'public', ambient: 11 },
  { id: 'fundicion-sur', name: 'Fundición Sur', rect: [308, 344, 142, 80], type: 'industry', danger: 'disputed', ambient: 7 },
  { id: 'patio-de-vias', name: 'Patio de Vías', rect: [458, 344, 142, 80], type: 'industry', danger: 'lawless', ambient: 3 },
  { id: 'terminal-intermodal', name: 'Terminal Intermodal', rect: [608, 344, 128, 80], type: 'port', danger: 'public', ambient: 6 },
];
const STYLE = {
  urban: { surface: 'sidewalk', yard: 'tile', facade: 'comercial', height: [8, 20], color: ['#586075', '#635776', '#555e70', '#746473'], models: ['esquina', 'galeria', 'balcones', 'patio', 'pasaje', 'medianera'], marker: '#fa8ae5' },
  port: { surface: 'gravel', yard: 'metal', facade: 'industrial', height: [5, 11], color: ['#59697b', '#776958', '#545b69', '#8a7565'], models: ['darsena', 'laminador', 'hangar', 'silos', 'almacen', 'deposito'], marker: '#4cdde9' },
  industry: { surface: 'dirt', yard: 'gravel', facade: 'ruina', height: [3, 9], color: ['#69584e', '#60656b', '#716556', '#626971'], models: ['nave-hundida', 'terminal-rota', 'taller-vencido', 'hangar', 'laminador', 'deposito'], marker: '#d49a60' },
  outskirts: { surface: 'sand', yard: 'dirt', facade: 'ruina', height: [2, 6], color: ['#7f6f57', '#6d5d54', '#767077', '#775e54'], models: ['taller-vencido', 'terminal-rota', 'nave-hundida', 'deposito'], marker: '#d4ae76' },
};
const FACADE_CENTRE = ['torre-prisma', 'torre-secuencia', 'podio-terminal'];
const CONTAINERS = ['contenedor-oxido', 'contenedor-verde', 'contenedor-cobalto', 'contenedor-apilado'];

const pick = (list, i) => list[i % list.length];
const point = ([x, y]) => [x, y, 1, 1];
const overlap = ([x, y, w, h], [a, b, rw, rh]) => x < a + rw && a < x + w && y < b + rh && b < y + h;
const inRect = ([x, y, w, h], [a, b]) => a >= x && b >= y && a < x + w && b < y + h;
const rectEnd = (rect, axis) => rect[axis] + rect[axis + 2];
const addGround = (type, rect) => zone.ground.push({ type, rect });
const roadKind = new Set(['asphalt', 'crosswalk', 'water', 'void', 'bridge']);

// Refuerza el núcleo de Cénit con las fachadas detalladas importadas de la release.
const replacements = new Map([
  ['aurora-hq', ['torre-secuencia', 72]], ['okami-central', ['torre-prisma', 86]],
  ['halcon-hq', ['torre-secuencia', 97]], ['torre-datos', ['torre-prisma', 69]],
  ['torre-sur', ['torre-secuencia', 58]], ['okami-super', ['podio-terminal', 12]],
  ['clinica-okami', ['podio-terminal', 20]], ['logistica-aurora', ['podio-terminal', 16]],
  ['aurora-hq-b-h', ['pasaje-electrico', 19]], ['torre-sur-b', ['torre-cableada', 38]],
  ['arcologia-kaiten-h', ['torre-aurora-neon', 43]],
]);
for (const b of zone.buildings) {
  const model = replacements.get(b.id);
  if (!model) continue;
  b.urban.model = model[0];
  b.height = model[1];
  b.color = '#d2d9e2';
}
const protectedSites = [
  zone.safePoint, ...zone.waypoints, ...zone.districts.flatMap(d => [d.safePoint, ...d.waypoints]),
  ...zone.skybridges.flatMap(s => [s.from, s.to]),
  ...[...zone.props, ...zone.objects, ...zone.doors].map(p => p.at),
].filter(Boolean).map(point);
const locked = zone.blocks.map(b => b.rect).concat(zone.ground.filter(b => roadKind.has(b.type)).map(g => g.rect), protectedSites);
const plazas = [
  ['torre-reflejos', 'Reflejos', [275, 146, 6, 5], 47],
  ['torre-interfaz', 'Interfaz', [287, 146, 6, 5], 55],
  ['pabellon-travesia', 'Pabellón Travesía', [277, 154, 6, 5], 11],
];
for (const [i, [id, name, rect, height]] of plazas.entries()) {
  if (locked.some(r => overlap(rect, r)) || zone.buildings.some(b => overlap(rect, b.rect))) throw Error('Parcela de Cénit ocupada: ' + id);
  zone.buildings.push({ id, name, rect, height, style: height > 20 ? 'tower' : 'shop', color: '#b8c6d7',
    sign: name.toUpperCase(), signColor: i === 1 ? '#dd66ff' : '#48daee',
    urban: { model: FACADE_CENTRE[i], facade: 'corporativa', turn: i } });
}

zone.width = GRID.w;
zone.height = GRID.h;
// Las antiguas calles de borde se convierten en enlaces interiores entre los distritos.
const roads = [];
function openRoad(id, rect) {
  roads.push({ type: 'asphalt', rect, street: 'ensanche-' + id });
}
for (const [i, y] of [0, 68, 112, 168, 224, 292, 336].entries()) {
  openRoad('oriente-' + i, [GRID.oldW, y, GRID.w - GRID.oldW, [8, 6, 8, 8, 8, 6, 8][i]]);
}
openRoad('ronda-sur', [0, 424, GRID.w, 8]);
openRoad('paseo-del-arco', [0, 384, GRID.w, 7]);
const EAST = [[668, 6], [707, 5], [736, 8]];
for (const [i, [x, w]] of EAST.entries()) openRoad('eje-oriental-' + i, [x, 0, w, GRID.h]);
const SOUTH = [[0, 8], [74, 5], [150, 8], [223, 6], [300, 8], [374, 6], [450, 8], [525, 5], [600, 8]];
for (const [i, [x, w]] of SOUTH.entries()) openRoad('enlace-sur-' + i, [x, GRID.oldH, w, GRID.h - GRID.oldH]);

const allGround = new Set();
const slot = (x, y) => y * GRID.w + x;
for (const road of roads) {
  const [x, y, w, h] = road.rect;
  for (let b = y; b < y + h; b++) for (let a = x; a < x + w; a++) allGround.add(slot(a, b));
}
function strips(rect, axis) {
  const start = rect[axis], end = rectEnd(rect, axis);
  const corridors = roads.filter(({ rect: r }) => overlap(rect, r) && r[axis + 2] < r[3 - axis])
    .map(({ rect: r }) => [Math.max(start, r[axis]), Math.min(end, rectEnd(r, axis))])
    .sort((a, b) => a[0] - b[0]);
  const ranges = [];
  let pos = start;
  for (const [lo, hi] of corridors) {
    if (lo > pos) ranges.push([pos, lo]);
    pos = Math.max(pos, hi);
  }
  if (pos < end) ranges.push([pos, end]);
  return ranges;
}

let blocks = 0, containerCount = 0;
for (const [index, district] of DISTRICTS.entries()) {
  const { id, name, rect, type, danger, ambient } = district;
  const spec = STYLE[type];
  addGround(spec.surface, rect);
  const waypoints = [];
  const parcels = [];
  for (const [x, x1] of strips(rect, 0)) for (const [y, y1] of strips(rect, 1)) {
    if (x1 - x < 15 || y1 - y < 15) continue;
    const n = blocks++;
    const width = x1 - x, depth = y1 - y;
    const hall = [x + 2, y + 2, width - 4, depth - 4];
    const center = x + Math.floor(width / 2) + (n % 3 - 1);
    const back = y + Math.floor(depth * ((n % 2) ? .46 : .54));
    addGround(spec.yard, hall);
    addGround('sidewalk', [x, y, width, 2]);
    addGround('sidewalk', [x, y1 - 2, width, 2]);
    addGround('alley', [center - 1, y + 2, 2, depth - 4]);
    addGround('alley', [x + 2, back, width - 4, 2]);
    waypoints.push([x + 2, y + 1], [center, back], [x1 - 3, y1 - 2]);
    parcels.push({ n, bounds: [x, y, width, depth], center, back });
  }
  for (const { n, bounds: [x, y, w, h], center, back } of parcels) {
    const x1 = x + w, y1 = y + h;
    const lots = [
      [x + 4, y + 5, center - x - 7, back - y - 7],
      [center + 3, y + 5, x1 - center - 7, back - y - 7],
      [x + 4, back + 4, center - x - 7, y1 - back - 7],
      [center + 3, back + 4, x1 - center - 7, y1 - back - 7],
    ];
    for (const [i, lot] of lots.entries()) {
      const key = n * 13 + i * 17;
      const [lx, ly, lw, lh] = lot;
      if (lw < 5 || lh < 5) continue;
      const yard = (type === 'port' && i >= 2) || (type === 'industry' && (n + i) % 3 === 0);
      if (yard) {
        const upright = lh >= lw * .75;
        const [cw, ch] = upright ? [2, Math.min(7, lh - 2)] : [Math.min(7, lw - 2), 2];
        const count = Math.min(4, Math.max(1, Math.floor((upright ? lw : lh) / 4)));
        for (let j = 0; j < count; j++) {
          const model = pick(CONTAINERS, key + j);
          const at = [lx + 1 + (upright ? j * 4 : 0), ly + 1 + (upright ? 0 : j * 4), cw, ch];
          zone.buildings.push({ id: `${id}-carga-${n}-${i}-${j}`, rect: at, height: model === 'contenedor-apilado' ? 2.9 : 1.55,
            style: 'industrial', color: '#c9c6c4', urban: { model, facade: 'industrial', turn: (upright ? 0 : 1) + (key + j) % 2 * 2 } });
          containerCount++;
        }
      } else if (type !== 'outskirts' || i === n % 4) {
        const width = Math.max(5, lw - key % 4);
        const depth = Math.max(5, lh - (key >>> 2) % 4);
        const [lo, hi] = spec.height;
        const model = pick(spec.models, key);
        zone.buildings.push({ id: `${id}-edificio-${n}-${i}`, rect: [lx, ly, width, depth], height: lo + (key * 5) % (hi - lo + 1),
          style: type === 'urban' ? 'block' : 'industrial', color: pick(spec.color, key), urban: { model, facade: spec.facade, turn: key % 4 } });
      }
    }
    const marker = spec.marker;
    zone.props.push({ type: 'lamp', at: [x + 3, y + 1], blocking: false, color: marker });
    if (type === 'port' && n % 2 === 0) zone.props.push({ type: 'crane', at: [x1 - 2, back + 1], blocking: false, color: '#be8d49' });
    if (type === 'outskirts' || type === 'industry') {
      zone.props.push({ type: 'wreck', at: [x1 - 2, y1 - 3], blocking: false, color: '#756457' });
      if (n % 2) zone.props.push({ type: 'dumpster', at: [x + 1, back + 2], blocking: false, color: '#635a51' });
    } else {
      zone.props.push({ type: type === 'urban' ? 'planter' : 'kiosk', at: [x1 - 2, y + 1], blocking: false, color: marker });
    }
  }
  if (!waypoints.length) throw Error('No hay manzanas para ' + name);
  const safePoint = waypoints[0];
  const gang = (type === 'industry' && danger !== 'public') ? 'engranajes' : 'saqueadores';
  zone.districts.push({ id, name, rect, police: danger === 'public' ? (type === 'outskirts' ? 0 : 1) : 0,
    ambient, danger, sleepQuality: danger === 'public' ? .34 : .22, safePoint, waypoints,
    gangs: danger === 'lawless' || danger === 'disputed' ? [{ faction: gang, count: type === 'outskirts' ? 2 : 3, area: [...waypoints[Math.min(4, waypoints.length - 1)], 13] }] : [] });
  if (danger !== 'public') zone.dangerAreas.push({ rect, level: danger });
  const labelAt = waypoints[Math.min(1, waypoints.length - 1)].slice();
  if (allGround.has(slot(...labelAt))) throw Error('Rótulo en calzada');
  zone.props.push({ type: 'billboard', at: labelAt, blocking: false, text: name.toUpperCase(), color: spec.marker });
  for (const [j, wp] of waypoints.slice(3, 7).entries()) {
    if ((index + j) % 2 === 0) zone.props.push({ type: 'lamp', at: wp, blocking: false, color: spec.marker });
  }
}
zone.ground.push(...roads);
for (const road of roads) {
  const [x, y, w, h] = road.rect;
  if (w <= h || h < 6 || x === 0 && y === 424) continue;
  for (const [ex, ew] of [...EAST, ...SOUTH]) {
    const ax = ex + ew + 3;
    if (ax < x + 2 || ax + 2 > x + w || y === 0) continue;
    zone.ground.push({ type: 'crosswalk', rect: [ax, y, 2, h], street: road.street });
  }
}
const keys = new Set(zone.sectors.map(s => s.chunk.join(',')));
for (let cy = 0; cy < Math.ceil(GRID.h / zone.chunkSize); cy++) for (let cx = 0; cx < Math.ceil(GRID.w / zone.chunkSize); cx++) {
  if (keys.has([cx, cy].join(','))) continue;
  const midpoint = [(cx + .5) * zone.chunkSize, (cy + .5) * zone.chunkSize];
  const d = DISTRICTS.find(o => inRect(o.rect, midpoint));
  zone.sectors.push({ chunk: [cx, cy], name: d?.name ?? 'Ronda de Vértice' });
}
writeFileSync(output, JSON.stringify(zone, null, 1) + '\n');
console.log(`${zone.width} × ${zone.height} · ${DISTRICTS.length} distritos · ${blocks} manzanas · ${containerCount} instalaciones de carga · ${roads.length} tramos de calzada`);
