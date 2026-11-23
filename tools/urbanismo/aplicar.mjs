// Adapta la malla urbana a la cuadrícula jugable de Vértice sin cambiar las coordenadas de sus entradas.
import { readFileSync, writeFileSync } from 'node:fs';
import source from '../../client/src/render/nueva-york.json' with { type: 'json' };

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Uso: node tools/urbanismo/aplicar.mjs <ciudad-base.json> <ciudad-nueva.json>');
const zone = JSON.parse(readFileSync(input, 'utf8'));
if (zone.id !== 'vertice' || zone.buildings.some(b => b.urban)) throw new Error('Se requiere el mapa de Vértice previo a esta actualización.');

const FAMILIES = {
  towers: ['aguja', 'bisel', 'quiebro', 'tridente', 'terraza', 'curva', 'oblicua', 'remate', 'pantalla', 'prisma'],
  blocks: ['esquina', 'galeria', 'balcones', 'patio', 'pasaje', 'medianera'],
  estates: ['lucernario', 'chaflan', 'jardin', 'pabellon', 'porche', 'voladizo'],
  warehouses: ['darsena', 'laminador', 'hangar', 'silos', 'almacen', 'deposito'],
  damaged: ['nave-hundida', 'terminal-rota', 'taller-vencido'],
};
const COLORS = {
  corporativa: ['#526386', '#506a7c', '#686780', '#31506d', '#575f72', '#465474'],
  residencial: ['#b39983', '#9fa9a8', '#b9ab9e', '#8d9994', '#9c8173', '#b7a985'],
  comercial: ['#625169', '#715967', '#585570', '#615d72', '#735162', '#526672'],
  industrial: ['#70665b', '#6a706c', '#7c6053', '#666b73', '#605b53', '#795e4d'],
  ruina: ['#5e493e', '#64534a', '#695544', '#706458', '#594a40', '#524e4c'],
};
const OUTSKIRTS = new Set(['muelles-viejos', 'descampado-norte', 'poligono', 'vertedero', 'cementerio-trenes', 'yermo']);
const RETAIN_LANDMARK = new Set(['colinas-b4', 'colinas-b7-b', 'colinas-b7-b-h']);
const SIGNATURES = {
  'aurora-hq': ['quiebro', 71], 'okami-central': ['terraza', 82],
  'halcon-hq': ['bisel', 94], 'teselia-spire': ['aguja', 109],
  'torre-datos': ['curva', 65], 'arcologia-kaiten': ['tridente', 64],
  'arcologia-kaiten-b': ['pantalla', 95], 'arcologia-kaiten-b-h': ['remate', 105],
  'torre-sur': ['oblicua', 54], 'bloque-ejecutivo': ['prisma', 44],
  'yermo-antena': ['aguja', 18], 'yermo-silo': ['silos', 8],
  'yermo-estacion-seca': ['taller-vencido', 4],
  'yermo-subestacion-abandonada': ['nave-hundida', 5],
  'yermo-desguace-salitre': ['terminal-rota', 6],
};

const overlap = ([x, y, w, h], [a, b, rw, rh]) => x < a + rw && a < x + w && y < b + rh && b < y + h;
const contains = ([x, y, w, h], [a, b]) => a >= x && a < x + w && b >= y && b < y + h;
const pointRect = ([x, y]) => [x, y, 1, 1];
const buffer = ([x, y, w, h], size) => [x - size, y - size, w + 2 * size, h + 2 * size];
const tile = (x, y) => y * zone.width + x;
function tiles([x, y, w, h], visit) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) visit(xx, yy);
}
const districtOf = ([x, y, w, h]) => zone.districts.find(d => contains(d.rect, [x + w / 2, y + h / 2]))?.id ?? 'ferro';
const positions = [
  zone.safePoint, ...zone.waypoints, ...zone.districts.flatMap(d => [d.safePoint, ...d.waypoints]),
  ...zone.skybridges.flatMap(s => [s.from, s.to]), ...zone.doors.map(d => d.at), ...zone.objects.map(o => o.at),
].filter(Boolean);
const points = positions.map(pointRect);
const reserved = zone.blocks.map(b => b.rect).concat(points, zone.props.filter(p => p.blocking !== false).map(p => pointRect(p.at)));
const originalGround = Array(zone.width * zone.height).fill(zone.base);
for (const g of zone.ground) tiles(g.rect, (x, y) => {
  if (x >= 0 && y >= 0 && x < zone.width && y < zone.height) originalGround[tile(x, y)] = g.type;
});

