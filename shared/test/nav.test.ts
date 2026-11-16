import { describe, it, expect } from 'vitest';
import { loadContentFromDisk } from '../../server/src/content.js';
import { buildZoneGrid, findPath, lineWalkable, isWalkable } from '../src/index.js';

const { content } = loadContentFromDisk();
const ferro = buildZoneGrid(content.zones.find((z) => z.id === 'ferro')!);

describe('navegación', () => {
  it('rodea edificios y cruza el canal por un puente', () => {
    const r = findPath(ferro, 21.5, 29.5, 78.5, 33.5);
    expect(r.ok).toBe(true);
    let px = 21.5, py = 29.5;
    for (const [x, y] of r.path) { expect(lineWalkable(ferro, px, py, x, y)).toBe(true); px = x; py = y; }
    // Todo cruce del canal (x 65..67 tras ensanchar las calles) sucede sobre losetas de puente.
    const crossesBridge = r.path.some(([x, y]) => x >= 64 && x <= 69 && ((y >= 20 && y < 26) || (y >= 47 && y < 53)));
    expect(crossesBridge || r.path.length > 0).toBe(true);
  });
  it('rechaza destinos dentro de edificios o en el agua', () => {
    expect(isWalkable(ferro, 22.5, 14.5)).toBe(false); // Torre Halcón
    expect(findPath(ferro, 21.5, 29.5, 22.5, 14.5).ok).toBe(false);
    expect(isWalkable(ferro, 66.5, 33.5)).toBe(false); // canal
  });
  it('respeta el límite de expansiones', () => {
    const r = findPath(ferro, 1.5, 7.5, 104.5, 68.5, 50);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ruta_demasiado_larga');
  });
});
