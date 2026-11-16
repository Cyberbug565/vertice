// v0.5 · Puestos de trabajo fijos con horario (farmacias, comisarías, obras y torres) y acceso por ascensor a las torres.
import { randomUUID } from 'node:crypto';
import type { PostDef } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { buildSheet, skillLevel, type PlayerState } from '../game/player.js';
import type { RunningTask } from './entity.js';
import type { Zone } from './zone.js';
import type { PlayerConn, World } from './world.js';

export const inShift = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);
const fmtH = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
export const shiftText = (s: [number, number]) => `${fmtH(s[0])}–${fmtH(s[1])}`;

export class Posts {
  /** Quién ocupa cada puesto (uno por persona y una persona por puesto). */
  readonly held = new Map<string, { charId: string; name: string }>();
  private passes = new Map<string, number>(); // `${charId}|${torre}` → caduca
  private worked = new Map<string, string>(); // charId → clave del último turno trabajado

  constructor(private readonly w: World) {}
  async load() {
    const r = await this.w.db.query<any>("SELECT h.post_id, h.character_id, c.name FROM posts_held h JOIN characters c ON c.id = h.character_id WHERE c.status <> 'dead'");
    for (const x of r.rows) this.held.set(x.post_id, { charId: x.character_id, name: x.name });
  }
  postOf(p: PlayerState): PostDef | undefined {
    for (const [id, h] of this.held) if (h.charId === p.charId) return this.w.c.posts.find((x) => x.id === id);
    return undefined;
  }
  private shiftKey(post: PostDef) {
    const abs = (Date.now() / this.w.c.manifest.cityHourMs) + this.w.cfg.cityHourOffset;
    const day = Math.floor((abs - post.shift[0]) / 24);
    return `${post.id}|${day}`;
  }
  /** Estado del puesto para la ficha y el reloj del HUD. */
  status(p: PlayerState) {
    const post = this.postOf(p);
    if (!post) return null;
    const h = this.w.cityHour();
    return { id: post.id, name: post.name, place: this.w.zones.get(post.zone)?.def.name ?? post.zone, shift: post.shift, pay: post.pay, onShift: inShift(h, post.shift), worked: this.worked.get(p.charId) === this.shiftKey(post) };
  }

