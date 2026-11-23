// Paseo y marcha trasladan los apoyos y la flexión del ciclo Walk_Unarmed de la release moveset.
import cycles from './motion/ciclos.json';
export type Gait = Exclude<keyof typeof cycles,'canales'>;
const rad=Math.PI/180;
export const gaitProfile=(style:Gait)=>cycles[style];
export function chooseGait(speed:number,running:boolean,guarding:boolean,buffs:readonly string[]=[],injured=false):Gait {
  if(injured)return 'cojera';
  if(buffs.includes('paso-carga'))return 'carga';
  if(guarding||buffs.includes('invisible'))return 'cautela';
  if(buffs.includes('esprint')||speed>=5.1)return 'esprint';
  if(running||speed>2.75)return 'trote';
  return speed<1.28?'paseo':'marcha';
}
function tangent(a:number,b:number){return a*b<=0?0:2*a*b/(a+b);}
export function sampleLeg(style:Gait,phase:number,out:Float64Array) {
  const {tiempos:times,poses}=cycles[style],n=times.length,t=phase-Math.floor(phase);
  let i=0;
  while(i+1<n && times[i+1]<=t)i++;
  const j=(i+1)%n,p=(i+n-1)%n,k=(j+1)%n;
  const period=(a:number,b:number)=>times[b]-times[a]+(b<=a?1:0);
  const step=period(i,j),u=(t-times[i])/step,u2=u*u,u3=u*u2;
  for(let ch=0;ch<out.length;ch++){
    const a=poses[i][ch],b=poses[j][ch],slope=(b-a)/step;
    const left=tangent((a-poses[p][ch])/period(p,i),slope),right=tangent(slope,(poses[k][ch]-b)/period(j,k));
    out[ch]=((2*u3-3*u2+1)*a+(u3-2*u2+u)*step*left+(3*u2-2*u3)*b+(u3-u2)*step*right)*rad;
  }
}
export function cadence(style:Gait,speed:number){return Math.max(.57,Math.min(2.1,speed/cycles[style].zancada));}
