// v0.37 · Secuencia de contextualización de los diálogos de la calle. Antes de que un PNJ abra la boca se responde, en
// este orden: ¿dónde estoy (exterior o interior, y qué lugar)? ¿qué clase de barrio es (rico, corporativo, ocio, obrero,
// marginal, yermo)? ¿cómo de peligroso? ¿qué hora es? ¿qué tengo cerca (mobiliario, policía, cromo, armas)? y, si hay
// un jugador a la vista, ¿qué aspecto tiene (ropa cara, harapos, sin camiseta, sangrando, armado, cromado, buscado)?
// El resultado es un conjunto de etiquetas con el que el motor de voces (game/voices.ts) elige la frase más específica.
import { dangerAt } from '@vertice/shared';
import type { PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { World } from './world.js';
import type { Zone } from './zone.js';

/** Clase social de cada barrio: decide el registro con el que habla la gente. */
export const DISTRICT_CLASS: Record<string, string> = {
  colinas: 'alta', vega: 'alta', alameda: 'alta',
  cenit: 'corpo',
  'neon-rojo': 'ocio', 'estacion-central': 'ocio', 'arco-sur': 'ocio', 'terminal-intermodal': 'ocio', 'darsena-este': 'ocio', pasarelas: 'ocio',
  ferro: 'obrera', forja: 'obrera', 'fundicion-sur': 'obrera', astilleros: 'obrera', 'ronda-del-rio': 'obrera',
  arrabal: 'marginal', vertedero: 'marginal', poligono: 'marginal', 'patio-de-vias': 'marginal', 'cementerio-trenes': 'marginal', salobre: 'marginal', 'muelles-viejos': 'marginal',
  yermo: 'yermo', 'llanos-orientales': 'yermo', 'descampado-norte': 'yermo', 'barranco-seco': 'yermo',
};
export const CLASSES = ['alta', 'corpo', 'ocio', 'obrera', 'marginal', 'yermo'] as const;

/** 1-2 · Lugar y barrio (los interiores heredan el barrio de su puerta a la calle). */
export function placeTags(w: World, zone: Zone, x: number, y: number, out = new Set<string>()) {
  const def = zone.def;
  const district = w.districtOf(zone, x, y);
  out.add('barrio:' + district);
  const cls = DISTRICT_CLASS[district] ?? (def.tower ? 'corpo' : undefined);
  if (cls) out.add('clase:' + cls);
  out.add(def.kind);
  if (def.kind === 'interior') {
    if (def.casino) out.add('lugar:casino');
    if (def.nightlife) out.add('lugar:' + def.nightlife.kind);
    if (w.c.ripperdocs.some((d) => d.zone === zone.id)) out.add('lugar:clinica');
    if (zone.id.startsWith('comisaria')) out.add('lugar:comisaria');
    if (def.tower) { out.add('lugar:torre'); out.add('clase:corpo'); }
    if (zone.id.startsWith('portal:')) out.add('lugar:portal');
    if (zone.id.startsWith('casa:')) out.add('lugar:casa');
    if (zone.id.startsWith('farmacia')) out.add('lugar:farmacia');
    if (def.objects.some((o) => o.kind === 'shop' || o.kind === 'vending' || o.kind === 'dealer') && !def.casino && !def.nightlife) out.add('lugar:tienda');
  }
  // 3 · Peligro del punto exacto (una calle de Ferro puede ser roja).
  out.add('peligro:' + dangerAt(zone.grid, x, y));
  // 4 · Hora.
  const h = w.cityHour();
  out.add(h >= 21 || h < 6 ? 'noche' : 'dia');
  if (h >= 2 && h < 6) out.add('madrugada');
  return out;
}

/** Valor de la ropa que se ve (lo que el PNJ puede juzgar sin mirar tu cuenta). */
export function wornValue(w: World, p: PlayerState) {
  let v = 0;
  for (const id of Object.values(p.wear)) if (id && (p.inventory.get(id) ?? 0) > 0) v += w.c.items.find((i) => i.id === id)?.price ?? 0;
  return v;
}
/** 6 · Lo que se ve de un jugador. */
export function lookTags(w: World, pe: Entity, out = new Set<string>()) {
  const p = pe.conn?.p;
  out.add('jugador:cerca');
  const bare = (pe.appearance?.bare ?? '').split(',');
  const value = p ? wornValue(w, p) : 0;
  if (bare.includes('torso') || bare.includes('piernas')) out.add('aspecto:desnudo');
  if (value >= 8000) out.add('aspecto:caro');
  else if (value <= 300 || bare.includes('torso')) out.add('aspecto:pobre');
  if ((pe.body?.bleed ?? 0) > 0.2) out.add('jugador:sangra');
  if (pe.weaponId) out.add('jugador:armado');
  if (pe.chrome?.length) out.add('jugador:cromado');
  if (pe.chrome && pe.chrome.length >= 6) out.add('jugador:muy-cromado');
  if (p && p.wanted >= 2) out.add('jugador:buscado');
  if (p) out.add('rol:' + p.role);
  if (p?.driving) out.add('jugador:conduce');
  if (p && p.level >= 20) out.add('jugador:veterano');
  return out;
}
