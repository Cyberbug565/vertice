// v0.19 · Semáforos de la ciudad: un ciclo común (desfasado por barrios) que comparten el servidor (los peatones esperan
// en el paso de peatones) y el cliente (los coches paran en la línea de detención y se ven las luces).
// Las calzadas horizontales (eje 'h', a lo largo de x) y verticales ('v', a lo largo de y) se alternan:
//   h: verde 1–12 s · ámbar 12–15 s · rojo el resto     v: verde 16–27 s · ámbar 27–30 s · rojo el resto
// (con un segundo de todo en rojo entre medias). Un peatón que cruza una calzada 'h' camina en y: puede pasar mientras esa
// calzada está en rojo (verde de 16 a 26 s, parpadeo hasta 29 s); el que cruza una 'v' pasa de 1 a 10 s (parpadeo hasta 14 s).
import type { ZoneGrid } from './zonegrid.js';
import { GROUND_TYPES } from './content-schema.js';

export type LightColor = 'verde' | 'ambar' | 'rojo';
export type RoadAxis = 'h' | 'v';
export const LIGHT_CYCLE_MS = 30000;

/** Desfase del ciclo según el barrio (bloques de 48 casillas), para que no cambie toda la ciudad a la vez. */
export function lightOffset(x: number, y: number) { return (((Math.floor(x / 48) * 3 + Math.floor(y / 48) * 5) % 4) + 4) % 4 * 7500; }
const phase = (now: number, x: number, y: number) => (((now + lightOffset(x, y)) % LIGHT_CYCLE_MS) + LIGHT_CYCLE_MS) % LIGHT_CYCLE_MS / 1000;

/** Color del semáforo de los coches que circulan por una calzada del eje dado, en ese punto. */
export function carLight(now: number, x: number, y: number, axis: RoadAxis): LightColor {
  const t = phase(now, x, y);
  if (axis === 'h') return t >= 1 && t < 12 ? 'verde' : t >= 12 && t < 15 ? 'ambar' : 'rojo';
  return t >= 16 && t < 27 ? 'verde' : t >= 27 && t < 30 ? 'ambar' : 'rojo';
}
/** Semáforo de peatones para cruzar una calzada del eje dado: 'verde' (pasa), 'ambar' (parpadea: no empieces a cruzar), 'rojo'. */
export function walkLight(now: number, x: number, y: number, roadAxis: RoadAxis): LightColor {
  const t = phase(now, x, y);
  if (roadAxis === 'h') return t >= 16 && t < 26 ? 'verde' : t >= 26 && t < 29 ? 'ambar' : 'rojo';
  return t >= 1 && t < 10 ? 'verde' : t >= 10 && t < 14 ? 'ambar' : 'rojo';
}

/** Eje de la calzada en cada casilla (0 nada, 1 'h', 2 'v', 3 cruce) y si es paso de peatones. Se calcula una vez por zona. */
export interface RoadMap { axis: Uint8Array; crossing: Uint8Array }
const cache = new WeakMap<ZoneGrid, RoadMap>();
export function roadMap(g: ZoneGrid): RoadMap {
  let m = cache.get(g);
  if (m) return m;
  const axis = new Uint8Array(g.w * g.h), crossing = new Uint8Array(g.w * g.h);
  const AS = GROUND_TYPES.indexOf('asphalt'), CW = GROUND_TYPES.indexOf('crosswalk');
  for (const gr of g.def.ground) {
    if (gr.type !== 'asphalt') continue;
    const [x0, y0, w, h] = gr.rect, bit = w >= h ? 1 : 2;
    for (let y = Math.max(0, y0); y < Math.min(g.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x0 + w); x++) { const i = y * g.w + x; if (g.ground[i] === AS || g.ground[i] === CW) axis[i] |= bit; }
  }
  for (const gr of g.def.ground) {
    if (gr.type !== 'crosswalk') continue;
    const [x0, y0, w, h] = gr.rect;
    for (let y = Math.max(0, y0); y < Math.min(g.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x0 + w); x++) {
      const i = y * g.w + x; if (g.ground[i] !== CW) continue; crossing[i] = 1;
      // Un paso más alto que ancho cruza una calzada horizontal (y al revés).
      if (!axis[i]) axis[i] = h > w ? 1 : 2;
    }
  }
  m = { axis, crossing }; cache.set(g, m);
  return m;
}
/** Eje de calzada que se cruza al moverse en (dx, dy) entrando en la casilla (x, y), o null si no es calzada. */
export function crossingAxis(g: ZoneGrid, x: number, y: number, dx: number, dy: number): RoadAxis | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return null;
  const a = roadMap(g).axis[ty * g.w + tx];
  if (!a) return null;
  if (a === 1) return 'h'; if (a === 2) return 'v';
  return Math.abs(dy) >= Math.abs(dx) ? 'h' : 'v'; // en un cruce: la calzada que atraviesas va perpendicular a tu marcha
}
