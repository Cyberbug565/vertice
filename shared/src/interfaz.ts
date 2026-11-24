// v0.38 · Interfaz: lo que ves en pantalla depende de tu nivel. El implante de red cruza tu vista con las bases de datos de
// la ciudad: a más nivel, más capas. Es una de las habilidades más difíciles de subir (la experiencia por uso cunde menos y,
// desde el nivel 6, cada punto cuesta dos), y por eso las bandas, los carteles y las corporaciones pagan bien a quien la domina.

/** Capas de información, por nivel de Interfaz. La misma escala vale para las personas de alrededor y para tu expediente. */
export const SCAN_TIERS = [
  { level: 0, name: 'A simple vista', people: 'Nombre y lo que se ve: si va armado, si sangra.', self: 'Si la PCV te busca o no.' },
  { level: 3, name: 'Etiquetas', people: 'Si es una persona real (jugador) o un PNJ, nivel aproximado y banda.', self: 'Nivel de búsqueda exacto y precio aproximado por tu cabeza.' },
  { level: 6, name: 'Perfil', people: 'Nivel exacto, oficio, salud, arma y actitud hacia ti.', self: 'Recompensa exacta, la descripción que dieron los testigos y cuánto le dura a la PCV.' },
  { level: 10, name: 'Antecedentes', people: 'Recompensa exacta, antecedentes públicos y cromo instalado.', self: 'Quién paga por tu cabeza y tus antecedentes públicos.' },
  { level: 15, name: 'Expediente', people: 'Sus mejores habilidades, el dinero que lleva y si debe dinero.', self: 'Quién te está cazando ahora mismo y qué bandas te quieren muerto.' },
  { level: 20, name: 'Acceso raíz', people: 'RAM, humanidad, riesgo de ciberpsicosis y quién puso su recompensa.', self: 'Borrar la descripción de los testigos de la base de la PCV (una vez por hora).' },
] as const;
export function scanTier(interfaz: number) { let t = 0; for (let i = 0; i < SCAN_TIERS.length; i++) if (interfaz >= SCAN_TIERS[i].level) t = i; return t; }

/** Habilidades difíciles: la experiencia por uso se multiplica por `xp` y, desde `doubleFrom`, cada punto de habilidad cuesta 2. */
export const HARD_SKILLS: Record<string, { xp: number; doubleFrom: number }> = { interfaz: { xp: 0.45, doubleFrom: 6 } };
export function skillPointCost(skill: string, currentLevel: number) { const h = HARD_SKILLS[skill]; return h && currentLevel >= h.doubleFrom ? 2 : 1; }
export function skillXpRate(skill: string) { return HARD_SKILLS[skill]?.xp ?? 1; }

/** Ofertas de trabajo de red: desde Interfaz 8 llegan al móvil, mejores cuanto más alto. */
export const NET_OFFERS = { minLevel: 8, everyMin: 12, ttlMin: 10, days: 3 } as const;
export function netOfferPay(interfaz: number, kind: 'gang' | 'corp') {
  const k = Math.max(1, interfaz - 6), m = kind === 'corp' ? 1.35 : 1;
  return { bonus: Math.round(350 * k * m / 10) * 10, daily: Math.round(110 * k * m / 10) * 10 };
}

export interface ScanInfo {
  id: number; tier: number; name: string;
  kind?: 'jugador' | 'pnj';
  levelApprox?: string; level?: number; title?: string; faction?: string; attitude?: 'hostil' | 'recelosa' | 'neutral' | 'amistosa';
  armed?: string; bleeding?: boolean; hpPct?: number; wanted?: number;
  bounty?: number; record?: string[]; chrome?: string[];
  skills?: string[]; money?: string; debt?: boolean;
  ram?: number; humanity?: string; psycho?: boolean; bountyBy?: string[];
}

export interface NetOffer { id: string; faction: string; factionName: string; kind: 'gang' | 'corp'; bonus: number; daily: number; days: number; expiresInMin: number; pitch: string }
export interface DossierView {
  interfaz: number; tier: number; next?: { level: number; unlocks: string };
  wanted: boolean; wantedLevel?: number; decayMin?: number;
  bountyApprox?: string; bounty?: number; bountyBy?: string[];
  description?: { crime: string; minutes: number; matches: boolean }; faceCovered?: boolean;
  record?: string[]; hunters?: string[]; hostile?: string[];
  canWipe?: boolean; wipeInMin?: number;
  offers: NetOffer[]; retainer?: { factionName: string; daily: number; left: number; inMin: number };
}
/** Una cantidad en grueso (lo que se ve sin acceso a la cifra exacta). */
export function approxMoney(n: number) {
  if (n <= 0) return 'nada';
  if (n < 500) return 'menos de 500 €$';
  if (n < 2000) return 'unos cientos o pocos miles de €$';
  if (n < 10000) return 'varios miles de €$';
  if (n < 50000) return 'decenas de miles de €$';
  return 'una fortuna';
}
