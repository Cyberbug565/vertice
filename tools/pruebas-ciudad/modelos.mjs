// Carga las mallas del repositorio sin navegador. El banco devuelve las posiciones
// deformadas por Three y conserva el mismo esqueleto para el cuerpo, la ropa y el implante.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as T from 'three';
import { garmentById } from '@vertice/shared';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bindGarment } from '../../client/src/render/garment-skinning';
import { fitImplant, implantEntries, implantRegions } from '../../client/src/render/implants3d';

const models=resolve('client/public/models');
const read=(file)=>readFileSync(file);
async function loadMesh(file,canvas){
  const path=resolve(models,file), bytes=read(path);
  let doc,buffer;
  if(file.endsWith('.glb')){
    const length=bytes.readUInt32LE(12);
    doc=JSON.parse(bytes.subarray(20,20+length).toString());
    buffer=bytes.subarray(28+length);
  }else{
    doc=JSON.parse(bytes.toString());
    buffer=read(resolve(dirname(path),doc.buffers[0].uri));
  }
  const textures=new Map();
  for(const m of doc.materials??[]){
    const t=m.pbrMetallicRoughness?.baseColorTexture;
    if(!t)continue;
    const im=doc.images[doc.textures[t.index].source];
    const view=doc.bufferViews?.[im.bufferView];
    const data=view?buffer.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength):read(resolve(dirname(path),im.uri));
    const tex=canvas.createCanvas(256,256), ctx=tex.getContext('2d');
    ctx.drawImage(await canvas.loadImage(data),0,0,256,256);
    textures.set(m.name,ctx.getImageData(0,0,256,256).data);
  }
  doc.materials=(doc.materials??[]).map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1]}}));
  doc.images=[];doc.textures=[];
  doc.buffers[0].uri='data:application/octet-stream;base64,'+buffer.toString('base64');
  if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
  const asset=await new GLTFLoader().parseAsync(JSON.stringify(doc),'');
  asset.scene.updateMatrixWorld(true);
  const meshes=[];
  asset.scene.traverse(obj=>{if(obj.isSkinnedMesh)meshes.push(obj);});
  return {scene:asset.scene,meshes,textures,mask:doc.scenes[doc.scene??0].extras?.vt_hide};
}
export async function mannequin(kind,clothes,implant,canvas){
  const base=await loadMesh('humanos/Superhero_'+(kind==='femenino'?'Female':'Male')+'_FullBody.gltf',canvas);
  const body=base.meshes.find(m=>m.material.name.includes('Superhero'));
  const bones=new Map(),rest=new Map(),parent=new Map(),order=[];
  base.scene.traverse(b=>{
    if(!b.isBone)return;
    bones.set(b.name,b);order.push(b.name);
    parent.set(b.name,b.parent?.isBone?b.parent.name:null);
    rest.set(b.name,{q:b.getWorldQuaternion(new T.Quaternion()),p:b.getWorldPosition(new T.Vector3()),m:b.matrixWorld.clone()});
  });
  const pos=body.geometry.getAttribute('position'), si=body.geometry.getAttribute('skinIndex'),sw=body.geometry.getAttribute('skinWeight');
  const hidden=new Uint8Array(pos.count),covered=new Uint8Array(pos.count),reg=new Float32Array(pos.count);
  const meshes=base.meshes.map(mesh=>({mesh,tex:base.textures.get(mesh.material.name),tint:null,hidden:mesh===body?hidden:null}));
  const side=implant.part.endsWith('izq')?'_l':'_r';
  for(let i=0;i<pos.count;i++){
    let j=0;for(let k=1;k<4;k++)if(sw.getComponent(i,k)>sw.getComponent(i,j))j=k;
    const name=body.skeleton.bones[si.getComponent(i,j)].name;
    if(name.endsWith(side)){
      const segment=implant.part.startsWith('pierna')?['thigh','calf','foot','ball'].find(t=>name.startsWith(t)):['upperarm','lowerarm','hand','index','middle','pinky','ring','thumb'].find(t=>name.startsWith(t));
      if(segment){hidden[i]=1;reg[i]=implantRegions(implant.part)[0];}
    }
  }
  for(const file of clothes){
    const g=await loadMesh('prendas/'+kind+'/'+file+'.glb',canvas);
    const bits=g.mask?Buffer.from(g.mask,'base64'):null;
    if(bits)for(let i=0;i<pos.count;i++)if(bits[i>>3]&(128>>(i&7))){hidden[i]=1;covered[i]=1;}
    for(const original of g.meshes){
      const mesh=bindGarment(original,body);
      // El shader de las prendas separa cada capa en la dirección de su normal.
      // Replica ese desplazamiento en la geometría del banco, que no ejecuta shaders.
      mesh.geometry=mesh.geometry.clone();
      const position=mesh.geometry.getAttribute('position'), normal=mesh.geometry.getAttribute('normal');
      const distance=Number(((garmentById(file)?.layer??0)*.0035).toFixed(4));
      for(let v=0;v<position.count;v++)position.setXYZ(v,position.getX(v)+normal.getX(v)*distance,
        position.getY(v)+normal.getY(v)*distance,position.getZ(v)+normal.getZ(v)*distance);
      body.parent.add(mesh);
      meshes.push({mesh,tex:g.textures.get(original.material.name),tint:[142,155,166]});
    }
  }
  const chrome=await loadMesh('cromo/'+kind+'/'+implant.id+'.glb',canvas);
  const source=implantEntries(chrome.scene).get(implant.id+'_'+(side==='_l'?'izq':'der'));
  if(!source)throw Error('Falta el implante '+implant.id+' '+side);
  const fitted=fitImplant(source,body,{reg,pos:pos.array,L:{}},{mask:covered,sleeve:0,trouser:0,shoes:false,gloves:false,outfit:false});
  body.parent.add(fitted);
  meshes.push({mesh:fitted,tint:[163,181,195],metal:true,hidden:fitted.geometry.getAttribute('aClothHide')?.array});
  return {scene:base.scene,meshes,human:{bones,kit:{order,parent,rest},root:base.scene}};
}

