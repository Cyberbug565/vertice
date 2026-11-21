// Banco de pruebas fotográficas. VERTICE_CAPTURAS apunta a los estados de la partida
// escritos por server/test/ciudad-viva. Sin la variable, la suite normal omite el render.
import { expect, it, vi } from 'vitest';
vi.mock('../src/settings',()=>({settings:{}}));
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as THREE from 'three';
import { Atlas, type MapKnowledge, type ZoneDef } from '@vertice/shared';
import cityData from '../../content/zones/vertice.json';
import { mapTerrain } from '../src/ui/minimap';
import { MapViewport, atlasMarks, paintAtlas } from '../src/ui/atlas-view';
import { Chars3D } from '../src/render/chars3d';
import { cadence, type Gait } from '../src/render/locomotion';
import { mannequin, renderPose } from '../../tools/pruebas-ciudad/modelos.mjs';

const output=process.env.VERTICE_CAPTURAS;
const city=cityData as ZoneDef;

function rigFor(model:any){
  const rig:any={human:model.human,speed:0,heading:0,phase:0,lastX:0,lastY:0,lie:0,coat:[],leftFrame:new Float64Array(6),rightFrame:new Float64Array(6)};
  const joints='root body hips chest spine neck shadow handL handR thighL thighR kneeL kneeR ankleL ankleR toeL toeR shoulderL shoulderR elbowL elbowR';
  for(const joint of joints.split(' '))rig[joint]=new THREE.Group();
  return rig;
}
function pose(model:any,style:Gait,speed:number,phase:number,buffs:string[],guard=false){
  const rig=rigFor(model),renderer=Object.create(Chars3D.prototype),dt=1/120;
  const ent={s:{id:1,kind:'player',buffs},x:0,y:0,moving:true};
  rig.speed=speed;rig.phase=((phase-160*dt*cadence(style,speed))%1+1)%1*2*Math.PI;
  for(let frame=1;frame<=160;frame++){
    ent.y=frame*dt*speed;
    renderer.animate(rig,ent,{meId:1,guarding:guard,now:frame*dt*1000,serverNow:frame*dt*1000,dt});
    renderer.applyHuman(rig);
  }
  expect(Number.isFinite(rig.kneeR.rotation.x)).toBe(true);
  return {knee:Math.round(rig.kneeR.rotation.x*180/Math.PI),other:Math.round(rig.kneeL.rotation.x*180/Math.PI)};
}

