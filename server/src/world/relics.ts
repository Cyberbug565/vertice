// v0.8 · Matrices del zócalo neural (CARMÍN, ECO y las legendarias), acelerador Kairós con dilatación del tiempo
// y la Proyección de Eco (controlar al fantasma: nadie lo ve y atraviesa paredes y puertas).
import { MATRICES, SOCKET_BASE, SOCKET_MAX, dangerAt, kairosOf, kairosScale, nearestWalkable } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { effective, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

interface Ghost { ghost: Entity; body: Entity; until: number }

export class Relics {
  readonly ghosts = new Map<PlayerConn, Ghost>();
  private scaled = new Set<Entity>();
  constructor(private readonly w: World) {}
  private notice(c: PlayerConn | undefined, kind: 'info' | 'good' | 'warn' | 'bad', text: string) { if (c) this.w.send(c, { t: 'notice', kind, text }); }
  private sheet(c: PlayerConn) { this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(c.p!) }); }

  // ================================================================ matrices
  hasSocket(p: PlayerState) { return p.cyber.some((ci) => ci.location === 'installed' && ci.def === 'zocalo-matrices'); }
  slots(p: PlayerState) { return Math.min(SOCKET_MAX, SOCKET_BASE + (p.relics?.socketExtra ?? 0)); }
  equipped(p: PlayerState): string[] { return this.hasSocket(p) ? (p.relics?.matrices ?? []) : []; }
  async matrix(c: PlayerConn, action: 'equip' | 'remove', id: string) {
    const p = c.p!;
    const def = MATRICES[id];
    if (!def) throw new GameError('Esa matriz no existe.');
    p.relics ??= { matrices: [], socketExtra: 0 };
    if (action === 'equip') {
      if (!this.hasSocket(p)) throw new GameError('Necesitas un zócalo de matrices instalado (lo ponen los matasanos de grado IV o más).');
      if (p.relics.matrices.includes(id)) throw new GameError('Ya la llevas puesta.');
      if (p.relics.matrices.length >= this.slots(p)) throw new GameError(`No te quedan ranuras libres (${this.slots(p)}). Un módulo de ampliación añade una.`);
      if ((p.inventory.get(id) ?? 0) < 1) throw new GameError('No tienes esa matriz.');
      const ef = effective(this.w.c, p);
      if (ef.chromeUsed + def.chrome > Math.floor(ef.chromeCapacity * 1.5)) throw new GameError(`Tu cuerpo no aguantaría tanto cromo (${ef.chromeUsed + def.chrome}/${ef.chromeCapacity}).`);
      p.relics.matrices.push(id);
      p.inventory.set(id, (p.inventory.get(id) ?? 1) - 1);
      await this.w.db.query('UPDATE inventory_items SET qty = GREATEST(0, qty - 1) WHERE character_id=$1 AND def_id=$2', [p.charId, id]);
      this.notice(c, 'good', def.locked ? `${def.name} se ancla a tu sistema nervioso. Ya no podrás quitártela.` : `${def.name} insertada en el zócalo.`);
      if (def.companion) this.w.send(c, { t: 'speech', id: c.e!.id, text: `${def.companion.name}: «${def.companion.lines[0]}»` });
    } else {
      if (!p.relics.matrices.includes(id)) throw new GameError('No la llevas puesta.');
      if (def.locked) throw new GameError(`${def.name} no sale. Se ríe de ti cuando lo intentas.`);
      p.relics.matrices = p.relics.matrices.filter((x) => x !== id);
      p.inventory.set(id, (p.inventory.get(id) ?? 0) + 1);
      await this.w.db.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES (gen_random_uuid(),$1,$2,1) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + 1`, [p.charId, id]);
      this.notice(c, 'info', `${def.name} retirada.`);
    }
    this.sheet(c);
  }
  /** Módulo de ampliación: una ranura más (máximo 4). */
  expand(c: PlayerConn) {
    const p = c.p!;
    p.relics ??= { matrices: [], socketExtra: 0 };
    if (SOCKET_BASE + p.relics.socketExtra >= SOCKET_MAX) throw new GameError('Tu zócalo ya tiene el máximo de ranuras (4).');
    p.relics.socketExtra++;
    this.notice(c, 'good', `Zócalo ampliado: ${this.slots(p)} ranuras.`);
  }

  // ================================================================ habilidades de las matrices
  async ability(c: PlayerConn, id: string) {
    const p = c.p!, e = this.bodyOf(c);
    const def = MATRICES[id];
    if (!def?.ability || !this.equipped(p).includes(id)) throw new GameError('No llevas esa matriz.');
    const now = Date.now();
    if (def.ability.kind === 'proyeccion' && this.ghosts.has(c)) { this.endGhost(c, false); return; }
    if ((p.abilityCd[id] ?? 0) > now) throw new GameError(`${def.ability.name}: se recarga en ${Math.ceil(((p.abilityCd[id] ?? 0) - now) / 1000)} s.`);
    if (def.ability.kind === 'onda') {
      const cost = def.ability.ram ?? 10;
      if (p.ram < cost) throw new GameError(`La Onda Carmín necesita ${cost} de RAM (tienes ${Math.floor(p.ram)}).`);
      if (dangerAt(e.zone.grid, e.x, e.y) === 'protected') throw new GameError('Zona protegida.');
      p.ram -= cost; p.abilityCd[id] = now + def.ability.cooldown * 1000;
      const lethal = p.stance === 'aggressive';
      let n = 0;
      for (const o of [...e.zone.query(e.x, e.y, 7)]) {
        if (o === e || (o.kind !== 'npc' && o.kind !== 'player') || o.state === 'downed' || o.dead || o.npcType === 'essential') continue;
        const tp = this.w.playerOf(o);
        if (tp && (tp.status !== 'alive' || dangerAt(o.zone.grid, o.x, o.y) === 'protected')) continue;
        if (!tp && !o.npcMax) continue;
        n++;
        this.w.send(c, { t: 'fx', kind: 'hack', from: e.id, to: o.id });
        if (tp) { if (lethal) this.w.combat.damagePlayer(tp, o, 55, true, { name: `la Onda Carmín de ${p.name}`, charId: p.charId }); else { tp.hp = Math.min(tp.hp, 0); this.w.survival.downed(o.conn, `onda neural de ${p.name}`, tp, o, false); } }
        else if (lethal) this.w.combat.damageNpc(o, 90, true, c); else this.w.combat.knockOut(o, c);
      }
      this.emp(e.zone.id, e.x, e.y, 7, c);
      this.notice(c, 'good', `CARMÍN: «¿Así? ¿Así de fácil?» La onda ${lethal ? 'fríe' : 'apaga'} a ${n} ${n === 1 ? 'objetivo' : 'objetivos'}.`);
      this.sheet(c);
      return;
    }
    // Proyección de Eco
    this.startGhost(c, def.ability.duration ?? 300);
    p.abilityCd[id] = now + def.ability.cooldown * 1000;
  }

  // ================================================================ Proyección de Eco (fantasma controlable)
  bodyOf(c: PlayerConn) { return this.ghosts.get(c)?.body ?? c.e!; }
  isGhost(e: Entity) { return !!e.ghostOf; }
  startGhost(c: PlayerConn, seconds: number) {
    const body = c.e!, p = c.p!;
    if (p.status !== 'alive' || body.transit || p.driving || p.sleeping) throw new GameError('Ahora no puedes proyectar a Eco.');
    const ghost = this.w.addEntity(body.zone, { kind: 'player', name: 'Rafa «Brasas»', x: body.x + 0.6, y: body.y, interactive: false, label: 'Proyección', speed: body.speed * 1.25,
      appearance: { skin: '#e0c0a0', hair: '#1a1a1a', jacket: '#1a1a1a', accent: '#ffb020', build: 'delgado', hairStyle: 'largo', top: 'chaqueta', facial: 'perilla', accessory: 'gafas' } as any });
    ghost.privateTo = c; ghost.ghostOf = body.id;
    body.conn = undefined; body.ghostOwner = c; body.steer = undefined; body.path = []; body.label = 'En trance'; body.labelVer++;
    this.w.cancelActivity(body);
    this.ghosts.set(c, { ghost, body, until: Date.now() + seconds * 1000 });
    c.e = ghost; ghost.conn = c;
    c.known.clear();
    this.w.send(c, { t: 'possess', you: ghost.id, zone: ghost.zone.id, x: ghost.x, y: ghost.y, ghost: true });
    this.notice(c, 'good', `Rafa: «Venga, chaval, déjame a mí.» Controlas a Eco durante ${Math.round(seconds / 60)} min: nadie te ve, atraviesas paredes y puertas. Vuelve a pulsar la habilidad para regresar.`);
  }
  endGhost(c: PlayerConn, emp: boolean) {
    const g = this.ghosts.get(c);
    if (!g) return;
    this.ghosts.delete(c);
    const { ghost, body } = g;
    this.w.removeEntity(ghost);
    body.ghostOwner = undefined; body.conn = c; body.label = ''; body.labelVer++;
    c.e = body;
    c.known.clear();
    this.w.send(c, { t: 'possess', you: body.id, zone: body.zone.id, x: body.x, y: body.y, ghost: false });
    const p = c.p!;
    if (emp) {
      body.stunUntil = Date.now() + 15000;
      p.abilityCd['matriz-eco'] = Date.now() + 60000;
      this.notice(c, 'bad', '⚡ ¡Un pulso EMP! La conexión con Eco se rompe y una descarga te recorre: aturdido 15 s. Rafa desaparece 1 min.');
    } else this.notice(c, 'info', 'Vuelves a tu cuerpo.');
  }
  /** Traslado del fantasma por una puerta: entra donde quiera, sin llaves ni permisos (y sin tocar la ficha del cuerpo). */
  ghostDoor(c: PlayerConn, door: Entity) {
    const g = this.ghosts.get(c);
    if (!g || !door.doorTo) return;
    const to = this.w.ensureZone(door.doorTo.zone);
    if (!to) return;
    const nx = door.doorTo.at[0] + 0.5, ny = door.doorTo.at[1] + 0.5;
    g.ghost.zone.remove(g.ghost); g.ghost.x = nx; g.ghost.y = ny; g.ghost.path = []; to.add(g.ghost);
    c.known.clear();
    this.w.send(c, { t: 'possess', you: g.ghost.id, zone: to.id, x: nx, y: ny, ghost: true });
  }
  /** Pulso EMP: si alcanza al fantasma o al cuerpo, os desconecta y te aturde. */
  emp(zoneId: string, x: number, y: number, r: number, except?: PlayerConn) {
    for (const [c, g] of [...this.ghosts]) {
      if (c === except) continue;
      const near = (e: Entity) => e.zone.id === zoneId && Math.hypot(e.x - x, e.y - y) <= r;
      if (near(g.ghost) || near(g.body)) this.endGhost(c, true);
    }
  }

  // ================================================================ Kairós
  toggleKairos(c: PlayerConn, tier: number) {
    const p = c.p!, e = this.bodyOf(c);
    if (this.ghosts.has(c)) throw new GameError('Ahora mismo eres una proyección.');
    if (p.kairos) {
      p.kairos = undefined; e.kairosTier = undefined; e.labelVer++;
      p.stamina = 0; p.buffs.exhausto = Date.now() + 5000 + tier * 1500;
      this.notice(c, 'warn', 'Kairós apagado. El mundo vuelve a su velocidad… y tu cuerpo lo paga: estás exhausto.');
      return;
    }
    if (p.status !== 'alive' || p.sleeping) throw new GameError('Ahora no.');
    if ((p.buffs.exhausto ?? 0) > Date.now()) throw new GameError('Aún estás exhausto: tu columna necesita unos segundos.');
    p.kairos = { tier, since: Date.now() };
    e.kairosTier = tier; e.labelVer++;
    const k = kairosOf(tier);
    this.notice(c, 'good', k.radius ? `KAIRÓS: todo a tu alrededor (${k.radius} m) se mueve a cámara lenta. Gasta ${k.ramPerSec} de RAM por segundo; sin RAM, te quema la salud.` : 'KAIRÓS: te mueves más rápido. Gasta RAM; sin ella, te quema la salud.');
  }
  /** Cada tick: escala de tiempo de cada entidad según las zonas Kairós activas (y la de quien lo lleva). */
  dilation() {
    const fields: { e: Entity; tier: number }[] = [];
    for (const c of this.w.conns.values()) { const p = c.p; if (p?.kairos && c.e) fields.push({ e: this.bodyOf(c), tier: p.kairos.tier }); }
    for (const e of this.w.entities.values()) if (e.kind === 'npc' && e.kairosTier && e.state !== 'downed' && !e.dead) fields.push({ e, tier: e.kairosTier });
    const next = new Set<Entity>();
    for (const f of fields) {
      const k = kairosOf(f.tier);
      const own = f.e;
      let ownScale = k.boost;
      // ¿Está el usuario dentro de la zona de otro Kairós más fuerte?
      for (const g of fields) if (g !== f && g.e.zone === own.zone && g.tier > f.tier && Math.hypot(g.e.x - own.x, g.e.y - own.y) <= kairosOf(g.tier).radius) ownScale = Math.min(ownScale, k.boost * kairosScale(g.tier, f.tier));
      own.timeScale = Math.min(own.timeScale && next.has(own) ? own.timeScale : Infinity, ownScale);
      next.add(own);
      if (!k.radius) continue;
      for (const o of own.zone.query(own.x, own.y, k.radius)) {
        if (o === own || (o.kind !== 'npc' && o.kind !== 'player')) continue;
        const theirs = fields.find((x) => x.e === o)?.tier ?? 0;
        if (theirs >= f.tier) continue;
        const s = kairosScale(f.tier, theirs) * (theirs ? kairosOf(theirs).boost : 1);
        o.timeScale = next.has(o) ? Math.min(o.timeScale ?? 1, s) : s;
        next.add(o);
      }
    }
    for (const e of this.scaled) if (!next.has(e)) e.timeScale = undefined;
    // Avisar al cliente propio cuando cambia su velocidad (para que la predicción no se desajuste).
    for (const c of this.w.conns.values()) {
      const e = c.e;
      if (!e) continue;
      const v = Math.round(e.speed * (e.timeScale ?? 1) * 1000) / 1000;
      if (c.sentScaled !== v) { c.sentScaled = v; this.w.send(c, { t: 'selfSpeed', v, guard: !!e.guard }); }
    }
    this.scaled = next;
  }

  // ================================================================ cada segundo
  everySecond() {
    const now = Date.now();
    for (const c of this.w.conns.values()) {
      const p = c.p, e = c.e;
      if (!p || !e) continue;
      const mats = this.equipped(p);
      // CARMÍN: corta cualquier hemorragia (no cura las heridas).
      if (mats.includes('matriz-carmin') && p.body.bleed > 0) { p.body.bleed = 0; e.labelVer++; }
      // Proyección: se acaba a los 5 min.
      const g = this.ghosts.get(c);
      if (g && now > g.until) this.endGhost(c, false);
      // Kairós: devora RAM; sin RAM, la salud.
      if (p.kairos) {
        const k = kairosOf(p.kairos.tier);
        if (p.status !== 'alive') { p.kairos = undefined; this.bodyOf(c).kairosTier = undefined; continue; }
        p.ram = Math.max(0, p.ram - k.ramPerSec);
        if (p.ram <= 0) {
          p.hp -= k.hpPerSec;
          if (now - (c.kairosWarnAt ?? 0) > 6000) { c.kairosWarnAt = now; this.notice(c, 'bad', `¡Sin RAM! El Kairós te está quemando los nervios (−${k.hpPerSec}/s). Apágalo.`); }
          if (p.hp <= 0) { p.kairos = undefined; this.bodyOf(c).kairosTier = undefined; this.w.survival.downed(c, 'el acelerador Kairós le ha quemado los nervios', p, this.bodyOf(c), true); }
        }
        this.w.threats.psychoGain(c, p, k.psyPerSec, true);
      }
    }
  }
}
