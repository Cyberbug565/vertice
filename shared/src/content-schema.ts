// Esquemas validables del contenido del mundo. El motor no conoce lugares concretos: todo vive en /content.
import { z } from 'zod';
import { ATTRIBUTE_IDS } from './rules.js';

const xy = z.tuple([z.number().int(), z.number().int()]);
const rect = z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]);
export const DangerLevel = z.enum(['protected', 'public', 'disputed']);
export type DangerLevel = z.infer<typeof DangerLevel>;

export const GROUND_TYPES = ['void', 'asphalt', 'sidewalk', 'plaza', 'market', 'dirt', 'water', 'bridge', 'wood', 'tile', 'metal', 'crosswalk', 'deck', 'gravel'] as const;
export type GroundType = (typeof GROUND_TYPES)[number];
export const BLOCKING_GROUND: ReadonlySet<GroundType> = new Set(['void', 'water']);

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['exterior', 'interior']),
  width: z.number().int().positive().max(1024),
  height: z.number().int().positive().max(1024),
  chunkSize: z.number().int().positive().default(32),
  danger: DangerLevel,
  base: z.enum(GROUND_TYPES),
  wallColor: z.string().optional(),
  ground: z.array(z.object({ type: z.enum(GROUND_TYPES), rect })).default([]),
  blocks: z.array(z.object({ type: z.enum(['fence', 'wall', 'barrier', 'counter', 'furniture']), rect, height: z.number().default(1), color: z.string().optional() })).default([]),
  buildings: z.array(z.object({
    id: z.string(), name: z.string().optional(), rect, height: z.number().positive(),
    style: z.enum(['mega', 'block', 'shop', 'club', 'clinic', 'industrial', 'tower']),
    color: z.string(), sign: z.string().optional(), signColor: z.string().optional(),
  })).default([]),
  props: z.array(z.object({ type: z.enum(['stall', 'lamp', 'crate', 'bench', 'plant', 'vending', 'car', 'neon', 'table', 'bed', 'screen', 'pipe']), at: xy, blocking: z.boolean().default(true), color: z.string().optional() })).default([]),
  doors: z.array(z.object({ id: z.string(), name: z.string(), at: xy, to: z.object({ zone: z.string(), at: xy }), danger: DangerLevel.optional() })).default([]),
  objects: z.array(z.object({ id: z.string(), name: z.string(), at: xy, kind: z.enum(['generator', 'terminal', 'crates', 'elevator', 'board']), dialog: z.string() })).default([]),
  sectors: z.array(z.object({ chunk: xy, name: z.string() })).default([]),
  dangerAreas: z.array(z.object({ rect, level: DangerLevel })).default([]),
  waypoints: z.array(xy).default([]),
  safePoint: xy,
  spawn: xy.optional(),
});
export type ZoneDef = z.infer<typeof ZoneSchema>;

const Condition = z.union([
  z.object({ role: z.string() }),
  z.object({ notRole: z.string() }),
  z.object({ origin: z.string() }),
  z.object({ contract: z.string(), state: z.enum(['none', 'active', 'completed', 'abandoned']) }),
  z.object({ objective: z.string(), done: z.boolean() }),
  z.object({ flag: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }),
  z.object({ hasItem: z.string() }),
  z.object({ money: z.number().int() }),
  z.object({ fact: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }),
]);
export type Condition = z.infer<typeof Condition>;

const Effect = z.union([
  z.object({ acceptContract: z.string() }),
  z.object({ abandonContract: z.string() }),
  z.object({ completeObjective: z.string() }),
  z.object({ completeContract: z.string(), outcome: z.string() }),
  z.object({ money: z.number().int(), reason: z.string(), byContribution: z.boolean().optional() }),
  z.object({ item: z.string(), qty: z.number().int() }),
  z.object({ flag: z.string(), value: z.union([z.boolean(), z.string(), z.number()]), ttlSeconds: z.number().optional() }),
  z.object({ rep: z.string(), delta: z.number().int() }),
  z.object({ xp: z.number().int().nonnegative() }),
  z.object({ fact: z.string(), value: z.union([z.boolean(), z.string(), z.number()]), ttlMinutes: z.number().positive().optional() }),
  z.object({ task: z.string() }),
  z.object({ restore: z.enum(['stamina', 'hp', 'all']) }),
  z.object({ heal: z.enum(['stamina', 'hp']), amount: z.number().int().positive() }),
  z.object({ notice: z.string() }),
]);
export type Effect = z.infer<typeof Effect>;

