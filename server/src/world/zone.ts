import { buildZoneGrid, type ZoneDef, type ZoneGrid } from '@vertice/shared';
import type { Entity } from './entity.js';

export const CELL = 8;

/** Autoridad de zona en memoria: dueña de sus entidades e índice espacial por celdas. */
export class Zone {
  readonly id: string;
  readonly grid: ZoneGrid;
  readonly entities = new Set<Entity>();
  readonly actors = new Set<Entity>();
  readonly players = new Set<Entity>();
  private cells = new Map<number, Set<Entity>>();
  constructor(readonly def: ZoneDef) { this.id = def.id; this.grid = buildZoneGrid(def); }

  static cellKey(x: number, y: number) { return Math.floor(y / CELL) * 4096 + Math.floor(x / CELL); }
  /** v0.5: distrito de la ciudad única en una posición. */
  districtAt(x: number, y: number) {
    for (const d of this.def.districts) { const [rx, ry, rw, rh] = d.rect; if (x >= rx && y >= ry && x < rx + rw && y < ry + rh) return d; }
    return null;
  }
  /** Nivel de detalle en la ciudad única: solo se simula lo que está cerca de algún jugador (bloques de 48 losetas). */
  private active = new Set<number>();
  static coarse(x: number, y: number) { return Math.floor(y / 48) * 1000 + Math.floor(x / 48); }
  refreshActive() {
    this.active.clear();
    for (const p of this.players) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.active.add(Zone.coarse(p.x + dx * 48, p.y + dy * 48));
  }
  isActive(e: { x: number; y: number }) { return this.players.size > 0 && (!this.def.districts.length || this.active.has(Zone.coarse(e.x, e.y))); }

  add(e: Entity) {
    this.entities.add(e); if (e.kind === 'player') this.players.add(e);
    if (e.kind === 'player' || e.kind === 'npc') this.actors.add(e);
    e.zone = this; e.cellKey = Zone.cellKey(e.x, e.y);
    let s = this.cells.get(e.cellKey); if (!s) this.cells.set(e.cellKey, (s = new Set())); s.add(e);
  }
  remove(e: Entity) {
    this.entities.delete(e); this.players.delete(e);
    this.actors.delete(e);
    this.cells.get(e.cellKey)?.delete(e);
  }
  moved(e: Entity) {
    const k = Zone.cellKey(e.x, e.y);
    if (k === e.cellKey) return;
    this.cells.get(e.cellKey)?.delete(e);
    e.cellKey = k;
    let s = this.cells.get(k); if (!s) this.cells.set(k, (s = new Set())); s.add(e);
  }
  /** Entidades en un radio (cuadrado de celdas y filtro circular). */
  query(x: number, y: number, r: number, out: Entity[] = []): Entity[] {
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL), cy1 = Math.floor((y + r) / CELL);
    const r2 = r * r;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const s = this.cells.get(cy * 4096 + cx); if (!s) continue;
      for (const e of s) { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) out.push(e); }
    }
    return out;
  }
}
