import type { CyberwareDef } from './content-schema.js';
import type { ZoneGrid } from './zonegrid.js';

export interface Sight { range: number; degrees: number }
export const UNAIDED_SIGHT: Sight = { range: 16, degrees: 140 };

export function installedSight(implants: readonly { def: string; location: string }[], catalogue: ReadonlyMap<string, CyberwareDef>): Sight {
  let { range, degrees } = UNAIDED_SIGHT;
  for (const item of implants) {
    const optics = item.location === 'installed' && catalogue.get(item.def)?.effects.sight;
    if (optics) { range = Math.max(range, optics.range); degrees = Math.max(degrees, optics.degrees); }
  }
  return { range, degrees };
}

// DDA en unidades de loseta. En una esquina exacta se comprueban ambas paredes laterales.
export function sightRay(g: ZoneGrid, x: number, y: number, dx: number, dy: number, range: number): number {
  let col = Math.floor(x), row = Math.floor(y);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx ? 1 / Math.abs(dx) : Infinity, stepY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = dx ? (dx > 0 ? col + 1 - x : x - col) * stepX : Infinity;
  let nextY = dy ? (dy > 0 ? row + 1 - y : y - row) * stepY : Infinity;
  const solid = (a: number, b: number) => a < 0 || b < 0 || a >= g.w || b >= g.h || !!g.opaque[b * g.w + a];
  while (Math.min(nextX, nextY) < range) {
    const t = Math.min(nextX, nextY);
    if (Math.abs(nextX - nextY) < 1e-8 && (solid(col + sx, row) || solid(col, row + sy))) return t;
    if (nextX <= t + 1e-8) { col += sx; nextX += stepX; }
    if (nextY <= t + 1e-8) { row += sy; nextY += stepY; }
    if (solid(col, row)) return t;
  }
  return range;
}

export function canSee(g: ZoneGrid, x: number, y: number, facing: number, sight: Sight, tx: number, ty: number): boolean {
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
  if (d > sight.range) return false;
  if (d < 0.0001) return true;
  const a = facing * Math.PI / 4;
  if (sight.degrees < 360 && (dx * Math.cos(a) + dy * Math.sin(a)) / d < Math.cos(sight.degrees * Math.PI / 360)) return false;
  return sightRay(g, x, y, dx / d, dy / d, d) >= d - 1e-7;
}

/** En esta proyección, el rayo de la cámara sube una unidad al avanzar (+1,+1). */
export function coversActor(rect: readonly number[], height: number, x: number, y: number): boolean {
  const [bx, by, w, h] = rect;
  const enter = Math.max(0, bx - x, by - y);
  const exit = Math.min(bx + w - x, by + h - y, height - 0.45);
  return exit > enter + 0.01;
}
