// v0.44 · Accesorios puestos en las armas de cada personaje y valores del arma con ellos (los usa el combate).
// Se guardan en character_flags con la clave «armas:mods»: { arma: { hueco: accesorio } }.
import { moddedValues, weaponClass, weaponStats, type AttachmentDef, type AttachSlot, type Content, type ItemDef } from '@vertice/shared';
import type { PlayerState } from './player.js';

export const MODS_FLAG = 'armas:mods';
export type WeaponMods = Record<string, Partial<Record<AttachSlot, string>>>;

export function modsOf(p: PlayerState): WeaponMods {
  const v = p.flags.get(MODS_FLAG)?.value;
  return v && typeof v === 'object' ? (v as WeaponMods) : {};
}
export function attachmentsOn(c: Content, p: PlayerState, weaponId: string): { id: string; def: ItemDef; att: AttachmentDef }[] {
  const slots = modsOf(p)[weaponId] ?? {};
  const out: { id: string; def: ItemDef; att: AttachmentDef }[] = [];
  for (const id of Object.values(slots)) { const def = c.items.find((i) => i.id === id); if (def?.attachment) out.push({ id, def, att: def.attachment as AttachmentDef }); }
  return out;
}
/** ¿Encaja este accesorio en esta arma? */
export function fits(c: Content, weapon: ItemDef, attachment: ItemDef) {
  const cls = weaponClass(weapon);
  return !!cls && !!attachment.attachment && (attachment.attachment.classes as string[]).includes(cls);
}
/** El arma con sus accesorios: daño, alcance, precisión, cadencia y ruido cambiados. */
export function moddedWeapon(c: Content, p: PlayerState | undefined, item: ItemDef) {
  if (!item.weapon || !p) return item.weapon;
  const atts = attachmentsOn(c, p, item.id);
  if (!atts.length) return item.weapon;
  const v = moddedValues(item as any, atts.map((a) => a.att));
  return { ...item.weapon, damage: v.damage, range: v.range, accuracy: v.accuracy, cooldown: v.cooldown, noise: v.noise };
}
/** Lo que el cliente enseña del arma: barras, accesorios y mira. */
export function weaponCard(c: Content, p: PlayerState, item: ItemDef) {
  const atts = attachmentsOn(c, p, item.id);
  const v = moddedValues(item as any, atts.map((a) => a.att));
  const sight = atts.find((a) => a.att.slot === 'mira')?.att.sight;
  return { stats: weaponStats(v), attachments: Object.fromEntries(atts.map((a) => [a.att.slot, a.id])), sight: sight ? { zoom: sight.zoom, reticle: sight.reticle } : null, values: v };
}
