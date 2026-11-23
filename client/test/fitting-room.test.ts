import { expect, it } from 'vitest';
import { loadValidatedContent } from '../../server/src/content';
import { FACE_SHAPES, normalizeAppearance, type CharacterSheet } from '@vertice/shared';
import { faceParams } from '../src/render/face3d';
import { gaitCapture } from '../src/render/captured-motion';
import { flatFittingAppearance, garmentFits, tryGarment, tryImplant, type FittingSheet } from '../src/ui/fitting-model';

const { content } = loadValidatedContent();
const appearance = { skin: '#ae7564', hair: '#282428', jacket: '#40506a', accent: '#42dcf0', body: 'femenino' };
const sheet: FittingSheet = {
  name: 'Noa', appearance, look: { ...appearance, legwear: 'pantalon', chromeModels: { brazo_der: 'vigia' } },
  wear: { torso_ext: 'chaqueta' }, inventory: [{ def: 'chaqueta', name: 'Chaqueta', qty: 1 }],
  cyber: [{ id: 'right', def: 'cromo-vigia', location: 'installed', part: 'brazo_der' },
    { id: 'left', def: 'brazo-protesico', location: 'installed', part: 'brazo_izq' }] as CharacterSheet['cyber'],
  chrome: ['brazo_der', 'brazo_izq'], body: { wounds: {}, lost: ['pierna_izq'], broken: [], chrome: [], bleed: 0 },
};

it('prueba ropa sin comprarla y conserva la apariencia, las prendas y el inventario reales', () => {
  const before = structuredClone(sheet);
  const jacket = content.items.find(x => x.wear?.style === 'g:cazadora-cremallera')!;
  expect(tryGarment(content, sheet, jacket).appearance.garments).toBe('cazadora-cremallera');
  expect(flatFittingAppearance(tryGarment(content, sheet, jacket).appearance, content.items)).toMatchObject({ top: 'chaqueta', jacket: jacket.wear?.color });
  const fit = content.items.find(x => x.wear?.style === 'g:vestido-scifi')!;
  expect(garmentFits(sheet, fit)).toBe(true);
  expect(tryGarment(content, sheet, fit).appearance.garments).toContain('vestido-scifi');
  expect(garmentFits({ ...sheet, appearance: { ...appearance, body: 'masculino' } }, fit)).toBe(false);
  expect(sheet).toEqual(before);
});

it('cambia cada lado de forma independiente y muestra la restauración protésica', () => {
  const before = structuredClone(sheet);
  const arm = content.cyberware.find(x => x.model === 'atlas')!;
  const left = tryImplant(content, sheet, arm, 'izq');
  const right = tryImplant(content, sheet, arm, 'der');
  expect(left.appearance.chromeModels).toMatchObject({ brazo_izq: 'atlas', brazo_der: 'vigia' });
  expect(right.appearance.chromeModels).toMatchObject({ brazo_der: 'atlas' });
  expect(tryImplant(content, sheet, arm, 'der', 'right').chrome).toEqual(['brazo_izq']);
  const leg = content.cyberware.find(x => x.id === 'pierna-protesica')!;
  expect(tryImplant(content, sheet, leg, 'izq').lost).toEqual([]);
  expect(tryImplant(content, sheet, leg, 'der').lost).toEqual(['pierna_izq']);
  expect(sheet).toEqual(before);
});

it('distingue las formas añadidas y valida tintes de cuerpo personalizable', () => {
  const faces = FACE_SHAPES.map(faceShape => faceParams({ ...appearance, faceShape }, () => .5, true));
  expect(new Set(faces.map(a => JSON.stringify(a))).size).toBe(16);
  expect(faces.every(face => face.length === 16 && face.every(Number.isFinite))).toBe(true);
  expect(normalizeAppearance({ ...appearance, hairDye: 'mechas', hairTint: '#ffd080' })).toMatchObject({ ok: true, value: { hairDye: 'mechas', hairTint: '#ffd080' } });
  expect(normalizeAppearance({ ...appearance, hairDye: 'mechas', hairTint: '#fff' }).ok).toBe(false);
});

it('usa el ciclo de marcha base para un personaje sobrio y reserva el clip ebrio para su estado', () => {
  expect(gaitCapture('marcha', [], 1.55, false)).toBe('');
  expect(gaitCapture('paseo', [], 1, false)).toBe('');
  expect(gaitCapture('marcha', ['paso-ebrio'], 1.55, false)).toBe('ebrio');
  expect(gaitCapture('esprint', [], 5.1, false)).toBe('correr');
});
