import { cellKey, emptyMap, MAP_INTERFACE, type MapKnowledge } from '@vertice/shared';
import type { Queryable } from '../db/db.js';
import { skillLevel, type PlayerState } from './player.js';
import { GameError } from './effects.js';

export function mapKnowledge(p: PlayerState): MapKnowledge {
  const result = emptyMap();
  for (const key of p.flags.keys()) {
    if (key.startsWith('atlas:c:')) result.cells.push(key.slice(8));
    if (key.startsWith('atlas:p:')) result.places.push(key.slice(8));
  }
  result.unlocked = p.flags.has('atlas:completo');
  return result;
}
export function mapKeys(p: PlayerState, zone: string, x: number, y: number, entering: boolean) {
  if (p.flags.has('atlas:completo')) return [];
  const keys = ['atlas:c:' + cellKey(zone,x,y)];
  if (entering) keys.push('atlas:p:' + zone);
  return keys.filter(k => !p.flags.has(k));
}
export async function writeMapKeys(q: Queryable, characterId: string, keys: string[]) {
  if (keys.length) await q.query("INSERT INTO character_flags(character_id,key,value) SELECT $1,k,'true'::jsonb FROM unnest($2::text[]) AS k ON CONFLICT DO NOTHING", [characterId,keys]);
}
export function applyMapKeys(p: PlayerState, keys: string[]): MapKnowledge | null {
  if (!keys.length) return null;
  const delta = emptyMap();
  for (const k of keys) {
    p.flags.set(k, {value:true,expiresAt:null});
    if (k.startsWith('atlas:c:')) delta.cells.push(k.slice(8));
    else if (k.startsWith('atlas:p:')) delta.places.push(k.slice(8));
  }
  return delta;
}
const pending = new WeakMap<PlayerState, Set<string>>();
export async function rememberMap(q: Queryable, p: PlayerState, zone: string, x: number, y: number, entering = false): Promise<MapKnowledge | null> {
  const keys = mapKeys(p,zone,x,y,entering);
  if (!keys.length) return null;
  let busy = pending.get(p);
  if (!busy) { busy = new Set(); pending.set(p,busy); }
  const fresh = keys.filter(k => !busy.has(k));
  if (!fresh.length) return null;
  for (const k of fresh) busy.add(k);
  try {
    await writeMapKeys(q,p.charId,fresh);
    return applyMapKeys(p,fresh);
  } finally { for (const k of fresh) busy.delete(k); }
}
export async function unlockMap(q: Queryable, p: PlayerState) {
  if (p.flags.has('atlas:completo')) return;
  if (skillLevel(p,'interfaz') < MAP_INTERFACE) throw new GameError('El archivo municipal requiere Interfaz ' + MAP_INTERFACE + '.');
  await writeMapKeys(q,p.charId,['atlas:completo']);
  p.flags.set('atlas:completo', {value:true,expiresAt:null});
}
