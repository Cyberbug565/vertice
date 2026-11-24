import * as THREE from 'three';
import { Interiors, roomToCity, type BuildingEntrance, type RoomFrame, type ZoneDef } from '@vertice/shared';
import { content, zoneDef } from '../content';
import { buildScene3D, type Scene3D } from './world3d';
import type { City3D } from './city3d';

export const architecture = new Interiors(content);
const cube = new THREE.BoxGeometry(1, 1, 1);
const panel = new THREE.MeshStandardMaterial({ roughness: .71, metalness: .24 });
const lit = new THREE.MeshBasicMaterial({ toneMapped: false });
type Slab = [number, number, number, number, number, number, number];
const tmp = new THREE.Object3D(), color = new THREE.Color();
function batch(parts: Slab[], mat: THREE.Material) {
  const mesh = new THREE.InstancedMesh(cube, mat, parts.length);
  parts.forEach(([x,y,z,w,h,d,c],i)=>{
    tmp.position.set(x+w/2,y+h/2,z+d/2);tmp.scale.set(w,h,d);tmp.updateMatrix();
    mesh.setMatrixAt(i,tmp.matrix);mesh.setColorAt(i,color.setHex(c));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

function worldMatrix(f: RoomFrame) {
  const [x,z] = roomToCity(f,0,0);
  return new THREE.Matrix4().compose(new THREE.Vector3(x,f.height,z),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-f.turns*Math.PI/2), new THREE.Vector3(f.scale[0],1,f.scale[1]));
}

function shell(z: ZoneDef, index: number, doors: readonly BuildingEntrance[], heightUnit: number) {
  const b=z.buildings[index], [x,y,w,d]=b.rect;
  const police=doors.some(e=>e.room.startsWith('comisaria'));
  const shop=b.style==='shop'||b.style==='clinic'||b.style==='club';
  const height=Math.max(police?6.5:3.25,b.height*heightUnit);
  const solid: Slab[]=[], fronts: Slab[]=[], roof: Slab[]=[], lamps: Slab[]=[];
  const col=parseInt(b.color.slice(1),16), dark=police?0x203850:0x25333e, pat=police?0x58beff:shop?0x74d7c5:0x97b2b8;
  const put=(horizontal:boolean,cross:number,from:number,to:number,level:number,h:number,t:number,c:number,list=solid)=>{
    if(to<=from)return;
    list.push(horizontal?[x+from,level,cross-t/2,to-from,h,t,c]:[cross-t/2,level,y+from,t,h,to-from,c]);
  };
  const facade=(horizontal:boolean,side:number,cross:number,length:number)=>{
    const lower=side>0 ? fronts : solid;
    const edge=doors.filter(e=>horizontal?e.out[1]===side:e.out[0]===side).map(e=>(horizontal?e.threshold[0]-x:e.threshold[1]-y)).sort((a,b)=>a-b);
    let from=0;
    for(const q of edge){
      const left=Math.max(from,q-.51),right=Math.min(length,q+.51);
      put(horizontal,cross,from,left,0,3.14,.24,col,lower);
      put(horizontal,cross,left,right,1.99,1.15,.24,col,lower);
      put(horizontal,cross+side*.18,left,right,2.08,.09,.10,pat,lamps);
      put(horizontal,cross+side*.25,Math.max(0,q-.78),Math.min(length,q+.78),2.17,.13,.60,dark,roof);
      from=right;
    }
    put(horizontal,cross,from,length,0,3.14,.24,col,lower);
    put(horizontal,cross,0,length,3.12,Math.max(.13,height-3.12),.22,col,roof);
    for(let lvl=1;lvl<Math.min(7,Math.ceil(height/3.25));lvl++){
      const band=lvl*3.25;
      if(band+.9>height)break;
      put(horizontal,cross+side*.14,0,length,band-.17,.18,.15,dark,roof);
      for(let k=.7;k<length-.46;k+=1.4){
        put(horizontal,cross+side*.135,k-.42,k+.42,band+.20,1.03,.04,dark,roof);
        if((k*10+lvl+index)%4<1.1)put(horizontal,cross+side*.17,k-.40,k+.40,band+.23,.08,.026,pat,roof);
      }
    }
    for(let k=1.4;k<length-1.15;k+=2.4){
      if(edge.some(e=>Math.abs(e-k)<1.24))continue;
      put(horizontal,cross+side*.125,k-.56,k+.56,.85,1.07,.045,police?0x3e6485:0x3d555d,lower);
      put(horizontal,cross+side*.15,k-.57,k+.57,.82,.065,.05,0x9aa4aa,lower);
    }
  };
  facade(true,-1,y,w);facade(true,1,y+d,w);facade(false,-1,x,d);facade(false,1,x+w,d);
  roof.push([x-.09,height,y-.09,w+.18,.19,d+.18,dark],[x+w*.3,height+.18,y+d*.25,Math.max(.8,w*.22),.43,Math.max(.8,d*.31),col]);
  const group = new THREE.Group(); group.name='fachada:'+b.id;
  const top=batch(roof,panel), faces=batch(fronts,panel);
  group.add(batch(solid,panel),top,faces,batch(lamps,lit));
  return {group, cut(cut: boolean){top.visible=!cut;faces.visible=!cut;}};

}

interface Room { scene: Scene3D; frame: RoomFrame; used: number }
interface Facade { group: THREE.Group; used: number; cut: (cut: boolean)=>void }
interface Street { city: City3D; terrain: Scene3D }
const MAX_ROOMS=8;
const MAX_FACADES=20;

/** La geometría exterior se presta a la escena interior y vuelve a su grupo original al salir. */
export class ConnectedArchitecture {
  readonly group=new THREE.Group();
  readonly facades=new THREE.Group();
  readonly previews=new THREE.Group();
  private rooms=new Map<string,Room>();
  private shells=new Map<string,Facade>();
  private borrowed?: Street & { parent: THREE.Object3D; terrainY: number };
  private replaced=new Set<number>();
  private city?: City3D;
  private last='';
  private lastCityReady?: boolean;
  constructor(private readonly heightUnit: number) {
    this.group.name='arquitectura-conectada';
    this.group.matrixAutoUpdate=false;
    this.group.add(this.facades,this.previews);
  }

  reset() {
    if(this.borrowed){
      const {city,terrain,parent,terrainY}=this.borrowed;
      parent.add(city.group,terrain.group);
      terrain.group.position.y=terrainY;terrain.group.visible=false;city.group.visible=false;
    }
    for(const index of this.replaced)this.city?.setHidden(index,false);
    this.borrowed=undefined;this.city=undefined;this.replaced.clear();this.last='';this.lastCityReady=undefined;
    for(const s of this.shells.values())s.group.visible=false;
    for(const r of this.rooms.values())r.scene.group.visible=false;
    this.group.matrix.identity(); this.group.matrixWorldNeedsUpdate=true;
  }

  sync(z: ZoneDef, city: City3D | null, x: number, y: number, cut: boolean, now: number, getStreet: (z: ZoneDef)=>Street) {
    const frame=architecture.frame(z), outside=frame?zoneDef(frame.entrance.zone):z;
    if(!outside || outside.kind!=='exterior')return;
    const [wx,wy]=frame?roomToCity(frame,x,y):[x,y];
    // Reevalúa mobiliario y fachadas solo al moverse media loseta; la cámara y los personajes se dibujan cada fotograma.
    const key=[z.id, Math.floor(wx*2),Math.floor(wy*2),cut,city?.active].join(':');
    const loaded=this.borrowed?.city.active;
    if(key===this.last&&loaded===this.lastCityReady)return;
    this.lastCityReady=loaded;
    this.last=key;
    if(frame&&!this.borrowed){
      const street=getStreet(outside),parent=street.city.group.parent;
      if(parent){
        this.borrowed={...street,parent,terrainY:street.terrain.group.position.y};
        street.terrain.group.position.y=-.035;
        street.terrain.group.visible=true;street.city.group.visible=true;
        this.group.add(street.city.group,street.terrain.group);
      }
    }
    this.city=frame ? this.borrowed?.city : city ?? undefined;
    if(frame)this.group.matrix.copy(worldMatrix(frame)).invert(); else this.group.matrix.identity();
    this.group.matrixWorldNeedsUpdate=true;
    const nearby=architecture.around(outside.id,wx,wy,19);
    const groups=new Map<number,BuildingEntrance[]>();
    for(const e of nearby){
      const same=groups.get(e.building)??[];
      if(!groups.has(e.building))groups.set(e.building,same);
      same.push(e);
    }
    const replaced=new Set<number>(frame?[frame.entrance.building]:[]);
    const models=new Set<string>();
    for(const [index,doors] of groups){
      if(index===frame?.entrance.building)continue;
      const id=outside.id+':'+index;
      let facade=this.shells.get(id);
      if(!facade){
        const model=shell(outside,index,doors,this.heightUnit);
        this.facades.add(model.group);
        facade={...model,used:now};
        this.shells.set(id,facade);
      }
      models.add(id);
      replaced.add(index);
      facade.used=now;
      facade.cut(cut && doors.some(e=>!e.private && Math.hypot(wx-e.threshold[0],wy-e.threshold[1])<3.9));
    }
    for(const [id,s] of this.shells)s.group.visible=models.has(id);
    for(const index of this.replaced)if(!replaced.has(index))this.city?.setHidden(index,false);
    for(const index of replaced)this.city?.setHidden(index,true);
    this.replaced=replaced;
    const show=(room: ZoneDef|null|undefined) => {
      if(!room || room.id===z.id) return;
      let preview=this.rooms.get(room.id);
      if(!preview){
        const f=architecture.frame(room);
        if(!f)return;
        const scene=buildScene3D(room,true,this.heightUnit);
        scene.group.matrixAutoUpdate=false;
        scene.group.matrix.copy(worldMatrix(f));
        scene.group.matrixWorldNeedsUpdate=true;
        this.previews.add(scene.group);
        preview={scene,frame:f,used:now};
        this.rooms.set(room.id,preview);
      }
      preview.used=now;
      preview.scene.setCut(cut);
      preview.scene.group.visible=true;
    };
    for(const r of this.rooms.values())r.scene.group.visible=false;
    if(!frame) {
      const opens=nearby.filter(e=>!e.private && Math.hypot(wx-e.threshold[0],wy-e.threshold[1])<5.5)
        .sort((a,b)=>Math.hypot(wx-a.threshold[0],wy-a.threshold[1])-Math.hypot(wx-b.threshold[0],wy-b.threshold[1]));
      for(const e of opens.slice(0,2))show(zoneDef(e.room));
    } else {
      for(const d of z.doors) if(Math.hypot(x-d.at[0]-.5,y-d.at[1]-.5)<4 &&
        !d.hidden&&!d.to.zone.startsWith('casa:')&&zoneDef(d.to.zone)?.kind==='interior')show(zoneDef(d.to.zone));
    }
    this.trim();
  }

  private trim() {
    for(const [id,r] of [...this.rooms].sort((a,b)=>a[1].used-b[1].used)){
      if(this.rooms.size<=MAX_ROOMS)break;
      if(r.scene.group.visible)continue;
      this.previews.remove(r.scene.group);r.scene.dispose();this.rooms.delete(id);
    }
    for(const [id,f] of [...this.shells].sort((a,b)=>a[1].used-b[1].used)){
      if(this.shells.size<=MAX_FACADES)break;
      if(f.group.visible)continue;
      this.facades.remove(f.group);f.group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});this.shells.delete(id);
    }
  }
}
