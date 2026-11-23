import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/settings',()=>({settings:{}}));
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Chars3D } from '../src/render/chars3d';
import { captureLength, capturedLegs, installCapture } from '../src/render/captured-motion';
import { registerUniversal } from '../src/render/anim3d';
import { mannequin, renderPose } from '../../tools/pruebas-ciudad/modelos.mjs';

const bytes=(path:string)=>Uint8Array.from(readFileSync(path)).buffer;
const data=bytes('client/public/models/anim/ciudad-026.vtm');
const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(data,8,new DataView(data).getUint32(4,true))));
const driver:any=Object.create(Chars3D.prototype);
const tracked=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r'];
function rig(human:any){
  const r:any={human,speed:0,heading:0,phase:0,lastX:0,lastY:0,lie:0,coat:[],leftFrame:new Float64Array(6),rightFrame:new Float64Array(6)};
  for(const k of 'root body hips chest spine neck shadow handR thighL thighR kneeL kneeR ankleL ankleR toeL toeR shoulderL shoulderR elbowL elbowR'.split(' '))r[k]=new T.Group();
  return r;
}
const actor=()=>({s:{id:1,kind:'player',buffs:[] as string[]},x:0,y:0,moving:false}) as any;
function step(r:any,e:any,frame:number,current:boolean,guard=false){
  const now=frame*1000/60;
  driver.animate(r,e,{dt:1/60,now,serverNow:now,guarding:guard,meId:1});
  driver.applyHuman(r);
  if(current)driver.playClips(r,e,now,guard);
  else driver.legacyClips(r,e,now,guard);
}
describe('capturas del moveset',()=>{
  it('mantiene 28 secuencias de 52 huesos, cuaterniones unitarios y bucles continuos',()=>{
    installCapture(data);
    expect(meta.bones).toHaveLength(52);expect(Object.keys(meta.clips)).toHaveLength(28);
    const d=new Int16Array(data,8+new DataView(data).getUint32(4,true));
    for(const [id,clip] of Object.entries(meta.clips) as [string,any][]){
      expect(captureLength(id)).toBeGreaterThan(0);
      let movement=0;
      for(let frame=0;frame<clip.count;frame++)for(let j=0;j<52;j++){
        const i=(clip.frame+frame)*meta.stride+4*j;
        const zero=clip.frame*meta.stride+j*4;
        movement=Math.max(movement,1-Math.abs(d[i]*d[zero]+d[i+1]*d[zero+1]+d[i+2]*d[zero+2]+d[i+3]*d[zero+3])/32767**2);
        if(Math.abs(Math.hypot(d[i],d[i+1],d[i+2],d[i+3])/32767-1)>.0001)throw Error(id+' '+frame);
        if(clip.loop && frame===clip.count-1 && Math.abs(d[i]*d[clip.frame*meta.stride+4*j]+d[i+1]*d[clip.frame*meta.stride+4*j+1]+d[i+2]*d[clip.frame*meta.stride+4*j+2]+d[i+3]*d[clip.frame*meta.stride+4*j+3])/32767**2<.9999)throw Error('Corte en '+id);
      }
      expect(movement,id).toBeGreaterThan(.001);
    }
    const l=new Float64Array(6),r=new Float64Array(6);
    expect(capturedLegs('andar',.3,l,r)).toBe(true);expect(Math.abs(l[1]-r[1])).toBeGreaterThan(.1);
  });
});

