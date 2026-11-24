// Cerebros de PNJ: lógica compartida con parámetros (horario, deambular, multitud). Decisiones escalonadas a 4 Hz cerca y 1 Hz lejos.
import { facingToIdx, nearestWalkable, pedestrianGrid, seededRng, isWalkable, type NpcDef } from '@vertice/shared';
import type { Entity } from './entity.js';
import type { World } from './world.js';

export type NpcState = 'rest' | 'travel' | 'work' | 'talk' | 'alert' | 'search' | 'combat' | 'retreat';

export interface NpcBrain {
  type: 'scheduled' | 'ambient';
  localCrowd?: boolean;
  state: NpcState;
  nextThink: number;
  def?: NpcDef;
  rng: () => number;
  pauseUntil: number;
  temperament?: 'cauto'|'curioso'|'cordial'|'seco'|'metodico'|'nervioso';
  home?: [number, number]; radius?: number; // multitud: zona de interés acotada
}

const STATE_LABEL: Record<NpcState, string> = { rest: 'Descansando', travel: 'De camino', work: 'Trabajando', talk: 'Conversando', alert: 'Alerta', search: 'Buscando', combat: 'En combate', retreat: 'Retirándose' };

export function scheduledBrain(def: NpcDef, seed: number): NpcBrain {
  return { type: 'scheduled', state: 'travel', nextThink: 0, def, rng: seededRng(seed), pauseUntil: 0 };
}
/** v0.9 · Rutinas de los transeúntes: de día y de noche. */
interface Routine { label: string; len: [number, number]; lines?: string[]; dance?: string }
const DAY_ROUTINES: Routine[] = [
  { label: 'Hablando por teléfono', len: [80, 200], lines: ['¿Que no llega el pago? ¡Me debes tres semanas!', 'Sí, mamá, estoy comiendo bien.', 'Te llamo luego, hay un tío raro mirándome.', 'No, no, el chip nuevo funciona de lujo.'] },
  { label: 'Haciendo fotos', len: [40, 90], lines: ['Esta luz es perfecta.', '¡Sonríe!'] },
  { label: 'Repartiendo folletos', len: [100, 220], lines: ['¡Implantes dentales a mitad de precio!', 'Nueva tienda de ramen en el Canal, ¡pruébala!', '¡Vota no a la ley de cámaras!'] },
  { label: 'Haciendo ejercicio', len: [80, 160] },
  { label: 'Pidiendo limosna', len: [150, 300], lines: ['¿Unos eurodólares para un café?', 'Perdí el brazo en la fábrica. Ayúdame.'] },
  { label: 'Discutiendo', len: [60, 140], lines: ['¡Eso no es lo que dijiste!', '¿Me estás llamando mentiroso?', '¡Devuélveme mi dinero!'] },
  { label: 'Paseando al perro robot', len: [60, 120], lines: ['¡Bit, deja eso!', 'Buen chico… creo.'] },
  { label: 'Esperando el bus', len: [100, 200], lines: ['Siempre llega tarde.'] },
  { label: 'Bailando con auriculares', len: [60, 140], dance: 'rebote' },
  { label: 'Predicando', len: [120, 240], lines: ['¡La carne es débil, el cromo es eterno!', 'El fin de la red está cerca.', 'Arrepentíos de vuestros implantes.'] },
];
const NIGHT_ROUTINES: Routine[] = [
  { label: 'Bebiendo en la acera', len: [100, 240], lines: ['Una más y me voy.', '¿Tienes fuego?'] },
  { label: 'Bailando', len: [80, 160], dance: 'neon' },
  { label: 'Haciendo pintadas', len: [120, 260], lines: ['Que no te vea la PCV…'] },
  { label: 'Vigilando la esquina', len: [140, 300], lines: ['¿Buscas algo?', 'Sigue andando.'] },
  { label: 'Discutiendo a gritos', len: [60, 140], lines: ['¡Lárgate de mi esquina!', '¡Te voy a reventar el cromo!', '¡Llama a la policía, a ver si vienen!'] },
  { label: 'Fumando en un portal', len: [100, 200] },
  { label: 'Buscando un taxi', len: [60, 120], lines: ['¡Taxi! ¡Eh, taxi!'] },
  { label: 'Cantando borracho', len: [80, 160], lines: ['♪ Neón en los ojos, ruido en el corazón ♪', '♪ Vértice, Vértice, ciudad sin final ♪'], dance: 'onda' },
  { label: 'Trapicheando', len: [100, 220], lines: ['Psst. Neblina, de la buena.', 'Chips sin licencia, baratos.'] },
];
export function ambientBrain(seed: number, home?: [number, number], radius?: number): NpcBrain {
  const temperament=(['cauto','curioso','cordial','seco','metodico','nervioso'] as const)[(seed>>>0)%6];
  return { type:'ambient', state:'travel',nextThink:0,rng:seededRng(seed),pauseUntil:0,home,radius,temperament };
}

const ROUTINES=new Map([...DAY_ROUTINES,...NIGHT_ROUTINES].map(r=>[r.label,r]));
function setState(w: World, e: Entity, s: NpcState, label?: string) {
  const b = e.npc!;
  const l = label ?? STATE_LABEL[s];
  b.state = s;
  if (e.label !== l) { e.label = l; e.labelVer++; }
  void w;
}

export function thinkNpc(w: World, e: Entity) {
  const b = e.npc!;
  // Prioridad: derribo > huida > peligro inmediato (combate) > orden válida > rutina.
  if (w.combat.npcThink(e)) return;
  if (e.talkingUntil && e.talkingUntil > w.tick) { if (e.path.length) { e.path = []; } setState(w, e, 'talk', 'Conversando'); return; }
  if(w.cityPeople.think(e))return;
  if (b.type === 'scheduled') return thinkScheduled(w, e);
  return thinkAmbient(w, e);
}

