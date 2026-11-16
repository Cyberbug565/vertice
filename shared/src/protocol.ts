// Protocolo compartido cliente ↔ servidor. Los mensajes de control viajan como JSON; las posiciones, como binario.
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const MAX_CLIENT_MESSAGE_BYTES = 2048;

const seq = z.number().int().nonnegative();
const opId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const ClientMsg = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), token: z.string().min(10).max(200), v: z.number().int(), contentVersion: z.string() }),
  z.object({ t: z.literal('move'), seq, x: z.number().finite(), y: z.number().finite() }),
  z.object({ t: z.literal('stop'), seq }),
  z.object({ t: z.literal('interact'), seq, target: z.number().int().nonnegative() }),
  z.object({ t: z.literal('choose'), seq, dialog: z.number().int(), option: z.string().max(64), luck: z.number().int().min(0).max(10).default(0), opId }),
  z.object({ t: z.literal('closeDialog'), seq }),
  z.object({ t: z.literal('stance'), seq, stance: z.enum(['avoid', 'defend', 'aggressive']) }),
  z.object({ t: z.literal('useItem'), seq, item: z.string().max(64), opId }),
  z.object({ t: z.literal('chat'), seq, channel: z.enum(['local']), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal('ping'), seq, ct: z.number() }),
  z.object({ t: z.literal('retreat'), seq }),
  // ---- v0.2
  z.object({ t: z.literal('sleep'), seq }),
  z.object({ t: z.literal('wake'), seq }),
  z.object({ t: z.literal('autonomy'), seq, autoNeeds: z.boolean() }),
  z.object({ t: z.literal('buy'), seq, shop: z.string().max(64), item: z.string().max(64), qty: z.number().int().min(1).max(20), opId }),
  z.object({ t: z.literal('sell'), seq, shop: z.string().max(64), item: z.string().max(64), qty: z.number().int().min(1).max(20), opId }),
  z.object({ t: z.literal('steal'), seq, shop: z.string().max(64), item: z.string().max(64), opId }),
  z.object({ t: z.literal('market'), seq }),
  z.object({ t: z.literal('jobs'), seq }),
  z.object({ t: z.literal('jobAccept'), seq, job: z.string().max(64) }),
  z.object({ t: z.literal('jobStart'), seq }),
  z.object({ t: z.literal('jobQuit'), seq }),
  z.object({ t: z.literal('profession'), seq, profession: z.string().max(64), opId }),
  z.object({ t: z.literal('clinicDo'), seq, doc: z.string().max(64), action: z.enum(['install', 'remove']), source: z.enum(['stock', 'stolen', 'inventory', 'installed']), ref: z.string().max(64), opId }),
  z.object({ t: z.literal('bounties'), seq }),
  z.object({ t: z.literal('bountyPlace'), seq, kind: z.enum(['player', 'npc']), target: z.string().min(1).max(64), amount: z.number().int().min(100).max(1_000_000), reason: z.string().min(1).max(120), aliveOnly: z.boolean().default(false), opId }),
  z.object({ t: z.literal('hostile'), seq, target: z.number().int().nonnegative(), action: z.enum(['rob', 'beat', 'claim', 'attack', 'knockout', 'finish', 'carry', 'talk']), opId }),
  z.object({ t: z.literal('menu'), seq, target: z.number().int().nonnegative() }),
  z.object({ t: z.literal('hack'), seq, target: z.number().int().nonnegative(), hack: z.string().max(64), opId }),
  z.object({ t: z.literal('equip'), seq, item: z.string().max(64).nullable() }),
  z.object({ t: z.literal('drop'), seq }),
  z.object({ t: z.literal('ambar'), seq, plan: z.string().max(32).optional(), opId: opId.optional() }),
  z.object({ t: z.literal('factions'), seq }),
  z.object({ t: z.literal('bribe'), seq, opId }),
  z.object({ t: z.literal('rescue'), seq, target: z.number().int().nonnegative(), opId }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export type EntityKind = 'player' | 'npc' | 'door' | 'object';
export interface Appearance { skin: string; hair: string; jacket: string; accent: string; eyes?: string; pants?: string; build?: string; hairStyle?: string; top?: string; facial?: string; accessory?: string; tattoo?: string }
export interface EntitySpawn {
  id: number; kind: EntityKind; name: string; title?: string; x: number; y: number;
  appearance?: Appearance; role?: string; label?: string; interactive: boolean; objKind?: string; danger?: string;
  bounty?: number; state?: 'alive' | 'downed' | 'sleeping'; fugitive?: boolean;
  chrome?: string[]; faction?: string; factionColor?: string; npcType?: string; hpPct?: number; carried?: boolean;
}

export interface ShopView {
  shop: string; name: string; owner: string; ownerName: string; security: number; fence: boolean; money: number;
  items: { item: string; name: string; desc: string; category: string; price: number; base: number; stock: number; trend: number; stealChance: number; discount: number }[];
  sell: { item: string; name: string; qty: number; price: number }[];
}
export interface MarketView {
  corps: { id: string; name: string; motto: string; categories: string[]; markup: number; trend: number }[];
  bulletin: { at: string; text: string }[];
  table: { item: string; name: string; category: string; base: number; prices: { shop: string; shopName: string; price: number; stock: number }[] }[];
  nextPolicyInMin: number;
}
export interface JobsView {
  profession: string; rank: number; xp: number; activeJob: string | null;
  professions: { id: string; name: string; kind: string; desc: string; perk: string }[];
  jobs: { id: string; title: string; desc: string; profession: string; professionName: string; employer: string; place: string; zone: string; zoneName: string; seconds: number; pay: number; chance: number; minRank: number; legal: boolean; risk: number; available: boolean; reason?: string; cooldownMin?: number }[];
}
export interface ClinicOffer {
  source: 'stock' | 'stolen' | 'inventory' | 'installed'; ref: string; action: 'install' | 'remove'; def: string; name: string; grade: number; slot: string; family: string; desc: string; stolen: boolean;
  capacity: number; humanity: number; price: number; survival: number; clean: number; theft: number; danger: string; humanityAfter: number; capacityAfter: number; blocked?: string; replaces?: string;
}
export interface ClinicView { doc: string; name: string; skill: number; morality: string; dangerLabel: string; desc: string; money: number; humanity: number; humanityMax: number; chromeUsed: number; chromeCapacity: number; rep: number; offers: ClinicOffer[] }
export interface BountyView {
  money: number;
  active: { id: string; targetName: string; kind: 'player' | 'npc'; amount: number; poster: string; reason: string; zone?: string; online?: boolean; mine: boolean; onMe: boolean; aliveOnly: boolean }[];
  targets: { kind: 'player' | 'npc'; id: string; name: string }[];
}
export interface TargetMenuView {
  target: number; name: string; subtitle?: string; color?: string;
  options: { id: string; kind: 'action' | 'hack' | 'interact'; group: 'social' | 'combate' | 'red' | 'ayuda'; label: string; chance?: number; disabled?: string; detail?: string; danger?: boolean }[];
}
export interface FactionsView { factions: { id: string; name: string; kind: string; color: string; archetype: string; desc: string; territory: string[]; rep: number; standing: string; allies: string[]; enemies: string[] }[] }
export interface AmbarView { active: { plan: string; name: string; usesLeft: number; expiresInMin: number } | null; plans: { id: string; name: string; price: number; days: number; arrival: number; uses: number; revive: number; zones: string[]; color: string; desc: string }[]; money: number }
export interface DeathSummary { name: string; role: string; profession: string; level: number; cause: string; place: string; money: number; minutesAlive: number; jobs: number; contracts: number }

export interface CharacterSheet {
  id: string; name: string; role: string; origin: string; level: number; xp: number; xpNext: number; roleRank: number;
  attributes: Record<string, number>; skills: Record<string, number>;
  hp: number; hpMax: number; stamina: number; staminaMax: number; luck: number; luckMax: number;
  humanity: number; humanityMax: number; chromeCapacity: number; chromeUsed: number; carry: number; carryMax: number;
  money: number; streetRep: number; reputation: Record<string, number>;
  inventory: { def: string; name: string; qty: number }[];
  appearance: Appearance; stance: 'avoid' | 'defend' | 'aggressive';
  baseAttributes: Record<string, number>;
  needs: { hunger: number; thirst: number; fatigue: number }; needsMult: { hunger: number; thirst: number; fatigue: number };
  status: 'alive' | 'downed'; downedLeft: number; sleeping: { quality: number; where: string } | null; wanted: number; autoNeeds: boolean;
  profession: string; professionName: string; professionRank: number; professionXp: number; activeJob: string | null;
  cyber: { id: string; def: string; name: string; slot: string; grade: number; capacity: number; humanity: number; family: string; maker: string; desc: string; location: 'inventory' | 'installed'; stolen: boolean }[];
  bonuses: { confront: number; defense: number; steal: number; surgery: number };
  weapon: { id: string; name: string; kind: string; family: string; damage: [number, number]; range: number; cooldown: number; accuracy: number; ammo?: string; ammoName?: string; ammoCount?: number; nonlethal: string; tech: string } | null;
  weapons: { id: string; name: string; integrated: boolean }[];
  armor: number; encumbrance: 'normal' | 'cargado' | 'sobrecargado'; carrying: string | null;
  net: { rank: number; xp: number; xpNext: number; ram: number; ramMax: number; canHack: boolean };
  ambar: { plan: string; name: string; usesLeft: number; expiresInMin: number } | null;
  chrome: string[];
}

export interface JournalEntry {
  contract: string; title: string; summary: string; state: 'active' | 'completed' | 'abandoned'; outcome?: string;
  objectives: { id: string; text: string; done: boolean }[]; participants: number;
}

export interface DialogView {
  dialog: number; speaker: string; title?: string; text: string;
  options: {
    id: string; text: string; disabled?: string;
    check?: { label: string; attr: string; attrValue: number; skill: string; skillValue: number; bonus: number; dv: number; chance: number; luckAvailable: number; maxLuck: number; failText?: string; previous?: boolean };
  }[];
}

export type ServerMsg =
  | { t: 'welcome'; you: number; sheet: CharacterSheet; zone: string; x: number; y: number; tick: number; cityHourMs: number; cityEpoch: number; journal: JournalEntry[]; facts: Record<string, unknown>; sector: string; danger: string }
  | { t: 'zone'; zone: string; x: number; y: number; sector: string; danger: string }
  | { t: 'spawn'; e: EntitySpawn[] }
  | { t: 'despawn'; ids: number[] }
  | { t: 'label'; id: number; label: string; bounty?: number; state?: 'alive' | 'downed' | 'sleeping'; chrome?: string[]; hpPct?: number; carried?: boolean }
  | { t: 'shop'; view: ShopView }
  | { t: 'market'; view: MarketView }
  | { t: 'jobs'; view: JobsView }
  | { t: 'clinic'; view: ClinicView }
  | { t: 'bounties'; view: BountyView }
  | { t: 'targetMenu'; view: TargetMenuView }
  | { t: 'death'; summary: DeathSummary }
  | { t: 'factions'; view: FactionsView }
  | { t: 'ambar'; view: AmbarView }
  | { t: 'speech'; id: number; text: string }
  | { t: 'fx'; kind: 'shot' | 'hit' | 'hack' | 'ko'; from: number; to: number }
  | { t: 'ack'; seq: number; ok: boolean; reason?: string; path?: [number, number][]; info?: string }
  | { t: 'dialog'; view: DialogView }
  | { t: 'dialogClose' }
  | { t: 'sheet'; sheet: CharacterSheet }
  | { t: 'journal'; journal: JournalEntry[] }
  | { t: 'notice'; kind: 'info' | 'good' | 'warn' | 'bad'; text: string }
  | { t: 'reward'; title: string; lines: string[] }
  | { t: 'action'; text: string; progress?: number; duration?: number }
  | { t: 'sector'; sector: string; danger: string }
  | { t: 'facts'; facts: Record<string, unknown> }
  | { t: 'chat'; from: string; fromId: number; channel: 'local'; text: string }
  | { t: 'pong'; seq: number; ct: number; st: number }
  | { t: 'kicked'; reason: string }
  | { t: 'error'; reason: string };

// ---- Binario: actualizaciones de posición ----
// [u8 tipo=1][u32 tick][u16 n] + n × [u32 id][u16 x*256][u16 y*256][u8 flags]
// flags: bit0 en movimiento, bits1-3 dirección (8 sectores), bit4 acelerado
export const BIN_POSITIONS = 1;
export const POS_SCALE = 256;
const REC = 9;

export function encodePositions(tick: number, ents: { id: number; x: number; y: number; flags: number }[]): Uint8Array {
  const buf = new Uint8Array(7 + ents.length * REC);
  const dv = new DataView(buf.buffer);
  dv.setUint8(0, BIN_POSITIONS); dv.setUint32(1, tick >>> 0); dv.setUint16(5, ents.length);
  let o = 7;
  for (const e of ents) {
    dv.setUint32(o, e.id); dv.setUint16(o + 4, Math.max(0, Math.min(65535, Math.round(e.x * POS_SCALE))));
    dv.setUint16(o + 6, Math.max(0, Math.min(65535, Math.round(e.y * POS_SCALE)))); dv.setUint8(o + 8, e.flags); o += REC;
  }
  return buf;
}

export function decodePositions(data: ArrayBuffer | Uint8Array): { tick: number; ents: { id: number; x: number; y: number; flags: number }[] } | null {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 7 || dv.getUint8(0) !== BIN_POSITIONS) return null;
  const tick = dv.getUint32(1), n = dv.getUint16(5);
  if (u8.byteLength < 7 + n * REC) return null;
  const ents = new Array(n);
  let o = 7;
  for (let i = 0; i < n; i++) {
    ents[i] = { id: dv.getUint32(o), x: dv.getUint16(o + 4) / POS_SCALE, y: dv.getUint16(o + 6) / POS_SCALE, flags: dv.getUint8(o + 8) };
    o += REC;
  }
  return { tick, ents };
}

export function facingToIdx(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
