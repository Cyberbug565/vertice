import { skillLevelForXp, t, type CharacterRecord, type Content } from '@vertice/shared';
import type { Queryable } from '../db/db.js';
import type { PlayerState } from './player.js';

export async function recordActivity(q: Queryable, charId: string, eventId: string, kind: 'kill' | 'drug_sale', detail: Record<string, unknown>, amount = 1, value = 0) {
  await q.query(`INSERT INTO character_activity (event_id, character_id, kind, amount, value, detail)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [eventId, charId, kind, amount, value, JSON.stringify(detail)]);
}

export function playedMs(p: PlayerState, now = Date.now()) {
  return Math.max(0, Math.round((p.playedMs ?? 0) + (p.playSessionAt ? Math.max(0, now - p.playSessionAt) : 0)));
}

/** Lee fuentes transaccionales y combina los valores vivos que aún no han llegado al autoguardado. */
export async function characterRecord(q: Queryable, c: Content, charId: string, p?: PlayerState): Promise<CharacterRecord | null> {
  const row = (await q.query<any>('SELECT * FROM characters WHERE id=$1', [charId])).rows[0];
  if (!row) return null;
  const [ledger, jobs, shifts, contracts, cyber, activity, inv, rep, homes, cars, post] = await Promise.all([
    q.query<any>(`SELECT coalesce(sum(delta) FILTER (WHERE delta > 0 AND op_id NOT LIKE 'start-%' AND op_id NOT LIKE 'bank:%'),0) AS earned,
      coalesce(-sum(delta) FILTER (WHERE delta < 0 AND op_id NOT LIKE 'bank:%'),0) AS spent,
      count(*) FILTER (WHERE reason='Comisión de la banda')::int AS deliveries FROM ledger WHERE character_id=$1`, [charId]),
    q.query<any>('SELECT job_id, count(*)::int AS n, sum(pay) AS pay FROM job_log WHERE character_id=$1 GROUP BY job_id', [charId]),
    q.query<any>(`SELECT reason, count(*)::int AS n, sum(delta) AS pay FROM ledger WHERE character_id=$1 AND reason LIKE 'Nómina del turno:%' GROUP BY reason`, [charId]),
    q.query<any>(`SELECT contract_id, outcome FROM contract_progress WHERE character_id=$1 AND state='completed'`, [charId]),
    q.query<any>(`SELECT a.instance_id AS id, a.def_id, a.acquired_at, CASE WHEN i.character_id=a.character_id THEN i.location ELSE 'traspasado' END AS location
      FROM character_cyberware a LEFT JOIN cyberware_instances i ON i.id=a.instance_id WHERE a.character_id=$1 ORDER BY a.acquired_at, a.instance_id`, [charId]),
    q.query<any>('SELECT kind, amount, value, detail, at FROM character_activity WHERE character_id=$1 ORDER BY at, event_id', [charId]),
    q.query<any>('SELECT def_id, qty FROM inventory_items WHERE character_id=$1 AND qty>0', [charId]),
    q.query<any>('SELECT faction_id, value FROM reputation WHERE character_id=$1', [charId]),
    q.query<any>('SELECT house_id FROM houses_owned WHERE character_id=$1', [charId]),
    q.query<any>('SELECT car_id FROM cars_owned WHERE character_id=$1', [charId]),
    q.query<any>('SELECT post_id FROM posts_held WHERE character_id=$1', [charId]),
  ]);
  const itemName = (id: string) => c.items.find((d) => d.id === id)?.name ?? id;
  const victims = activity.rows.filter((e) => e.kind === 'kill').map((e) => ({ name: String(e.detail.name), kind: e.detail.kind as 'player' | 'npc', at: new Date(e.at).toISOString(), cause: String(e.detail.cause ?? ''), place: String(e.detail.place ?? '') }));
  const sales = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const e of activity.rows.filter((e) => e.kind === 'drug_sale')) {
    const id = String(e.detail.item), sale = sales.get(id) ?? { name: itemName(id), qty: 0, revenue: 0 };
    sale.qty += e.amount; sale.revenue += Number(e.value); sales.set(id, sale);
  }
  const skillXp = p?.skillXp ?? row.skill_xp ?? {};
  const now = Date.now(), createdAt = new Date(row.created_at).toISOString(), diedAt = row.died_at ? new Date(row.died_at).toISOString() : null;
  const profession = p?.profession ?? row.profession, activeJob = p ? p.activeJob : row.active_job;
  const postDef = post.rows[0] && c.posts.find((d) => d.id === post.rows[0].post_id);
  const jobDef = c.jobs.find((d) => d.id === activeJob);
  const drugSales = [...sales.values()];
  return {
    version: 1, id: row.id, name: row.name, status: p?.status ?? row.status, createdAt, diedAt, recordedAt: new Date(now).toISOString(), historySince: new Date(row.history_since).toISOString(),
    role: c.roles.find((d) => d.id === row.role)?.name ?? row.role, origin: c.origins.find((d) => d.id === row.origin)?.name ?? row.origin,
    profession: c.professions.find((d) => d.id === profession)?.name ?? profession, professionRank: p?.professionRank ?? row.profession_rank,
    currentJob: postDef?.name ?? jobDef?.title ?? 'Sin turno activo',
    level: p?.level ?? row.level, xp: p?.xp ?? row.xp, money: p?.money ?? Number(row.money), place: c.zones.find((z) => z.id === (p?.zone ?? row.zone_id))?.name ?? row.zone_id,
    cause: row.cause_of_death ?? undefined, secondsAlive: Math.max(0, Math.floor(((diedAt ? Date.parse(diedAt) : now) - Date.parse(createdAt)) / 1000)), secondsPlayed: Math.floor((p ? playedMs(p, now) : Number(row.played_ms)) / 1000),
    appearance: p?.appearance ?? row.appearance, attributes: p?.attributes ?? row.attributes,
    skills: c.skills.map((s) => ({ name: s.name, level: skillLevelForXp(skillXp[s.id] ?? 0) })),
    reputation: (p ? [...p.rep].map(([faction_id, value]) => ({ faction_id, value })) : rep.rows).map((r) => ({ name: c.factions.find((f) => f.id === r.faction_id)?.name ?? r.faction_id, value: r.value })),
    inventory: (p ? [...p.inventory].map(([def_id, qty]) => ({ def_id, qty })) : inv.rows).filter((i) => i.qty > 0).map((i) => ({ name: itemName(i.def_id), qty: i.qty })),
    equipment: Object.entries(p?.wear ?? row.wear ?? {}).filter(([, id]) => !!id).map(([slot, id]) => ({ slot, name: itemName(String(id)) })),
    cyberware: cyber.rows.map((r) => ({ id: r.id, name: c.cyberware.find((d) => d.id === r.def_id)?.name ?? r.def_id, acquiredAt: new Date(r.acquired_at).toISOString(), location: r.location ?? 'perdido' })),
    properties: { houses: homes.rows.map((r) => c.houses.find((h) => h.id === r.house_id)?.name ?? r.house_id), cars: cars.rows.map((r) => c.cars.find((d) => d.id === r.car_id)?.name ?? r.car_id) },
    bio: p?.bio ?? row.bio ?? null,
    stats: { kills: victims.length, playerKills: victims.filter((v) => v.kind === 'player').length, npcKills: victims.filter((v) => v.kind === 'npc').length,
      drugsSold: drugSales.reduce((a, s) => a + s.qty, 0), drugRevenue: drugSales.reduce((a, s) => a + s.revenue, 0), moneyEarned: Number(ledger.rows[0].earned) + jobs.rows.reduce((a, j) => a + (c.jobs.some(d => d.id === j.job_id) ? 0 : Number(j.pay)), 0), moneySpent: Number(ledger.rows[0].spent),
      jobsCompleted: jobs.rows.reduce((a, j) => a + j.n, 0) + shifts.rows.reduce((a, j) => a + j.n, 0), shiftsCompleted: shifts.rows.reduce((a, j) => a + j.n, 0), contractsCompleted: contracts.rows.length, cyberwareAcquired: cyber.rows.length,
      gangDeliveries: ledger.rows[0].deliveries },
    victims, drugSales, jobs: [...jobs.rows.map((j) => ({ name: c.jobs.find((d) => d.id === j.job_id)?.title ?? j.job_id, count: j.n, earnings: Number(j.pay) })), ...shifts.rows.map((j) => ({ name: j.reason.replace('Nómina del turno: ', ''), count: j.n, earnings: Number(j.pay) }))],
    contracts: contracts.rows.map((r) => ({ name: t(c, c.contracts.find((d) => d.id === r.contract_id)?.title ?? r.contract_id), outcome: r.outcome })),
  };
}
