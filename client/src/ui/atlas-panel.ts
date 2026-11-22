import { Atlas, MAP_INTERFACE, type ZoneDef } from '@vertice/shared';
import { content, zoneDef } from '../content';
import { h } from './dom';
import { showPanel } from './life';
import { mapTerrain } from './minimap';
import { MapViewport, atlasMarks, paintAtlas, type MapPoint } from './atlas-view';
interface MapOptions {
  current: string; local: boolean; atlas: Atlas; position: () => MapPoint; level: number;
  hack: () => void; goto: (x: number, y: number) => void; travel: (id: string) => void;
  hasCar: boolean; goal: {x:number;y:number;zone:string} | null;
}
export function openAtlas(o: MapOptions) {
  const city=zoneDef('vertice')!,floor=zoneDef(o.current)??city;
  let zone=o.local?floor:city,camera=new MapViewport(zone);
  const canvas=h('canvas',{class:'atlas-view',tabIndex:0,'aria-label':'Plano desplazable'}) as HTMLCanvasElement;
  const list=h('select',{'aria-label':'Lugares descubiertos'}) as HTMLSelectElement;
  const info=h('div',{class:'atlas-info','aria-live':'polite'}),status=h('span',{class:'muted'});
  const button=(name:string,fn:()=>void)=>h('button',{class:'btn small',onclick:fn},name);
  const hack=button('Descifrar plano',o.hack) as HTMLButtonElement;
  let revision=-1,terrain:HTMLCanvasElement,marks:ReturnType<typeof atlasMarks>,selected:MapPoint|null=null;
  function position(){
    if(zone.id===o.current)return o.position();
    let room:ZoneDef=floor;
    if(room.tower)room=zoneDef(room.tower.id+'-p0')??room;
    const exit=room.doors.find(d=>d.to.zone==='vertice');
    if(exit && zone.id==='vertice')return {x:exit.to.at[0],y:exit.to.at[1]};
    const house=content.houses.find(x=>'casa:'+x.id===o.current);
    const door=house&&city.objects.find(x=>x.id===house.building);
    return door && zone.id==='vertice' ? {x:door.at[0],y:door.at[1]} : null;
  }
  function refresh(){
    terrain=mapTerrain(zone,o.atlas,zone.kind==='interior'?8:1.5);marks=atlasMarks(zone,o.atlas);
    list.replaceChildren(h('option',{value:''},'Lugares descubiertos'),...marks.places.map(m=>h('option',{value:m.id},m.name)));
    status.textContent=o.atlas.unlocked?'Cartografía municipal descifrada':'Explorado por tu personaje';
    hack.disabled=o.atlas.unlocked||o.level<MAP_INTERFACE;
    hack.textContent=o.atlas.unlocked?'Plano descifrado':'Descifrar · Interfaz '+MAP_INTERFACE;
    hack.title='Tu nivel de Interfaz es '+o.level;revision=o.atlas.revision;
  }
  function draw(){
    if(revision!==o.atlas.revision)refresh();
    const box=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    camera.width=Math.max(1,box.width);camera.height=Math.max(1,box.height);
    const pw=Math.round(camera.width*dpr), ph=Math.round(camera.height*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);
    const goal=o.goal?.zone===zone.id && o.atlas.seen(zone.id,o.goal.x,o.goal.y)?o.goal:undefined;
    paintAtlas(ctx,terrain,camera,marks,position(),selected,goal);
  }
  function select(p:MapPoint,name?:string){
    if(!o.atlas.seen(zone.id,p.x,p.y)&&!name)return;
    selected=p;
    const district=zone.districts.find(d=>p.x>=d.rect[0]&&p.y>=d.rect[1]&&p.x<d.rect[0]+d.rect[2]&&p.y<d.rect[1]+d.rect[3]);
    info.replaceChildren(h('b',{},name??district?.name??zone.name));
    if(zone.id===o.current)info.append(button('Ir a este punto',()=>{o.goto(p.x,p.y);panel.remove();}));
    if(zone===city&&district&&o.hasCar)info.append(button('Viajar en coche a '+district.name,()=>{o.travel(district.id);panel.remove();}));
    draw();
  }
  function recenter(){camera.focus(position()??{x:zone.width/2,y:zone.height/2});draw();}
  function switchFloor(){zone=zone===city?floor:city;camera=new MapViewport(zone);revision=-1;selected=null;info.replaceChildren();recenter();}
  const zoom=(ratio:number)=>{camera.zoomAt(ratio);draw();};
  const panel=showPanel('world-panel','Mapa',h('div',{class:'atlas-tools'},
    button('−',()=>zoom(1/1.3)),button('+',()=>zoom(1.3)),button('Centrar en mí',recenter),
    floor.id!==city.id?button('Ciudad / planta',switchFloor):null,list,hack),
    canvas,info,h('div',{class:'atlas-foot'},status,h('span',{},'Arrastra para mover · rueda para ampliar')));
  let drag:{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|null=null;
  canvas.onpointerdown=e=>{
    if(drag||e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    drag.moved ||= Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4;
    if(drag.moved){camera.pan(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;draw();}
  };
  canvas.onpointercancel=()=>{drag=null;};
  canvas.onpointerup=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const tap=!drag.moved;drag=null;if(!tap)return;
    const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
    const m=marks.places.find(m=>{const q=camera.screen(m.p);return Math.hypot(x-q.x,y-q.y)<9;});
    const p=m?.p??camera.world(x,y);
    if(p.x>=0&&p.y>=0&&p.x<zone.width&&p.y<zone.height)select(p,m?.name);
  };
  canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect();camera.zoomAt(Math.exp(-Math.sign(e.deltaY)*.2),e.clientX-b.left,e.clientY-b.top);draw();},{passive:false});
  const arrows:Record<string,[number,number]>={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]};
  canvas.onkeydown=e=>{const d=arrows[e.key];if(!d)return;e.preventDefault();e.stopPropagation();camera.pan(...d);draw();};
  list.onchange=()=>{const m=marks.places.find(m=>m.id===list.value);if(m){camera.focus(m.p);select(m.p,m.name);}};
  recenter();canvas.focus();
  const observer=new ResizeObserver(draw);observer.observe(canvas);document.addEventListener('vertice-atlas',draw);
  const removal=new MutationObserver(()=>{if(!panel.isConnected){removal.disconnect();observer.disconnect();document.removeEventListener('vertice-atlas',draw);}});
  removal.observe(panel.parentNode!,{childList:true});
}
