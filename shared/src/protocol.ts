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
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export type EntityKind = 'player' | 'npc' | 'door' | 'object';
export interface Appearance { skin: string; hair: string; jacket: string; accent: string }
export interface EntitySpawn {
  id: number; kind: EntityKind; name: string; title?: string; x: number; y: number;
  appearance?: Appearance; role?: string; label?: string; interactive: boolean; objKind?: string; danger?: string;
}

export interface CharacterSheet {
  id: string; name: string; role: string; origin: string; level: number; xp: number; xpNext: number; roleRank: number;
  attributes: Record<string, number>; skills: Record<string, number>;
  hp: number; hpMax: number; stamina: number; staminaMax: number; luck: number; luckMax: number;
  humanity: number; humanityMax: number; chromeCapacity: number; chromeUsed: number; carry: number; carryMax: number;
  money: number; streetRep: number; reputation: Record<string, number>;
  inventory: { def: string; name: string; qty: number }[];
  appearance: Appearance; stance: 'avoid' | 'defend' | 'aggressive';
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
  | { t: 'label'; id: number; label: string }
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
