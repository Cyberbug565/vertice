// v0.16 · Caras de los cuerpos del kit: 15 rasgos por persona (forma elegida en el creador + semilla propia, así no hay
// dos iguales) y una calcomanía nítida de 512 px sobre la cara de la textura con maquillaje, cicatrices, tatuaje facial,
// piercings y pecas (antes salían borrosos o no salían).
import type { Appearance } from '@vertice/shared';

/** Rasgos (ver Look.face en human3d.ts). `r` es el azar propio de la persona. */
export function faceParams(a: Appearance, r: () => number, female: boolean): number[] {
  const fsh = a.faceShape ?? 'ovalada', nz = a.nose ?? 'recta', mo = a.mouth ?? 'neutra';
  const pick = (m: Record<string, number>, k: string) => m[k] ?? 0;
  return [
    (r() - 0.5) * 0.045 + pick({ oblonga: -.032, 'frente-ancha': .092, 'pomulos-altos': .025, 'ovalada-corta': .027, ancha: 0.04, redonda: 0.035, alargada: -0.03, afilada: -0.035, diamante: -0.01, cuadrada: 0.02 }, fsh),
    (r() - 0.5) * 0.13 + pick({ 'mandibula-marcada': .37, 'frente-ancha': -.24, 'pomulos-altos': -.13, 'perfil-suave': -.035, cuadrada: 0.18, triangular: -0.16, corazon: -0.16, afilada: -0.18, ancha: 0.1, angulosa: 0.08 }, fsh) + (female ? -0.04 : 0.04),
    (r() - 0.5) * 0.65 + pick({ 'puente-alto': .78, 'puente-bajo': -.72, 'perfil-griego': .47, aguilena: 1.0, chata: -0.9, respingona: -0.6, pequena: -0.6, rota: 0.4 }, nz),
    (r() - 0.5) * 0.7 + pick({ oblonga: 1.35, 'mandibula-marcada': .63, 'ovalada-corta': -.9, 'perfil-suave': -.24, alargada: 0.8, afilada: 0.7, redonda: -0.5, triangular: 0.4 }, fsh),
    (r() - 0.5) * 1.6 + pick({ gruesas: 0.6, finas: -0.4, cortadas: 0.2 }, a.brows ?? 'normales'),
    (r() - 0.5) * 0.8 + pick({ 'pomulos-altos': 1.8, 'mandibula-marcada': .75, 'ovalada-corta': -.43, 'perfil-suave': -.6, diamante: 1.1, angulosa: 1.0, redonda: -0.4 }, fsh),
    (r() - 0.5) * 0.5 + pick({ ancha: 0.35, chata: 0.22, pequena: -0.2, respingona: -0.12, rota: 0.15 }, nz),
    (r() - 0.5) * 0.8 + pick({ 'frente-ancha': 1.05, oblonga: .59, 'ovalada-corta': -.52, alargada: 0.4, corazon: 0.5, redonda: -0.2 }, fsh),
    (r() - 0.5) * 0.62 + pick({ arco: .65, 'labio-inferior': 1.35, 'comisuras-altas': .22, 'labios-gruesos': 1.1, fina: -0.8, seria: -0.3 }, mo) + (female ? 0.35 : 0),
    (r() - 0.5) * 1.6,
    (r() - 0.5) * 0.38 + pick({ 'mandibula-marcada': .69, 'frente-ancha': -.38, 'pomulos-altos': -.37, 'perfil-suave': -.14, cuadrada: 0.4, ancha: 0.25, afilada: -0.35, corazon: -0.3, triangular: 0.2, diamante: -0.25 }, fsh),
    (r() - 0.5) * 1.4 + pick({ arqueadas: 0.6, cortadas: -0.2 }, a.brows ?? 'normales'),
    (r() - 0.5) * 0.66 + pick({ 'puente-alto': 1.55, 'puente-bajo': -1.45, 'perfil-griego': 1.15, aguilena: 0.9, chata: -0.9, rota: 0.6, recta: 0.2 }, nz),
    (r() - 0.5) * 0.75 + pick({ 'perfil-suave': 1.12, 'pomulos-altos': -.74, 'ovalada-corta': .64, redonda: 0.9, ancha: 0.4, angulosa: -0.6, afilada: -0.6, diamante: -0.4 }, fsh),
    (r() - 0.5) * 0.48 + pick({ oblonga: 1.23, 'ovalada-corta': -.92, 'frente-ancha': .52, alargada: 0.6, redonda: -0.35, triangular: 0.2 }, fsh),
    pick({ arco: .75, 'comisuras-altas': 1, sonrisa: .7, mueca: .35, seria: -.4, 'labio-inferior': -.25 }, mo),
  ];
}

