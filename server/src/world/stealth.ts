// v0.10 · Sigilo: los PNJ solo te detectan si te VEN (cono de visión y línea de visión, menos alcance de noche y en callejones)
// o si OYEN el ruido (cada arma hace más o menos ruido; las silenciosas casi nada). Medidor de sospecha al estilo de los juegos
// de infiltración: armas a la vista, zonas restringidas sin el uniforme adecuado, cargar un cuerpo, coincidir con la descripción
// que dieron los testigos o que te reconozcan la cara (si no la llevas tapada). Detectores de armas en las entradas de los
// lugares restringidos (no ven el cromo: un dedo pistola pasa). Estado para el HUD (oculto, visto, sospecha, descubierto,
// buscado, combate) y quién te busca (PCV, unidades militares, carteles, cazarrecompensas…).
import { dangerAt, weaponSize, type StealthView } from '@vertice/shared';
import { effective, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

/** Prendas que tapan la cara (no te reconocen de cerca). */
const FACE_COVER = new Set(['mascara', 'mascara-gas', 'bandana-cara', 'mascara-demonio', 'casco-moto', 'casco']);
/** Disfraz (capacidad de la prenda) → lugares restringidos en los que encaja. */
const DISGUISE_OK: Record<string, string[]> = { 'disfraz-pcv': ['policia', 'carcel', 'banco'], 'disfraz-seguridad': ['banco', 'corporativo', 'laboratorio'], 'disfraz-corpo': ['corporativo', 'laboratorio'] };
const DISGUISE_NAME: Record<string, string> = { 'disfraz-pcv': 'Agente de la PCV', 'disfraz-seguridad': 'Seguridad privada', 'disfraz-corpo': 'Personal corporativo' };
const WATCHERS = new Set(['police', 'hierro']);

export interface StealthState {
  suspicion: number; state: StealthView['state']; observers: number[]; alertUntil: number;
  /** Descripción que dieron los testigos: tu ropa de entonces. Si te cambias, ya no encajas. */
  description?: { outfit: string; until: number; crime: string };
  lastSent?: string;
  /** Último aviso de «baje el arma» (la primera vez solo avisan). */
  warnedAt?: number; warnedOnce?: boolean;
}

export class Stealth {
  constructor(private readonly w: World) {}

  st(c: PlayerConn): StealthState { return ((c as any).stealth ??= { suspicion: 0, state: 'oculto', observers: [], alertUntil: 0 }); }
  /** Huella de la ropa que llevas puesta (lo que recuerdan los testigos). */
  outfit(p: PlayerState) { return Object.entries(p.wear).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).sort().join('|') || `piel:${p.appearance.jacket}:${p.appearance.top}`; }
  faceCovered(p: PlayerState) {
    const it = (slot: string) => { const id = (p.wear as any)[slot]; return id ? this.w.c.items.find((i) => i.id === id)?.wear?.style : undefined; };
    return FACE_COVER.has(it('cara') ?? '') || FACE_COVER.has(it('cabeza') ?? '') || ['mascara'].includes(p.appearance.accessory ?? '');
  }
  disguise(p: PlayerState): string | null { for (const f of effective(this.w.c, p).flags) if (DISGUISE_OK[f]) return f; return null; }
  /** Armas que detecta un arco detector: las que llevas encima (no las integradas en el cromo). */
  detectable(p: PlayerState) { return [...p.inventory].filter(([id, q]) => q > 0 && !!weaponSize(this.w.c.items.find((i) => i.id === id) ?? { id })).map(([id]) => id); }

  /** ¿`o` ve a `e`? Cono de 140° hacia donde mira (de cerca, siempre), alcance menor de noche y en callejones, y línea de visión. */
  sees(o: Entity, e: Entity) {
    if (o === e || o.state === 'downed' || o.dead || o.zone !== e.zone) return false;
    const tp = this.w.playerOf(e);
    if (tp && (tp.buffs.invisible ?? 0) > Date.now()) return false;
    const d = Math.hypot(e.x - o.x, e.y - o.y);
    if (d <= 2.2) return true;
    const h = this.w.cityHour(); const night = h >= 21 || h < 6;
    let range = e.zone.def.kind === 'interior' ? 12 : night ? 10 : 15;
    const gt = this.groundAt(e);
    if (gt === 'alley') range *= 0.6;
    if (tp) range *= Math.max(0.5, 1 - (effective(this.w.c, tp).skills.sigilo ?? 0) * 0.04);
    if (d > range) return false;
    // Cono de visión: si se mueve, mira hacia donde va; si está quieto, hacia su última orientación.
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const f = dirs[((o.facing ?? 0) % 8 + 8) % 8];
    const dot = ((e.x - o.x) * f[0] + (e.y - o.y) * f[1]) / (d * Math.hypot(f[0], f[1]));
    if (dot < Math.cos((70 * Math.PI) / 180) && o.aggro !== e.id) return false;
    return this.w.combat.lineClear(o, e);
  }
  private groundAt(e: Entity) { let t = e.zone.def.base as string; for (const g of e.zone.def.ground) if (e.x >= g.rect[0] && e.y >= g.rect[1] && e.x < g.rect[0] + g.rect[2] && e.y < g.rect[1] + g.rect[3]) t = g.type; return t; }

  /** Testigos de lo que hace `e`: quién lo ve y quién oye un ruido de radio `noise` (en metros). */
  witnesses(e: Entity, noise: number, exclude?: Entity) {
    const seen: Entity[] = [], heard: Entity[] = [];
    for (const o of e.zone.query(e.x, e.y, Math.max(16, noise))) {
      if (o === e || o === exclude || o.kind !== 'npc' || o.state === 'downed' || o.dead || o.npcType === 'psycho') continue;
      if (this.sees(o, e)) seen.push(o);
      else if (Math.hypot(o.x - e.x, o.y - e.y) <= noise) heard.push(o);
    }
    const isCop = (o: Entity) => WATCHERS.has(o.npcType ?? '');
    return { seen, heard, cops: [...seen, ...heard].filter(isCop), civs: [...seen, ...heard].filter((o) => o.npcType === 'civil'), any: seen.length + heard.length > 0 };
  }

  /** Ruido de un disparo, golpe o explosión: los que lo oyen pero no lo ven giran la cabeza y los agentes van a investigar. */
  noise(e: Entity, radius: number) {
    if (radius <= 0) return;
    for (const o of e.zone.query(e.x, e.y, radius)) {
      if (o === e || o.kind !== 'npc' || o.state === 'downed' || o.dead) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      o.facing = this.facingIdx(dx, dy); o.lastMoveTick = this.w.tick;
      if (WATCHERS.has(o.npcType ?? '') && o.aggro === undefined && !this.sees(o, e) && o.npc) {
        o.npc.pauseUntil = 0;
        if (this.w.npcPath(o, e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2)) { o.label = 'Investigando un ruido'; o.labelVer++; }
      }
    }
    for (const o of e.zone.query(e.x, e.y, 28)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'noise', x: e.x, y: e.y, r: radius });
  }
  private facingIdx(dx: number, dy: number) { const a = Math.atan2(dy, dx); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }

  /** Tras un delito: si alguien te ha visto, guarda tu descripción (la ropa que llevas) durante 10 minutos. */
  remember(c: PlayerConn, seenBy: Entity[], crime: string) {
    if (!seenBy.length) return;
    const st = this.st(c);
    st.description = { outfit: this.outfit(c.p!), until: Date.now() + 10 * 60_000, crime };
  }

  /** Un agente te reconoce si llevas la ropa de la descripción, si te ve la cara de cerca o si te persigue la unidad Hierro. */
  recognizes(o: Entity, c: PlayerConn) {
    const p = c.p!, e = c.e!, st = this.st(c);
    if (o.aggro === e.id) return true;
    if (st.description && st.description.until > Date.now() && st.description.outfit === this.outfit(p)) return true;
    if (!this.faceCovered(p) && Math.hypot(o.x - e.x, o.y - e.y) < 3) return true;
    return p.wanted >= 4 && o.npcType === 'hierro';
  }

  /** ¿Restringido? Comisarías, bancos, cárceles, torres corporativas y laboratorios. */
  restricted(zoneId: string) { return (this.w.zones.get(zoneId)?.def as any)?.restricted as string | undefined; }

  /** Arco detector en la entrada de un lugar restringido. Devuelve true si salta la alarma. */
  detector(c: PlayerConn, zoneId: string): boolean {
    const def = this.w.zones.get(zoneId)?.def as any;
    if (!def?.detector) return false;
    const p = c.p!;
    const guns = this.detectable(p);
    const integrated = effective(this.w.c, p).integrated;
    if (!guns.length) {
      this.w.send(c, { t: 'notice', kind: 'good', text: integrated.length ? `Arco detector: verde. No ve el cromo: tu ${this.w.c.items.find((i) => i.id === integrated[0])?.name ?? 'arma integrada'} pasa sin problemas.` : 'Arco detector: verde. Pasas sin problemas.' });
      return false;
    }
    const dis = this.disguise(p);
    if (dis === 'disfraz-pcv' || (dis === 'disfraz-seguridad' && def.restricted !== 'policia' && def.restricted !== 'carcel')) {
      this.w.send(c, { t: 'notice', kind: 'info', text: `Arco detector: pita, pero el guardia ve tu uniforme (${DISGUISE_NAME[dis]}) y te deja pasar armado.` });
      return false;
    }
    const st = this.st(c);
    st.suspicion = 100;
    this.w.send(c, { t: 'notice', kind: 'bad', text: `🚨 ¡ARCO DETECTOR! Llevas ${guns.length} ${guns.length === 1 ? 'arma' : 'armas'} encima (${guns.map((g) => this.w.c.items.find((i) => i.id === g)?.name ?? g).join(', ')}). Salta la alarma. Para entrar en sigilo: sin armas o con cromo.` });
    this.w.send(c, { t: 'fx', kind: 'alarm', from: c.e!.id, to: c.e!.id });
    (c as any).pendingAlarm = Date.now();
    return true;
  }

  /** Cada segundo: quién te ve, cuánta sospecha generas y en qué estado estás; se lo cuenta al cliente. */
  tick() {
    const now = Date.now();
    for (const c of this.w.conns.values()) {
      const p = c.p, e = c.e;
      if (!p || !e || p.status !== 'alive' || e.ghostOf) continue;
      const st = this.st(c);
      const zone = e.zone, lvl = dangerAt(zone.grid, e.x, e.y);
      const restricted = (zone.def as any).restricted as string | undefined;
      const ef = effective(this.w.c, p);
      const dis = this.disguise(p);
      const fitsHere = !!(restricted && dis && DISGUISE_OK[dis]?.includes(restricted));
      const outfit = this.outfit(p);
      const descr = st.description && st.description.until > now && st.description.outfit === outfit;
      const drawn = !!(p.equipped && !ef.integrated.includes(p.equipped));
      const carried = this.detectable(p).length;
      const observers: number[] = [];
      let gain = 0, anyone = false, serious = false;
      for (const o of zone.query(e.x, e.y, 16)) {
        if (o.kind !== 'npc' || !this.sees(o, e)) continue;
        anyone = true;
        const cop = WATCHERS.has(o.npcType ?? '');
        const guard = cop || (restricted && o.npcType !== 'civil');
        const gangHere = o.npcType === 'gang' && !!zone.def.gangBase && zone.def.gangBase.faction === o.faction && (p.rep.get(o.faction!) ?? 0) < 40;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        let g = 0;
        if (lvl !== 'lawless' || restricted) {
          if (drawn && (cop || guard)) g += dis === 'disfraz-pcv' ? 0 : 22;
          else if (drawn && o.npcType === 'civil' && lvl !== 'disputed') g += 5;
          if (!drawn && carried && guard && (lvl === 'protected' || restricted) && !fitsHere) g += 9;
          const before = g;
          if (restricted && guard && !fitsHere) g += 22;
          if (fitsHere && cop && d < 2.5) g += 8; // los agentes de cerca pueden ver que no eres de los suyos
          if (p.carrying && (cop || guard)) g += 50;
          if (descr && cop) g += 40;
          if (cop && p.identified && !this.faceCovered(p) && d < 4) g += 30;
          if (cop && p.wanted >= 1 && (descr || (!this.faceCovered(p) && d < 3))) g += 60;
          if (g > before) serious = true;
        }
        if (gangHere) { g += 30; serious = true; }
        if (g > 0) observers.push(o.id);
        gain = Math.max(gain, g) + (g > 0 ? 3 : 0);
      }
      if (gain > 0) st.suspicion = Math.min(100, st.suspicion + gain);
      else st.suspicion = Math.max(0, st.suspicion - (anyone ? 5 : 12));
      // ¡Descubierto!
      if (st.suspicion >= 100 && now > st.alertUntil) {
        // Solo por llevar un arma a la vista, la primera vez te dan el alto y te piden que la guardes.
        if (!serious && !restricted && p.wanted < 1 && !(c as any).pendingAlarm && now - (st.warnedAt ?? 0) > 60_000) {
          st.warnedAt = now; st.suspicion = 50;
          const o = this.w.entities.get(observers[0]);
          const line = '¡Eh, usted! ¡Baje el arma y guárdela! No se lo repito.';
          if (o) for (const q of e.zone.query(o.x, o.y, 18)) if (q.kind === 'player' && q.conn) this.w.send(q.conn, { t: 'speech', id: o.id, text: line });
          this.w.send(c, { t: 'notice', kind: 'warn', text: '👮 Un agente te ha visto con el arma en la mano. Guárdala (ruleta de armas → Manos vacías) o irá a por ti.' });
        } else this.discovered(c, observers, restricted);
      }
      const inCombat = now - p.lastCombatAt < 8000;
      st.state = now < st.alertUntil ? 'descubierto' : inCombat ? 'combate' : st.suspicion >= 25 ? 'sospecha' : anyone ? 'visto' : p.wanted >= 1 ? 'buscado' : 'oculto';
      st.observers = observers;
      const view: StealthView = { state: st.state, suspicion: Math.round(st.suspicion), observers, hunters: this.hunters(c), disguise: dis ? DISGUISE_NAME[dis] : undefined,
        faceCovered: this.faceCovered(p), described: !!descr, armed: drawn ? 'empuñada' : carried ? 'a la vista' : 'ninguna', restricted };
      const key = JSON.stringify(view);
      if (key !== st.lastSent) { st.lastSent = key; this.w.send(c, { t: 'stealth', view }); }
    }
  }

  private discovered(c: PlayerConn, observers: number[], restricted?: string) {
    const p = c.p!, e = c.e!, st = this.st(c);
    st.alertUntil = Date.now() + 20_000;
    st.suspicion = 70;
    st.description = { outfit: this.outfit(p), until: Date.now() + 10 * 60_000, crime: 'comportamiento sospechoso' };
    const lethal = p.wanted >= 3 || e.zone.def.kind === 'interior' && restricted === 'carcel';
    let n = 0;
    for (const id of observers) { const o = this.w.entities.get(id); if (!o || o.state === 'downed') continue; if (WATCHERS.has(o.npcType ?? '') || restricted || o.npcType === 'gang') { o.aggro = e.id; o.aggroLethal = lethal || o.npcType === 'gang'; n++; } }
    // También los que vigilan el resto del local restringido.
    if (restricted || (c as any).pendingAlarm) for (const o of e.zone.entities) if (WATCHERS.has(o.npcType ?? '') && o.state !== 'downed' && o.aggro === undefined) { o.aggro = e.id; o.aggroLethal = lethal; n++; }
    (c as any).pendingAlarm = undefined;
    if (p.wanted < 1 && (restricted || n)) void this.w.survival.addWanted(c, 1, restricted ? 'intrusión en zona restringida' : 'comportamiento sospechoso');
    this.w.send(c, { t: 'notice', kind: 'bad', text: `⚠ ¡DESCUBIERTO! ${n ? `${n} ${n === 1 ? 'persona va' : 'personas van'} a por ti.` : ''} Cámbiate de ropa y escóndete para que pierdan tu descripción.` });
  }

  /** Quién te busca: la PCV, unidades militares, carteles y bandas con precio por tu cabeza, cazarrecompensas… */
  hunters(c: PlayerConn): StealthView['hunters'] {
    const p = c.p!, out: StealthView['hunters'] = [];
    if (p.wanted >= 1) out.push({ id: 'pcv', name: `PCV · nivel ${Math.floor(p.wanted)}`, icon: '🚓', color: '#43a8ff' });
    if (p.wanted >= 4) out.push({ id: 'hierro', name: 'Unidad Hierro (militares)', icon: '🪖', color: '#c8ccd8' });
    const bounties = this.w.survival.bounties.onPlayer(p.charId);
    const posters = new Map<string, number>();
    for (const b of bounties) if (b.poster !== 'pcv') posters.set(b.poster, (posters.get(b.poster) ?? 0) + b.amount);
    for (const [poster, amount] of posters) {
      const f = this.w.c.factions.find((x) => x.id === poster);
      out.push({ id: `b-${poster}`, name: `${f ? f.name : 'Cazarrecompensas'} · ${amount.toLocaleString('es-ES')} €$`, icon: f?.kind === 'gang' ? '💀' : f ? '🏢' : '🎯', color: f?.color ?? '#ffd23f' });
    }
    for (const f of this.w.c.factions) if (f.kind === 'gang' && (p.rep.get(f.id) ?? 0) <= -50 && !posters.has(f.id)) out.push({ id: `f-${f.id}`, name: `${f.name} (hostiles)`, icon: '⚔', color: f.color });
    if (p.identified) out.push({ id: 'cam', name: 'Tu cara está en los registros de la PCV', icon: '📷', color: '#ff8a3d' });
    return out.slice(0, 6);
  }
}