function groundAllowed(rect, banned) {
  if (!contains([0, 0, zone.width, zone.height], rect) || !contains([0, 0, zone.width, zone.height], [rect[0] + rect[2] - 1, rect[1] + rect[3] - 1])) return false;
  let clear = true;
  tiles(rect, (x, y) => { if (banned.has(originalGround[tile(x, y)])) clear = false; });
  return clear;
}

function hash(s) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

const streetTypes = new Set(['asphalt', 'crosswalk', 'water', 'void', 'bridge']);
const publicProximity = rect => zone.doors.some(d => overlap(buffer(rect, 2), pointRect(d.at)));
const patches = [];
const props = [];
const newYards = [];
const lotGroups = Map.groupBy(zone.buildings.filter(b => /^colinas-b\d+/.test(b.id)), b => b.id.match(/^colinas-b\d+/)[0]);
for (const [id, lot] of lotGroups) {
  if (lot.length < 3 || lot.some(b => b.name || publicProximity(b.rect) || RETAIN_LANDMARK.has(b.id))) continue;
  const ox = Math.min(...lot.map(b => b.rect[0])), oy = Math.min(...lot.map(b => b.rect[1]));
  const ow = Math.max(...lot.map(b => b.rect[0] + b.rect[2])) - ox;
  const oh = Math.max(...lot.map(b => b.rect[1] + b.rect[3])) - oy;
  if (ow < 10 || oh < 9) continue;
  const garden = [ox, oy, ow, oh];
  if (!groundAllowed(garden, streetTypes)) continue;
  if (zone.buildings.some(b => !lot.includes(b) && overlap(garden, b.rect))) continue;
  const insideObstacles = reserved.filter(r => overlap(garden, r));
  const villaDepth = Math.round(oh * 0.55);
  const candidates = [];
  for (let w = Math.round(ow * 0.69); w >= 5; w--) {
    for (let x = ox; x + w <= ox + ow; x++) {
      for (let y = oy; y + villaDepth + 2 <= oy + oh; y++) {
        const villa = [x, y, w, villaDepth];
        if (!insideObstacles.some(r => overlap(villa, r))) {
          const distance = Math.abs(x + w / 2 - (ox + ow / 2)) + Math.abs(y - oy);
          candidates.push({ villa, score: -10 * w + distance });
        }
      }
    }
    if (candidates.length) break;
  }
  const villa = candidates.sort((a, b) => a.score - b.score)[0]?.villa;
  if (!villa) continue;
  const manor = lot.find(b => b.id === id) ?? lot[0];
  manor.rect = villa;
  manor.height = 3 + hash(id) % 4;
  manor.style = 'glass';
  zone.buildings = zone.buildings.filter(b => b === manor || !lot.includes(b));
  patches.push({ type: 'grass', rect: garden });
  const pathWidth = Math.min(3, villa[2] - 1);
  patches.push({ type: 'tile', rect: [villa[0] + 1, villa[1] + villa[3], pathWidth, oy + oh - villa[1] - villa[3]] });
  newYards.push({ garden, villa });
}

for (const [id, rect] of [
  ['yermo-estacion-seca', [523, 152, 8, 6]],
  ['yermo-subestacion-abandonada', [548, 187, 9, 6]],
  ['yermo-desguace-salitre', [578, 191, 8, 6]],
]) {
  if (!groundAllowed(rect, streetTypes) || reserved.some(r => overlap(rect, r)) || zone.buildings.some(b => overlap(rect, b.rect))) {
    throw new Error('Parcela obstruida: ' + id);
  }
  zone.buildings.push({ id, rect, height: 5, style: 'industrial' });
}

