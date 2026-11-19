// v0.22 · Prendas 3D de la release «ropa» (ajustadas a los dos cuerpos con tools de Blender) y ropa interior.
// Archivo generado: no editar a mano (se rehace con el catálogo de prendas).

export interface GarmentDef { id: string; slot: string; sex: 'u' | 'm' | 'f'; layer: number; hidesHair: boolean; extra: boolean; also: string[] }
export const GARMENTS: GarmentDef[] = [
  { id: 'abrigo-monje', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-capucha-cyber', slot: 'torso_ext', sex: 'f', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-clasica-cyber', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-csi', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-plata', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-caqui', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-tactica-velcro', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'cazadora-cremallera', slot: 'torso_ext', sex: 'u', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'chaqueta-2099', slot: 'torso_ext', sex: 'f', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'abrigo-pop', slot: 'torso_ext', sex: 'f', layer: 3, hidesHair: false, extra: false, also: [] },
  { id: 'jersey-cyber', slot: 'torso_int', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'sudadera-gruesa', slot: 'torso_int', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'jersey-pulover', slot: 'torso_int', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'top-futurista', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'top-alas', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'top-pop', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'mono-bolsillos', slot: 'torso_int', sex: 'u', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'mono-poli-cyber', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'body-cyber', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'conjunto-dorado', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'corse-scifi', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'vestido-scifi', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'traje-scifi', slot: 'torso_int', sex: 'f', layer: 1, hidesHair: false, extra: false, also: ["piernas"] },
  { id: 'pantalon-cuero-ajustado', slot: 'piernas', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'pantalon-cyber', slot: 'piernas', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'pantalon-parka', slot: 'piernas', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'cargo-futurista', slot: 'piernas', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'pantalon-alas', slot: 'piernas', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'pantalon-pop', slot: 'piernas', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'falda-volantes', slot: 'piernas', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'falda-larga', slot: 'piernas', sex: 'f', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'botas-futuristas', slot: 'pies', sex: 'u', layer: 2, hidesHair: false, extra: false, also: [] },
  { id: 'botas-cordones', slot: 'pies', sex: 'u', layer: 2, hidesHair: false, extra: false, also: [] },
  { id: 'botas-striker', slot: 'pies', sex: 'u', layer: 2, hidesHair: false, extra: false, also: [] },
  { id: 'guantes-nudillos', slot: 'manos', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'guantes-striker', slot: 'manos', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'casco-holo', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'casco-cupula', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'casco-scifi', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'casco-ronin', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'capucha-cyber', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'gorra-striker', slot: 'cabeza', sex: 'u', layer: 2, hidesHair: true, extra: false, also: [] },
  { id: 'pasamontanas', slot: 'cara', sex: 'u', layer: 1, hidesHair: true, extra: false, also: [] },
  { id: 'mascara-carbono', slot: 'cara', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'mascara-cyber', slot: 'cara', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'mascara-estilizada', slot: 'cara', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'mascara-tactica', slot: 'cara', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'gafas-striker', slot: 'cara', sex: 'u', layer: 1, hidesHair: false, extra: false, also: [] },
  { id: 'chaleco-placas', slot: 'accesorio', sex: 'u', layer: 4, hidesHair: false, extra: false, also: [] },
  { id: 'cascos-tacticos', slot: 'accesorio', sex: 'u', layer: 4, hidesHair: false, extra: false, also: [] },
];

/** Ropa interior: se pinta sobre la piel con las máscaras interior-<cuerpo>.png (canal = forma; encaje = calado). */
export interface UnderwearDef { id: string; name: string; part: 'sup' | 'inf'; sex: 'm' | 'f'; channel: number; lace: boolean }
export const UNDERWEAR: UnderwearDef[] = [
  { id: 'calzoncillos', name: 'Calzoncillos', part: 'inf', sex: 'm', channel: 0, lace: false },
  { id: 'boxer', name: 'Bóxer', part: 'inf', sex: 'm', channel: 1, lace: false },
  { id: 'camiseta-interior', name: 'Camiseta interior', part: 'sup', sex: 'm', channel: 2, lace: false },
  { id: 'braguitas', name: 'Braguitas', part: 'inf', sex: 'f', channel: 0, lace: false },
  { id: 'braguitas-encaje', name: 'Braguitas de encaje', part: 'inf', sex: 'f', channel: 0, lace: true },
  { id: 'tanga', name: 'Tanga', part: 'inf', sex: 'f', channel: 1, lace: false },
  { id: 'tanga-encaje', name: 'Tanga de encaje', part: 'inf', sex: 'f', channel: 1, lace: true },
  { id: 'sujetador', name: 'Sujetador', part: 'sup', sex: 'f', channel: 2, lace: false },
  { id: 'sujetador-encaje', name: 'Sujetador de encaje', part: 'sup', sex: 'f', channel: 2, lace: true },
  { id: 'top-deportivo', name: 'Top deportivo', part: 'sup', sex: 'f', channel: 3, lace: false },
];

/** Ropa interior de serie de cada cuerpo (si no se ha elegido otra ni se ha quitado). */
export const DEFAULT_UNDER: Record<'masculino' | 'femenino', { sup: string; inf: string; color: string }> = { masculino: { sup: '', inf: 'calzoncillos', color: '#22222c' }, femenino: { sup: 'sujetador', inf: 'braguitas', color: '#22222c' } };

export const garmentById = (id: string) => GARMENTS.find((g) => g.id === id);
export const underwearById = (id: string) => UNDERWEAR.find((u) => u.id === id);
/** Qué cuerpo tiene una persona (el elegido o, si no, según su barba o su nombre): igual en el servidor y en el cliente. */
export function bodyKindOf(a: { body?: string; facial?: string } | undefined, seed: number): 'masculino' | 'femenino' {
  if (a?.body === 'masculino' || a?.body === 'femenino') return a.body;
  if (['barba', 'barba-larga', 'candado', 'perilla', 'bigote'].includes(a?.facial ?? '')) return 'masculino';
  return seed % 2 ? 'masculino' : 'femenino';
}
