// Opciones de personalización del personaje (validadas en el servidor y usadas por el creador del cliente).
/** v0.15 · Cuerpo base (modelos CC0 de Quaternius): la cara y la complexión cambian sobre él. Vacío = según la persona. */
export const BODIES = ['masculino', 'femenino'] as const;
/** v0.21 · Personajes cartoon de pocos polígonos (en lugar del cuerpo personalizable del kit). «voc»: Vocations and
 *  Uniforms (CC BY-SA, en el repositorio); «med»: Medieval 3D People de CraftPix (se descarga de la release «moveset»). */
export const CARTOON_MODELS: { id: string; name: string; pack: 'voc' | 'med'; file?: string; gender: 'm' | 'f' }[] = [
  { id: 'base-hombre', name: 'Urbano', pack: 'voc', gender: 'm' }, { id: 'base-mujer', name: 'Urbana', pack: 'voc', gender: 'f' },
  { id: 'ejecutivo', name: 'Ejecutivo', pack: 'voc', gender: 'm' }, { id: 'ejecutiva', name: 'Ejecutiva', pack: 'voc', gender: 'f' },
  { id: 'medico', name: 'Médico', pack: 'voc', gender: 'm' }, { id: 'enfermera', name: 'Enfermera', pack: 'voc', gender: 'f' },
  { id: 'ingeniero', name: 'Ingeniero', pack: 'voc', gender: 'm' }, { id: 'cientifico', name: 'Científico', pack: 'voc', gender: 'm' },
  { id: 'estudiante-o', name: 'Estudiante', pack: 'voc', gender: 'm' }, { id: 'estudiante-a', name: 'Estudiante', pack: 'voc', gender: 'f' },
  { id: 'profesora', name: 'Profesora', pack: 'voc', gender: 'f' }, { id: 'mecanico', name: 'Mecánico', pack: 'voc', gender: 'm' },
  { id: 'basurero', name: 'Operario de limpieza', pack: 'voc', gender: 'm' }, { id: 'bombero', name: 'Bombero', pack: 'voc', gender: 'm' },
  { id: 'policia', name: 'Agente', pack: 'voc', gender: 'm' }, { id: 'agente-trafico', name: 'Agente de tráfico', pack: 'voc', gender: 'm' },
  { id: 'soldado', name: 'Soldado', pack: 'voc', gender: 'm' },
  { id: 'med-vecino-1', name: 'Vecino del mercado', pack: 'med', file: 'city_dwellers_1', gender: 'm' }, { id: 'med-vecina-2', name: 'Vecina del mercado', pack: 'med', file: 'city_dwellers_2', gender: 'f' },
  { id: 'med-rey', name: 'Magnate', pack: 'med', file: 'king', gender: 'm' }, { id: 'med-reina', name: 'Magnate', pack: 'med', file: 'queen', gender: 'f' },
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `med-campesino-${i}`, name: `Jornalero ${i}`, pack: 'med' as const, file: `peasant_${i}`, gender: (i % 2 ? 'm' : 'f') as 'm' | 'f' })),
  ...[1, 2, 3, 4].map((i) => ({ id: `med-rico-${i}`, name: `Acomodado ${i}`, pack: 'med' as const, file: `rich_citizzens_${i}`, gender: (i % 2 ? 'm' : 'f') as 'm' | 'f' })),
];
export const BUILDS = ['delgado', 'medio', 'robusto', 'atletico', 'corpulento', 'bajo', 'alto', 'musculoso', 'curvilineo', 'esbelto', 'fornido'] as const;
export const HAIR_STYLES = ['rapado', 'corto', 'cresta', 'largo', 'coleta', 'afro', 'moño', 'rastas', 'calvo', 'asimetrico', 'undercut', 'trenzas', 'mohicano', 'melena', 'flequillo', 'puntas', 'coleta-alta', 'rizos', 'lobo', 'dos-moños', 'afro-corto', 'pompadour', 'bob', 'media-melena', 'trenza-larga', 'erizo', 'mullet', 'trenzas-pegadas', 'coleta-baja', 'ondas', 'samurai', 'pixie'] as const;
/** v0.17 · Peinados de la colección (modelos de la release «pelos»): 105 numerados y uno realista. */
export const HAIR_COLLECTION: string[] = [...Array.from({ length: 105 }, (_, i) => `pelo-${String(i + 1).padStart(3, '0')}`), 'pelo-real-001'];
export const TOPS = ['chaqueta', 'gabardina', 'chaleco', 'sudadera', 'traje', 'top', 'mono', 'camiseta', 'tirantes', 'camisa', 'bomber', 'biker', 'abrigo', 'blazer', 'haori', 'poncho', 'armadura', 'arnes', 'cortavientos', 'chubasquero', 'exo-tormenta', 'atuendo-campesino', 'atuendo-explorador'] as const;
export const FACIALS = ['ninguno', 'barba', 'bigote', 'perilla', 'barba-larga', 'patillas', 'candado'] as const;
export const FACE_SHAPES = ['ovalada', 'angulosa', 'redonda', 'alargada', 'cuadrada', 'corazon', 'ancha', 'afilada', 'diamante', 'triangular'] as const;
export const NOSES = ['recta', 'chata', 'aguilena', 'pequena', 'ancha', 'respingona', 'rota'] as const;
export const MOUTHS = ['neutra', 'sonrisa', 'seria', 'labios-gruesos', 'fina', 'mueca'] as const;
export const BROWS = ['normales', 'finas', 'gruesas', 'arqueadas', 'cortadas'] as const;
export const MAKEUPS = ['ninguno', 'delineado', 'labios', 'neon', 'pintura'] as const;
export const PIERCINGS = ['ninguno', 'nariz', 'ceja', 'labio', 'orejas', 'septum'] as const;
export const SCARS = ['ninguna', 'mejilla', 'ojo', 'frente'] as const;
export const BODY_TATTOOS = ['ninguno', 'tribal', 'circuito', 'floral', 'codigo', 'dragon', 'calavera', 'geometrico', 'mandala', 'olas', 'llamas', 'telarana', 'alas', 'koi', 'estrellas',
  'rosa', 'serpiente', 'barras', 'glitch', 'runas', 'biomecanico', 'puntillismo', 'acuarela'] as const;
