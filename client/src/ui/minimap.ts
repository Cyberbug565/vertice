// Minimapa y mapa grande por planta, proyectados en isométrico para coincidir con la vista.
import { GROUND_TYPES, buildZoneGrid, type ZoneDef } from '@vertice/shared';

const COL: Record<string, string> = { asphalt: '#2a2a3a', sidewalk: '#44445a', plaza: '#4e4868', market: '#6a4a5a', water: '#0d3050', bridge: '#5a5a6a', deck: '#4a4640', gravel: '#5a5448', crosswalk: '#3a3a4a', wood: '#6a4a36', tile: '#5e6078', metal: '#4e5a64', dirt: '#5a4a3a', void: '#000', alley: '#1c1a24', grass: '#2f5a3a', sand: '#8a7458' };

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
    ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
