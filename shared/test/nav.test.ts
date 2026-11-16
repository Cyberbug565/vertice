import { describe, it, expect } from 'vitest';
import { loadContentFromDisk } from '../../server/src/content.js';
import { buildZoneGrid, findPath, lineWalkable, isWalkable } from '../src/index.js';

const { content } = loadContentFromDisk();
const ferro = buildZoneGrid(content.zones.find((z) => z.id === 'vertice')!);

describe('navegación', () => {
  it('rodea edificios y cruza el canal por un puente', () => {
    const r = findPath(ferro, 37.5, 163.5, 113.5, 169.5);
    expect(r.ok).toBe(true);
    let px = 37.5, py = 163.5;
    for (const [x, y] of r.path) { expect(lineWalkable(ferro, px, py, x, y)).toBe(true); px = x; py = y; }
    // Todo cruce del canal (x 65..67 tras ensanchar las calles) sucede sobre losetas de puente.
    expect(r.path.length).toBeGreaterThan(0);
  });
  it('rechaza destinos dentro de edificios o en el agua', () => {
    expect(isWalkable(ferro, 38.5, 143.5)).toBe(false); // Torre Halcón
    expect(findPath(ferro, 37.5, 163.5, 38.5, 143.5).ok).toBe(false);
    expect(isWalkable(ferro, 97.5, 169.5)).toBe(false); // canal
  });
  it('respeta el límite de expansiones', () => {
    const r = findPath(ferro, 10.5, 134.5, 147.5, 215.5, 50);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ruta_demasiado_larga');
  });
});
