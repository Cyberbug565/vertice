import type { Appearance, EntityKind, EntitySpawn, TaskDef, FugitiveDef, EmoteState } from '@vertice/shared';
import type { Zone } from './zone.js';
import type { PlayerConn } from './world.js';
import type { NpcBrain } from './npc.js';

export interface RunningTask { def: TaskDef; step: number; rep: number; waitUntil: number; started: boolean; opId: string; onDone?: () => void }
export interface Channel { endTick: number; startTick: number; label: string; apply: () => void; targetId: number }

export interface Entity {
  id: number; kind: EntityKind; name: string; title?: string;
  zone: Zone; x: number; y: number; cellKey: number; sectorId: string;
  path: [number, number][]; speed: number; facing: number; moving: boolean; lastMoveTick: number;
  appearance?: Appearance; role?: string; label: string; labelVer: number;
  interactive: boolean; objKind?: string; dialog?: string; danger?: string;
  doorTo?: { zone: string; at: [number, number] };
  conn?: PlayerConn; npc?: NpcBrain;
  task?: RunningTask; channel?: Channel; pendingInteract?: number; transit?: boolean;
  talkingUntil?: number;
  // ---- v0.2
  state?: 'alive' | 'downed' | 'sleeping'; bounty?: number; fugitive?: FugitiveDef; npcHp?: number; npcShop?: string;
  shop?: string; sleep?: { quality: number; price: number }; workplace?: string;
  // ---- v0.3: combate, facciones y transporte de cuerpos
  npcType?: 'civil' | 'gang' | 'police' | 'hierro' | 'fugitive' | 'ambar' | 'essential';
  lastHitBy?: number; lastHitAt?: number; faction?: string; npcMax?: number; defense?: number; weaponId?: string; chrome?: string[];
  aggro?: number; aggroLethal?: boolean; nextAttackAt?: number; fleeUntil?: number; nextPathAt?: number;
  downedUntil?: number; npcLethalDown?: boolean; lastAttacker?: number; carriedBy?: number; blindUntil?: number;
  respawn?: { zone: string; template: Record<string, unknown> }; hunting?: string; expiresAt?: number;
  pendingAction?: { target: number; action: string; opId: string; part?: import('@vertice/shared').AimZone };
  // ---- v0.4
  objId?: string; dealer?: string; hiddenDoc?: string; vehicle?: string | null; level?: number; stunUntil?: number; dots?: { until: number; dmg: number; next: number; by?: number }[];
  buffs?: Record<string, number>; decoyUntil?: number;
  // ---- v0.6
  emote?: EmoteState; marketSite?: string;
  body?: import('@vertice/shared').BodyState; dead?: boolean; searched?: boolean; ownerChar?: string; carOwnedId?: string; disabledUntil?: number;
}

export function spawnOf(e: Entity): EntitySpawn {
  return { id: e.id, kind: e.kind, name: e.name, title: e.title, x: e.x, y: e.y, appearance: e.appearance, role: e.role, label: e.label, interactive: e.interactive, objKind: e.objKind, danger: e.danger,
    bounty: e.bounty || undefined, state: e.state && e.state !== 'alive' ? e.state : undefined, fugitive: e.fugitive ? true : undefined,
    chrome: e.chrome?.length ? e.chrome : undefined, faction: e.faction, npcType: e.npcType, carried: e.carriedBy ? true : undefined,
    hpPct: e.npcMax ? Math.max(0, Math.round(((e.npcHp ?? e.npcMax) / e.npcMax) * 100)) : undefined,
    level: e.level, emote: e.emote, vehicle: e.vehicle ?? undefined, lost: e.body?.lost.length ? [...e.body.lost] : undefined, bleeding: (e.body?.bleed ?? 0) > 0.2 || undefined, weapon: e.weaponId, dead: e.dead || undefined, buffs: e.buffs ? Object.entries(e.buffs).filter(([, u]) => u > Date.now()).map(([k]) => k) : undefined };
}
