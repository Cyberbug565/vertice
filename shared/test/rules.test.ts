import { describe, it, expect } from 'vitest';
import { checkChance, minDieNeeded, maxHp, chromeCapacity, humanityAfterSurgery, instabilityThresholds, validateAttributes, worldToScreen, screenToWorld, encodePositions, decodePositions } from '../src/index.js';

describe('reglas de prototipo', () => {
  it('ejemplo de tirada del documento: DV 15, atributo 6, habilidad 3 → 6–10 (50 %); con 2 de Suerte → 4–10 (70 %)', () => {
    expect(minDieNeeded(6, 3, 15)).toBe(6);
    expect(checkChance(6, 3, 15)).toBeCloseTo(0.5);
    expect(minDieNeeded(6, 3, 15, 2)).toBe(4);
    expect(checkChance(6, 3, 15, 2)).toBeCloseTo(0.7);
    expect(checkChance(1, 0, 30)).toBe(0);
    expect(checkChance(10, 10, 5)).toBe(1);
  });
  it('salud 25 + 5×BODY + 3×WILL y capacidad de cromo 18 + 2×TECH + BODY', () => {
    expect(maxHp({ BODY: 5, WILL: 5 })).toBe(65);
    expect(chromeCapacity({ TECH: 6, BODY: 5 })).toBe(35);
  });
  it('Humanidad tras cirugía: EMP 6, carga 12, coste 5 → máximo 48, actual 43', () => {
    expect(humanityAfterSurgery(60, 60, 12, 5)).toEqual({ max: 48, current: 43 });
  });
  it('umbral de inestabilidad acotado a [40,70] con estados T, T+15, T+25', () => {
    const t = instabilityThresholds({ will: 5, humanity: 60, humanityBase: 60, chromeSaturationPct: 50 });
    expect(t).toEqual({ warning: 62, decompensation: 77, crisis: 87 });
    expect(instabilityThresholds({ will: 2, humanity: 0, humanityBase: 60, chromeSaturationPct: 100 }).warning).toBe(40);
  });
  it('55 puntos con atributos entre 2 y 8', () => {
    const ok = { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 };
    expect(validateAttributes(ok)).toBeNull();
    expect(validateAttributes({ ...ok, INT: 7 })).toMatch(/55/);
    expect(validateAttributes({ ...ok, INT: 9, REF: 3 })).toMatch(/entre 2 y 8/);
  });
});

describe('proyección isométrica', () => {
  it('screenToWorld invierte worldToScreen', () => {
    for (const [x, y] of [[0, 0], [3.25, 7.5], [95.9, 63.1], [10, 0.5]]) {
      const s = worldToScreen(x, y);
      const w = screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(x, 9); expect(w.y).toBeCloseTo(y, 9);
    }
  });
});

describe('codec binario de posiciones', () => {
  it('ida y vuelta con precisión de 1/256 de loseta', () => {
    const ents = [{ id: 1, x: 12.3456, y: 40.5, flags: 3 }, { id: 4000000000, x: 95.99, y: 0, flags: 16 }];
    const d = decodePositions(encodePositions(77, ents))!;
    expect(d.tick).toBe(77);
    expect(d.ents[1].id).toBe(4000000000);
    expect(d.ents[0].x).toBeCloseTo(12.3456, 2);
    expect(d.ents[1].flags).toBe(16);
  });
});