function thinkScheduled(w: World, e: Entity) {
  const b = e.npc!, def = b.def!;
  const h = w.cityHour();
  const entry = def.schedule.find((s) => (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to))!;
  if (e.zone.id !== entry.zone) {
    // Buscar puerta directa a la zona destino o, si no hay, cualquier salida (hacia el exterior).
    const doors = e.zone.def.doors;
    const door = doors.find((d) => d.to.zone === entry.zone) ?? doors[0];
    if (!door) return;
    const dx = door.at[0] + 0.5, dy = door.at[1] + 0.5;
    if (Math.hypot(e.x - dx, e.y - dy) < 0.7) { w.transferNpc(e, door.to.zone, door.to.at); return; }
    if (!e.path.length) { if (!w.npcPath(e, dx, dy)) return; }
    setState(w, e, 'travel', `De camino: ${entry.label.toLowerCase()}`);
    return;
  }
  const stop = nearestWalkable(pedestrianGrid(e.zone.grid, 'stop'), entry.at[0] + .5, entry.at[1] + .5, 8);
  if (!stop) return;
  const { x: tx, y: ty } = stop;
  if (Math.hypot(e.x - tx, e.y - ty) > 0.6) {
    if (!e.path.length) w.npcPath(e, tx, ty);
    setState(w, e, 'travel', `De camino: ${entry.label.toLowerCase()}`);
  } else {
    setState(w, e, entry.state, entry.label);
  }
}

function thinkAmbient(w: World, e: Entity) {
  const b = e.npc!;
  if (e.path.length) return;
  // v0.13 · Llegó a un mueble con tarea (banco, máquina, parada…): la hace durante un rato.
  if (e.goal) { const len = w.street.arrive(e); b.pauseUntil = w.tick + len; b.state = 'rest'; return; }
  if (b.pauseUntil > w.tick) return;
  // Paradas variadas y naturales: mirar el móvil, un escaparate, charlar, fumar…; a veces solo un respiro.
  // v0.9 · Muchas más rutinas, distintas de día y de noche, algunas con frase en bocadillo o con baile.
  if (e.emote && e.emote.move !== 'nausea') { e.emote = undefined; e.labelVer++; }
  // v0.13 · A veces usa el mobiliario de alrededor (sentarse, la máquina, la basura, la parada, fumar junto a la farola).
  if (b.state === 'travel' && b.rng() < 0.22 && w.street.pickEnvironment(e)) return;
  const temper=e.npcType==='civil'?b.temperament:undefined;
  const social=temper==='cordial'||temper==='curioso',careful=temper==='cauto'||temper==='nervioso';
  if (b.state === 'travel' && b.rng() < (social?.59:careful?.41:.5)) {
    const night = (() => { const h = w.cityHour(); return h >= 21 || h < 6; })();
    const pool = night ? NIGHT_ROUTINES : DAY_ROUTINES;
    const r = social?.25+b.rng()*.75:b.rng();
    const [len, label] = r < 0.25 ? [10 + b.rng() * 25, 'Paseando'] : r < 0.4 ? [40 + b.rng() * 80, 'Mirando el móvil'] : r < 0.5 ? [60 + b.rng() * 100, 'Mirando escaparates'] : r < 0.62 ? [60 + b.rng() * 140, 'Charlando'] : r < 0.7 ? [80 + b.rng() * 120, 'Fumando']
      : (() => { const x = pool[Math.floor(b.rng() * pool.length)]; return [x.len[0] + b.rng() * (x.len[1] - x.len[0]), x.label] as [number, string]; })();
    b.pauseUntil = w.tick + Math.floor(len);
    const routine = ROUTINES.get(label);
    if (routine?.dance) { e.emote = { move: routine.dance as any, at: Date.now() }; e.labelVer++; }
    if (routine?.lines && b.rng() < 0.6) { const line = routine.lines[Math.floor(b.rng() * routine.lines.length)]; for (const o of e.zone.query(e.x, e.y, 18)) if (o.kind === 'player' && o.conn) w.send(o.conn, { t: 'speech', id: e.id, text: line }); }
    // Busca alguien cerca con quien charlar: se giran el uno hacia el otro.
    // v0.13 · …y charlan de verdad: frase, respuesta y réplica, con gestos.
    if (label === 'Charlando') for (const o of e.zone.query(e.x, e.y, 2.5)) if (o !== e && o.kind === 'npc' && o.npc?.type === 'ambient' && !o.path.length && !o.goal) { if (o.npc) o.npc.pauseUntil = b.pauseUntil; w.street.converse(e, o); break; }
    setState(w, e, label === 'Charlando' ? 'talk' : 'rest', label);
    return;
  }
  let tx: number, ty: number;
  if (b.home) {
    const r = b.radius ?? 10;
    const p = nearestWalkable(e.zone.grid, b.home[0] + (b.rng() * 2 - 1) * r, b.home[1] + (b.rng() * 2 - 1) * r, 3);
    if (!p) return;
    tx = p.x; ty = p.y;
  } else {
    const wps = e.zone.def.waypoints;
    if (!wps.length) return;
    const wp = wps[Math.floor(b.rng() * wps.length)];
    tx = wp[0] + 0.5 + (b.rng() - 0.5) * 0.8; ty = wp[1] + 0.5 + (b.rng() - 0.5) * 0.8;
    if (!isWalkable(e.zone.grid, tx, ty)) { tx = wp[0] + 0.5; ty = wp[1] + 0.5; }
  }
  if (w.npcPath(e, tx, ty)) setState(w, e, 'travel', 'Paseando');
}
