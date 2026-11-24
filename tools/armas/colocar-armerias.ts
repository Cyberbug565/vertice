// v0.44 · Pone en la ciudad las dos armerías nuevas: crea su interior y su puerta en una fachada libre del barrio (una
// acera con el edificio al norte, como el resto de portales), cerca del punto seguro del distrito. Idempotente.
// Uso: npx tsx tools/armas/colocar-armerias.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildZoneGrid, ZoneSchema, GROUND_TYPES } from '@vertice/shared';

const CITY = 'content/zones/vertice.json';
const raw = JSON.parse(readFileSync(CITY, 'utf8'));
const z = ZoneSchema.parse(raw);
const g = buildZoneGrid(z), W = g.w, H = g.h;
const isB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g.buildingAt[y * W + x] >= 0;
const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g.walk[y * W + x] === 1;
const road = (x: number, y: number) => ['asphalt', 'crosswalk'].includes(GROUND_TYPES[g.ground[y * W + x]]);
const used: [number, number][] = [...raw.doors.map((d: any) => d.at), ...raw.objects.map((o: any) => o.at), ...raw.props.map((p: any) => p.at)];

const NEW = [
  { id: 'armeria-precision', name: 'Precisión Cívica', district: 'colinas', sign: 'ARMERÍA', color: '#43c8ff', wall: '#2a3446', base: 'tile', from: 'armeria-int', desk: 'Mostrador de Precisión Cívica', barrio: 'Colinas' },
  { id: 'taller-brecha', name: 'El Taller de Brecha', district: 'arrabal', sign: 'TALLER', color: '#ff3fa4', wall: '#22161c', base: 'metal', from: 'armeria-callejon-int', desk: 'Banco de Brecha', barrio: 'El Arrabal' },
];
for (const s of NEW) {
  const zid = `${s.id}-int`, doorId = `puerta-${zid}`;
  let door = raw.doors.find((d: any) => d.id === doorId);
  if (!door) {
    const d = z.districts.find((x) => x.id === s.district)!;
    const [sx, sy] = d.safePoint, [dx, dy, dw, dh] = d.rect;
    let best: [number, number] | null = null, bestD = Infinity;
    for (let y = dy + 1; y < dy + dh - 1; y++) for (let x = dx + 1; x < dx + dw - 1; x++) {
      if (!walk(x, y) || road(x, y) || !isB(x, y - 1) || !walk(x, y + 1) || isB(x - 1, y) || isB(x + 1, y)) continue;
      if (used.some(([ux, uy]) => Math.abs(ux - x) + Math.abs(uy - y) < 4)) continue;
      const dd = Math.hypot(x - sx, y - sy);
      if (dd > 6 && dd < bestD) { bestD = dd; best = [x, y]; }
    }
    if (!best) throw new Error(`sin hueco para ${s.id}`);
    door = { id: doorId, name: s.name, at: best, to: { zone: zid, at: [9, 4] }, danger: 'public', sign: s.sign, signColor: s.color, signIcon: 'diana' };
    raw.doors.push(door); used.push(best);
    console.log(`${s.name}: puerta en ${best} (${s.district}, a ${bestD.toFixed(1)} del punto seguro)`);
  }
  const file = `content/zones/${zid}.json`;
  if (!existsSync(file)) {
    const base = JSON.parse(readFileSync(`content/zones/${s.from}.json`, 'utf8'));
    const inner = { ...base, id: zid, name: s.name, wallColor: s.wall, base: s.base,
      doors: [{ id: `salida-${zid}`, name: `Salida a la calle (${s.barrio})`, at: [11, 4], to: { zone: 'vertice', at: [door.at[0], door.at[1] + 1] }, danger: 'public' }],
      objects: [{ id: `mostrador-${s.id}`, name: s.desk, at: [7, 4], kind: 'shop', shop: s.id }] };
    writeFileSync(file, JSON.stringify(inner, null, 2) + '\n');
  }
}
writeFileSync(CITY, JSON.stringify(raw, null, 1) + '\n');
