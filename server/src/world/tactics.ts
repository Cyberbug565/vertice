import { dangerAt, facingToIdx, isWalkable, sightRay, type WeaponDef, type ZoneGrid } from '@vertice/shared';
import type { Entity } from './entity.js';
import type { Zone } from './zone.js';

export type Point = { x: number; y: number };
export type TacticalProfile = 'police' | 'gang' | 'mercenary';
type Role = 'lead' | 'flank' | 'hold';
type Mode = 'attack' | 'moving' | 'waiting' | 'end';
type Maneuver = 'advance' | 'cover' | 'flank' | 'hold' | 'ambush' | 'search' | 'retreat';
interface Contact extends Point { at: number; observed: boolean }
interface Decision {
  target: number;
  zone: Zone;
  plannedUntil: number;
  started: number;
  role: Role;
  contact?: Contact;
  destination?: Point;
  maneuver?: Maneuver;
  lastMove?: number;
}
type Cover = (shooter: Point, target: Point & { zone: Zone }) => number;
type Route = (entity: Entity, x: number, y: number) => boolean;

const SPOTS = Array.from({ length: 12 }, (_, i) => {
  const a = i * Math.PI / 6;
  return { x: Math.cos(a), y: Math.sin(a) };
});
const CONTRACTORS = new Set(['unidad-hierro', 'halcon', 'nomadas-polvo', 'kuro', 'aurora', 'okami', 'kaiten', 'teselia']);
const SETTINGS = {
  police: { search: 7300, regroup: .27, distance: .58, cover: 2.9, flank: 1.9 },
  gang: { search: 4750, regroup: .37, distance: .43, cover: 1.55, flank: 2.8 },
  mercenary: { search: 9700, regroup: .41, distance: .69, cover: 3.4, flank: 3.4 },
} satisfies Record<TacticalProfile, Record<string, number>>;
const LABELS: Record<Maneuver, string> = {
  advance: 'Acercándose', cover: 'Buscando cobertura', flank: 'Rodeando', hold: 'Vigilando el paso',
  ambush: 'Al acecho', search: 'Buscando al objetivo', retreat: 'Reagrupándose',
};

export function tacticalProfile(e: Pick<Entity, 'npcType' | 'faction' | 'title' | 'prisonStaff'>): TacticalProfile | undefined {
  if (e.prisonStaff) return;
  if (e.npcType === 'hierro' || (e.npcType === 'police' || e.npcType === 'gang') &&
    (e.title === 'Seguridad privada' || CONTRACTORS.has(e.faction ?? ''))) return 'mercenary';
  if (e.npcType === 'police') return 'police';
  if (e.npcType === 'gang') return 'gang';
}

/** Solo la geometría opaca autoritativa interrumpe la observación. El mobiliario bajo conserva su bonificación de cobertura. */
export function seesTile(g: ZoneGrid, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, range = Math.hypot(dx, dy);
  return range < .05 || sightRay(g, a.x, a.y, dx / range, dy / range, range) >= range - 1e-6;
}

export class TacticalAI {
  private readonly decisions = new WeakMap<Entity, Decision>();

  constructor(private readonly route: Route, private readonly cover: Cover) {}

  forget(e: Entity) { this.decisions.delete(e); }

  observation(e: Entity, target: number, now: number): Point | undefined {
    const decision = this.decisions.get(e);
    const contact = decision?.contact;
    if (decision?.target === target && contact?.observed && now - contact.at <= 300) {
      return { x: contact.x, y: contact.y };
    }
  }

  report(e: Entity, target: Entity, point: Point, now: number) {
    const current = this.decisions.get(e);
    if (current?.target === target.id && current.contact?.observed) return;
    this.decisions.set(e, { target: target.id, zone: e.zone, started: now, plannedUntil: now,
      role: 'lead', contact: { ...point, at: now, observed: false } });
  }

  private label(e: Entity, text: string) {
    if (e.label !== text) { e.label = text; e.labelVer++; }
  }

  private squad(e: Entity, target: Entity, profile: TacticalProfile) {
    return e.zone.query(e.x, e.y, 22)
      .filter(other => other.kind === 'npc' && other.aggro === target.id && other.state !== 'downed' && !other.dead &&
        other.faction === e.faction && tacticalProfile(other) === profile)
      .sort((a,b) => a.id - b.id).slice(0,6);
  }