/** v0.9 · Dónde va el tatuaje corporal, estilo del facial, tejidos de la ropa y calzado. */
export const TATTOO_ZONES = ['brazos', 'brazo', 'piernas', 'cuello', 'pecho', 'todo'] as const;
export const FACE_TATTOOS = ['ninguno', 'linea', 'lagrimas', 'codigo', 'puntos', 'barras', 'circuito', 'rayas', 'luna', 'tribal'] as const;
export const FABRICS = ['liso', 'cuero', 'vaquero', 'camuflaje', 'camuflaje-urbano', 'cuadros', 'punto', 'kevlar', 'carbono', 'holografico', 'lentejuelas', 'rayas', 'serpiente', 'neon',
  'malla', 'acolchado', 'pana', 'seda', 'lona', 'tactico', 'pixel', 'tigre', 'reflectante', 'circuito'] as const;
export const SHOE_STYLES = ['zapatillas', 'botas', 'botas-altas', 'botas-tacticas', 'tacones', 'mocasines', 'plataformas'] as const;
export const TOP_DETAILS = ['ninguno', 'cremallera', 'tachuelas', 'parches', 'led', 'cuello-pelo', 'reflectante', 'cinturon', 'placas'] as const;
export const ACCESSORIES = ['ninguno', 'gafas', 'visor', 'mascara', 'gorra', 'capucha', 'auriculares'] as const;
export const EYE_COLORS = ['#3a2a1a', '#2a6aa8', '#3a8a4a', '#8a8a8a', '#43f3ff', '#ff3fa4', '#ffd23f', '#ff3040'] as const;
export const LABELS: Record<string, string> = {
  masculino: 'Masculino', femenino: 'Femenino', 'exo-tormenta': 'Superarmadura «Tormenta»',
  musculoso: 'Musculoso/a', curvilineo: 'Curvilíneo/a', esbelto: 'Esbelto/a', fornido: 'Fornido/a', mullet: 'Mullet', 'trenzas-pegadas': 'Trenzas pegadas', 'coleta-baja': 'Coleta baja', ondas: 'Ondas', samurai: 'Moño samurái', pixie: 'Pixie',
  diamante: 'Diamante', triangular: 'Triangular', respingona: 'Respingona', rota: 'Rota (de boxeador)', mueca: 'Media sonrisa',
  delgado: 'Delgado', medio: 'Medio', robusto: 'Robusto', atletico: 'Atlético', corpulento: 'Corpulento', bajo: 'Bajo/a', alto: 'Alto/a',
  'afro-corto': 'Afro corto', pompadour: 'Tupé', bob: 'Bob', 'media-melena': 'Media melena', 'trenza-larga': 'Trenza larga', erizo: 'Erizo', rapado: 'Rapado', corto: 'Corto', cresta: 'Cresta', largo: 'Largo', coleta: 'Coleta', afro: 'Afro', 'moño': 'Moño', rastas: 'Rastas', calvo: 'Calvo', asimetrico: 'Asimétrico',
  chaqueta: 'Chaqueta', gabardina: 'Gabardina', chaleco: 'Chaleco', sudadera: 'Sudadera', traje: 'Traje', top: 'Top', mono: 'Mono de trabajo',
  undercut: 'Undercut', trenzas: 'Trenzas', mohicano: 'Mohicano', melena: 'Melena', flequillo: 'Flequillo', puntas: 'Puntas', 'coleta-alta': 'Coleta alta', rizos: 'Rizos', lobo: 'Corte lobo', 'dos-moños': 'Dos moños',
  cuadrada: 'Cuadrada', corazon: 'Corazón', ancha: 'Ancha', afilada: 'Afilada', recta: 'Recta', chata: 'Chata', aguilena: 'Aguileña', pequena: 'Pequeña',
  neutra: 'Neutra', sonrisa: 'Sonrisa', seria: 'Seria', 'labios-gruesos': 'Labios gruesos', fina: 'Fina',
  'barba-larga': 'Barba larga', patillas: 'Patillas', candado: 'Candado', ovalada: 'Ovalada', angulosa: 'Angulosa', redonda: 'Redonda', alargada: 'Alargada',
  normales: 'Normales', finas: 'Finas', gruesas: 'Gruesas', arqueadas: 'Arqueadas', cortadas: 'Con corte', delineado: 'Delineado', labios: 'Labios', neon: 'Neón', pintura: 'Pintura de guerra',
  nariz: 'Nariz', ceja: 'Ceja', labio: 'Labio', orejas: 'Orejas', septum: 'Septum', ninguna: 'Ninguna', mejilla: 'Mejilla', ojo: 'Ojo', frente: 'Frente',
  tribal: 'Tribal', circuito: 'Circuito', floral: 'Floral', codigo: 'Código', dragon: 'Dragón', calavera: 'Calavera', geometrico: 'Geométrico', mandala: 'Mandala', olas: 'Olas', llamas: 'Llamas', telarana: 'Telaraña', alas: 'Alas', koi: 'Carpa', estrellas: 'Estrellas',
  rosa: 'Rosa', serpiente: 'Serpiente', barras: 'Código de barras', glitch: 'Glitch', runas: 'Glifos', biomecanico: 'Biomecánico', puntillismo: 'Puntillismo', acuarela: 'Acuarela',
  brazos: 'Los dos brazos', brazo: 'Un brazo', piernas: 'Piernas', cuello: 'Cuello', pecho: 'Pecho', todo: 'Todo el cuerpo', linea: 'Línea', lagrimas: 'Lágrimas', puntos: 'Puntos', rayas: 'Rayas', luna: 'Luna',
  liso: 'Liso', cuero: 'Cuero', vaquero: 'Vaquero', camuflaje: 'Camuflaje', 'camuflaje-urbano': 'Camuflaje urbano', cuadros: 'Cuadros', punto: 'Punto', kevlar: 'Kevlar', carbono: 'Fibra de carbono', holografico: 'Holográfico', lentejuelas: 'Lentejuelas',
  malla: 'Malla', acolchado: 'Acolchado', pana: 'Pana', seda: 'Seda', lona: 'Lona', tactico: 'Táctico', pixel: 'Píxel', tigre: 'Tigre', reflectante: 'Reflectante',
  zapatillas: 'Zapatillas', botas: 'Botas', 'botas-altas': 'Botas altas', 'botas-tacticas': 'Botas tácticas', tacones: 'Tacones', mocasines: 'Mocasines', plataformas: 'Plataformas',
  cremallera: 'Cremallera', tachuelas: 'Tachuelas', parches: 'Parches', led: 'Luces LED', 'cuello-pelo': 'Cuello de pelo', cinturon: 'Cinturón', placas: 'Placas',
  camiseta: 'Camiseta', tirantes: 'Camiseta de tirantes', camisa: 'Camisa', bomber: 'Bomber', biker: 'Cazadora motera', abrigo: 'Abrigo largo', blazer: 'Americana', haori: 'Haori urbano', poncho: 'Poncho', armadura: 'Armadura ligera', arnes: 'Arnés', cortavientos: 'Cortavientos', chubasquero: 'Chubasquero',
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
    shirt: a.shirt ?? '#2a2a3a', shoes: a.shoes ?? '#1a1a1a', nose: a.nose ?? 'recta', mouth: a.mouth ?? 'neutra',
    tattooZone: a.tattooZone ?? 'brazos', tattooInk: a.tattooInk ?? '#14141e', faceTattoo: a.faceTattoo ?? 'ninguno', topPattern: a.topPattern ?? 'liso', pantsPattern: a.pantsPattern ?? 'liso', shoeStyle: a.shoeStyle ?? 'botas', topDetail: a.topDetail ?? 'ninguno', body: a.body ?? '', model: a.model ?? '' };
  if (![v.eyes, v.pants, v.makeupColor, v.shirt, v.shoes, v.tattooInk].every((x) => HEX.test(x))) return { ok: false, error: 'Color inválido' };
  if (v.top === 'exo-tormenta') return { ok: false, error: 'La superarmadura «Tormenta» no se elige al crear: hay que quitársela al Gobierno' }; // v0.16
  if (v.tattoo && !HEX.test(v.tattoo)) return { ok: false, error: 'Tatuaje inválido' };
  const enumOk = (val: string, list: readonly string[], n: string) => (list.includes(val) ? null : `Opción inválida: ${n}`);
  const e = enumOk(v.build, BUILDS, 'complexión') ?? (HAIR_COLLECTION.includes(v.hairStyle) ? null : enumOk(v.hairStyle, HAIR_STYLES, 'peinado')) ?? enumOk(v.top, TOPS, 'ropa') ?? enumOk(v.facial, FACIALS, 'vello facial') ?? enumOk(v.accessory, ACCESSORIES, 'accesorio')
    ?? enumOk(v.faceShape, FACE_SHAPES, 'cara') ?? enumOk(v.nose, NOSES, 'nariz') ?? enumOk(v.mouth, MOUTHS, 'boca') ?? enumOk(v.brows, BROWS, 'cejas') ?? enumOk(v.makeup, MAKEUPS, 'maquillaje') ?? enumOk(v.piercing, PIERCINGS, 'piercing') ?? enumOk(v.scar, SCARS, 'cicatriz') ?? enumOk(v.bodyTattoo, BODY_TATTOOS, 'tatuaje corporal')
    ?? enumOk(v.tattooZone, TATTOO_ZONES, 'zona del tatuaje') ?? enumOk(v.faceTattoo, FACE_TATTOOS, 'tatuaje facial') ?? enumOk(v.topPattern, FABRICS, 'tejido') ?? enumOk(v.pantsPattern, FABRICS, 'tejido') ?? enumOk(v.shoeStyle, SHOE_STYLES, 'calzado') ?? enumOk(v.topDetail, TOP_DETAILS, 'detalle') ?? (v.body ? enumOk(v.body, BODIES, 'cuerpo') : null) ?? (v.model && !CARTOON_MODELS.some((m) => m.id === v.model) ? 'Modelo de personaje desconocido' : null);
  return e ? { ok: false, error: e } : { ok: true, value: v };
}