// Proyección ortográfica con z-buffer y texturas de color de los propios glTF.
export function renderPose(model,canvas,width,height,yaw=.98){
  model.scene.updateMatrixWorld(true);
  const surface=canvas.createCanvas(width,height),ctx=surface.getContext('2d');
  const img=ctx.createImageData(width,height),depth=new Float32Array(width*height).fill(-Infinity);
  const co=Math.cos(yaw),si=Math.sin(yaw),scale=height*.485;
  const v=new T.Vector3(), n=new T.Vector3(), l=new T.Vector3(-.4,.8,.55).normalize();
  for(const part of model.meshes){
    const {mesh,tex,hidden,metal}=part,g=mesh.geometry, pos=g.getAttribute('position'),uv=g.getAttribute('uv'),col=g.getAttribute('color');
    mesh.skeleton.update();
    const points=new Float32Array(pos.count*6);
    for(let i=0;i<pos.count;i++){
      mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);
      const a=i*6,forward=si*v.x+co*v.z;
      points[a]=width*.5+(co*v.x-si*v.z)*scale;
      points[a+1]=height*.94-(v.y*.993-forward*.115)*scale;
      points[a+2]=forward*.993+v.y*.115;
      points[a+3]=v.x;points[a+4]=v.y;points[a+5]=v.z;
    }
    const size=g.index?.count??pos.count;
    for(let t=0;t<size;t+=3){
      const ia=g.index?g.index.getX(t):t,ib=g.index?g.index.getX(t+1):t+1,ic=g.index?g.index.getX(t+2):t+2;
      if(hidden && hidden[ia]&&hidden[ib]&&hidden[ic])continue;
      const a=ia*6,b=ib*6,c=ic*6;
      const ax=points[a],ay=points[a+1],bx=points[b],by=points[b+1],cx=points[c],cy=points[c+1];
      const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(d)<.0001)continue;
      const x1=points[b+3]-points[a+3],y1=points[b+4]-points[a+4],z1=points[b+5]-points[a+5];
      const x2=points[c+3]-points[a+3],y2=points[c+4]-points[a+4],z2=points[c+5]-points[a+5];
      n.set(y1*z2-z1*y2,z1*x2-x1*z2,x1*y2-y1*x2).normalize();
      const lighting=.61+.49*Math.max(0,n.dot(l))+.15*Math.max(0,n.x*si+n.z*co);
      const fallback=part.tint??(mesh.name.includes('Eye')?[60,41,34]:[193,140,117]);
      let rgb=col?[col.getX(ia),col.getY(ia),col.getZ(ia)].map(value=>Math.min(255,Math.max(0,255*Math.pow(value,1/2.2)))):fallback;
      const ux=uv?uv.getX(ia):0,uy=uv?uv.getY(ia):0, vx=uv?uv.getX(ib):0,vy=uv?uv.getY(ib):0,wx=uv?uv.getX(ic):0,wy=uv?uv.getY(ic):0;
      for(let y=Math.max(0,Math.floor(Math.min(ay,by,cy)));y<=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));y++){
        for(let x=Math.max(0,Math.floor(Math.min(ax,bx,cx)));x<=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));x++){
          const A=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/d,B=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/d,C=1-A-B;
          if(Math.min(A,B,C)<-.000002)continue;
          if(hidden && A*hidden[ia]+B*hidden[ib]+C*hidden[ic]>.5)continue;
          const zi=A*points[a+2]+B*points[b+2]+C*points[c+2],index=y*width+x;
          if(zi<=depth[index])continue;
          let at=-1;
          if(tex&&uv){const u=A*ux+B*vx+C*wx,vv=A*uy+B*vy+C*wy;at=4*((Math.floor(vv*256)&255)*256+(Math.floor(u*256)&255));if(tex[at+3]<120)continue;}
          depth[index]=zi;
          for(let j=0;j<3;j++)img.data[4*index+j]=(at>=0?tex[at+j]:rgb[j])*lighting+(metal?6:0);
          img.data[4*index+3]=255;
        }
      }
    }
  }
  ctx.putImageData(img,0,0);
  return surface;
}
