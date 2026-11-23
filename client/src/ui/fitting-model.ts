import { bodyKindOf, cyberSide, dressedAppearance, hashString, pairedSlot, visibleParts, withWear, type Appearance,
  type CharacterSheet, type Content, type CyberSide, type CyberwareDef, type ItemDef } from '@vertice/shared';

type Catalog = Pick<Content, 'items' | 'cyberware'>;
export type FittingSheet = Pick<CharacterSheet, 'name' | 'appearance' | 'look' | 'wear' | 'inventory' | 'cyber' | 'chrome' | 'body'>;
export interface FittingLook { appearance: Appearance; chrome: string[]; lost: string[] }

export function originalLook(sheet: FittingSheet): FittingLook {
  return { appearance: sheet.look, chrome: sheet.chrome, lost: sheet.body.lost };
}

export function garmentFits(sheet: FittingSheet, d: ItemDef) {
  const sex = d.wear?.sex;
  return !sex || sex === (bodyKindOf(sheet.appearance, hashString(`${sheet.name}#`)) === 'masculino' ? 'm' : 'f');
}

export function tryGarment(c: Catalog, sheet: FittingSheet, d: ItemDef): FittingLook {
  if (!d.wear || !garmentFits(sheet, d)) return originalLook(sheet);
  const inventory = new Map(sheet.inventory.map(i => [i.def, i.qty]));
  inventory.set(d.id, Math.max(1, inventory.get(d.id) ?? 0));
  const wear = withWear(c.items, sheet.wear, d.wear.slot, d.id);
  return { ...originalLook(sheet), appearance: dressedAppearance(c, sheet.appearance, wear, inventory, sheet.cyber) };
}

export function flatFittingAppearance(a: Appearance, items: readonly ItemDef[]): Appearance {
  if (!a.garments) return a;
  const flat = { ...a };
  const bare = new Set(a.bare?.split(',') ?? []);
  for (const id of a.garments.split(',')) {
    const wear = items.find(d => d.wear?.style === 'g:' + id)?.wear;
    if (!wear) continue;
    if (wear.slot.startsWith('torso_')) {
      flat.top = id.includes('vestido') || id.includes('mono') ? 'mono' : id.includes('abrigo') ? 'abrigo' : id.includes('sudadera') || id.includes('jersey') ? 'sudadera' : id.includes('top') ? 'top' : 'chaqueta';
      flat.jacket = wear.color;
      bare.delete('torso');
      if (id.includes('vestido')) { flat.legwear = 'falda'; flat.pants = wear.color; bare.delete('piernas'); }
      else if (wear.also?.includes('piernas')) { flat.pants = wear.color; bare.delete('piernas'); }
    } else if (wear.slot === 'piernas') {
      flat.legwear = id.includes('falda') ? 'falda' : id.includes('short') ? 'shorts' : 'pantalon';
      flat.pants = wear.color;
      bare.delete('piernas');
    } else if (wear.slot === 'pies') {
      flat.shoeStyle = id.includes('tacon') ? 'tacones' : id.includes('bota') ? 'botas' : 'zapatillas';
      flat.shoes = wear.color;
      bare.delete('pies');
    } else if (wear.slot === 'cabeza') {
      flat.headwear = id.includes('casco') ? 'casco' : id.includes('gorra') ? 'gorra' : 'gorro';
      flat.headColor = wear.color;
      bare.delete('cabeza');
    } else if (wear.slot === 'cara') { flat.eyewear = id.includes('mascara') ? 'mascara' : 'gafas'; bare.delete('cara'); }
    else if (wear.slot === 'manos') { flat.gloves = 'tacticos'; flat.gloveColor = wear.color; bare.delete('manos'); }
  }
  flat.bare = [...bare].join(',');
  return flat;
}

export function tryImplant(c: Catalog, sheet: FittingSheet, d: CyberwareDef, side: CyberSide, removeId?: string): FittingLook {
  const prefix = pairedSlot[d.slot];
  const part = prefix ? `${prefix}_${side}` : null;
  const cyber = sheet.cyber.filter(i => {
    if (i.location !== 'installed') return false;
    if (removeId) return i.id !== removeId;
    const existing = c.cyberware.find(x => x.id === i.def);
    if (!existing) return true;
    if (d.visible === 'piernas' && existing.visible === 'pierna' || d.visible === 'pierna' && existing.visible === 'piernas') return false;
    return existing.slot !== d.slot || !!prefix && (cyberSide(i.part) ?? 'der') !== side;
  });
  const implants = removeId ? cyber : [...cyber, { def: d.id, location: 'installed' as const, part }];
  const chrome = [...new Set(implants.flatMap(i => {
    const def = c.cyberware.find(x => x.id === i.def);
    return def ? visibleParts(def, i.part) : [];
  }))];
  const lost = !removeId && (d.prosthetic || !d.model)
    ? sheet.body.lost.filter(region => !visibleParts(d, part).includes(region))
    : sheet.body.lost;
  const inventory = new Map(sheet.inventory.map(i => [i.def, i.qty]));
  return { appearance: dressedAppearance(c, sheet.appearance, sheet.wear, inventory, implants), chrome, lost };
}
