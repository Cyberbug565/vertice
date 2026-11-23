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
  /** v0.7: dirección de WASD (con marca de tiempo para cortar si el cliente deja de avisar) y guardia con clic derecho. */
  steer?: { dx: number; dy: number; at: number }; guard?: boolean; guardFacing?:number; guardSince?: number; dodgeUntil?: number; dodgeReadyAt?: number; sign?: { text: string; color?: string; icon?: string }; carry?: string[]; lastDir?: { dx: number; dy: number }; markedUntil?: number;
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
  npcType?: 'civil' | 'gang' | 'police' | 'hierro' | 'fugitive' | 'ambar' | 'essential' | 'psycho';
  /** v0.7: depredador (ataca a quien pilla), escolta de un objetivo con recompensa, nivel de botín, cromo extraíble del cadáver,
   *  patrulla enviada por una llamada o una cámara (y hasta cuándo), y civil llamando a la policía. */
  /** v0.8: solo lo ve una conexión (la proyección de Eco), fantasma de un cuerpo, cuerpo en trance, Kairós activo, escala de tiempo, jefe de leyenda. */
legendId?: string;
    privateTo?: PlayerConn; ghostOf?: number; ghostOwner?: PlayerConn; kairosTier?: number; timeScale?: number; legendBoss?: { legend: string; step: number; owner: string };
  predator?: boolean; escortOf?: number; lootTier?: number; lootChrome?: string[]; dispatchedUntil?: number; callingUntil?: number;
  lastHitBy?: number; lastHitAt?: number; faction?: string; npcMax?: number; defense?: number; weaponId?: string; chrome?: string[];
  prisonStaff?:boolean; prisonGang?:string;
  aggro?: number; aggroLethal?: boolean; nextAttackAt?: number; fleeUntil?: number; nextPathAt?: number;
  downedUntil?: number; npcLethalDown?: boolean; lastAttacker?: number; lastAttackerInfo?: { charId: string; name: string }; carriedBy?: number; blindUntil?: number;
  respawn?: { zone: string; template: Record<string, unknown> }; hunting?: string; expiresAt?: number;
  pendingAction?: { target: number; action: string; opId: string; part?: import('@vertice/shared').AimZone };
  // ---- v0.4
  objId?: string; dealer?: string; hiddenDoc?: string; vehicle?: string | null; level?: number; stunUntil?: number; dots?: { until: number; dmg: number; next: number; by?: number }[];
  gaitFlags?:string[]; buffs?: Record<string, number>; decoyUntil?: number;
  // ---- v0.6
  emote?: EmoteState; marketSite?: string;
  /** v0.13 · Botín completo del cuerpo, datos del cadáver (hallazgo e investigación) y contenedor donde se esconde. */
  /** v0.13 · tarea del entorno a la que va un transeúnte (banco, máquina, parada…). */
  goal?: unknown;
  loot?: import('./corpses.js').CorpseLoot; corpse?: import('./corpses.js').CorpseInfo; hiddenIn?: string;
  body?: import('@vertice/shared').BodyState; dead?: boolean; searched?: boolean; ownerChar?: string; carOwnedId?: string; disabledUntil?: number;
}

export function spawnOf(e: Entity): EntitySpawn {
  return { id: e.id, kind: e.kind, name: e.name, title: e.title, x: e.x, y: e.y, appearance: e.appearance, role: e.role, label: e.label, interactive: e.interactive, objKind: e.objKind, danger: e.danger,
    bounty: e.bounty || undefined, state: e.state && e.state !== 'alive' ? e.state : undefined, fugitive: e.fugitive ? true : undefined,
    chrome: e.chrome?.length ? e.chrome : undefined, faction: e.faction, npcType: e.npcType, carried: e.carriedBy ? true : undefined,
    hpPct: e.npcMax ? Math.max(0, Math.round(((e.npcHp ?? e.npcMax) / e.npcMax) * 100)) : undefined,
    level: e.level, emote: e.emote, sign: e.sign, vehicle: e.vehicle ?? undefined, lost: e.body?.lost.length ? [...e.body.lost] : undefined, bleeding: (e.body?.bleed ?? 0) > 0.2 || undefined, weapon: e.weaponId, carry: e.carry?.length ? e.carry : undefined, dead: e.dead || undefined, buffs: e.buffs || e.guard || e.kairosTier || e.gaitFlags?.length ? [...(e.gaitFlags??[]),...Object.entries(e.buffs ?? {}).filter(([, u]) => u > Date.now()).map(([k]) => k), ...(e.guard ? ['guardia'] : []), ...(e.kairosTier ? [`kairos${e.kairosTier}`] : [])] : undefined };
}
