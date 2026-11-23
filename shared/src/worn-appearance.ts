import type { Content, ItemDef, CyberwareDef } from './content-schema.js';
import { cyberSide, pairedRegion } from './cyber-models.js';
import type { Appearance } from './protocol.js';

export type WornSlots = Partial<Record<string, string>>;
export interface WearerImplant { def: string; location: 'inventory' | 'installed'; part?: string | null }

const SHOE_STYLE: Record<string, string> = { calzado: 'botas', deportivas: 'zapatillas', zapatos: 'mocasines' };

/** Actualiza una copia del atuendo, también cuando una prenda ocupa varios huecos. */
export function withWear(items: readonly ItemDef[], wear: WornSlots, slot: string, item: string | null): WornSlots {
  const next = { ...wear };
  if (item === null) { next[slot] = ''; return next; }
  if (item === 'default') delete next[slot];
  else {
    next[slot] = item;
    for (const extra of items.find(i => i.id === item)?.wear?.also ?? []) next[extra] = '';
  }
  for (const [other, id] of Object.entries(next)) {
    if (other !== slot && items.find(i => i.id === id)?.wear?.also?.some(extra => extra === slot)) next[other] = '';
  }
  return next;
}

export function visibleParts(def: CyberwareDef, part?: string | null): string[] {
  if (def.visible === 'ninguna') return [];
  if (def.visible === 'piernas') return ['pierna_izq', 'pierna_der'];
  if (pairedRegion(def.visible)) return [def.visible + '_' + (cyberSide(part) ?? 'der')];
  return [def.visible];
}

export function dressedAppearance(c: Pick<Content, 'items' | 'cyberware'>, base: Appearance,
  wear: WornSlots, inventory: ReadonlyMap<string, number>, cyber: readonly WearerImplant[]): Appearance {
  const a: Appearance = { ...base };
  // v0.22 · Prendas 3D, ropa interior y partes al aire. Un hueco vacío ('') es que se ha quitado lo de serie.
  const worn = (slot: string) => { const id = wear[slot]; const it = id ? c.items.find((i) => i.id === id) : undefined; return it?.wear && (inventory.get(it.id) ?? 0) > 0 ? it : undefined; };
  const garments: string[] = [], bare = new Set<string>();
  const covered = new Set<string>();
  for (const slot of Object.keys(wear)) { const it = worn(slot); if (it?.wear?.also) for (const s2 of it.wear.also) covered.add(s2); }
  const off = (slot: string) => wear[slot] === '' && !covered.has(slot);
  if (off('torso_int') && !worn('torso_ext') || off('torso_ext') && !worn('torso_int')) bare.add('torso');
  for (const [slot, part] of [['piernas', 'piernas'], ['pies', 'pies'], ['cabeza', 'cabeza'], ['cara', 'cara'], ['manos', 'manos']] as const) if (off(slot)) bare.add(part);
  for (const slot of ['torso_int', 'torso_ext', 'piernas', 'pies', 'cabeza', 'cara', 'manos', 'accesorio']) {
    const it = worn(slot);
    if (!it?.wear?.style.startsWith('g:')) continue;
    garments.push(it.wear.style.slice(2));
    // Lo que tapa la prenda 3D no se dibuja con la ropa de serie (queda «al aire» debajo de la prenda).
    for (const s2 of [slot, ...(it.wear.also ?? [])]) bare.add(s2 === 'torso_int' || s2 === 'torso_ext' ? 'torso' : s2);
  }
  // Con una prenda 3D en el tronco, la de serie solo se queda si el otro hueco lleva ropa clásica.
  const classicTorso = ['torso_int', 'torso_ext'].some((s2) => worn(s2) && !worn(s2)!.wear!.style.startsWith('g:'));
  if (classicTorso) bare.delete('torso');
  for (const [slot, key] of [['interior_sup', 'underTop'], ['interior_inf', 'underBottom']] as const) {
    if (wear[slot] === '') { a[key] = ''; continue; }
    const it = worn(slot);
    if (it?.wear?.style.startsWith('u:')) { a[key] = it.wear.style.slice(2); a[key === 'underTop' ? 'underTopColor' : 'underBottomColor'] = it.wear.color; }
  }
  if (garments.length) a.garments = garments.join(',');
  if (bare.size) a.bare = [...bare].join(',');
  for (const [slot, id] of Object.entries(wear)) {
    const it = id ? c.items.find((i) => i.id === id) : undefined;
    if (!it?.wear || (inventory.get(it.id) ?? 0) <= 0) continue;
    const w = it.wear;
    if (w.style.startsWith('g:') || w.style.startsWith('u:') || slot === 'accesorio') continue;
    if (slot === 'torso_ext') { a.top = w.style; a.jacket = w.color; a.outer = w.style; a.topPattern = w.pattern ?? 'liso'; a.topDetail = w.detail ?? 'ninguno'; if (w.accent) a.accent2 = w.accent; }
    else if (slot === 'torso_int') { a.shirt = w.color; if (!wear.torso_ext || (inventory.get(wear.torso_ext) ?? 0) <= 0) { a.top = w.style; a.jacket = w.color; a.topPattern = w.pattern ?? 'liso'; a.topDetail = w.detail ?? 'ninguno'; if (w.accent) a.accent2 = w.accent; } }
    else if (slot === 'piernas') { a.pants = w.color; a.legwear = w.style; a.pantsPattern = w.pattern ?? 'liso'; }
    else if (slot === 'pies') { a.shoes = w.color; a.shoeStyle = SHOE_STYLE[w.style] ?? w.style; }
    else if (slot === 'cabeza') { a.headwear = w.style; a.headColor = w.color; }
    else if (slot === 'cara') { a.eyewear = w.style; a.accessory = 'ninguno'; }
    else if (slot === 'manos') { a.gloves = w.style; a.gloveColor = w.color; } // v0.16 · guantes
    if (it.rarity === 'legendario' || it.rarity === 'epico') a.rarityGlow = it.rarity === 'legendario' ? '#ffd23f' : '#b46cff';
  }
  // v0.16 · Gama del cromo visible de cada parte (según el grado y la rareza del implante): chatarra barata hasta lujo.
  const tiers: Record<string, string> = {};
  const rank = (t: string) => ['chatarra', 'estandar', 'militar', 'lujo'].indexOf(t);
  for (const ci of cyber) {
    if (ci.location !== 'installed') continue;
    const d = c.cyberware.find((x) => x.id === ci.def);
    if (!d || d.visible === 'ninguna') continue;
    const r = d.rarity ?? '';
    const t = r === 'mitico' || r === 'legendario' || d.grade >= 5 ? 'lujo' : d.grade >= 4 || r === 'epico' ? 'militar' : d.grade >= 2 ? 'estandar' : 'chatarra';
    const parts = visibleParts(d, ci.part);
    if (d.model) for (const part of parts) (a.chromeModels ??= {})[part] = d.model;
    for (const pt of parts) if (!tiers[pt] || rank(t) > rank(tiers[pt])) tiers[pt] = t;
  }
  if (Object.keys(tiers).length) a.chromeTier = tiers;
  return a;
}
