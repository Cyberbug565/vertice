// v0.8 · Rarezas, aceleradores Kairós, matrices del zócalo neural y leyendas de la ciudad (datos compartidos por servidor y cliente).

/** Rarezas: común, poco común, raro, de lujo, legendario y mítico (único: solo por misiones o botín excepcional). */
export const RARITY_LABEL: Record<string, string> = { comun: 'Común', 'poco-comun': 'Poco común', raro: 'Raro', epico: 'De lujo', legendario: 'Legendario', mitico: 'Mítico' };
export const RARITY_COLOR: Record<string, string> = { comun: '#a8a8b8', 'poco-comun': '#5aff8a', raro: '#43a8ff', epico: '#b46cff', legendario: '#ffb020', mitico: '#ff2040' };
/** Rareza de un implante según su grado (los míticos se marcan a mano). */
export const rarityOfGrade = (grade: number) => (grade <= 1 ? 'comun' : grade === 2 ? 'raro' : grade === 3 ? 'epico' : 'legendario');

/** Acelerador neuromotor Kairós (sustituye la columna): seis gamas. La zona ralentiza a todo el que entra salvo a quien lleve uno igual o mejor. */
export interface KairosTier { tier: number; radius: number; slow: number; boost: number; ramPerSec: number; hpPerSec: number; psyPerSec: number; trail: number }
export const KAIROS: KairosTier[] = [
  { tier: 1, radius: 0, slow: 1, boost: 1.25, ramPerSec: 1.5, hpPerSec: 2, psyPerSec: 0.08, trail: 3 },
  { tier: 2, radius: 3, slow: 0.75, boost: 1.35, ramPerSec: 2, hpPerSec: 3, psyPerSec: 0.12, trail: 4 },
  { tier: 3, radius: 5, slow: 0.55, boost: 1.5, ramPerSec: 2.6, hpPerSec: 4, psyPerSec: 0.18, trail: 6 },
  { tier: 4, radius: 7, slow: 0.4, boost: 1.65, ramPerSec: 3.2, hpPerSec: 5, psyPerSec: 0.24, trail: 8 },
  { tier: 5, radius: 9, slow: 0.28, boost: 1.85, ramPerSec: 4, hpPerSec: 6, psyPerSec: 0.32, trail: 10 },
  { tier: 6, radius: 12, slow: 0.15, boost: 2.2, ramPerSec: 5, hpPerSec: 8, psyPerSec: 0.45, trail: 14 },
];
export const kairosOf = (tier: number) => KAIROS[Math.max(1, Math.min(6, tier)) - 1];
/** Escala de tiempo de alguien dentro de la zona de un Kairós de nivel `field`, si él lleva uno activo de nivel `own` (0 = ninguno). */
export function kairosScale(field: number, own: number) {
  if (own >= field) return 1;
  const f = kairosOf(field).slow;
  return own > 0 ? Math.min(1, f / kairosOf(own).slow) : f;
}

