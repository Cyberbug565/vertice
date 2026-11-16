// v0.8 · Las tres leyendas de Vértice (personajes originales): Iris «Fantasma» Kuro (netrunner), Sable (mercenaria)
// y Teo «Cometa» Marlín (líder de los Saqueadores). Están escondidas; hay que ganarse a su gente para que te reciban,
// y su confianza con encargos cada vez más duros. Cada una lleva a un objeto mítico único.
// También: entrar y salir del ciberespacio (sillas de inmersión, cuna neural) y el acceso al Velo.
import { randomUUID } from 'node:crypto';
import { MATRICES, nearestWalkable, type LegendView } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import type { PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';
import type { Zone } from './zone.js';
import { ambientBrain } from './npc.js';

type Goal = { type: 'hack'; n: number } | { type: 'visit'; zone: string } | { type: 'kill'; n: number; faction?: string; npcType?: string } | { type: 'bounty'; min: number } | { type: 'boss'; boss: string };
interface Step { title: string; desc: string; goal: Goal; money?: number; item?: string; cyber?: string; trust: number }
interface BossDef { name: string; zone: string; district?: string; at?: [number, number]; hp: number; def: number; weapon: string; faction: string; minions: number; minionHp?: number; kairos?: number; elite?: number; level: number }
interface LegendDef { id: string; npc: string; name: string; role: string; color: string; env: { faction: string; rep: number; altNet?: number; altLevel?: number; altRep?: [string, number] }; hint: string; gate: string; steps: Step[]; final: string }

export const BOSSES: Record<string, BossDef> = {
  cazador: { name: 'Ícaro, cazador de Halcón', zone: 'vertice', district: 'cenit', hp: 380, def: 16, weapon: 'pistola-inteligente', faction: 'halcon', minions: 2, level: 18 },
  carmin: { name: 'CARMÍN', zone: 'velo', at: [52, 20], hp: 2800, def: 20, weapon: 'canon-sonico', faction: 'ias-velo', minions: 4, minionHp: 220, level: 25 },
  convoy: { name: 'Brutus, jefe del convoy', zone: 'vertice', district: 'forja', hp: 480, def: 16, weapon: 'ametralladora-rotativa', faction: 'marea', minions: 3, level: 19 },
  goliat: { name: 'GOLIAT', zone: 'torre-okami-p5', at: [15, 7], hp: 3200, def: 21, weapon: 'ametralladora-rotativa', faction: 'okami', minions: 3, minionHp: 260, level: 25 },
  campeon: { name: 'Hiena, campeona del Yermo', zone: 'vertice', district: 'descampado-norte', hp: 520, def: 17, weapon: 'escopeta-tecnologica', faction: 'nomadas-polvo', minions: 3, level: 20 },
  titan: { name: 'TITÁN', zone: 'torre-halcon-p7', at: [15, 7], hp: 3400, def: 21, weapon: 'katana-termica', faction: 'halcon', minions: 0, elite: 3, kairos: 5, level: 25 },
};

export const LEGENDS: LegendDef[] = [
  { id: 'iris', npc: 'leyenda-iris', name: 'Iris «Fantasma» Kuro', role: 'Netrunner legendaria', color: '#43f3ff', final: 'Matriz CARMÍN (mítica) y el acceso al Velo',
    env: { faction: 'red-bisagra', rep: 10, altNet: 3 }, hint: 'Dicen que una netrunner que nadie ha visto en años trabaja detrás de una puerta sin rótulo del Nodo del Vacío, en El Arrabal.',
    gate: 'Una voz por el intercomunicador: «No te conozco. Gánate a la Red Bisagra (o demuestra que sabes hackear: rango de red 3) y hablamos.»',
    steps: [
      { title: 'Manos limpias', desc: 'Demuéstrale que sabes: hackea con éxito a 5 personas.', goal: { type: 'hack', n: 5 }, money: 800, trust: 20 },
      { title: 'Bautismo de red', desc: 'Entra en el ciberespacio: silla de inmersión de un fixer, sala privada de una torre o tu propia cuna neural (aquí tienes la suya).', goal: { type: 'visit', zone: 'ciberespacio' }, money: 1500, item: 'ampliacion-zocalo', trust: 20 },
      { title: 'Limpieza de código', desc: 'Elimina 8 IAs salvajes en la Malla.', goal: { type: 'kill', n: 8, faction: 'ias-salvajes' }, money: 3000, item: 'matriz-espectro', trust: 25 },
      { title: 'El cazador', desc: 'Ícaro, netrunner de Halcón Dynamics, la está buscando. Está en Cénit. Que deje de buscar.', goal: { type: 'boss', boss: 'cazador' }, money: 5000, trust: 35 },
      { title: 'Más allá del Velo', desc: 'Iris te abre el Velo, al fondo de la Malla. Allí espera CARMÍN, la IA que se tragó a las demás. Ve equipado hasta las cejas.', goal: { type: 'boss', boss: 'carmin' }, item: 'matriz-carmin', trust: 0 },
    ] },
  { id: 'sable', npc: 'leyenda-sable', name: 'Sable', role: 'La mejor mercenaria de Vértice', color: '#ffd23f', final: 'Matriz ECO (mítica)',
    env: { faction: 'calle', rep: 20, altLevel: 8 }, hint: 'Cuentan que la mejor mercenaria de la ciudad duerme en la habitación del fondo del Motel Atardecer.',
    gate: 'Sable, sin abrir: «No trabajo con novatos. Hazte un nombre en la calle (reputación 20) o sube de nivel (8) y vuelve.»',
    steps: [
      { title: 'Cazarrecompensas', desc: 'Cobra una recompensa de al menos 800 €$.', goal: { type: 'bounty', min: 800 }, money: 1000, trust: 25 },
      { title: 'Cromo roto', desc: 'Neutraliza a un ciberpsicópata.', goal: { type: 'kill', n: 1, npcType: 'psycho' }, money: 4000, item: 'matriz-centinela', trust: 25 },
      { title: 'El convoy', desc: 'Brutus mueve un convoy de la Marea por Forja. Acaba con él y su escolta.', goal: { type: 'boss', boss: 'convoy' }, money: 6000, item: 'ampliacion-zocalo', trust: 30 },
      { title: 'El último trabajo', desc: 'GOLIAT, el verdugo cibernético de Okami, mató al mejor amigo de Sable. Está en la planta ejecutiva de la Torre Okami. Mátalo.', goal: { type: 'boss', boss: 'goliat' }, item: 'matriz-eco', trust: 0 },
    ] },
  { id: 'teo', npc: 'leyenda-teo', name: 'Teo «Cometa» Marlín', role: 'Líder de los Saqueadores', color: '#ff6a20', final: 'Kairós Experimental «Cometa» (mítico)',
    env: { faction: 'saqueadores', rep: 20, altRep: ['calle', 40] }, hint: 'El jefe de los Saqueadores tiene su garaje dentro de la base, en el Descampado Norte. Sin el permiso de su gente, ni te acerques.',
    gate: 'Dos Saqueadores te cortan el paso: «El Cometa no recibe a cualquiera. Gánate a la banda (reputación 20) o hazte famoso en la calle (40).»',
    steps: [
      { title: 'Hojas fuera', desc: 'Las Hojas Rojas le roban. Neutraliza a 5 de ellos.', goal: { type: 'kill', n: 5, faction: 'hojas-rojas' }, money: 1200, trust: 20 },
      { title: 'Chatarra', desc: 'Los Chatarreros le deben dinero. Cóbraselo a golpes: neutraliza a 5.', goal: { type: 'kill', n: 5, faction: 'chatarreros' }, money: 2000, trust: 20 },
      { title: 'La campeona', desc: 'Hiena, campeona del Yermo, lo ha retado. Gánale en el Descampado Norte.', goal: { type: 'boss', boss: 'campeon' }, money: 5000, cyber: 'kairos-3', trust: 30 },
      { title: 'Lo más alto', desc: 'Sube a la azotea de la Torre Halcón, la más alta de la ciudad. Arriba esperan su élite y TITÁN, un cíborg con un Kairós militar.', goal: { type: 'boss', boss: 'titan' }, cyber: 'kairos-6', trust: 0 },
    ] },
];

export class Legends {
  private bosses = new Map<string, Entity[]>(); // `${charId}:${boss}` → jefe y escoltas
  private jackFrom = new Map<string, { zone: string; at: [number, number] }>();
  constructor(private readonly w: World) {}
  private notice(c: PlayerConn | undefined, kind: 'info' | 'good' | 'warn' | 'bad', text: string) { if (c) this.w.send(c, { t: 'notice', kind, text }); }
  private state(p: PlayerState, id: string) { p.legends ??= {}; return (p.legends[id] ??= { trust: 0, step: 0, active: false, count: 0 }); }
  legendOfNpc(npcId: string) { return LEGENDS.find((l) => l.npc === npcId); }

  /** ¿Te dejan entrar? Guaridas: hay que ganarse a su gente. El Velo: solo con Iris en su último encargo (o después). */
  denyEntry(p: PlayerState, to: Zone): string | null {
    if (to.def.legend) { const L = LEGENDS.find((l) => l.id === to.def.legend); if (L && !this.welcome(p, L)) return L.gate; }
    if (to.id === 'velo' && !(p as any).admin) { const s = this.state(p, 'iris'); if (!(s.done || s.step >= 4)) return 'El Velo no se abre. Es una pared negra que respira. Solo alguien como Iris sabría abrirlo.'; }
    return null;
  }
  private welcome(p: PlayerState, L: LegendDef) {
    if ((p as any).admin || this.state(p, L.id).trust > 0) return true;
    const rep = (f: string) => p.rep.get(f) ?? 0;
    return rep(L.env.faction) >= L.env.rep || (L.env.altNet !== undefined && p.netRank >= L.env.altNet) || (L.env.altLevel !== undefined && p.level >= L.env.altLevel) || (!!L.env.altRep && rep(L.env.altRep[0]) >= L.env.altRep[1]);
  }

  view(p: PlayerState, L: LegendDef): LegendView {
    const s = this.state(p, L.id);
    const step = L.steps[s.step];
    return { id: L.id, name: L.name, role: L.role, color: L.color, trust: Math.min(100, s.trust), step: s.step, steps: L.steps.length, active: s.active, done: !!s.done,
      mission: step && !s.done ? { title: step.title, desc: step.desc, progress: this.progressText(step.goal, s.count), ready: false } : null,
      reward: step && !s.done ? [step.money ? `${step.money.toLocaleString('es-ES')} €$` : '', step.item ? this.w.c.items.find((i) => i.id === step.item)?.name ?? step.item : '', step.cyber ? this.w.c.cyberware.find((x) => x.id === step.cyber)?.name ?? step.cyber : '', step.trust ? `+${step.trust} de confianza` : ''].filter(Boolean).join(' · ') : '',
      final: L.final };
  }
  private progressText(g: Goal, n: number) {
    return g.type === 'hack' || g.type === 'kill' ? `${Math.min(n, g.n)}/${g.n}` : g.type === 'bounty' ? `Cobra una recompensa de ${g.min} €$ o más` : g.type === 'visit' ? 'Pendiente' : 'Encuentra al objetivo y acaba con él';
  }
  /** Al hablar con la leyenda: ver su encargo o aceptarlo. */
  open(c: PlayerConn, npcId: string) {
    const L = this.legendOfNpc(npcId);
    if (!L) return;
    const p = c.p!;
    const s = this.state(p, L.id);
    if (s.trust === 0 && s.step === 0 && !s.active) this.notice(c, 'info', `${L.name}: «Así que tú eres quien pregunta por mí. Veamos de qué estás hecho.»`);
    this.w.send(c, { t: 'legend', view: this.view(p, L), open: true });
  }
  async handle(c: PlayerConn, id: string, action: 'view' | 'accept') {
    const L = LEGENDS.find((l) => l.id === id);
    if (!L) throw new GameError('No conoces a esa persona.');
    const p = c.p!;
    const s = this.state(p, L.id);
    if (action === 'accept') {
      if (s.done) throw new GameError('Ya no te queda nada por hacer con ella.');
      const npc = [...c.e!.zone.entities].find((o) => o.legendId === L.npc);
      if (!npc || Math.hypot(npc.x - c.e!.x, npc.y - c.e!.y) > 4) throw new GameError(`Tienes que estar con ${L.name}.`);
      s.active = true; s.count = 0;
      const step = L.steps[s.step];
      this.notice(c, 'good', `Encargo aceptado: «${step.title}». ${step.desc}`);
      if (step.goal.type === 'visit' && L.id === 'iris') this.notice(c, 'info', 'Iris: «Usa mi silla, ahí al lado. Te veo dentro.»');
    }
    this.w.send(c, { t: 'legend', view: this.view(p, L), open: action === 'view' });
  }

  /** Avances de los encargos activos. */
  async event(c: PlayerConn, ev: { type: 'hack' } | { type: 'visit'; zone: string } | { type: 'kill'; faction?: string; npcType?: string } | { type: 'bounty'; amount: number } | { type: 'boss'; boss: string }) {
    const p = c.p!;
    for (const L of LEGENDS) {
      const s = this.state(p, L.id);
      if (!s.active || s.done) continue;
      const g = L.steps[s.step].goal;
      let done = false;
      if (g.type === 'hack' && ev.type === 'hack') done = ++s.count >= g.n;
      else if (g.type === 'visit' && ev.type === 'visit' && ev.zone === g.zone) done = true;
      else if (g.type === 'kill' && ev.type === 'kill' && (!g.faction || g.faction === ev.faction) && (!g.npcType || g.npcType === ev.npcType)) { done = ++s.count >= g.n; if (!done) this.notice(c, 'info', `${L.steps[s.step].title}: ${s.count}/${g.n}`); }
      else if (g.type === 'bounty' && ev.type === 'bounty' && ev.amount >= g.min) done = true;
      else if (g.type === 'boss' && ev.type === 'boss' && ev.boss === g.boss) done = true;
      if (done) await this.complete(c, L);
    }
  }
  private async complete(c: PlayerConn, L: LegendDef) {
    const p = c.p!;
    const s = this.state(p, L.id);
    const step = L.steps[s.step];
    s.active = false; s.count = 0; s.trust += step.trust;
    const lines: string[] = [];
    const effects: any[] = [];
    if (step.money) effects.push({ money: step.money, reason: `${L.name}: ${step.title}` });
    if (step.item) effects.push({ item: step.item, qty: 1 });
    if (effects.length) { const out = await this.w.effects.apply(p, effects, { opId: `leyenda-${L.id}-${s.step}-${randomUUID()}`, kind: 'legend' }); lines.push(...out.lines); }
    if (step.cyber) {
      const def = this.w.c.cyberware.find((x) => x.id === step.cyber)!;
      const instId = randomUUID();
      await this.w.db.query('INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen, history) VALUES ($1,$2,$3,$4,$5,$6)',
        [instId, def.id, p.charId, 'inventory', false, JSON.stringify([{ at: new Date().toISOString(), event: `regalo de ${L.name}` }])]);
      p.cyber.push({ id: instId, def: def.id, location: 'inventory', stolen: false });
      lines.push(`${def.name} (sin instalar: llévalo a un matasanos)`);
    }
    s.step++;
    if (s.step >= L.steps.length) { s.done = true; lines.push(`${L.name} te debe la vida. Eres leyenda.`); }
    const mythic = step.item && MATRICES[step.item]?.rarity === 'mitico' || step.cyber === 'kairos-6';
    this.w.send(c, { t: 'reward', title: s.done ? `★ ${L.name}: ${step.title}` : `${L.name}: ${step.title}`, lines: lines.length ? lines : ['Más confianza'] });
    if (mythic) for (const o of this.w.conns.values()) if (o !== c) this.notice(o, 'warn', `★ Se rumorea que ${p.name} ha conseguido algo único gracias a ${L.name}.`);
    this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
    this.w.send(c, { t: 'legend', view: this.view(p, L), open: false });
  }

  // ================================================================ jefes de los encargos
  private bossPos(b: BossDef, z: Zone) {
    if (b.at) return nearestWalkable(z.grid, b.at[0] + 0.5, b.at[1] + 0.5, 4);
    const d = z.def.districts.find((x) => x.id === b.district);
    if (!d) return null;
    const wp = d.waypoints[Math.floor(d.waypoints.length / 2)] ?? d.safePoint;
    return nearestWalkable(z.grid, wp[0] + 0.5, wp[1] + 0.5, 6);
  }
  spawnBoss(c: PlayerConn, L: LegendDef, bossId: string): Entity | null {
    const p = c.p!;
    const b = BOSSES[bossId];
    const z = this.w.ensureZone(b.zone);
    if (!z) return null;
    const pos = this.bossPos(b, z);
    if (!pos) return null;
    const boss = this.w.spawnNpc(z, { name: b.name, title: bossId === 'carmin' ? 'La IA que se tragó a las demás' : 'Objetivo de un encargo', x: pos.x, y: pos.y, label: 'Esperándote', speed: 2.8,
      appearance: bossId === 'carmin' ? { skin: '#f0d0d0', hair: '#ff2040', jacket: '#1a5a2a', accent: '#ff2040', build: 'alto', hairStyle: 'melena', top: 'gabardina' } as any
        : { skin: '#9aa0b0', hair: '#101010', jacket: '#1a1a1a', accent: '#ff3040', build: 'corpulento', hairStyle: 'rapado', top: 'chaleco', accessory: 'visor' } as any });
    boss.npcType = 'gang'; boss.faction = b.faction; boss.npcMax = b.hp; boss.npcHp = b.hp; boss.defense = b.def; boss.weaponId = b.weapon; boss.level = b.level;
    boss.chrome = ['cabeza', 'ojos', 'torso', 'brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der']; boss.lootTier = 5; boss.kairosTier = b.kairos;
    boss.legendBoss = { legend: L.id, step: this.state(p, L.id).step, owner: p.charId };
    boss.npc = ambientBrain(this.w.cfg.seed + boss.id, [Math.floor(pos.x), Math.floor(pos.y)], 3);
    const group = [boss];
    const add = (n: number, hp: number, label: string) => {
      for (let i = 0; i < n; i++) {
        const m = this.w.combat.spawnFactionNpc(z, b.faction, 'gang', [pos.x, pos.y, 3]);
        if (!m) continue;
        m.npcMax = hp; m.npcHp = hp; m.title = label; m.respawn = undefined; m.escortOf = boss.id; m.level = Math.min(25, b.level - 2);
        group.push(m);
      }
    };
    add(b.minions, b.minionHp ?? 140, `Escolta de ${b.name}`);
    if (b.elite) add(b.elite, 420, 'Guardia de élite');
    this.bosses.set(`${p.charId}:${bossId}`, group);
    this.notice(c, 'bad', bossId === 'carmin' ? 'Una risa en rojo y verde llena el Velo: «¿Vienes a por mí? Qué adorable.»' : `${b.name} te está esperando.`);
    return boss;
  }

  // ================================================================ ciberespacio
  jackIn(c: PlayerConn, source: 'silla' | 'casa', fee = 0) {
    const p = c.p!, e = c.e!;
    if (source === 'casa' && !e.zone.id.startsWith('casa:')) throw new GameError('La cuna neural solo funciona instalada en tu casa: úsala dentro de tu vivienda.');
    if (source === 'casa' && !p.houses.includes(e.zone.id.slice(5))) throw new GameError('Esta no es tu casa.');
    if (p.driving || p.sleeping) throw new GameError('Ahora no.');
    if (fee && p.money < fee) throw new GameError(`El fixer cobra ${fee} €$ por la sesión.`);
    this.jackFrom.set(p.charId, { zone: e.zone.id, at: [Math.floor(e.x), Math.floor(e.y)] });
    if (fee) void this.w.effects.apply(p, [{ money: -fee, reason: 'Sesión de inmersión' }], { opId: `inmersion-${randomUUID()}`, kind: 'jackin' }).then(() => this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) })).catch(() => {});
    const z = this.w.ensureZone('ciberespacio')!;
    this.notice(c, 'info', 'Te recuestas. Un pinchazo en la nuca. El mundo se deshace en líneas de código…');
    return this.w.teleport(c, 'ciberespacio', z.def.safePoint as [number, number]);
  }
  jackOut(c: PlayerConn) {
    const p = c.p!;
    const back = this.jackFrom.get(p.charId) ?? { zone: 'bloque9', at: this.w.zones.get('bloque9')!.def.safePoint as [number, number] };
    this.jackFrom.delete(p.charId);
    this.notice(c, 'info', 'Desconectas. Vuelves a sentir el peso de tu cuerpo.');
    return this.w.teleport(c, back.zone, back.at);
  }

  /** Cada segundo: aparecen los jefes cuando llegas a su sitio; si caen, el encargo se cumple. */
  async tick() {
    for (const c of this.w.conns.values()) {
      const p = c.p, e = c.e;
      if (!p || !e || e.ghostOf) continue;
      for (const L of LEGENDS) {
        const s = p.legends?.[L.id];
        if (!s?.active || s.done) continue;
        const g = L.steps[s.step].goal;
        if (g.type !== 'boss') continue;
        const key = `${p.charId}:${g.boss}`;
        const group = this.bosses.get(key);
        const b = BOSSES[g.boss];
        if (!group) {
          if (e.zone.id !== b.zone) continue;
          const pos = this.bossPos(b, e.zone);
          if (pos && (b.zone !== 'vertice' || Math.hypot(pos.x - e.x, pos.y - e.y) < 40)) this.spawnBoss(c, L, g.boss);
          continue;
        }
        const boss = group[0];
        if (boss.dead || boss.state === 'downed' || !this.w.entities.has(boss.id)) {
          for (const m of group.slice(1)) if (this.w.entities.has(m.id) && !m.dead) m.escortOf = undefined;
          this.bosses.delete(key);
          if (g.boss === 'carmin') this.notice(c, 'good', 'CARMÍN se descompone en fragmentos rojos y verdes… y uno de ellos se te mete en la cabeza.');
          await this.event(c, { type: 'boss', boss: g.boss });
        } else if (boss.aggro === undefined && boss.zone === e.zone && Math.hypot(boss.x - e.x, boss.y - e.y) < 14) { boss.aggro = e.id; boss.aggroLethal = true; for (const m of group) if (m.aggro === undefined) { m.aggro = e.id; m.aggroLethal = true; } }
      }
    }
  }
  /** Rumores de la calle: dónde se esconde alguna leyenda que aún no conoces. */
  rumor(p: PlayerState): string | null {
    const unknown = LEGENDS.filter((L) => !(p.legends?.[L.id]?.trust));
    if (!unknown.length) return null;
    return unknown[Math.floor(Math.random() * unknown.length)].hint;
  }
}
