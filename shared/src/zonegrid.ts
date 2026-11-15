// Rasteriza la definición de una zona a rejillas de suelo y colisión (unidades de mundo = losetas).
import { BLOCKING_GROUND, GROUND_TYPES, type DangerLevel, type ZoneDef } from './content-schema.js';

export interface ZoneGrid {
  def: ZoneDef;
  w: number;
  h: number;
  ground: Uint8Array; // índice en GROUND_TYPES
  walk: Uint8Array; // 1 = transitable
  danger: Uint8Array; // 0 protegida, 1 pública, 2 disputada
  buildingAt: Int16Array; // índice de edificio o -1
}

const DANGER_IDX: Record<DangerLevel, number> = { protected: 0, public: 1, disputed: 2 };
export const DANGER_FROM_IDX: DangerLevel[] = ['protected', 'public', 'disputed'];

function fillRect(arr: { [i: number]: number }, w: number, h: number, r: readonly number[], v: number) {
  const [x0, y0, rw, rh] = r;
  for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++)
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) arr[y * w + x] = v;
}

export function buildZoneGrid(def: ZoneDef): ZoneGrid {
  const w = def.width, h = def.height, n = w * h;
  const ground = new Uint8Array(n).fill(GROUND_TYPES.indexOf(def.base));
  for (const g of def.ground) fillRect(ground, w, h, g.rect, GROUND_TYPES.indexOf(g.type));
  const walk = new Uint8Array(n);
  for (let i = 0; i < n; i++) walk[i] = BLOCKING_GROUND.has(GROUND_TYPES[ground[i]]) ? 0 : 1;
  const buildingAt = new Int16Array(n).fill(-1);
  def.buildings.forEach((b, bi) => { fillRect(walk, w, h, b.rect, 0); fillRect(buildingAt, w, h, b.rect, bi); });
  for (const b of def.blocks) fillRect(walk, w, h, b.rect, 0);
  for (const p of def.props) if (p.blocking) walk[p.at[1] * w + p.at[0]] = 0;
  for (const o of def.objects) walk[o.at[1] * w + o.at[0]] = 0;
  if (def.kind === 'interior') {
    // Muros perimetrales: fila y=0 y columna x=0 son pared; el resto del borde también bloquea salvo puertas.
    for (let x = 0; x < w; x++) { walk[x] = 0; walk[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { walk[y * w] = 0; walk[y * w + w - 1] = 0; }
  }
  for (const d of def.doors) walk[d.at[1] * w + d.at[0]] = 1;
  const danger = new Uint8Array(n).fill(DANGER_IDX[def.danger]);
  for (const a of def.dangerAreas) fillRect(danger, w, h, a.rect, DANGER_IDX[a.level]);
  return { def, w, h, ground, walk, danger, buildingAt };
}

export function isWalkable(g: ZoneGrid, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return false;
  return g.walk[ty * g.w + tx] === 1;
}

export function dangerAt(g: ZoneGrid, x: number, y: number): DangerLevel {
  const tx = Math.max(0, Math.min(g.w - 1, Math.floor(x))), ty = Math.max(0, Math.min(g.h - 1, Math.floor(y)));
  return DANGER_FROM_IDX[g.danger[ty * g.w + tx]];
}

export function sectorOf(g: ZoneGrid, x: number, y: number): { id: string; name: string } {
  const cs = g.def.chunkSize;
  const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
  const s = g.def.sectors.find((s) => s.chunk[0] === cx && s.chunk[1] === cy);
  return { id: `${g.def.id}:${cx},${cy}`, name: s ? s.name : g.def.name };
}

/** Busca la loseta transitable más cercana dentro de un radio (para clics sobre edificios u objetos). */
export function nearestWalkable(g: ZoneGrid, x: number, y: number, maxR = 3): { x: number; y: number } | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (isWalkable(g, x, y)) return { x, y };
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cx = tx + dx, cy = ty + dy;
      if (!isWalkable(g, cx, cy)) continue;
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d < bd) { bd = d; best = { x: cx + 0.5, y: cy + 0.5 }; }
    }
    if (best) return best;
  }
  return null;
}
