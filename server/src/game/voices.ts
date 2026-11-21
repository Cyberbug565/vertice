import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import type { ItemDef } from '@vertice/shared';

const phrase = z.string().trim().min(1).max(300);
const requirements = z.object({
  all:z.array(z.string()).default([]), any:z.array(z.string()).default([]), none:z.array(z.string()).default([])
});
const streetSchema = z.object({
  id:z.string().min(1), requiere:requirements, comentarios:z.array(phrase),
  escenas:z.array(z.object({abre:phrase,respuestas:z.array(phrase).nonempty(),requiere:requirements.optional()}))
});
const missionSchema=z.object({id:z.string(),etapas:z.record(z.string(),z.array(phrase).nonempty())});
function readModules<T>(dir:string,schema:z.ZodType<T>):T[] {
  const base=new URL('../../voices/'+dir+'/',import.meta.url);
  return readdirSync(base).filter(f=>f.endsWith('.json')).sort().map(f=>{
    const parsed=schema.safeParse(JSON.parse(readFileSync(new URL(f,base),'utf8')));
    if(!parsed.success)throw new Error('Voces de '+f+' · '+parsed.error.message);
    return parsed.data;
  });
}
export const streetModules=readModules('calle',streetSchema);
export const missionModules=new Map(readModules('misiones',missionSchema).map(m=>[m.id,m.etapas]));
export function matches(tags:ReadonlySet<string>,rule:z.infer<typeof requirements>) {
  return rule.all.every(t=>tags.has(t)) && (!rule.any.length||rule.any.some(t=>tags.has(t))) && !rule.none.some(t=>tags.has(t));
}
export function powerful(item?:ItemDef) {
  return !!item?.weapon && (item.weapon.damage[1]>=30||item.rarity==='legendario'||item.rarity==='mitico');
}
export class Voices {
  private history=new WeakMap<object,Map<string,unknown[]>>();
  constructor(private random=Math.random) {}
  private pick<T>(speaker:object,key:string,list:readonly T[]):T|undefined {
    if(!list.length)return;
    let h=this.history.get(speaker);
    if(!h){h=new Map();this.history.set(speaker,h);}
    const recent=h.get(key)??[],available=list.filter(v=>!recent.includes(v));
    const pool=available.length?available:list;
    const value=pool[Math.floor(this.random()*pool.length)];
    h.set(key,[...recent,value].slice(-Math.min(5,Math.max(1,list.length-1))));
    return value;
  }
  conversation(speaker:object,tags:ReadonlySet<string>):[string,string]|undefined {
    const eligible=streetModules.filter(m=>m.escenas.length && matches(tags,m.requiere) && m.escenas.some(s=>!s.requiere||matches(tags,s.requiere)));
    const local=eligible.filter(m=>m.requiere.all.length||m.requiere.any.length);
    const m=this.pick(speaker,'tema',local.length && this.random()<.78 ? local : eligible);
    if(!m)return;
    const scene=this.pick(speaker,m.id,m.escenas.filter(s=>!s.requiere||matches(tags,s.requiere)));
    if(scene)return [scene.abre,this.pick(speaker,scene.abre,scene.respuestas)!];
  }
  comment(speaker:object,id:string,tags:ReadonlySet<string>){
    const m=streetModules.find(m=>m.id===id);
    if(m && matches(tags,m.requiere))return this.pick(speaker,'!'+id,m.comentarios);
  }
  reaction(speaker:object,tags:ReadonlySet<string>){
    const options=streetModules.filter(m=>m.comentarios.length && matches(tags,m.requiere));
    const m=this.pick(speaker,'reaccion',options);
    return m && this.pick(speaker,'!'+m.id,m.comentarios);
  }
  mission(speaker:object,id:string,stage:string){
    const lines=missionModules.get(id)?.[stage];
    if(lines)return this.pick(speaker,id+'/'+stage,lines);
  }
}
export const voices=new Voices();