const cache = new Map<string, HTMLCanvasElement>();
/** Calcomanía de la cara: lienzo de 512 px que cubre el rectángulo de la cara en la textura (FACE_UV). */
export function faceDecal(a: Required<Appearance>, seed: number): HTMLCanvasElement | null {
  const freckles = seed % 7 === 0;
  const parts = [a.makeup, a.makeupColor, a.scar, a.faceTattoo, a.tattoo, a.piercing, freckles, a.brows === 'cortadas'];
  const any = (a.makeup && a.makeup !== 'ninguno') || (a.scar && a.scar !== 'ninguna') || (a.faceTattoo && a.faceTattoo !== 'ninguno') || (a.piercing && a.piercing !== 'ninguno') || freckles || a.brows === 'cortadas';
  if (!any) return null;
  const key = JSON.stringify([parts, seed % 97]);
  const hit = cache.get(key); if (hit) return hit;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  // Puntos de la cara en el lienzo (iguales en los dos cuerpos, con margen).
  const EL = { x: 184, y: 245 }, ER = { x: 325, y: 245 }, CX = 255, NOSE = 313, MOUTH = 364, CHIN = 418, BROW = 212, FORE = 140;
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const ink = a.tattoo && /^#/.test(a.tattoo) ? a.tattoo : '#1a1a24', mk = a.makeupColor || '#ff3fa4';
  // Maquillaje.
  switch (a.makeup) {
    case 'delineado': for (const e of [EL, ER]) { const d = e.x < CX ? -1 : 1; g.strokeStyle = 'rgba(8,6,10,0.92)'; g.lineWidth = 5; g.beginPath(); g.ellipse(e.x, e.y, 30, 13, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.beginPath(); g.moveTo(e.x + d * 28, e.y - 4); g.lineTo(e.x + d * 46, e.y - 16); g.stroke(); } break;
    case 'labios': g.fillStyle = mk; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(CX, MOUTH, 40, 13, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; break;
    case 'neon': g.shadowColor = mk; g.shadowBlur = 14; g.strokeStyle = mk; g.lineWidth = 4; for (const e of [EL, ER]) { g.beginPath(); g.moveTo(e.x - 26, e.y + 26); g.lineTo(e.x + 26, e.y + 26); g.stroke(); g.beginPath(); g.arc(e.x + (e.x < CX ? -36 : 36), e.y - 4, 4, 0, Math.PI * 2); g.fillStyle = mk; g.fill(); } g.shadowBlur = 0; break;
    case 'pintura': g.fillStyle = mk; g.globalAlpha = 0.78; g.fillRect(EL.x - 70, EL.y - 24, ER.x - EL.x + 140, 46); g.globalAlpha = 1; break;
  }
  // Cicatrices.
  const scar = (x0: number, y0: number, x1: number, y1: number) => { g.strokeStyle = 'rgba(150,70,70,0.75)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = 'rgba(230,170,160,0.6)'; g.lineWidth = 2.5; g.stroke(); for (let t = 0.15; t < 1; t += 0.2) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; g.beginPath(); g.moveTo(x - 6, y - 4); g.lineTo(x + 6, y + 4); g.stroke(); } };
  if (a.scar === 'mejilla') scar(ER.x + 30, ER.y + 30, ER.x + 60, ER.y + 95);
  if (a.scar === 'ojo') scar(ER.x - 4, BROW - 30, ER.x + 6, ER.y + 55);
  if (a.scar === 'frente') scar(CX - 80, FORE - 10, CX + 40, FORE + 50);
  if (a.brows === 'cortadas') { g.strokeStyle = 'rgba(200,150,130,0.95)'; g.lineWidth = 6; g.beginPath(); g.moveTo(ER.x + 6, BROW - 18); g.lineTo(ER.x + 14, BROW + 10); g.stroke(); }
  // Tatuaje facial.
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 5;
  switch (a.faceTattoo) {
    case 'linea': g.beginPath(); g.moveTo(CX, MOUTH + 18); g.lineTo(CX, CHIN + 20); g.stroke(); break;
    case 'lagrimas': for (let i = 0; i < 2; i++) { const y = ER.y + 34 + i * 28; g.beginPath(); g.moveTo(ER.x - 6, y - 10); g.quadraticCurveTo(ER.x + 6, y + 6, ER.x - 6, y + 8); g.quadraticCurveTo(ER.x - 18, y + 6, ER.x - 6, y - 10); g.fill(); } break;
    case 'codigo': for (let i = 0; i < 12; i++) { const w = 2 + Math.floor(rnd() * 3) * 2; g.fillRect(ER.x + 56 + i * 7, EL.y - 30, w, 34); } break;
    case 'puntos': for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(EL.x - 20 + i * 20, EL.y + 36, 5, 0, Math.PI * 2); g.fill(); } break;
    case 'barras': for (let i = 0; i < 3; i++) g.fillRect(ER.x + 10, ER.y + 34 + i * 14, 52, 6); break;
    case 'circuito': g.lineWidth = 3; g.beginPath(); g.moveTo(ER.x + 70, ER.y - 40); g.lineTo(ER.x + 70, ER.y + 30); g.lineTo(ER.x + 40, ER.y + 60); g.lineTo(ER.x + 40, ER.y + 100); g.stroke(); for (const [x, y] of [[ER.x + 70, ER.y - 40], [ER.x + 40, ER.y + 100]]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke(); } break;
    case 'rayas': for (const e of [EL, ER]) for (let i = 0; i < 2; i++) { const d = e.x < CX ? -1 : 1; g.lineWidth = 7; g.beginPath(); g.moveTo(e.x + d * 20, e.y + 44 + i * 18); g.lineTo(e.x + d * 70, e.y + 34 + i * 18); g.stroke(); } break;
    case 'luna': g.beginPath(); g.arc(CX, FORE + 10, 22, 0.6, Math.PI * 2 - 0.6); g.arc(CX + 10, FORE + 10, 16, Math.PI * 2 - 0.9, 0.9, true); g.fill(); break;
    case 'tribal': g.lineWidth = 6; g.beginPath(); g.moveTo(EL.x - 50, EL.y - 50); g.bezierCurveTo(EL.x - 10, EL.y - 80, EL.x + 40, EL.y - 30, EL.x + 20, EL.y + 10); g.stroke(); g.beginPath(); g.moveTo(EL.x - 60, EL.y + 10); g.bezierCurveTo(EL.x - 40, EL.y + 70, EL.x + 10, EL.y + 60, EL.x + 30, EL.y + 40); g.stroke(); break;
  }
  // Piercings (puntos de metal con brillo).
  const stud = (x: number, y: number, r = 6) => { const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a909c'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  switch (a.piercing) {
    case 'nariz': stud(CX + 22, NOSE - 4); break;
    case 'ceja': stud(ER.x + 30, BROW - 12, 5); stud(ER.x + 34, BROW + 6, 5); break;
    case 'labio': stud(CX - 26, MOUTH + 12, 5); break;
    case 'septum': g.strokeStyle = '#c8ccd6'; g.lineWidth = 4; g.beginPath(); g.arc(CX, NOSE + 10, 9, 0.1, Math.PI - 0.1); g.stroke(); break;
  }
  // Pecas.
  if (freckles) { g.fillStyle = 'rgba(110,60,30,0.45)'; for (let i = 0; i < 70; i++) { const side = rnd() < 0.5 ? -1 : 1; const x = CX + side * (20 + rnd() * 80), y = NOSE - 40 + rnd() * 50; g.beginPath(); g.arc(x, y, 1.5 + rnd() * 2, 0, Math.PI * 2); g.fill(); } }
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, cv);
  return cv;
}
