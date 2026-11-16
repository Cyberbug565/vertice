// v0.5 · Ciudad única: escala ×1,33 de cada distrito (calles y edificios más grandes) y fusión de todos los
// exteriores en una sola zona «vertice», unidos por avenidas de circunvalación. Todo lo que apunta a un distrito
// en coordenadas de la v0.4 ({zone, at}) se traduce a la zona única.

export const GRID = { colinas: [1, 0], 'neon-rojo': [2, 0], ferro: [0, 1], cenit: [1, 1], forja: [2, 1], yermo: [3, 1], arrabal: [0, 2] };
/** Celdas sin distrito: zonas abandonadas y muelles viejos (bases de bandas y narcos). */
export const WASTE = {
  'muelles-viejos': { cell: [0, 0], name: 'Muelles Viejos', color: '#4a7a9a', desc: 'Dársenas abandonadas y almacenes oxidados. Aquí descarga el Cártel de la Marea.', base: 'deck', gangs: [{ faction: 'marea', count: 6 }] },
  'descampado-norte': { cell: [3, 0], name: 'Descampado Norte', color: '#8a7a5a', desc: 'Solares, chabolas y ruinas de una antigua refinería. Territorio de saqueadores.', base: 'dirt', gangs: [{ faction: 'saqueadores', count: 4 }] },
  poligono: { cell: [1, 2], name: 'Polígono Abandonado', color: '#7a5a5a', desc: 'Naves industriales cerradas. Las Hojas Rojas guardan aquí lo que no quieren que vea la PCV.', base: 'gravel', gangs: [{ faction: 'hojas-rojas', count: 5 }] },
  vertedero: { cell: [2, 2], name: 'El Vertedero', color: '#6a7a4a', desc: 'Montañas de chatarra y talleres ilegales de los Chatarreros.', base: 'dirt', gangs: [{ faction: 'chatarreros', count: 5 }] },
  'cementerio-trenes': { cell: [3, 2], name: 'Cementerio de Trenes', color: '#5a5a6a', desc: 'Vagones oxidados y túneles de mantenimiento. Base de Los Engranajes.', base: 'gravel', gangs: [{ faction: 'engranajes', count: 5 }] },
};
export const CW = 150, CH = 112, M = 8;
export const WORLD_W = 4 * CW + M, WORLD_H = 3 * CH + M;
const V04 = { ferro: [105, 70], cenit: [106, 74], colinas: [106, 74], 'neon-rojo': [106, 74], forja: [106, 74], arrabal: [106, 74], yermo: [128, 100] };

const shift = (ins, v) => { let s = 0; for (const [a, n] of ins) if (Math.floor(v) > a) s += n; return v + s; };
const extra = (ins, e) => ins.reduce((s, [a, n]) => s + (a === e ? n : 0), 0);
const every3 = (n) => { const out = []; for (let k = 2; k < n - 1; k += 3) out.push([k, 1]); return out; };
const SCALE = Object.fromEntries(Object.entries(V04).map(([id, [w, h]]) => [id, id === 'yermo' ? { x: [], y: [] } : { x: every3(w), y: every3(h) }]));
export const scaledSize = (id) => { const [w, h] = V04[id]; return [w + SCALE[id].x.length, h + SCALE[id].y.length]; };
/** Esquina superior izquierda de cada distrito en la ciudad única (centrado en su celda). */
export const OFFSET = Object.fromEntries(Object.entries(GRID).map(([id, [gx, gy]]) => {
  const [w, h] = scaledSize(id);
  return [id, [gx * CW + M + Math.floor((CW - M - w) / 2), gy * CH + M + Math.floor((CH - M - h) / 2)]];
}));
export const districtRect = (id) => { const [w, h] = scaledSize(id); const [ox, oy] = OFFSET[id]; return [ox, oy, w, h]; };
export const wasteRect = (id) => { const [gx, gy] = WASTE[id].cell; return [gx * CW + M, gy * CH + M, CW - M, CH - M]; };

/** Punto de un distrito (coordenadas v0.4) en la ciudad única. */
export function toCity(zone, x, y) {
  const s = SCALE[zone], [ox, oy] = OFFSET[zone];
  return [shift(s.x, x) + ox, shift(s.y, y) + oy];
}
const scaleRect = (s, [x, y, w, h]) => {
  const x0 = shift(s.x, x), y0 = shift(s.y, y);
  const x1 = shift(s.x, x + w - 1) + extra(s.x, x + w - 1), y1 = shift(s.y, y + h - 1) + extra(s.y, y + h - 1);
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
};

/** Escala un distrito (coordenadas v0.4 → coordenadas propias ×1,33). Las coordenadas siguen siendo locales. */
export function scaleDistrict(z) {
  const s = SCALE[z.id];
  const P = ([x, y, ...rest]) => [shift(s.x, x), shift(s.y, y), ...rest];
  const R = (r) => scaleRect(s, r);
  const o = structuredClone(z);
  [o.width, o.height] = scaledSize(z.id);
  for (const g of o.ground ?? []) g.rect = R(g.rect);
  for (const b of o.blocks ?? []) b.rect = R(b.rect);
  for (const b of o.buildings ?? []) { b.rect = R(b.rect); b.height = Math.round(b.height * 1.25); }
  for (const p of o.props ?? []) p.at = P(p.at);
  for (const d of o.doors ?? []) d.at = P(d.at);
  for (const ob of o.objects ?? []) ob.at = P(ob.at);
  for (const k of o.skybridges ?? []) { k.from = P(k.from); k.to = P(k.to); }
  for (const a of o.dangerAreas ?? []) a.rect = R(a.rect);
  for (const g of o.gangs ?? []) if (g.area) { const [x, y] = P(g.area); g.area = [x, y, Math.round(g.area[2] * 1.33)]; }
  o.waypoints = (o.waypoints ?? []).map(P);
  o.safePoint = P(o.safePoint);
  return o;
}

/** Traduce cualquier dato que apunte a un distrito ({zone, at|moveTo|area}) a la zona única. Idempotente: tras traducir, la zona es «vertice». */
export function remapToCity(node, parentZone = null) {
  if (Array.isArray(node)) { for (const n of node) remapToCity(n, parentZone); return; }
  if (!node || typeof node !== 'object') return;
  const own = typeof node.zone === 'string' ? node.zone : null;
  const z = own ?? parentZone;
  if (z && GRID[z]) {
    for (const k of ['at', 'moveTo', 'area']) if (Array.isArray(node[k]) && typeof node[k][0] === 'number') {
      const [x, y] = toCity(z, node[k][0], node[k][1]);
      node[k] = k === 'area' ? [x, y, Math.round(node[k][2] * 1.33)] : [x, y, ...node[k].slice(2)];
    }
    if (own) node.zone = 'vertice';
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && !['at', 'area', 'moveTo'].includes(k)) remapToCity(v, own ? null : parentZone);
}
