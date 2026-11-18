// v0.19 · Ciudad transitable y tráfico: canales convertidos en paseo, transeúntes que van por la acera y cruzan por los
// pasos de peatones en verde, semáforos coherentes para coches y peatones, y la Tormenta que sustituye al personaje.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildZoneGrid, carLight, findPath, roadMap, walkLight, GROUND_TYPES } from '@vertice/shared';
import { createApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => { app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: process.env.TEST_DATABASE_URL, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false }); });
afterAll(async () => { await app?.close(); });
const city = () => app.world.zones.get('vertice')!;

describe('v0.19', () => {
  it('los canales interiores ya no cortan la ciudad: solo queda agua en el puerto', () => {
    const z = city().def;
    const water = z.ground.filter((g) => g.type === 'water');
    for (const w of water) expect(w.rect[1] <= 8 || w.rect[0] > 400).toBe(true);
    expect(z.ground.filter((g) => g.type === 'plaza' && g.rect[0] === 95 && g.rect[1] === 125).length).toBe(1);
  });

  it('semáforos: cuando los peatones cruzan una calzada, sus coches están en rojo', () => {
    for (let t = 0; t < 30000; t += 250) for (const ax of ['h', 'v'] as const) {
      if (walkLight(t, 100, 100, ax) === 'verde') expect(carLight(t, 100, 100, ax)).toBe('rojo');
      // Nunca están las dos direcciones de coches en verde a la vez.
      expect(carLight(t, 100, 100, 'h') === 'verde' && carLight(t, 100, 100, 'v') === 'verde').toBe(false);
    }
  });

  it('los transeúntes van por la acera y cruzan por el paso de peatones (no por mitad de la calzada)', () => {
    const g = city().grid, rm = roadMap(g);
    // Puntos de paseo: fuera de la calzada.
    const wps = [...g.def.waypoints, ...g.def.districts.flatMap((d) => d.waypoints)];
    expect(wps.filter(([x, y]) => rm.axis[y * g.w + x]).length).toBeLessThanOrEqual(2);
    // Cruzar la avenida que va por y = 112–120 (de la acera de arriba a la de abajo).
    const cw = g.def.ground.find((c) => c.type === 'crosswalk' && c.rect[1] === 112 && c.rect[3] === 8)!;
    const sx = cw.rect[0] + 9.5, sy = 110.5, tx = cw.rect[0] + 9.5, ty = 121.5;
    const free = findPath(g, sx, sy, tx, ty, 20000);
    const walk = findPath(g, sx, sy, tx, ty, 20000, { pedestrian: true });
    expect(free.ok && walk.ok).toBe(true);
    // El peatón pisa la calzada solo dentro del paso.
    const pts: [number, number][] = [[sx, sy], ...walk.path];
    let offCrossing = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
      for (let k = 0; k <= d * 4; k++) { const x = ax + ((bx - ax) * k) / (d * 4 || 1), y = ay + ((by - ay) * k) / (d * 4 || 1), j = Math.floor(y) * g.w + Math.floor(x); if (rm.axis[j] && !rm.crossing[j]) offCrossing++; }
    }
    expect(offCrossing).toBe(0);
  });

  it('un transeúnte espera en la acera con el semáforo de peatones en rojo', () => {
    const z = city(), g = z.grid;
    const cw = g.def.ground.find((c) => c.type === 'crosswalk' && c.rect[1] === 112 && c.rect[3] === 8)!;
    const w = app.world as any;
    const e = w.addEntity(z, { kind: 'npc', name: 'Peatón', x: cw.rect[0] + 0.5, y: 111.4, interactive: false, speed: 2 });
    e.npc = { nextThink: 1e12 } as any; e.npcType = 'civil';
    e.path = [[cw.rect[0] + 0.5, 121.5]];
    const realNow = Date.now;
    // Rojo para cruzar la calzada horizontal: fase 5 s (los coches de esa calzada en verde).
    const base = Math.floor(realNow() / 30000) * 30000;
    const at = (sec: number) => { for (let k = 0; k < 4; k++) { const t = base + sec * 1000 - k * 7500; if (walkLight(t, cw.rect[0] + 0.5, 112.2, 'h') === (sec < 15 ? 'rojo' : 'verde')) return t; } return base + sec * 1000; };
    try {
      const red = at(5); Date.now = () => red;
      w.moveEntity(e, 0.5);
      expect(e.y).toBeCloseTo(111.4, 3);
      const green = at(20); Date.now = () => green;
      w.moveEntity(e, 0.5);
      expect(e.y).toBeGreaterThan(111.5);
    } finally { Date.now = realNow; }
  });

  it('el mapa sigue siendo transitable de punta a punta', () => {
    const g = buildZoneGrid(city().def);
    const AS = GROUND_TYPES.indexOf('asphalt');
    let road = 0; for (let i = 0; i < g.ground.length; i++) if (g.ground[i] === AS) road++;
    expect(road).toBeGreaterThan(1000);
    expect(findPath(g, 69.5, 177.5, 560.5, 300.5, 400000).ok).toBe(true);
  });
});