  /** Puestos que se ofrecen en un sitio: los del interior donde estás o los de la caseta de obra. */
  hiringView(c: PlayerConn, objId?: string) {
    const p = c.p!, e = c.e!;
    const list = this.w.c.posts.filter((x) => (objId && x.obra ? x.obra === objId : x.zone === e.zone.id && !x.obra) || (e.zone.def.tower && x.zone.startsWith(`${e.zone.def.tower.id}-`)));
    const mine = this.postOf(p);
    return {
      place: e.zone.id === 'vertice' ? list[0]?.name.split(' · ')[1] ?? 'Obra' : e.zone.def.name,
      posts: list.map((x) => {
        const h = this.held.get(x.id);
        const lv = skillLevel(p, x.skill);
        return { id: x.id, name: x.name, desc: x.desc, skill: this.w.c.skills.find((s) => s.id === x.skill)?.name ?? x.skill, minLevel: x.minLevel, level: lv, pay: x.pay, shift: shiftText(x.shift),
          employer: this.w.c.factions.find((f) => f.id === x.employer)?.name ?? x.employer, holder: h ? (h.charId === p.charId ? 'tú' : h.name) : null,
          canApply: !h && !mine && lv >= x.minLevel, reason: h ? (h.charId === p.charId ? 'Es tu puesto' : `Ocupado por ${h.name}`) : mine ? `Ya trabajas como ${mine.name}` : lv < x.minLevel ? `Necesitas ${this.w.c.skills.find((s) => s.id === x.skill)?.name} ${x.minLevel} (tienes ${lv})` : '' };
      }),
      mine: mine ? { id: mine.id, name: mine.name, shift: shiftText(mine.shift) } : null,
    };
  }
  async apply(c: PlayerConn, postId: string) {
    const p = c.p!;
    const post = this.w.c.posts.find((x) => x.id === postId);
    if (!post) throw new GameError('Ese puesto no existe.');
    if (this.postOf(p)) throw new GameError('Ya tienes un puesto: déjalo antes de pedir otro.');
    const h = this.held.get(postId);
    if (h) throw new GameError(`Está ocupado por ${h.name}.`);
    const lv = skillLevel(p, post.skill);
    if (lv < post.minLevel) throw new GameError(`Te piden ${this.w.c.skills.find((s) => s.id === post.skill)?.name} ${post.minLevel}; tienes ${lv}.`);
    const e = c.e!;
    const here = post.obra ? [...e.zone.query(e.x, e.y, 6)].some((o) => o.objId === post.obra) : e.zone.id === post.zone || (e.zone.def.tower && post.zone.startsWith(`${e.zone.def.tower.id}-`));
    if (!here) throw new GameError('Tienes que pedirlo en persona, en el sitio.');
    try { await this.w.db.query('INSERT INTO posts_held (post_id, character_id) VALUES ($1,$2)', [postId, p.charId]); }
    catch { throw new GameError('Alguien se te ha adelantado.'); }
    this.held.set(postId, { charId: p.charId, name: p.name });
    this.w.send(c, { t: 'reward', title: `¡Contratado/a! ${post.name}`, lines: [`Horario: ${shiftText(post.shift)} (hora de la ciudad)`, `Paga: ${post.pay} €$ por turno`, 'Ve a tu puesto en tu horario y pulsa «Trabajar turno» (o actívalo en modo automático).'] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  async quit(c: PlayerConn) {
    const p = c.p!;
    const post = this.postOf(p);
    if (!post) throw new GameError('No tienes ningún puesto.');
    await this.w.db.query('DELETE FROM posts_held WHERE post_id=$1', [post.id]);
    this.held.delete(post.id);
    this.w.send(c, { t: 'notice', kind: 'info', text: `Dejas tu puesto de ${post.name}. Queda libre para otra persona.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  /** Ir al puesto y trabajar un turno (solo dentro del horario). */
  async work(c: PlayerConn) {
    const p = c.p!, e = c.e!;
    const post = this.postOf(p);
    if (!post) throw new GameError('No tienes un puesto fijo: pide trabajo en una farmacia, comisaría, obra o torre.');
    const h = this.w.cityHour();
    if (!inShift(h, post.shift)) throw new GameError(`Tu turno es de ${shiftText(post.shift)}. Ahora son las ${fmtH(Math.floor(h))}.`);
    if (this.worked.get(p.charId) === this.shiftKey(post)) throw new GameError('Ya has trabajado este turno. Vuelve en el siguiente.');
    if (e.zone.id !== post.zone) throw new GameError(`Tu puesto está en ${this.w.zones.get(post.zone)?.def.name ?? post.zone}${post.zone === 'vertice' ? ' (la obra)' : ''}: ve allí primero.`);
    if (p.sleeping) this.w.survival.wake(c);
    this.w.cancelActivity(e);
    const secs = Math.max(1, 60 * this.w.cfg.jobTimeScale);
    e.task = { def: { id: `post:${post.id}`, label: post.name, repeat: 1, steps: [{ moveTo: post.at as [number, number], zone: post.zone }, { wait: secs, label: `Turno: ${post.name}` }], onComplete: [] },
      step: 0, rep: 0, waitUntil: 0, started: false, opId: `post-${randomUUID()}`, onDone: () => this.w.enqueue(c, () => this.finish(c, post)) } as RunningTask;
    this.w.send(c, { t: 'notice', kind: 'info', text: `Empiezas el turno de ${post.name}.` });
  }
  private async finish(c: PlayerConn, post: PostDef) {
    const p = c.p!;
    const opId = `turno-${randomUUID()}`;
    const bonus = 1 + Math.max(0, skillLevel(p, post.skill) - post.minLevel) * 0.03;
    const pay = Math.round(post.pay * bonus);
    await this.w.db.tx(async (q) => {
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:pay`, p.charId, pay, p.money + pay, `Nómina del turno: ${post.name}`]);
      await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [p.charId, pay]);
    });
    p.money += pay;
    this.worked.set(p.charId, this.shiftKey(post));
    this.w.progress.gain(p, post.skill, 10);
    this.w.progress.playerXp(p, 20);
    try { const out = await this.w.effects.apply(p, [{ rep: post.employer, delta: 1 }], { opId: `${opId}:rep`, kind: 'post' }); this.w.handleOutcome(c, out); } catch {}
    this.w.send(c, { t: 'reward', title: 'Turno terminado', lines: [post.name, `+${pay} €$${bonus > 1 ? ` (incluye plus por experiencia)` : ''}`, `+10 XP de ${this.w.c.skills.find((s) => s.id === post.skill)?.name}`] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  // ---------------------------------------------------------------- torres: ascensor y control de acceso
  /** Para los guardias (`guards`), un pase obtenido hackeando no cuenta: si te ven, eres un intruso. */
  hasAccess(p: PlayerState, zone: Zone, guards = false) {
    const t = zone.def.tower;
    if (!t || t.access === 'publico') return true;
    const rep = p.rep.get(t.corp) ?? 0;
    const post = this.postOf(p);
    const staff = !!post && post.employer === t.corp;
    if (!guards && (this.passes.get(`${p.charId}|${t.id}`) ?? 0) > Date.now()) return true;
    return t.access === 'empleados' ? staff || rep >= 10 : rep >= 40 || (staff && post!.id.endsWith('seguridad'));
  }
  elevatorView(c: PlayerConn) {
    const p = c.p!, e = c.e!;
    const t = e.zone.def.tower;
    if (!t) throw new GameError('Aquí no hay ascensor.');
    const floors = [...this.w.zones.values()].filter((z) => z.def.tower?.id === t.id).sort((a, b) => a.def.tower!.floor - b.def.tower!.floor);
    return { tower: t.id, name: floors[0]?.def.name.split(' · ')[0] ?? t.id, current: t.floor,
      floors: floors.map((z) => ({ floor: z.def.tower!.floor, zone: z.id, name: z.def.name.split(' · ')[1] ?? z.def.name, access: z.def.tower!.access, allowed: this.hasAccess(p, z) })) };
  }
  async elevator(c: PlayerConn, floor: number, hack: boolean) {
    const p = c.p!, e = c.e!;
    const t = e.zone.def.tower;
    if (!t) throw new GameError('Aquí no hay ascensor.');
    const z = [...this.w.zones.values()].find((x) => x.def.tower?.id === t.id && x.def.tower.floor === floor);
    if (!z) throw new GameError('Esa planta no existe.');
    if (!this.hasAccess(p, z)) {
      if (!hack) throw new GameError(z.def.tower!.access === 'empleados' ? 'Solo personal: necesitas trabajar aquí o buena relación con la corporación.' : 'Acceso restringido: necesitas autorización (o hackear el ascensor).');
      const lv = skillLevel(p, 'interfaz');
      const chance = Math.min(0.9, Math.max(0.05, (lv - 4) / 16 + (p.role === 'netrunner' ? 0.15 : 0)));
      this.w.progress.gain(p, 'interfaz', 4);
      if (this.w.survival.rng() >= chance) {
        await this.w.survival.addWanted(c, 1, 'intrusión en una torre corporativa');
        for (const o of e.zone.entities) if (o.npcType === 'gang' && o.faction === t.corp) { o.aggro = e.id; o.aggroLethal = false; }
        throw new GameError(`El ascensor rechaza tu hackeo (${Math.round(chance * 100)} %): salta la alarma.`);
      }
      this.passes.set(`${p.charId}|${t.id}`, Date.now() + this.w.c.manifest.cityHourMs);
      this.w.send(c, { t: 'notice', kind: 'good', text: 'Hackeas el ascensor: tienes acceso a toda la torre durante una hora de juego. Si te ven arriba sin permiso, seguridad irá a por ti.' });
    }
    await this.w.teleport(c, z.id, [2, 7]);
  }
}
