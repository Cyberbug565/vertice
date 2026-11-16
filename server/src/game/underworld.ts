import { UNDERWORLD_RANKS, type Content, type UnderworldDef, type UnderworldStatus } from '@vertice/shared';

interface SaleJob {
  phase: 'sale'; crew: string; item: string; qty: number; buyer: string;
}
interface CashJob {
  phase: 'cash'; crew: string; item: string; qty: number; base: string; gross: number; commission: number; deadline: number;
}
export interface UnderworldState {
  rep?: number; crew?: string; deliveries?: number; job?: SaleJob | CashJob;
  cooldownUntil?: number;
}

type Crew = UnderworldDef['crews'][number];

export function alliedCrews(c: Content, crew: Crew, otherId: string) {
  const principal = crew.parent ?? crew.id;
  return otherId === principal || c.underworld.crews.some((other) => other.id === otherId && other.parent === principal);
}

export function crewRivals(c: Content, crew: Crew) {
  const principal = c.underworld.crews.find((f) => f.id === crew.parent);
  return [...new Set([...crew.rivals, ...(principal?.rivals ?? [])])].filter((id) => !alliedCrews(c, crew, id));
}

export function underworldStatus(c: Content, state: UnderworldState): UnderworldStatus {
  const crew = c.underworld.crews.find((f) => f.id === state.crew);
  const name = (id: string) => c.factions.find((f) => f.id === id)?.name ?? id;
  const deliveries = state.deliveries ?? 0;
  const rank = UNDERWORLD_RANKS.findLast((r) => deliveries >= r.min)!.name;
  const membership = crew ? { id: crew.id, name: name(crew.id), rank, deliveries, rivals: crewRivals(c, crew).map(name) } : null;
  const job = state.job;
  const buyer = job?.phase === 'sale' ? c.underworld.buyers.find((b) => b.id === job.buyer) : undefined;
  const base = job?.phase === 'cash' && crew?.bases.find((b) => b.id === job.base);
  const district = buyer && c.zones.find((z) => z.id === buyer.zone)?.districts.find(({ rect: [rx, ry, w, h] }) => {
    const [x, y] = buyer.at;
    return x >= rx && y >= ry && x < rx + w && y < ry + h;
  });
  const item = job && (c.items.find((i) => i.id === job.item)?.name ?? job.item);
  return { rep: state.rep ?? 0, membership,
    job: job?.phase === 'sale' && buyer ? { phase: 'sale', item: item!, qty: job.qty, target: buyer.name, place: district?.name ?? buyer.name }
      : job?.phase === 'cash' && base ? { phase: 'cash', item: item!, qty: job.qty, target: base.name, place: c.zones.find((z) => z.id === base.zone)?.name ?? base.name,
        cash: job.gross, commission: job.commission, deadline: job.deadline }
      : null,
  };
}