const DialogOption = z.object({
  id: z.string(),
  text: z.string(),
  if: z.array(Condition).default([]),
  require: z.array(Condition).default([]),
  requireText: z.string().optional(),
  channel: z.object({ seconds: z.number().positive().max(30), label: z.string() }).optional(),
  check: z.object({ attr: z.enum(ATTRIBUTE_IDS), skill: z.string(), dv: z.number().int(), key: z.string(), roleBonus: z.object({ role: z.string(), bonus: z.number().int() }).optional() }).optional(),
  effects: z.array(Effect).default([]),
  fail: z.array(Effect).default([]),
  goto: z.string().nullable().default(null),
  failGoto: z.string().nullable().optional(),
  failText: z.string().optional(),
});
export type DialogOption = z.infer<typeof DialogOption>;

export const DialogSchema = z.object({
  speaker: z.string(),
  entries: z.array(z.object({ if: z.array(Condition).default([]), node: z.string() })),
  nodes: z.record(z.string(), z.object({ text: z.string(), options: z.array(DialogOption) })),
});
export type DialogDef = z.infer<typeof DialogSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  repeat: z.number().int().positive().default(1),
  steps: z.array(z.union([
    z.object({ moveTo: xy, zone: z.string() }),
    z.object({ wait: z.number().positive(), label: z.string() }),
  ])),
  onComplete: z.array(Effect).default([]),
});
export type TaskDef = z.infer<typeof TaskSchema>;

export const ContractSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  giver: z.string(),
  legal: z.boolean(),
  shared: z.boolean(),
  objectives: z.array(z.object({ id: z.string(), text: z.string(), shared: z.boolean() })),
  closedWhileFact: z.object({ fact: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }).optional(),
});
export type ContractDef = z.infer<typeof ContractSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  dialog: z.string().optional(),
  appearance: z.object({ skin: z.string(), hair: z.string(), jacket: z.string(), accent: z.string() }),
  schedule: z.array(z.object({ from: z.number().min(0).max(24), to: z.number().min(0).max(24), zone: z.string(), at: xy, state: z.enum(['rest', 'work', 'talk']), label: z.string() })).min(1),
});
export type NpcDef = z.infer<typeof NpcSchema>;

export const RoleSchema = z.object({
  id: z.string(), name: z.string(), ability: z.string(), abilityDesc: z.string(), income: z.string(), firstJob: z.string(), groupContribution: z.string(),
  skills: z.record(z.string(), z.number().int().min(0).max(6)),
  accent: z.string(),
  m1Option: z.string().optional(),
});
export type RoleDef = z.infer<typeof RoleSchema>;

export const ItemSchema = z.object({ id: z.string(), name: z.string(), desc: z.string(), weight: z.number(), price: z.number().int().optional(), consumable: z.object({ restore: z.enum(['stamina', 'hp']), amount: z.number() }).optional() });
export type ItemDef = z.infer<typeof ItemSchema>;

export const ContentSchema = z.object({
  manifest: z.object({ version: z.string(), edition: z.string(), city: z.string(), startZone: z.string(), startAt: xy, cityHourMs: z.number().int().positive() }),
  attributes: z.array(z.object({ id: z.enum(ATTRIBUTE_IDS), name: z.string(), represents: z.string(), effect: z.string(), example: z.string() })),
  skills: z.array(z.object({ id: z.string(), name: z.string(), attr: z.enum(ATTRIBUTE_IDS) })),
  roles: z.array(RoleSchema),
  origins: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string(), contact: z.string(), startMoney: z.number().int() })),
  factions: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['gang', 'service', 'authority', 'corp', 'contact', 'neighborhood']), desc: z.string() })),
  items: z.array(ItemSchema),
  npcs: z.array(NpcSchema),
  zones: z.array(ZoneSchema),
  dialogs: z.record(z.string(), DialogSchema),
  tasks: z.array(TaskSchema),
  contracts: z.array(ContractSchema),
  locale: z.record(z.string(), z.string()),
});
export type Content = z.infer<typeof ContentSchema>;
