// Estado en memoria de una vida de personaje y su persistencia básica.
import { randomUUID } from 'node:crypto';
import {
  ATTRIBUTE_IDS, RULES, carryCapacity, chromeCapacity, humanityBase, levelForXp, maxHp, maxStamina, validateAttributes, xpForLevel,
  type Appearance, type Attributes, type CharacterSheet, type Content, type JournalEntry, t,
} from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';

export interface ContractProgress { instanceId: string; contractId: string; version: number; state: 'active' | 'completed' | 'abandoned'; objectives: Record<string, boolean>; outcome?: string | null }

export interface PlayerState {
  charId: string; accountId: string; name: string; role: string; origin: string;
  attributes: Attributes; skills: Record<string, number>; appearance: Appearance;
  level: number; xp: number; roleRank: number; money: number; hp: number; stamina: number; luck: number; humanity: number;
  stance: 'avoid' | 'defend' | 'aggressive';
  zone: string; x: number; y: number;
  inventory: Map<string, number>;
  rep: Map<string, number>;
  flags: Map<string, { value: unknown; expiresAt: number | null }>;
  contracts: Map<string, ContractProgress>; // último progreso por encargo
  checks: Map<string, { success: boolean; roll: number; total: number }>;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[\p{L}0-9 _'.-]{3,20}$/u;

export interface CreateCharacterInput { name: string; origin: string; role: string; attributes: Record<string, number>; appearance: Appearance }

export function validateCreate(c: Content, input: any): string | null {
  if (!input || typeof input !== 'object') return 'Datos inválidos';
  if (typeof input.name !== 'string' || !NAME.test(input.name.trim())) return 'El nombre debe tener 3–20 caracteres (letras, números, espacios)';
  if (!c.origins.some((o) => o.id === input.origin)) return 'Origen desconocido';
  if (!c.roles.some((r) => r.id === input.role)) return 'Rol desconocido';
  const a = validateAttributes(input.attributes ?? {});
  if (a) return a;
  const ap = input.appearance;
  if (!ap || !['skin', 'hair', 'jacket', 'accent'].every((k) => typeof ap[k] === 'string' && HEX.test(ap[k]))) return 'Aspecto inválido';
  return null;
}

export async function createCharacter(db: Db, c: Content, accountId: string, input: CreateCharacterInput, contentVersion: string): Promise<{ id: string } | { error: string }> {
  const err = validateCreate(c, input);
  if (err) return { error: err };
  const role = c.roles.find((r) => r.id === input.role)!;
  const origin = c.origins.find((o) => o.id === input.origin)!;
  const attrs = Object.fromEntries(ATTRIBUTE_IDS.map((k) => [k, input.attributes[k]])) as Attributes;
  const skills: Record<string, number> = Object.fromEntries(c.skills.map((s) => [s.id, 0]));
  for (const [k, v] of Object.entries(role.skills)) skills[k] = v;
  for (const k of ['percepcion', 'atletismo', 'negociacion']) skills[k] = Math.max(skills[k], 1);
  const id = randomUUID();
  const items: [string, number][] = [['agente', 1], ['chaqueta', 1], ['navaja', 1], ['fideos-krill', 1]];
  if (role.id === 'netrunner') items.push(['pulsera-interfaz', 1]);
  if (role.id === 'tech' || role.id === 'nomad') items.push(['kit-herramientas', 1]);
  if (role.id === 'medtech') items.push(['estim', 2]);
  try {
    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO characters (id, account_id, name, origin, role, attributes, skills, appearance, money, hp, stamina, luck, humanity, zone_id, pos_x, pos_y, rules_version, content_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [id, accountId, input.name.trim(), origin.id, role.id, JSON.stringify(attrs), JSON.stringify(skills), JSON.stringify(input.appearance), 0,
          maxHp(attrs), maxStamina(attrs), attrs.LUCK, humanityBase(attrs.EMP), c.manifest.startZone, c.manifest.startAt[0] + 0.5, c.manifest.startAt[1] + 0.5, RULES.version, contentVersion]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$3,$4)', [`start-${id}`, id, origin.startMoney, `Fondos iniciales (${origin.name})`]);
      await q.query('UPDATE characters SET money = $2 WHERE id = $1', [id, origin.startMoney]);
      for (const [def, qty] of items) await q.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)', [randomUUID(), id, def, qty]);
    });
  } catch (e: any) {
    if (/characters_one_active_uq/.test(e.message ?? '') || /characters_one_active_uq/.test(e.constraint ?? '')) return { error: 'Ya tienes un personaje vivo en esta cuenta' };
    if (/characters_name_alive_uq/.test(e.message ?? '') || /characters_name_alive_uq/.test(e.constraint ?? '')) return { error: 'Ese nombre ya está en uso' };
    throw e;
  }
  return { id };
}

export async function activeCharacterId(db: Queryable, accountId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>("SELECT id FROM characters WHERE account_id = $1 AND status <> 'dead'", [accountId]);
  return r.rows[0]?.id ?? null;
}