/** v0.9 · Variedad de PNJ: estilos de ropa, tejidos, tatuajes, calzado y complementos según su tipo (transeúnte, banda o policía). */
export function diversifyAppearance(a: Record<string, any>, rnd: () => number, kind: 'civil' | 'gang' | 'police' | 'hierro' = 'civil') {
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rnd() * l.length)];
  const chance = (p: number) => rnd() < p;
  if (kind === 'police' || kind === 'hierro') {
    Object.assign(a, { top: kind === 'hierro' ? 'armadura' : pick(['chaleco', 'armadura', 'cortavientos']), topPattern: kind === 'hierro' ? 'carbono' : 'tactico', topDetail: pick(['reflectante', 'placas', 'cinturon']),
      legwear: 'tactico', pantsPattern: 'tactico', shoeStyle: 'botas-tacticas', eyewear: kind === 'hierro' ? 'visor-tactico' : pick(['', 'gafas-sol', 'visor-tactico']), headwear: kind === 'hierro' ? 'casco' : pick(['gorra', '', 'casco']) });
    return a;
  }
  const gang = kind === 'gang';
  a.top = pick(gang ? ['chaqueta', 'chaleco', 'sudadera', 'top', 'biker', 'bomber', 'tirantes', 'arnes', 'camiseta', 'haori', 'poncho'] : TOPS.filter((t) => t !== 'exo-tormenta'));
  a.topPattern = chance(0.45) ? 'liso' : pick(FABRICS);
  a.topDetail = chance(0.5) ? 'ninguno' : pick(gang ? ['tachuelas', 'parches', 'led', 'cremallera', 'placas'] : TOP_DETAILS);
  a.legwear = pick(['pantalon', 'pantalon', 'cargo', 'leggins', 'tactico', 'shorts', 'falda', 'bermudas', 'falda-larga']);
  a.pantsPattern = chance(0.5) ? 'liso' : pick(['vaquero', 'vaquero', 'camuflaje', 'camuflaje-urbano', 'cuero', 'cuadros', 'pana', 'lona', 'serpiente', 'holografico']);
  a.shoeStyle = pick(SHOE_STYLES);
  a.shoes = pick(['#101018', '#e8e8f0', '#5a3a1a', '#a82020', '#43f3ff', '#3a3a3a', '#d8b040']);
  a.shirt = pick(['#2a2a3a', '#e8eaf0', '#a02020', '#1a1a1a', '#43f3ff', '#ffd23f', '#5a2a6a']);
  if (chance(gang ? 0.75 : 0.35)) { a.bodyTattoo = pick(BODY_TATTOOS.slice(1)); a.tattooZone = pick(TATTOO_ZONES); a.tattooInk = pick(['#14141e', '#1a2a6a', '#6a1010', '#0a4a2a', '#43f3ff', '#ff3fa4']); }
  if (chance(gang ? 0.35 : 0.08)) { a.faceTattoo = pick(FACE_TATTOOS.slice(1)); a.tattoo = pick(['#1a1a1a', '#43f3ff', '#ff4fa0', '#ffd23f']); }
  if (chance(0.3)) a.headwear = pick(['gorra', 'gorro', 'boina', 'bandana', 'capucha', 'sombrero', 'diadema-led', 'casco-moto']);
  if (chance(0.3)) a.eyewear = pick(['gafas', 'gafas-sol', 'visor', 'monoculo', gang ? 'bandana-cara' : 'gafas', gang ? 'mascara-demonio' : 'gafas-sol', 'mascara-gas']);
  a.headColor = pick(['#1a1a1a', '#a02020', '#43f3ff', '#ffd23f', '#3a4a3a', '#ff3fa4', '#e8e8f0']);
  a.piercing = chance(gang ? 0.5 : 0.2) ? pick(PIERCINGS.slice(1)) : 'ninguno';
  a.makeup = chance(0.18) ? pick(MAKEUPS.slice(1)) : 'ninguno';
  a.brows = pick(BROWS);
  a.scar = chance(gang ? 0.3 : 0.06) ? pick(SCARS.slice(1)) : 'ninguna';
  return a;
}