it('selecciona la captura por dirección, equipo y acción, y conserva la patada y el reposo',()=>{
  installCapture(data);
  const run=(init:any={})=>{
    const h:any={bones:new Map(),root:new T.Group()},r=rig(h),e=actor();
    e.s={...e.s,...init.state};Object.assign(e,init.event);
    Object.assign(r,init.rig);
    const now=4000;
    e.moving=!!init.speed;e.x=(init.vx??0)/60;e.y=(init.vy??init.speed??0)/60;
    r.speed=init.speed??0;
    let picked:any;
    r.capture={apply:(base:any,action:any)=>{picked={base,action};}};
    driver.animate(r,e,{dt:1/60,now,serverNow:now,guarding:!!init.guard,meId:1});
    driver.playClips(r,e,now,!!init.guard);
    return picked;
  };
  const sight={x:0,y:20,until:5000};
  for(const [data,id] of [
    [{speed:2},undefined],[{speed:4,state:{buffs:['corriendo']}},'trotar'],[{speed:6},'correr'],
    [{speed:3,state:{buffs:['paso-der','corriendo']}},'herido'],[{speed:2,state:{buffs:['paso-ebrio']}},'ebrio'],
    [{speed:2,rig:{ranged:true,big:true},state:{weapon:'fusil'}},'fusil'],
    [{speed:2,vy:-2,guard:true,event:{lookAt:sight}},'retroceso'],
    [{speed:2,vx:2,vy:0,guard:true,event:{lookAt:sight}},'lateral-izq'],
    [{speed:2,vx:-2,vy:0,guard:true,event:{lookAt:sight}},'lateral-der'],
    [{speed:2,vy:-2,rig:{wasMoving:false}},undefined],[{speed:4,vy:-4,rig:{wasMoving:false}},'pivote'],[{speed:4,vy:-4,rig:{wasMoving:true,travel:0}},'revertir'],
    [{speed:4,vx:4,vy:0,rig:{wasMoving:true,travel:0}},'curva']
  ] as const)expect(run(data).base?.id).toBe(id);
  for(const [data,id] of [
    [{guard:true},'guardia'],[{guard:true,state:{buffs:['escudo']}},'escudo'],
    [{event:{attackAt:3850,attackKind:'hit'}},'jab'],[{event:{attackAt:3800,attackKind:'heavy'}},'boxeo'],
    [{event:{headHitAt:3850}},'mandibula'],[{event:{drawAt:3850}},'desenvainar'],
    [{event:{attackAt:3800,attackKind:'heavy'},state:{weapon:'katana'}},'tajo-aereo'],
    [{event:{rollAt:3860}},'rodar'],[{event:{rollAt:3860,sideRoll:-1}},'esquiva-lateral'],
    [{event:{jumpAt:3860}},'aterrizar'],[{rig:{wasDown:true}},'incorporar'],
    [{event:{cue:{at:3600,id:'abrir'}}},'abrir'],
    ...Object.entries({uprock:'uprock',entrenar:'saco',provocar:'provocar',lanzar:'lanzar',abrir:'abrir'}).map(([move,id])=>[{state:{emote:{move,at:3800}}},id])
  ] as const)expect(run(data).action?.id).toBe(id);
  expect(run({speed:2,event:{kickAt:3900}}).base).toBeUndefined();
  expect(run({speed:2,state:{carried:true}}).base).toBeUndefined();
  expect(run({speed:3,state:{buffs:['paso-der','corriendo']}}).base.mirror).toBe(true);
});
const output=process.env.VERTICE_MOVESET_FOTOS;
it.skipIf(!output)('compara las dos versiones a 60 Hz sobre la ropa, el cromo y los cuerpos del juego',async()=>{
  installCapture(data);
  registerUniversal((await new GLTFLoader().parseAsync(bytes('client/public/models/anim/ual2.glb'),'')).animations);
  const native=createRequire(import.meta.url)(process.env.VERTICE_CANVAS??'@napi-rs/canvas');
  const out=output!;mkdirSync(out,{recursive:true});
  const models=[
    await mannequin('femenino',['body-cyber','gorra-striker'],{id:'corredor',part:'pierna_izq'},native),
    await mannequin('masculino',['cazadora-cremallera','pantalon-cuero-ajustado'],{id:'vigia',part:'brazo_der'},native)
  ];
  function panel(title:string,note:string,rows:number,cols=4){
    const w=cols*232+48,h=120+rows*250,cv=native.createCanvas(w,h),c=cv.getContext('2d');
    c.fillStyle='#111b24';c.fillRect(0,0,w,h);c.fillStyle='#72e7cb';c.fillRect(20,27,4,48);
    c.font='bold 28px DejaVu Sans';c.fillStyle='#eaf2ee';c.fillText(title,38,44);
    c.font='14px DejaVu Sans';c.fillStyle='#bdcfd3';c.fillText(note,39,70);
    return {cv,c};
  }
  function cell(sheet:any,model:any,col:number,row:number,label:string,angle:number){
    const x=22+col*232,y=91+row*250,c=sheet.c;
    const grad=c.createLinearGradient(0,y,0,y+205);grad.addColorStop(0,'#30424e');grad.addColorStop(1,'#1d303a');
    c.fillStyle=grad;c.fillRect(x,y,224,205);
    c.fillStyle='#172831';c.beginPath();c.ellipse(x+112,y+193,46,5,0,0,2*Math.PI);c.fill();
    // La cámara de la muestra sigue la pelvis horizontalmente durante el uprock.
    const body=model.human.bones.get('pelvis'),origin=model.human.kit.rest.get('pelvis').p;
    const center=body.getWorldPosition(new T.Vector3()).sub(origin);
    const track=Math.cos(angle)*center.x-Math.sin(angle)*center.z;
    c.drawImage(renderPose(model,native,224,205,angle,track),x,y);
    c.fillStyle='#c5eee6';c.font='bold 14px DejaVu Sans';c.fillText(label,x,y+227);
  }
  function reset(model:any){const b=model.human.bones.get('pelvis');const k=model.human.kit;const p=k.parent.get('pelvis');b.position.copy(k.rest.get('pelvis').p);if(p)b.position.applyMatrix4(k.rest.get(p).m.clone().invert());}
  const sheet=panel('Del paseo a la carrera','Mismo cuerpo, pierna Corredora izquierda y cámara. Cada columna usa la misma entrada y el mismo instante.',2);
  const actions=panel('Guardias, combate y baile','Cuerpo masculino con brazo Vigía y cazadora. Fotogramas del reproductor de Vértice.',2);
  const metrics:any={},framesOut=process.env.VERTICE_MOVESET_FOTOGRAMAS;
  if(framesOut)mkdirSync(framesOut,{recursive:true});
  for(const current of [false,true]){
    const m=models[0];reset(m);const r=rig(m.human),e=actor();
    let last:T.Quaternion[]|undefined,previousDelta:T.Quaternion[]|undefined;
    const deltas:number[][]=[[],[],[]], acceleration:number[][]=[[],[],[]];
    for(let f=0;f<219;f++){
      const speed=f<30?0:f<100?2.25:f<174?4.15:0;
      e.moving=speed>0;e.y+=speed/60;e.s.buffs=speed>4?['corriendo']:[];
      step(r,e,f,current);
      const quats=tracked.map(k=>m.human.bones.get(k).quaternion.clone());
      if(last){
        const steps=quats.map((q,i)=>q.angleTo(last![i])*180/Math.PI);
        const delta=quats.map((q,i)=>last![i].clone().invert().multiply(q));
        const section=f>=49&&f<=96?0:f>=122&&f<=170?1:(f>=100&&f<114)||(f>=174&&f<189)?2:-1;
        if(section>=0 && previousDelta){
          deltas[section].push(...steps);
          acceleration[section].push(...delta.map((q,i)=>q.angleTo(previousDelta![i])*180/Math.PI));
        }
        previousDelta=delta;
      }
      last=quats;
      const snaps=[65,86,147,185],slot=snaps.indexOf(f);
      if(slot>=0)cell(sheet,m,slot,current?1:0,(current?'0.26':'0.25')+'  ·  '+['Andar I','Andar II','Correr','Frenar'][slot],1.09);
      if(framesOut && f>=62&&f<190&&f%4===2){
        const shot=renderPose(m,native,220,245,1.09);
        writeFileSync(join(framesOut,(current?'b':'a')+String((f-62)/4).padStart(3,'0')+'.png'),shot.toBuffer('image/png'));
      }
    }
    for(const [i,label] of ['marcha','carrera','transiciones'].entries()){
      const vals=deltas[i].sort((a,b)=>a-b);
      const acc=acceleration[i].sort((a,b)=>a-b);
      (metrics[current?'0.26':'0.25']??={})[label]={muestras:vals.length,p95:+vals[Math.floor(.95*(vals.length-1))].toFixed(2),maximo:+vals.at(-1)!.toFixed(2),cambioVelocidadP95:+acc[Math.floor(.95*(acc.length-1))].toFixed(2)};
      expect(vals.length).toBeGreaterThan(200);
    }
    expect(metrics[current?'0.26':'0.25'].carrera.p95).toBeGreaterThan(1);
  }
  const scenes=[
    {label:'Guardia de puños',guard:true,flags:[],now:70}, {label:'Guardia con escudo',guard:true,flags:['escudo'],now:70},
    {label:'Jab',hit:true,now:49}, {label:'Impacto en la mandíbula',hurt:true,now:58},
    {label:'Esquiva frontal',roll:true,now:53}, {label:'Ensayo de boxeo',move:'entrenar',now:65},
    {label:'Brooklyn Uprock I',move:'uprock',now:72}, {label:'Brooklyn Uprock II',move:'uprock',now:133}
  ];
  for(const [i,scene] of scenes.entries()){
    const m=models[1];reset(m);const r=rig(m.human),e=actor();e.s.buffs=scene.flags??[];
    for(let f=0;f<=scene.now;f++){
      if(f===41){
        if(scene.hit){e.attackAt=f*1000/60;e.attackKind='hit';e.swingN=1;}
        if(scene.hurt){e.hurtAt=e.headHitAt=f*1000/60;}
        if(scene.roll)e.rollAt=f*1000/60;
        if(scene.move)e.s.emote={move:scene.move,at:f*1000/60};
      }
      step(r,e,f,true,!!scene.guard&&f>=41);
    }
    const original=m.meshes.length;
    if(r.shield?.visible){
      const outline=r.shield.children[1];
      m.meshes.push({mesh:outline,tint:[100,232,218]});
    }
    cell(actions,m,i%4,Math.floor(i/4),scene.label,i===4?1.09:-.7);
    m.meshes.length=original;
    r.shield?.removeFromParent();
  }
  writeFileSync(join(out,'marcha-carrera.png'),sheet.cv.toBuffer('image/png'));
  writeFileSync(join(out,'acciones.png'),actions.cv.toBuffer('image/png'));
  writeFileSync(join(out,'fluidez.json'),JSON.stringify(metrics,null,2)+'\n');
},120000);
