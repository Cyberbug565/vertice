import { isWalkable, nearestWalkable, pedestrianGrid, type ZoneGrid } from '@vertice/shared';
import type { Entity } from './entity.js';

type Tile = [number, number];
export interface LocalRoute { zone: string; stops: Tile[]; next: number }

export function pedestrianRoute(grid: ZoneGrid, x: number, y: number, radius: number, rng: () => number, anchors: readonly Tile[] = []): Tile[] {
  const pavement = pedestrianGrid(grid, 'stop');
  const origin: Tile = [Math.floor(x) + .5, Math.floor(y) + .5];
  const stops: Tile[] = [];
  const rotation = rng() * 2 * Math.PI;
  const count = 3 + Math.floor(rng() * 3);
  const near = anchors.filter(([ax, ay]) => {
    const d = (ax + .5 - origin[0]) ** 2 + (ay + .5 - origin[1]) ** 2;
    return d >= 9 && d <= radius * radius;
  });
  for (let i = 0; i < count; i++) {
    const angle = rotation + (i + rng() * .65) * Math.PI * 2 / count;
    const reach = radius * (.45 + rng() * .52);
    const anchor = i === 0 && near.length ? near[Math.floor(rng() * near.length)] : undefined;
    const a = anchor ? anchor[0] + .5 : origin[0] + Math.cos(angle) * reach;
    const b = anchor ? anchor[1] + .5 : origin[1] + Math.sin(angle) * reach;
    const point = nearestWalkable(pavement, a, b, 5);
    if (!point) continue;
    const tile: Tile = [Math.floor(point.x) + .5, Math.floor(point.y) + .5];
    if ([origin, ...stops].every(([px, py]) => Math.hypot(px - tile[0], py - tile[1]) >= 2)) stops.push(tile);
  }
  if (stops.length && isWalkable(pavement, ...origin)) stops.push(origin);
  return stops;
}

export function nextPedestrianStop(e: Entity) {
  const brain = e.npc!;
  if (!brain.route || brain.route.zone !== e.zone.id) {
    const z = e.zone;
    const patrol = e.npcType === 'police' || e.npcType === 'gang' || e.npcType === 'hierro';
    const district = z.districtAt(e.x, e.y);
    const [x, y] = patrol && brain.home ? brain.home : [e.x, e.y];
    const radius = z.def.kind === 'interior' ? (patrol ? 6 : 10) : patrol ?
      Math.max(8, brain.radius ?? 14) : 18 + Math.floor(brain.rng() * 11);
    brain.route = { zone: z.id, next: 0, stops: pedestrianRoute(z.grid, x, y, radius, brain.rng, district?.waypoints ?? z.def.waypoints) };
  }
  const route = brain.route;
  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[route.next];
    route.next = (route.next + 1) % route.stops.length;
    if (Math.hypot(stop[0] - e.x, stop[1] - e.y) >= 1.4) return stop;
  }
}
