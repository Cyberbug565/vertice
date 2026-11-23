import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildZoneGrid, findPath, GROUND_TYPES, roadMap, ZoneSchema } from '@vertice/shared';
import city from '../../content/zones/vertice.json';
import models from '../src/render/modelos-ensanche.json';
import { urbanGeometry } from '../src/render/urban3d';
import { Vehicles3D } from '../src/render/vehicles3d';

const zone = ZoneSchema.parse(city);
const grid = buildZoneGrid(zone);
const inside = ([x, y, w, h]: number[], a: number, b: number) => a >= x && b >= y && a < x + w && b < y + h;

describe('Ensanche de Vértice', () => {
  it('conecta los barrios nuevos con la ciudad y reserva callejones transitables', () => {
    expect([zone.width, zone.height]).toEqual([744, 432]);
    const districts = zone.districts.filter(d => d.rect[0] >= 608 || d.rect[1] >= 344);
    expect(districts).toHaveLength(8);
    const lanes = zone.ground.filter(g => g.type === 'asphalt' && g.street?.startsWith('ensanche-'));
    const rm = roadMap(grid);
    expect(lanes).toHaveLength(21);
    for (const { rect: [x, y, w, h] } of lanes) {
      let crosses = false;
      for (let b = y; b < y + h; b++) for (let a = x; a < x + w; a++) {
        const at = b * grid.w + a;
        if (!grid.walk[at] || !rm.axis[at]) throw Error(`Calzada cerrada en ${a},${b}`);
        crosses ||= rm.axis[at] === 3;
      }
      expect(crosses).toBe(true);
    }
    for (const d of districts) {
      const [x, y] = d.safePoint;
      expect(grid.walk[y * grid.w + x]).toBe(1);
      expect(d.waypoints.some(([x, y]) => GROUND_TYPES[grid.ground[y * grid.w + x]] === 'alley')).toBe(true);
      const fromX = x >= 608 ? 604.5 : x + .5, fromY = x >= 608 ? 172.5 : 337.5;
      expect(findPath(grid, fromX, fromY, x + .5, y + .5, 45000).ok).toBe(true);
    }
  });

  it('pone las fachadas nuevas en Cénit y deja los contenedores dentro de los patios industriales', () => {
    const core = zone.districts.find(d => d.id === 'cenit')!;
    const added = zone.buildings.filter(b => b.urban && Object.hasOwn(models, b.urban.model));
    const containers = added.filter(b => b.urban!.model.startsWith('contenedor-'));
    expect(new Set(added.map(b => b.urban?.model))).toEqual(new Set(Object.keys(models)));
    expect(added.filter(b => !b.urban!.model.startsWith('contenedor-')).every(b => inside(core.rect, ...b.rect.slice(0, 2) as [number, number]))).toBe(true);
    expect(containers.length).toBeGreaterThan(80);
    for (const b of containers) {
      const [x, y] = b.rect;
      expect(x >= 608 || y >= 344).toBe(true);
      expect(grid.walk[y * grid.w + x]).toBe(0);
    }
    for (const model of Object.values(models)) {
      const geom = urbanGeometry(model);
      expect(model.faces.length).toBe(model.surface.face.length * 3);
      expect(geom.getAttribute('color').count).toBe(model.faces.length);
      expect(geom.getAttribute('surfaceGlow').count).toBe(model.faces.length);
    }
  });
});

it('carga el Vector real, sigue al conductor y retira el modelo al salir del área visible', async () => {
  const path = new URL('../public/models/vehiculos/vector.glb', import.meta.url);
  const data = new Uint8Array(readFileSync(path)).buffer;
  const spy = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async () => new GLTFLoader().parseAsync(data, ''));
  const cars = new Vehicles3D();
  const v = { x: 600, y: 172, s: { id: 1, vehicle: 'saeta-vector' }, vehicleModel: 'vector' as const, view: { visible: true } };
  try {
    cars.sync([v], 0, .05, false);
    expect(cars.world.children).toHaveLength(0);
    await vi.waitFor(() => expect(cars.isReady('vector')).toBe(true));
    cars.sync([v], 0, .05, true);
    const rig = cars.world.children[0];
    expect(rig.getObjectByName('casco')).toBeDefined();
    expect(rig.getObjectByName('faros')).toBeDefined();
    expect(rig.getObjectByName('pilotos')).toBeDefined();
    const body = rig.getObjectByName('casco')!;
    expect(new Box3().setFromObject(body).max.y).toBeLessThan(1.1);
    expect(rig.position.toArray()).toEqual([600, 0, 172]);
    v.y += .5;
    cars.sync([v], 80, .08, true);
    expect(rig.position.z).toBe(172.5);
    expect(rig.rotation.y).toBeLessThan(Math.PI / 2);
    v.view.visible = false;
    cars.sync([v], 100, .05, true);
    expect(cars.world.children).toHaveLength(0);
    expect(spy).toHaveBeenCalledOnce();
  } finally {
    cars.clear();
    spy.mockRestore();
  }
});
