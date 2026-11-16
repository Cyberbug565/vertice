// Matasanos: catálogo, retirada, procedencia del cromo, precio, riesgo y resultado de la cirugía en una sola transacción.
import { randomUUID } from 'node:crypto';
import { humanityBase, surgeryRisk, type ClinicOffer, type ClinicView, type Content, type CyberwareDef, type RipperdocDef } from '@vertice/shared';
import type { Db } from '../db/db.js';
import { GameError } from './effects.js';
import { chromeParts, effective, type PlayerState } from './player.js';
import { ROMAN, type MarketService } from './market.js';

const MORALITY: Record<string, string> = { estricta: 'Estricta: nunca instala cromo robado', flexible: 'Flexible: acepta cromo robado con recargo', sin_escrupulos: 'Sin escrúpulos: instala lo que sea' };

export interface SurgeryResult { outcome: 'clean' | 'complications' | 'death'; lines: string[]; stolenMoney: number; cause?: string; def: CyberwareDef }

export class ClinicService {
  constructor(private db: Db, private c: Content, private market: MarketService, private rng: () => number = Math.random) {}

  doc(id: string): RipperdocDef {
    const d = this.c.ripperdocs.find((x) => x.id === id);
    if (!d) throw new GameError('Ese matasanos no existe.');
    return d;
  }
  private rep(p: PlayerState, d: RipperdocDef) { return d.faction ? p.rep.get(d.faction) ?? 0 : 0; }

  private offer(p: PlayerState, d: RipperdocDef, def: CyberwareDef, source: ClinicOffer['source'], ref: string, stolen: boolean): ClinicOffer {
    const ef = effective(this.c, p);
    const removal = source === 'installed';
    const labor = Math.round(120 * def.grade * d.priceMult * (removal ? 0.6 : 1));
    let price = labor;
    if (source === 'stock') price += Math.round(this.market.corpPrice(def.id, 'ciberware') * d.priceMult);
    if (source === 'stolen') price += Math.round(def.price * 0.6 * d.priceMult);
    if (source === 'inventory' && stolen && d.morality === 'flexible') price = Math.round(price * 1.4);
    const capacityAfter = removal ? ef.chromeUsed - def.capacity : ef.chromeUsed + def.capacity;
    const base = humanityBase(p.attributes.EMP);
    const humMaxAfter = removal ? Math.min(base, p.humanityMax + def.humanity) : p.humanityMax - def.humanity;
    const humanityAfter = removal ? p.humanity : Math.max(0, Math.min(p.humanity, humMaxAfter) - 2 * def.grade);
    const risk = surgeryRisk({ skill: d.skill, grade: def.grade, danger: d.danger, body: ef.attrs.BODY, rep: this.rep(p, d), stolen, unscrupulous: d.morality === 'sin_escrupulos', bonus: ef.surgery, humanityAfter, removal });
    let blocked: string | undefined;
    let replaces: string | undefined;
    let warning: string | undefined;
    if (!removal) {
      if (def.grade > d.maxGrade) blocked = `${d.name} no trabaja cromo de grado ${ROMAN[def.grade - 1]} (máximo ${ROMAN[d.maxGrade - 1]}).`;
      else if (stolen && d.morality === 'estricta') blocked = 'Se niega: no instala cromo robado.';
      const occupied = p.cyber.find((x) => x.location === 'installed' && this.c.cyberware.find((y) => y.id === x.def)?.slot === def.slot);
      if (!blocked && occupied) { replaces = this.c.cyberware.find((y) => y.id === occupied.def)!.name; blocked = `La ranura «${def.slot}» está ocupada por ${replaces}. Retíralo primero: dos implantes no pueden compartir ranura.`; }
      // v0.7: se puede pasar del límite (hasta un 50 % más) con matasanos poco escrupulosos… a cambio de arriesgarse a la ciberpsicosis.
      if (!blocked && capacityAfter > ef.chromeCapacity) {
        if (d.morality === 'estricta') blocked = `Superarías tu capacidad de cromo (${capacityAfter}/${ef.chromeCapacity}). ${d.name} no trabaja por encima del límite.`;
        else if (capacityAfter > Math.floor(ef.chromeCapacity * 1.5)) blocked = `Ni el matasanos más loco te metería tanto cromo (${capacityAfter}/${ef.chromeCapacity}).`;
        else warning = `Te pasas de tu límite de cromo (${capacityAfter}/${ef.chromeCapacity}). Cuanto más te pases y más tiempo, más cerca de la ciberpsicosis.`;
      }
      if (!blocked && humMaxAfter < 10) blocked = 'Tu Humanidad máxima bajaría de 10: ningún matasanos serio lo haría.';
    }
    if (!blocked && d.id === 'vex' && this.rep(p, d) < -10) blocked = 'Vex no quiere tocarte: tienes mala fama con las Hojas Rojas.';
    if (!blocked && p.money < price) blocked = `No tienes suficientes eurodólares (${price} €$).`;
    return {
      source, ref, action: removal ? 'remove' : 'install', def: def.id, name: def.name, grade: def.grade, slot: def.slot, family: def.family, desc: def.desc, stolen,
      capacity: def.capacity, humanity: def.humanity, price, survival: risk.survival, clean: risk.clean, theft: risk.theft, danger: risk.label,
      humanityAfter: removal ? p.humanity : humanityAfter, capacityAfter, blocked, replaces, warning,
    };
  }

