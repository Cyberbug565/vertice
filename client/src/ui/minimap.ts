// Minimapa y mapa grande por planta, proyectados en isométrico para coincidir con la vista.
import { Atlas, MAP_CELL, GROUND_TYPES, type ZoneDef } from '@vertice/shared';

import { sceneGrid } from '../render/world3d';

const COL: Record<string, string> = { asphalt: '#2a2a3a', sidewalk: '#44445a', plaza: '#4e4868', market: '#6a4a5a', water: '#0d3050', bridge: '#5a5a6a', deck: '#4a4640', gravel: '#5a5448', crosswalk: '#3a3a4a', wood: '#6a4a36', tile: '#5e6078', metal: '#4e5a64', dirt: '#5a4a3a', void: '#000', alley: '#1c1a24', grass: '#2f5a3a', sand: '#8a7458', data: '#0a2a4a', grid: '#3a0a18' };

const DANGER_TINT = [
  { r:90,g:255,b:140,a:.22 }, { r:0,g:0,b:0,a:0 },
  { r:255,g:48,b:64,a:.22 }, { r:0,g:0,b:0,a:.5 },
];
export function renderZoneMap(zone: ZoneDef, canvas: HTMLCanvasElement, scale: number) {
  const grid = sceneGrid(zone);
  canvas.width = Math.ceil((zone.width + zone.height) * scale);
  canvas.height = Math.ceil((zone.width + zone.height) * scale / 2);
  const ctx = canvas.getContext('2d')!;
  const raster=document.createElement('canvas');
  raster.width=zone.width; raster.height=zone.height;
  const painter=raster.getContext('2d')!, pixels=painter.createImageData(grid.w,grid.h);
  const colors=GROUND_TYPES.map(t=>t==='void'?0:parseInt((COL[t]??'#333333').slice(1),16));
  const exterior=zone.kind==='exterior';
  for(let i=0;i<grid.ground.length;i++){
    const type=grid.ground[i];
    const c=grid.walk[i] ? colors[type] : grid.buildingAt[i]>=0 ? 0x404251 :
      GROUND_TYPES[type]==='water'?0x0d3050:0x6a6a7a;
    const tint=DANGER_TINT[exterior?grid.danger[i]:1];
    pixels.data[i*4]=((c>>16)&255)*(1-tint.a)+tint.r*tint.a;
    pixels.data[i*4+1]=((c>>8)&255)*(1-tint.a)+tint.g*tint.a;
    pixels.data[i*4+2]=(c&255)*(1-tint.a)+tint.b*tint.a;
    pixels.data[i*4+3]=255;
  }
  painter.putImageData(pixels,0,0);
  ctx.setTransform(scale, scale / 2, -scale, scale / 2, zone.height * scale, 0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(raster,0,0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { project: (x: number, y: number) => ({ x: (x - y) * scale + zone.height * scale, y: ((x + y) * scale) / 2 }) };
}

const terrainCache = new WeakMap<ZoneDef, Map<number,HTMLCanvasElement>>();
export function mapTerrain(zone: ZoneDef, atlas: Atlas, scale: number) {
  let scales = terrainCache.get(zone);
  if (!scales) { scales = new Map(); terrainCache.set(zone,scales); }
  let terrain = scales.get(scale);
  if (!terrain) { terrain=document.createElement('canvas'); renderZoneMap(zone,terrain,scale); scales.set(scale,terrain); }
  if (atlas.unlocked) return terrain;
  const canvas=document.createElement('canvas');
  canvas.width=terrain.width; canvas.height=terrain.height;
  const ctx=canvas.getContext('2d')!;
  ctx.setTransform(scale,scale/2,-scale,scale/2,zone.height*scale,0);
  ctx.beginPath();
  const prefix=zone.id+'@';
  for (const key of atlas.cells) if (key.startsWith(prefix)) {
    const [cx,cy]=key.slice(prefix.length).split(',').map(Number), x=cx*MAP_CELL, y=cy*MAP_CELL;
    ctx.rect(x,y,Math.min(MAP_CELL,zone.width-x),Math.min(MAP_CELL,zone.height-y));
  }
  ctx.clip();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(terrain,0,0);
  return canvas;
}

export class Minimap {
  private base = document.createElement('canvas');
  private proj: ((x: number, y: number) => { x: number; y: number }) | null = null;
  private zone?: ZoneDef;
  constructor(private canvas: HTMLCanvasElement, private atlas: Atlas) {}
  refresh() { if (this.zone) this.setZone(this.zone); }
  setZone(z: ZoneDef) {
    this.zone = z;
    const scale = z.kind === 'interior' ? 6 : 1.4;
    this.base = mapTerrain(z,this.atlas,scale);
    this.proj=(x,y)=>({x:(x-y+z.height)*scale,y:(x+y)*scale/2});
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
      if (!this.atlas.seen(this.zone.id,o.x,o.y)) continue;
      if (o.kind==='door') {
        const d=this.zone.doors.find(d=>Math.abs(d.at[0]+.5-o.x)<1 && Math.abs(d.at[1]+.5-o.y)<1);
        if (!d || !this.atlas.knows(d.to.zone)) continue;
      }
      if (o.kind==='object' && this.zone.kind==='exterior' && !this.atlas.unlocked) continue;
      const p = this.proj(o.x, o.y);
      ctx.fillStyle = o.kind === 'player' ? '#43f3ff' : o.kind === 'door' ? '#5affc8' : o.kind === 'object' ? '#ffd23f' : '#c8c8d8';
      ctx.fillRect(W / 2 + p.x - m.x - 1.5, H / 2 + p.y - m.y - 1.5, o.kind === 'npc' ? 2 : 3, o.kind === 'npc' ? 2 : 3);
    }
    if (this.goal && this.goal.zone === this.zone.id && this.atlas.seen(this.zone.id,this.goal.x,this.goal.y)) {
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
