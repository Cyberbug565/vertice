// v0.19 · Ciudad transitable: los canales interiores (agua oscura que cortaba los callejones de la Marea) pasan a ser
// paseos peatonales, las avenidas anchas ganan acera, y las calles largas llevan pasos de peatones a mitad de manzana
// (con semáforo: ver shared/src/traffic.ts). Idempotente: se puede volver a pasar sin duplicar nada.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const over = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

export function zonesV19(C) {
  const file = join(C, 'zones', 'vertice.json');
  const z = JSON.parse(readFileSync(file, 'utf8'));
  if (z.v19) return { canals: 0, widened: 0, crossings: 0, moved: 0 };
  // 1) Canales interiores → paseo (el puerto del noroeste, en el borde del mapa, sigue siendo agua).
  let canals = 0;
  for (const g of z.ground) {
    if ((g.type === 'water' || g.type === 'bridge') && g.rect[0] > 0 && !(g.rect[0] <= 8 && g.rect[1] <= 8 && g.rect[3] >= 20)) {
      if (g.type === 'water') canals++;
      g.type = 'plaza';
    }
  }
  // Sus barandillas ya no hacen falta.
  z.blocks = z.blocks.filter((b) => !(b.type === 'barrier' && b.rect[1] === 130));
  // 2) Avenidas de 10 u 11 casillas: una casilla de acera más a cada lado.
  let widened = 0;
  const roads = z.ground.filter((g) => g.type === 'asphalt');
  const extra = [];
  for (const g of roads) {
    const [x, y, w, h] = g.rect, horiz = w >= h, width = horiz ? h : w;
    if (width < 10) continue;
    const strips = horiz ? [[x, y, w, 1], [x, y + h - 1, w, 1]] : [[x, y, 1, h], [x + w - 1, y, 1, h]];
    g.rect = horiz ? [x, y + 1, w, h - 2] : [x + 1, y, w - 2, h];
    for (const s of strips) extra.push({ type: 'sidewalk', rect: s });
    // Los pasos de peatones de esa avenida se recortan a la nueva calzada.
    for (const c of z.ground) if (c.type === 'crosswalk' && over(c.rect, [x, y, w, h])) {
      const [cx, cy, cw, ch] = c.rect;
      c.rect = horiz ? [cx, Math.max(cy, y + 1), cw, Math.min(cy + ch, y + h - 1) - Math.max(cy, y + 1)] : [Math.max(cx, x + 1), cy, Math.min(cx + cw, x + w - 1) - Math.max(cx, x + 1), ch];
    }
    widened++;
  }
  // 3) Pasos de peatones a mitad de las calles largas (cada ~48 casillas, lejos de los cruces y de otros pasos).
  let crossings = 0;
  const cws = () => z.ground.filter((g) => g.type === 'crosswalk');
  for (const g of z.ground.filter((gg) => gg.type === 'asphalt')) {
    const [x, y, w, h] = g.rect, horiz = w >= h, len = horiz ? w : h;
    if (len < 60) continue;
    for (let t = 30; t < len - 24; t += 48) {
      const r = horiz ? [x + t, y, 2, h] : [x, y + t, w, 2];
      // Ni encima de otra calzada (cruce) ni junto a otro paso.
      const pad = horiz ? [r[0] - 8, r[1], 18, r[3]] : [r[0], r[1] - 8, r[2], 18];
      if (cws().some((c) => over(c.rect, pad))) continue;
      if (z.ground.some((o) => o !== g && o.type === 'asphalt' && over(o.rect, r))) continue;
      extra.push({ type: 'crosswalk', rect: r });
      crossings++;
    }
  }
  z.ground.push(...extra);
  // 4) Puntos de paseo de los transeúntes: los que caían en la calzada pasan a la acera más cercana.
  const W = z.width, H = z.height, road = new Uint8Array(W * H), solid = new Uint8Array(W * H);
  const fill = (arr, r) => { for (let y = Math.max(0, r[1]); y < Math.min(H, r[1] + r[3]); y++) for (let x = Math.max(0, r[0]); x < Math.min(W, r[0] + r[2]); x++) arr[y * W + x] = 1; };
  // (En orden: cada rectángulo de suelo pisa a los anteriores.)
  for (const g of z.ground) { const v = g.type === 'asphalt' || g.type === 'crosswalk' ? 1 : 0; for (let y = Math.max(0, g.rect[1]); y < Math.min(H, g.rect[1] + g.rect[3]); y++) for (let x = Math.max(0, g.rect[0]); x < Math.min(W, g.rect[0] + g.rect[2]); x++) road[y * W + x] = v; }
  for (const g of z.ground) if (g.type === 'water') fill(solid, g.rect);
  for (const b of z.buildings) fill(solid, b.rect);
  for (const b of z.blocks) fill(solid, b.rect);
  for (const p of z.props) if (p.blocking !== false) solid[p.at[1] * W + p.at[0]] = 1;
  for (const o of z.objects) solid[o.at[1] * W + o.at[0]] = 1;
  let moved = 0;
  const fix = (wp) => {
    if (!road[wp[1] * W + wp[0]]) return wp;
    for (let r = 1; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = wp[0] + dx, y = wp[1] + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (!road[i] && !solid[i]) { moved++; return [x, y]; }
    }
    return wp;
  };
  z.waypoints = z.waypoints.map(fix);
  for (const d of z.districts ?? []) d.waypoints = d.waypoints.map(fix);
  z.v19 = true;
  writeFileSync(file, JSON.stringify(z, null, 1) + '\n');
  return { canals, widened, crossings, moved };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = zonesV19(join(process.cwd(), 'content'));
  console.log(`v0.19: ${r.canals} canales convertidos en paseo, ${r.widened} avenidas con acera más ancha y ${r.crossings} pasos de peatones nuevos; ${r.moved} puntos de paseo llevados a la acera.`);
}