it.skipIf(!output)('fotografía el atlas y las ocho poses con los mismos datos y articulaciones que usa el cliente',async()=>{
  const load=createRequire(import.meta.url);
  const native=load(process.env.VERTICE_CANVAS??'@napi-rs/canvas');
  const out=output!;
  mkdirSync(out,{recursive:true});
  const text=(ctx:any,copy:string,x:number,y:number,size:number,ink='#deedf2',bold=false)=>{
    ctx.font=(bold?'bold ':'')+size+'px DejaVu Sans, sans-serif';ctx.fillStyle=ink;ctx.fillText(copy,x,y);
  };
  const paper=(title:string,subtitle:string,w:number,h:number)=>{
    const result=native.createCanvas(w,h),ctx=result.getContext('2d');
    ctx.fillStyle='#101821';ctx.fillRect(0,0,w,h);ctx.fillStyle='#67dfcc';ctx.fillRect(24,23,4,58);
    text(ctx,title,42,50,30,'#ecf3f5',true);text(ctx,subtitle,43,77,16,'#a5b5c0');
    return {result,ctx};
  };
  const states:MapKnowledge[]=JSON.parse(readFileSync(join(out,'estados.json'),'utf8'));
  expect(states[0].cells.filter(k=>k.startsWith('vertice@')).length).toBeGreaterThan(2);
  expect(states[0].places.includes('clinica-sato')).toBe(false);
  expect(states[1].places.includes('clinica-sato')).toBe(true);
  expect(states[2].unlocked).toBe(true);
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(name:string)=>{if(name!=='canvas')throw Error(name);return native.createCanvas(1,1);}}});
  try{
    const {result,ctx}=paper('Explorar Ferro','Misma partida · datos de la partida antes de entrar, al registrar la visita y después de descifrar el plano.',1390,488);
    const captions=[['Desde la calle','La ruta está descubierta. La clínica aún no tiene marcador.'],['Tras entrar','La Clínica Sato ya figura entre los lugares conocidos.'],['Interfaz 15','El plano municipal revela los demás servicios.']];
    for(let i=0;i<states.length;i++){
      const atlas=new Atlas();atlas.apply(states[i],true);
      const camera=new MapViewport(city);camera.width=440;camera.height=264;camera.zoom=5.8;camera.focus({x:40.5,y:200});
      const inner=native.createCanvas(camera.width,camera.height), marks=atlasMarks(city,atlas);
      paintAtlas(inner.getContext('2d'),mapTerrain(city,atlas,1.5),camera,marks,i===0?{x:39.5,y:201.5}:null,null);
      const ox=22+i*455;
      text(ctx,captions[i][0],ox,124,21,'#81ead6',true);
      ctx.drawImage(inner,ox,142);
      const j=captions[i][1].lastIndexOf(' ',46);
      text(ctx,captions[i][1].slice(0,j),ox,435,15);
      text(ctx,captions[i][1].slice(j+1),ox,456,15);
    }
    writeFileSync(join(out,'mapa.png'),result.toBuffer('image/png'));
  }finally{
    if(original)Object.defineProperty(globalThis,'document',original);
    else Reflect.deleteProperty(globalThis,'document');
  }
  const configurations=[
    {kind:'femenino',garments:['cazadora-cremallera','falda-volantes','gorra-striker'],implant:{id:'corredor',part:'pierna_izq'},
      file:'pierna-corredora.png',title:'Pierna Corredora izquierda',subtitle:'Cazadora con cremallera, falda y gorra · mallas del juego sobre el esqueleto del personaje.',
      shots:[['Apoyo','marcha',2.45,.50,[]],['Despegue','marcha',2.45,.12,[]],['Balanceo','trote',4.0,.23,['corriendo']],['Esprint','esprint',5.7,.22,['esprint']]]},
    {kind:'masculino',garments:['abrigo-monje','pantalon-cuero-ajustado','botas-striker'],implant:{id:'vigia',part:'brazo_der'},
      file:'estilos-de-paso.png',title:'Cuatro estilos de movimiento',subtitle:'Modelo masculino con abrigo, pantalón de cuero, botas y brazo Vigía derecho.',
      shots:[['Paseo','paseo',1.35,.07,[]],['Trote','trote',4.1,.72,['corriendo']],['Cautela','cautela',1.95,.18,[]],['Cojera izquierda','cojera',2.2,.24,['paso-izq']]]}
  ];
  for(const setup of configurations){
    const model=await mannequin(setup.kind,setup.garments,setup.implant,native);
    const {result,ctx}=paper(setup.title,setup.subtitle,1355,572);
    for(const [i,s] of setup.shots.entries()){
      const [label,style,speed,phase,flags]=s as [string,Gait,number,number,string[]];
      const a=pose(model,style,speed,phase,flags,style==='cautela');
      const ox=22+i*333,gradient=ctx.createLinearGradient(ox,105,ox,488);
      gradient.addColorStop(0,'#293e4e');gradient.addColorStop(1,'#18252e');
      ctx.fillStyle=gradient;ctx.fillRect(ox,103,315,372);
      ctx.fillStyle='#121e25';ctx.beginPath();ctx.ellipse(ox+158,451,83,9,0,0,Math.PI*2);ctx.fill();
      const layer=renderPose(model,native,315,372,setup.kind==='femenino'?1.02:-.99);
      ctx.drawImage(layer,ox,103);text(ctx,label,ox+3,509,22,'#9cf0df',true);
      text(ctx,'Rodillas I / D     '+a.knee+'° / '+a.other+'°',ox+3,539,16,'#c1d1db');
    }
    writeFileSync(join(out,setup.file),result.toBuffer('image/png'));
  }
},120000);
