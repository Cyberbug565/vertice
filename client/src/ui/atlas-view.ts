import { Atlas, MAP_CELL, type ZoneDef } from '@vertice/shared';

export interface MapPoint { x: number; y: number }
export interface MapMark { p: MapPoint; name: string; id: string }
export class MapViewport {
  center: MapPoint;
  zoom: number;
  width = 1;
  height = 1;
  constructor(readonly zone: ZoneDef) {
    this.zoom = zone.id === 'vertice' ? 2.5 : 12;
    this.center = this.project({ x: zone.width / 2, y: zone.height / 2 });
  }
  project(p: MapPoint) { return { x: p.x - p.y + this.zone.height, y: (p.x + p.y)/2 }; }
  screen(p: MapPoint) {
    const q = this.project(p);
    return { x: (q.x-this.center.x)*this.zoom+this.width/2, y: (q.y-this.center.y)*this.zoom+this.height/2 };
  }
  world(x: number, y: number) {
    const a = this.center.x+(x-this.width/2)/this.zoom-this.zone.height;
    const b = 2*(this.center.y+(y-this.height/2)/this.zoom);
    return { x: (a+b)/2, y: (b-a)/2 };
  }
  private constrain() {
    const span = this.zone.width + this.zone.height;
    this.center.x = Math.max(0,Math.min(span,this.center.x));
    this.center.y = Math.max(0,Math.min(span/2,this.center.y));
  }
  focus(p: MapPoint) { this.center = this.project(p); this.constrain(); }
  pan(dx: number, dy: number) {
    this.center.x -= dx/this.zoom; this.center.y -= dy/this.zoom; this.constrain();
  }
  zoomAt(factor: number, x = this.width/2, y = this.height/2) {
    const anchor = this.world(x,y);
    this.zoom = Math.min(36,Math.max(.35,this.zoom*factor));
    const after = this.screen(anchor);
    this.pan(x-after.x,y-after.y);
  }
}
export function atlasMarks(zone: ZoneDef, atlas: Atlas) {
  const places: MapMark[] = zone.doors.filter(d => d.to.zone!=='casino-meridiano-vip' && atlas.knows(d.to.zone)).map(d => ({
    id:d.id, name:d.name, p:{x:d.at[0]+.5,y:d.at[1]+.5}
  }));
  const districts: MapMark[] = [];
  if (zone.id === 'vertice') {
    const explored = [...atlas.cells].filter(k => k.startsWith('vertice@')).map(k => {
      const [x,y]=k.slice(8).split(',').map(Number);
      return {x:(x+.5)*MAP_CELL, y:(y+.5)*MAP_CELL};
    });
    for (const d of zone.districts) {
      const [x,y,w,h]=d.rect;
      const p=atlas.unlocked?{x:x+w/2,y:y+h/2}:explored.find(p=>p.x>=x && p.y>=y && p.x<x+w && p.y<y+h);
      if (p) districts.push({id:d.id,name:d.name,p});
    }
  }
  return {places,districts};
}
export function paintAtlas(ctx: CanvasRenderingContext2D, terrain: HTMLCanvasElement, camera: MapViewport,
  marks: ReturnType<typeof atlasMarks>, here: MapPoint | null, selected: MapPoint | null, goal?: MapPoint) {
  const {width:w,height:h,center,zoom,zone}=camera;
  ctx.fillStyle='#070b12';ctx.fillRect(0,0,w,h);
  const span=(zone.width+zone.height)*zoom;
  ctx.drawImage(terrain,w/2-center.x*zoom,h/2-center.y*zoom,span,span/2);
  ctx.font='12px system-ui';ctx.textBaseline='middle';
  const visible=(p:MapPoint)=>p.x>=0&&p.y>=0&&p.x<=w&&p.y<=h;
  const dot=(p:MapPoint,color:string,r:number)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
  const boxes:{x:number;y:number;width:number}[]=[];
  for(const m of marks.places){
    const p=camera.screen(m.p);if(!visible(p))continue;
    dot(p,'#69e8ce',3);if(zoom<5)continue;
    const width=ctx.measureText(m.name).width+6,x=p.x+6,y=p.y-8;
    if(boxes.some(b=>x<b.x+b.width&&x+width>b.x&&y<b.y+16&&y+16>b.y))continue;
    boxes.push({x,y,width});ctx.fillStyle='#101320';ctx.fillRect(x,y,width,16);
    ctx.fillStyle='#e7f2f3';ctx.fillText(m.name,x+3,p.y);
  }
  if(zoom<5)for(const d of marks.districts){const p=camera.screen(d.p);if(visible(p)){ctx.fillStyle='#d7e2fb';ctx.fillText(d.name,p.x+4,p.y-10);}}
  if(goal)dot(camera.screen(goal),'#e58efb',4);
  if(selected)dot(camera.screen(selected),'#ffbc60',4);
  if(here)dot(camera.screen(here),'#ff5ca7',5);
}
