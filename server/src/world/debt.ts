// v0.38 · El préstamo de los Kuro (giro vital «deuda»: 5 puntos de habilidad por 15.000 €$).
// Cada día de juego (24 horas de ciudad, contadas en tiempo jugado: estando desconectado no corre) vence una cuota. Si
// llevas el dinero encima, se cobra sola. Si no, se apunta como impagada y se suma un recargo. Con dos impagadas seguidas
// los Kuro mandan mercenarios a por ti, más y mejor armados cuantas más debas. Se puede pagar por adelantado desde la
// ficha (Personaje) y cada pago completo de una cuota borra una impagada.
import { nearestWalkable, LOAN } from '@vertice/shared';
import { randomUUID } from 'node:crypto';
import { GameError } from '../game/effects.js';
import { buildSheet, type Loan, type PlayerState } from '../game/player.js';
import { playedMs } from '../game/records.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

const MERC_NAMES = ['Kuro-Uno', 'Kuro-Dos', 'Tsume', 'Hachi', 'Kagi', 'Senbon', 'Ryū', 'Kiba'];
const MERC_WEAPON = ['pistola-ligera', 'subfusil', 'escopeta-corta', 'rifle-asalto'];
const MERC_LINES = ['Los Kuro te mandan saludos. Y facturas.', 'Debes dinero. Pagas con lo que tengas encima.', 'Nada personal. Bueno, un poco.', 'El interés lo cobramos en sangre.'];

export class Debts {
  private squads = new Map<string, { ids: number[]; until: number }>();
  constructor(private readonly w: World, private readonly rng: () => number = Math.random) {}

  private day() { return 24 * this.w.c.manifest.cityHourMs; }
  private loan(p: PlayerState): Loan | undefined { const l = p.bio?.loan; return l && l.owed > 0 ? l : undefined; }
  view(p: PlayerState): { owed: number; daily: number; inMin: number; missed: number; hunted: boolean } | undefined {
    const l = this.loan(p);
    if (!l) return;
    return { owed: l.owed, daily: Math.min(l.daily, l.owed), inMin: Math.max(0, Math.round((l.due - playedMs(p)) / 60000)), missed: l.missed, hunted: this.squads.has(p.charId) };
  }