// Fachadas: distribuye variaciones por familia y evita repetir modelo en edificios contiguos.
const placed = [];
for (const b of zone.buildings) {
  const d = districtOf(b.rect), n = hash(b.id), [x, y, w, h] = b.rect, protectedDoor = publicProximity(b.rect);
  const landmark = SIGNATURES[b.id];
  let facade = 'comercial', pool = FAMILIES.blocks;
  if (d === 'cenit') {
    if (landmark || (b.height >= 24 && Math.min(w, h) >= 5)) {
      facade = 'corporativa';
      pool = FAMILIES.towers;
      // Los edificios de la misma manzana forman un podio y un grupo de torres de distinta altura.
      const annex = /(?:-b|-h|-l\d|-z\d)$/.test(b.id);
      if (annex) b.height = Math.max(15, Math.min(64, Math.round(b.height * (0.48 + (n % 40) / 100))));
      else b.height = Math.max(24, Math.min(86, b.height + n % 21));
    } else {
      b.height = Math.min(b.height, 22);
    }
  } else if (d === 'colinas') {
    if (RETAIN_LANDMARK.has(b.id)) {
      facade = 'corporativa';
      pool = FAMILIES.towers;
      b.height = b.id === 'colinas-b4' ? 24 : 32 + n % 14;
    } else {
      facade = 'residencial';
      pool = FAMILIES.estates;
      b.height = Math.min(b.height, protectedDoor ? 12 : 4 + n % 4);
    }
  } else if (OUTSKIRTS.has(d)) {
    facade = protectedDoor || b.id === 'yermo-antena' || b.id === 'yermo-silo' || n % 5 === 0 ? 'industrial' : 'ruina';
    if (landmark && FAMILIES.damaged.includes(landmark[0])) facade = 'ruina';
    pool = facade === 'ruina' ? FAMILIES.damaged : FAMILIES.warehouses;
    b.height = Math.max(2, Math.min(d === 'yermo' ? 9 : 12, Math.round(b.height * (facade === 'ruina' ? 0.72 : 1))));
  } else if (d === 'forja') {
    facade = b.style === 'club' ? 'comercial' : n % 5 === 0 && !protectedDoor ? 'ruina' : 'industrial';
    pool = facade === 'ruina' ? FAMILIES.damaged : facade === 'comercial' ? FAMILIES.blocks : FAMILIES.warehouses;
    b.height = Math.min(b.height, b.id.includes('aurora') ? 26 : 17);
  } else if (b.height >= 23 && Math.min(w, h) >= 5) {
    pool = d === 'arrabal' ? FAMILIES.blocks : FAMILIES.towers.slice(1);
    b.height = Math.min(b.height, d === 'neon-rojo' ? 62 : 38);
  } else if (b.style === 'industrial') {
    facade = 'industrial';
    pool = FAMILIES.warehouses;
  }
  const nearby = placed.filter(other => districtOf(other.rect) === d && overlap(buffer(b.rect, 6), other.rect));
  const candidates = Array.from({ length: pool.length }, (_, i) => pool[(n + i) % pool.length]);
  const model = landmark?.[0] ?? candidates.find(id => !nearby.some(other => other.urban.model === id)) ?? candidates[0];
  if (!source.buildings[model]) throw new Error('Modelo inexistente: ' + model);
  if (landmark) b.height = landmark[1];
  b.color = COLORS[facade][Math.floor(n / 16) % COLORS[facade].length];
  const turn = Math.min(w, h) * 1.8 < Math.max(w, h) ? (w > h ? 0 : 1) + (n % 2) * 2 : (n >>> 4) % 4;
  b.urban = { model, facade, turn };
  placed.push(b);
}

function addStreet(id, rect, walks = []) {
  const obstacles = zone.buildings.map(b => b.rect).concat(zone.blocks.map(b => b.rect), points);
  if (!groundAllowed(rect, new Set(['water', 'void'])) || obstacles.some(r => overlap(rect, r))) {
    throw new Error('Calzada obstruida: ' + id + ' ' + rect.join(','));
  }
  patches.push({ type: 'asphalt', rect, street: id });
  for (const crossing of walks) {
    tiles(crossing, (x, y) => {
      if (!contains(rect, [x, y])) throw new Error('Paso fuera de la calzada: ' + id);
    });
    patches.push({ type: 'crosswalk', rect: crossing, street: id });
  }
}

function dominantStreet(axis) {
  const lines = new Map();
  for (const [a, b] of source.roads.edges) {
    const length = Math.abs(a[axis] - b[axis]);
    const transverse = 1 - axis;
    if (length < 0.035 || Math.abs(a[transverse] - b[transverse]) > 0.14 * length) continue;
    const band = Math.round((a[transverse] + b[transverse]) * 15) / 30;
    lines.set(band, (lines.get(band) ?? 0) + length);
  }
  return [...lines].sort((a, b) => b[1] - a[1])[0][0];
}

