// Minimapa y mapa grande por planta, proyectados en isométrico para coincidir con la vista.
import { GROUND_TYPES, buildZoneGrid, type ZoneDef } from '@vertice/shared';

const COL: Record<string, string> = { asphalt: '#2a2a3a', sidewalk: '#44445a', plaza: '#4e4868', market: '#6a4a5a', water: '#0d3050', bridge: '#5a5a6a', deck: '#4a4640', gravel: '#5a5448', crosswalk: '#3a3a4a', wood: '#6a4a36', tile: '#5e6078', metal: '#4e5a64', dirt: '#5a4a3a', void: '#000', alley: '#1c1a24', grass: '#2f5a3a', sand: '#8a7458', data: '#0a2a4a', grid: '#3a0a18' };

const DANGER_TINT = ['rgba(90,255,140,0.22)', '', 'rgba(255,48,64,0.22)', 'rgba(0,0,0,0.5)'];
export function renderZoneMap(zone: ZoneDef, canvas: HTMLCanvasElement, scale: number) {
  const g = buildZoneGrid(zone);
  const w = (zone.width + zone.height) * scale, hgt = ((zone.width + zone.height) * scale) / 2;
  canvas.width = Math.ceil(w); canvas.height = Math.ceil(hgt);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, scale / 2, -scale, scale / 2, zone.height * scale, 0);
  for (let y = 0; y < zone.height; y++) for (let x = 0; x < zone.width; x++) {
    const i = y * zone.width + x;
    ctx.fillStyle = g.walk[i] ? COL[GROUND_TYPES[g.ground[i]]] ?? '#333' : g.buildingAt[i] >= 0 ? zone.buildings[g.buildingAt[i]].color : GROUND_TYPES[g.ground[i]] === 'water' ? COL.water : '#6a6a7a';
    ctx.fillRect(x, y, 1.05, 1.05);
    // Zonas de color: verde segura, amarilla vigilada (sin tinte), roja peligrosa y negra sin ley.
    if (zone.kind === 'exterior') { const dg = g.danger[i]; if (dg !== 1) { ctx.fillStyle = DANGER_TINT[dg]; ctx.fillRect(x, y, 1.05, 1.05); } }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { project: (x: number, y: number) => ({ x: (x - y) * scale + zone.height * scale, y: ((x + y) * scale) / 2 }) };
}

export class Minimap {
  private base = document.createElement('canvas');
  private proj: ((x: number, y: number) => { x: number; y: number }) | null = null;
  private zone?: ZoneDef;
  constructor(private canvas: HTMLCanvasElement) {}
  setZone(z: ZoneDef) {
    this.zone = z;
    const scale = z.kind === 'interior' ? 6 : 1.4;
    this.proj = renderZoneMap(z, this.base, scale).project;
  }
  /** Destino marcado (se dibuja como un rombo magenta; si está fuera, una flecha en el borde). */
  goal: { x: number; y: number; zone: string } | null = null;
  /** Clic en el minimapa: convierte el punto a coordenadas del mundo. */
  toWorld(cx: number, cy: number, me: { x: number; y: number }) {
    if (!this.proj || !this.zone) return null;
    const c = this.canvas, W = c.clientWidth || 216, H = c.clientHeight || 140;
    const m = this.proj(me.x, me.y);
    const px = cx - W / 2 + m.x, py = cy - H / 2 + m.y;
    const s = this.zone.kind === 'interior' ? 6 : 1.4;
    const a = (px - this.zone.height * s) / s, b = (2 * py) / s;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  draw(me: { x: number; y: number }, others: { x: number; y: number; kind: string }[]) {
    if (!this.proj || !this.zone) return;
    const c = this.canvas, ctx = c.getContext('2d')!;
    const W = (c.width = c.clientWidth || 216), H = (c.height = c.clientHeight || 140);
    const m = this.proj(me.x, me.y);
    ctx.fillStyle = '#070710'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.base, Math.round(W / 2 - m.x), Math.round(H / 2 - m.y));
    for (const o of others) {
      const p = this.proj(o.x, o.y);
      ctx.fillStyle = o.kind === 'player' ? '#43f3ff' : o.kind === 'door' ? '#5affc8' : o.kind === 'object' ? '#ffd23f' : '#c8c8d8';
      ctx.fillRect(W / 2 + p.x - m.x - 1.5, H / 2 + p.y - m.y - 1.5, o.kind === 'npc' ? 2 : 3, o.kind === 'npc' ? 2 : 3);
    }
    if (this.goal && this.goal.zone === this.zone.id) {
      const p = this.proj(this.goal.x, this.goal.y);
      let gx = W / 2 + p.x - m.x, gy = H / 2 + p.y - m.y;
      const out = gx < 6 || gy < 6 || gx > W - 6 || gy > H - 6;
      gx = Math.max(6, Math.min(W - 6, gx)); gy = Math.max(6, Math.min(H - 6, gy));
      ctx.fillStyle = '#ff40ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 5, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!out) { ctx.strokeStyle = 'rgba(255,64,255,0.5)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
