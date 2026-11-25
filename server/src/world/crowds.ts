import { GROUND_TYPES, isWalkable, pedestrianGrid, RULES, seededRng, hashString, type Appearance } from '@vertice/shared';
import type { Entity } from './entity.js';
import type { World } from './world.js';
import type { Zone } from './zone.js';

type Profile = 'corporativo' | 'barrio' | 'periferia';
type Tile = [number, number];
type Cohort = { zone: Zone; points: Tile[]; people: Entity[]; seen: number };
const CELL_SIZE = 28;
export const MAX_CIVILIANS = 620;
const SPAWN_PER_UPDATE = 16;
const KEEP_TICKS = RULES.tickRate * 12;
const CORE = new Set(['cenit', 'colinas', 'estacion-central']);

export function districtProfile(district: string, ambient = 0): Profile {
  if (CORE.has(district)) return 'corporativo';
  return ambient >= 20 || district === 'darsena-este' ? 'barrio' : 'periferia';
}

export function regionalChrome(appearance: Appearance, profile: Profile, rng: () => number): string[] {
  const side = rng() < .5 ? 'izq' : 'der';
  const roll = rng();
  if (profile === 'corporativo') {
    if (roll < .22) {
      appearance.chromeModels = { ['ojo_' + side]: 'optico' };
      appearance.eyes = '#77e9ff';
      return ['ojos', 'ojo_' + side];
    }
    if (roll < .37) {
      appearance.chromeModels = { ['brazo_' + side]: roll < .31 ? 'atlas' : 'bastion' };
      return ['brazo_' + side];
    }
    if (roll < .44) {
      appearance.chromeModels = { ['pierna_' + side]: 'titan' };
      return ['pierna_' + side];
    }
  } else if (profile === 'periferia') {
    if (roll < .19) {
      appearance.chromeModels = { ['brazo_' + side]: 'circuito', ['mano_' + side]: 'pinza' };
      return ['brazo_' + side, 'mano_' + side];
    }
    if (roll < .29) {
      appearance.chromeModels = { mandibula: 'mordaza' };
      return ['mandibula'];
    }
    if (roll < .37) {
      appearance.chromeModels = { ['pierna_' + side]: 'protesis' };
      return ['pierna_' + side];
    }
  } else {
    if (roll < .15) return ['ojos'];
    if (roll < .25) return ['brazo_' + side];
    if (roll < .30) return ['cabeza', 'ojos'];
  }
  return [];
}

export class Crowds {
  private readonly cohorts = new Map<string, Cohort>();
  private readonly landmarks = new WeakMap<Zone, Set<string>>();

  constructor(private readonly world: World) {}

  private landmarksFor(zone: Zone) {
    let cells = this.landmarks.get(zone);
    if (cells) return cells;
    cells = new Set();
    const { width, height } = zone.def;
    for (const door of this.world.interiors.around(zone.id, width / 2, height / 2, Math.hypot(width, height))) {
      if (!door.private && door.rect[2] * door.rect[3] >= 140) {
        cells.add(Math.floor(door.at[0] / CELL_SIZE) + ',' + Math.floor(door.at[1] / CELL_SIZE));
      }
    }
    this.landmarks.set(zone, cells);
    return cells;
  }

