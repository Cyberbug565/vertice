// Recompensas sobre jugadores y PNJ. Las de particulares retienen el dinero hasta que se cobran o caducan.
import { randomUUID } from 'node:crypto';
import type { Db, Queryable } from '../db/db.js';
import { GameError } from './effects.js';
import type { PlayerState } from './player.js';

export interface Bounty { id: string; kind: 'player' | 'npc'; targetChar: string | null; targetNpc: string | null; targetName: string; amount: number; placedBy: string | null; poster: string; reason: string; aliveOnly: boolean }

export class BountyService {
  readonly active = new Map<string, Bounty>();
  constructor(private db: Db) {}

  async load() {
    const r = await this.db.query<any>("SELECT * FROM bounties WHERE status = 'active'");
    for (const b of r.rows) this.active.set(b.id, { id: b.id, kind: b.target_kind, targetChar: b.target_char, targetNpc: b.target_npc, targetName: b.target_name, amount: Number(b.amount), placedBy: b.placed_by, poster: b.poster, reason: b.reason, aliveOnly: !!b.alive_only });
  }
  onPlayer(charId: string) { return [...this.active.values()].filter((b) => b.kind === 'player' && b.targetChar === charId); }
  onNpc(npc: string) { return [...this.active.values()].filter((b) => b.kind === 'npc' && b.targetNpc === npc); }
  totalOnPlayer(charId: string) { return this.onPlayer(charId).reduce((s, b) => s + b.amount, 0); }
  totalOnNpc(npc: string) { return this.onNpc(npc).reduce((s, b) => s + b.amount, 0); }

  /** Recompensa de un particular: el dinero sale de su saldo y queda retenido. */
  async place(p: PlayerState, kind: 'player' | 'npc', target: { charId?: string; npc?: string; name: string }, amount: number, reason: string, opId: string, aliveOnly = false): Promise<Bounty> {
    if (amount < 100) throw new GameError('La recompensa mínima es de 100 €$.');
    if (amount > p.money) throw new GameError('No tienes suficientes eurodólares para respaldar esa recompensa.');
    if (kind === 'player' && target.charId === p.charId) throw new GameError('No puedes poner precio a tu propia cabeza.');
    const b: Bounty = { id: randomUUID(), kind, targetChar: target.charId ?? null, targetNpc: target.npc ?? null, targetName: target.name, amount, placedBy: p.charId, poster: 'particular', reason, aliveOnly };
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:escrow`, p.charId, -amount, p.money - amount, `Recompensa retenida por ${target.name}`]);
      await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, amount]);
      await q.query("INSERT INTO bounties (id, target_kind, target_char, target_npc, target_name, amount, placed_by, poster, reason, status, alive_only) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)",
        [b.id, kind, b.targetChar, b.targetNpc, b.targetName, amount, p.charId, 'particular', reason, aliveOnly]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'bounty', JSON.stringify({ id: b.id })]);
    });
    p.money -= amount;
    this.active.set(b.id, b);
    return b;
  }

  /** Recompensa institucional (PCV, corporaciones): no retiene dinero de nadie. */
  async post(kind: 'player' | 'npc', target: { charId?: string; npc?: string; name: string }, amount: number, poster: string, reason: string, aliveOnly = false): Promise<Bounty> {
    const b: Bounty = { id: randomUUID(), kind, targetChar: target.charId ?? null, targetNpc: target.npc ?? null, targetName: target.name, amount, placedBy: null, poster, reason, aliveOnly };
    await this.db.query("INSERT INTO bounties (id, target_kind, target_char, target_npc, target_name, amount, poster, reason, status, alive_only) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)",
      [b.id, kind, b.targetChar, b.targetNpc, b.targetName, amount, poster, reason, aliveOnly]);
    this.active.set(b.id, b);
    return b;
  }

  async cancel(ids: string[]) {
    for (const id of ids) {
      // Las de particulares se devuelven a quien las puso (si sigue vivo).
      await this.db.tx(async (q) => {
        const r = await q.query<any>("UPDATE bounties SET status='cancelled', resolved_at=now() WHERE id=$1 AND status='active' RETURNING placed_by, amount, target_name", [id]);
        const b = r.rows[0];
        if (b?.placed_by) {
          const alive = await q.query<any>("SELECT money FROM characters WHERE id=$1 AND status <> 'dead'", [b.placed_by]);
          if (alive.rows.length) {
            await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`cancel-${id}`, b.placed_by, Number(b.amount), Number(alive.rows[0].money) + Number(b.amount), `Devolución: recompensa por ${b.target_name} anulada`]);
            await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [b.placed_by, Number(b.amount)]);
          }
        }
      });
      this.active.delete(id);
    }
  }

  /** Cobra todas las recompensas activas sobre el objetivo neutralizado. Idempotente por estado de cada recompensa. */
  async claim(claimer: PlayerState, list: Bounty[], bonus: number, opId: string): Promise<number> {
    let paid = 0;
    await this.db.tx(async (q) => {
      let bal = claimer.money;
      for (const b of list) {
        const r = await q.query("UPDATE bounties SET status='claimed', claimed_by=$2, resolved_at=now() WHERE id=$1 AND status='active' RETURNING amount", [b.id, claimer.charId]);
        if (!r.rows.length) continue;
        const amt = Math.round(Number(r.rows[0].amount) * (1 + bonus));
        bal += amt; paid += amt;
        await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:bounty:${b.id}`, claimer.charId, amt, bal, `Recompensa cobrada: ${b.targetName} (${b.poster === 'particular' ? 'particular' : b.poster})`]);
      }
      if (paid) await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [claimer.charId, paid]);
    });
    for (const b of list) this.active.delete(b.id);
    claimer.money += paid;
    return paid;
  }

  /** Al morir el objetivo sin que nadie cobre: las de particulares se devuelven, las institucionales caducan. */
  async expireForCharTx(q: Queryable, charId: string): Promise<{ placedBy: string; amount: number }[]> {
    const refunds: { placedBy: string; amount: number }[] = [];
    const r = await q.query<any>("UPDATE bounties SET status='expired', resolved_at=now() WHERE target_char=$1 AND status='active' RETURNING id, placed_by, amount, target_name", [charId]);
    for (const b of r.rows) {
      this.active.delete(b.id);
      if (!b.placed_by) continue;
      const alive = await q.query<any>("SELECT money FROM characters WHERE id=$1 AND status <> 'dead'", [b.placed_by]);
      if (!alive.rows.length) continue;
      const amt = Number(b.amount);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`refund-${b.id}`, b.placed_by, amt, Number(alive.rows[0].money) + amt, `Devolución: ${b.target_name} murió sin que nadie cobrara`]);
      await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [b.placed_by, amt]);
      refunds.push({ placedBy: b.placed_by, amount: amt });
    }
    return refunds;
  }
}