export async function loadPlayer(db: Queryable, charId: string): Promise<PlayerState | null> {
  const r = await db.query<any>('SELECT * FROM characters WHERE id = $1', [charId]);
  const row = r.rows[0];
  if (!row || row.status === 'dead') return null;
  const [inv, rep, flags, prog, checks] = await Promise.all([
    db.query<any>('SELECT def_id, qty FROM inventory_items WHERE character_id = $1 AND qty > 0', [charId]),
    db.query<any>('SELECT faction_id, value FROM reputation WHERE character_id = $1', [charId]),
    db.query<any>('SELECT key, value, expires_at FROM character_flags WHERE character_id = $1', [charId]),
    db.query<any>(`SELECT p.*, i.objectives AS shared_obj FROM contract_progress p JOIN contract_instances i ON i.id = p.instance_id WHERE p.character_id = $1 ORDER BY p.updated_at ASC`, [charId]),
    db.query<any>('SELECT check_key, success, roll, total FROM skill_checks WHERE character_id = $1', [charId]),
  ]);
  const p: PlayerState = {
    charId, accountId: row.account_id, name: row.name, role: row.role, origin: row.origin,
    attributes: row.attributes, skills: row.skills, appearance: row.appearance,
    level: row.level, xp: row.xp, roleRank: row.role_rank, money: Number(row.money), hp: row.hp, stamina: row.stamina, luck: row.luck, humanity: row.humanity,
    stance: row.stance, zone: row.zone_id, x: row.pos_x, y: row.pos_y,
    inventory: new Map(inv.rows.map((x: any) => [x.def_id, x.qty])),
    rep: new Map(rep.rows.map((x: any) => [x.faction_id, x.value])),
    flags: new Map(flags.rows.map((x: any) => [x.key, { value: x.value, expiresAt: x.expires_at ? new Date(x.expires_at).getTime() : null }])),
    contracts: new Map(),
    checks: new Map(checks.rows.map((x: any) => [x.check_key, { success: x.success, roll: x.roll, total: x.total }])),
  };
  for (const x of prog.rows) {
    p.contracts.set(x.contract_id, { instanceId: x.instance_id, contractId: x.contract_id, version: x.version, state: x.state, objectives: { ...x.shared_obj, ...x.objectives }, outcome: x.outcome });
  }
  return p;
}

export function flagValue(p: PlayerState, key: string): unknown {
  const f = p.flags.get(key);
  if (!f) return false;
  if (f.expiresAt && f.expiresAt < Date.now()) return false;
  return f.value;
}

export function buildSheet(c: Content, p: PlayerState): CharacterSheet {
  const a = p.attributes;
  const weight = [...p.inventory].reduce((s, [d, q]) => s + (c.items.find((i) => i.id === d)?.weight ?? 0) * q, 0);
  return {
    id: p.charId, name: p.name, role: p.role, origin: p.origin, level: p.level, xp: p.xp, xpNext: xpForLevel(Math.min(RULES.levelMax, p.level + 1)), roleRank: p.roleRank,
    attributes: { ...a }, skills: { ...p.skills },
    hp: p.hp, hpMax: maxHp(a), stamina: p.stamina, staminaMax: maxStamina(a), luck: p.luck, luckMax: a.LUCK,
    humanity: p.humanity, humanityMax: humanityBase(a.EMP), chromeCapacity: chromeCapacity(a), chromeUsed: 0,
    carry: Math.round(weight * 10) / 10, carryMax: carryCapacity(a),
    money: p.money, streetRep: p.rep.get('calle') ?? 0, reputation: Object.fromEntries([...p.rep].filter(([k]) => k !== 'calle')),
    inventory: [...p.inventory].filter(([, q]) => q > 0).map(([d, q]) => ({ def: d, name: c.items.find((i) => i.id === d)?.name ?? d, qty: q })),
    appearance: p.appearance, stance: p.stance,
  };
}

export function buildJournal(c: Content, p: PlayerState, participants: (instanceId: string) => number): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const cp of p.contracts.values()) {
    const def = c.contracts.find((k) => k.id === cp.contractId);
    if (!def) continue;
    out.push({
      contract: def.id, title: t(c, def.title), summary: t(c, def.summary), state: cp.state, outcome: cp.outcome ?? undefined,
      objectives: def.objectives.map((o) => ({ id: o.id, text: t(c, o.text), done: !!cp.objectives[o.id] })),
      participants: participants(cp.instanceId),
    });
  }
  return out;
}

export async function savePlayerVitals(db: Queryable, p: PlayerState) {
  await db.query('UPDATE characters SET zone_id=$2, pos_x=$3, pos_y=$4, hp=$5, stamina=$6, luck=$7, stance=$8 WHERE id=$1',
    [p.charId, p.zone, p.x, p.y, p.hp, p.stamina, p.luck, p.stance]);
}

export function recomputeLevel(p: PlayerState) {
  const before = p.level;
  p.level = levelForXp(p.xp);
  return p.level > before;
}
