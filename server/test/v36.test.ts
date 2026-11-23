// v0.36 · Cada portal y cada puerta de la calle (menos las escaleras al Nivel 2) toca la fachada de un edificio, donde se
// encaja la puerta 3D del kit; y los modelos de las puertas están en el cliente.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildZoneGrid, ZoneSchema } from '@vertice/shared';

const z = ZoneSchema.parse(JSON.parse(readFileSync(new URL('../../content/zones/vertice.json', import.meta.url), 'utf8')));
const g = buildZoneGrid(z);
const touches = ([x, y]: readonly number[]) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => g.buildingAt[(y + dy) * g.w + x + dx] >= 0);
const walk = ([x, y]: readonly number[]) => g.walk[y * g.w + x] === 1;

describe('v0.36 · puertas en las fachadas', () => {
  it('los 263 portales y las puertas de la calle están pegados a un edificio y se puede llegar a ellos', () => {
    const portals = z.objects.filter((o) => o.kind === 'housing');
    expect(portals.length).toBe(263);
    for (const o of portals) { expect(touches(o.at), o.id).toBe(true); expect(walk(o.at), o.id).toBe(true); }
    for (const d of z.doors.filter((x) => !/^Escaleras/.test(x.name))) expect(touches(d.at), d.id).toBe(true);
  });
  it('las puertas del kit (portal y tienda) están en el cliente con su licencia', () => {
    for (const k of ['portal', 'tienda']) expect(existsSync(new URL(`../../client/public/models/puertas/puerta-${k}.glb`, import.meta.url))).toBe(true);
    expect(existsSync(new URL('../../client/public/models/puertas/LICENCIA-Kenney-CC0.txt', import.meta.url))).toBe(true);
  });
});