  private plan(key: string, zone: Zone, cell?: Tile): Tile[] {
    const floor = zone.def;
    const scale = Math.min(1.6, this.world.cfg.ambientNpcs / 72);
    const hour = this.world.cityHour();
    const night = hour < 6 || hour >= 21;
    const grid = cell ? pedestrianGrid(zone.grid, 'stop') : zone.grid;
    const x0 = cell ? cell[0] * CELL_SIZE : 1, y0 = cell ? cell[1] * CELL_SIZE : 1;
    const x1 = cell ? Math.min(floor.width, x0 + CELL_SIZE) : floor.width - 1;
    const y1 = cell ? Math.min(floor.height, y0 + CELL_SIZE) : floor.height - 1;
    const rng = seededRng(hashString(key) ^ this.world.cfg.seed);
    let target = 0;
    if (cell) {
      const district = zone.districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      if (!district) return [];
      const profile = districtProfile(district.id, district.ambient);
      const hub = this.landmarksFor(zone).has(cell.join(','));
      const activity = night ? (district.id === 'neon-rojo' ? 1.4 : .55) : 1;
      target = Math.round((profile === 'corporativo' ? 24 : profile === 'barrio' ? 12 : 3) * activity * scale + (hub ? 5 : 0));
    } else {
      const casino = floor.casino && floor.casino.room !== 'vip' && !floor.id.endsWith('-vip');
      const publicTower = floor.tower?.access === 'publico';
      const shop = floor.objects.some(object=>object.kind === 'shop');
      const station = floor.restricted === 'policia' && !floor.storey;
      if (!(casino || publicTower || shop || station || floor.nightlife)) return [];
      const district = this.world.districtDef(zone, floor.safePoint[0], floor.safePoint[1]);
      const divisor = publicTower || districtProfile(district?.id ?? '', district?.ambient) === 'corporativo' ? 10 : 14;
      const activity = casino || floor.nightlife ? (night ? 1.2 : .8) : (night ? .62 : 1);
      const area = grid.walk.reduce((n, open) => n + open, 0);
      target = Math.min(64, Math.round(area / divisor * activity * scale));
    }
    const points: Tile[] = [];
    if (!target || x0 >= x1 || y0 >= y1) return points;
    const doors = cell ? [] : floor.doors;
    for (let i = 0; i < target * 16 && points.length < target; i++) {
      const x = x0 + Math.floor(rng() * (x1 - x0)), y = y0 + Math.floor(rng() * (y1 - y0));
      const ground = GROUND_TYPES[grid.ground[y * grid.w + x]];
      if (cell && ground !== 'sidewalk' && ground !== 'plaza' && ground !== 'market') continue;
      if (!isWalkable(grid, x, y) || doors.some(d => Math.abs(d.at[0] - x) + Math.abs(d.at[1] - y) < 2)
        || points.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 2)) continue;
      points.push([x, y]);
    }
    return points;
  }

  update() {
    if (this.world.cfg.ambientNpcs <= 0) return;
    const wanted = new Map<string, { zone: Zone; distance: number; cell?: Tile }>();
    const request = (zone: Zone, distance: number, cell?: Tile) => {
      const key = cell ? zone.id + ':' + cell.join(',') : zone.id;
      if (distance < (wanted.get(key)?.distance ?? Infinity)) wanted.set(key, { zone, distance, cell });
    };
    for (const { e, p, closed } of this.world.conns.values()) {
      if (closed || !e || p?.status !== 'alive' || e.ghostOf) continue;
      const zone = e.zone;
      if (zone.def.kind === 'interior') { request(zone, 0); continue; }
      if (!zone.def.districts.length) continue;
      const cx = Math.floor(e.x / CELL_SIZE), cy = Math.floor(e.y / CELL_SIZE);
      for (let y = Math.max(0, cy - 1); y <= cy + 1; y++) for (let x = Math.max(0, cx - 1); x <= cx + 1; x++) {
        request(zone, Math.hypot(e.x - (x + .5) * CELL_SIZE, e.y - (y + .5) * CELL_SIZE), [x, y]);
      }
    }

    let count = 0;
    for (const [key, cohort] of this.cohorts) {
      if (wanted.has(key)) cohort.seen = this.world.tick;
      else if (!cohort.people.length || this.world.tick - cohort.seen >= KEEP_TICKS) {
        let busy = false;
        for (const e of cohort.people) {
          if (!this.world.entities.has(e.id)) continue;
          if (e.aggro !== undefined || e.carriedBy || e.state === 'downed' || e.dots?.length) { busy = true; count++; continue; }
          this.world.removeEntity(e);
        }
        if (!busy) this.cohorts.delete(key);
        continue;
      }
      count += cohort.people.length;
    }

    let budget = Math.min(SPAWN_PER_UPDATE, MAX_CIVILIANS - count);
    for (const [key, { zone, cell }] of [...wanted].sort((a, b) => a[1].distance - b[1].distance)) {
      let cohort = this.cohorts.get(key);
      if (!cohort) {
        cohort = { zone, points: this.plan(key, zone, cell), people: [], seen: this.world.tick };
        this.cohorts.set(key, cohort);
      }
      while (budget > 0 && cohort.people.length < cohort.points.length) {
        const i = cohort.people.length, point = cohort.points[i];
        const rng = seededRng(hashString(key + ':' + i) ^ this.world.cfg.seed);
        cohort.people.push(this.world.spawnCrowdCivil(cohort.zone, point, rng));
        budget--;
      }
    }
  }
}
