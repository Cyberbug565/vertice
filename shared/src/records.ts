import type { Appearance } from './protocol.js';

/** Expediente de una sola vida. El memorial conserva una copia al morir. */
export interface CharacterRecord {
  version: 1; id: string; name: string; status: 'alive' | 'downed' | 'dead';
  createdAt: string; diedAt: string | null; recordedAt: string; historySince: string;
  role: string; origin: string; profession: string; professionRank: number; currentJob: string;
  level: number; xp: number; money: number; place: string; cause?: string;
  secondsAlive: number; secondsPlayed: number;
  appearance: Appearance; attributes: Record<string, number>; skills: { name: string; level: number }[];
  reputation: { name: string; value: number }[];
  inventory: { name: string; qty: number }[]; equipment: { slot: string; name: string }[];
  cyberware: { id: string; name: string; acquiredAt: string; location: string }[];
  properties: { houses: string[]; cars: string[] };
  bio: { objective: string; childhood: string; event: string; done: boolean } | null;
  stats: { kills: number; playerKills: number; npcKills: number; drugsSold: number; drugRevenue: number;
    moneyEarned: number; moneySpent: number; jobsCompleted: number; shiftsCompleted: number;
    contractsCompleted: number; cyberwareAcquired: number; gangDeliveries: number };
  victims: { name: string; kind: 'player' | 'npc'; at: string; cause: string; place: string }[];
  drugSales: { name: string; qty: number; revenue: number }[];
  jobs: { name: string; count: number; earnings: number }[];
  contracts: { name: string; outcome: string | null }[];
}

export interface CharacterSummary {
  id: string; name: string; status: 'alive' | 'downed'; role: string; origin: string;
  level: number; money: number; zone_id: string; profession: string; created_at: string;
}

export interface AccountRoster {
  account: { id: string; username: string }; character: CharacterSummary | null;
  characters: CharacterSummary[]; online: boolean;
  memorial: { character_id: string; summary: import('./protocol.js').DeathSummary; created_at: string }[];
}
