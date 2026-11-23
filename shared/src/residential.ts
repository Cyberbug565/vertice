// v0.35 · Edificios de viviendas por dentro. El portal de la calle es una puerta que da al vestíbulo; desde ahí se sube
// por la escalera planta a planta y en cada rellano está la puerta de la vivienda de esa planta. Cada planta es una zona
// pequeña que el servidor y el cliente generan igual a partir de las viviendas del edificio (no hay que guardarla en el
// contenido). El servidor solo la crea cuando alguien entra y la borra cuando se queda vacía, así tener todos los
// portales «abiertos» no cuesta nada.
import { ZoneSchema, type HouseDef, type ZoneDef } from './content-schema.js';

export const PORTAL_W = 14;
export const PORTAL_H = 9;
/** Puerta de salida (vestíbulo) o de la vivienda (plantas), en el borde derecho como en el resto de interiores. */
export const PORTAL_DOOR: [number, number] = [PORTAL_W - 1, 4];
/** Donde apareces al entrar por la puerta de la derecha. */
export const PORTAL_IN: [number, number] = [PORTAL_W - 2, 4];
/** Escalera de subida y de bajada (en la pared del fondo). */
export const STAIRS_UP: [number, number] = [5, 0];
export const STAIRS_DOWN: [number, number] = [2, 0];

export const portalZoneId = (building: string, floor: number) => `portal:${building}:${floor}`;
export function parsePortalZone(id: string): { building: string; floor: number } | null {
  const m = /^portal:(.+):(\d+)$/.exec(id);
  return m ? { building: m[1], floor: Number(m[2]) } : null;
}
export const isPortalZone = (id: string) => id.startsWith('portal:');
const ORD = (n: number) => `${n}º`;
export const floorName = (n: number) => (n === 0 ? 'Planta baja' : `Planta ${ORD(n)}`);

interface Src { zones: readonly ZoneDef[]; houses: readonly HouseDef[] }
const WALLS = ['#2f4a5a', '#3a3450', '#45383a', '#2f4a40', '#3c3c48', '#4a4030'];
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Calle a la que da el portal (delante del timbre) y nombre del portal. */
export function portalStreet(c: Src, building: string): { zone: string; at: [number, number]; name: string } | null {
  for (const z of c.zones) {
    const o = z.objects.find((x) => x.id === building && x.kind === 'housing');
    if (o) return { zone: z.id, at: [o.at[0], o.at[1] + 1], name: o.name };
  }
  return null;
}

const cache = new WeakMap<object, Map<string, ZoneDef | null>>();
/** Definición de una planta de un portal («portal:<edificio>:<planta>», la 0 es el vestíbulo). */
export function portalZoneDef(c: Src, id: string): ZoneDef | null {
  let m = cache.get(c.houses);
  if (!m) cache.set(c.houses, (m = new Map()));
  if (m.has(id)) return m.get(id)!;
  const out = build(c, id);
  m.set(id, out);
  return out;
}

function build(c: Src, id: string): ZoneDef | null {
  const p = parsePortalZone(id);
  if (!p) return null;
  const street = portalStreet(c, p.building);
  const units = c.houses.filter((h) => h.building === p.building).sort((a, b) => a.floor - b.floor);
  if (!street || !units.length) return null;
  const top = Math.max(...units.map((h) => h.floor));
  if (p.floor < 0 || p.floor > top) return null;
  const here = units.find((h) => h.floor === p.floor);
  const k = hash(p.building);
  const wallColor = WALLS[k % WALLS.length];
  const doors: unknown[] = [];
  const objects: unknown[] = [];
  const props: unknown[] = [];
  const at = (x: number, y: number) => [x, y];
  const below = [STAIRS_UP[0], STAIRS_UP[1] + 1], above = [STAIRS_DOWN[0], STAIRS_DOWN[1] + 1];
  if (p.floor === 0) {
    doors.push({ id: `${id}:calle`, name: 'Salir a la calle', at: PORTAL_DOOR, to: { zone: street.zone, at: street.at }, danger: 'public', sign: 'SALIDA', signColor: '#7dd3a0' });
    // El portero automático y los buzones: comprar, ver quién vive aquí, llamar al timbre o entrar directo.
    objects.push({ id: p.building, name: 'Buzones y portero automático', at: at(PORTAL_W - 3, 1), kind: 'housing' });
    props.push({ type: 'plant', at: at(PORTAL_W - 2, 7) }, { type: 'bench', at: at(8, 7) }, { type: 'shelf', at: at(PORTAL_W - 5, 1), color: '#6a6a7a' });
  } else {
    doors.push({ id: `${id}:bajar`, name: `Bajar a ${floorName(p.floor - 1).toLowerCase()}`, at: STAIRS_DOWN, to: { zone: portalZoneId(p.building, p.floor - 1), at: below }, danger: 'public', sign: `▼ ${p.floor - 1 ? ORD(p.floor - 1) : 'BAJO'}`, signColor: '#9aa4ff', signIcon: 'bajar' });
    if (here) doors.push({ id: `${id}:casa`, name: `Puerta de ${here.name}`, at: PORTAL_DOOR, to: { zone: `casa:${here.id}`, at: c.zones.find((z) => z.id === here.template)?.safePoint ?? [2, 2] }, danger: 'protected', sign: `${ORD(p.floor)} · ${here.name.toUpperCase()}`.slice(0, 22), signColor: '#ffd23f' });
    props.push({ type: 'plant', at: at(PORTAL_W - 2, 1) }, { type: 'window', at: at(9, 0), blocking: false }, { type: 'neonstrip', at: at(PORTAL_W - 4, 7), blocking: false, color: '#43f3ff' });
  }
  if (p.floor < top) doors.push({ id: `${id}:subir`, name: `Subir a ${floorName(p.floor + 1).toLowerCase()}`, at: STAIRS_UP, to: { zone: portalZoneId(p.building, p.floor + 1), at: above }, danger: 'public', sign: `▲ ${ORD(p.floor + 1)}`, signColor: '#43f3ff', signIcon: 'subir' });
  return ZoneSchema.parse({
    id, name: `${street.name} · ${floorName(p.floor)}`, kind: 'interior', width: PORTAL_W, height: PORTAL_H, danger: 'public', base: 'tile', wallColor,
    doors, objects, props, waypoints: [PORTAL_IN, [7, 4], [3, 3]], safePoint: PORTAL_IN, sleepQuality: 0.35,
  });
}
