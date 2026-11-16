// v0.8.1 · Objetos míticos únicos (Matriz CARMÍN, Matriz ECO, Kairós «Cometa»…).
// Solo existe uno de cada en el servidor. El primero que completa el encargo final se lo queda; desde entonces
// la única forma de conseguirlo es matar a su portador: el mítico pasa al asesino. Si el portador muere por otra
// causa (PNJ, desangrado sin agresor, quirófano…), el mítico se pierde con él y la leyenda vuelve a ofrecerlo.
// Las cuentas de administración tienen copias de prueba que no cuentan ni bloquean a nadie.
import { randomUUID } from 'node:crypto';
import { MATRICES } from '@vertice/shared';
import type { PlayerState } from '../game/player.js';
import type { Queryable as Q } from '../db/db.js';
import type { Entity } from './entity.js';
import type { World } from './world.js';

export interface MythicTransfer { id: string; name: string; to?: PlayerState; cyberIds: string[]; installed: boolean }

export class Mythics {
  /** Portadores actuales (caché de la tabla mythic_owners). */
  readonly holders = new Map<string, { charId: string; name: string }>();
  constructor(private readonly w: World) {}

  async load() {
    this.holders.clear();
    const r = await this.w.db.query<any>("SELECT m.item_id, m.character_id, c.name FROM mythic_owners m JOIN characters c ON c.id = m.character_id WHERE c.status <> 'dead'");
    for (const row of r.rows) this.holders.set(row.item_id, { charId: row.character_id, name: row.name });
  }
  isMythicItem(id: string) { return MATRICES[id]?.rarity === 'mitico' || (this.w.c.items.find((i) => i.id === id) as any)?.rarity === 'mitico'; }
  isMythicCyber(id: string) { return (this.w.c.cyberware.find((x) => x.id === id) as any)?.rarity === 'mitico'; }
  isMythic(id: string) { return this.isMythicItem(id) || this.isMythicCyber(id); }
  nameOf(id: string) { return MATRICES[id]?.name ?? this.w.c.items.find((i) => i.id === id)?.name ?? this.w.c.cyberware.find((x) => x.id === id)?.name ?? id; }
  /** ¿Lo tiene otra persona viva? */
  heldByOther(id: string, p: PlayerState) { const h = this.holders.get(id); return h && h.charId !== p.charId ? h : null; }

  /** Reclama el mítico de forma atómica. Devuelve null si se lo queda p, o el portador que lo tiene. Las cuentas de administración no lo reclaman. */
  async claim(id: string, p: PlayerState): Promise<{ charId: string; name: string } | null> {
    if ((p as any).admin) return null;
    const r = await this.w.db.query<any>(`INSERT INTO mythic_owners (item_id, character_id) VALUES ($1,$2)
      ON CONFLICT (item_id) DO UPDATE SET character_id = EXCLUDED.character_id, since = now()
      WHERE (SELECT status FROM characters WHERE id = mythic_owners.character_id) = 'dead' OR mythic_owners.character_id = EXCLUDED.character_id
      RETURNING character_id`, [id, p.charId]);
    if (r.rows.length) { this.holders.set(id, { charId: p.charId, name: p.name }); return null; }
    await this.load();
    return this.holders.get(id) ?? { charId: '', name: 'alguien' };
  }

  /** Quién ha matado a p: el asesino explícito o quien le hirió en los últimos 2 minutos. */
  resolveKiller(e: Entity, killer?: PlayerState) {
    if (killer) return killer;
    for (const id of [e.lastHitBy, e.lastAttacker]) {
      if (id === undefined || Date.now() - (e.lastHitAt ?? 0) > 120_000) continue;
      const o = this.w.entities.get(id);
      const kp = o && o !== e ? this.w.playerOf(o) : undefined;
      if (kp) return kp;
    }
    return undefined;
  }

  /** Dentro de la transacción de muerte: pasa los míticos de la víctima a su asesino (o los libera). */
  async onDeathTx(q: Q, victim: PlayerState, killer?: PlayerState): Promise<MythicTransfer[]> {
    const rows = await q.query<any>('SELECT item_id FROM mythic_owners WHERE character_id = $1', [victim.charId]);
    const out: MythicTransfer[] = [];
    const heir = killer && killer.charId !== victim.charId && !(killer as any).admin && !(killer as any).dead ? killer : undefined;
    for (const { item_id: id } of rows.rows) {
      const name = this.nameOf(id);
      if (!heir) { await q.query('DELETE FROM mythic_owners WHERE item_id = $1', [id]); out.push({ id, name, cyberIds: [], installed: false }); continue; }
      const t: MythicTransfer = { id, name, to: heir, cyberIds: [], installed: false };
      if (this.isMythicCyber(id)) {
        const r = await q.query<any>("UPDATE cyberware_instances SET character_id=$2, location='inventory', history = history || $4::jsonb WHERE character_id=$1 AND def_id=$3 AND location IN ('inventory','installed') RETURNING id",
          [victim.charId, heir.charId, id, JSON.stringify([{ at: new Date().toISOString(), event: `arrancado del cadáver de ${victim.name} por ${heir.name}` }])]);
        t.cyberIds = r.rows.map((x: any) => x.id);
      } else {
        // La matriz puede estar en la mochila o insertada en el zócalo (CARMÍN no sale nunca… salvo de un cadáver).
        await q.query('DELETE FROM inventory_items WHERE character_id=$1 AND def_id=$2', [victim.charId, id]);
        await q.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,1) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = 1', [randomUUID(), heir.charId, id]);
      }
      await q.query('UPDATE mythic_owners SET character_id=$2, since=now() WHERE item_id=$1', [id, heir.charId]);
      out.push(t);
    }
    return out;
  }

  /** Tras la transacción: actualiza la memoria, avisa al asesino y lo anuncia a toda la ciudad. */
  afterDeath(victim: PlayerState, transfers: MythicTransfer[]) {
    for (const t of transfers) {
      if (!t.to) {
        this.holders.delete(t.id);
        this.broadcast(`★ ${t.name} se ha perdido con ${victim.name}. Su leyenda vuelve a buscar a alguien digno.`);
        continue;
      }
      const k = t.to;
      this.holders.set(t.id, { charId: k.charId, name: k.name });
      if (t.cyberIds.length) { for (const cid of t.cyberIds) if (!k.cyber.some((x) => x.id === cid)) k.cyber.push({ id: cid, def: t.id, location: 'inventory', stolen: false } as any); }
      else k.inventory.set(t.id, 1);
      const kc = [...this.w.conns.values()].find((c) => c.p?.charId === k.charId);
      if (kc) {
        this.w.send(kc, { t: 'reward', title: `★ Mítico arrebatado: ${t.name}`, lines: [`Se lo has quitado al cadáver de ${victim.name}.`, t.cyberIds.length ? 'Está sin instalar: llévalo a un matasanos.' : 'Insértalo en tu zócalo de matrices.', 'Ahora eres tú el objetivo.'] });
        this.w.send(kc, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(k) });
      }
      this.broadcast(`★ ${k.name} ha matado a ${victim.name} y le ha arrebatado ${t.name}.`, k.charId);
    }
  }
  private broadcast(text: string, except?: string) { for (const c of this.w.conns.values()) if (c.p && c.p.charId !== except) this.w.send(c, { t: 'notice', kind: 'warn', text }); }
}
