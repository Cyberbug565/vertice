import type { Appearance, EntityKind, EntitySpawn, TaskDef, FugitiveDef } from '@vertice/shared';
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
}

export function spawnOf(e: Entity): EntitySpawn {
  return { id: e.id, kind: e.kind, name: e.name, title: e.title, x: e.x, y: e.y, appearance: e.appearance, role: e.role, label: e.label, interactive: e.interactive, objKind: e.objKind, danger: e.danger,
    bounty: e.bounty || undefined, state: e.state && e.state !== 'alive' ? e.state : undefined, fugitive: e.fugitive ? true : undefined };
}