  view(docId: string, p: PlayerState): ClinicView {
    const d = this.doc(docId);
    const ef = effective(this.c, p);
    const offers: ClinicOffer[] = [];
    for (const id of d.stock) offers.push(this.offer(p, d, this.c.cyberware.find((x) => x.id === id)!, 'stock', id, false));
    if (d.morality !== 'estricta') for (const id of d.stolenStock) offers.push(this.offer(p, d, this.c.cyberware.find((x) => x.id === id)!, 'stolen', id, true));
    for (const ci of p.cyber) {
      const def = this.c.cyberware.find((x) => x.id === ci.def)!;
      offers.push(this.offer(p, d, def, ci.location === 'installed' ? 'installed' : 'inventory', ci.id, ci.stolen));
    }
    const dangerLabel = d.danger >= 0.3 ? 'Peligroso: tiene fama de robar a sus pacientes' : d.danger > 0.05 ? 'Algo turbio' : 'De confianza';
    return { doc: d.id, name: d.name, skill: d.skill, morality: MORALITY[d.morality], dangerLabel, desc: d.desc, money: p.money, humanity: p.humanity, humanityMax: p.humanityMax, chromeUsed: ef.chromeUsed, chromeCapacity: ef.chromeCapacity, rep: this.rep(p, d), offers,
      repair: (() => { const parts = chromeParts(this.c, p).filter((k) => (p.body.wounds[k as keyof typeof p.body.wounds] ?? 0) > 0); const dmg = parts.reduce((acc, k) => acc + (p.body.wounds[k as keyof typeof p.body.wounds] ?? 0), 0); return parts.length ? { parts, price: Math.max(60, Math.round(dmg * 9 * d.priceMult)) } : null; })() };
  }

