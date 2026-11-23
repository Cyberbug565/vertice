export const CASINO_GAMES = ['ruleta', 'poker', 'rasca', 'blackjack', 'deportes', 'caballos', 'duelo'] as const;
export type CasinoGame = typeof CASINO_GAMES[number];

export const CASINO_NAMES: Record<CasinoGame, string> = {
  ruleta: 'Ruleta', poker: 'Póker de cinco cartas', rasca: 'Rasca y gana',
  blackjack: 'Blackjack', deportes: 'Deportes', caballos: 'Carreras', duelo: 'Ruleta rusa VIP',
};

export const CASINOS = {
  'ultima-ficha': { name: 'Última Ficha', tier: 'Sala de barrio', min: 10, max: 180, entry: 0, accent: '#78dda9' },
  'bobina': { name: 'La Bobina', tier: 'Sala de barrio', min: 15, max: 240, entry: 0, accent: '#ffa069' },
  'cero-rojo': { name: 'Cero Rojo', tier: 'Sala de barrio', min: 20, max: 320, entry: 0, accent: '#f27c89' },
  'hipodromo': { name: 'Hipódromo Prisma', tier: 'Casino mediano', min: 200, max: 5000, entry: 0, accent: '#72ddfa' },
  'meridiano': { name: 'Gran Meridiano', tier: 'Megacasino', min: 5000, max: 100000, entry: 50000, accent: '#f2cb86' },
} as const;
export type CasinoId = keyof typeof CASINOS;
export const VIP = { zone: 'casino-meridiano-vip', balance: 150000, reputation: 12 } as const;
export const ROULETTE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export const RED_NUMBERS: ReadonlySet<number> = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const CARD_SUITS = ['♠','♥','♦','♣'] as const;
export function casinoCard(n: number) {
  return { rank: n%13+2, label: ['2','3','4','5','6','7','8','9','10','J','Q','K','A'][n%13], suit:CARD_SUITS[Math.floor(n/13)], red:n>=13 && n<39 };
}

export interface CasinoMarket { title:string; names:string[]; weights:number[] }
const sports: CasinoMarket[] = [
  {title:'Liga del Eje · Ferro vs. Forja', names:['Ferro','Empate','Forja'], weights:[44,24,32]},
  {title:'Copa del Canal · Prisma vs. Muelle', names:['Prisma','Empate','Muelle'], weights:[51,23,26]},
  {title:'Liga del Eje · Cénit vs. Arrabal', names:['Cénit','Empate','Arrabal'], weights:[39,28,33]},
];
const track: CasinoMarket[] = [
  {title:'Copa Prisma · 1.600 m',names:['Pulso','Azogue','Bruma','Filo','Lumen','Órbita'],weights:[28,23,17,14,10,8]},
  {title:'Premio del Canal · 1.200 m',names:['Filo','Bruma','Lumen','Pulso','Órbita','Azogue'],weights:[19,25,15,21,9,11]},
  {title:'Gran Premio Nocturno · 2.000 m',names:['Órbita','Lumen','Filo','Azogue','Bruma','Pulso'],weights:[12,17,16,26,8,21]},
];
export const casinoMarket = (game:'deportes'|'caballos', heat:number) => (game==='deportes'?sports:track)[heat % 3];
export const marketReturn = (weight:number) => Math.floor(9400/weight)/100;

export type CasinoResult = {
  id:string; game:CasinoGame; stake:number; payout:number; text:string;
  player?:number[]; dealer?:number[]; number?:number; symbols?:number[]; order?:number[];
  heat?:number; score?:[number,number]; opponent?:string; houses?:number; cars?:number;
};
export type CasinoHand = { id:string; game:'blackjack'|'poker'; stake:number; player:number[]; up?:number };
export interface CasinoView {
  venue:CasinoId; zone:string; title:string; table:number; games:CasinoGame[]; balance:number;
  hand?:CasinoHand; result?:CasinoResult; heat:number;
  guests?:{id:number;name:string}[];
  invite?:{id:string; name:string; incoming:boolean; expires:number};
}