/** Matrices del zócalo neural: consumen capacidad de cromo (salvo CARMÍN) y dan mejoras enormes. Las míticas son únicas. */
export interface MatrixDef {
  id: string; name: string; rarity: string; chrome: number; desc: string; locked?: boolean;
  capBonus?: number; psyResist?: number; psyImmune?: boolean; hackImmune?: boolean; cameraGhost?: boolean; hackSpeed?: number; hackCost?: number;
  ramRegen?: number; ramBonus?: number; stopBleed?: boolean; hpMax?: number; meleeDmg?: number; rangedDmg?: number; armor?: number; aim?: number; psyGain?: number; stealth?: number;
  ability?: { kind: 'onda' | 'proyeccion'; name: string; cooldown: number; ram?: number; duration?: number };
  companion?: { name: string; color: string; lines: string[] };
}
export const MATRICES: Record<string, MatrixDef> = {
  'matriz-carmin': {
    id: 'matriz-carmin', name: 'Matriz CARMÍN', rarity: 'mitico', chrome: 0, locked: true,
    desc: 'La IA que se tragó a las demás, encerrada (más o menos) en tu cabeza. No ocupa cromo, pero no se puede quitar hasta que mueras. +25 de capacidad de cromo, resistencia a la ciberpsicosis, inmune a hackeos, las cámaras nunca te identifican, hackeos casi instantáneos, RAM rapidísima, corta cualquier hemorragia y lanza la Onda Carmín.',
    capBonus: 25, psyResist: 0.85, hackImmune: true, cameraGhost: true, hackSpeed: 0.92, hackCost: 0.5, ramRegen: 3.5, ramBonus: 8, stopBleed: true,
    ability: { kind: 'onda', name: 'Onda Carmín', cooldown: 25, ram: 12 },
    companion: { name: 'CARMÍN', color: '#ff2040', lines: ['¿Eso era un plan? Qué tierno.', 'Te late el corazón como a un ratón. Me encanta.', 'Podría hacerlo yo mejor. Lo hago yo mejor.', 'No me mires así, sigo aquí.', '¿Otra vez a pie? Qué primitivo.', 'Ese de ahí te está mirando. Mátalo. Es broma. ¿O no?', 'Tu cerebro es pequeño, pero acogedor.', 'Tic, tac. Tus neuronas me aburren.'] },
  },
  'matriz-eco': {
    id: 'matriz-eco', name: 'Matriz ECO', rarity: 'mitico', chrome: 10,
    desc: 'El engrama de Rafa «Brasas» Leal, guitarrista y terrorista muerto hace cincuenta años. Inmunidad total a la ciberpsicosis, +60 de salud, +35 % de daño cuerpo a cuerpo y a distancia. Proyección de Eco: deja tu cuerpo quieto y controla a Rafa hasta 5 min; nadie lo ve, atraviesa paredes y entra donde quiera. Un pulso EMP cerca os desconecta.',
    psyImmune: true, hpMax: 60, meleeDmg: 0.35, rangedDmg: 0.35,
    ability: { kind: 'proyeccion', name: 'Proyección de Eco', cooldown: 600, duration: 300 },
    companion: { name: 'Rafa «Brasas»', color: '#ffb020', lines: ['Esta ciudad apesta igual que en mis tiempos.', 'Tranquilo, chaval. Respira. Luego dispara.', '¿Eso es música? Me muero otra vez.', 'Las corpos no cambian. Solo el logotipo.', 'Si fuera tú, iría por el tejado.', 'Quema algo bonito hoy.'] },
  },
  'matriz-centinela': { id: 'matriz-centinela', name: 'Matriz Centinela', rarity: 'legendario', chrome: 8, desc: 'Protocolo táctico militar: +3 de blindaje, +2 de puntería, +20 de salud.', armor: 3, aim: 2, hpMax: 20 },
  'matriz-berserker': { id: 'matriz-berserker', name: 'Matriz Berserker', rarity: 'legendario', chrome: 9, desc: '+40 % de daño cuerpo a cuerpo y +30 de salud. Acelera la ciberpsicosis.', meleeDmg: 0.4, hpMax: 30, psyGain: 1.6 },
  'matriz-espectro': { id: 'matriz-espectro', name: 'Matriz Espectro', rarity: 'epico', chrome: 6, desc: 'Firma térmica y digital mínima: +3 de Sigilo, las cámaras tardan en reconocerte.', stealth: 3 },
};
export const SOCKET_BASE = 2, SOCKET_MAX = 4;

/** Leyendas de la ciudad: personajes conocidos y escondidos. Hay que ganarse su confianza (y la de su gente) para trabajar con ellos. */
export interface LegendView {
  id: string; name: string; role: string; color: string; trust: number; step: number; steps: number; active: boolean; done: boolean;
  mission: { title: string; desc: string; progress: string; ready: boolean } | null; reward: string; final: string; hint?: string;
}