  private candidate(e: Entity, contact: Point, kind: Maneuver, profile: TacticalProfile, desired: number, reserved: Point[]) {
    const rules = SETTINGS[profile], grid = e.zone.grid, options: { point: Point; value: number }[] = [];
    const backward = { x: e.x - contact.x, y: e.y - contact.y };
    const norm = Math.max(.2, Math.hypot(backward.x, backward.y));
    for (const distance of [2, 4, 7]) for (const ray of SPOTS) {
      const point = { x: Math.floor(e.x + ray.x * distance) + .5, y: Math.floor(e.y + ray.y * distance) + .5 };
      if (!isWalkable(grid, point.x, point.y) || dangerAt(grid, point.x, point.y) === 'protected' ||
        reserved.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 2.4)) continue;
      const targetDistance = Math.hypot(point.x - contact.x, point.y - contact.y);
      if (targetDistance < 1.1) continue;
      const seen = seesTile(grid, contact, point);
      const cover = seen ? this.cover(contact, { ...point, zone: e.zone }) : 0;
      const side = Math.abs(ray.x * backward.y - ray.y * backward.x) / norm;
      const away = (ray.x * backward.x + ray.y * backward.y) / norm;
      let value = cover * rules.cover * .21 - distance * .24;
      if (kind === 'retreat') {
        if (targetDistance <= norm + 1.5) continue;
        value += away * 3 + (seen ? 0 : 6);
      } else if (kind === 'cover') {
        if (!cover && seen) continue;
        value += (seen ? 2.1 : 1.5) - Math.abs(targetDistance - desired) * .30;
      } else if (kind === 'flank') {
        if (!seen || side < .57 || targetDistance > desired * 1.65) continue;
        value += side * rules.flank - Math.abs(targetDistance - desired) * .26;
      } else if (kind === 'ambush') {
        if (seen || targetDistance > 9) continue;
        value += side * 3 - Math.abs(targetDistance - 4.5) * .55;
      } else {
        if (!seen || targetDistance > desired * 1.45 || targetDistance < desired * .45) continue;
        value += away * 1.5 + side * 1.4 - Math.abs(targetDistance - desired) * .60;
      }
      options.push({ point, value });
    }
    return options.sort((a,b) => b.value - a.value).slice(0, 2).map(option => option.point);
  }

  plan(e: Entity, target: Entity, weapon: WeaponDef, now: number, obscured = false): Mode | undefined {
    const profile = tacticalProfile(e);
    if (!profile) return;
    const rules = SETTINGS[profile];
    let order = this.decisions.get(e);
    if (order?.target !== target.id || order.zone !== e.zone) {
      order = { zone: e.zone, target: target.id, started: now, plannedUntil: now, role: 'lead' };
      this.decisions.set(e, order);
    }
    const range = Math.hypot(target.x - e.x, target.y - e.y);
    const visible = !obscured && range <= Math.max(17, Math.min(36, weapon.range + 6)) && seesTile(e.zone.grid, e, target);
    if (visible) order.contact = { x: target.x, y: target.y, at: now, observed: true };
    const inRange = visible && range <= weapon.range - .2;
    const isMelee = weapon.kind === 'melee';
    const holding = order.maneuver === 'ambush' || order.maneuver === 'retreat';
    if (now < order.plannedUntil) {
      if (holding && inRange && order.maneuver === 'ambush' && range < 3.2) return 'attack';
      if (e.path.length) return 'moving';
      if (holding) return 'waiting';
      if (inRange) return 'attack';
      return 'waiting';
    }

    const allies = this.squad(e, target, profile);
    const teammate = (other: Entity) => other !== e && this.decisions.get(other)?.target === target.id;
    if (!visible) for (const other of allies.filter(teammate)) {
      const shared = this.decisions.get(other)?.contact;
      if (shared?.observed && shared.at > (order.contact?.at ?? -1) && now - shared.at < 1900) {
        order.contact = { ...shared, observed: false };
      }
    }
    const contact = order.contact;
    if (visible && range < (isMelee ? 1.55 : 2.35) && inRange) return 'attack';
    if (!contact || now - contact.at >= rules.search) {
      e.path = []; e.moving = false;
      if (now - (contact?.at ?? order.started) >= rules.search) { this.forget(e); return 'end'; }
      this.label(e, LABELS.search);
      order.plannedUntil = now + 420;
      if (!visible) e.facing = (e.facing + 1) % 8;
      return 'waiting';
    }

    const rank = allies.indexOf(e);
    const squadHasLead = allies.length > 1 && rank > 0;
    order.role = !squadHasLead ? 'lead' : profile === 'police' && rank % 2 === 1 ? 'hold' : 'flank';
    const reserved = allies.filter(teammate).flatMap(other => {
      const point = this.decisions.get(other)?.destination;
      return point ? [point] : [];
    });
    const commit = (point: Point, maneuver: Maneuver, duration: number) => {
      if (!this.route(e, point.x, point.y)) return false;
      order.destination = point;
      order.maneuver = maneuver;
      order.plannedUntil = now + duration + e.id % 150;
      order.lastMove = now;
      this.label(e, LABELS[maneuver]);
      return true;
    };
    const desired = isMelee ? 2.4 : Math.max(4, Math.min(14, weapon.range * rules.distance));
    // Una búsqueda usa el último punto realmente observado y las celdas contiguas, incluso si el objetivo se ha movido.
    if (!visible) {
      if (e.path.length && order.maneuver === 'search' && now - (order.lastMove ?? 0) < 1600) {
        order.plannedUntil = now + 500;
        return 'moving';
      }
      const nearby = Math.hypot(contact.x - e.x, contact.y - e.y) < 1.6;
      const step = SPOTS[(e.id + Math.floor((now - contact.at) / 1000)) % SPOTS.length];
      const point = nearby ? { x: contact.x + step.x * 3, y: contact.y + step.y * 3 } : contact;
      if (commit(point, 'search', 850)) return 'moving';
      order.plannedUntil = now + 580;
      this.label(e, LABELS.search);
      return 'waiting';
    }
    if (e.path.length && order.maneuver && now - (order.lastMove ?? 0) < 1950 &&
      !(contact && order.destination && order.maneuver === 'search' && Math.hypot(contact.x - order.destination.x, contact.y - order.destination.y) > 6)) {
      order.plannedUntil = now + 450;
      return 'moving';
    }

    const low = (e.npcHp ?? 99) / (e.npcMax ?? 99) <= rules.regroup;
    const recentlyHit = now - (e.lastHitAt ?? -10000) < 1800;
    const protective = isMelee ? 0 : this.cover(contact, e);
    const maneuver = low ? 'retreat' :
      profile === 'gang' && order.role === 'flank' && range <= 13 && (isMelee || !inRange) ? 'ambush' :
      order.role === 'flank' ? 'flank' :
      order.role === 'hold' ? 'hold' :
      !protective && !isMelee && (recentlyHit || (!inRange && range < desired * 1.35)) ? 'cover' : undefined;

    const mayReposition = now - (order.lastMove ?? -10000) >= (maneuver === 'retreat' ? 2600 : 3200);
    if (maneuver && mayReposition) for (const point of this.candidate(e, contact, maneuver, profile, desired, reserved)) {
      if (commit(point, maneuver, maneuver === 'ambush' ? 1850 : maneuver === 'retreat' ? 1600 : 1050)) return 'moving';
    }
    order.destination = undefined;
    order.maneuver = undefined;
    if (inRange) {
      order.plannedUntil = now + 460;
      return 'attack';
    }
    const toward = Math.max(0, range - (isMelee ? 1.1 : desired));
    if (toward > .35 && commit({ x: e.x + (target.x - e.x) * toward / range,
      y: e.y + (target.y - e.y) * toward / range }, 'advance', 820)) return 'moving';
    order.plannedUntil = now + 480;
    return 'waiting';
  }

  aim(e: Entity, target: Entity) {
    const f = facingToIdx(target.x - e.x, target.y - e.y);
    if (e.facing !== f) { e.facing = f; e.labelVer++; }
  }
}
