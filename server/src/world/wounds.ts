// v0.6 · Heridas por zonas del cuerpo: daño según la zona, desangrado, conmociones (KO) y amputaciones.
// Los miembros de cromo no sangran ni se pierden; un miembro perdido se recupera implantando una prótesis en un matasanos.
import { AIM, PART_NAMES, isLimb, newBody, zoneOfPart, type BodyPart, type BodyState, type WeaponDef } from '@vertice/shared';
import { chromeParts, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { World } from './world.js';

const EDGED = new Set(['Hoja', 'Cuchillo', 'Implante']);
const BLUNT = new Set(['Contundente', 'Puños', 'Culatazo']);

export interface HitResult { dmg: number; part: BodyPart; severed?: BodyPart; ko: boolean; chrome: boolean }

export class Wounds {
  constructor(private readonly w: World, private readonly rng: () => number) {}

  bodyOf(e: Entity, tp?: PlayerState): BodyState { if (tp) return tp.body; return (e.body ??= newBody()); }
  private isChrome(e: Entity, tp: PlayerState | undefined, part: BodyPart) {
    const parts = tp ? chromeParts(this.w.c, tp) : e.chrome ?? [];
    const key = part.startsWith('mano_') ? part.replace('mano_', 'brazo_') : part;
    return parts.includes(key) || (part.startsWith('pierna') && parts.includes('piernas'));
  }

  /** Aplica un impacto en una zona del cuerpo y devuelve el daño final y sus consecuencias. */
  hit(e: Entity, tp: PlayerState | undefined, part0: BodyPart, dmg0: number, weapon: { id: string; w: WeaponDef }, lethal: boolean): HitResult {
    const body = this.bodyOf(e, tp);
    // No se puede herir un miembro que ya no está: el golpe va al torso.
    const part: BodyPart = body.lost.includes(part0) ? 'torso' : part0;
    const chrome = isLimb(part) && this.isChrome(e, tp, part);
    let dmg = Math.max(1, Math.round(dmg0 * AIM[zoneOfPart(part)].mult * (chrome ? 0.7 : 1)));
    const fam = weapon.w.family, traits = weapon.w.traits ?? [];
    const edged = EDGED.has(fam) || traits.includes('sangrado');
    const blunt = !lethal || BLUNT.has(fam) || weapon.id === 'puno-hidraulico-arma';
    const bullet = weapon.w.kind === 'ranged';
    body.wounds[part] = (body.wounds[part] ?? 0) + dmg;
    let severed: BodyPart | undefined;
    if (lethal && !chrome) {
      body.bleed += dmg * (bullet ? 0.05 : edged ? 0.06 : 0.012) * (part === 'torso' || part === 'cabeza' ? 1.4 : 1);
      // Amputación: armas de filo, explosivas o de gran calibre contra un miembro muy dañado.
      const threshold = part.startsWith('mano') ? 14 : 24;
      if (isLimb(part) && (edged || traits.includes('area') || weapon.w.damage[1] >= 26) && (body.wounds[part] ?? 0) >= threshold && this.rng() < 0.55) {
        severed = part;
        body.lost.push(part);
        if (part.startsWith('brazo')) { const hand = part.replace('brazo_', 'mano_') as BodyPart; if (!body.lost.includes(hand)) body.lost.push(hand); }
        body.bleed += 2.2;
        dmg += 6;
      }
    }
    // Golpes contundentes en la cabeza: conmoción y KO la mayoría de las veces.
    const ko = blunt && part === 'cabeza' && dmg >= 6 && this.rng() < 0.6;
    e.labelVer++;
    return { dmg, part, severed, ko, chrome };
  }

  /** Cada segundo: los que sangran pierden salud; sin atención, acaban desangrándose. */
  tick() {
    for (const z of this.w.zones.values()) for (const e of z.entities) {
      if (e.kind !== 'player' && e.kind !== 'npc') continue;
      const tp = this.w.playerOf(e);
      const body = tp ? tp.body : e.body;
      if (!body || body.bleed <= 0) continue;
      const was = body.bleed > 0.2;
      if (tp) {
        if (tp.status !== 'alive') { body.bleed = Math.max(0, body.bleed * 0.9 - 0.05); continue; }
        tp.hp -= body.bleed;
        if (tp.hp <= 0) { this.w.survival.downed(e.conn, 'se ha desangrado', tp, e, true); void this.w.combat.creditBleed(e); }
        else if (body.bleed > 0.6 && e.conn && Math.random() < 0.08) this.w.send(e.conn, { t: 'notice', kind: 'bad', text: `Te desangras (−${body.bleed.toFixed(1)}/s). Usa una venda, un estimulante o busca un médico.` });
      } else if (e.state !== 'downed' && e.npcMax) {
        e.npcHp = (e.npcHp ?? e.npcMax) - body.bleed;
        if ((e.npcHp ?? 0) <= 0) this.w.combat.bleedOut(e);
      }
      // Las heridas leves cortan solas; las graves siguen sangrando.
      body.bleed = body.bleed > 1.5 ? body.bleed * 0.996 : body.bleed * 0.97 - 0.01;
      if (body.bleed < 0.05) body.bleed = 0;
      if (was !== body.bleed > 0.2) e.labelVer++;
    }
  }

  /** Vendas y estimulantes cortan la hemorragia (del todo o en parte). */
  treat(p: PlayerState, e: Entity | undefined, fraction: number) {
    p.body.bleed = Math.max(0, p.body.bleed * (1 - fraction));
    if (fraction >= 1) for (const k of Object.keys(p.body.wounds) as BodyPart[]) p.body.wounds[k] = Math.round((p.body.wounds[k] ?? 0) * 0.5);
    if (e) e.labelVer++;
  }
  /** Tras implantar una prótesis o un miembro de cromo, el miembro perdido vuelve. */
  restore(p: PlayerState, visible: string, part?: string | null) {
    const before = p.body.lost.length;
    const drop = (x: string) => { p.body.lost = p.body.lost.filter((y) => y !== x); delete p.body.wounds[x as BodyPart]; };
    if (visible === 'brazo') { const side = part?.endsWith('izq') ? 'izq' : part?.endsWith('der') ? 'der' : p.body.lost.find((x) => x.startsWith('brazo'))?.slice(-3) ?? 'der'; drop(`brazo_${side}`); drop(`mano_${side}`); }
    if (visible === 'pierna') { const side = part?.endsWith('izq') ? 'izq' : part?.endsWith('der') ? 'der' : p.body.lost.find((x) => x.startsWith('pierna'))?.slice(-3) ?? 'der'; drop(`pierna_${side}`); }
    if (visible === 'piernas') { drop('pierna_izq'); drop('pierna_der'); }
    if (visible === 'manos') { const h = p.body.lost.find((x) => x.startsWith('mano')); if (h) drop(h); }
    return p.body.lost.length < before;
  }
  describe(part: BodyPart) { return PART_NAMES[part]; }
}
