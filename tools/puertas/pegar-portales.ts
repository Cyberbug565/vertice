// v0.36 · Pega a su edificio los portales y puertas de la calle que quedaron sueltos en la acera (la puerta 3D se encaja
// en la fachada, así que la casilla de la puerta tiene que tocar un edificio). Uso: npx tsx tools/puertas/pegar-portales.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { buildZoneGrid, ZoneSchema, GROUND_TYPES } from '@vertice/shared';

const FILE = 'content/zones/vertice.json';
const raw = JSON.parse(readFileSync(FILE, 'utf8'));
const z = ZoneSchema.parse(raw);
const g = buildZoneGrid(z);
const W = g.w, H = g.h;
const isB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g.buildingAt[y * W + x] >= 0;
const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g.walk[y * W + x] === 1;
const road = (x: number, y: number) => GROUND_TYPES[g.ground[y * W + x]] === 'asphalt';
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const touches = (x: number, y: number) => DIRS.some(([dx, dy]) => isB(x + dx, y + dy));
const taken = new Set<string>();
for (const d of raw.doors) taken.add(`${d.at[0]},${d.at[1]}`);
for (const o of raw.objects) taken.add(`${o.at[0]},${o.at[1]}`);
for (const p of raw.props) if (p.blocking !== false) taken.add(`${p.at[0]},${p.at[1]}`);
let moved = 0;
function fix(item: { id: string; at: [number, number] }) {
  const [sx, sy] = item.at;
  if (touches(sx, sy)) return;
  const seen = new Set([`${sx},${sy}`]); let q: [number, number][] = [[sx, sy]];
  for (let r = 0; r < 18 && q.length; r++) {
    const next: [number, number][] = [];
    const hits = q.filter(([x, y]) => walk(x, y) && !road(x, y) && touches(x, y) && !taken.has(`${x},${y}`));
    if (hits.length) {
      const [x, y] = hits.sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy))[0];
      taken.delete(`${sx},${sy}`); taken.add(`${x},${y}`);
      console.log(`${item.id}: ${sx},${sy} → ${x},${y}`);
      item.at = [x, y]; moved++; return;
    }
    for (const [x, y] of q) for (const [dx, dy] of DIRS) { const k = `${x + dx},${y + dy}`; if (!seen.has(k) && walk(x + dx, y + dy)) { seen.add(k); next.push([x + dx, y + dy]); } }
    q = next;
  }
  console.warn(`${item.id}: sin fachada cerca de ${sx},${sy}`);
}
for (const o of raw.objects) if (o.kind === 'housing') fix(o);
for (const d of raw.doors) if (!/^Escaleras/.test(d.name)) fix(d);
writeFileSync(FILE, JSON.stringify(raw, null, 1) + '\n');
console.log(`${moved} puertas pegadas a su fachada.`);
