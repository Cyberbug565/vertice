import type { Content, ZoneDef } from './content-schema.js';
import { parsePortalZone, portalZoneId } from './residential.js';

type XY = [number, number];
type Rect = ZoneDef['buildings'][number]['rect'];
const directions: XY[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const STOREY_HEIGHT = 3.25;

export function edgeDirection(z: ZoneDef, at: readonly number[]): XY | undefined {
  const [x, y] = at;
  if (x === z.width - 1) return [1, 0];
  if (x === 0) return [-1, 0];
  if (y === z.height - 1) return [0, 1];
  if (y === 0) return [0, -1];
}

export interface BuildingEntrance {
  zone: string; room: string; building: number; at: XY; threshold: XY; out: XY;
  rect: Rect; private: boolean; concealed?: boolean;
}
export interface RoomFrame {
  entrance: BuildingEntrance;
  /** Rotación de la planta en cuartos de vuelta, escalas locales y altura de forjado. */
  turns: number; scale: XY; local: XY; city: XY; height: number;
}

export function rotateFloor(x: number, y: number, turns: number): XY {
  switch (turns & 3) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}
export function roomToCity(f: RoomFrame, x: number, y: number): XY {
  const [dx, dy] = rotateFloor((x - f.local[0]) * f.scale[0], (y - f.local[1]) * f.scale[1], f.turns);
  return [f.city[0] + dx, f.city[1] + dy];
}
export function cityToRoom(f: RoomFrame, x: number, y: number): XY {
  const [dx, dy] = rotateFloor(x - f.city[0], y - f.city[1], -f.turns);
  return [f.local[0] + dx / f.scale[0], f.local[1] + dy / f.scale[1]];
}

function fit(z: ZoneDef, door: ZoneDef['doors'][number], entrance: BuildingEntrance): RoomFrame | undefined {
  const localOut = edgeDirection(z, door.at);
  if (!localOut) return;
  const [ax, ay] = door.at;
  const local: XY = [ax + .5 + localOut[0] * .5, ay + .5 + localOut[1] * .5];
  const dir = (v: XY) => directions.findIndex(d => d[0] === v[0] && d[1] === v[1]);
  const turns = (dir(entrance.out) - dir(localOut) + 4) & 3;
  const [bx, by, w, d] = entrance.rect, [gx, gy] = entrance.threshold;
  const scales = [0, 1].map(i => {
    const r = rotateFloor(i ? 0 : 1, i ? 1 : 0, turns);
    const a = r[0] ? gx : gy, lo = r[0] ? bx : by, hi = r[0] ? bx + w : by + d;
    const sign = r[0] || r[1], negative = local[i], positive = (i ? z.height : z.width) - local[i];
    return Math.min(1, negative ? (sign > 0 ? a - lo : hi - a) / negative : 1,
      positive ? (sign > 0 ? hi - a : a - lo) / positive : 1);
  }) as XY;
  if (scales.some(s => s <= 0)) return;
  return { entrance, local, city: entrance.threshold, scale: scales, turns, height: 0 };
}

function entranceAt(zone: ZoneDef, room: string, at: XY, locked: boolean): BuildingEntrance | undefined {
  const [x, y] = at;
  const index = zone.buildings.findIndex(({ rect: [a, b, w, h] }) =>
    (x >= a && x < a + w && (y === b - 1 || y === b + h)) ||
    (y >= b && y < b + h && (x === a - 1 || x === a + w)));
  if (index < 0) return;
  const rect = zone.buildings[index].rect, [a, b, w, h] = rect;
  const out: XY = [x < a ? -1 : x >= a + w ? 1 : 0, y < b ? -1 : y >= b + h ? 1 : 0];
  return { zone: zone.id, room, at, building: index, rect, out,
    threshold: [x + .5 - out[0] * .5, y + .5 - out[1] * .5], private: locked };
}

function divided(e: BuildingEntrance) {
  const [x, y, w, h] = e.rect, [dx, dy] = e.out;
  const n = Math.max(1, Math.floor((dx ? w : h) * .42));
  const lower: Rect = dx ? [dx > 0 ? x + w - n : x, y, n, h] : [x, dy > 0 ? y + h - n : y, w, n];
  const upper: Rect = dx ? [dx > 0 ? x : x + n, y, w - n, h] : [x, dy > 0 ? y : y + n, w, h - n];
  const split: XY = [e.threshold[0] - dx * n, e.threshold[1] - dy * n];
  return {
    hall: { ...e, rect: lower, threshold: split, out: [-dx, -dy] as XY },
    flat: { ...e, rect: upper, threshold: split },
  };
}

/** Planos y fachadas comparten el mismo umbral; las zonas de simulación conservan su rejilla. */
export class Interiors {
  private readonly rooms = new Map<string, BuildingEntrance>();
  private readonly streets = new Map<string, Map<string, BuildingEntrance>>();
  private readonly byBuilding = new Map<string, BuildingEntrance>();
  private readonly houses: Map<string, Content['houses'][number]>;
  private readonly zones: Map<string, ZoneDef>;
  private readonly frames = new Map<string, RoomFrame | undefined>();

  constructor(c: Pick<Content, 'zones' | 'houses'>) {
    this.zones = new Map(c.zones.map(z => [z.id, z]));
    this.houses = new Map(c.houses.map(h => [h.id, h]));
    const units = new Map<string, Content['houses']>();
    for (const house of c.houses) {
      const list = units.get(house.building) ?? [];
      if (!units.has(house.building)) units.set(house.building, list);
      list.push(house);
    }
    for (const z of c.zones) {
      if (z.kind !== 'exterior') continue;
      const map = new Map<string, BuildingEntrance>();
      this.streets.set(z.id, map);
      const add = (room: string, at: XY, locked: boolean) => {
        const e = entranceAt(z, room, at, locked);
        if (!e) return;
        map.set(at.join(','), e);
        if (!this.rooms.has(room)) this.rooms.set(room, e);
        return e;
      };
      for (const door of z.doors) {
        const to = this.zones.get(door.to.zone);
        if (to?.kind !== 'interior' || to.cyber || !to.doors.some(d => d.to.zone === z.id)) continue;
        const entry = add(to.id, door.at, !!(door.hidden || to.legend || to.gangBase || to.casino?.id === 'meridiano' || to.danger === 'protected' || to.restricted === 'carcel'));
        if(entry && door.hidden) entry.concealed = true;
      }
      for (const o of z.objects) {
        const homes = units.get(o.id);
        if (o.kind !== 'housing' || !homes?.length) continue;
        const only = homes.length === 1;
        const e = add(only ? 'casa:' + homes[0].id : portalZoneId(o.id, 0), o.at, only);
        if (e) this.byBuilding.set(o.id, e);
      }
    }
  }

  atStreet(zone: string, at: readonly number[]): BuildingEntrance | undefined {
    return this.streets.get(zone)?.get(at.join(','));
  }
  around(zone: string, x: number, y: number, radius: number) {
    const map = this.streets.get(zone), near: BuildingEntrance[] = [];
    if (map) for (const e of map.values()) if (!e.concealed && (e.at[0]-x)**2 + (e.at[1]-y)**2 <= radius**2) near.push(e);
    return near;
  }
  frame(z: ZoneDef): RoomFrame | undefined {
    // Solo se conservan las plantas usadas en esta sesión y un pequeño margen para las puertas vecinas.
    if (this.frames.has(z.id)) return this.frames.get(z.id);
    const f = this.resolve(z);
    if (this.frames.size >= 64) this.frames.delete(this.frames.keys().next().value!);
    this.frames.set(z.id, f);
    return f;
  }
  private resolve(z: ZoneDef): RoomFrame | undefined {
    let entrance = this.rooms.get(z.id);
    const floor = parsePortalZone(z.id), house = this.houses.get(z.id.slice(5));
    let height = 0;
    if (floor || house && !entrance) {
      entrance = this.byBuilding.get(floor?.building ?? house!.building);
      if (!entrance) return;
      height = (floor?.floor ?? house!.floor) * STOREY_HEIGHT;
      if (height) entrance = floor ? divided(entrance).hall : divided(entrance).flat;
    }
    const parent = z.storey && this.zones.get(z.storey.of);
    if (parent) {
      const base = this.frame(parent);
      if (base) return { ...base, height: base.height + z.storey!.level * STOREY_HEIGHT };
    }
    if (!entrance && z.tower && z.tower.floor > 0) {
      const root = this.zones.get(`torre-${z.tower.id}-p0`) ||
        [...this.zones.values()].find(q => q.tower?.id === z.tower!.id && q.tower?.floor === 0);
      const base = root && this.frame(root);
      if (base && root.width === z.width && root.height === z.height) return { ...base, height: z.tower.floor * STOREY_HEIGHT };
    }
    if (!entrance) return;
    const door = z.doors.find(d => d.to.zone === entrance!.zone) ??
      z.doors.find(d => /:casa$/.test(d.id) || (/salir|salida/i.test(d.name) && edgeDirection(z,d.at)));
    const frame = door && fit(z, door, entrance);
    return frame && { ...frame, height };
  }
}
