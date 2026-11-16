// v0.7 · Amenazas de la ciudad:
//  - Recompensas que publica la propia ciudad cada cierto tiempo (con tope; las de los jugadores no tienen tope).
//    Cuanto más alta, más fuerte el objetivo, mejor botín y escoltas.
//  - Maleantes que atacan a la gente (más en zonas rojas y negras) y víctimas que huyen, se defienden o llaman a la policía.
//  - Policía que llega de forma orgánica (por cámaras o llamadas), tardando según la distancia a comisarías y patrullas.
//  - Ciberpsicópatas: jefes con cromo más allá del límite que matan todo lo que ven; su cadáver guarda cromo extraíble.
//  - Ciberpsicosis del jugador: pasarse del límite de cromo vuelve loco poco a poco (sin síntomas al principio).
import { randomUUID } from 'node:crypto';
import { dangerAt, nearestWalkable, type FugitiveDef } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { effective, skillLevel, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';
import type { Zone } from './zone.js';
import { ambientBrain } from './npc.js';

export const GAME_BOUNTY_CAP = 8;
const BOUNTY_EVERY_MS = 150_000;
const PSYCHO_CAP = 2;
const PSYCHO_EVERY_MS = 420_000;

const FIRST = ['Dax', 'Rook', 'Mina', 'Silas', 'Juno', 'Kuro', 'Vera', 'Brann', 'Nyx', 'Ozzy', 'Lupe', 'Tadeo', 'Ines', 'Raf', 'Cleo', 'Bruno', 'Sia', 'Gael'];
const ALIAS = ['«Tijeras»', '«Ratón»', '«Hielo»', '«La Viuda»', '«Chispa»', '«Mudo»', '«Diez Dedos»', '«Perro Viejo»', '«Cobalto»', '«Sin Cara»', '«Tuerto»', '«Lluvia»'];
const CRIMES = ['Atraco a mano armada', 'Robo de cromo a un hospital', 'Asesinato de un agente de la PCV', 'Tráfico de neblina', 'Secuestro exprés', 'Ataque a un convoy corporativo', 'Extorsión a comercios', 'Fuga de prisión', 'Robo de datos de Halcón Dynamics'];
const PSYCHO_NAMES = ['Kessler', 'Madre Óxido', 'El Carnicero de Kanal', 'Unidad 7', 'Vox', 'Sierra', 'Hambre', 'Doble Cero'];
const TIERS = [
  { min: 150, max: 500, hp: 70, def: 11, weapon: 'pistola-ligera', minions: 0 },
  { min: 500, max: 1500, hp: 120, def: 13, weapon: 'subfusil', minions: 1 },
  { min: 1500, max: 3500, hp: 190, def: 15, weapon: 'rifle-asalto', minions: 2 },
  { min: 3500, max: 8000, hp: 280, def: 17, weapon: 'escopeta-tecnologica', minions: 3 },
];
const STRONG_CHROME = ['piernas-salto', 'acelerador-neural', 'camuflaje-optico', 'cuchillas-antebrazo', 'puno-hidraulico', 'canon-antebrazo', 'reflejos-sobrealimentados', 'pulso-emp', 'piernas-propulsion', 'latigo-monofilamento', 'esqueleto-titanio', 'segundo-corazon', 'biomonitor-experimental'];
const INSULTS = ['¿Qué miras, saco de carne?', 'Apártate, carne.', 'Te oigo pensar. Cállate.', '¡Deja de mirarme!', 'Todos sois de plástico…', '¿Tú también me sigues?', 'Huele a miedo aquí.'];

interface Incident { zone: string; x: number; y: number; offender: number; at: number; eta: number; source: 'camara' | 'llamada' | 'patrulla'; lethal: boolean; units: number }

export class Threats {
  readonly gen = new Map<string, number>(); // recompensa generada → entidad del objetivo
  readonly psychos = new Set<number>();
  private incidents: Incident[] = [];
  private lastBounty = Date.now() - BOUNTY_EVERY_MS + 20_000;
  private lastPsycho = Date.now() - PSYCHO_EVERY_MS + 90_000;
  private n = 0;
  enabled = true;
  constructor(private readonly w: World, private readonly rng: () => number = Math.random) {}

  private get city(): Zone | undefined { return [...this.w.zones.values()].find((z) => z.def.kind === 'exterior' && z.def.districts?.length); }
  private notice(c: PlayerConn | undefined, kind: 'info' | 'good' | 'warn' | 'bad', text: string) { if (c) this.w.send(c, { t: 'notice', kind, text }); }
  private broadcast(kind: 'info' | 'good' | 'warn' | 'bad', text: string) { for (const c of this.w.conns.values()) this.notice(c, kind, text); }

  /** Al arrancar: las recompensas generadas de una sesión anterior ya no tienen objetivo; se retiran. */
  async init() {
    const stale = [...this.w.survival.bounties.active.values()].filter((b) => b.kind === 'npc' && b.targetNpc?.startsWith('gen-'));
    if (stale.length) await this.w.survival.bounties.cancel(stale.map((b) => b.id));
    const city = this.city;
    if (city) for (const d of city.def.districts) {
      // Maleantes: unos pocos en zonas peligrosas y alguno suelto en las vigiladas.
      const lvl = d.waypoints.length ? dangerAt(city.grid, d.waypoints[0][0], d.waypoints[0][1]) : 'public';
      const n = lvl === 'lawless' ? 4 : lvl === 'disputed' ? 3 : d.police ? 1 : 2;
      for (let i = 0; i < n; i++) this.spawnPredator(city, d.waypoints[Math.floor(this.rng() * d.waypoints.length)]);
    }
  }

  // ================================================================ recompensas generadas
  /** Cada cierto tiempo la ciudad publica una recompensa nueva (máximo GAME_BOUNTY_CAP a la vez). */
  async spawnBounty(force?: { tier?: number; at?: { x: number; y: number } }): Promise<Entity | null> {
    const city = this.city;
    if (!city || this.gen.size >= GAME_BOUNTY_CAP) return null;
    // Más probable en zonas peligrosas; en ellas, también más gordas.
    const ds = city.def.districts.filter((d) => d.waypoints.length);
    const weight = (d: typeof ds[number]) => { const l = dangerAt(city.grid, d.waypoints[0][0], d.waypoints[0][1]); return l === 'lawless' ? 4 : l === 'disputed' ? 3 : 1; };
    let r = this.rng() * ds.reduce((a, d) => a + weight(d), 0);
    const d = ds.find((x) => (r -= weight(x)) < 0) ?? ds[0];
    const wp = d.waypoints[Math.floor(this.rng() * d.waypoints.length)];
    const pos = force?.at ?? nearestWalkable(city.grid, wp[0] + 0.5, wp[1] + 0.5, 5);
    if (!pos) return null;
    const danger = dangerAt(city.grid, pos.x, pos.y);
    const roll = this.rng() + (danger === 'lawless' ? 0.15 : 0);
    const tier = force?.tier ?? (roll < 0.45 ? 0 : roll < 0.75 ? 1 : roll < 0.93 ? 2 : 3);
    const T = TIERS[tier];
    const amount = Math.round((T.min + this.rng() * (T.max - T.min)) / 10) * 10;
    const gangs = this.w.c.factions.filter((f) => f.kind === 'gang').map((f) => f.id);
    const faction = d.gangs[0]?.faction ?? gangs[Math.floor(this.rng() * gangs.length)];
    const f: FugitiveDef = {
      id: `gen-${Date.now().toString(36)}${this.n++}`, name: `${FIRST[Math.floor(this.rng() * FIRST.length)]} ${ALIAS[Math.floor(this.rng() * ALIAS.length)]}`,
      crime: CRIMES[Math.floor(this.rng() * CRIMES.length)], zone: city.id, area: [Math.floor(pos.x), Math.floor(pos.y), 6 + tier * 2], bounty: amount,
      hp: T.hp + Math.round(this.rng() * 30), defense: T.def, poster: tier >= 2 ? 'pcv' : this.rng() < 0.5 ? 'pcv' : faction, alive: this.rng() < 0.25, weapon: T.weapon,
      appearance: { skin: ['#f0c8a8', '#c89070', '#8a5a3c', '#5a3a24'][Math.floor(this.rng() * 4)], hair: ['#1a1a1a', '#c7e6fb', '#ff3fa4', '#5d2656'][Math.floor(this.rng() * 4)], jacket: ['#2a1a1a', '#1a2a3a', '#3a1a2a', '#202020'][Math.floor(this.rng() * 4)], accent: '#ff3040' },
    };
    this.w.c.fugitives.push(f);
    const boss = await this.w.survival.spawnFugitive(f);
    if (!boss) { this.w.c.fugitives.splice(this.w.c.fugitives.indexOf(f), 1); return null; }
    boss.lootTier = tier + 1; boss.level = Math.min(25, 6 + tier * 5); boss.chrome = tier >= 2 ? ['ojos', 'brazo_der'] : ['ojos'];
    boss.title = `Buscado/a · ${amount} €$`;
    this.gen.set(f.id, boss.id);
    // Escoltas: cuanto más vale la cabeza, más gente la protege.
    const escorts = T.minions + (this.rng() < 0.5 && tier ? 1 : 0);
    for (let i = 0; i < escorts; i++) {
      const m = this.w.combat.spawnFactionNpc(city, faction, 'gang', [pos.x, pos.y, 3]);
      if (!m) continue;
      m.escortOf = boss.id; m.title = `Escolta de ${f.name}`; m.label = 'Escoltando';
      m.npcMax = (m.npcMax ?? 40) + tier * 15; m.npcHp = m.npcMax; m.respawn = undefined;
    }
    const place = this.w.property.dname(this.w.districtOf(city, pos.x, pos.y));
    this.broadcast('warn', `🎯 Nueva recompensa: ${amount.toLocaleString('es-ES')} €$ por ${f.name} (${f.crime}${f.alive ? ', lo quieren VIVO' : ''}). Visto/a en ${place}${escorts ? ` con ${escorts} escolta${escorts > 1 ? 's' : ''}` : ''}.`);
    this.lastBounty = Date.now();
    return boss;
  }
  /** El objetivo ha caído o se lo han llevado: su recompensa generada deja de existir. */
  retire(fugitiveId: string) {
    this.gen.delete(fugitiveId);
    const i = this.w.c.fugitives.findIndex((f) => f.id === fugitiveId);
    if (i >= 0) this.w.c.fugitives.splice(i, 1);
  }

  // ================================================================ maleantes y víctimas
  spawnPredator(z: Zone, wp?: number[]) {
    const gangs = this.w.c.factions.filter((f) => f.kind === 'gang').map((f) => f.id);
    const at = wp ? nearestWalkable(z.grid, wp[0] + 0.5, wp[1] + 0.5, 4) : null;
    if (!at) return null;
    const e = this.w.combat.spawnFactionNpc(z, gangs[Math.floor(this.rng() * gangs.length)], 'gang', undefined, at);
    if (!e) return null;
    e.predator = true; e.title = 'Maleante'; e.respawn = { zone: z.id, template: { type: 'predator', near: at } } as any;
    return e;
  }
  /** Una víctima civil reacciona: huye (lo normal), planta cara o llama a la policía. */
  react(victim: Entity, attacker: Entity) {
    if (victim.state === 'downed' || victim.callingUntil) return;
    const r = this.rng();
    if (r < 0.2 && (victim.npcHp ?? 0) > (victim.npcMax ?? 35) * 0.5) {
      victim.aggro = attacker.id; victim.aggroLethal = false; victim.label = 'Plantando cara'; victim.labelVer++;
      this.say(victim, ['¡Déjame en paz!', '¿Tú qué te crees?', '¡Vas a ver!'][Math.floor(this.rng() * 3)]);
    } else if (r < 0.45) {
      victim.callingUntil = Date.now() + 4000; victim.path = []; victim.label = 'Llamando a la policía'; victim.labelVer++;
      this.say(victim, '¡Policía! ¡Me están atacando!');
      setTimeout(() => { victim.callingUntil = undefined; if (!victim.dead) { victim.fleeUntil = Date.now() + 15000; this.report(attacker, 'llamada'); } }, 4000);
    } else { victim.fleeUntil = Date.now() + 15000; victim.path = []; this.say(victim, ['¡Socorro!', '¡Que alguien me ayude!', '¡Corred!'][Math.floor(this.rng() * 3)]); }
  }
  private say(e: Entity, text: string) { for (const o of e.zone.query(e.x, e.y, 20)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'speech', id: e.id, text }); }
  /** Violencia en la calle: si una cámara lo ve, avisa a la PCV; los testigos también pueden llamar. */
  violence(attacker: Entity, victim: Entity) {
    if (dangerAt(attacker.zone.grid, attacker.x, attacker.y) === 'lawless') return;
    if (this.w.combat.cameraSees(attacker)) { this.report(attacker, 'camara'); return; }
    for (const o of attacker.zone.query(attacker.x, attacker.y, 10)) {
      if (o === victim || o === attacker || o.npcType !== 'civil' || o.state === 'downed' || o.callingUntil) continue;
      if (this.rng() < 0.25) { o.callingUntil = Date.now() + 5000; o.path = []; o.label = 'Llamando a la policía'; o.labelVer++; this.say(o, '¿PCV? ¡Hay un tiroteo aquí!'); setTimeout(() => { o.callingUntil = undefined; if (!o.dead) this.report(attacker, 'llamada'); }, 5000); return; }
    }
  }

  // ================================================================ policía: aviso, tiempo de llegada y respuesta
  /** Avisa a la PCV. Llega antes cuanto más cerca haya una patrulla o una comisaría. */
  report(offender: Entity, source: Incident['source']) {
    const z = offender.zone;
    if (z.def.kind !== 'exterior' || offender.dead || offender.state === 'downed') return;
    const now = Date.now();
    if (this.incidents.some((i) => i.offender === offender.id && now - i.at < 25_000)) return;
    const lvl = dangerAt(z.grid, offender.x, offender.y);
    if (lvl === 'lawless') return;
    // Patrullas cercanas acuden andando; si no, sale un coche patrulla desde la comisaría o la patrulla más próxima.
    const patrols = [...z.entities].filter((o) => o.npcType === 'police' && o.state !== 'downed' && o.aggro === undefined);
    const near = patrols.filter((o) => Math.hypot(o.x - offender.x, o.y - offender.y) < 26);
    const tp = this.w.playerOf(offender);
    const lethal = offender.npcType === 'psycho' || !!offender.predator || offender.npcType === 'fugitive' || tp?.identified?.crime === 'asesinato';
    for (const o of near.slice(0, 2)) { o.aggro = offender.id; o.aggroLethal = lethal; }
    const stations = z.def.doors.filter((d) => d.to.zone.startsWith('comisaria')).map((d) => ({ x: d.at[0], y: d.at[1] }));
    const far = [...patrols.filter((o) => !near.includes(o)).map((o) => ({ x: o.x, y: o.y })), ...stations];
    const d = far.length ? Math.min(...far.map((s) => Math.hypot(s.x - offender.x, s.y - offender.y))) : 300;
    const eta = Math.round(Math.max(8, Math.min(120, 6 + d / 5)));
    const units = offender.npcType === 'psycho' ? 4 : near.length ? 1 : 2;
    this.incidents.push({ zone: z.id, x: offender.x, y: offender.y, offender: offender.id, at: now, eta: now + eta * 1000, source, lethal, units });
    if (tp && offender.conn) this.notice(offender.conn, 'bad', source === 'camara' ? `📷 Una cámara te ha grabado: la PCV viene hacia aquí (llega en ~${eta} s).` : `📞 Alguien ha llamado a la PCV: llegarán en ~${eta} s.`);
    for (const o of z.query(offender.x, offender.y, 30)) if (o.kind === 'player' && o.conn && o !== offender) this.notice(o.conn, 'info', `Sirenas a lo lejos: la PCV llega en ~${eta} s.`);
  }
  private arrive(i: Incident) {
    const z = this.w.zones.get(i.zone);
    const offender = this.w.entities.get(i.offender);
    if (!z) return;
    const tx = offender && offender.zone === z && !offender.dead ? offender.x : i.x, ty = offender && offender.zone === z && !offender.dead ? offender.y : i.y;
    // Aparcan a unos metros y entran corriendo.
    for (let k = 0; k < i.units; k++) {
      // Buscan un sitio libre a unos metros (si no hay, más cerca).
      let at: { x: number; y: number } | null = null;
      for (let tries = 0; !at && tries < 10; tries++) {
        const ang = this.rng() * Math.PI * 2, r = Math.max(2, 12 - tries);
        at = nearestWalkable(z.grid, tx + Math.cos(ang) * r, ty + Math.sin(ang) * r, 5);
      }
      at ??= nearestWalkable(z.grid, tx, ty, 8);
      if (!at) continue;
      const cop = this.w.combat.spawnFactionNpc(z, 'pcv', 'police', undefined, at);
      if (!cop) continue;
      cop.dispatchedUntil = Date.now() + 120_000; cop.respawn = undefined; cop.label = 'Acudiendo al aviso';
      if (offender && offender.zone === z && !offender.dead && offender.state !== 'downed' && Math.hypot(offender.x - i.x, offender.y - i.y) < 40) { cop.aggro = offender.id; cop.aggroLethal = i.lethal; }
    }
    if (offender?.conn) this.notice(offender.conn, 'bad', '🚨 ¡La PCV ha llegado!');
  }

  // ================================================================ ciberpsicópatas
  async spawnPsycho(at?: { x: number; y: number }): Promise<Entity | null> {
    const city = this.city;
    if (!city || this.psychos.size >= PSYCHO_CAP) return null;
    const ds = city.def.districts.filter((d) => d.waypoints.length);
    const hard = ds.filter((d) => dangerAt(city.grid, d.waypoints[0][0], d.waypoints[0][1]) !== 'public');
    const d = (this.rng() < 0.85 && hard.length ? hard : ds)[Math.floor(this.rng() * (this.rng() < 0.85 && hard.length ? hard : ds).length)];
    const wp = d.waypoints[Math.floor(this.rng() * d.waypoints.length)];
    const pos = at ?? nearestWalkable(city.grid, wp[0] + 0.5, wp[1] + 0.5, 5);
    if (!pos) return null;
    const name = PSYCHO_NAMES[Math.floor(this.rng() * PSYCHO_NAMES.length)];
    const e = this.w.spawnNpc(city, { name: `Ciberpsicópata ${name}`, title: 'CIBERPSICOSIS', x: pos.x, y: pos.y, label: 'Fuera de control', speed: 3,
      appearance: { skin: '#9aa0b0', hair: '#101010', jacket: '#2a0a0a', accent: '#ff2020', build: 'corpulento', hairStyle: 'rapado', top: 'chaleco', accessory: 'visor' } as any });
    e.npcType = 'psycho'; e.npcMax = 650 + Math.round(this.rng() * 250); e.npcHp = e.npcMax; e.defense = 18; e.level = 25;
    e.weaponId = ['ametralladora-rotativa', 'katana-termica', 'canon-sonico', 'escopeta-tecnologica'][Math.floor(this.rng() * 4)];
    e.chrome = ['cabeza', 'ojos', 'torso', 'brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'];
    const pool = [...STRONG_CHROME].sort(() => this.rng() - 0.5);
    e.lootChrome = pool.slice(0, 3 + Math.floor(this.rng() * 2)).filter((id) => this.w.c.cyberware.some((c) => c.id === id));
    e.lootTier = 5;
    e.npc = ambientBrain(this.w.cfg.seed + e.id * 13, [Math.floor(pos.x), Math.floor(pos.y)], 12);
    this.psychos.add(e.id);
    const place = this.w.property.dname(this.w.districtOf(city, pos.x, pos.y));
    // Recompensa de la PCV: se cobra como la de cualquier fugitivo.
    const amount = 5000 + Math.round(this.rng() * 40) * 100;
    e.fugitive = { id: `psico-${e.id}`, name: e.name, crime: 'Ciberpsicosis', zone: city.id, area: [Math.floor(pos.x), Math.floor(pos.y), 12], bounty: amount, hp: e.npcMax, defense: e.defense, poster: 'pcv', alive: false, weapon: e.weaponId, appearance: e.appearance as any };
    await this.w.survival.bounties.post('npc', { npc: e.fugitive.id, name: e.name }, amount, 'pcv', 'Ciberpsicosis: neutralizar', false).catch(() => {});
    this.w.survival.updateMarker(e);
    this.broadcast('bad', `⚠ ALERTA MAX: ${e.name} ha perdido el control en ${place}. Mata todo lo que ve. Recompensa de la PCV por neutralizarlo.`);
    this.report(e, 'llamada');
    this.lastPsycho = Date.now();
    return e;
  }
  /** Cada segundo: el psicópata busca a alguien a quien matar. */
  private psychoBrain(e: Entity) {
    if (e.state === 'downed' || e.dead) return;
    const cur = e.aggro !== undefined ? this.w.entities.get(e.aggro) : undefined;
    const curOk = cur && cur.zone === e.zone && cur.state !== 'downed' && !cur.dead && Math.hypot(cur.x - e.x, cur.y - e.y) < 18 && (cur.kind !== 'player' || this.w.playerOf(cur)?.status === 'alive');
    if (curOk) return;
    let best: Entity | undefined, bd = 15;
    for (const o of e.zone.query(e.x, e.y, 15)) {
      if (o === e || (o.kind !== 'npc' && o.kind !== 'player') || o.state === 'downed' || o.dead || o.npcType === 'essential' || o.npcType === 'psycho') continue;
      if (o.kind === 'player' && (this.w.playerOf(o)?.status !== 'alive' || dangerAt(o.zone.grid, o.x, o.y) === 'protected')) continue;
      if (o.kind === 'npc' && !o.npcMax) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { e.aggro = best.id; e.aggroLethal = true; if (best.conn) this.notice(best.conn, 'bad', `⚠ ${e.name} va a por ti.`); }
  }
  /** Extraer cromo del cadáver de un ciberpsicópata: hace falta Reparación (4 por grado del implante). */
  async extract(c: PlayerConn, target: Entity, defId?: string) {
    const p = c.p!, e = c.e!;
    if (!target.dead || !target.lootChrome?.length) throw new GameError('No le queda cromo que se pueda aprovechar.');
    if (Math.hypot(target.x - e.x, target.y - e.y) > 2.5) throw new GameError('Acércate al cuerpo.');
    const id = defId && target.lootChrome.includes(defId) ? defId : target.lootChrome[0];
    const def = this.w.c.cyberware.find((x) => x.id === id)!;
    const need = def.grade * 4, have = skillLevel(p, 'reparacion');
    if (have < need) throw new GameError(`Extraer ${def.name} sin destrozarlo requiere Reparación ${need} (tienes ${have}).`);
    target.lootChrome = target.lootChrome.filter((x) => x !== id);
    const instId = randomUUID();
    await this.w.db.query('INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen, history) VALUES ($1,$2,$3,$4,$5,$6)',
      [instId, def.id, p.charId, 'inventory', false, JSON.stringify([{ at: new Date().toISOString(), event: `extraído del cadáver de ${target.name}` }])]);
    p.cyber.push({ id: instId, def: def.id, location: 'inventory', stolen: false });
    this.w.progress.gain(p, 'reparacion', 10 + def.grade * 4);
    this.w.send(c, { t: 'reward', title: `Extraes ${def.name}`, lines: [`Grado ${['I', 'II', 'III', 'IV', 'V'][def.grade - 1]} · ${def.desc}`, 'Un matasanos puede implantártelo (ojo con tu capacidad de cromo).'] });
    this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
  }

  // ================================================================ ciberpsicosis del jugador
  /** Sube la ciberpsicosis (con la resistencia de las matrices) y abre un episodio al cruzar el umbral. */
  psychoGain(c: PlayerConn, p: PlayerState, amount: number, kairos = false) {
    const ef = effective(this.w.c, p);
    if (ef.matrix.psyImmune || !p.psyche) return;
    const ps = p.psyche;
    const before = ps.level;
    ps.level = Math.min(100, ps.level + amount * ef.matrix.psyGain * (1 - ef.matrix.psyResist));
    if (before < 45 && ps.level >= 45 && !(ps.episode && ps.episode.until > Date.now())) this.startEpisode(c, p, kairos);
  }
  /** Episodio de ciberpsicosis: dura de 1 a 3 semanas de juego (horas reales). Mientras dura, el nivel no baja de su suelo. */
  private startEpisode(c: PlayerConn, p: PlayerState, kairos: boolean) {
    const ps = p.psyche;
    const day = this.w.c.manifest.cityHourMs * 24;
    ps.episodes = (ps.episodes ?? 0) + 1;
    const grave = ps.level >= 70 || ps.episodes >= 3;
    const days = kairos && !grave ? 1 + Math.floor(this.rng() * 2) : grave ? 14 + Math.floor(this.rng() * 8) : 7 + Math.floor(this.rng() * 8);
    ps.episode = { until: Date.now() + days * day, floor: grave ? 70 : 45, grave };
    const weeks = days >= 7 ? `${Math.round(days / 7 * 10) / 10} semanas` : `${days} día${days > 1 ? 's' : ''}`;
    this.notice(c, 'bad', grave
      ? `🧠 CIBERPSICOSIS GRAVE. Tu mente se rompe: durante ${weeks} de juego no volverás a ser tú. Pierdes el control a menudo. Solo bajar de cromo y aguantar te salvará.`
      : `🧠 EPISODIO DE CIBERPSICOSIS (${weeks} de juego). Las voces, la paranoia y la rabia no se irán aunque te quites cromo: tendrás que esperar a que pase.`);
  }
  private whisper(c: PlayerConn, lvl: number) {
    const soft = ['…te están mirando…', '¿Has oído eso?', 'El cromo zumba. Zumba. Zumba.', 'No es tu mano. ¿O sí?', 'Ese tipo sabe lo que hiciste.'];
    const hard = ['MÁTALOS ANTES DE QUE TE MATEN.', 'Tu piel es un error. Arráncala.', 'TODOS SON MÁQUINAS. TÚ TAMBIÉN.', 'Rompe algo. Lo que sea. YA.'];
    this.w.send(c, { t: 'notice', kind: lvl >= 70 ? 'bad' : 'warn', text: `🗯 ${(lvl >= 70 ? hard : soft)[Math.floor(this.rng() * (lvl >= 70 ? hard : soft).length)]}` });
  }
  private psyche(c: PlayerConn, p: PlayerState, e: Entity) {
    if (p.status !== 'alive' || !p.psyche) return;
    const ef = effective(this.w.c, p);
    const ps = p.psyche;
    if (ef.matrix.psyImmune) { if (ps.level > 0 || ps.episode) { ps.level = 0; ps.episode = undefined; this.notice(c, 'good', 'Rafa: «Tranquilo, chaval. Esas voces ya no te tocan.»'); } return; }
    const over = ef.chromeUsed - ef.chromeCapacity;
    const lowHum = p.humanity < 15 ? (15 - p.humanity) / 5 : 0;
    const now = Date.now();
    const inEpisode = !!ps.episode && ps.episode.until > now;
    if (ps.episode && !inEpisode) { ps.episode = undefined; this.notice(c, 'good', '🧠 El episodio de ciberpsicosis remite. Por fin silencio.'); }
    if (over > 0 || lowHum > 0) this.psychoGain(c, p, Math.max(0, over) * 0.025 + lowHum * 0.02 + 0.01);
    else ps.level = Math.max(inEpisode ? ps.episode!.floor : 0, ps.level - (ps.level > 60 ? 0.015 : 0.035));
    if (inEpisode) ps.level = Math.max(ps.level, ps.episode!.floor);
    if (ps.level > 50) ps.heavy += 1;
    ps.peak = Math.max(ps.peak, ps.level);
    if (ps.level <= 0) { ps.peak = 0; ps.heavy = Math.max(0, ps.heavy - 1); }
    const lvl = ps.level;
    // Síntomas que se notan: susurros desde 15, insultos desde 25, empujones desde 45, disparos solos desde 70.
    if (lvl >= 15 && this.rng() < (lvl >= 70 ? 0.05 : lvl >= 45 ? 0.03 : 0.012)) this.whisper(c, lvl);
    if (dangerAt(e.zone.grid, e.x, e.y) === 'protected' || p.sleeping || e.transit || e.ghostOf) return;
    if (lvl < 25) return;
    const pick = () => [...e.zone.query(e.x, e.y, lvl >= 70 ? 9 : 4)].filter((o) => o !== e && (o.kind === 'npc' || o.kind === 'player') && o.state !== 'downed' && !o.dead && o.npcType !== 'essential' && (o.kind === 'player' || !!o.npcMax));
    if (this.rng() < (lvl < 45 ? 0.02 : 0.04)) {
      const t = pick()[0];
      if (t) for (const o of e.zone.query(e.x, e.y, 20)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'speech', id: e.id, text: INSULTS[Math.floor(this.rng() * INSULTS.length)] });
    }
    if (lvl >= 45 && this.rng() < (lvl >= 85 ? 0.08 : lvl >= 70 ? 0.045 : 0.018) && Date.now() >= p.nextAttackAt) {
      const ts = pick();
      const t = ts[Math.floor(this.rng() * ts.length)];
      if (t) {
        const lethal = lvl >= 70;
        this.notice(c, 'bad', lethal ? `Tus manos se mueven solas: ¡atacas a ${t.name}!` : `Sin saber por qué, la tomas con ${t.name}.`);
        void this.w.combat.attack(c, t, lethal, `psicosis-${randomUUID()}`).catch(() => {});
      }
    }
  }
  /** Al quitarse cromo tras mucho tiempo con ciberpsicosis, el cuerpo tolera menos cromo durante un tiempo. */
  onRemoval(c: PlayerConn) {
    const p = c.p!;
    const ps = p.psyche;
    if (!ps || (ps.heavy < 120 && !(ps.episode && ps.episode.until > Date.now()))) return;
    const amount = Math.round(Math.min(10, 2 + ps.peak / 12 + ps.heavy / 600));
    const ms = Math.round(Math.min(90, 10 + ps.heavy / 60) * 60_000);
    ps.debuff = { amount, until: Date.now() + ms };
    ps.heavy = Math.round(ps.heavy / 2);
    this.notice(c, 'bad', `Tu cuerpo rechaza el cambio: tras tanto tiempo con ciberpsicosis, tu capacidad de cromo baja ${amount} puntos durante ${Math.round(ms / 60000)} min.`);
  }

  // ================================================================ cada segundo
  async tick() {
    if (!this.enabled) return;
    const now = Date.now();
    // Recompensas: limpiar las que ya no tienen objetivo y publicar nuevas.
    for (const [fid, eid] of this.gen) {
      const e = this.w.entities.get(eid);
      if (!e || e.dead || !e.fugitive) {
        const left = this.w.survival.bounties.onNpc(fid);
        if (left.length) await this.w.survival.bounties.cancel(left.map((b) => b.id)).catch(() => {});
        this.retire(fid);
      }
    }
    if (this.w.conns.size && now - this.lastBounty > BOUNTY_EVERY_MS) await this.spawnBounty();
    if (this.w.conns.size && now - this.lastPsycho > PSYCHO_EVERY_MS) await this.spawnPsycho();
    // Escoltas: siguen a su objetivo y lo defienden.
    for (const z of this.w.zones.values()) for (const e of z.entities) {
      if (e.escortOf !== undefined && e.state !== 'downed' && !e.dead) {
        const boss = this.w.entities.get(e.escortOf);
        if (!boss || boss.dead) { e.escortOf = undefined; e.label = ''; continue; }
        if (boss.lastHitBy !== undefined && now - (boss.lastHitAt ?? 0) < 10_000 && e.aggro === undefined) { e.aggro = boss.lastHitBy; e.aggroLethal = true; }
        if (e.aggro === undefined && Math.hypot(boss.x - e.x, boss.y - e.y) > 5 && !e.path.length) this.w.npcPath(e, boss.x + (this.rng() - 0.5) * 2, boss.y + (this.rng() - 0.5) * 2);
      }
      // Maleantes: de vez en cuando eligen una víctima (más de noche y en zonas peligrosas).
      if (e.predator && e.aggro === undefined && e.state !== 'downed' && !e.dead && z.players.size && z.isActive(e)) {
        const lvl = dangerAt(z.grid, e.x, e.y);
        const h = this.w.cityHour();
        const night = h >= 21 || h < 5;
        const p0 = (lvl === 'lawless' ? 0.03 : lvl === 'disputed' ? 0.02 : 0.006) * (night ? 2 : 1);
        if (this.rng() < p0) {
          const victims = [...z.query(e.x, e.y, 9)].filter((o) => o !== e && o.state !== 'downed' && !o.dead && ((o.npcType === 'civil' && o.npcMax) || (o.kind === 'player' && this.w.playerOf(o)?.status === 'alive' && dangerAt(z.grid, o.x, o.y) !== 'protected' && this.rng() < 0.35)));
          const v = victims[Math.floor(this.rng() * victims.length)];
          if (v) { e.aggro = v.id; e.aggroLethal = true; e.label = 'Atacando'; e.labelVer++; if (v.conn) this.notice(v.conn, 'bad', `${e.name} viene a por ti con malas intenciones.`); else this.react(v, e); this.violence(e, v); }
        }
      }
      if (e.npcType === 'psycho') { if (e.dead) this.psychos.delete(e.id); else this.psychoBrain(e); }
      // Patrullas enviadas: se retiran cuando acaba el aviso y no hay nadie mirando.
      if (e.dispatchedUntil && now > e.dispatchedUntil && e.aggro === undefined && !e.dead && ![...z.query(e.x, e.y, 22)].some((o) => o.kind === 'player')) this.w.removeEntity(e);
    }
    for (const id of [...this.psychos]) if (!this.w.entities.has(id)) this.psychos.delete(id);
    // Avisos a la PCV: llega cuando toca.
    for (const i of [...this.incidents]) if (now >= i.eta) { this.incidents.splice(this.incidents.indexOf(i), 1); this.arrive(i); }
    // Ciberpsicosis de los jugadores.
    for (const c of this.w.conns.values()) if (c.p && c.e && !c.closed) this.psyche(c, c.p, c.e);
  }
}
