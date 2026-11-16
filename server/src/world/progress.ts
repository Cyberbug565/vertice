// v0.4 · Progresión: habilidades 1–25 que suben con el uso, niveles de personaje, puntos de habilidad y árbol de perks.
import { SKILL_MAX, SKILL_POINT_CAP, skillLevelForXp, skillXpFor, levelForXp, RULES } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { buildSheet, perkMods, pointsAvailable, savePlayerVitals, skillLevel, type PlayerState } from '../game/player.js';
import type { PlayerConn, World } from './world.js';

export class Progress {
  constructor(private readonly w: World) {}

  private connOf(p: PlayerState): PlayerConn | undefined { for (const c of this.w.conns.values()) if (c.p === p) return c; return undefined; }
  private sheetAt = new WeakMap<PlayerState, number>();
  private sheetSoon(c: PlayerConn | undefined, p: PlayerState) {
    if (!c) return;
    const last = this.sheetAt.get(p) ?? 0;
    if (Date.now() - last < 1500) return;
    this.sheetAt.set(p, Date.now());
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  /** Suma experiencia a una habilidad por usarla. Cada nivel cuesta más; el 25 es excepcional. */
  gain(p: PlayerState | undefined, skill: string, amount: number) {
    if (!p || amount <= 0 || !this.w.c.skills.some((s) => s.id === skill)) return;
    const pm = perkMods(this.w.c, p);
    const before = skillLevel(p, skill);
    if (before >= SKILL_MAX) return;
    const gain = Math.max(1, Math.round(amount * (1 + (pm.mods.skillXp ?? 0))));
    p.skillXp[skill] = Math.min(skillXpFor(SKILL_MAX), (p.skillXp[skill] ?? 0) + gain);
    const after = skillLevelForXp(p.skillXp[skill]);
    const c = this.connOf(p);
    const name = this.w.c.skills.find((s) => s.id === skill)!.name;
    if (c) this.w.send(c, { t: 'skillxp', skill, name, gain, level: after, xp: p.skillXp[skill], from: skillXpFor(after), to: after >= SKILL_MAX ? skillXpFor(SKILL_MAX) : skillXpFor(after + 1), up: after > before });
    if (after > before) {
      if (c) this.w.send(c, { t: 'notice', kind: 'good', text: after === SKILL_MAX ? `★ ${name} al 25: dominio absoluto. Revisa los perks de nivel 25.` : `${name} sube a nivel ${after}.` });
      this.playerXp(p, 8 + 2 * after);
      if (after % 5 === 0 && after >= 10 && c) this.w.send(c, { t: 'notice', kind: 'good', text: `+1 punto de perk por llegar a ${name} ${after}.` });
      this.sheetSoon(c, p);
    }
  }

  /** Experiencia de personaje (fuera del libro de efectos: combate, habilidades, hackeos). */
  playerXp(p: PlayerState, amount: number) {
    const pm = perkMods(this.w.c, p);
    p.xp += Math.round(amount * (1 + (pm.mods.xp ?? 0)));
    const before = p.level;
    p.level = levelForXp(p.xp);
    if (p.level > before) this.onLevelUp(p, before);
  }
  onLevelUp(p: PlayerState, before: number) {
    const c = this.connOf(p);
    if (!c) return;
    if (c.e) { c.e.level = p.level; c.e.labelVer++; }
    const n = p.level - before;
    this.w.send(c, { t: 'reward', title: `¡Nivel ${p.level}!`, lines: [`+${3 * n} salud máxima y +${2 * n} aguante`, 'Tus reservas de comida, bebida y sueño duran más', `+${2 * n} puntos de habilidad y +${n} de perk: ábrelos en Personaje → Habilidades (tecla H)`] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
    void savePlayerVitals(this.w.db, p).catch(() => {});
  }

  /** Invierte un punto de habilidad: +1 nivel (hasta 20; del 20 al 25 solo se sube usando la habilidad). */
  async skillUp(c: PlayerConn, skill: string) {
    const p = c.p!;
    if (!this.w.c.skills.some((s) => s.id === skill)) throw new GameError('Habilidad desconocida.');
    if (pointsAvailable(this.w.c, p).skill <= 0) throw new GameError('No te quedan puntos de habilidad: sube de nivel para ganar más.');
    const lv = skillLevel(p, skill);
    if (lv >= SKILL_POINT_CAP) throw new GameError(`Con puntos solo se llega al ${SKILL_POINT_CAP}. Del ${SKILL_POINT_CAP} al ${SKILL_MAX} se sube usando la habilidad.`);
    p.skillXp[skill] = skillXpFor(lv + 1);
    p.skillPointsSpent++;
    await savePlayerVitals(this.w.db, p);
    this.w.send(c, { t: 'notice', kind: 'good', text: `${this.w.c.skills.find((s) => s.id === skill)!.name} sube a ${lv + 1}.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  /** Comprueba si un perk se puede comprar y por qué no. */
  perkBlock(p: PlayerState, id: string): string | null {
    const d = this.w.c.perks.find((x) => x.id === id);
    if (!d) return 'Perk desconocido.';
    if (p.perks.includes(id)) return 'Ya lo tienes.';
    if (p.level < d.requires.level) return `Requiere nivel ${d.requires.level}.`;
    for (const [k, v] of Object.entries(d.requires.skills)) if (skillLevel(p, k) < v) return `Requiere ${this.w.c.skills.find((s) => s.id === k)?.name ?? k} ${v}.`;
    for (const k of d.requires.perks) if (!p.perks.includes(k)) return `Requiere el perk «${this.w.c.perks.find((x) => x.id === k)?.name ?? k}».`;
    if (pointsAvailable(this.w.c, p).perk < d.cost) return `Cuesta ${d.cost} punto(s) de perk.`;
    return null;
  }
  async perkBuy(c: PlayerConn, id: string) {
    const p = c.p!;
    const why = this.perkBlock(p, id);
    if (why) throw new GameError(why);
    p.perks.push(id);
    await savePlayerVitals(this.w.db, p);
    const d = this.w.c.perks.find((x) => x.id === id)!;
    this.w.send(c, { t: 'reward', title: `Perk: ${d.name}`, lines: [d.desc] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  /** Atletismo y conducción: se entrenan recorriendo la ciudad. Lo llama el bucle de cada segundo. */
  walkTick(p: PlayerState, moved: number) {
    if (moved <= 0 || moved > 30) return;
    p.walked += moved * (p.carrying ? 2 : 1);
    const per = p.driving ? 60 : 30;
    while (p.walked >= per) { p.walked -= per; this.gain(p, p.driving ? 'conduccion' : 'atletismo', 2); }
  }
  get levelMax() { return RULES.levelMax; }
}
