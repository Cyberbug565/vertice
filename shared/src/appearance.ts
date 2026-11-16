// Opciones de personalización del personaje (validadas en el servidor y usadas por el creador del cliente).
export const BUILDS = ['delgado', 'medio', 'robusto'] as const;
export const HAIR_STYLES = ['rapado', 'corto', 'cresta', 'largo', 'coleta', 'afro', 'moño', 'rastas', 'calvo', 'asimetrico', 'undercut', 'trenzas', 'mohicano', 'melena', 'flequillo', 'puntas', 'coleta-alta', 'rizos', 'lobo', 'dos-moños'] as const;
export const TOPS = ['chaqueta', 'gabardina', 'chaleco', 'sudadera', 'traje', 'top', 'mono'] as const;
export const FACIALS = ['ninguno', 'barba', 'bigote', 'perilla', 'barba-larga', 'patillas', 'candado'] as const;
export const FACE_SHAPES = ['ovalada', 'angulosa', 'redonda', 'alargada'] as const;
export const BROWS = ['normales', 'finas', 'gruesas', 'arqueadas', 'cortadas'] as const;
export const MAKEUPS = ['ninguno', 'delineado', 'labios', 'neon', 'pintura'] as const;
export const PIERCINGS = ['ninguno', 'nariz', 'ceja', 'labio', 'orejas', 'septum'] as const;
export const SCARS = ['ninguna', 'mejilla', 'ojo', 'frente'] as const;
export const BODY_TATTOOS = ['ninguno', 'tribal', 'circuito', 'floral', 'codigo'] as const;
export const ACCESSORIES = ['ninguno', 'gafas', 'visor', 'mascara', 'gorra', 'capucha', 'auriculares'] as const;
export const EYE_COLORS = ['#3a2a1a', '#2a6aa8', '#3a8a4a', '#8a8a8a', '#43f3ff', '#ff3fa4', '#ffd23f', '#ff3040'] as const;
export const LABELS: Record<string, string> = {
  delgado: 'Delgado', medio: 'Medio', robusto: 'Robusto', rapado: 'Rapado', corto: 'Corto', cresta: 'Cresta', largo: 'Largo', coleta: 'Coleta', afro: 'Afro', 'moño': 'Moño', rastas: 'Rastas', calvo: 'Calvo', asimetrico: 'Asimétrico',
  chaqueta: 'Chaqueta', gabardina: 'Gabardina', chaleco: 'Chaleco', sudadera: 'Sudadera', traje: 'Traje', top: 'Top', mono: 'Mono de trabajo',
  undercut: 'Undercut', trenzas: 'Trenzas', mohicano: 'Mohicano', melena: 'Melena', flequillo: 'Flequillo', puntas: 'Puntas', 'coleta-alta': 'Coleta alta', rizos: 'Rizos', lobo: 'Corte lobo', 'dos-moños': 'Dos moños',
  'barba-larga': 'Barba larga', patillas: 'Patillas', candado: 'Candado', ovalada: 'Ovalada', angulosa: 'Angulosa', redonda: 'Redonda', alargada: 'Alargada',
  normales: 'Normales', finas: 'Finas', gruesas: 'Gruesas', arqueadas: 'Arqueadas', cortadas: 'Con corte', delineado: 'Delineado', labios: 'Labios', neon: 'Neón', pintura: 'Pintura de guerra',
  nariz: 'Nariz', ceja: 'Ceja', labio: 'Labio', orejas: 'Orejas', septum: 'Septum', ninguna: 'Ninguna', mejilla: 'Mejilla', ojo: 'Ojo', frente: 'Frente',
  tribal: 'Tribal', circuito: 'Circuito', floral: 'Floral', codigo: 'Código',
  ninguno: 'Ninguno', barba: 'Barba', bigote: 'Bigote', perilla: 'Perilla', gafas: 'Gafas', visor: 'Visor', mascara: 'Máscara', gorra: 'Gorra', capucha: 'Capucha', auriculares: 'Auriculares',
};
export const CHROME_PARTS = ['cabeza', 'ojos', 'torso', 'brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'] as const;
export type ChromePart = (typeof CHROME_PARTS)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Valida y completa un aspecto (los campos nuevos son opcionales por compatibilidad). */
export function normalizeAppearance(a: any): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (!a || typeof a !== 'object') return { ok: false, error: 'Aspecto inválido' };
  for (const k of ['skin', 'hair', 'jacket', 'accent']) if (typeof a[k] !== 'string' || !HEX.test(a[k])) return { ok: false, error: `Color inválido: ${k}` };
  const v: Record<string, string> = { skin: a.skin, hair: a.hair, jacket: a.jacket, accent: a.accent,
    eyes: a.eyes ?? '#3a2a1a', pants: a.pants ?? '#1a1a24', build: a.build ?? 'medio', hairStyle: a.hairStyle ?? 'corto', top: a.top ?? 'chaqueta', facial: a.facial ?? 'ninguno', accessory: a.accessory ?? 'ninguno', tattoo: a.tattoo ?? '',
    faceShape: a.faceShape ?? 'ovalada', brows: a.brows ?? 'normales', makeup: a.makeup ?? 'ninguno', makeupColor: a.makeupColor ?? '#ff3fa4', piercing: a.piercing ?? 'ninguno', scar: a.scar ?? 'ninguna', bodyTattoo: a.bodyTattoo ?? 'ninguno',
    shirt: a.shirt ?? '#2a2a3a', shoes: a.shoes ?? '#1a1a1a' };
  if (![v.eyes, v.pants, v.makeupColor, v.shirt, v.shoes].every((x) => HEX.test(x))) return { ok: false, error: 'Color inválido' };
  if (v.tattoo && !HEX.test(v.tattoo)) return { ok: false, error: 'Tatuaje inválido' };
  const enumOk = (val: string, list: readonly string[], n: string) => (list.includes(val) ? null : `Opción inválida: ${n}`);
  const e = enumOk(v.build, BUILDS, 'complexión') ?? enumOk(v.hairStyle, HAIR_STYLES, 'peinado') ?? enumOk(v.top, TOPS, 'ropa') ?? enumOk(v.facial, FACIALS, 'vello facial') ?? enumOk(v.accessory, ACCESSORIES, 'accesorio')
    ?? enumOk(v.faceShape, FACE_SHAPES, 'cara') ?? enumOk(v.brows, BROWS, 'cejas') ?? enumOk(v.makeup, MAKEUPS, 'maquillaje') ?? enumOk(v.piercing, PIERCINGS, 'piercing') ?? enumOk(v.scar, SCARS, 'cicatriz') ?? enumOk(v.bodyTattoo, BODY_TATTOOS, 'tatuaje corporal');
  return e ? { ok: false, error: e } : { ok: true, value: v };
}
