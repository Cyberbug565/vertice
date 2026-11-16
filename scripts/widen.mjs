// Ensanchado de calles (v0.4): inserta columnas y filas copiando la última loseta de cada calle,
// de modo que las avenidas pasan a tener varios carriles. Las coordenadas de todo lo que hay en el
// distrito (edificios, puertas, objetos, PNJ…) se desplazan con la misma función.

// Para cada distrito: inserciones [tras la loseta, n] en X y en Y.
const CITY = { x: [[21, 3], [49, 4], [73, 3]], y: [[13, 3], [33, 4], [51, 3]] };
export const WIDEN = {
  ferro: { x: [[12, 1], [32, 3], [52, 1], [74, 3], [90, 1]], y: [[22, 3], [46, 3]] },
  cenit: CITY, colinas: CITY, 'neon-rojo': CITY, forja: CITY, arrabal: CITY,
  yermo: { x: [], y: [[49, 4]] },
};

const shift = (ins, v) => { let s = 0; for (const [a, n] of ins) if (Math.floor(v) > a) s += n; return v + s; };
const extra = (ins, e) => ins.reduce((s, [a, n]) => s + (a === e ? n : 0), 0);
export const mapPoint = (zone, x, y) => { const m = WIDEN[zone]; return m ? [shift(m.x, x), shift(m.y, y)] : [x, y]; };
const mapRect = (m, [x, y, w, h]) => {
  const x0 = shift(m.x, x), y0 = shift(m.y, y);
  const x1 = shift(m.x, x + w - 1) + extra(m.x, x + w - 1), y1 = shift(m.y, y + h - 1) + extra(m.y, y + h - 1);
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
};

/** Ensancha un distrito (en coordenadas antiguas) y devuelve una copia en las nuevas. */
export function widenZone(z) {
  const m = WIDEN[z.id];
  if (!m) return z;
  const P = ([x, y, ...rest]) => [shift(m.x, x), shift(m.y, y), ...rest];
  const R = (r) => mapRect(m, r);
  const o = structuredClone(z);
  o.width = z.width + m.x.reduce((s, [, n]) => s + n, 0);
  o.height = z.height + m.y.reduce((s, [, n]) => s + n, 0);
  for (const g of o.ground ?? []) g.rect = R(g.rect);
  for (const b of o.blocks ?? []) b.rect = R(b.rect);
  for (const b of o.buildings ?? []) b.rect = R(b.rect);
  for (const p of o.props ?? []) p.at = P(p.at);
  for (const d of o.doors ?? []) d.at = P(d.at);
  for (const ob of o.objects ?? []) ob.at = P(ob.at);
  for (const s of o.skybridges ?? []) { s.from = P(s.from); s.to = P(s.to); }
  for (const a of o.dangerAreas ?? []) a.rect = R(a.rect);
  for (const g of o.gangs ?? []) if (g.area) g.area = P(g.area);
  if (o.waypoints) o.waypoints = o.waypoints.map(P);
  if (o.safePoint) o.safePoint = P(o.safePoint);
  if (o.spawn) o.spawn = P(o.spawn);
  return o;
}

/** Recorre cualquier dato y traduce las coordenadas ligadas a un distrito ensanchado ({zone, at}, {zone, area}, {zone, moveTo}). */
export function remapRefs(node, zone = null) {
  if (Array.isArray(node)) { for (const n of node) remapRefs(n, zone); return; }
  if (!node || typeof node !== 'object') return;
  const z = typeof node.zone === 'string' ? node.zone : zone;
  if (z && WIDEN[z]) {
    for (const k of ['at', 'moveTo', 'area']) if (Array.isArray(node[k]) && typeof node[k][0] === 'number') { const [x, y] = mapPoint(z, node[k][0], node[k][1]); node[k] = [x, y, ...node[k].slice(2)]; }
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && k !== 'at' && k !== 'area' && k !== 'moveTo') remapRefs(v, z);
}
