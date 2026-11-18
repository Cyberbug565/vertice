// Combate automático por armas, red (quickhacks), facciones, policía, Rescate Ámbar y transporte de cuerpos.
import { isSick, substanceEffects } from '../game/substances.js';
import { randomUUID } from 'node:crypto';
import { AIM, COVER_FULL, COVER_HALF, PART_NAMES, hitPart, type AimZone, type BodyPart, diversifyAppearance, facingToIdx } from '@vertice/shared';
import { checkChance, dangerAt, findPath, lineWalkable, nearestWalkable, isWalkable, skillLevelForXp, type ClientMsg, type FactionsView, type AmbarView, type ItemDef, type ScanView, type TargetMenuView, type WeaponDef } from '@vertice/shared';
import type { World, PlayerConn } from './world.js';
import type { Entity } from './entity.js';
import type { Survival } from './survival.js';
import { ambientBrain } from './npc.js';
import { GameError } from '../game/effects.js';
import { NET_RANKS, aimOf, chromeParts, effective, perkMods, skillLevel, weaponFits, type PlayerState } from '../game/player.js';
import { Wounds } from './wounds.js';
import { randomUUID as uuid } from 'node:crypto';
import type { Bounty } from '../game/bounty.js';
import type { Zone } from './zone.js';

const FISTS: { id: string; name: string; w: WeaponDef } = { id: 'punos', name: 'Puños', w: { traits: [], kind: 'melee', family: 'Puños', damage: [3, 7], range: 1.6, cooldown: 1.0, accuracy: 0, nonlethal: 'opcional', noise: 0.1, tech: 'clasica' } };
const CIVIL_LINES = ['¿Qué miras?', 'Hoy no tengo nada para ti.', 'Cuidado por aquí de noche.', 'Dicen que la PCV ni se asoma a Forja.', 'Si te operas, que sea con alguien de fiar.', 'Las torres de Cénit no duermen nunca.'];
type Src = { name: string; charId?: string; npc?: Entity; police?: boolean };

export class Combat {
  /** Comparte el generador de la supervivencia (las pruebas lo fijan para ser deterministas). */
  rng: () => number = () => this.sv.rng();
  private atmCooldown = new Map<string, number>();
  private respawnQueue: { at: number; zone: string; template: Record<string, unknown> }[] = [];
  private rescues = new Map<string, { at: number; team: number[]; plan: string }>();

