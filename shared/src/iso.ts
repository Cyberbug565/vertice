// Proyección isométrica 2:1. Las coordenadas de mundo están en losetas (unidad de mundo = 1 loseta).
// La simulación y la navegación nunca usan píxeles; el cliente proyecta al dibujar e invierte al hacer clic.
export const TILE_W = 64;
export const TILE_H = 32;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

export interface Vec2 { x: number; y: number }

/** Mundo (x, y, altura en losetas) → pantalla (px, sin cámara). */
export function worldToScreen(x: number, y: number, z = 0): Vec2 {
  return { x: (x - y) * HW, y: (x + y) * HH - z * TILE_H };
}

/** Pantalla → mundo sobre el plano del suelo z=0 (inversa exacta de worldToScreen). */
export function screenToWorld(sx: number, sy: number): Vec2 {
  const a = sx / HW;
  const b = sy / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
