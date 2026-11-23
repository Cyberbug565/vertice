import type { ZoneDef } from '@vertice/shared';
import catalogue from './nueva-york.json';

export type UrbanBuilding = ZoneDef['buildings'][number];
export type UrbanLook = NonNullable<UrbanBuilding['urban']>;
export interface UrbanForm { points: number[]; faces: number[]; cornices: number[][]; fins: number[][] }
type Point = [number, number, number];

export const URBAN_FORMS: Readonly<Record<string, UrbanForm>> = catalogue.buildings;

export const FACADES = {
  corporativa: { led: '#33cfff', glass: '#167ba3', lit: '#83ddff', rough: 0.29, metal: 0.43, pitch: [0.96, 1.31, 0.79, 0.68], wear: 0.06, occupancy: 0.76 },
  residencial: { led: '#ffdb9a', glass: '#34505e', lit: '#ffd297', rough: 0.48, metal: 0.11, pitch: [1.52, 1.18, 0.57, 0.55], wear: 0.05, occupancy: 0.58 },
  comercial: { led: '#fa54c0', glass: '#393963', lit: '#dea6ff', rough: 0.54, metal: 0.23, pitch: [1.27, 1.22, 0.67, 0.55], wear: 0.19, occupancy: 0.58 },
  industrial: { led: '#f1af56', glass: '#533e2e', lit: '#ffc37d', rough: 0.75, metal: 0.27, pitch: [2.2, 2.65, 0.64, 0.31], wear: 0.53, occupancy: 0.22 },
  ruina: { led: '#e48f51', glass: '#302b2a', lit: '#ed974b', rough: 0.92, metal: 0.08, pitch: [2.0, 2.62, 0.47, 0.28], wear: 0.92, occupancy: 0.05 },
} as const;

export function urbanForm(b: UrbanBuilding): UrbanForm | undefined {
  return b.urban && Object.hasOwn(URBAN_FORMS, b.urban.model) ? URBAN_FORMS[b.urban.model] : undefined;
}

/** Coordenadas de Three (x, altura, z), con el mismo eje de avance que el mapa. */
export function urbanPoint(b: UrbanBuilding, form: UrbanForm, index: number): Point {
  const [x, y, w, d] = b.rect;
  const i = index * 3, u = form.points[i], height = form.points[i + 1] * b.height, v = form.points[i + 2];
  const turn = b.urban?.turn ?? 0;
  const [a, c] = turn === 0 ? [u, v] : turn === 1 ? [v, -u] : turn === 2 ? [-u, -v] : [-v, u];
  return [x + w * (0.5 + a * 0.99), height, y + d * (0.5 + c * 0.99)];
}