  /** Opera. La tirada, el cobro, el cambio de cromo y las consecuencias se aplican juntas e idempotentes. */
  async operate(p: PlayerState, docId: string, action: 'install' | 'remove', source: ClinicOffer['source'], ref: string, opId: string): Promise<SurgeryResult> {
    const d = this.doc(docId);
    let def: CyberwareDef | undefined, inst: { id: string; stolen: boolean } | undefined;
    if (source === 'stock' || source === 'stolen') {
      if (action !== 'install') throw new GameError('Acción inválida.');
      if (!(source === 'stock' ? d.stock : d.stolenStock).includes(ref)) throw new GameError('No tiene ese implante.');
      if (source === 'stolen' && d.morality === 'estricta') throw new GameError('Se niega: no instala cromo robado.');
      def = this.c.cyberware.find((x) => x.id === ref);
    } else {
      const ci = p.cyber.find((x) => x.id === ref && x.location === (source === 'installed' ? 'installed' : 'inventory'));
      if (!ci) throw new GameError('No tienes ese implante.');
      if ((source === 'installed') !== (action === 'remove')) throw new GameError('Acción inválida.');
      def = this.c.cyberware.find((x) => x.id === ci.def); inst = { id: ci.id, stolen: ci.stolen };
    }
    if (!def) throw new GameError('Implante desconocido.');
    const offer = this.offer(p, d, def, source, ref, source === 'stolen' || !!inst?.stolen);
    if (offer.blocked) throw new GameError(offer.blocked);
    const u = this.rng(), t = this.rng(), k = this.rng();
    const outcome: SurgeryResult['outcome'] = u > offer.survival ? 'death' : u > offer.clean ? 'complications' : 'clean';
    const ef = effective(this.c, p);
    let hp = p.hp, humanity = offer.humanityAfter;
    const base = humanityBase(p.attributes.EMP);
    const humMax = action === 'remove' ? Math.min(base, p.humanityMax + def.humanity) : p.humanityMax - def.humanity;
    if (outcome === 'complications') { hp = Math.max(1, Math.round(hp - ef.hpMax * (0.15 + 0.15 * k))); humanity = Math.max(0, humanity - 3 - Math.floor(k * 4)); }
    let stolenMoney = 0;
    const moneyAfterCharge = p.money - offer.price;
    if (outcome !== 'death' && t < offer.theft) stolenMoney = Math.floor(moneyAfterCharge * (0.2 + 0.2 * k));
    const instId = inst?.id ?? randomUUID();
    const lines: string[] = [`−${offer.price} €$ · ${action === 'install' ? 'Implantación' : 'Retirada'} de ${def.name} en ${d.name}`];
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      let bal = moneyAfterCharge;
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:pay`, p.charId, -offer.price, bal, lines[0]]);
      if (stolenMoney) { bal -= stolenMoney; await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:theft`, p.charId, -stolenMoney, bal, `Robo de ${d.name} durante la anestesia`]); }
      const hist = JSON.stringify([{ at: new Date().toISOString(), event: action === 'install' ? `instalado por ${d.name}` : `retirado por ${d.name}`, outcome }]);
      if (action === 'install') {
        if (inst) await q.query("UPDATE cyberware_instances SET location = $3, history = history || $4::jsonb WHERE id=$1 AND character_id=$2 AND location='inventory'", [instId, p.charId, outcome === 'death' ? 'lost' : 'installed', hist]);
        else await q.query('INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen, history) VALUES ($1,$2,$3,$4,$5,$6)', [instId, def!.id, p.charId, outcome === 'death' ? 'lost' : 'installed', source === 'stolen', hist]);
      } else {
        await q.query("UPDATE cyberware_instances SET location = 'inventory', history = history || $3::jsonb WHERE id=$1 AND character_id=$2 AND location='installed'", [instId, p.charId, hist]);
      }
      await q.query('UPDATE characters SET money=$2, hp=$3, humanity=$4, humanity_max=$5 WHERE id=$1', [p.charId, bal, Math.round(hp), Math.round(humanity), humMax]);
      await q.query('INSERT INTO incidents (kind, actor_char, zone, detail) VALUES ($1,$2,$3,$4)', ['cirugia', p.charId, d.zone, JSON.stringify({ doc: d.id, def: def!.id, action, outcome, survival: offer.survival, roll: u, stolenMoney })]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'surgery', JSON.stringify({ outcome })]);
    });
    p.money = moneyAfterCharge - stolenMoney; p.hp = hp; p.humanity = humanity; p.humanityMax = humMax;
    if (action === 'install') {
      if (inst) { const ci = p.cyber.find((x) => x.id === instId)!; if (outcome === 'death') p.cyber = p.cyber.filter((x) => x.id !== instId); else ci.location = 'installed'; }
      else if (outcome !== 'death') p.cyber.push({ id: instId, def: def.id, location: 'installed', stolen: source === 'stolen' });
    } else { p.cyber.find((x) => x.id === instId)!.location = 'inventory'; }
    if (outcome === 'clean') lines.push('Operación limpia.');
    if (outcome === 'complications') lines.push(`Complicaciones: salud ${hp}, Humanidad ${humanity}.`);
    if (stolenMoney) lines.push(`Al despertar te faltan ${stolenMoney} €$.`);
    return { outcome, lines, stolenMoney, def, cause: outcome === 'death' ? `Murió en la mesa de ${d.name} (${def.name}, supervivencia estimada ${Math.round(offer.survival * 100)} %)` : undefined };
  }
}