  constructor(private w: World, private sv: Survival) {}
  private get c() { return this.w.c; }
  private roll() { return 1 + Math.floor(this.rng() * 10); }
  private notice(conn: PlayerConn | undefined, kind: 'info' | 'good' | 'warn' | 'bad', text: string) { if (conn) this.w.send(conn, { t: 'notice', kind, text }); }
  private fx(e: Entity, kind: 'shot' | 'hit' | 'hack' | 'ko' | 'dodge' | 'kick' | 'heavy', from: number, to: number, extra: { part?: string; weapon?: string; hit?: boolean; sever?: boolean; crit?: boolean; burst?: number; x?: number; y?: number } = {}) { for (const o of e.zone.query(e.x, e.y, 28)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'fx', kind, from, to, ...extra }); }
  /** v0.6: heridas por zonas del cuerpo. */
  get wounds() { return (this._wounds ??= new Wounds(this.w, () => this.rng())); }
  private _wounds?: Wounds;
  private bump(e: Entity) { e.labelVer++; }

  // ================================================================ población: bandas, policía y servicios
  spawnPopulation() {
    for (const z of this.w.zones.values()) {
      for (const g of z.def.gangs) for (let i = 0; i < g.count; i++) this.spawnFactionNpc(z, g.faction, 'gang', g.area);
      // Ciudad única: bandas y patrullas por distrito.
      for (const d of z.def.districts) {
        for (const g of d.gangs) for (let i = 0; i < g.count; i++) this.spawnFactionNpc(z, g.faction, 'gang', g.area);
        for (let i = 0; i < d.police; i++) { const wp = d.waypoints[Math.floor(this.rng() * d.waypoints.length)]; this.spawnFactionNpc(z, 'pcv', 'police', wp ? [wp[0], wp[1], 6] : undefined); }
      }
      // v0.10 · En los lugares restringidos privados, los guardias son de seguridad privada.
      if (!z.def.districts.length) for (let i = 0; i < z.def.police; i++) { const g = this.spawnFactionNpc(z, 'pcv', 'police'); const r = (z.def as any).restricted; if (g && (r === 'corporativo' || r === 'banco' || r === 'laboratorio')) { g.title = 'Seguridad privada'; g.name = g.name.replace('Agente', 'Guardia'); } }
    }
  }
  spawnFactionNpc(z: Zone, faction: string, type: Entity['npcType'], area?: [number, number, number], at?: { x: number; y: number }): Entity | null {
    const f = this.c.factions.find((x) => x.id === faction)!;
    let pos = at ?? null;
    for (let tries = 0; !pos && tries < 12; tries++) {
      const wp = area ? [area[0] + (this.rng() * 2 - 1) * area[2], area[1] + (this.rng() * 2 - 1) * area[2]] : z.def.waypoints[Math.floor(this.rng() * z.def.waypoints.length)];
      pos = nearestWalkable(z.grid, wp[0] + 0.5, wp[1] + 0.5, 3);
    }
    if (!pos) return null;
    const titles: Record<string, string> = { police: 'Agente de la PCV', hierro: 'Unidad Hierro', ambar: 'Equipo Ámbar', gang: f.name };
    const names = ['Rex', 'Nova', 'Iker', 'Mara', 'Kenji', 'Lola', 'Toro', 'Sombra', 'Zafiro', 'Vic', 'Dana', 'Oso', 'Yara', 'Kai', 'Tano', 'Rui'];
    const dark = (h: string) => '#' + h.slice(1).match(/../g)!.map((x) => Math.round(parseInt(x, 16) * 0.55).toString(16).padStart(2, '0')).join('');
    const e = this.w.spawnNpc(z, {
      name: type === 'police' ? `Agente ${names[Math.floor(this.rng() * names.length)]}` : type === 'hierro' ? `Hierro-${Math.floor(this.rng() * 90 + 10)}` : type === 'ambar' ? `Paramédico Ámbar` : `${names[Math.floor(this.rng() * names.length)]}`,
      title: titles[type!] ?? f.name, x: pos.x, y: pos.y, label: type === 'police' ? 'Patrullando' : type === 'gang' ? `Territorio de ${f.name}` : '',
      appearance: { skin: ['#f0c8a8', '#c89070', '#8a5a3c', '#e0b48c'][Math.floor(this.rng() * 4)], hair: ['#1a1a1a', '#5a3a2a', '#d9d9e3'][Math.floor(this.rng() * 3)], jacket: dark(f.color), accent: f.color,
        build: this.rng() < 0.5 ? 'robusto' : 'medio', hairStyle: ['rapado', 'cresta', 'corto', 'coleta', 'calvo'][Math.floor(this.rng() * 5)], top: type === 'police' || type === 'hierro' ? 'chaleco' : ['chaqueta', 'chaleco', 'sudadera', 'top'][Math.floor(this.rng() * 4)], accessory: type === 'hierro' ? 'mascara' : type === 'police' ? 'gorra' : 'ninguno' } as any,
      speed: type === 'hierro' ? 3.2 : 2.4,
    });
    if (e.appearance) diversifyAppearance(e.appearance as any, () => this.rng(), type === 'police' ? 'police' : type === 'hierro' ? 'hierro' : type === 'gang' ? 'gang' : 'civil');
    // v0.4: nivel del PNJ según su tipo; la salud y la defensa escalan con él.
    const lv = type === 'hierro' ? 18 + Math.floor(this.rng() * 7) : type === 'police' ? 8 + Math.floor(this.rng() * 7) : type === 'ambar' ? 15 : faction === 'engranajes' || faction === 'saqueadores' ? 9 + Math.floor(this.rng() * 8) : 4 + Math.floor(this.rng() * 10);
    const hpScaled = Math.round(f.hp * (1 + (lv - 6) * 0.04));
    e.npcType = type; e.faction = faction; e.npcMax = hpScaled; e.npcHp = hpScaled; e.defense = f.defense + Math.floor((lv - 6) / 4); e.weaponId = f.weapon; e.chrome = [...f.chrome]; e.level = lv;
    e.dialog = undefined;
    e.npc = ambientBrain(this.w.cfg.seed + e.id * 7, area ? [area[0], area[1]] : undefined, area?.[2]);
    e.respawn = { zone: z.id, template: { faction, type, area } };
    return e;
  }

  // ================================================================ armas y estadísticas
  weaponOf(p: PlayerState) {
    const ef = effective(this.c, p);
    return ef.weapon?.weapon ? { id: ef.weapon.id, name: ef.weapon.name, w: ef.weapon.weapon } : FISTS;
  }
  /** Arma usada para un ataque: con un arma de fuego sin modo no letal, dejar KO es un culatazo cuerpo a cuerpo. */
  weaponFor(p: PlayerState, lethal: boolean) {
    const wp = this.weaponOf(p);
    if (!lethal && wp.w.kind === 'ranged' && wp.w.nonlethal === 'no') return { id: 'culatazo', name: `Culatazo (${wp.name})`, w: { ...FISTS.w, family: 'Culatazo', damage: [5, 10] as [number, number], cooldown: 1.2 } };
    return wp;
  }
  private npcWeapon(e: Entity) {
    const it = e.weaponId ? this.c.items.find((i) => i.id === e.weaponId) : undefined;
    return it?.weapon ? { id: it.id, name: it.name, w: it.weapon } : FISTS;
  }
  private encPenalty(p: PlayerState) {
    const ef = effective(this.c, p);
    const load = ef.weight + (p.carrying ? 70 : 0);
    return load > ef.carryMax * 1.5 ? 4 : load > ef.carryMax ? 2 : 0;
  }
  attackScore(p: PlayerState) {
    const ef = effective(this.c, p), wp = this.weaponOf(p);
    const skill = wp.w.kind === 'melee' ? ef.skills.cuerpo ?? 0 : ef.skills.armas ?? 0;
    const edge = ef.flags.has('al-limite') && p.hp < ef.hpMax * 0.3 ? 3 : 0;
    const charge = (p.buffs.carga ?? 0) > Date.now() ? 3 : 0;
    const affectedAim = wp.w.kind === 'ranged' ? substanceEffects(this.c, p.substances).aim : 0;
    return ef.attrs.REF + skill + wp.w.accuracy + ef.confront - this.encPenalty(p) - (p.fatigue >= 80 ? 1 : 0) + (wp.w.kind === 'ranged' ? ef.perk.rangedAcc ?? 0 : 0) + edge + charge + affectedAim;
  }
  defenseScore(p: PlayerState) {
    const ef = effective(this.c, p);
    const edge = ef.flags.has('al-limite') && p.hp < ef.hpMax * 0.3 ? 3 : 0;
    return ef.attrs.DEX + (ef.skills.atletismo ?? 0) + ef.defense + (p.stance === 'avoid' ? 1 : 0) - (p.sleeping ? 6 : 0) - (p.blindUntil > Date.now() ? 4 : 0) - (ef.flags.has('imparable') ? 0 : this.encPenalty(p)) + edge + substanceEffects(this.c, p.substances).defense;
  }
  /** Probabilidad de esquivar por completo (perks, implantes y Tiempo bala). */
  dodgeOf(p: PlayerState) { return Math.min(0.6, effective(this.c, p).dodge + ((p.buffs['tiempo-bala'] ?? 0) > Date.now() ? 0.3 : 0)); }
  private npcAttackScore(e: Entity) { return (e.defense ?? 10) + Math.floor((e.level ?? 5) / 5) + this.npcWeapon(e).w.accuracy - (e.blindUntil && e.blindUntil > Date.now() ? 4 : 0); }
  private npcDefenseScore(e: Entity) { return (e.defense ?? 10) - (e.blindUntil && e.blindUntil > Date.now() ? 4 : 0); }
  private armorOf(p: PlayerState) { return effective(this.c, p).armor; }
  private rollDamage(w: WeaponDef, margin: number) { const [a, b] = w.damage; return Math.round(a + this.rng() * (b - a) + Math.max(0, margin) / 2); }

  // ================================================================ menú contextual
  menu(c: PlayerConn, target: Entity): TargetMenuView {
    const p = c.p!, e = c.e!;
    const prot = dangerAt(e.zone.grid, e.x, e.y) === 'protected' || dangerAt(target.zone.grid, target.x, target.y) === 'protected';
    const block = prot ? 'Zona protegida: aquí no se permiten agresiones.' : undefined;
    const opts: TargetMenuView['options'] = [];
    const tp = this.w.playerOf(target);
    const downed = tp ? tp.status === 'downed' : target.state === 'downed';
    const wp = this.weaponOf(p);
    const atk = this.attackScore(p);
    const def = tp ? this.defenseScore(tp) : this.npcDefenseScore(target);
    const chance = opposed(atk, def);
    const fac = target.faction ? this.c.factions.find((f) => f.id === target.faction) : undefined;
    const bounties = this.claimable(target, p);
    const bountyTxt = bounties.length ? ` · recompensa ${bounties.reduce((s, b) => s + b.amount, 0)} €$${bounties.some((b) => b.aliveOnly) ? ' (LO QUIEREN VIVO)' : ' (vivo o muerto)'}` : '';
    let subtitle = tp ? `Jugador · ${this.c.roles.find((r) => r.id === tp.role)?.name ?? ''}` : target.npcType === 'essential' ? target.title ?? '' : fac ? `${fac.name} · tu relación ${p.rep.get(fac.id) ?? 0}` : target.fugitive ? `Fugitivo · ${target.fugitive.crime}` : 'Transeúnte';
    subtitle += bountyTxt;
    if (target.kind === 'object') {
      if (target.objKind === 'camera') {
        const off = (target.disabledUntil ?? 0) > Date.now();
        this.hackOptions(p, e, target, opts);
        if (!opts.length) opts.push({ id: 'noop', kind: 'interact', group: 'red', label: 'Necesitas un cyberdeck para apagarla', disabled: 'Sin cyberdeck' });
        return { target: target.id, name: target.name, subtitle: off ? 'Cámara de vigilancia · APAGADA' : 'Cámara de vigilancia · grabando (si matas delante, te identifica)', options: opts };
      }
      if (target.objKind === 'shop' || target.objKind === 'vending') opts.push({ id: 'trade', kind: 'interact', group: 'social', label: 'Comprar y vender' });
      if (target.objKind === 'atm' || target.objKind === 'shop') this.hackOptions(p, e, target, opts);
      return { target: target.id, name: target.name, subtitle: target.objKind === 'atm' ? 'Cajero automático' : 'Comercio', options: opts };
    }
    if (target.marketSite) {
      opts.push({ id: 'trade', kind: 'interact', group: 'social', label: target.title === 'Entrega de la banda' ? 'Hablar de la entrega' : 'Negociar' });
      return { target: target.id, name: target.name, subtitle, color: fac?.color, options: opts };
    }
    if (target.npcType === 'essential' || (target.kind === 'npc' && !target.npcType && target.dialog && !target.fugitive && !target.npcMax)) {
      opts.push({ id: 'talk', kind: 'interact', group: 'social', label: 'Hablar' });
      if (target.npcShop) opts.push({ id: 'trade', kind: 'interact', group: 'social', label: 'Comerciar' });
      this.hackOptions(p, e, target, opts, true);
      return { target: target.id, name: target.name, subtitle: `${subtitle} · persona clave (no se puede atacar)`, color: fac?.color, options: opts };
    }
    if (target.carriedBy === e.id) { opts.push({ id: 'drop', kind: 'action', group: 'ayuda', label: 'Soltar el cuerpo' }); return { target: target.id, name: target.name, subtitle, options: opts }; }
    // v0.13 · Cadáver: se registra entero en el panel de saqueo (dinero, armas, objetos y cromo) y se puede cargar para
    // esconderlo en un contenedor antes de que alguien lo encuentre.
    if (target.dead) return { target: target.id, name: target.name, subtitle: target.corpse?.reportedAt ? 'Cadáver · ya lo han encontrado' : 'Cadáver', options: [
      { id: 'search', kind: 'action', group: 'ayuda', label: target.searched ? 'Registrar el cuerpo (vacío)' : 'Registrar el cuerpo', detail: 'Abre lo que lleva: dinero, armas, objetos y cromo.' },
      { id: 'carry', kind: 'action', group: 'ayuda', label: 'Cargar el cadáver', detail: 'Para esconderlo en un contenedor de basura, una taquilla o un bidón (E junto al contenedor). Suma unos 70 kg.', disabled: p.carrying ? 'Ya llevas a alguien' : undefined }] };
    if (downed) {
      if (!tp) opts.push({ id: 'search', kind: 'action', group: 'ayuda', label: 'Registrar el cuerpo', detail: 'Abre lo que lleva encima. Registrar a alguien inconsciente en zona vigilada es delito.' });
      if (tp) {
        const medic = p.profession === 'medico' || p.role === 'medtech';
        opts.push({ id: 'rescue', kind: 'action', group: 'ayuda', label: 'Estabilizar', detail: medic ? 'Como médico/Medtech no necesitas material.' : 'Gasta un estimulante médico.', disabled: !medic && (p.inventory.get('estim') ?? 0) < 1 ? 'Necesitas un estimulante médico' : undefined });
      }
      opts.push({ id: 'carry', kind: 'action', group: 'ayuda', label: 'Cargar el cuerpo', detail: 'Suma unos 70 kg a tu carga: irás más lento y torpe.', disabled: p.carrying ? 'Ya llevas a alguien' : undefined });
      opts.push({ id: 'finish', kind: 'action', group: 'combate', label: 'Rematar', danger: true, detail: tp ? 'Muerte definitiva del personaje. Es un delito grave.' : 'Lo mata.', disabled: block });
      return { target: target.id, name: target.name, subtitle: `${subtitle} · ${tp ? (tp.downedLethal ? 'desangrándose' : 'inconsciente') : target.npcLethalDown ? 'desangrándose' : 'inconsciente'}`, color: fac?.color, options: opts };
    }
    opts.push({ id: 'talk', kind: 'interact', group: 'social', label: 'Hablar' });
    if (target.npcType === 'police' && p.wanted >= 1) opts.push({ id: 'bribe', kind: 'action', group: 'social', label: `Sobornar (${this.bribeCost(p)} €$)`, detail: 'Una «tasa de agilización» y tu expediente desaparece.', disabled: p.money < this.bribeCost(p) ? 'No te llega el dinero' : undefined });
    const robDv = tp ? 8 + (effective(this.c, tp).skills.percepcion ?? 0) + Math.floor(effective(this.c, tp).attrs.INT / 2) - (tp.sleeping ? 6 : 0) : 8 + Math.floor((target.defense ?? 10) / 2);
    const robChance = checkChance(effective(this.c, p).attrs.DEX, (effective(this.c, p).skills.sigilo ?? 0) + effective(this.c, p).steal + ((tp ? tp.blindUntil : target.blindUntil ?? 0) > Date.now() ? 4 : 0), robDv);
    if (!target.fugitive) opts.push({ id: 'rob', kind: 'action', group: 'social', label: 'Robar (carterista)', chance: robChance, detail: 'Le quitas dinero sin que se dé cuenta. Si fallas, reacciona.', disabled: block });
    const range = `${wp.name}, alcance ${wp.w.range} m`;
    const ko = this.weaponFor(p, false);
    opts.push({ id: 'knockout', kind: 'action', group: 'combate', label: target.fugitive ? 'Capturar vivo (dejar KO)' : 'Dejar KO', chance, detail: `${ko.name}, alcance ${ko.w.range} m. Golpes no letales: queda inconsciente.`, disabled: block });
    opts.push({ id: 'attack', kind: 'action', group: 'combate', label: target.fugitive ? 'Abatir' : 'Atacar a matar', chance, danger: true, detail: `${range}. ${tp ? 'Si cae, se desangra en 30 s salvo que le estabilicen o le rescate Ámbar.' : 'Puede morir.'}`, disabled: block ?? (wp.w.nonlethal === 'solo' ? `${wp.name} solo hace daño no letal` : undefined) });
    // Disparo apuntado: seguro dentro de tu alcance de tiro (verde), pero tienes que estar quieto apuntando.
    if (wp.w.kind === 'ranged') {
      const aim = aimOf(this.c, p), dist = Math.hypot(target.x - e.x, target.y - e.y);
      const impaired = substanceEffects(this.c, p.substances).aim < 0;
      opts.push({ id: 'aim', kind: 'action', group: 'combate', label: `Disparo apuntado (${aim.time} s quieto)`, chance: dist <= aim.range && !impaired ? 1 : undefined, danger: true,
        detail: impaired ? `Puntería reducida por tus efectos activos. Puedes apuntar hasta ${aim.range} m.` : `Tiro seguro hasta ${aim.range} m (está a ${dist.toFixed(0)} m). Mejora con Armas a distancia y REF.`, disabled: block ?? (dist > aim.range ? `Fuera de tiro seguro: acércate a ${aim.range} m` : !this.lineClear(e, target) ? 'Sin línea de tiro' : undefined) });
    }
    const cov = wp.w.kind === 'ranged' ? this.coverOf(e, target) : 0;
    if (cov) subtitle += cov >= 6 ? ' · a cubierto (difícil de alcanzar)' : ' · parcialmente a cubierto';
    this.hackOptions(p, e, target, opts);
    return { target: target.id, name: target.name, subtitle, color: fac?.color ?? (target.fugitive ? '#ff3040' : undefined), options: opts };
  }

  /** v0.9 · Modo hackeo (tecla R + clic): solo las opciones de red sobre lo señalado (persona, cámara, cajero, terminal…). */
  hackMenu(c: PlayerConn, target: Entity): TargetMenuView {
    const p = c.p!, e = c.e!;
    const opts: TargetMenuView['options'] = [];
    const tp = this.w.playerOf(target);
    const fac = target.faction ? this.c.factions.find((f) => f.id === target.faction) : undefined;
    const what = target.kind === 'object' ? (target.objKind === 'camera' ? 'Cámara de vigilancia' : target.objKind === 'atm' ? 'Cajero automático' : 'Terminal') : tp ? 'Jugador' : fac ? fac.name : 'Persona';
    const hackable = target.kind === 'player' || target.kind === 'npc' || (target.kind === 'object' && ['camera', 'atm', 'shop', 'vending', 'computer', 'terminal'].includes(target.objKind ?? ''));
    if (!hackable) return { target: target.id, name: target.name, subtitle: 'Sin puertos abiertos: no hay nada que hackear aquí.', hackMode: true, options: [] };
    if (effective(this.c, p).ram <= 0) opts.push({ id: 'noop', kind: 'interact', group: 'red', label: 'Necesitas un cyberdeck', disabled: 'Instálate un cyberdeck en un matasanos (o sé Netrunner).' });
    else this.hackOptions(p, e, target, opts, target.npcType === 'essential');
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    return { target: target.id, name: target.name, subtitle: `${what} · a ${dist.toFixed(0)} m · RAM ${Math.floor(p.ram)}/${effective(this.c, p).ram}`, color: '#b46cff', hackMode: true, options: opts };
  }

  private hackOptions(p: PlayerState, e: Entity, target: Entity, opts: TargetMenuView['options'], scanOnly = false) {
    const ef = effective(this.c, p);
    if (ef.ram <= 0) return;
    const kind = target.kind === 'object' ? (target.objKind === 'atm' ? 'atm' : target.objKind === 'camera' ? 'camera' : 'shop') : 'person'; // terminales y máquinas usan los hackeos de comercio
    for (const q of this.c.quickhacks) {
      if (q.target !== kind || (scanOnly && q.effect !== 'scan' && q.effect !== 'deepscan')) continue;
      const cost = this.ramCost(p, q.ram, q.effect);
      const dist = Math.hypot(target.x - e.x, target.y - e.y);
      const chance = this.hackChance(p, target, q);
      let disabled: string | undefined;
      if (p.netRank < q.minRank) disabled = `Requiere rango de red ${q.minRank} (tienes ${p.netRank})`;
      else if (skillLevel(p, 'interfaz') < q.minSkill) disabled = `Requiere Interfaz ${q.minSkill} (tienes ${skillLevel(p, 'interfaz')})`;
      else if (p.ram < cost) disabled = `RAM insuficiente (${Math.floor(p.ram)}/${cost})`;
      else if (dist > q.range) disabled = `Fuera de alcance (${dist.toFixed(0)}/${q.range} m)`;
      else if (q.effect !== 'scan' && q.effect !== 'deepscan' && q.effect !== 'blind' && dangerAt(e.zone.grid, e.x, e.y) === 'protected' && kind === 'person') disabled = 'Zona protegida';
      opts.push({ id: `hack:${q.id}`, kind: 'hack', group: 'red', label: `${q.name} · ${cost} RAM · ${this.uploadTime(p, q.upload).toFixed(1)} s`, chance, detail: q.desc + (q.trace ? ` Riesgo de rastreo ${Math.round(this.traceOf(p, q.trace) * 100)} %.` : ''), disabled, danger: q.effect === 'kill' });
    }
  }
  private ramCost(p: PlayerState, ram: number, effect?: string) {
    const pm = perkMods(this.c, p);
    if (pm.flags.has('analista') && (effect === 'scan' || effect === 'deepscan')) return 1;
    return Math.max(1, Math.round((ram - Math.floor(p.netRank / 3)) * (1 - (pm.mods.hackCost ?? 0)) * (pm.flags.has('dios-red') ? 0.5 : 1) * (1 - effective(this.c, p).matrix.hackCost)));
  }
  private uploadTime(p: PlayerState, base: number) {
    const pm = perkMods(this.c, p);
    if (pm.flags.has('dios-red')) return 0.3;
    const mx = effective(this.c, p).matrix.hackSpeed;
    if (mx) return Math.max(0.15, base * (1 - mx));
    return Math.max(0.4, base * (1 - 0.06 * p.netRank) * (p.role === 'netrunner' ? 0.85 : 1) * (1 - (pm.mods.hackSpeed ?? 0)));
  }
  private hackScore(p: PlayerState) { const ef = effective(this.c, p); return ef.attrs.INT + (ef.skills.interfaz ?? 0) + Math.floor(p.netRank / 2) + (p.role === 'netrunner' ? 2 : 0) + (ef.perk.hackChance ?? 0); }
  private hackDefense(target: Entity): number {
    const tp = this.w.playerOf(target);
    if (tp) {
      let d = effective(this.c, tp).attrs.WILL - 5;
      for (const ci of tp.cyber) if (ci.location === 'installed') { if (ci.def === 'filtro-neural') d += 3; if (ci.def === 'ice-aislamiento') d += 6; }
      return d;
    }
    if (target.kind === 'object') { const sh = target.shop ? this.c.shops.find((s) => s.id === target.shop) : undefined; return sh ? Math.floor((sh.security - 12) / 2) : 1; }
    return target.npcType === 'hierro' ? 6 : target.npcType === 'police' ? 2 : target.faction === 'voces-vacio' ? 4 : target.npcType === 'gang' ? 1 : 0;
  }
  private traceOf(p: PlayerState, base: number) { return base * Math.max(0.2, 1 - p.netRank * 0.05) * (1 - (perkMods(this.c, p).mods.trace ?? 0)); }
  private hackChance(p: PlayerState, target: Entity, q: { dv: number }) { const s = this.hackScore(p), dv = q.dv + this.hackDefense(target); return checkChance(s, 0, dv); }

  // ================================================================ acciones
  bribeCost(p: PlayerState) { const pm = perkMods(this.c, p); return pm.flags.has('lengua') ? 0 : Math.round(250 * Math.max(1, Math.ceil(p.wanted)) * (1 - (pm.mods.bribe ?? 0))); }
  async bribe(c: PlayerConn, opId: string) {
    const p = c.p!;
    if (p.wanted < 0.5) throw new GameError('No tienes ningún expediente abierto.');
    const cost = this.bribeCost(p);
    if (p.money < cost) throw new GameError(`La «tasa de agilización» son ${cost} €$.`);
    this.w.progress.gain(p, 'negociacion', 5);
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:bribe`, p.charId, -cost, p.money - cost, 'Tasa de agilización a la PCV (soborno)']);
      await q.query('UPDATE characters SET money = money - $2, wanted = 0 WHERE id = $1', [p.charId, cost]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'bribe', JSON.stringify({ cost })]);
    });
    p.money -= cost; p.wanted = 0;
    const pcv = this.sv.bounties.onPlayer(p.charId).filter((b) => b.poster === 'pcv');
    if (pcv.length) await this.sv.bounties.cancel(pcv.map((b) => b.id));
    this.sv.updateMarker(c.e!);
    for (const o of c.e!.zone.entities) if ((o.npcType === 'police' || o.npcType === 'hierro') && o.aggro === c.e!.id) { o.aggro = undefined; }
    this.notice(c, 'good', `El agente cobra ${cost} €$ y tu expediente «se pierde».`);
  }

  claimable(target: Entity, me: PlayerState): Bounty[] {
    const tp = this.w.playerOf(target);
    const list = tp ? this.sv.bounties.onPlayer(tp.charId) : target.fugitive ? this.sv.bounties.onNpc(target.fugitive.id) : [];
    return list.filter((b) => b.placedBy !== me.charId);
  }

  /** Acción hostil o de ayuda desde el menú. Si el objetivo está fuera de alcance, el personaje se acerca y la ejecuta al llegar. */
  async action(c: PlayerConn, m: Extract<ClientMsg, { t: 'hostile' }>) {
    const p = c.p!, e = c.e!;
    const fail = (reason: string) => this.w.send(c, { t: 'ack', seq: m.seq, ok: false, reason });
    if (p.status !== 'alive') return fail('No puedes hacer eso ahora.');
    if (p.sleeping) this.sv.wake(c);
    const target = this.w.entities.get(m.target);
    if (e.ghostOf) return fail('Eres una proyección: no puedes tocar nada.');
    if (!target || target.zone !== e.zone || target === e) return fail('Objetivo no válido.');
    let action: string = m.action;
    if (action === 'beat') action = 'knockout';
    if (action === 'claim') action = this.claimable(target, p).some((b) => b.aliveOnly) || (target.fugitive?.alive ?? false) ? 'knockout' : 'attack';
    if (action === 'talk') { this.talk(c, target); return this.w.send(c, { t: 'ack', seq: m.seq, ok: true }); }
    if (action === 'extract') { await this.w.threats.extract(c, target, m.chrome); return this.w.send(c, { t: 'ack', seq: m.seq, ok: true }); }
    if (action === 'search') {
      if (!(target.state === 'downed' || target.dead) || target.kind !== 'npc') return fail('Solo se puede registrar a alguien caído.');
      if (m.remote && Math.hypot(target.x - e.x, target.y - e.y) > 2.2) return fail('Acércate al cuerpo (WASD) para registrarlo.');
      if (Math.hypot(target.x - e.x, target.y - e.y) > 2.2) { const dest = nearestWalkable(e.zone.grid, target.x, target.y, 2); const r = dest ? findPath(e.zone.grid, e.x, e.y, dest.x, dest.y, 20000) : null; if (!r?.ok) return fail('No puedes llegar.'); e.path = r.path; e.moving = true; e.pendingAction = { target: target.id, action: 'search', opId: m.opId }; return this.w.send(c, { t: 'ack', seq: m.seq, ok: true, path: e.path }); }
      this.w.corpses.view(c, target); return this.w.send(c, { t: 'ack', seq: m.seq, ok: true });
    }
    if (action === 'aim') {
      const wpA = this.weaponOf(p);
      if (wpA.w.kind !== 'ranged') return fail('El disparo apuntado necesita un arma a distancia.');
      const aim = aimOf(this.c, p);
      const distA = Math.hypot(target.x - e.x, target.y - e.y);
      if (distA > aim.range) return fail(`Demasiado lejos para un tiro seguro (${distA.toFixed(0)} m de ${aim.range} m). Acércate o dispara sin apuntar.`);
      if (!this.lineClear(e, target)) return fail('No tienes línea de tiro.');
      if (dangerAt(e.zone.grid, e.x, e.y) === 'protected' || dangerAt(target.zone.grid, target.x, target.y) === 'protected') return fail('Zona protegida: aquí no se permiten agresiones.');
      e.path = []; e.moving = false;
      this.w.cancelActivity(e);
      e.channel = { startTick: this.w.tick, endTick: this.w.tick + Math.round(aim.time * 20), label: `Apuntando a ${target.name}`, targetId: target.id, apply: () => this.w.enqueue(c, async () => {
        const still = Math.hypot(target.x - e.x, target.y - e.y) <= aim.range + 1 && target.zone === e.zone;
        if (!still) { this.notice(c, 'warn', `${target.name} se ha salido de tu línea de tiro.`); return; }
        p.nextAttackAt = 0;
        try { await this.attack(c, target, true, m.opId, { part: m.part, aimed: true }); } catch (err) { if (err instanceof GameError) this.notice(c, 'warn', err.message); else throw err; }
        this.w.send(c, { t: 'action', text: '' });
      }) };
      this.w.send(c, { t: 'action', text: `Apuntando a ${target.name}${m.part ? ` (${m.part})` : ''}: no te muevas`, duration: aim.time });
      return this.w.send(c, { t: 'ack', seq: m.seq, ok: true });
    }
    if (target.npcType === 'essential' || (target.kind === 'npc' && !target.npcMax && !target.fugitive)) return fail('Esta persona no se puede atacar.');
    const hostile = ['rob', 'knockout', 'attack', 'finish', 'heavy', 'kick'].includes(action);
    if (hostile && (dangerAt(e.zone.grid, e.x, e.y) === 'protected' || dangerAt(target.zone.grid, target.x, target.y) === 'protected')) return fail('Zona protegida: aquí no se permiten agresiones.');
    const wp = this.weaponFor(p, action !== 'knockout');
    const range = action === 'knockout' || action === 'attack' || action === 'heavy' ? wp.w.range : action === 'kick' ? 1.9 : action === 'rob' || action === 'carry' || action === 'finish' ? 1.8 : 2.6;
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    const los = wp.w.kind === 'melee' || action === 'kick' || this.lineClear(e, target);
    if ((dist > range || !los) && m.remote) {
      // v0.9 · Sin persecución automática: el jugador se acerca con WASD.
      return fail(!los ? `No tienes línea de tiro hasta ${target.name}.` : `Fuera de alcance: ${dist.toFixed(1)} m (tu ${wp.w.kind === 'melee' ? 'golpe' : 'arma'} llega a ${range.toFixed(1)} m). Acércate con WASD.`);
    }
    if (dist > range || !los) {
      const dest = nearestWalkable(e.zone.grid, target.x, target.y, 2);
      const r = dest ? findPath(e.zone.grid, e.x, e.y, dest.x, dest.y, 20000) : null;
      if (!r?.ok) return fail('No puedes llegar hasta ahí.');
      e.path = r.path; e.moving = true;
      e.pendingAction = { target: target.id, action, opId: m.opId, part: m.part };
      return this.w.send(c, { t: 'ack', seq: m.seq, ok: true, path: e.path, info: `Acercándote a ${target.name}` });
    }
    e.path = []; e.moving = false;
    await this.execute(c, target, action, m.opId, m.part);
    this.w.send(c, { t: 'ack', seq: m.seq, ok: true });
  }

  /** v0.20 · Golpe cuerpo a cuerpo hacia donde apuntas (clic izquierdo con el derecho mantenido): si hay alguien a tiro
   *  en esa dirección le da; si no, el golpe se lanza al aire igualmente (se ve el movimiento, con o sin arma). */
  async swing(c: PlayerConn, dx: number, dy: number, heavy: boolean, opId: string) {
    const p = c.p!, e = c.e!, now = Date.now();
    if (p.status !== 'alive' || p.sleeping || p.driving || isSick(p.substances, now) || e.ghostOf || e.transit || e.carriedBy) throw new GameError('Ahora no puedes.');
    if ((e.stunUntil ?? 0) > now) throw new GameError('Estás aturdido.');
    if (effective(this.c, p).armsLost >= 2) throw new GameError('Sin brazos no puedes golpear.');
    const wp = this.weaponOf(p);
    if (wp.w.kind !== 'melee') throw new GameError('Con un arma a distancia se dispara: clic sobre el objetivo.');
    if (now < p.nextAttackAt) return;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    e.facing = facingToIdx(dx, dy); e.labelVer++;
    // ¿Alguien delante y a tiro? (un cono de unos 60° hacia donde apuntas)
    let best: Entity | undefined, bd = Infinity;
    const protectedHere = dangerAt(e.zone.grid, e.x, e.y) === 'protected';
    for (const o of e.zone.query(e.x, e.y, wp.w.range + 1)) {
      if (o === e || (o.kind !== 'npc' && o.kind !== 'player') || o.state === 'downed' || o.dead || o.ghostOf) continue;
      if (o.npcType === 'essential' || (o.kind === 'npc' && !o.npcMax && !o.fugitive)) continue;
      const vx = o.x - e.x, vy = o.y - e.y, d = Math.hypot(vx, vy);
      if (d > wp.w.range + 0.3 || d < 1e-3 || (vx * dx + vy * dy) / d < 0.5) continue;
      if (d < bd) { bd = d; best = o; }
    }
    if (best && !protectedHere && dangerAt(best.zone.grid, best.x, best.y) !== 'protected') {
      await this.execute(c, best, heavy ? 'heavy' : wp.w.nonlethal === 'solo' ? 'knockout' : 'attack', opId);
      return;
    }
    // Al aire: mismo gesto y su recuperación (algo menor), sin daño.
    if (heavy) { if (p.stamina < 3) throw new GameError('Sin aguante para un golpe fuerte.'); p.stamina -= 3; }
    p.nextAttackAt = now + wp.w.cooldown * 600 * (heavy ? 1.8 : 1);
    this.fx(e, heavy ? 'heavy' : 'hit', e.id, e.id, { weapon: wp.id === 'punos' ? undefined : wp.id, hit: false, x: e.x + dx, y: e.y + dy });
  }

  /** Comprueba en cada paso si una acción pendiente ya está a tiro (para no esperar a llegar al destino exacto). */
  checkPending(c: PlayerConn) {
    const e = c.e!, pa = e.pendingAction;
    if (!pa) return;
    const target = this.w.entities.get(pa.target);
    if (!target || target.zone !== e.zone) { e.pendingAction = undefined; return; }
    const wp = this.weaponFor(c.p!, pa.action !== 'knockout');
    const range = pa.action === 'knockout' || pa.action === 'attack' ? wp.w.range : 1.8;
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    if (dist <= range && (wp.w.kind === 'melee' || pa.action === 'rob' || pa.action === 'search' || this.lineClear(e, target))) {
      e.pendingAction = undefined; e.path = []; e.moving = false;
      this.w.enqueue(c, () => this.execute(c, target, pa.action, pa.opId, pa.part).catch((err) => { if (err instanceof GameError) this.notice(c, 'warn', err.message); else throw err; }));
    } else if (!e.path.length) {
      // El objetivo se movió: perseguirlo un poco más.
      const dest = nearestWalkable(e.zone.grid, target.x, target.y, 2);
      const r = dest ? findPath(e.zone.grid, e.x, e.y, dest.x, dest.y, 8000) : null;
      if (r?.ok && dist < 30) { e.path = r.path; e.moving = true; } else e.pendingAction = undefined;
    }
  }

  private async execute(c: PlayerConn, target: Entity, action: string, opId: string, part?: AimZone) {
    const p = c.p!;
    if (p.status !== 'alive') return;
    if (action === 'search') return this.w.corpses.view(c, target);
    if (action === 'rob') return this.rob(c, target, opId);
    if (action === 'carry') return this.carry(c, target);
    if (action === 'rescue') return this.sv.rescue(c, 0, target.id, opId);
    if (action === 'finish') return this.finish(c, target, opId);
    if (action === 'knockout' || action === 'attack') return this.attack(c, target, action === 'attack', opId, { part });
    if (action === 'heavy') return this.attack(c, target, this.weaponOf(p).w.nonlethal !== 'solo', opId, { part, style: 'heavy' });
    if (action === 'kick') return this.kick(c, target, opId);
  }

  /** v0.9 · Esquiva: un rodar rápido de 2,6 m hacia donde andas. Durante medio segundo casi nada te alcanza. */
  dodge(c: PlayerConn, dx: number, dy: number) {
    const p = c.p!, e = c.e!;
    const now = Date.now();
    if (p.status !== 'alive' || p.sleeping || p.driving || e.transit) throw new GameError('Ahora no puedes esquivar.');
    if ((e.stunUntil ?? 0) > now) throw new GameError('Estás aturdido.');
    if ((e.dodgeReadyAt ?? 0) > now) throw new GameError('Aún te estás recuperando del último rodar.');
    if (effective(this.c, p).legsLost >= 1) throw new GameError('Sin una pierna no puedes rodar.');
    const ef = effective(this.c, p);
    const cost = ef.flags.has('salto-reforzado') || ef.flags.has('reflejos') ? 5 : 10;
    if (p.stamina < cost) throw new GameError('Sin aguante para esquivar.');
    const len = Math.hypot(dx, dy);
    if (len < 0.1) throw new GameError('Muévete hacia algún lado para esquivar.');
    dx /= len; dy /= len;
    p.stamina -= cost;
    const g = e.zone.grid;
    let x = e.x, y = e.y;
    const steps = ef.flags.has('salto-reforzado') ? 20 : 13;
    for (let i = 1; i <= steps; i++) { const nx = e.x + dx * 0.2 * i, ny = e.y + dy * 0.2 * i; if (!isWalkable(g, nx, ny)) break; x = nx; y = ny; }
    const fromX = e.x, fromY = e.y;
    e.x = x; e.y = y; e.path = []; e.moving = false; e.pendingAction = undefined; e.zone.moved(e);
    e.dodgeUntil = now + 450; e.dodgeReadyAt = now + 900;
    this.w.cancelActivity(e);
    for (const o of e.zone.query(e.x, e.y, 28)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'fx', kind: 'dodge', from: e.id, to: e.id, x: fromX, y: fromY });
    this.w.send(c, { t: 'sheet', sheet: (this.sv as any).sheetOf(p) });
  }

  /** Empuja a alguien `dist` metros en la dirección del golpe (las paredes lo frenan) y lo aturde `ms`. */
  private shove(from: Entity, target: Entity, dist: number, ms: number) {
    const len = Math.max(0.01, Math.hypot(target.x - from.x, target.y - from.y));
    const ux = (target.x - from.x) / len, uy = (target.y - from.y) / len;
    for (let i = 0; i < Math.round(dist * 4); i++) { const nx = target.x + ux * 0.25, ny = target.y + uy * 0.25; if (!isWalkable(target.zone.grid, nx, ny)) break; target.x = nx; target.y = ny; }
    target.path = []; target.zone.moved(target);
    const tp = this.w.playerOf(target), now = Date.now();
    if (tp) tp.nextAttackAt = Math.max(tp.nextAttackAt, now + ms); else target.stunUntil = Math.max(target.stunUntil ?? 0, now + ms);
  }

  /** v0.9 · Patada: empuja 1,5 m, tumba un instante y rompe la guardia. No letal y no gasta munición. */
  async kick(c: PlayerConn, target: Entity, opId: string) {
    const p = c.p!, e = c.e!;
    const now = Date.now();
    if (now < p.nextAttackAt) return;
    if ((e.stunUntil ?? 0) > now) throw new GameError('Estás aturdido.');
    if (effective(this.c, p).legsLost >= 1) throw new GameError('Sin una pierna no puedes dar patadas.');
    if (p.stamina < 8) throw new GameError('Sin aguante para dar una patada.');
    const tp = this.w.playerOf(target);
    if ((tp && tp.status !== 'alive') || (!tp && target.state === 'downed')) return;
    p.stamina -= 8; p.lastCombatAt = now;
    p.nextAttackAt = now + 900 / (e.timeScale ?? 1);
    (c as any).lastNoise = 2; this.w.stealth.noise(e, 2);
    const ef = effective(this.c, p);
    const a = this.attackScore(p) + 1 + this.roll();
    const d = (tp ? this.defenseScore(tp) : this.npcDefenseScore(target)) + this.roll();
    if (a < d || ((target.dodgeUntil ?? 0) > now && this.rng() < 0.9)) {
      this.fx(e, 'kick', e.id, target.id, { hit: false });
      this.notice(c, 'warn', `${target.name} se aparta de tu patada.`);
      if (tp) this.counter(target, e); else this.provokeNpc(target, e, false);
      return;
    }
    // Empujón: 1,5 m en la dirección de la patada (3 m con la Pierna «Pistón»); las paredes lo frenan.
    const piston = ef.flags.has('patada-piston');
    this.shove(e, target, piston ? 3 : 1.5, 0);
    const dmg = Math.max(2, Math.round((3 + ef.attrs.BODY * 0.8 + this.rng() * 4) * (piston ? 1.5 : 1)));
    if (tp) { tp.nextAttackAt = Math.max(tp.nextAttackAt, now + 1300); this.damagePlayer(tp, target, dmg, false, { name: p.name, charId: p.charId }); if (tp.status === 'downed') await this.onNeutralized(c, target, false, opId); else this.counter(target, e); }
    else { target.stunUntil = Math.max(target.stunUntil ?? 0, now + 1300); this.damageNpc(target, dmg, false, c); if (target.state === 'downed') await this.onNeutralized(c, target, false, opId); }
    target.lastHitBy = e.id; target.lastHitAt = now;
    this.fx(e, 'kick', e.id, target.id, { hit: true });
    this.notice(c, 'good', `Patada a ${target.name}: −${dmg} y lo desequilibras.`);
    this.w.progress.gain(p, 'cuerpo', 3);
    this.crime(c, target, false, tp?.status === 'downed' || target.state === 'downed' ? 'down' : 'hit', this.claimable(target, p).length > 0, 1);
  }

  /** Línea de tiro: solo la tapan edificios y paredes (los muebles dan cobertura, no la cortan). */
  lineClear(a: Entity, b: Entity) {
    const g = a.zone.grid, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3);
    for (let i = 1; i < steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return false;
      if (g.buildingAt[ty * g.w + tx] >= 0) return false;
      if (a.zone.def.kind === 'interior' && (tx === 0 || ty === 0 || tx === g.w - 1 || ty === g.h - 1)) return false;
    }
    return true;
  }
  /** Cobertura del objetivo frente al tirador: total (+6 a su defensa) o parcial (+3). */
  private coverMaps = new WeakMap<object, Map<number, number>>();
  coverOf(shooter: Entity, target: Entity): number {
    const z = target.zone;
    let m = this.coverMaps.get(z.def);
    if (!m) {
      m = new Map();
      for (const pr of z.def.props) { const v = COVER_FULL.has(pr.type) ? 6 : COVER_HALF.has(pr.type) ? 3 : 0; if (v) m.set(pr.at[1] * 4096 + pr.at[0], v); }
      for (const b of z.def.blocks) for (let y = b.rect[1]; y < b.rect[1] + b.rect[3]; y++) for (let x = b.rect[0]; x < b.rect[0] + b.rect[2]; x++) m.set(y * 4096 + x, b.type === 'counter' || b.type === 'barrier' ? 3 : 6);
      this.coverMaps.set(z.def, m);
    }
    const d = Math.hypot(shooter.x - target.x, shooter.y - target.y) || 1;
    let best = 0;
    for (let k = 0.5; k <= 1.7; k += 0.3) {
      const x = target.x + ((shooter.x - target.x) / d) * k, y = target.y + ((shooter.y - target.y) / d) * k;
      best = Math.max(best, m.get(Math.floor(y) * 4096 + Math.floor(x)) ?? 0);
    }
    return best;
  }

  /** Un PNJ que se desangra cae (y morirá si nadie lo atiende). */
  bleedOut(e: Entity) { if (e.state !== 'downed') { this.npcDowned(e, true); this.bump(e); void this.creditBleed(e); } }
  /** Quien le hirió hace menos de un minuto «le ha derribado» (recompensas, reputación y delitos). */
  async creditBleed(e: Entity) {
    if (e.lastHitBy === undefined || Date.now() - (e.lastHitAt ?? 0) > 60000) return;
    const by = this.w.entities.get(e.lastHitBy);
    if (!by?.conn?.p) return;
    try { await this.onNeutralized(by.conn, e, true, `sangre-${randomUUID()}`); } catch (err) { if (!(err instanceof GameError)) console.error('[desangrado]', err); }
  }

  async attack(c: PlayerConn, target: Entity, lethal: boolean, opId: string, opts: { part?: AimZone; aimed?: boolean; style?: 'heavy' } = {}) {
    const p = c.p!, e = c.e!;
    const now = Date.now();
    if (isSick(p.substances, now)) return;
    this.w.nightlife.stop(e);
    if (now < p.nextAttackAt) { e.pendingAction = { target: target.id, action: lethal ? 'attack' : 'knockout', opId: `${opId}r`, part: opts.part }; return; }
    if (effective(this.c, p).armsLost >= 2) throw new GameError('Sin brazos no puedes atacar.');
    if ((e.stunUntil ?? 0) > now) throw new GameError('Estás aturdido.');
    if (e.ghostOf) throw new GameError('Eres una proyección: no puedes tocar nada.');
    if (lethal && this.weaponOf(p).w.nonlethal === 'solo') lethal = false;
    const wp = this.weaponFor(p, lethal);
    const legit = this.claimable(target, p).length > 0;
    // v0.9 · Golpe fuerte (cuerpo a cuerpo) o ráfaga (a distancia): más daño y aturde, pero más lento y menos preciso.
    const heavy = opts.style === 'heavy';
    const rounds = heavy && wp.w.kind === 'ranged' ? Math.max(1, Math.min(3, p.inventory.get(wp.w.ammo ?? '') ?? 3)) : 1;
    if (heavy && wp.w.kind === 'melee') { if (p.stamina < 6) throw new GameError('Sin aguante para un golpe fuerte.'); p.stamina -= 6; }
    if (wp.w.ammo) {
      if ((p.inventory.get(wp.w.ammo) ?? 0) < 1) throw new GameError(`Sin munición: necesitas ${this.c.items.find((i) => i.id === wp.w.ammo)?.name}.`);
      p.inventory.set(wp.w.ammo, (p.inventory.get(wp.w.ammo) ?? 0) - rounds);
      void this.w.db.query('UPDATE inventory_items SET qty = GREATEST(0, qty - $3) WHERE character_id=$1 AND def_id=$2', [p.charId, wp.w.ammo, rounds]).catch(() => {});
    }
    const ef = effective(this.c, p);
    const fast = (p.buffs['tiempo-bala'] ?? 0) > now ? 0.4 : 1;
    p.nextAttackAt = now + (wp.w.cooldown * 1000 * fast * (heavy ? 1.8 : 1) * (wp.w.kind === 'ranged' ? (1 - (ef.perk.rangedCd ?? 0)) * (ef.flags.has('gatillo-neural') ? 0.7 : 1) : 1)) / (e.timeScale ?? 1);
    p.lastCombatAt = now;
    const tp = this.w.playerOf(target);
    if (tp && tp.status !== 'alive') return;
    if (!tp && target.state === 'downed') return;
    const traits = new Set(wp.w.traits ?? []);
    const skill = wp.w.kind === 'melee' ? 'cuerpo' : 'armas';
    // v0.10 · Ruido: cada arma se oye a una distancia (las silenciosas y el cromo integrado, muy poco). Solo lo oye quien está dentro.
    const noiseR = wp.w.kind === 'ranged' ? (8 + (wp.w.noise ?? 0.5) * 32) * (traits.has('silenciosa') ? 0.3 : 1) * (heavy ? 1.2 : 1) : heavy ? 4 : 2.5;
    (c as any).lastNoise = noiseR;
    this.w.stealth.noise(e, noiseR);
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    const smart = traits.has('inteligente') || ef.flags.has('ojo-de-dios');
    const rangePenalty = wp.w.kind === 'ranged' && !smart && dist > wp.w.range / 2 ? Math.round((dist - wp.w.range / 2) / (wp.w.range / 4)) : 0;
    // Apuntar a una zona concreta cuesta precisión (salvo en el disparo apuntado); la cobertura protege de los disparos.
    // v0.7: con el clic derecho mantenido se apunta; tras el tiempo de apuntar y dentro del alcance seguro, el tiro es seguro.
    if (wp.w.kind === 'ranged' && e.guard && e.guardSince && !opts.aimed) {
      const aim = aimOf(this.c, p);
      if ((now - e.guardSince) / 1000 >= aim.time && dist <= aim.range && this.lineClear(e, target)) opts = { ...opts, aimed: true };
    }
    const steady = wp.w.kind === 'ranged' && e.guard && !opts.aimed ? 2 : 0;
    const aimPen = opts.part && !opts.aimed ? AIM[opts.part].penalty : 0;
    const cover = wp.w.kind === 'ranged' ? this.coverOf(e, target) * (opts.aimed ? 0.5 : 1) : 0;
    const tremor = (p.psyche?.level ?? 0) >= 70 ? 4 : (p.psyche?.level ?? 0) >= 45 ? 2 : 0;
    let a = this.attackScore(p) + (wp.w.kind === 'ranged' ? ef.aimBonus : 0) + ((p.buffs.marcar ?? 0) > now ? 2 : 0) - (heavy ? (wp.w.kind === 'ranged' ? 2 : 1) : 0) - rangePenalty - aimPen - ef.armsLost * 3 - ef.brokenArms * 2 - tremor + ef.matrix.aim + steady + this.roll() + (lethal ? 0 : ef.perk.koBonus ?? 0);
    // Bloqueo: quien se defiende con un arma cuerpo a cuerpo para mejor los golpes (no las balas).
    const blocking = !heavy && !!(tp && target.guard && wp.w.kind === 'melee' && this.weaponOf(tp).w.kind === 'melee'); // el golpe fuerte rompe la guardia
    const d = (tp ? this.defenseScore(tp) : this.npcDefenseScore(target)) + cover + (blocking ? 3 : 0) + this.roll();
    if (ef.flags.has('ojo-de-dios') && wp.w.kind === 'ranged' && dist <= wp.w.range) a = Math.max(a, d);
    const substances = substanceEffects(this.c, p.substances, now);
    if (opts.aimed) a = substances.aim >= 0 ? Math.max(a, d + 1) : a + Math.max(0, 5 + substances.aim);
    // v0.9 · Ojo «Absoluto»: el 90 % de los disparos acierta aunque estés fuera del alcance seguro.
    else if (wp.w.kind === 'ranged' && ef.flags.has('ojo-absoluto') && dist <= wp.w.range * 1.5 && this.rng() < 0.9) a = Math.max(a, d + 1);
    const part = hitPart(() => this.rng(), opts.part);
    if (tp?.sleeping && target.conn) this.sv.wake(target.conn);
    const silent = traits.has('silenciosa') ? 0.5 : 1;
    const rolling = (target.dodgeUntil ?? 0) > now; // v0.9 · rodando: esquiva casi todo
    // v0.9 · Brazo «Desviador»: en guardia con un arma blanca, desvía el 60 % de las balas.
    if (tp && wp.w.kind === 'ranged' && target.guard && this.weaponOf(tp).w.kind === 'melee' && effective(this.c, tp).flags.has('desvio-balas') && this.rng() < 0.6) {
      this.fx(e, 'shot', e.id, target.id, { weapon: wp.id, hit: false });
      this.notice(c, 'warn', `${target.name} desvía tu bala con su hoja.`); this.notice(target.conn, 'good', `Desvías la bala de ${p.name}.`);
      this.counter(target, e); this.crime(c, target, lethal, 'attempt', legit, silent);
      return;
    }
    const dodged = (rolling && this.rng() < (wp.w.kind === 'melee' ? 0.95 : 0.7)) || (tp && a >= d && this.rng() < this.dodgeOf(tp));
    if (a < d || dodged) {
      this.fx(e, wp.w.kind === 'ranged' ? 'shot' : heavy ? 'heavy' : 'hit', e.id, target.id, { weapon: wp.id, hit: false, burst: heavy ? rounds : undefined });
      this.notice(c, 'warn', dodged ? `${target.name} esquiva tu ataque.` : `Fallas (${a} contra ${d}${cover ? `, se cubre tras el decorado: +${cover}` : ''}).`);
      if (dodged) this.notice(target.conn, 'good', `Esquivas el ataque de ${p.name}.`);
      if (tp) this.counter(target, e); else this.provokeNpc(target, e, lethal);
      this.crime(c, target, lethal, 'attempt', legit, silent);
      this.w.progress.gain(p, skill, 1);
      return;
    }
    let dmg = this.rollDamage(wp.w, a - d) + (wp.w.kind === 'melee' ? substances.melee : 0);
    dmg *= 1 + (wp.w.kind === 'melee' ? ef.meleeDmg : (ef.perk.rangedDmg ?? 0) + ef.matrix.rangedDmg) + (wp.w.kind === 'ranged' && dist < 3 ? ef.perk.closeDmg ?? 0 : 0) + (!lethal && ef.perk.koBonus ? 0.2 : 0);
    if (ef.flags.has('corazon-cromo') && Object.values(p.buffs).some((u) => u > now)) dmg *= 1.25;
    const chromed = tp ? chromeParts(this.c, tp).length > 0 : (target.chrome?.length ?? 0) > 0;
    if (traits.has('emp') && chromed) dmg *= 1.5;
    if (traits.has('emp')) this.w.relics.emp(target.zone.id, target.x, target.y, 3);
    if (wp.w.kind === 'ranged' && (p.buffs['disparo-cargado'] ?? 0) > now) { dmg *= 2; delete p.buffs['disparo-cargado']; this.notice(c, 'good', 'Disparo cargado.'); }
    const crit = this.rng() < (ef.perk.crit ?? 0) + ef.crit + (opts.aimed ? 0.15 : 0);
    if (crit) dmg *= 2;
    if (heavy) dmg *= wp.w.kind === 'ranged' ? 0.8 * rounds : 1.8;
    // v0.9 · Córtex «Ejecutor»: doble daño a quien está por debajo del 30 % de salud.
    if (ef.flags.has('ejecutor') && (tp ? tp.hp < effective(this.c, tp).hpMax * 0.3 : (target.npcHp ?? 1) < (target.npcMax ?? 1) * 0.3)) dmg *= 2;
    dmg = Math.round(dmg);
    if (tp && !traits.has('perforante')) dmg = Math.max(1, dmg - this.armorOf(tp) - (wp.w.tech === 'tecnica' ? -this.armorOf(tp) : 0));
    if (blocking) { dmg = Math.max(1, Math.round(dmg * 0.35)); if (target.conn) this.notice(target.conn, 'good', `Bloqueas el golpe de ${p.name}.`); }
    if (tp) {
      const tf = effective(this.c, tp).flags;
      // v0.9 · Blindaje reactivo: el primer golpe cada 8 s pierde un 80 %.
      if (tf.has('blindaje-reactivo') && now - ((tp as any).reactiveAt ?? 0) > 8000) { (tp as any).reactiveAt = now; dmg = Math.max(1, Math.round(dmg * 0.2)); this.notice(target.conn, 'good', 'Tu blindaje reactivo se endurece y absorbe el impacto.'); }
      // v0.9 · Piel «Espejo»: devuelve un 25 % del daño cuerpo a cuerpo.
      if (tf.has('piel-espejo') && wp.w.kind === 'melee') { const back = Math.max(1, Math.round(dmg * 0.25)); this.damagePlayer(p, e, back, false, { name: `la piel espejo de ${tp.name}`, charId: tp.charId }); }
    }
    // Herida en la zona alcanzada: sangrado, amputación o conmoción.
    const wnd = this.wounds.hit(target, tp, part, dmg, wp, lethal);
    dmg = wnd.dmg;
    target.lastHitBy = e.id; target.lastHitAt = now;
    // Un tiro o golpe en la mano puede hacer soltar el arma.
    if (wnd.part.startsWith('mano') && !wnd.severed && this.rng() < 0.4) {
      if (tp && tp.equipped) { tp.equipped = null; if (target.conn) { this.notice(target.conn, 'bad', 'Te han dado en la mano: se te cae el arma (vuelve a empuñarla desde el inventario).'); this.w.send(target.conn, { t: 'sheet', sheet: (this.sv as any).sheetOf(tp) }); } }
      else if (!tp && target.weaponId) { target.weaponId = undefined; target.labelVer++; this.notice(c, 'good', `${target.name} suelta el arma.`); }
    }
    this.fx(e, wp.w.kind === 'ranged' ? 'shot' : heavy ? 'heavy' : 'hit', e.id, target.id, { weapon: wp.id, hit: true, part: wnd.part, sever: !!wnd.severed, crit, burst: heavy ? rounds : undefined });
    if (heavy) { const ms = wp.w.kind === 'melee' ? 1100 : 500; if (tp) tp.nextAttackAt = Math.max(tp.nextAttackAt, now + ms); else target.stunUntil = Math.max(target.stunUntil ?? 0, now + ms); }
    this.notice(c, 'good', `${crit ? '¡CRÍTICO! ' : ''}${opts.aimed ? 'Disparo apuntado: ' : ''}${lethal ? 'Impactas' : 'Golpeas'} a ${target.name} en ${PART_NAMES[wnd.part]} con ${wp.name}: −${dmg}.${wnd.severed ? ` ¡Le arrancas ${PART_NAMES[wnd.severed]}!` : ''}${wnd.ko ? ' Cae conmocionado/a.' : ''}`);
    if (tp && target.conn && (wnd.severed || wnd.part === 'cabeza')) this.notice(target.conn, 'bad', wnd.severed ? `¡Has perdido ${PART_NAMES[wnd.severed]}! Un matasanos puede implantarte una prótesis.` : 'Te han dado en la cabeza.');
    this.w.progress.gain(p, skill, 4);
    if (wp.w.kind === 'melee') {
      // v0.9 · Mano «Vampiro»: recupera el 20 % del daño; Brazo «Sísmico»: empuja y aturde; Guante de choque: aturde.
      if (ef.flags.has('vampiro')) { p.hp = Math.min(ef.hpMax, p.hp + Math.max(1, Math.round(dmg * 0.2))); }
      if (ef.flags.has('puno-sismico')) this.shove(e, target, 1, 600);
      if (ef.flags.has('puno-electrico') && !(tp && effective(this.c, tp).flags.has('aislante'))) { if (tp) tp.nextAttackAt = Math.max(tp.nextAttackAt, now + 500); else target.stunUntil = Math.max(target.stunUntil ?? 0, now + 500); }
    }
    this.applyTraits(traits, target, tp, dmg, p.name, e.id);
    if (tp) {
      if (wnd.ko && tp.status === 'alive') { tp.hp -= dmg; this.sv.downed(target.conn, `conmoción (golpe de ${p.name} en la cabeza)`, tp, target, false); }
      else this.damagePlayer(tp, target, dmg, lethal, { name: p.name, charId: p.charId });
      if (tp.status === 'downed') await this.onNeutralized(c, target, tp.downedLethal, opId);
      else this.counter(target, e);
    } else {
      this.damageNpc(target, dmg, lethal && !wnd.ko, c);
      if (wnd.ko && target.state !== 'downed') this.npcDowned(target, false);
      if (target.state === 'downed') await this.onNeutralized(c, target, !!target.npcLethalDown, opId);
    }
    this.crime(c, target, lethal, target.state === 'downed' || tp?.status === 'downed' ? 'down' : 'hit', legit, silent);
    // Daño en área (rasgo «área») y «Danza de cuchillas»: alcanza a otros enemigos cercanos.
    const splash = traits.has('area') ? { at: target, r: 1.8, f: 0.5 } : wp.w.kind === 'melee' && ef.flags.has('danza') ? { at: e, r: 2.2, f: 0.7 } : null;
    if (splash) for (const o of [...splash.at.zone.query(splash.at.x, splash.at.y, splash.r)]) {
      if (o === target || o === e || o.kind !== 'npc' || o.state === 'downed' || !o.npcMax || o.npcType === 'essential') continue;
      const sd = Math.max(1, Math.round(dmg * splash.f));
      this.applyTraits(traits, o, undefined, sd, p.name, e.id);
      this.damageNpc(o, sd, lethal, c);
      if ((o.state as string) === 'downed') await this.onNeutralized(c, o, !!o.npcLethalDown, `${opId}-${o.id}`);
    }
  }

  /** Efectos de los rasgos de arma sobre el objetivo: quemaduras, sangrado, aturdimiento y PEM. */
  private applyTraits(traits: Set<string>, target: Entity, tp: PlayerState | undefined, dmg: number, by: string, byId: number) {
    const now = Date.now();
    const tfl = tp ? effective(this.c, tp).flags : undefined;
    if (tfl?.has('ignifugo')) traits = new Set([...traits].filter((t) => t !== 'quemadura'));
    if (tfl?.has('aislante')) traits = new Set([...traits].filter((t) => t !== 'aturdidora' && t !== 'electrica' && t !== 'emp'));
    if (traits.has('quemadura') || traits.has('sangrado')) {
      (target.dots ??= []).push({ until: now + 3000, dmg: Math.max(1, Math.round(dmg * (traits.has('quemadura') ? 0.2 : 0.15))), next: now + 1000, by: byId });
      if (target.conn) this.notice(target.conn, 'bad', traits.has('quemadura') ? 'Estás ardiendo.' : 'Sangras.');
    }
    if (traits.has('aturdidora') || traits.has('electrica') || traits.has('emp')) {
      const ms = traits.has('aturdidora') ? 2000 : 1200;
      if (tp) tp.nextAttackAt = Math.max(tp.nextAttackAt, now + ms); else target.stunUntil = now + ms;
      void by;
    }
  }

  /** Respuesta del jugador atacado según su postura: Defender/Agresiva devuelve el golpe; Evitar se retira.
   *  v0.20 · Solo en modo automático: si no, el control es siempre del jugador (antes, con «Evitar», al recibir un
   *  disparo el personaje salía corriendo solo hacia el refugio más cercano y no te dejaba moverte). */
  private counter(victim: Entity, attacker: Entity) {
    const vc = victim.conn, vp = vc?.p;
    if (!vc || !vp || vp.status !== 'alive' || isSick(vp.substances) || !vp.auto.on) return;
    this.w.nightlife.stop(victim);
    if (vp.stance === 'avoid') { if (!victim.path.length) this.w.handle(vc, { t: 'retreat', seq: 0 } as any); return; }
    if (!victim.pendingAction && !victim.task) victim.pendingAction = { target: attacker.id, action: vp.stance === 'aggressive' ? 'attack' : 'knockout', opId: `counter-${randomUUID()}` };
  }

  damagePlayer(tp: PlayerState, te: Entity, dmg: number, lethal: boolean, src: Src) {
    if ((tp as any).god) return;
    // La proyección de Eco se corta si alguien hiere el cuerpo.
    if (te.ghostOwner) this.w.relics.endGhost(te.ghostOwner, false);
    this.w.nightlife.stop(te);
    // v0.9 · Escudo cinético: absorbe daño mientras dura.
    if ((tp.buffs.escudo ?? 0) > Date.now() && (tp.shield ?? 0) > 0) { const ab = Math.min(tp.shield!, dmg); tp.shield! -= ab; dmg -= ab; if (dmg <= 0) { this.notice(te.conn, 'good', `Tu escudo absorbe el golpe de ${src.name}.`); return; } }
    tp.hp -= dmg; tp.lastCombatAt = Date.now();
    this.notice(te.conn, 'bad', `${src.name} te ${lethal ? 'hiere' : 'golpea'}: −${dmg} de salud.`);
    if (te.conn) this.w.send(te.conn, { t: 'sheet', sheet: (this.sv as any).sheetOf(tp) });
    if (tp.hp <= 0) {
      if (src.police && !lethal && te.conn) { void this.arrest(te.conn); return; }
      this.sv.downed(te.conn, `${lethal ? 'disparos o heridas' : 'golpes'} de ${src.name}`, tp, te, lethal);
    }
  }

  damageNpc(target: Entity, dmg: number, lethal: boolean, by?: PlayerConn) {
    target.npcHp = (target.npcHp ?? target.npcMax ?? 40) - dmg;
    target.lastAttacker = by?.e?.id;
    this.bump(target);
    if (by?.e) this.provokeNpc(target, by.e, lethal);
    if ((target.npcHp ?? 0) <= 0) this.npcDowned(target, lethal);
  }

  private provokeNpc(target: Entity, attacker: Entity, lethal: boolean) {
    if (target.state === 'downed') return;
    if (target.npcType === 'civil' || !target.npcType) { this.w.threats.react(target, attacker); return; }
    target.aggro = attacker.id; target.aggroLethal = target.npcType !== 'police' || lethal;
    // Los suyos acuden.
    for (const o of target.zone.query(target.x, target.y, 12)) if (o !== target && o.faction === target.faction && o.npcType === target.npcType && o.state !== 'downed' && !o.aggro) { o.aggro = attacker.id; o.aggroLethal = target.aggroLethal; }
  }

  /** Deja KO a un PNJ (sin matarlo). */
  knockOut(target: Entity, _by?: PlayerConn) { if (target.state !== 'downed') { this.npcDowned(target, false); this.bump(target); } }
  private npcDowned(target: Entity, lethal: boolean) {
    target.state = 'downed'; target.npcLethalDown = lethal; target.path = []; target.moving = false; target.aggro = undefined;
    target.downedUntil = Date.now() + (lethal ? 20000 : 60000);
    target.label = lethal ? 'Desangrándose' : 'Inconsciente';
    this.bump(target);
  }

  private async onNeutralized(c: PlayerConn, target: Entity, lethal: boolean, opId: string) {
    const p = c.p!;
    const tpl = this.w.playerOf(target);
    this.w.progress.playerXp(p, tpl ? tpl.level * 6 : (target.level ?? 3) * (target.npcType === 'civil' ? 1 : 4));
    this.w.progress.gain(p, lethal ? 'armas' : 'intimidacion', 3);
    const pf = perkMods(this.c, p).flags;
    if (pf.has('frenesi')) { const ef = effective(this.c, p); p.hp = Math.min(ef.hpMax, p.hp + 10); p.nextAttackAt = 0; this.notice(c, 'good', 'Frenesí: +10 de salud y siguiente ataque inmediato.'); }
    const all = this.claimable(target, p);
    const pay = all.filter((b) => !lethal || !b.aliveOnly);
    if (!tpl) void this.w.legends.event(c, { type: 'kill', faction: target.faction, npcType: target.npcType }).catch(() => {});
    if (pay.length) {
      const mods = this.c.professions.find((x) => x.id === p.profession)?.mods;
      const paid = await this.sv.bounties.claim(p, pay, mods?.bounty ?? 0, opId);
      if (paid) void this.w.legends.event(c, { type: 'bounty', amount: paid }).catch(() => {});
      if (paid) this.w.send(c, { t: 'reward', title: `Recompensa cobrada: ${target.name}`, lines: [`+${paid} €$`, ...pay.map((b) => `${b.poster === 'particular' ? 'Particular' : b.poster.toUpperCase()}: ${b.reason}`)] });
      this.sv.updateMarker(target);
      if (target.fugitive) {
        try { const out = await this.w.effects.apply(p, [{ rep: 'pcv', delta: 3 }, { rep: 'calle', delta: 2 }, { xp: 40 }], { opId: `${opId}:rep`, kind: 'capture' }); this.w.handleOutcome(c, out); } catch {}
        if (!lethal) { this.w.removeEntity(target); this.sv.scheduleFugitive(target.fugitive.id); this.notice(c, 'good', `La PCV se lleva a ${target.name} esposado.`); }
      }
    }
    if (lethal && all.some((b) => b.aliveOnly)) this.notice(c, 'warn', `Ojo: a ${target.name} lo quieren VIVO. Si muere, no cobrarás esa recompensa.`);
    // Reputación con su facción y sus aliados.
    if (target.faction && target.npcType !== 'civil') await this.repChange(c, target.faction, lethal ? -12 : -6, `${opId}:fac`);
  }

  async finish(c: PlayerConn, target: Entity, opId: string) {
    const p = c.p!;
    const tp = this.w.playerOf(target);
    if (tp) {
      if (tp.status !== 'downed') throw new GameError('No está derribado.');
      const all = this.claimable(target, p);
      const pay = all.filter((b) => !b.aliveOnly);
      if (pay.length) { const paid = await this.sv.bounties.claim(p, pay, 0, opId); if (paid) this.w.send(c, { t: 'reward', title: `Recompensa cobrada: ${tp.name}`, lines: [`+${paid} €$`] }); }
      await this.sv.addWanted(c, all.length ? (all.some((b) => b.aliveOnly) ? 1.5 : 0) : 3, 'asesinato');
      await this.sv.die(tp, target, 'rematado', p);
      return;
    }
    if (target.state !== 'downed') throw new GameError('No está derribado.');
    if (target.dead) throw new GameError('Ya está muerto.');
    target.npcLethalDown = true; target.downedUntil = 0;
    this.npcDeath(target, c);
    if (target.faction && target.npcType !== 'civil') await this.repChange(c, target.faction, -15, `${opId}:fac`);
    this.crime(c, target, true, 'kill');
  }

  private npcDeath(target: Entity, by?: PlayerConn) {
    for (const o of target.zone.query(target.x, target.y, 20)) if (o.kind === 'player' && o.conn) this.notice(o.conn, 'bad', `${target.name} ha muerto.`);
    if (target.fugitive) {
      const p = by?.p;
      const alive = this.sv.bounties.onNpc(target.fugitive.id).filter((b) => b.aliveOnly);
      if (alive.length) { void this.sv.bounties.cancel(alive.map((b) => b.id)); if (by && p) void this.sv.addWanted(by, 1, 'matar a un fugitivo que querían vivo'); }
      this.sv.scheduleFugitive(target.fugitive.id);
    } else if (target.respawn) this.respawnQueue.push({ at: Date.now() + 120000, zone: target.respawn.zone, template: target.respawn.template });
    // v0.6: el cadáver se queda un rato (se puede registrar) y luego se lo llevan.
    target.dead = true; target.state = 'downed'; target.npc = undefined; target.aggro = undefined; target.path = []; target.moving = false;
    target.label = 'Cadáver'; target.respawn = undefined; target.fugitive = undefined; target.npcType = target.npcType === 'essential' ? 'civil' : target.npcType;
    if (target.body) target.body.bleed = 0;
    this.w.corpses.onDeath(target, by);
    this.bump(target);
  }

  /** Consecuencias legales: solo cuenta donde la PCV patrulla. Cobrar recompensas no es delito. */
  private crime(c: PlayerConn, target: Entity, lethal: boolean, kind: 'attempt' | 'hit' | 'down' | 'kill', legit?: boolean, factor = 1) {
    const p = c.p!;
    if (target.npcType === 'psycho' || (target.predator && target.aggro !== undefined)) return;
    if ((legit ?? this.claimable(target, p).length > 0) && kind !== 'kill') return;
    // v0.10 · Solo cuenta si alguien lo VE o lo OYE (o lo graba una cámara). En sigilo, nadie se entera.
    const wit = this.w.stealth.witnesses(c.e!, (c as any).lastNoise ?? 2.5, kind === 'kill' || kind === 'down' || target.state === 'downed' || target.dead ? target : undefined);
    const camera = this.cameraSees(c.e!);
    if (kind !== 'attempt' || lethal) this.w.threats.violence(c.e!, target, wit.civs);
    if (wit.seen.length) this.w.stealth.remember(c, wit.seen, kind === 'kill' ? 'asesinato' : 'agresión');
    // v0.6: zona negra, sin ley; zona roja, solo si hay agentes cerca; zona amarilla, vigilada (cámaras y patrullas).
    const lvl = dangerAt(c.e!.zone.grid, c.e!.x, c.e!.y);
    if (lvl === 'lawless') return;
    const cops = wit.cops.length > 0;
    if (!wit.any && !camera) { if (kind === 'kill' || kind === 'down') this.notice(c, 'good', '🤫 Nadie te ha visto ni oído.'); return; }
    if (lvl === 'disputed' && !cops) return;
    const police = lvl === 'public' ? 1 : this.policeAt(c.e!);
    if (!police) return;
    if ((kind === 'kill' || (kind === 'down' && lethal)) && this.cameraSees(c.e!) && !((p.buffs.invisible ?? 0) > Date.now()) && !effective(this.c, p).matrix.cameraGhost && !(effective(this.c, p).flags.has('anticamaras') && this.rng() < 0.5)) void this.identify(c, kind === 'kill' ? 'asesinato' : 'intento de asesinato');
    const flags = perkMods(this.c, p).flags;
    if (flags.has('fantasma') && ![...c.e!.zone.query(c.e!.x, c.e!.y, 18)].some((o) => o.npcType === 'police' || o.npcType === 'hierro')) return;
    if ((p.buffs.invisible ?? 0) > Date.now()) return;
    const base = kind === 'kill' ? 2.5 : kind === 'down' ? (lethal ? 1.5 : 1) : kind === 'hit' ? 0.6 : 0.3;
    const cop = target.npcType === 'police' || target.npcType === 'hierro' ? 1.5 : 1;
    void this.sv.addWanted(c, base * cop * factor, target.npcType === 'police' ? 'agresión a la PCV' : lethal ? 'agresión armada' : 'agresión');
    // Los agentes cercanos responden.
    for (const o of wit.cops) if (o.state !== 'downed' && !o.aggro && p.wanted >= 1.5) { o.aggro = c.e!.id; o.aggroLethal = o.npcType === 'hierro'; }
  }

  /** ¿Te ve alguna cámara (encendida y con línea de visión) en un radio de 11 m? */
  cameraSees(e: Entity) {
    const now = Date.now();
    return [...e.zone.query(e.x, e.y, 11)].some((o) => o.objKind === 'camera' && (o.disabledUntil ?? 0) < now && this.lineClear(o, e));
  }
  /** Identificado por las cámaras: antecedentes públicos, aviso a toda la ciudad y la policía a por ti. */
  async identify(c: PlayerConn, crime: string) {
    const p = c.p!, e = c.e!;
    const district = this.w.property.dname(this.w.districtOf(e.zone, e.x, e.y));
    p.identified = { crime, district, at: Date.now() };
    await this.w.db.query('INSERT INTO public_records (id, character_id, crime, district) VALUES ($1,$2,$3,$4)', [uuid(), p.charId, crime, district]).catch(() => {});
    await this.sv.addWanted(c, crime === 'asesinato' ? 2 : 1, `identificado por cámaras: ${crime}`);
    for (const o of this.w.conns.values()) this.notice(o, o === c ? 'bad' : 'warn', o === c ? `📷 Una cámara te ha grabado (${crime}). Tu identidad es pública: la PCV y cualquiera pueden ir a por ti.` : `📷 Cámaras de ${district}: ${p.name} identificado/a por ${crime}. Búscalo/a en el ordenador o pon precio a su cabeza.`);
    this.sv.updateMarker(e);
  }

  private async rob(c: PlayerConn, target: Entity, opId: string) {
    const p = c.p!;
    const tp = this.w.playerOf(target);
    const ef = effective(this.c, p);
    const blind = ((tp ? tp.blindUntil : target.blindUntil ?? 0) > Date.now()) ? 4 : 0;
    const total = ef.attrs.DEX + (ef.skills.sigilo ?? 0) + ef.steal + blind + this.roll() + ((p.buffs.invisible ?? 0) > Date.now() ? 6 : 0);
    const loot = 1 + (ef.perk.robLoot ?? 0);
    const shadow = ef.flags.has('sombra');
    this.w.progress.gain(p, 'sigilo', 3);
    if (tp) {
      const dv = 8 + (effective(this.c, tp).skills.percepcion ?? 0) + Math.floor(effective(this.c, tp).attrs.INT / 2) - (tp.sleeping ? 6 : 0);
      if (total >= dv) {
        const hidden = effective(this.c, tp).flags.has('compartimento') ? 0.5 : 1;
        const amount = Math.min(tp.money, Math.max(tp.money > 0 ? 1 : 0, Math.floor(tp.money * (0.1 + this.rng() * 0.2) * loot * hidden)));
        await this.transfer(tp, p, amount, opId, `Robo de ${p.name}`, `Robo a ${tp.name}`);
        this.notice(c, 'good', `Robas ${amount} €$ a ${tp.name} sin que se dé cuenta.`);
        this.notice(target.conn, 'bad', tp.sleeping ? `Al despertar notarás que te faltan ${amount} €$.` : `Notas que te falta dinero: −${amount} €$.`);
        await this.sv.addWanted(c, 0.5, 'robo');
      } else if (shadow) { this.notice(c, 'warn', 'No lo consigues, pero nadie se ha dado cuenta.'); }
      else {
        if (tp.sleeping && target.conn) this.sv.wake(target.conn);
        this.notice(target.conn, 'warn', `${p.name} ha intentado robarte.`);
        this.notice(c, 'bad', `${tp.name} te pilla con la mano en su bolsillo.`);
        await this.sv.addWanted(c, 1, 'intento de robo');
      }
      return;
    }
    const dv = 8 + Math.floor((target.defense ?? 10) / 2);
    if (total >= dv) {
      const amount = Math.floor(((target.npcType === 'gang' ? 30 : 8) + this.rng() * (target.npcType === 'gang' ? 120 : 60)) * loot);
      await this.credit(p, amount, opId, `Carterista: ${target.name}`);
      this.notice(c, 'good', `Le quitas ${amount} €$ a ${target.name}.`);
      if (target.faction && target.npcType !== 'civil') await this.repChange(c, target.faction, -2, `${opId}:fac`);
    } else if (shadow) { this.notice(c, 'warn', 'No lo consigues, pero nadie se ha dado cuenta.'); }
    else {
      this.notice(c, 'bad', `${target.name} te pilla.`);
      this.provokeNpc(target, c.e!, false);
      if (target.npcType === 'civil') await this.sv.addWanted(c, this.policeAt(c.e!) ? 0.8 : 0, 'intento de robo');
    }
  }

  private async transfer(from: PlayerState, to: PlayerState, amount: number, opId: string, rFrom: string, rTo: string) {
    if (amount <= 0) return;
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:v`, from.charId, -amount, from.money - amount, rFrom]);
      await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [from.charId, amount]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:a`, to.charId, amount, to.money + amount, rTo]);
      await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [to.charId, amount]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, to.charId, 'transfer', JSON.stringify({ amount })]);
    });
    from.money -= amount; to.money += amount;
  }
  private async credit(p: PlayerState, amount: number, opId: string, reason: string) {
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:c`, p.charId, amount, p.money + amount, reason]);
      await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [p.charId, amount]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'credit', JSON.stringify({ amount })]);
    });
    p.money += amount;
  }

  private talk(c: PlayerConn, target: Entity) {
    if (target.kind === 'npc' && (target.npcType === 'essential' || (!target.npcType && target.dialog))) { this.w.handle(c, { t: 'interact', seq: 0, target: target.id } as any); return; }
    const p = c.p!;
    let line = CIVIL_LINES[Math.floor(this.rng() * CIVIL_LINES.length)];
    const f = target.faction ? this.c.factions.find((x) => x.id === target.faction) : undefined;
    if (target.npcType === 'police') line = p.wanted >= 1 ? '¡Alto ahí! Tu cara me suena… aunque con una «tasa» se me olvida.' : 'Circule. Y no se meta en líos.';
    else if (target.npcType === 'hierro') line = 'Unidad Hierro. Apártese.';
    else if (f && target.npcType === 'gang') { const r = p.rep.get(f.id) ?? 0; line = r >= 30 ? `Eres de los nuestros. ${f.name} cuida de los suyos.` : r <= f.hostileBelow ? `Te tenemos fichado. Lárgate de nuestro territorio.` : `Esto es territorio de ${f.name}. Pórtate bien y no habrá problemas.`; }
    else if (target.fugitive) line = 'No me has visto. ¿Entendido?';
    else if (target.npcType === 'ambar') line = 'Rescate Ámbar. Solo atendemos a suscriptores.';
    // Rumores: la gente de la calle sabe dónde operan los matasanos que no se anuncian.
    if ((target.npcType === 'civil' || target.npcType === 'gang') && this.rng() < 0.3) {
      const docs = this.c.ripperdocs.filter((d) => d.hidden && !p.flags.has(`descubierto:${d.id}`));
      if (docs.length) { const d = docs[Math.floor(this.rng() * docs.length)]; line = `Te cuento un secreto: ${d.rumor}`; this.discover(c, d.id); }
    } else if ((target.npcType === 'civil' || target.npcType === 'gang') && this.rng() < 0.3) {
      // Soplos: dónde se esconde algún fugitivo (sirve para marcarlo como objetivo).
      const r = this.rng() < 0.35 ? this.w.legends.rumor(p) : this.w.intel.rumor(p); if (r) { line = r; this.w.progress.gain(p, 'investigacion', 2); }
    }
    this.w.progress.gain(p, 'actuacion', 1);
    for (const o of target.zone.query(target.x, target.y, 20)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'speech', id: target.id, text: line });
  }

  // ================================================================ cargar cuerpos y peso
  async carry(c: PlayerConn, target: Entity) {
    const p = c.p!, e = c.e!;
    const tp = this.w.playerOf(target);
    const down = tp ? tp.status === 'downed' : target.state === 'downed';
    if (!down) throw new GameError('Solo puedes cargar a alguien inconsciente o herido.');
    if (p.carrying) throw new GameError('Ya llevas a alguien.');
    if (target.carriedBy) throw new GameError('Otra persona ya lo lleva.');
    p.carrying = target.id; target.carriedBy = e.id; this.bump(target);
    const ef = effective(this.c, p);
    const load = ef.weight + 70;
    this.notice(c, load > ef.carryMax ? 'warn' : 'info', `Cargas a ${target.name} (+70 kg). Carga total ${Math.round(load)}/${ef.carryMax} kg${load > ef.carryMax * 1.5 ? ': sobrecargado, irás muy lento y torpe' : load > ef.carryMax ? ': cargado, irás más lento' : ''}.`);
  }
  drop(c: PlayerConn) {
    const p = c.p!;
    if (!p.carrying) throw new GameError('No llevas a nadie.');
    const t = this.w.entities.get(p.carrying);
    if (t) { t.carriedBy = undefined; this.bump(t); }
    p.carrying = null;
    this.notice(c, 'info', 'Sueltas el cuerpo.');
  }
  /** Cada tick: los cuerpos cargados siguen a su portador. */
  everyTick() {
    for (const conn of this.w.conns.values()) {
      const p = conn.p, e = conn.e;
      if (!p?.carrying || !e) continue;
      const t = this.w.entities.get(p.carrying);
      if (!t || (this.w.playerOf(t)?.status ?? (t.state === 'downed' ? 'downed' : 'alive')) !== 'downed') { if (t) { t.carriedBy = undefined; this.bump(t); } p.carrying = null; continue; }
      if (t.zone !== e.zone) this.w.moveEntityTo(t, e.zone, e.x, e.y);
      t.x = e.x + 0.3; t.y = e.y + 0.3; t.lastMoveTick = this.w.tick; t.zone.moved(t);
      const tp = this.w.playerOf(t); if (tp) { tp.x = t.x; tp.y = t.y; tp.zone = t.zone.id; }
    }
  }
  /** Factor de velocidad por carga (inventario + cuerpo). */
  speedFactor(p: PlayerState) {
    const ef = effective(this.c, p);
    const load = ef.weight + (p.carrying ? 70 : 0);
    return load > ef.carryMax * 1.5 ? 0.5 : load > ef.carryMax ? 0.75 : 1;
  }

  // ================================================================ red: quickhacks
  async hack(c: PlayerConn, m: Extract<ClientMsg, { t: 'hack' }>) {
    const p = c.p!, e = c.e!;
    const q = this.c.quickhacks.find((x) => x.id === m.hack);
    const target = this.w.entities.get(m.target);
    if (!q || !target || target.zone !== e.zone) throw new GameError('Objetivo no válido.');
    const ef = effective(this.c, p);
    if (ef.ram <= 0) throw new GameError('Necesitas un cyberdeck (o ser Netrunner con interfaz) para hackear.');
    if (p.netRank < q.minRank) throw new GameError(`Requiere rango de red ${q.minRank}.`);
    if (skillLevel(p, 'interfaz') < q.minSkill) throw new GameError(`Requiere Interfaz ${q.minSkill}.`);
    const cost = this.ramCost(p, q.ram, q.effect);
    if (p.ram < cost) throw new GameError('RAM insuficiente: espera a que se recargue.');
    if (Math.hypot(target.x - e.x, target.y - e.y) > q.range) throw new GameError('Fuera de alcance de tu deck.');
    if (target.npcType === 'essential' && q.effect !== 'scan' && q.effect !== 'deepscan') throw new GameError('Esta persona no se puede atacar.');
    { const tpH = this.w.playerOf(target); if (tpH && effective(this.c, tpH).matrix.hackImmune) throw new GameError(`La mente de ${target.name} es un muro rojo. Algo dentro se ríe de ti.`); }
    if (e.ghostOf) throw new GameError('Eres una proyección: no puedes hackear.');
    if (['damage', 'knockout', 'kill', 'drain'].includes(q.effect) && dangerAt(e.zone.grid, e.x, e.y) === 'protected') throw new GameError('Zona protegida.');
    if (q.effect === 'cash' && target.objKind === 'atm' && (this.atmCooldown.get(target.name + target.id) ?? 0) > Date.now()) throw new GameError('Este cajero está vacío: se recarga en unas horas.');
    if (p.sleeping) this.sv.wake(c);
    p.ram -= cost;
    const secs = this.uploadTime(p, q.upload);
    this.w.cancelActivity(e);
    const tc = target.conn;
    if (tc && q.effect !== 'scan' && q.effect !== 'deepscan') this.notice(tc, 'bad', `¡Intrusión en tu cromo! Alguien está subiendo «${q.name}». Aléjate o rómpele la línea de visión.`);
    this.fx(e, 'hack', e.id, target.id);
    e.channel = { startTick: this.w.tick, endTick: this.w.tick + Math.round(secs * 20), label: `Subiendo ${q.name}`, targetId: target.id, apply: () => this.w.enqueue(c, async () => {
      try { await this.resolveHack(c, target, q.id, m.opId); } catch (err) { if (err instanceof GameError) this.notice(c, 'warn', err.message); else throw err; }
      this.w.send(c, { t: 'action', text: '' });
    }) };
    this.w.send(c, { t: 'action', text: `Subiendo ${q.name} a ${target.name}`, duration: secs });
  }

  private async resolveHack(c: PlayerConn, target: Entity, hackId: string, opId: string) {
    const p = c.p!, e = c.e!;
    const q = this.c.quickhacks.find((x) => x.id === hackId)!;
    if (!this.w.entities.has(target.id) || target.zone !== e.zone || Math.hypot(target.x - e.x, target.y - e.y) > q.range + 2) throw new GameError('Se ha perdido la conexión con el objetivo.');
    const score = this.hackScore(p) + this.roll();
    const dv = q.dv + this.hackDefense(target);
    const ok = score >= dv;
    const tp = this.w.playerOf(target);
    this.w.progress.gain(p, 'interfaz', ok ? 5 : 1);
    if (q.effect === 'scan' || q.effect === 'deepscan') this.w.progress.gain(p, 'percepcion', 2);
    if (!ok) {
      this.notice(c, 'bad', `✘ ${q.name} rechazado (${score} contra ${dv}).`);
      if (tc(target)) this.notice(target.conn, 'good', `Tu cromo bloquea «${q.name}».`);
      if (!tp && target.kind === 'npc') this.provokeNpc(target, e, false);
    } else {
      this.notice(c, 'good', `✔ ${q.name} (${score} contra ${dv}).`);
      if (target.kind !== 'object') void this.w.legends.event(c, { type: 'hack' }).catch(() => {});
      const [a, b] = q.amount;
      switch (q.effect) {
        case 'scan': {
          const info = tp ? `${tp.name}: salud ${Math.round(tp.hp)}/${effective(this.c, tp).hpMax}, ${this.c.roles.find((r) => r.id === tp.role)?.name}, ~${Math.round(tp.money / 50) * 50} €$, cromo: ${chromeParts(this.c, tp).join(', ') || 'ninguno'}`
            : target.kind === 'object' ? `${target.name}: seguridad ${this.hackDefense(target) + 12}` : `${target.name}: salud ${Math.max(0, Math.round(target.npcHp ?? 0))}/${target.npcMax ?? '?'} · ${target.faction ? this.c.factions.find((f) => f.id === target.faction)?.name : 'civil'} · arma ${this.npcWeapon(target).name}`;
          const bounty = this.claimable(target, p);
          this.notice(c, 'info', `Escaneo · ${info}${bounty.length ? ` · recompensa ${bounty.reduce((s, x) => s + x.amount, 0)} €$${bounty.some((x) => x.aliveOnly) ? ' (vivo)' : ''}` : ''}`);
          if (target.kind !== 'object') this.w.send(c, { t: 'scan', view: this.scanView(p, target, false) });
          break;
        }
        case 'deepscan': this.w.send(c, { t: 'scan', view: this.scanView(p, target, true) }); break;
        case 'disable': target.disabledUntil = Date.now() + a * 1000; target.label = 'Apagada'; target.labelVer++; setTimeout(() => { if ((target.disabledUntil ?? 0) <= Date.now()) { target.label = ''; target.labelVer++; } }, a * 1000 + 50); this.notice(c, 'good', `${target.name} apagada durante ${a} s.`); break;
        case 'blind': if (tp) tp.blindUntil = Date.now() + a * 1000; else target.blindUntil = Date.now() + a * 1000; this.notice(target.conn, 'bad', 'Tu óptica se reinicia: no ves nada.'); break;
        case 'damage': case 'knockout': case 'kill': {
          const lethal = q.effect !== 'knockout';
          const legit = this.claimable(target, p).length > 0;
          const dmg = Math.round(a + this.rng() * (b - a));
          if (tp) { this.damagePlayer(tp, target, dmg, lethal, { name: 'un hackeo' }); if (tp.status === 'downed') await this.onNeutralized(c, target, tp.downedLethal, opId); }
          else { this.damageNpc(target, dmg, lethal, c); if (target.state === 'downed') await this.onNeutralized(c, target, lethal, opId); }
          this.notice(c, 'good', `${target.name} sufre ${dmg} de daño ${lethal ? 'neural' : 'no letal'}.`);
          // «Reacción en cadena»: si cae, el hackeo salta gratis a otra persona cercana.
          if ((tp?.status === 'downed' || target.state === 'downed') && q.effect !== 'damage' && perkMods(this.c, p).flags.has('cadena')) {
            const next = [...target.zone.query(target.x, target.y, 6)].find((o) => o !== target && o !== e && o.kind === 'npc' && o.npcMax && o.state !== 'downed' && o.npcType !== 'essential' && o.npcType !== 'civil');
            if (next) { this.damageNpc(next, dmg, lethal, c); this.fx(e, 'hack', target.id, next.id); this.notice(c, 'good', `Reacción en cadena: ${next.name} también cae fulminado (−${dmg}).`); if (next.state === 'downed') await this.onNeutralized(c, next, lethal, `${opId}-cadena`); }
          }
          this.crime(c, target, lethal, target.state === 'downed' || tp?.status === 'downed' ? 'down' : 'hit', legit);
          break;
        }
        case 'drain': {
          if (tp) { const amount = Math.floor(tp.money * (a + this.rng() * (b - a))); await this.transfer(tp, p, amount, opId, `Transferencia no autorizada (hackeo de ${p.name})`, `Hackeo: cuenta de ${tp.name}`); this.notice(c, 'good', `+${amount} €$ desde la cuenta de ${tp.name}.`); this.notice(target.conn, 'bad', `Te han vaciado la cuenta: −${amount} €$.`); }
          else { const amount = Math.floor(20 + this.rng() * 100); await this.credit(p, amount, opId, `Hackeo: cuenta de ${target.name}`); this.notice(c, 'good', `+${amount} €$ desde la cuenta de ${target.name}.`); }
          break;
        }
        case 'cash': {
          const amount = Math.round(a + this.rng() * (b - a));
          await this.credit(p, amount, opId, target.objKind === 'atm' ? `Hackeo de cajero (${target.name})` : `Hackeo de caja (${target.name})`);
          if (target.objKind === 'atm') this.atmCooldown.set(target.name + target.id, Date.now() + 3 * this.c.manifest.cityHourMs);
          const owner = target.shop ? this.c.shops.find((s) => s.id === target.shop)?.owner : undefined;
          if (owner && this.c.factions.some((f) => f.id === owner)) await this.repChange(c, owner, -4, `${opId}:fac`);
          this.notice(c, 'good', `+${amount} €$ desviados.`);
          break;
        }
      }
      // Experiencia de red y rango.
      p.netXp += 1 + Math.floor(q.ram / 2);
      this.w.progress.playerXp(p, 3);
      while (p.netRank + 1 < NET_RANKS.length && p.netXp >= NET_RANKS[p.netRank + 1]) { p.netRank++; this.notice(c, 'good', `¡Rango de red ${p.netRank}! Hackeos más rápidos, baratos y fiables.`); }
    }
    // Rastreo de la Red Centinela.
    if (this.rng() < this.traceOf(p, q.trace)) { this.notice(c, 'bad', 'Red Centinela ha rastreado tu firma.'); await this.sv.addWanted(c, 1, 'intrusión en la red'); }
    this.w.send(c, { t: 'sheet', sheet: (this.sv as any).sheetOf(p) });
    function tc(t: Entity) { return !!t.conn; }
  }

  // ================================================================ facciones
  /** Cambia la reputación con una facción y, a la mitad, con sus aliados y enemigos (según sus relaciones). */
  async repChange(c: PlayerConn, faction: string, delta: number, opId: string) {
    const p = c.p!;
    const f = this.c.factions.find((x) => x.id === faction);
    if (!f || !delta) return;
    const effects: any[] = [{ rep: faction, delta }];
    for (const [other, rel] of Object.entries(f.relations)) {
      if (Math.abs(rel) < 30) continue;
      const d = Math.round(delta * (rel / 100) * 0.5);
      if (d) effects.push({ rep: other, delta: d });
    }
    try { const out = await this.w.effects.apply(p, effects, { opId, kind: 'faction' }); this.w.handleOutcome(c, out); } catch {}
  }

  factionsView(p: PlayerState): FactionsView {
    const name = (id: string) => this.c.factions.find((f) => f.id === id)?.name ?? id;
    const zname = (id: string) => this.w.property.dname(id);
    return { factions: this.c.factions.filter((f) => f.id !== 'calle' && f.id !== 'independiente').map((f) => {
      const rep = p.rep.get(f.id) ?? 0;
      const standing = rep >= 50 ? 'Aliado' : rep >= 20 ? 'Amistoso' : rep > f.hostileBelow ? 'Neutral' : rep > -60 ? 'Hostil' : 'Enemigo jurado';
      return { id: f.id, name: f.name, kind: f.kind, color: f.color, archetype: f.archetype, desc: f.desc, territory: f.territory.map(zname), rep, standing,
        allies: Object.entries(f.relations).filter(([, v]) => v >= 30).map(([k]) => name(k)), enemies: Object.entries(f.relations).filter(([, v]) => v <= -30).map(([k]) => name(k)) };
    }) };
  }

  // ================================================================ Rescate Ámbar
  ambarView(p: PlayerState): AmbarView {
    const zname = (id: string) => this.w.property.dname(id);
    return {
      active: p.ambar && p.ambar.expiresAt > Date.now() ? { plan: p.ambar.plan, name: this.c.ambar.find((x) => x.id === p.ambar!.plan)?.name ?? p.ambar.plan, usesLeft: p.ambar.usesLeft, expiresInMin: Math.round((p.ambar.expiresAt - Date.now()) / 60000) } : null,
      plans: this.c.ambar.map((x) => ({ ...x, zones: x.zones.map(zname) })), money: p.money,
    };
  }
  async loadAmbar(p: PlayerState) {
    const r = await this.w.db.query<any>('SELECT id, plan, uses_left, expires_at FROM ambar_subscriptions WHERE character_id=$1 AND expires_at > now() ORDER BY expires_at DESC LIMIT 1', [p.charId]);
    if (r.rows[0]) p.ambar = { id: r.rows[0].id, plan: r.rows[0].plan, usesLeft: r.rows[0].uses_left, expiresAt: new Date(r.rows[0].expires_at).getTime() };
  }
  async buyAmbar(c: PlayerConn, planId: string, opId: string) {
    const p = c.p!;
    const plan = this.c.ambar.find((x) => x.id === planId);
    if (!plan) throw new GameError('Plan desconocido.');
    if (p.ambar && p.ambar.expiresAt > Date.now() && p.ambar.plan === planId && p.ambar.usesLeft > 0) throw new GameError('Ya tienes ese plan activo.');
    if (p.money < plan.price) throw new GameError(`${plan.name} cuesta ${plan.price} €$.`);
    const id = randomUUID();
    const expires = new Date(Date.now() + plan.days * 24 * this.c.manifest.cityHourMs);
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:ambar`, p.charId, -plan.price, p.money - plan.price, `Suscripción ${plan.name}`]);
      await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, plan.price]);
      await q.query('UPDATE ambar_subscriptions SET expires_at = now() WHERE character_id=$1 AND expires_at > now()', [p.charId]);
      await q.query('INSERT INTO ambar_subscriptions (id, character_id, plan, uses_left, expires_at) VALUES ($1,$2,$3,$4,$5)', [id, p.charId, plan.id, plan.uses, expires]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'ambar', JSON.stringify({ plan: plan.id })]);
    });
    p.money -= plan.price;
    p.ambar = { id, plan: plan.id, usesLeft: plan.uses, expiresAt: expires.getTime() };
    this.notice(c, 'good', `Suscripción ${plan.name} activa durante ${plan.days} días de juego.`);
  }
  /** Patrullas de la PCV en el distrito donde está la entidad (los interiores cuentan como vigilados salvo bases y torres). */
  policeAt(e: Entity) {
    const z = e.zone;
    if (z.def.districts.length) return z.districtAt(e.x, e.y)?.police ?? 1;
    if (z.def.kind === 'interior') return z.def.gangBase ? 0 : 1;
    return z.def.police;
  }
  /** Al caer herido de muerte: si hay suscripción y cobertura, Ámbar acude. */
  onPlayerDowned(c: PlayerConn | undefined, p: PlayerState, e: Entity) {
    if (!p.downedLethal) return;
    const sub = p.ambar;
    if (!sub || sub.expiresAt < Date.now() || sub.usesLeft <= 0) { this.notice(c, 'warn', 'No tienes suscripción a Rescate Ámbar: nadie vendrá a por ti salvo un jugador con un estimulante.'); return; }
    const plan = this.c.ambar.find((x) => x.id === sub.plan)!;
    if (!plan.zones.includes(this.w.districtOf(e.zone, e.x, e.y))) { this.notice(c, 'warn', `${plan.name} no cubre ${e.zone.def.name}.`); return; }
    const at = Date.now() + plan.arrival * 1000;
    p.downedUntil = Math.max(p.downedUntil, at + 4000);
    this.rescues.set(p.charId, { at, team: [], plan: plan.id });
    this.notice(c, 'good', `Rescate Ámbar en camino: llegada estimada en ${plan.arrival} s.`);
  }
  private async rescueTick() {
    const now = Date.now();
    for (const [charId, r] of this.rescues) {
      const conn = this.sv.connOf(charId);
      const p = conn?.p, e = conn?.e;
      if (!p || !e || p.status !== 'downed') { if (now > r.at + 8000) { for (const id of r.team) { const t = this.w.entities.get(id); if (t) this.w.removeEntity(t); } this.rescues.delete(charId); } continue; }
      if (!r.team.length && now >= r.at - 3000) {
        for (let i = 0; i < 2; i++) {
          const pos = nearestWalkable(e.zone.grid, e.x + (i ? 1.5 : -1.5), e.y + 1, 3) ?? { x: e.x, y: e.y };
          const t = this.spawnFactionNpc(e.zone, 'ambar', 'ambar', undefined, pos);
          if (t) { t.npc = undefined; t.respawn = undefined; t.label = 'Rescate en curso'; r.team.push(t.id); }
        }
      }
      if (now >= r.at) {
        const plan = this.c.ambar.find((x) => x.id === r.plan)!;
        p.status = 'alive'; p.hp = Math.round(effective(this.c, p).hpMax * plan.revive); p.downedUntil = 0;
        e.label = ''; e.state = 'alive'; this.bump(e);
        if (p.ambar) { p.ambar.usesLeft--; await this.w.db.query('UPDATE ambar_subscriptions SET uses_left = uses_left - 1 WHERE id=$1', [p.ambar.id]).catch(() => {}); }
        this.notice(conn, 'good', `Rescate Ámbar: te estabilizan y te devuelven al ${Math.round(plan.revive * 100)} % de salud. Rescates restantes: ${p.ambar?.usesLeft ?? 0}.`);
        this.rescues.delete(charId);
        const team = [...r.team];
        setTimeout(() => { for (const id of team) { const t = this.w.entities.get(id); if (t) this.w.removeEntity(t); } }, 5000);
      }
    }
  }

  // ================================================================ policía: detención y Unidad Hierro
  async arrest(c: PlayerConn) {
    const p = c.p!, e = c.e!;
    // v0.12 · La multa se calcula con el saldo real dentro de la transacción (antes, si el dinero cambiaba entre medias, el
    // saldo quedaba negativo, la base de datos lo rechazaba y el error tumbaba el servidor). Un fallo aquí ya no detiene nada.
    let fine = 0;
    try {
      const paid = await this.w.db.tx(async (q) => {
        const cur = await q.query<{ money: number }>('SELECT money FROM characters WHERE id = $1 FOR UPDATE', [p.charId]);
        const money = Number(cur.rows[0]?.money ?? 0);
        const f = Math.min(money, Math.max(50, Math.floor(money * 0.25)));
        if (f <= 0) return 0;
        await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, f]);
        await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`arrest-${randomUUID()}`, p.charId, -f, money - f, 'Multa de la PCV por detención']);
        return f;
      });
      fine = paid; if (paid) p.money = Math.max(0, p.money - paid);
    } catch (err) { console.error('[detención] multa no cobrada', (err as Error).message); }
    p.wanted = 0; p.hp = 15; p.status = 'alive'; p.downedUntil = 0;
    const pcv = this.sv.bounties.onPlayer(p.charId).filter((b) => b.poster === 'pcv');
    if (pcv.length) await this.sv.bounties.cancel(pcv.map((b) => b.id));
    for (const o of e.zone.entities) if (o.aggro === e.id) o.aggro = undefined;
    e.label = ''; e.state = 'alive'; this.bump(e);
    this.sv.updateMarker(e);
    this.w.send(c, { t: 'reward', title: 'Detenido por la PCV', lines: [`Multa: −${fine} €$`, 'Te sueltan en la comisaría de Cénit con el expediente limpio… por ahora.'] });
    await this.w.teleport(c, 'comisaria-int', [11, 5]);
  }

  private hierroTick() {
    for (const conn of this.w.conns.values()) {
      const p = conn.p, e = conn.e;
      if (!p || !e || p.status !== 'alive' || p.wanted < 4 || e.zone.def.kind !== 'exterior' || (e.zone.def.districts.length ? !(e.zone.districtAt(e.x, e.y)?.police) : e.zone.id === 'yermo')) continue;
      const active = [...e.zone.entities].filter((o) => o.npcType === 'hierro' && o.hunting === p.charId);
      if (active.length) continue;
      for (let i = 0; i < 2; i++) {
        const ang = this.rng() * Math.PI * 2;
        const pos = nearestWalkable(e.zone.grid, e.x + Math.cos(ang) * 12, e.y + Math.sin(ang) * 12, 5);
        const t = pos && this.spawnFactionNpc(e.zone, 'unidad-hierro', 'hierro', undefined, pos);
        if (t) { t.aggro = e.id; t.aggroLethal = true; t.hunting = p.charId; t.respawn = undefined; t.expiresAt = Date.now() + 180000; t.label = 'Neutralizando objetivo'; }
      }
      this.notice(conn, 'bad', '¡La Unidad Hierro ha llegado a por ti! Huye o sobornad… no, con estos no se negocia.');
    }
    for (const z of this.w.zones.values()) for (const o of [...z.entities]) if (o.npcType === 'hierro' && o.expiresAt && (o.expiresAt < Date.now() || !this.sv.connOf(o.hunting ?? '') || (this.sv.connOf(o.hunting!)?.p?.wanted ?? 0) < 2)) this.w.removeEntity(o);
  }

  // ================================================================ IA de combate de PNJ
  /** Devuelve true si el PNJ está ocupado combatiendo, huyendo o fuera de combate. */
  npcThink(e: Entity): boolean {
    if (e.state === 'downed' || e.carriedBy) return true;
    const now = Date.now();
    if ((e.stunUntil ?? 0) > now) { e.path = []; e.moving = false; return true; }
    if (e.fleeUntil && e.fleeUntil > now) {
      if (!e.path.length) { const wp = e.zone.def.waypoints[Math.floor(this.rng() * e.zone.def.waypoints.length)]; if (wp) { const r = findPath(e.zone.grid, e.x, e.y, wp[0] + 0.5, wp[1] + 0.5, 4000); if (r.ok) { e.path = r.path; e.moving = true; } } }
      if (e.label !== 'Huyendo') { e.label = 'Huyendo'; this.bump(e); }
      return true;
    }
    if (e.aggro !== undefined) {
      const t = this.w.entities.get(e.aggro);
      const tp = t ? this.w.playerOf(t) : undefined;
      if (t && !tp && t.kind === 'npc') return this.npcVsNpc(e, t);
      const hidden = tp && ((tp.buffs.invisible ?? 0) > now || (tp.buffs.senuelo ?? 0) > now);
      if (!t || t.zone !== e.zone || !tp || tp.status !== 'alive' || hidden || (e.npcType === 'police' && tp.wanted < 1)) { e.aggro = undefined; if (e.label !== 'Patrullando') { e.label = e.npcType === 'police' ? 'Patrullando' : ''; this.bump(e); } return false; }
      const wp = this.npcWeapon(e);
      const dist = Math.hypot(t.x - e.x, t.y - e.y);
      const inRange = dist <= wp.w.range - 0.2 && (wp.w.kind === 'melee' || lineWalkable(e.zone.grid, e.x, e.y, t.x, t.y));
      if (e.label !== 'En combate') { e.label = 'En combate'; this.bump(e); }
      if (!inRange) {
        if (!e.path.length || (e.nextPathAt ?? 0) < now) {
          e.nextPathAt = now + 1500;
          const r = findPath(e.zone.grid, e.x, e.y, t.x, t.y, 4000);
          if (r.ok) { e.path = r.path.slice(0, -1).length ? r.path.slice(0, -1) : r.path; e.moving = true; }
        }
        return true;
      }
      e.path = []; e.moving = false;
      if ((e.nextAttackAt ?? 0) <= now) {
        e.nextAttackAt = now + (wp.w.cooldown * 1000 * 1.3) / (e.timeScale ?? 1);
        const a = this.npcAttackScore(e) + this.roll(), d = this.defenseScore(tp) + this.roll();
        const cover = wp.w.kind === 'ranged' ? this.coverOf(e, t) : 0;
        const hitOk = a >= d + cover;
        if (hitOk && ((t.dodgeUntil ?? 0) > Date.now() ? this.rng() < 0.8 : this.rng() < this.dodgeOf(tp))) { this.fx(e, wp.w.kind === 'ranged' ? 'shot' : 'hit', e.id, t.id, { weapon: wp.id, hit: false }); this.notice(t.conn, 'good', `Esquivas a ${e.name}.`); }
        else if (hitOk) {
          const police = e.npcType === 'police';
          const lethal = police ? !!e.aggroLethal : e.aggroLethal !== false;
          let raw = Math.max(1, this.rollDamage(wp.w, a - d) - (wp.w.traits?.includes('perforante') ? 0 : this.armorOf(tp)));
          if (t.guard && wp.w.kind === 'melee' && this.weaponOf(tp).w.kind === 'melee') { raw = Math.max(1, Math.round(raw * 0.35)); this.notice(t.conn, 'good', `Bloqueas a ${e.name}.`); }
          const wnd = this.wounds.hit(t, tp, hitPart(this.rng), raw, wp, lethal);
          this.fx(e, wp.w.kind === 'ranged' ? 'shot' : 'hit', e.id, t.id, { weapon: wp.id, hit: true, part: wnd.part, sever: !!wnd.severed });
          if (wnd.severed && t.conn) this.notice(t.conn, 'bad', `¡${e.name} te ha arrancado ${PART_NAMES[wnd.severed]}! Un matasanos puede implantarte una prótesis.`);
          if (wnd.ko && tp.status === 'alive') { tp.hp -= wnd.dmg; this.sv.downed(t.conn, `conmoción (golpe de ${e.name} en la cabeza)`, tp, t, false); }
          else this.damagePlayer(tp, t, wnd.dmg, lethal, { name: e.name, police });
          if (tp.status === 'alive') this.counter(t, e);
        } else { this.fx(e, wp.w.kind === 'ranged' ? 'shot' : 'hit', e.id, t.id, { weapon: wp.id, hit: false }); if (cover && a >= d && t.conn) this.notice(t.conn, 'good', `La cobertura te salva de ${e.name}.`); this.counter(t, e); }
      }
      return true;
    }
    // Vigilancia: policía busca a los buscados; bandas, a quien tienen fichado en su territorio.
    if (e.npcType === 'police' || e.npcType === 'gang') {
      const f = this.c.factions.find((x) => x.id === e.faction);
      for (const o of e.zone.query(e.x, e.y, e.npcType === 'police' ? 12 : 7)) {
        const op = o.kind === 'player' ? this.w.playerOf(o) : undefined;
        if (!op || op.status !== 'alive' || dangerAt(o.zone.grid, o.x, o.y) === 'protected') continue;
        if ((op.buffs.invisible ?? 0) > now || (op.buffs.senuelo ?? 0) > now) continue;
        // v0.10 · Solo detectan lo que VEN (cono de visión, línea de visión, oscuridad y callejones).
        if (!o.conn || !this.w.stealth.sees(e, o)) continue;
        const of = perkMods(this.c, op).flags;
        if (e.npcType === 'police' && op.wanted >= 2 && !of.has('sombra') && this.w.stealth.recognizes(e, o.conn)) { e.aggro = o.id; e.aggroLethal = op.identified?.crime === 'asesinato'; this.notice(o.conn, 'warn', `${e.name}: «¡Alto, PCV! Queda detenido.»`); return true; }
        // En la base de una banda (o en una planta restringida de una torre), quien no sea de los suyos es un intruso.
        const allied = f && this.w.underworld.isAlly(op, f.id);
        const intruder = (f && e.zone.def.gangBase?.faction === f.id && !allied && (op.rep.get(f.id) ?? 0) < 20)
          || (e.zone.def.tower?.access === 'restringido' && !this.w.posts.hasAccess(op, e.zone, true));
        if (e.npcType === 'gang' && f && intruder && !of.has('terror')) { e.aggro = o.id; e.aggroLethal = !e.zone.def.tower; this.notice(o.conn, 'bad', e.zone.def.tower ? `Seguridad de ${f.name}: «¡Alto! No tiene autorización para esta planta.»` : `${f.name}: «¿Quién te ha dejado entrar?» ¡Te atacan!`); return true; }
        if (e.npcType !== 'gang' || !f || allied || of.has('terror')) continue;
        const territory = f.territory.includes(this.w.districtOf(e.zone, e.x, e.y));
        const crewTurf = territory || e.zone.def.gangBase?.faction === f.id || e.zone.districtAt(e.x, e.y)?.gangs.some((g) => g.faction === f.id);
        if ((territory && (op.rep.get(f.id) ?? 0) <= f.hostileBelow) || (crewTurf && this.w.underworld.isRival(op, f.id))) {
          e.aggro = o.id; e.aggroLethal = true;
          this.notice(o.conn, 'bad', `${f.name} te reconocen en su territorio. ¡Te atacan!`);
          return true;
        }
      }
    }
    return false;
  }

  /** v0.7 · PNJ contra PNJ: maleantes que atacan a civiles, policía contra criminales, ciberpsicópatas contra todo. */
  private npcVsNpc(e: Entity, t: Entity): boolean {
    const now = Date.now();
    if (t.zone !== e.zone || t.state === 'downed' || t.dead || Math.hypot(t.x - e.x, t.y - e.y) > 30) {
      e.aggro = undefined;
      if (e.label === 'En combate' || e.label === 'Atacando') { e.label = e.npcType === 'police' ? 'Patrullando' : e.npcType === 'psycho' ? 'Fuera de control' : ''; this.bump(e); }
      return false;
    }
    const wp = this.npcWeapon(e);
    const dist = Math.hypot(t.x - e.x, t.y - e.y);
    const inRange = dist <= wp.w.range - 0.2 && (wp.w.kind === 'melee' || lineWalkable(e.zone.grid, e.x, e.y, t.x, t.y));
    if (e.label !== 'En combate') { e.label = 'En combate'; this.bump(e); }
    if (!inRange) {
      if (!e.path.length || (e.nextPathAt ?? 0) < now) {
        e.nextPathAt = now + 1500;
        const r = findPath(e.zone.grid, e.x, e.y, t.x, t.y, 4000);
        if (r.ok) { e.path = r.path.slice(0, -1).length ? r.path.slice(0, -1) : r.path; e.moving = true; }
      }
      return true;
    }
    e.path = []; e.moving = false;
    if ((e.nextAttackAt ?? 0) > now) return true;
    e.nextAttackAt = now + (wp.w.cooldown * 1000 * 1.3) / (e.timeScale ?? 1);
    const kind = wp.w.kind === 'ranged' ? 'shot' : 'hit';
    const a = this.npcAttackScore(e) + this.roll(), d = this.npcDefenseScore(t) + (wp.w.kind === 'ranged' ? this.coverOf(e, t) : 0) + this.roll();
    if (a < d) { this.fx(e, kind, e.id, t.id, { weapon: wp.id, hit: false }); if (t.npcType === 'civil' && !t.fleeUntil) this.w.threats.react(t, e); return true; }
    const lethal = e.aggroLethal !== false;
    const raw = Math.max(1, this.rollDamage(wp.w, a - d) * (e.npcType === 'psycho' ? 1.6 : 1));
    const wnd = this.wounds.hit(t, undefined, hitPart(this.rng), Math.round(raw), wp, lethal);
    this.fx(e, kind, e.id, t.id, { weapon: wp.id, hit: true, part: wnd.part, sever: !!wnd.severed });
    t.lastHitBy = e.id; t.lastHitAt = now;
    this.damageNpc(t, wnd.dmg, lethal && !wnd.ko);
    if (wnd.ko && (t.state as string) !== 'downed') this.npcDowned(t, false);
    if ((t.state as string) === 'downed') { e.aggro = undefined; for (const o of t.zone.query(t.x, t.y, 20)) if (o.kind === 'player' && o.conn) this.notice(o.conn, 'bad', `${e.name} ha derribado a ${t.name}.`); }
    else if (t.npcType === 'civil') this.w.threats.react(t, e);
    else if (t.aggro === undefined && t.npcType !== 'essential') { t.aggro = e.id; t.aggroLethal = true; }
    this.w.threats.violence(e, t);
    return true;
  }

  // ================================================================ v0.4: matasanos ocultos, análisis y habilidades de implantes
  /** Marca una consulta de matasanos como descubierta (aparece en el mapa del jugador). */
  discover(c: PlayerConn, docId: string) {
    const p = c.p!;
    const key = `descubierto:${docId}`;
    if (p.flags.has(key)) return;
    const d = this.c.ripperdocs.find((x) => x.id === docId);
    if (!d) return;
    p.flags.set(key, { value: true, expiresAt: null });
    void this.w.db.query(`INSERT INTO character_flags (character_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (character_id, key) DO NOTHING`, [p.charId, key, JSON.stringify(true)]).catch(() => {});
    this.notice(c, 'good', `Has descubierto la consulta de ${d.name}. Ya aparece en tu mapa.`);
    this.w.progress.gain(p, 'investigacion', 6);
    this.w.send(c, { t: 'sheet', sheet: (this.sv as any).sheetOf(p) });
  }

  /** Ficha de un objetivo: básica (escanear) o completa (análisis profundo de edgerunner). */
  scanView(p: PlayerState, target: Entity, deep: boolean): ScanView {
    const tp = this.w.playerOf(target);
    const fac = target.faction ? this.c.factions.find((f) => f.id === target.faction) : undefined;
    const bounty = this.claimable(target, p).reduce((s, b) => s + b.amount, 0);
    if (tp) {
      const ef = effective(this.c, tp);
      const lvl = tp.level;
      const myLv = p.level;
      return {
        target: target.id, name: tp.name, title: `${this.c.roles.find((r) => r.id === tp.role)?.name ?? ''} · ${this.c.professions.find((x) => x.id === tp.profession)?.name ?? ''}`, kind: 'player', deep, level: lvl,
        hp: Math.round(tp.hp), hpMax: ef.hpMax, bounty, wanted: Math.round(tp.wanted * 10) / 10, money: `~${Math.round(tp.money / 100) * 100} €$`,
        threat: lvl >= myLv + 5 ? 'Muy peligroso' : lvl >= myLv + 2 ? 'Peligroso' : lvl <= myLv - 4 ? 'Inofensivo' : 'Parejo',
        ...(deep ? {
          attributes: { ...ef.attrs }, armor: ef.armor, weapon: this.weaponOf(tp).name, chrome: tp.cyber.filter((x) => x.location === 'installed').map((x) => this.c.cyberware.find((d) => d.id === x.def)?.name ?? x.def),
          skills: Object.entries(tp.skillXp).map(([k, xp]) => ({ name: this.c.skills.find((s) => s.id === k)?.name ?? k, level: skillLevelForXp(xp) })).sort((a, b) => b.level - a.level).slice(0, 6),
        } : {}),
      };
    }
    const lv = target.level ?? 3;
    const w = this.npcWeapon(target);
    const base = (target.defense ?? 10);
    const attrs = { BODY: Math.min(10, 3 + Math.floor(lv / 4)), REF: Math.min(10, 3 + Math.floor(lv / 4)), DEX: Math.min(10, 3 + Math.floor(lv / 5)), INT: target.faction === 'voces-vacio' ? 8 : 4, COOL: Math.min(10, 3 + Math.floor(lv / 6)), WILL: 5, TECH: 4, EMP: target.npcType === 'civil' ? 6 : 3 };
    return {
      target: target.id, name: target.name, title: target.title ?? (target.npcType === 'civil' ? 'Transeúnte' : ''), kind: 'npc', deep, level: lv,
      hp: Math.max(0, Math.round(target.npcHp ?? target.npcMax ?? 0)), hpMax: target.npcMax ?? 0, faction: fac?.name, factionColor: fac?.color, bounty, rep: fac ? p.rep.get(fac.id) ?? 0 : undefined,
      threat: lv >= p.level + 5 ? 'Muy peligroso' : lv >= p.level + 2 ? 'Peligroso' : lv <= p.level - 4 ? 'Inofensivo' : 'Parejo',
      ...(deep ? { attributes: attrs, armor: Math.max(0, Math.floor((base - 9) / 2)), weapon: w.name, chrome: target.chrome ?? [], skills: [{ name: w.w.kind === 'melee' ? 'Cuerpo a cuerpo' : 'Armas a distancia', level: Math.min(25, lv + 2) }, { name: 'Atletismo', level: Math.max(1, lv - 1) }, { name: 'Percepción', level: Math.max(1, lv - 3) }] } : {}),
    };
  }

  /** Activa la habilidad de un implante (tecla 1–4). */
  async ability(c: PlayerConn, cyberId: string) {
    const p = c.p!, e = c.e!;
    if (p.status !== 'alive') throw new GameError('Ahora no.');
    if (cyberId.startsWith('matriz-')) return this.w.relics.ability(c, cyberId);
    const inst = p.cyber.find((x) => x.location === 'installed' && x.def === cyberId);
    const d = inst && this.c.cyberware.find((x) => x.id === cyberId);
    if (!d?.ability) throw new GameError('No tienes ese implante instalado.');
    if (d.ability.kind === 'kairos') return this.w.relics.toggleKairos(c, d.ability.power);
    const now = Date.now();
    if ((p.abilityCd[cyberId] ?? 0) > now) throw new GameError(`${d.ability.name}: se recarga en ${Math.ceil(((p.abilityCd[cyberId] ?? 0) - now) / 1000)} s.`);
    const pm = perkMods(this.c, p);
    const ab = d.ability;
    p.abilityCd[cyberId] = now + ab.cooldown * 1000 * Math.max(0.3, 1 - (pm.mods.cooldown ?? 0));
    const until = now + ab.duration * 1000;
    const ef = effective(this.c, p);
    const hostiles = (r: number) => [...e.zone.query(e.x, e.y, r)].filter((o) => o !== e && o.kind === 'npc' && o.npcMax && o.state !== 'downed' && o.npcType !== 'essential');
    const prot = dangerAt(e.zone.grid, e.x, e.y) === 'protected';
    switch (ab.kind) {
      case 'tiempo-bala': p.buffs['tiempo-bala'] = until; this.notice(c, 'good', `${ab.name}: el mundo se ralentiza durante ${ab.duration} s.`); break;
      case 'invisible': p.buffs.invisible = until; for (const o of e.zone.entities) if (o.aggro === e.id) o.aggro = undefined; this.notice(c, 'good', `${ab.name}: eres invisible ${ab.duration} s. Nadie te persigue ni te denuncia.`); break;
      case 'senuelo': p.buffs.senuelo = until; for (const o of e.zone.entities) if (o.aggro === e.id) o.aggro = undefined; this.notice(c, 'good', `${ab.name}: tu doble atrae todas las miradas.`); break;
      case 'curar': p.buffs.curar = until; p.buffs.curarPerSec = Math.ceil((ef.hpMax * ab.power) / Math.max(1, ab.duration)); this.notice(c, 'good', `${ab.name}: recuperas salud durante ${ab.duration} s.`); break;
      case 'esprint': p.buffs.esprint = until; this.notice(c, 'good', `${ab.name}: corres mucho más rápido ${ab.duration} s.`); break;
      case 'pico-ram': p.ram = ef.ram; this.notice(c, 'good', `${ab.name}: RAM al máximo.`); break;
      case 'disparo-cargado': p.buffs['disparo-cargado'] = now + 30000; this.notice(c, 'good', `${ab.name}: tu próximo disparo hará el doble de daño.`); break;
      case 'pulso': case 'torbellino': {
        if (prot) throw new GameError('Zona protegida.');
        if (ab.kind === 'pulso') this.w.relics.emp(e.zone.id, e.x, e.y, 5, c);
        const list = hostiles(ab.kind === 'pulso' ? 5 : 2.2);
        if (!list.length) { this.notice(c, 'info', 'No hay nadie a tu alrededor.'); break; }
        const boost = pm.flags.has('corazon-cromo') ? 1.25 : 1;
        for (const o of list) {
          const dmg = Math.round((ab.kind === 'pulso' ? ab.power * ((o.chrome?.length ?? 0) > 0 ? 2 : 1) : 12 + this.rng() * 10) * boost);
          if (ab.kind === 'pulso') o.stunUntil = now + ab.duration * 1000;
          this.fx(e, 'hit', e.id, o.id);
          this.damageNpc(o, dmg, ab.kind === 'torbellino', c);
          if (o.state === 'downed') await this.onNeutralized(c, o, ab.kind === 'torbellino', `ab-${randomUUID()}`);
          this.crime(c, o, ab.kind === 'torbellino', o.state === 'downed' ? 'down' : 'hit');
        }
        p.lastCombatAt = now;
        this.notice(c, 'good', `${ab.name}: alcanzas a ${list.length} ${list.length === 1 ? 'persona' : 'personas'}.`);
        break;
      }
      // v0.9 · Habilidades nuevas.
      case 'marcar': {
        const list = hostiles(15);
        p.buffs.marcar = until;
        for (const o of list) o.markedUntil = until;
        this.notice(c, 'good', `${ab.name}: ${list.length} ${list.length === 1 ? 'objetivo marcado' : 'objetivos marcados'} durante ${ab.duration} s (+2 a acertarles; los ves a través de las paredes).`);
        break;
      }
      case 'escudo': p.buffs.escudo = until; p.shield = ab.power; this.notice(c, 'good', `${ab.name}: absorbes los próximos ${ab.power} puntos de daño durante ${ab.duration} s.`); break;
      case 'salto': {
        const dir = e.steer && Date.now() - e.steer.at < 1500 ? e.steer : e.lastDir ?? { dx: 1, dy: 0 };
        const len = Math.hypot(dir.dx, dir.dy) || 1;
        let x = e.x, y = e.y;
        for (let i = 1; i <= ab.power * 4; i++) { const nx = e.x + (dir.dx / len) * 0.25 * i, ny = e.y + (dir.dy / len) * 0.25 * i; if (!isWalkable(e.zone.grid, nx, ny)) break; x = nx; y = ny; }
        const fx0 = e.x, fy0 = e.y;
        e.x = x; e.y = y; e.path = []; e.moving = false; e.zone.moved(e); e.dodgeUntil = now + 300;
        for (const o of e.zone.query(e.x, e.y, 28)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'fx', kind: 'dodge', from: e.id, to: e.id, x: fx0, y: fy0 });
        this.notice(c, 'good', `${ab.name}: saltas ${Math.hypot(x - fx0, y - fy0).toFixed(1)} m.`);
        break;
      }
      case 'carga': {
        const t = (e.pendingAction && this.w.entities.get(e.pendingAction.target)) || hostiles(9).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
        if (!t) throw new GameError('No hay a quién cargar.');
        const dist = Math.hypot(t.x - e.x, t.y - e.y);
        const step = Math.min(ab.power, Math.max(0, dist - 1));
        const nx = e.x + ((t.x - e.x) / dist) * step, ny = e.y + ((t.y - e.y) / dist) * step;
        if (step > 0 && lineWalkable(e.zone.grid, e.x, e.y, nx, ny)) { e.x = nx; e.y = ny; e.path = []; e.lastMoveTick = this.w.tick; e.zone.moved(e); }
        p.nextAttackAt = 0; p.buffs.carga = now + 2500;
        this.notice(c, 'good', `${ab.name}: te lanzas sobre ${t.name} (+3 al próximo ataque).`);
        break;
      }
    }
    e.buffs = p.buffs; this.bump(e);
    this.w.progress.gain(p, 'filo', 3);
    this.w.send(c, { t: 'sheet', sheet: (this.sv as any).sheetOf(p) });
  }

  /** Alijo de una base: solo se puede saquear con los guardias fuera de combate. Botín grande, enfado de la banda. */
  private lootCd = new Map<string, number>();
  async loot(c: PlayerConn, o: Entity) {
    const p = c.p!, e = c.e!;
    const base = e.zone.def.gangBase;
    if (!base) throw new GameError('Aquí no hay nada que llevarse.');
    if (Math.hypot(o.x - e.x, o.y - e.y) > 2.5) throw new GameError('Acércate al alijo.');
    if ((this.lootCd.get(e.zone.id) ?? 0) > Date.now()) throw new GameError('Ya lo han vaciado. Volverán a llenarlo en unas horas.');
    const guards = [...e.zone.entities].filter((x) => x.npcType === 'gang' && x.faction === base.faction && x.state !== 'downed');
    if (guards.length && (p.rep.get(base.faction) ?? 0) < 40) {
      for (const g of guards) { g.aggro = e.id; g.aggroLethal = true; }
      throw new GameError(`Quedan ${guards.length} guardias en pie: te han visto. ¡Neutralízalos antes de tocar el alijo!`);
    }
    const amount = 600 + Math.floor(this.rng() * 1600);
    const opId = `loot-${randomUUID()}`;
    await this.credit(p, amount, opId, `Botín: ${e.zone.def.name}`);
    const drug = 'neblina';
    if (this.c.items.some((i) => i.id === drug)) {
      p.inventory.set(drug, (p.inventory.get(drug) ?? 0) + 2);
      void this.w.db.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,2) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + 2`, [randomUUID(), p.charId, drug]).catch(() => {});
    }
    this.lootCd.set(e.zone.id, Date.now() + 4 * this.c.manifest.cityHourMs);
    await this.repChange(c, base.faction, -25, `${opId}:fac`);
    this.w.progress.playerXp(p, 60);
    this.w.send(c, { t: 'reward', title: `Has saqueado ${e.zone.def.name}`, lines: [`+${amount} €$`, `${base.boss} no lo va a olvidar: tu relación con la banda se desploma.`] });
  }

  /** Cada segundo: PNJ derribados, reapariciones, rescates y Unidad Hierro. */
  async everySecond() {
    const now = Date.now();
    this.wounds.tick();
    // Daño continuado (quemaduras y sangrado).
    for (const z of this.w.zones.values()) for (const e of [...z.entities]) {
      if (!e.dots?.length) continue;
      e.dots = e.dots.filter((d) => d.until > now);
      for (const d of e.dots) if (now >= d.next) {
        d.next = now + 1000;
        const tp = this.w.playerOf(e);
        const by = d.by !== undefined ? this.w.entities.get(d.by) : undefined;
        if (tp) { if (tp.status === 'alive') this.damagePlayer(tp, e, d.dmg, true, { name: 'las heridas' }); }
        else if (e.state !== 'downed' && e.npcMax) { this.damageNpc(e, d.dmg, true, by?.conn); if ((e.state as string) === 'downed' && by?.conn) await this.onNeutralized(by.conn, e, true, `dot-${randomUUID()}`); }
      }
    }
    for (const z of this.w.zones.values()) for (const e of [...z.entities]) {
      if (e.kind !== 'npc' || e.state !== 'downed' || !e.downedUntil || e.carriedBy) continue;
      if (now < e.downedUntil) continue;
      if (e.dead) { if (e.carriedBy) { const carrier = this.w.entities.get(e.carriedBy); if (carrier?.conn?.p) carrier.conn.p.carrying = null; } this.w.removeEntity(e); continue; }
      if (e.npcLethalDown) this.npcDeath(e);
      else { e.state = 'alive'; e.npcHp = Math.round((e.npcMax ?? 40) * 0.5); e.label = 'Aturdido'; e.fleeUntil = now + 10000; this.bump(e); }
    }
    for (const r of [...this.respawnQueue]) {
      if (now < r.at) continue;
      this.respawnQueue.splice(this.respawnQueue.indexOf(r), 1);
      const z = this.w.zones.get(r.zone);
      const t = r.template as any;
      if (z) { if (t.type === 'civil') this.w.spawnAmbient(z, t.near); else if (t.type === 'predator') this.w.threats.spawnPredator(z, [t.near.x, t.near.y]); else this.spawnFactionNpc(z, t.faction, t.type, t.area); }
    }
    await this.rescueTick();
    this.hierroTick();
  }
}

export function opposedChance2(a: number, b: number) { return opposed(a, b); }
export function opposed(a: number, b: number): number {
  let ok = 0;
  for (let x = 1; x <= 10; x++) for (let y = 1; y <= 10; y++) if (a + x >= b + y) ok++;
  return ok / 100;
}
void isWalkable;
export type { ItemDef };
