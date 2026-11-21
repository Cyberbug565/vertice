export const CYBER_MODELS = {
  taller: 'mano',
  pinza: 'mano',
  circuito: 'brazo',
  servo: 'brazo',
  bio: 'brazo',
  'correo-brazo': 'brazo',
  atlas: 'brazo',
  vigia: 'brazo',
  bastion: 'brazo',
  asedio: 'brazo',
  modulo: 'antebrazo',
  protesis: 'pierna',
  corredor: 'pierna',
  'correo-pierna': 'pierna',
  grua: 'pierna',
  coloso: 'pierna',
  titan: 'pierna',
  optico: 'ojo',
  mordaza: 'mandibula',
  yelmo: 'cabeza',
  rotula: 'columna',
} as const;
export type CyberModel = keyof typeof CYBER_MODELS;
export type CyberRegion3D = (typeof CYBER_MODELS)[CyberModel];
export const CYBER_SIDES = ['izq', 'der'] as const;
export type CyberSide = (typeof CYBER_SIDES)[number];
export const pairedSlot: Record<string, string> = {
  brazo: 'brazo',
  pierna: 'pierna',
  manos: 'mano',
  ojos: 'ojo',
  antebrazo: 'antebrazo',
};
export const cyberSide = (part?: string | null): CyberSide | undefined =>
  part?.endsWith('_izq') ? 'izq' : part?.endsWith('_der') ? 'der' : undefined;
export const pairedRegion = (region: string) => ['brazo', 'pierna', 'mano', 'antebrazo', 'ojo'].includes(region);