// Se encaja la T dominante del recorte en el hueco oriental del centro, entre avenidas existentes.
const row = 144 + Math.round(26 * dominantStreet(0));
const column = 266 + Math.round(37 * dominantStreet(1));
addStreet('cenit-travesia-corporativa', [269, row, column - 267, 3], [[271, row, 2, 3]]);
addStreet('cenit-calle-de-las-coronas', [column, row + 1, 3, 173 - row], [[column, row + 4, 3, 2]]);
addStreet('yermo-acceso-del-convoy', [500, 144, 3, 29], [[500, 157, 3, 2]]);
addStreet('yermo-enlace-al-taller', [501, 143, 19, 3]);
addStreet('yermo-acceso-de-servicio', [518, 144, 3, 29], [[518, 156, 3, 2]]);
addStreet('poligono-entrada-de-carga', [192, 269, 4, 27], [[192, 283, 4, 2]]);
addStreet('poligono-carril-de-naves', [158, 268, 142, 3]);

const taken = new Set([...zone.props.map(p => p.at), ...positions].map(p => p.join(',')));
const noProp = rect => zone.buildings.some(b => overlap(rect, b.rect)) || zone.blocks.some(b => overlap(rect, b.rect));
const coveredRoads = patches.filter(g => g.street && g.type === 'asphalt').map(g => g.rect);
function propSpace(at) {
  return !taken.has(at.join(',')) && !noProp(pointRect(at)) &&
    groundAllowed(pointRect(at), streetTypes) && !coveredRoads.some(r => contains(r, at));
}
const streetFurniture = new Set(['bench', 'planter', 'jersey', 'lamp', 'hydrant', 'plant', 'palm', 'wreck', 'barrel', 'dumpster', 'crate']);
for (const p of zone.props) {
  if (!coveredRoads.some(r => contains(r, p.at))) continue;
  if (!streetFurniture.has(p.type)) throw new Error('El trazado se cruza con ' + p.type + ' en ' + p.at.join(','));
  const nearby = [];
  for (let d = 1; d <= 6; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const dy = d - Math.abs(dx);
      nearby.push([p.at[0] + dx, p.at[1] + dy], [p.at[0] + dx, p.at[1] - dy]);
    }
  }
  const at = nearby.find(propSpace);
  if (!at) throw new Error('Sin espacio en el arcén para ' + p.type + ' en ' + p.at.join(','));
  p.at = at;
  taken.add(at.join(','));
}
function prop(type, at, color) {
  if (!propSpace(at)) return;
  taken.add(at.join(','));
  props.push({ type, at, blocking: false, color });
}

for (const { garden: [x, y, w, h], villa } of newYards) {
  prop('palm', [x, y + 1], '#5b9a6b');
  prop('palm', [x + w - 1, y + h - 2], '#5b9a6b');
  prop('planter', [x + 1, y + h - 1], '#63a875');
  prop('bench', [x + w - 2, y + h - 1], '#d9bc9a');
  prop('lamp', [villa[0], villa[1] + villa[3] + 1], '#ffdb9a');
}

for (const b of zone.buildings) {
  if (!['ruina', 'industrial'].includes(b.urban.facade) || b.sign) continue;
  const [x, y, w, h] = b.rect, n = hash(b.id);
  if (n % 3) continue;
  const strip = [x, y + h, Math.min(w + 2, 10), 2];
  if (groundAllowed(strip, streetTypes) && !reserved.some(r => overlap(strip, r)) &&
      !coveredRoads.some(r => overlap(strip, r)) && !noProp(strip)) {
    patches.push({ type: districtOf(b.rect) === 'yermo' ? 'sand' : n % 2 ? 'dirt' : 'gravel', rect: strip });
  }
  const kinds = ['wreck', 'barrel', 'dumpster', 'trash', 'crate', 'pipe'];
  prop(kinds[n % kinds.length], [x + 1, y + h + 1], ['#736658', '#725644', '#665b53'][n % 3]);
  if (n % 4 === 0) prop('plant', [x + w, y + h], '#67613e');
}
zone.ground.push(...patches);
zone.props.push(...props);
writeFileSync(output, JSON.stringify(zone, null, 1) + '\n');
console.log(`${zone.buildings.length} edificios, ${newYards.length} fincas, ${patches.filter(g => g.type === 'asphalt').length} calles, ${props.length} elementos de entorno.`);
