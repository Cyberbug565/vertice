// Aplicación transaccional de efectos acotados. Todo se escribe en una transacción y solo después se refleja en memoria.
import { randomUUID } from 'node:crypto';
import { maxHp, maxStamina, t, RULES, type Content, type Effect } from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';
import { effective, recomputeLevel, type PlayerState } from './player.js';
import type { FactService, InstanceService } from './services.js';

export class GameError extends Error {}

export interface EffectOutcome {
  lines: string[]; notices: string[]; startTasks: string[]; factsChanged: boolean; journalChanged: boolean;
  completed?: { contract: string; title: string; outcome: string }; levelUp?: number;
  objectiveDone: { instanceId: string; objective: string; shared: boolean }[];
  open?: { kind: 'shop' | 'clinic' | 'jobs' | 'bounties' | 'market'; id?: string };
  wanted?: number;
  missionRide?: string;
}

export interface OpContext { opId: string; kind: string; dialogId?: string; nodeId?: string; optionId?: string; extra?: Record<string, unknown> }

export class EffectEngine {
  constructor(private db: Db, private c: Content, private facts: FactService, private inst: InstanceService) {}

  async isProcessed(opId: string): Promise<boolean> {
    const r = await this.db.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
    return r.rows.length > 0;
  }

  async apply(p: PlayerState, effects: Effect[], ctx: OpContext): Promise<EffectOutcome> {
    const out: EffectOutcome = { lines: [], notices: [], startTasks: [], factsChanged: false, journalChanged: false, objectiveDone: [] };
    const mem: (() => void)[] = [];
    // Copia de trabajo de los valores que se modifican (la memoria solo cambia tras COMMIT).
    let money = p.money, xp = p.xp, hp = p.hp, stamina = p.stamina, luck = p.luck;
    const xp0 = p.xp;
    const inv = new Map(p.inventory);
    const rep = new Map(p.rep);
    const contracts = new Map([...p.contracts].map(([k, v]) => [k, { ...v, objectives: { ...v.objectives } }]));
    let decisionContract: { id: string; version: number; instance: string } | null = null;

    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [ctx.opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      let i = 0;
      for (const e of effects) {
        i++;
        if ('money' in e) {
          let delta = e.money;
          if (e.byContribution && delta > 0) {
            const cp = [...contracts.values()].find((x) => x.state === 'active');
            const ins = cp && this.inst.byId.get(cp.instanceId);
            const contributed = ins && Object.values(ins.contributors).some((arr) => arr.includes(p.charId));
            if (!contributed) { delta = Math.floor(delta / 2); out.lines.push('Pago reducido al 50 %: no consta tu contribución directa'); }
          }
          if (money + delta < 0) throw new GameError('No tienes suficientes eurodólares');
          money += delta;
          await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${ctx.opId}:m${i}`, p.charId, delta, money, e.reason]);
          out.lines.push(`${delta >= 0 ? '+' : ''}${delta} €$ · ${e.reason}`);
        } else if ('item' in e) {
          const have = inv.get(e.item) ?? 0;
          if (have + e.qty < 0) throw new GameError('No tienes ese objeto');
          inv.set(e.item, have + e.qty);
          if (e.qty >= 0) {
            await q.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)
                           ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + EXCLUDED.qty`, [randomUUID(), p.charId, e.item, e.qty]);
          } else {
            const r = await q.query('UPDATE inventory_items SET qty = qty + $3 WHERE character_id = $1 AND def_id = $2 AND qty + $3 >= 0 RETURNING qty', [p.charId, e.item, e.qty]);
            if (!r.rows.length) throw new GameError('No tienes ese objeto');
          }
          const name = this.c.items.find((x) => x.id === e.item)?.name ?? e.item;
          out.lines.push(`${e.qty > 0 ? '+' : ''}${e.qty} ${name}`);
        } else if ('flag' in e) {
          const exp = e.ttlSeconds ? new Date(Date.now() + e.ttlSeconds * 1000) : null;
          await q.query(`INSERT INTO character_flags (character_id, key, value, expires_at) VALUES ($1,$2,$3,$4)
                         ON CONFLICT (character_id, key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`, [p.charId, e.flag, JSON.stringify(e.value), exp]);
          mem.push(() => p.flags.set(e.flag, { value: e.value, expiresAt: exp ? exp.getTime() : null }));
          if (e.flag.startsWith('pista:')) {
            out.journalChanged = true;
            const mission = this.c.contracts.find(k => k.id === e.flag.slice('pista:'.length));
            if (mission && !p.flags.has(e.flag)) out.notices.push(`Nueva pista en el diario: ${t(this.c, mission.title)}`);
          }
        } else if ('rep' in e) {
          rep.set(e.rep, (rep.get(e.rep) ?? 0) + e.delta);
          await q.query(`INSERT INTO reputation (character_id, faction_id, value) VALUES ($1,$2,$3)
                         ON CONFLICT (character_id, faction_id) DO UPDATE SET value = reputation.value + EXCLUDED.value`, [p.charId, e.rep, e.delta]);
          const fname = this.c.factions.find((f) => f.id === e.rep)?.name ?? e.rep;
          out.lines.push(`${e.delta >= 0 ? '+' : ''}${e.delta} ${e.rep === 'calle' ? 'reputación callejera' : `reputación · ${fname}`}`);
        } else if ('xp' in e) {
          xp += e.xp; out.lines.push(`+${e.xp} XP`);
        } else if ('fact' in e) {
          mem.push(await this.facts.setTx(q, e.fact, e.value, e.ttlMinutes, `${p.charId}:${ctx.opId}`));
          out.factsChanged = true;
        } else if ('acceptContract' in e) {
          const def = this.c.contracts.find((k) => k.id === e.acceptContract)!;
          const cur = contracts.get(def.id);
          if (cur?.state === 'active') throw new GameError('Ya tienes este encargo activo');
          if (cur?.state === 'completed') throw new GameError('Ya completaste este encargo');
          if (def.closedWhileFact && this.facts.get(def.closedWhileFact.fact) === def.closedWhileFact.is) throw new GameError('Este encargo no está disponible ahora');
          const ins = await this.inst.openInstanceTx(q, def.id);
          await q.query(`INSERT INTO contract_progress (character_id, instance_id, contract_id, version, state) VALUES ($1,$2,$3,$4,'active')
                         ON CONFLICT (character_id, instance_id) DO UPDATE SET state = 'active', updated_at = now()`, [p.charId, ins.id, def.id, ins.version]);
          const shared = (await q.query<any>('SELECT objectives, contributors, state FROM contract_instances WHERE id = $1', [ins.id])).rows[0];
          contracts.set(def.id, { instanceId: ins.id, contractId: def.id, version: ins.version, state: 'active', objectives: { ...shared.objectives }, outcome: null });
          mem.push(() => {
            let m = this.inst.byId.get(ins.id);
            if (!m) { m = { id: ins.id, contractId: def.id, version: ins.version, state: shared.state, objectives: shared.objectives, contributors: shared.contributors, participants: new Set() }; this.inst.byId.set(ins.id, m); }
            m.participants.add(p.charId);
          });
          decisionContract = { id: def.id, version: ins.version, instance: ins.id };
          out.journalChanged = true;
          out.lines.push(`Encargo aceptado: ${t(this.c, def.title)}`);
        } else if ('abandonContract' in e) {
          const cp = contracts.get(e.abandonContract);
          if (!cp || cp.state !== 'active') throw new GameError('No tienes ese encargo activo');
          await q.query("UPDATE contract_progress SET state='abandoned', updated_at=now() WHERE character_id=$1 AND instance_id=$2", [p.charId, cp.instanceId]);
          cp.state = 'abandoned';
          decisionContract = { id: cp.contractId, version: cp.version, instance: cp.instanceId };
          mem.push(() => this.inst.byId.get(cp.instanceId)?.participants.delete(p.charId));
          out.journalChanged = true;
        } else if ('completeObjective' in e) {
          const cp = [...contracts.values()].find((x) => x.state === 'active' && this.c.contracts.find((k) => k.id === x.contractId)!.objectives.some((o) => o.id === e.completeObjective));
          if (!cp) throw new GameError('No tienes un encargo activo para este objetivo');
          const def = this.c.contracts.find((k) => k.id === cp.contractId)!;
          const obj = def.objectives.find((o) => o.id === e.completeObjective)!;
          cp.objectives[obj.id] = true;
          decisionContract = { id: def.id, version: cp.version, instance: cp.instanceId };
          if (obj.shared) {
            const r = await q.query<any>(`UPDATE contract_instances SET objectives = objectives || $2::jsonb,
                contributors = jsonb_set(contributors, $3, COALESCE(contributors->$4, '[]'::jsonb) || $5::jsonb)
              WHERE id = $1 RETURNING objectives`, [cp.instanceId, JSON.stringify({ [obj.id]: true }), `{${obj.id}}`, obj.id, JSON.stringify([p.charId])]);
            const objectives = r.rows[0].objectives as Record<string, boolean>;
            const allShared = def.objectives.filter((o) => o.shared).every((o) => objectives[o.id]);
            if (allShared) await q.query("UPDATE contract_instances SET state='resolved', resolved_at=now() WHERE id=$1 AND state='open'", [cp.instanceId]);
            mem.push(() => {
              const m = this.inst.byId.get(cp.instanceId);
              if (m) { m.objectives = objectives; (m.contributors[obj.id] ??= []).push(p.charId); if (allShared) m.state = 'resolved'; }
            });
          } else {
            await q.query('UPDATE contract_progress SET objectives = objectives || $3::jsonb, updated_at=now() WHERE character_id=$1 AND instance_id=$2', [p.charId, cp.instanceId, JSON.stringify({ [obj.id]: true })]);
          }
          out.objectiveDone.push({ instanceId: cp.instanceId, objective: obj.id, shared: obj.shared });
          out.journalChanged = true;
          out.lines.push(`Objetivo cumplido: ${t(this.c, obj.text)}`);
        } else if ('completeContract' in e) {
          const cp = contracts.get(e.completeContract);
          if (!cp || cp.state !== 'active') throw new GameError('El encargo no está activo');
          await q.query("UPDATE contract_progress SET state='completed', outcome=$3, updated_at=now() WHERE character_id=$1 AND instance_id=$2", [p.charId, cp.instanceId, e.outcome]);
          cp.state = 'completed'; cp.outcome = e.outcome;
          decisionContract = { id: cp.contractId, version: cp.version, instance: cp.instanceId };
          const definition = this.c.contracts.find(k => k.id === cp.contractId)!;
          out.completed = { contract: cp.contractId, title: t(this.c, definition.title), outcome: e.outcome };
          if (definition.outcomes[e.outcome]) out.lines.push(t(this.c, definition.outcomes[e.outcome]));
          out.journalChanged = true;
        } else if ('task' in e) {
          out.startTasks.push(e.task);
        } else if ('restore' in e) {
          if (e.restore === 'hp' || e.restore === 'all') hp = effective(this.c, p).hpMax;
          if (e.restore === 'stamina' || e.restore === 'all') stamina = maxStamina(p.attributes);
          if (e.restore === 'all') luck = p.attributes.LUCK;
        } else if ('heal' in e) {
          if (e.heal === 'hp') hp = Math.min(effective(this.c, p).hpMax, hp + e.amount); else stamina = Math.min(maxStamina(p.attributes), stamina + e.amount);
          out.lines.push(`+${e.amount} ${e.heal === 'hp' ? 'salud' : 'aguante'}`);
        } else if ('notice' in e) {
          out.notices.push(t(this.c, e.notice));
        } else if ('contribute' in e) {
          // Contribución verificable sin completar el objetivo (p. ej. el Netrunner que consigue la prueba).
          const cp = [...contracts.values()].find(x => x.state === 'active' && this.c.contracts.some(k => k.id === x.contractId && k.objectives.some(o => o.id === e.contribute)));
          if (cp) {
            await q.query(`UPDATE contract_instances SET contributors = jsonb_set(contributors, $2, COALESCE(contributors->$3, '[]'::jsonb) || $4::jsonb) WHERE id = $1`,
              [cp.instanceId, `{${e.contribute}}`, e.contribute, JSON.stringify([p.charId])]);
            mem.push(() => { const m = this.inst.byId.get(cp.instanceId); if (m) (m.contributors[e.contribute] ??= []).push(p.charId); });
            out.lines.push('Tu aportación cuenta para el reparto del equipo');
          }
        } else if ('open' in e) {
          out.open = { kind: e.open, id: e.id };
        } else if ('missionRide' in e) {
          out.missionRide = e.missionRide;
        } else if ('wanted' in e) {
          out.wanted = (out.wanted ?? 0) + e.wanted;
        }
      }
      await q.query('UPDATE characters SET money=$2, xp=xp+$3, hp=$4, stamina=$5, luck=$6 WHERE id=$1', [p.charId, money, xp - xp0, Math.round(hp), Math.round(stamina), luck]);
      if (ctx.dialogId && effects.length) {
        await q.query(`INSERT INTO decisions (op_id, character_id, dialog_id, node_id, option_id, contract_id, contract_version, instance_id, result, rules_version)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [ctx.opId, p.charId, ctx.dialogId, ctx.nodeId, ctx.optionId, (decisionContract as any)?.id ?? null, (decisionContract as any)?.version ?? null, (decisionContract as any)?.instance ?? null,
            JSON.stringify({ lines: out.lines, ...ctx.extra }), RULES.version]);
      }
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [ctx.opId, p.charId, ctx.kind, JSON.stringify({ lines: out.lines })]);
    });

    // COMMIT correcto: reflejar en memoria.
    p.money = money; p.xp += xp - xp0; p.hp = hp; p.stamina = stamina; p.luck = luck;
    p.inventory = inv; p.rep = rep; p.contracts = contracts;
    for (const m of mem) m();
    const before = p.level;
    if (recomputeLevel(p)) {
      out.levelUp = p.level;
      out.lines.push(`¡Nivel ${p.level}!`);
      await this.db.query('UPDATE characters SET level=$2 WHERE id=$1', [p.charId, p.level]).catch(() => {});
    }
    void before;
    return out;
  }

  /** Compromete una tirada: se registra una vez por personaje y clave; la Suerte se cobra solo en la primera. */
  async commitCheck(p: PlayerState, key: string, opId: string, n: { attr: string; attrValue: number; skill: string; skillValue: number; bonus: number; dv: number }, luckReq: number) {
    const prev = p.checks.get(key);
    if (prev) return { ...prev, reused: true, luckSpent: 0, ...n };
    const luckSpent = Math.max(0, Math.min(luckReq, p.luck, RULES.luckMaxSpendPerCheck));
    const roll = 1 + (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 10);
    const total = n.attrValue + n.skillValue + n.bonus + luckSpent + roll;
    const success = total >= n.dv;
    await this.db.tx(async (q) => {
      await q.query(`INSERT INTO skill_checks (character_id, check_key, op_id, attr, attr_value, skill, skill_value, bonus, luck_spent, roll, total, dv, success, rules_version)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [p.charId, key, `chk-${opId}`, n.attr, n.attrValue, n.skill, n.skillValue, n.bonus, luckSpent, roll, total, n.dv, success, RULES.version]);
      if (luckSpent) await q.query('UPDATE characters SET luck = luck - $2 WHERE id = $1 AND luck >= $2', [p.charId, luckSpent]);
    });
    p.luck -= luckSpent;
    const r = { success, roll, total };
    p.checks.set(key, r);
    return { ...r, reused: false, luckSpent, ...n };
  }
}