  /** Mueve dinero con su asiento contable (el dinero de los jugadores siempre cuadra con el libro). */
  private async charge(p: PlayerState, amount: number, reason: string) {
    await this.w.db.tx(async (q) => {
      const bal = p.money - amount;
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`kuro-${randomUUID()}`, p.charId, -amount, bal, reason]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
    });
    p.money -= amount;
  }

  /** Una vez por segundo: cuotas que vencen y mercenarios. */
  async everySecond() {
    for (const c of this.w.conns.values()) {
      const p = c.p, l = p && this.loan(p);
      if (!p || !l || c.closed || p.status !== 'alive') continue;
      if (playedMs(p) >= l.due) await this.due(c, p, l).catch((err) => console.error('[deuda]', err));
      if (l.missed >= LOAN.mercsAfter) this.hunt(c, p, l);
    }
    const now = Date.now();
    for (const [char, sq] of this.squads) {
      const alive = sq.ids.map((id) => this.w.entities.get(id)).filter((e): e is Entity => !!e && !e.dead && e.state !== 'downed');
      const target = [...this.w.conns.values()].find((x) => x.p?.charId === char);
      if (!alive.length || now > sq.until || !target || target.p?.status !== 'alive') {
        for (const e of alive) this.w.removeEntity(e);
        this.squads.delete(char);
      }
    }
  }

  private async due(c: PlayerConn, p: PlayerState, l: Loan) {
    const quota = Math.min(l.daily, l.owed);
    l.due += this.day();
    if (p.money >= quota) {
      await this.charge(p, quota, 'Cuota del préstamo de los Kuro');
      l.owed -= quota; l.missed = Math.max(0, l.missed - 1);
      this.w.send(c, { t: 'notice', kind: 'info', text: l.owed > 0 ? `Los Kuro te cobran la cuota: ${quota.toLocaleString('es-ES')} €$. Debes ${l.owed.toLocaleString('es-ES')} €$.` : 'Última cuota pagada. Ya no les debes nada a los Kuro.' });
    } else {
      l.missed++; l.owed += LOAN.penalty;
      const warn = l.missed >= LOAN.mercsAfter ? 'Los Kuro han mandado mercenarios a por ti. Paga o escóndete.' : 'Una más y mandan a alguien a cobrarla.';
      this.w.send(c, { t: 'notice', kind: 'bad', text: `No llevas ${quota.toLocaleString('es-ES')} €$ para la cuota de los Kuro. Recargo de ${LOAN.penalty} €$ (${l.missed} impagada${l.missed > 1 ? 's' : ''}). ${warn}` });
    }
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  /** Manda (o refuerza) un equipo de mercenarios cuando estás en la calle, fuera de una zona segura. */
  private hunt(c: PlayerConn, p: PlayerState, l: Loan) {
    const e = c.e;
    if (!e || this.squads.has(p.charId) || e.zone.def.kind !== 'exterior') return;
    if (e.zone.grid.danger[Math.floor(e.y) * e.zone.grid.w + Math.floor(e.x)] === 0) return; // zona verde: esperan fuera
    if (this.rng() > 0.02) return; // de media, ~1 minuto en la calle hasta que te encuentran
    const n = Math.min(4, l.missed - 1), tier = Math.min(MERC_WEAPON.length - 1, l.missed - LOAN.mercsAfter);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, r = 11 + this.rng() * 4;
      const at = nearestWalkable(e.zone.grid, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 4);
      if (!at) continue;
      const m = this.w.combat.spawnFactionNpc(e.zone, 'kuro', 'gang', undefined, at);
      if (!m) continue;
      m.name = MERC_NAMES[Math.floor(this.rng() * MERC_NAMES.length)]; m.title = 'Mercenario de los Kuro';
      m.level = 10 + 3 * l.missed; m.npcMax = m.npcHp = 90 + 25 * l.missed; m.defense = 13 + l.missed;
      m.weaponId = MERC_WEAPON[tier]; m.respawn = undefined;
      m.aggro = e.id; m.aggroLethal = true; m.label = 'Cobrando una deuda'; m.labelVer++;
      ids.push(m.id);
      if (i === 0) this.w.street.speak(m, MERC_LINES[Math.floor(this.rng() * MERC_LINES.length)]);
    }
    if (!ids.length) return;
    this.squads.set(p.charId, { ids, until: Date.now() + 8 * 60_000 });
    this.w.send(c, { t: 'notice', kind: 'bad', text: `⚠ ${ids.length} mercenario${ids.length > 1 ? 's' : ''} de los Kuro va${ids.length > 1 ? 'n' : ''} a por ti por la deuda.` });
  }

  /** Pago voluntario desde la ficha. */
  async pay(c: PlayerConn, amount: number) {
    const p = c.p!, l = this.loan(p);
    if (!l) throw new GameError('No le debes nada a los Kuro.');
    const pay = Math.min(amount, l.owed);
    if (p.money < pay) throw new GameError(`Llevas ${p.money.toLocaleString('es-ES')} €$; no llega para pagar ${pay.toLocaleString('es-ES')}.`);
    await this.charge(p, pay, 'Pago al préstamo de los Kuro');
    l.owed -= pay;
    l.missed = Math.max(0, l.missed - Math.floor(pay / l.daily));
    if (l.missed < LOAN.mercsAfter) { const sq = this.squads.get(p.charId); if (sq) { for (const id of sq.ids) { const m = this.w.entities.get(id); if (m && !m.dead) this.w.removeEntity(m); } this.squads.delete(p.charId); } }
    this.w.send(c, { t: 'notice', kind: 'good', text: l.owed > 0 ? `Pagas ${pay.toLocaleString('es-ES')} €$ a los Kuro. Debes ${l.owed.toLocaleString('es-ES')} €$.` : 'Deuda saldada. Los Kuro ya no te buscan.' });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
}
