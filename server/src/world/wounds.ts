// v0.6 · Heridas por zonas del cuerpo: daño según la zona, desangrado, conmociones (KO) y amputaciones.
// v0.18 · «Cada tiro cuenta» (al estilo de los juegos de supervivencia): cada impacto deja una herida con su tipo
//   · bala: quita salud del golpe, sangra poco a poco y la bala se queda dentro (pinzas para sacarla);
//   · armas de filo: rasguño, corte o corte profundo según la fuerza del golpe (el profundo necesita sutura);
//   · golpes: contusión (no sangra, cura sola); explosivos: quemaduras;
//   · amputación: sangra muchísimo hasta que se venda y no cura nunca: hay que ir a un matasanos a implantar el miembro.
// La salud no se regenera sola: solo descansando y con todas las heridas curadas. Las heridas curan con el tiempo
// (de 1 día de juego a 2 semanas) si están bien tratadas; las que no se vendan se infectan.
// Los miembros de cromo no sangran ni se pierden; un miembro perdido se recupera implantando una prótesis en un matasanos.
import { AIM, PART_NAMES, WOUND_INFO, effectiveBleed, isLimb, woundList, newBody, treatmentsFor, zoneOfPart, type BodyPart, type BodyState, type TreatmentId, type WeaponDef, type Wound, type WoundKind } from '@vertice/shared';
import { chromeParts, mechanicalParts, effective, skillLevel, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { World } from './world.js';

const EDGED = new Set(['Hoja', 'Cuchillo', 'Implante']);
const BLUNT = new Set(['Contundente', 'Puños', 'Culatazo']);
/** Horas de juego con la venda puesta antes de que esté sucia. */
export const BANDAGE_DIRTY_H = 18;

export interface HitResult { dmg: number; part: BodyPart; severed?: BodyPart; ko: boolean; chrome: boolean; wound?: WoundKind }

export { woundList, effectiveBleed, painOf, woundCarePrice, hasOpenWounds } from '@vertice/shared';

export class Wounds {
  constructor(private readonly w: World, private readonly rng: () => number) {}

  bodyOf(e: Entity, tp?: PlayerState): BodyState { if (tp) return tp.body; return (e.body ??= newBody()); }
  private isChrome(e: Entity, tp: PlayerState | undefined, part: BodyPart) {
    const parts = tp ? chromeParts(this.w.c, tp) : e.chrome ?? [];
    const key = part.startsWith('mano_') ? part.replace('mano_', 'brazo_') : part;
    return parts.includes(part) || parts.includes(key) || (part.startsWith('pierna') && parts.includes('piernas'));
  }
  private add(b: BodyState, part: BodyPart, kind: WoundKind, scale: number, extra: Partial<Wound> = {}) {
    const list = woundList(b);
    const info = WOUND_INFO[kind];
    // Varias heridas en la misma zona: como mucho cuatro (la nueva se suma a la peor del mismo tipo).
    const same = list.filter((x) => x.part === part);
    if (same.length >= 4) {
      const t = same.find((x) => x.kind === kind) ?? same[0];
      t.bleed = Math.min(1.5, t.bleed + info.bleed * scale * 0.6); t.heal = Math.max(0, t.heal - 0.25); t.bandaged = false;
      return t;
    }
    const wnd: Wound = { id: (b.seq = (b.seq ?? 0) + 1), part, kind, bleed: Math.round(info.bleed * scale * 1000) / 1000, infection: 0, heal: 0, hours: kind === 'amputacion' ? 0 : info.hours, ...extra };
    list.push(wnd);
    return wnd;
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
    const area = traits.includes('area');
    body.wounds[part] = (body.wounds[part] ?? 0) + dmg;
    let severed: BodyPart | undefined;
    let kind: WoundKind | undefined;
    if (!chrome) {
      const vital = part === 'torso' || part === 'cabeza' ? 1.35 : 1;
      const scale = Math.max(0.6, Math.min(1.8, dmg / 12)) * vital;
      if (!lethal || (blunt && !bullet && !edged)) kind = 'contusion';
      else if (area) { kind = 'quemadura'; this.add(body, part, 'quemadura', scale); if (this.rng() < 0.5) this.add(body, part, 'corte', scale * 0.7); }
      else if (bullet) kind = 'bala';
      else if (edged) kind = dmg < 7 ? 'rasguno' : dmg < 16 ? 'corte' : 'corte-profundo';
      else kind = 'contusion';
      // La bala se queda dentro casi siempre; las de gran calibre a veces salen por el otro lado.
      if (kind === 'bala') this.add(body, part, 'bala', scale, { bullet: !(weapon.w.damage[1] >= 30 && this.rng() < 0.4) });
      else if (kind !== 'quemadura') this.add(body, part, kind, scale);
    }
    if (lethal && !chrome) {
      // Amputación: armas de filo, explosivas o de gran calibre contra un miembro muy dañado.
      const threshold = part.startsWith('mano') ? 14 : 24;
      if (isLimb(part) && (edged || area || weapon.w.damage[1] >= 26) && (body.wounds[part] ?? 0) >= threshold && this.rng() < 0.55) {
        severed = part;
        body.lost.push(part);
        // Lo que había en ese miembro deja de importar: queda la amputación.
        const gone = (x: BodyPart) => { body.list = woundList(body).filter((wd) => wd.part !== x); };
        gone(part); this.add(body, part, 'amputacion', 1);
        if (part.startsWith('brazo')) { const hand = part.replace('brazo_', 'mano_') as BodyPart; if (!body.lost.includes(hand)) { body.lost.push(hand); gone(hand); } }
        dmg += 6; kind = 'amputacion';
      }
    }
    body.bleed = woundList(body).reduce((a, x) => a + effectiveBleed(x), 0);
    // Golpes contundentes en la cabeza: conmoción y KO la mayoría de las veces.
    const ko = blunt && part === 'cabeza' && dmg >= 6 && this.rng() < 0.6;
    e.labelVer++;
    return { dmg, part, severed, ko, chrome, wound: kind };
  }

  /** Recalcula la hemorragia total del cuerpo (suma de lo que sangra cada herida). */
  tick0(b: BodyState) { b.bleed = woundList(b).reduce((a, x) => a + effectiveBleed(x), 0); if (b.bleed < 0.005) b.bleed = 0; }

  /** Cada segundo: cada herida sangra a su ritmo; sin atención, se acaba desangrando. */
  tick() {
    for (const z of this.w.zones.values()) for (const e of z.entities) {
      if (e.kind !== 'player' && e.kind !== 'npc') continue;
      const tp = this.w.playerOf(e);
      const body = tp ? tp.body : e.body;
      if (!body) continue;
      const list = woundList(body);
      if (!list.length) { if (body.bleed) { body.bleed = 0; e.labelVer++; } continue; }
      const was = body.bleed > 0.2;
      // Los rasguños dejan de sangrar solos en un minuto; los cortes bajan algo; lo demás sangra hasta que se trata.
      for (const wd of list) {
        if (wd.kind === 'rasguno') wd.bleed = wd.bleed > 0.002 ? wd.bleed * 0.95 : 0;
        else if (wd.kind === 'corte') wd.bleed = Math.max(Math.min(wd.bleed, 0.04), wd.bleed * 0.998);
      }
      let bleed = list.reduce((a, x) => a + effectiveBleed(x), 0);
      if (tp && effective(this.w.c, tp).flags.has('coagulante')) bleed *= 0.4; // v0.9: coagulante sintético
      body.bleed = bleed < 0.005 ? 0 : bleed;
      if (body.bleed > 0) {
        if (tp) {
          if (tp.status !== 'alive') continue;
          tp.hp -= body.bleed;
          if (tp.hp <= 0) { this.w.survival.downed(e.conn, 'se ha desangrado', tp, e, true); void this.w.combat.creditBleed(e); }
          else if (body.bleed > 0.15 && e.conn && Math.random() < 0.05) this.w.send(e.conn, { t: 'notice', kind: 'bad', text: `Te desangras (−${body.bleed.toFixed(2)}/s). Abre la salud (H) y venda la herida.` });
        } else if (e.state !== 'downed' && e.npcMax) {
          e.npcHp = (e.npcHp ?? e.npcMax) - body.bleed;
          if ((e.npcHp ?? 0) <= 0) this.w.combat.bleedOut(e);
        }
      }
      if (was !== body.bleed > 0.2) e.labelVer++;
    }
  }

  /** Paso del tiempo de juego (horas): vendas que se ensucian, infección, curación y salud que quita la infección. */
  hourly(p: PlayerState, dtH: number, resting: boolean, boost = 1): { healed: string[]; infected: string[] } {
    const list = woundList(p.body);
    const out = { healed: [] as string[], infected: [] as string[] };
    if (!list.length || dtH <= 0) return out;
    const fed = p.hunger < 90 && p.thirst < 90;
    for (const wd of list) {
      const age0 = wd.bandageAge ?? 0, prot0 = wd.disinfected ?? 0;
      if (wd.bandaged) wd.bandageAge = age0 + dtH;
      if (wd.disinfected) wd.disinfected = Math.max(0, wd.disinfected - dtH);
      if (wd.kind === 'amputacion' || wd.kind === 'contusion') { if (wd.kind === 'contusion') wd.heal += (dtH / wd.hours) * (resting ? 1.5 : 1) * boost; continue; }
      // Infección: herida abierta sin vendar (o con la venda sucia) y sin desinfectar; la bala alojada la empeora.
      // Horas de este paso con la herida expuesta (sin venda o con la venda ya sucia) y sin desinfectante encima.
      const exposed = Math.max(0, (wd.bandaged ? dtH - Math.max(0, BANDAGE_DIRTY_H - age0) : dtH) - prot0);
      if (exposed > 0) {
        const before = wd.infection;
        wd.infection = Math.min(1, wd.infection + exposed * (wd.kind === 'rasguno' ? 0.02 : 0.045) * (wd.bullet ? 1.6 : 1));
        if (before < 0.5 && wd.infection >= 0.5) out.infected.push(`${WOUND_INFO[wd.kind].name.toLowerCase()} en ${PART_NAMES[wd.part]}`);
      }
      // Curación: hace falta la herida limpia (vendada y sin bala; el corte profundo, suturado) y sin infección.
      const canHeal = (wd.kind === 'rasguno' || wd.bandaged) && !wd.bullet && !(wd.kind === 'corte-profundo' && !wd.sutured) && wd.infection < 0.5;
      if (canHeal) {
        const speed = boost * (resting ? 1.4 : 1) * (fed ? 1 : 0.5) * (wd.sutured && wd.kind === 'corte' ? 1.5 : 1) * (wd.bandaged && (wd.bandageAge ?? 0) < BANDAGE_DIRTY_H ? 1 : 0.6);
        wd.heal += (dtH / wd.hours) * speed;
      }
      // La infección quita salud poco a poco.
      if (wd.infection >= 0.5) p.hp -= dtH * (wd.infection >= 1 ? 3 : 1.2);
    }
    for (const wd of list) if (wd.heal >= 1) out.healed.push(`${WOUND_INFO[wd.kind].name.toLowerCase()} en ${PART_NAMES[wd.part]}`);
    p.body.list = list.filter((wd) => wd.heal < 1);
    // El daño por zona (para el cromo y las amputaciones) baja a la par.
    const mechanical = new Set(mechanicalParts(this.w.c, p));
    for (const part of Object.keys(p.body.wounds) as BodyPart[]) {
      if (!p.body.list.some((wd) => wd.part === part) && !mechanical.has(part)) delete p.body.wounds[part];
    }
    return out;
  }

  /** Tratar una herida. Devuelve el texto del resultado (o lanza el motivo por el que no se puede). */
  treat(p: PlayerState, woundId: number, action: TreatmentId): { text: string; used: string | null; ok: boolean } {
    const wd = woundList(p.body).find((x) => x.id === woundId);
    if (!wd) throw new Error('Esa herida ya no está.');
    if (!treatmentsFor(wd).includes(action)) throw new Error('Eso no sirve ahora para esa herida.');
    const med = skillLevel(p, 'medicina');
    const name = `${WOUND_INFO[wd.kind].name.toLowerCase()} en ${PART_NAMES[wd.part]}`;
    switch (action) {
      case 'vendar': case 'cambiar-venda':
        wd.bandaged = true; wd.bandageAge = 0;
        if (action === 'cambiar-venda') wd.infection = Math.max(0, wd.infection - 0.05);
        return { text: `${action === 'vendar' ? 'Vendas' : 'Cambias la venda de'} la ${name}.${wd.kind === 'corte-profundo' && !wd.sutured ? ' Sigue sangrando: necesita sutura.' : ''}`, used: 'venda', ok: true };
      case 'suturar': {
        const ok = this.rng() < Math.min(0.97, 0.55 + med * 0.03);
        if (!ok) { wd.bleed = Math.min(1.5, wd.bleed + 0.04); p.hp -= 3; return { text: `Te tiembla el pulso: la sutura de la ${name} no aguanta. Inténtalo otra vez.`, used: 'sutura', ok: false }; }
        wd.sutured = true; wd.bleed *= 0.3;
        return { text: `Suturas la ${name}.${wd.bandaged ? '' : ' Ahora véndala.'}`, used: 'sutura', ok: true };
      }
      case 'sacar-bala': {
        const ok = this.rng() < Math.min(0.97, 0.5 + med * 0.035);
        p.hp -= ok ? 2 : 6;
        if (!ok) { wd.bleed = Math.min(1.5, wd.bleed + 0.05); return { text: `Hurgas en la herida y la bala se escurre. Duele muchísimo. Vuelve a intentarlo.`, used: null, ok: false }; }
        wd.bullet = false;
        return { text: `Sacas la bala de la ${name} con las pinzas.${wd.bandaged ? '' : ' Ahora véndala.'}`, used: null, ok: true };
      }
      case 'desinfectar':
        wd.disinfected = 24; wd.infection = wd.infection < 0.5 ? 0 : wd.infection - 0.15;
        return { text: `Desinfectas la ${name}.${wd.infection >= 0.5 ? ' La infección ya está dentro: necesitas antibióticos.' : ''}`, used: 'antiseptico', ok: true };
    }
  }

  /** Antibióticos: bajan la infección de todas las heridas. */
  antibiotics(p: PlayerState) { for (const wd of woundList(p.body)) wd.infection = Math.max(0, wd.infection - 0.6); }

  /** Un médico (o la matriz CARMÍN, o reanimar a alguien) estabiliza: corta todas las hemorragias vendándolas. */
  stabilize(b: BodyState, e?: Entity) {
    for (const wd of woundList(b)) { wd.bandaged = true; wd.bandageAge = 0; if (wd.kind === 'corte-profundo') wd.sutured = true; }
    b.bleed = 0;
    if (e) e.labelVer++;
  }

  /** Tras implantar una prótesis o un miembro de cromo, el miembro perdido vuelve (y su amputación deja de contar). */
  restore(p: PlayerState, visible: string, part?: string | null) {
    const before = p.body.lost.length;
    const drop = (x: string) => { p.body.lost = p.body.lost.filter((y) => y !== x); delete p.body.wounds[x as BodyPart]; p.body.list = woundList(p.body).filter((wd) => wd.part !== x); };
    if (visible === 'brazo') { const side = part?.endsWith('izq') ? 'izq' : part?.endsWith('der') ? 'der' : p.body.lost.find((x) => x.startsWith('brazo'))?.slice(-3) ?? 'der'; drop(`brazo_${side}`); drop(`mano_${side}`); }
    if (visible === 'pierna') { const side = part?.endsWith('izq') ? 'izq' : part?.endsWith('der') ? 'der' : p.body.lost.find((x) => x.startsWith('pierna'))?.slice(-3) ?? 'der'; drop(`pierna_${side}`); }
    if (visible === 'piernas') { drop('pierna_izq'); drop('pierna_der'); }
    if (visible === 'mano' || visible === 'manos') { const hand = part ?? p.body.lost.find((x) => x.startsWith('mano')); if (hand) drop(hand); }
    return p.body.lost.length < before;
  }
  describe(part: BodyPart) { return PART_NAMES[part]; }
}
