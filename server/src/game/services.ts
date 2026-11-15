// Hechos de distrito (con caducidad) e instancias compartidas de encargos.
import { randomUUID } from 'node:crypto';
import type { Content } from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';

export class FactService {
  private facts = new Map<string, { value: unknown; expiresAt: number | null }>();
  constructor(private db: Db) {}
  async load() {
    const r = await this.db.query<any>('SELECT key, value, expires_at FROM world_facts');
    for (const x of r.rows) this.facts.set(x.key, { value: x.value, expiresAt: x.expires_at ? new Date(x.expires_at).getTime() : null });
  }
  get(key: string): unknown {
    const f = this.facts.get(key);
    if (!f || (f.expiresAt && f.expiresAt <= Date.now())) return false;
    return f.value;
  }
  all(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of this.facts.keys()) { const v = this.get(k); if (v !== false) out[k] = v; }
    return out;
  }
  async setTx(q: Queryable, key: string, value: unknown, ttlMinutes: number | undefined, source: string) {
    const exp = ttlMinutes ? new Date(Date.now() + ttlMinutes * 60000) : null;
    await q.query(`INSERT INTO world_facts (key, value, expires_at, source, updated_at) VALUES ($1,$2,$3,$4, now())
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, source = EXCLUDED.source, updated_at = now()`,
      [key, JSON.stringify(value), exp, source]);
    return () => this.facts.set(key, { value, expiresAt: exp ? exp.getTime() : null });
  }
  /** Elimina hechos caducados; devuelve true si algo cambió. */
  async expire(): Promise<boolean> {
    const now = Date.now(); const gone: string[] = [];
    for (const [k, f] of this.facts) if (f.expiresAt && f.expiresAt <= now) gone.push(k);
    if (!gone.length) return false;
    for (const k of gone) this.facts.delete(k);
    await this.db.query('DELETE FROM world_facts WHERE key = ANY($1) AND expires_at <= now()', [gone]).catch(() => {});
    return true;
  }
}

export interface Instance { id: string; contractId: string; version: number; state: 'open' | 'resolved'; objectives: Record<string, boolean>; contributors: Record<string, string[]>; participants: Set<string> }

export class InstanceService {
  readonly byId = new Map<string, Instance>();
  constructor(private db: Db, private content: Content) {}
  async load() {
    const r = await this.db.query<any>('SELECT * FROM contract_instances');
    for (const x of r.rows) this.byId.set(x.id, { id: x.id, contractId: x.contract_id, version: x.version, state: x.state, objectives: x.objectives, contributors: x.contributors, participants: new Set() });
    const p = await this.db.query<any>("SELECT instance_id, character_id FROM contract_progress WHERE state <> 'abandoned'");
    for (const x of p.rows) this.byId.get(x.instance_id)?.participants.add(x.character_id);
  }
  participants(id: string) { return this.byId.get(id)?.participants.size ?? 0; }

  /** Obtiene (o crea) la instancia abierta del encargo dentro de la transacción. */
  async openInstanceTx(q: Queryable, contractId: string): Promise<{ id: string; version: number; created: boolean }> {
    const def = this.content.contracts.find((c) => c.id === contractId)!;
    const id = randomUUID();
    await q.query(`INSERT INTO contract_instances (id, contract_id, version, state) VALUES ($1,$2,$3,'open') ON CONFLICT (contract_id) WHERE state = 'open' DO NOTHING`, [id, contractId, def.version]);
    const r = await q.query<any>("SELECT id, version FROM contract_instances WHERE contract_id = $1 AND state = 'open'", [contractId]);
    return { id: r.rows[0].id, version: r.rows[0].version, created: r.rows[0].id === id };
  }
}
