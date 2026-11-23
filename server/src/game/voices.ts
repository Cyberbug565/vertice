import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import type { ItemDef } from '@vertice/shared';
import { parseVoz, type VozModule } from './voz-format.js';

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
/** v0.37 · Los módulos de calle (JSON) y los de zona (.voz) comparten formato en memoria. */
function readVoz(dir:string):VozModule[] {
  const base=new URL('../../voices/'+dir+'/',import.meta.url);
  return readdirSync(base).filter(f=>f.endsWith('.voz')).sort().map(f=>parseVoz(readFileSync(new URL(f,base),'utf8'),dir+'/'+f));
}
export const streetModules:VozModule[]=[
  ...readModules('calle',streetSchema).map(m=>({...m,secuencias:[],burlas:[]})),
  ...readVoz('zonas'),
];
export const missionModules=new Map(readModules('misiones',missionSchema).map(m=>[m.id,m.etapas]));
type Req=z.infer<typeof requirements>;
const NONE:Req={all:[],any:[],none:[]};
export function matches(tags:ReadonlySet<string>,rule:Req) {
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
    h.set(key,[...recent,value].slice(-Math.min(16,Math.max(1,list.length-1))));
    return value;
  }
  /** v0.37 · Elige como el sistema de respuestas por reglas de Valve: de los módulos cuyas reglas cumple el contexto,
   *  gana casi siempre el más específico (más etiquetas exigidas); a veces uno menos específico, para que haya variedad.
   *  La memoria por hablante evita repetir tema, escena y respuesta. */
  private ranked<T extends {requiere:Req}>(speaker:object,key:string,list:readonly T[],tags:ReadonlySet<string>,pTop=.8):T|undefined {
    const ok=list.filter(m=>matches(tags,m.requiere));
    if(!ok.length)return;
    // Lo del sitio (clase del barrio o lugar) pesa más: una frase del barrio gana a una genérica igual de concreta.
    const score=(m:T)=>m.requiere.all.length*2+m.requiere.all.filter(t=>t.startsWith('clase:')).length*1.5+m.requiere.all.filter(t=>t.startsWith('lugar:')).length*2.5
      // Lo que se ve del jugador (pinta, herida, arma, oficio) pesa más que la hora: si vas sangrando, se habla de eso.
      +m.requiere.all.filter(t=>/^(aspecto|jugador|rol):/.test(t)&&t!=='jugador:cerca').length+(m.requiere.any.length?1:0)+m.requiere.none.length*0.25;
    const best=Math.max(...ok.map(score));
    const top=ok.filter(m=>score(m)>=best-0.5);
    return this.pick(speaker,key,this.random()<pTop?top:ok);
  }
  conversation(speaker:object,tags:ReadonlySet<string>,only?:(m:VozModule)=>boolean):string[]|undefined {
    const fits=(r?:Req)=>!r||matches(tags,r);
    const eligible=streetModules.filter(m=>(!only||only(m)) && (m.escenas.some(s=>fits(s.requiere))||m.secuencias.some(s=>fits(s.requiere))));
    const m=this.ranked(speaker,'tema',eligible,tags);
    if(!m)return;
    // Dentro del módulo, también gana la escena o secuencia más específica.
    const units=[...m.escenas.filter(s=>fits(s.requiere)).map(s=>({requiere:s.requiere??NONE,s,q:undefined as undefined|VozModule['secuencias'][number]})),
      ...m.secuencias.filter(q=>fits(q.requiere)).map(q=>({requiere:q.requiere??NONE,s:undefined,q}))];
    // Dentro del tema, lo concreto (de noche, con un pijo delante…) sale a menudo, pero sin acaparar.
    const u=this.ranked(speaker,m.id,units,tags,.45);
    if(!u)return;
    if(u.q)return [...u.q.lineas];
    return [u.s!.abre,this.pick(speaker,u.s!.abre,u.s!.respuestas)!];
  }
  /** v0.37 · Frase dirigida al jugador que pasa (burla, piropo envenenado o advertencia), según zona y su aspecto. */
  taunt(speaker:object,tags:ReadonlySet<string>):string|undefined {
    const units=streetModules.filter(m=>matches(tags,m.requiere)).flatMap(m=>m.burlas.map(b=>({requiere:b.requiere??NONE,texto:b.texto,mod:m.requiere})))
      .map(u=>({...u,requiere:{all:[...u.mod.all,...u.requiere.all],any:u.requiere.any.length?u.requiere.any:u.mod.any,none:[...u.mod.none,...u.requiere.none]}}));
    return this.ranked(speaker,'burla',units,tags)?.texto;
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
