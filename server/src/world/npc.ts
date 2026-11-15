// Cerebros de PNJ: lógica compartida con parámetros (horario, deambular, multitud). Decisiones escalonadas a 4 Hz cerca y 1 Hz lejos.
import { nearestWalkable, seededRng, isWalkable, type NpcDef } from '@vertice/shared';
import type { Entity } from './entity.js';
import type { World } from './world.js';

export type NpcState = 'rest' | 'travel' | 'work' | 'talk' | 'alert' | 'search' | 'combat' | 'retreat';

export interface NpcBrain {
  type: 'scheduled' | 'ambient';
  state: NpcState;
  nextThink: number;
  def?: NpcDef;
  rng: () => number;
  pauseUntil: number;
  home?: [number, number]; radius?: number; // multitud: zona de interés acotada
}

const STATE_LABEL: Record<NpcState, string> = { rest: 'Descansando', travel: 'De camino', work: 'Trabajando', talk: 'Conversando', alert: 'Alerta', search: 'Buscando', combat: 'En combate', retreat: 'Retirándose' };

export function scheduledBrain(def: NpcDef, seed: number): NpcBrain {
  return { type: 'scheduled', state: 'travel', nextThink: 0, def, rng: seededRng(seed), pauseUntil: 0 };
}
export function ambientBrain(seed: number, home?: [number, number], radius?: number): NpcBrain {
  return { type: 'ambient', state: 'travel', nextThink: 0, rng: seededRng(seed), pauseUntil: 0, home, radius };
}

function setState(w: World, e: Entity, s: NpcState, label?: string) {
  const b = e.npc!;
  const l = label ?? STATE_LABEL[s];
  b.state = s;
  if (e.label !== l) { e.label = l; e.labelVer++; }
  void w;
}

export function thinkNpc(w: World, e: Entity) {
  const b = e.npc!;
  // Prioridad: derribo > huida > peligro inmediato > orden válida > rutina. (Hito 1: solo conversación y rutina.)
  if (e.talkingUntil && e.talkingUntil > w.tick) { if (e.path.length) { e.path = []; } setState(w, e, 'talk', 'Conversando'); return; }
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
  const tx = entry.at[0] + 0.5, ty = entry.at[1] + 0.5;
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
  if (b.pauseUntil > w.tick) return;
  if (b.state === 'travel' && b.rng() < 0.35) {
    b.pauseUntil = w.tick + Math.floor(40 + b.rng() * 80);
    setState(w, e, b.rng() < 0.5 ? 'talk' : 'rest', b.rng() < 0.5 ? 'Charlando' : 'Mirando escaparates');
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
