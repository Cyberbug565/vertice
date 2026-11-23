// Las rotaciones se expresan respecto a la postura de reposo en coordenadas de modelo.
// Cada cuerpo conserva sus longitudes, su bind pose y las mallas ya ligadas a sus huesos.
import { Quaternion, Vector3, type Bone } from 'three';
import type { Human } from './human3d';
import type { Gait } from './locomotion';

interface Clip { frame: number; count: number; loop: boolean }
interface Index { bones: string[]; clips: Record<string,Clip>; stride: number }
export type Mask = 'cuerpo' | 'piernas' | 'torso';
export interface Sample { id: string; phase: number; mask?: Mask; mirror?: boolean }
let bank: { index: Index; data: Int16Array } | undefined;
let pending = false, retryAt = 0;

export function installCapture(buffer: ArrayBuffer) {
  const head = new DataView(buffer);
  if (head.getUint32(0) !== 0x56544d31) throw Error('Cabecera VTM desconocida');
  const end = 8 + head.getUint32(4,true);
  const index: Index = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,end-8)));
  const data = new Int16Array(buffer,end);
  if (index.stride !== index.bones.length*4+15 || Object.values(index.clips).some(c => c.count<2 || c.frame<0 || (c.frame+c.count)*index.stride>data.length)) throw Error('Banco de movimiento incompleto');
  bank = {index,data};
}
export function loadCapture() {
  if (bank || pending || Date.now()<retryAt || typeof window==='undefined') return;
  pending=true;
  void fetch('/models/anim/ciudad-026.vtm').then(async response=>{
    if (!response.ok) throw Error(String(response.status));
    installCapture(await response.arrayBuffer());
  }).catch(err=>{ retryAt=Date.now()+30000; console.warn('[movimiento]',err); }).finally(()=>{ pending=false; });
}
export function captureLength(id: string) { const clip=bank?.index.clips[id];return clip?(clip.count-1)/30:0; }
function indices(clip: Clip, phase: number) {
  const p = clip.loop ? phase-Math.floor(phase) : Math.min(1,Math.max(0,phase));
  const position = p*(clip.count-1), a = Math.floor(position), stride=bank!.index.stride;
  return {a:(clip.frame+a)*stride,b:(clip.frame+Math.min(a+1,clip.count-1))*stride,u:position-a};
}
export function gaitCapture(style: Gait, flags: readonly string[], speed: number, rifle: boolean) {
  if (style==='carga' || flags.includes('invisible')) return '';
  if (style==='cojera') return flags.includes('corriendo') || speed>3.2 ? 'herido' : '';
  if (flags.includes('paso-ebrio')) return 'ebrio';
  if (style==='esprint') return 'correr';
  if (style==='trote') return 'trotar';
  if (rifle) return 'fusil';
  // La marcha base está en ciclos.json para ambos renderizadores.
  return '';
}
export function capturedLegs(id: string, phase: number, left: Float64Array, right: Float64Array, mirror=false) {
  const clip=bank?.index.clips[id]; if (!bank || !clip) return false;
  const {a,b,u}=indices(clip,phase), start=bank.index.stride-12,data=bank.data;
  for (let side=0;side<2;side++){
    const out=side===0?left:right,offset=start+6*(mirror?1-side:side);
    for(let k=0;k<6;k++)out[k]=(data[a+offset+k]*(1-u)+data[b+offset+k]*u)*Math.PI/32767;
  }
  return true;
}
interface Binding { bone: Bone; rest: Quaternion; inv: Quaternion; lower: boolean; index: number; opposite: number; last: Quaternion; from: Quaternion }
const qa=new Quaternion(), qb=new Quaternion(), identity=new Quaternion(), v=new Vector3();
export class CapturePlayer {
  private joints: Binding[]=[];
  private pelvis: Bone;
  private origin: Vector3;
  private vertical: Vector3;
  private right: Vector3;
  private forward: Vector3;
  private lastOffset=new Vector3();
  private fromOffset=new Vector3();
  private offset=new Vector3();
  private key='';
  private changed=-Infinity;
  private seen=false;
  private previousTime=-Infinity;
  constructor(human: Human) {
    const names=bank!.index.bones;
    for (const [i,name] of names.entries()) {
      const bone=human.bones.get(name),rest=human.kit.rest.get(name);
      if (!bone || !rest) continue;
      const par=human.kit.parent.get(name),parent=par?human.kit.rest.get(par)?.q:undefined;
      const other=name.endsWith('_l')?name.slice(0,-1)+'r':name.endsWith('_r')?name.slice(0,-1)+'l':name;
      this.joints.push({bone,rest:rest.q,inv:(parent??identity).clone().invert(),lower:/^(pelvis|thigh_|calf_|foot_|ball_)/.test(name),index:i*4,opposite:names.indexOf(other)*4,last:bone.quaternion.clone(),from:bone.quaternion.clone()});
    }
    this.pelvis=human.bones.get('pelvis')!;
    this.origin=this.pelvis.position.clone();
    const parent=human.kit.rest.get(human.kit.parent.get('pelvis')??'');
    // La altura se convierte a la escala local del padre, también en modelos exportados en centímetros.
    this.vertical=new Vector3(0,human.kit.rest.get('pelvis')!.p.y,0);
    this.right=new Vector3(this.vertical.y,0,0);
    this.forward=new Vector3(0,0,this.vertical.y);
    if(parent){
      const inverse=parent.m.clone().invert();
      for(const axis of [this.right,this.vertical,this.forward])axis.applyMatrix4(inverse).sub(v.set(0,0,0).applyMatrix4(inverse));
    }
  }
  // El render base recalcula rotaciones cada frame. El fundido parte de la pose realmente mostrada.
  apply(base: Sample | undefined, overlay: Sample | undefined, now: number) {
    const key=[base?.id,base?.mask,base?.mirror,overlay?.id,overlay?.mask,overlay?.mirror].join('|');
    if (key!==this.key) {
      this.changed=now;this.key=key;this.fromOffset.copy(this.lastOffset);
      for(const j of this.joints)j.from.copy(this.seen?j.last:j.bone.quaternion);
    }
    const length=overlay?.id==='jab'||overlay?.id==='boxeo'?85:160;
    const weight=Math.min(1,Math.max(0,(now-this.changed)/length));
    const w=weight*weight*(3-2*weight);
    this.offset.set(0,0,0);
    for(const sample of [base,overlay]){
      const clip=sample&&bank!.index.clips[sample.id];
      if(!sample || !clip)continue;
      const {a,b,u}=indices(clip,sample.phase),d=bank!.data;
      for(const j of this.joints){
        if((sample.mask==='piernas' && j.index===0) || j.bone.scale.x<.01 || (sample.mask==='torso'&&j.lower) || (sample.mask==='piernas'&&!j.lower))continue;
        const o=sample.mirror?j.opposite:j.index,sign=sample.mirror?-1:1;
        qa.set(d[a+o],sign*d[a+o+1],sign*d[a+o+2],d[a+o+3]).normalize();
        qb.set(d[b+o],sign*d[b+o+1],sign*d[b+o+2],d[b+o+3]).normalize();
        j.bone.quaternion.copy(qa.slerp(qb,u)).premultiply(j.inv).multiply(j.rest).normalize();
      }
      if(sample.mask!=='torso'){
        const i=bank!.index.bones.length*4;
        const amount=(k:number)=>(d[a+i+k]*(1-u)+d[b+i+k]*u)*2/32767;
        this.offset.copy(this.vertical).multiplyScalar(amount(0)).addScaledVector(this.right,amount(1)*(sample.mirror?-1:1)).addScaledVector(this.forward,amount(2));
      }
    }
    const step=Math.max(0,Math.min(100,now-this.previousTime));
    this.previousTime=now;
    const keep=this.seen && base && !overlay ? Math.exp(-step/46) : 0;
    for(const j of this.joints){
      if(w<1)j.bone.quaternion.slerp(j.from,1-w);
      if(keep && (base!.mask!=='piernas'||j.lower))j.bone.quaternion.slerp(j.last,keep);
      if(this.seen && !overlay){
        // Al arrancar o frenar limita la corrección al cambio de pose. La fase del paso sigue avanzando.
        const angle=j.last.angleTo(j.bone.quaternion),maxTurn=step*(w<1||!base? .0065 : .0105);
        if(angle>maxTurn)j.bone.quaternion.slerp(j.last,1-maxTurn/angle);
      }
      j.last.copy(j.bone.quaternion);
    }
    this.lastOffset.lerpVectors(this.fromOffset,this.offset,w);
    this.pelvis.position.copy(this.origin).add(this.lastOffset);
    this.seen=true;
  }
}
