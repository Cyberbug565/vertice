import {facingToIdx,nearestWalkable,pedestrianGrid,RULES,type NpcDef,type ZoneDef} from '@vertice/shared';
import type {Entity} from './entity.js';
import type {PlayerConn,World} from './world.js';

type Shift=NpcDef['schedule'][number];
type Door=ZoneDef['doors'][number];
type Resident=NonNullable<NpcDef['resident']>;
type Alert={until:number};
type Life={def:NpcDef;shift?:Shift;target:number;nextStop:number;nextTalk:number;nextWarn:number;recent?:{character:string;until:number};alert?:Alert};
const ticks=(seconds:number)=>Math.round(seconds*RULES.tickRate);

export function shiftAt(def:NpcDef,hour:number):Shift {
  return def.schedule.find(s=>s.from<=s.to?hour>=s.from&&hour<s.to:hour>=s.from||hour<s.to)!;
}
const staffVoice={
  seguridad:['Las salas están señalizadas. Te puedo indicar la salida.','Hoy el turno acaba cuando cierre la última mesa.'],
  policia:['Si hay un problema en la calle, avisa a la patrulla.','Siempre reviso la misma manzana antes del relevo.'],
  venta:['Acércate al mostrador durante mi turno y te enseño lo que queda.','Fuera de turno aprovecho para comprar algo caliente.'],
  reparto:['Busco el número del portal. Las placas del barrio duran una noche.','Aún tengo dos entregas antes de la pausa.'],
  limpieza:['La cuadrilla de noche recoge lo que deja la de día.','Con esta humedad, el neón se pega hasta al suelo.'],
  crupier:['Busca una mesa libre. Cada sala tiene sus propias apuestas.','En cuanto llegue el relevo voy a por un café.'],
  tecnico:['Si el panel parpadea dos veces, vuelve a encenderlo.','Estoy revisando la alimentación de las luces de la calle.'],
  vecino:['Cuando cae el sol cambia hasta el ruido de esta calle.','Si vas hacia la avenida, quédate en la acera.'],
} satisfies Record<Resident['job'],[string,string]>;
const tone={
  cauto:'Prefiero una calle iluminada.',curioso:'Siempre acaba pasando algo por aquí.',
  cordial:'Cuídate por el camino.',seco:'No voy a entretenerte más.',
  metodico:'Todo a su hora.',nervioso:'Un segundo, tengo que mirar detrás.',
} satisfies Record<Resident['temper'],string>;

export class CityPeople {
  private roster=new Map<Entity,Life>();
  private routes=new Map<string,Door[]>();
  private security=new WeakMap<Entity,number>();
  constructor(private readonly world:World){}

  add(e:Entity,def:NpcDef){
    const shift=shiftAt(def,this.world.cityHour());
    const state:Life={def,target:-1,nextStop:0,nextTalk:(e.id%17)*ticks(1),nextWarn:0};
    this.roster.set(e,state);
    this.update(e,state,shift);this.settle(e,state,shift);
  }
  remove(e:Entity){this.roster.delete(e);}
  has(e:Entity){return this.roster.has(e);}
  holdsCasino(e:Entity){return (this.security.get(e)??0)>this.world.tick;}
  private walk(e:Entity,x:number,y:number){
    this.world.metrics.inc('residentPathIntents');
    return this.world.npcPath(e,x,y);
  }
  isWorking(e:Entity){const life=this.roster.get(e);return !!life&&e.zone.id===life.shift?.zone&&shiftAt(life.def,this.world.cityHour()).state==='work'&&life.shift.state==='work';}
  private label(e:Entity,label:string){
    if(e.label!==label){e.label=label;e.labelVer++;}
  }
  private pose(e:Entity,move:Shift['pose']|undefined){
    if(e.emote?.move===move)return;
    e.emote=move?{move,at:Date.now()}:undefined;e.labelVer++;
  }
  private face(e:Entity,x:number,y:number){
    if(Math.hypot(x-e.x,y-e.y)<.1)return;
    const dir=facingToIdx(x-e.x,y-e.y);
    if(dir!==e.facing){e.facing=dir;e.lastMoveTick=this.world.tick+1;}
  }
  private observed(zone:string,x:number,y:number){
    const z=this.world.zones.get(zone);
    if(!z?.players.size)return false;
    const radius=this.world.cfg.viewRadius+5;
    for(const e of z.players)if(Math.hypot(x-e.x,y-e.y)<radius)return true;
    return false;
  }
  private update(e:Entity,life:Life,shift:Shift){
    if(life.shift===shift)return;
    life.shift=shift;life.target=-1;life.nextStop=0;e.path=[];e.moving=false;
    e.npcShop=undefined;
    this.pose(e,undefined);
  }

  // Solo el plan horario se reconcilia cuando no hay observadores. No hay búsqueda de caminos ni conversaciones.
  everySecond(){
    if(!this.roster.size)return;
    const hour=this.world.cityHour();
    for(const [e,life] of this.roster){
      if(!e.npc||e.state==='downed'||e.dead||e.aggro!==undefined||e.carriedBy)continue;
      const shift=shiftAt(life.def,hour),[tx,ty]=shift.at;
      if(life.shift===shift && e.zone.id===shift.zone && e.npc!.state!=='travel')continue;
      if(this.observed(e.zone.id,e.x,e.y))continue;
      this.update(e,life,shift);
      const target=this.world.zones.get(shift.zone)!;
      const stop=nearestWalkable(pedestrianGrid(target.grid,'stop'),tx+.5,ty+.5,8);
      if(!stop)continue;
      let {x,y}=stop;
      if(this.observed(shift.zone,x,y)){
        if(e.zone===target)continue;
        const route=this.route(e.zone.def,shift.zone),last=route.at(-1);
        if(!last)continue;
        [x,y]=[last.to.at[0]+.5,last.to.at[1]+.5];
      }
      if(e.zone===target&&Math.hypot(x-e.x,y-e.y)<.6){
        this.settle(e,life,shift);continue;
      }
      this.world.moveEntityTo(e,target,x,y);
      e.path=[];e.moving=false;life.target=-1;this.pose(e,undefined);
      this.world.metrics.inc('residentDormantTransitions');
      if(Math.hypot(x-stop.x,y-stop.y)<.6)this.settle(e,life,shift);
    }
  }

  private route(origin:ZoneDef,goal:string){
    const key=origin.id+'>'+goal,known=this.routes.get(key);
    if(known)return known;
    const queue:{id:string;path:Door[]}[]=[{id:origin.id,path:[]}],seen=new Set([origin.id]);
    for(const {id,path} of queue){
      if(id===goal){this.routes.set(key,path);return path;}
      const zone=this.world.zones.get(id);
      for(const door of zone?.def.doors??[]){
        if(seen.has(door.to.zone)||door.hidden||door.to.zone.startsWith('casa-'))continue;
        if(door.to.zone==='casino-meridiano-vip'&&goal!==door.to.zone)continue;
        seen.add(door.to.zone);queue.push({id:door.to.zone,path:[...path,door]});
      }
    }
    this.routes.set(key,[]);
    return [];
  }
  private settle(e:Entity,life:Life,shift:Shift){
    this.label(e,shift.label);
    e.npc!.state=shift.state;
    e.npcShop=shift.state==='work'?life.def.shop:undefined;
    if(shift.face)this.face(e,shift.face[0]+.5,shift.face[1]+.5);
    this.pose(e,shift.pose);
  }
  think(e:Entity){
    const life=this.roster.get(e);
    if(!life)return false;
    this.world.metrics.inc('residentDecisions');
    const shift=shiftAt(life.def,this.world.cityHour()),now=this.world.tick;
    if(life.alert){
      if(life.alert.until>now)return true;
      life.alert=undefined;e.path=[];e.moving=false;this.pose(e,undefined);life.target=-1;
    }
    this.update(e,life,shift);
    if(e.npc!.pauseUntil>now)return true;
    if(e.path.length)return true;
    if(e.zone.id!==shift.zone){
      const door=this.route(e.zone.def,shift.zone)[0];
      if(!door)return true;
      const x=door.at[0]+.5,y=door.at[1]+.5;
      if(Math.hypot(e.x-x,e.y-y)<.72)this.world.transferNpc(e,door.to.zone,door.to.at);
      else if(this.walk(e,x,y)){
        e.npc!.state='travel';this.label(e,'De camino · '+shift.label.toLowerCase());
      }
      return true;
    }
    const stops=1+(shift.stops?.length??0);
    const [x,y]=life.target>0?shift.stops![life.target-1]:shift.at;
    const stop=nearestWalkable(pedestrianGrid(e.zone.grid,'stop'),x+.5,y+.5,8);
    if(!stop)return true;
    if(Math.hypot(e.x-stop.x,e.y-stop.y)>.72){
      if(this.walk(e,stop.x,stop.y)){
        e.npc!.state='travel';e.npcShop=undefined;this.pose(e,undefined);
        this.label(e,shift.stops?.length?shift.label:'De camino · '+shift.label.toLowerCase());
      }
      return true;
    }
    this.settle(e,life,shift);
    if(stops>1&&life.nextStop<=now){
      if(life.nextStop){life.target=(Math.max(0,life.target)+1)%stops;}
      life.nextStop=now+ticks(3+e.npc!.rng()*8);
    }
    if(shift.state!=='rest'&&life.nextTalk<=now){
      life.nextTalk=now+ticks(22+e.npc!.rng()*33);
      if(!this.observed(e.zone.id,e.x,e.y))return true;
      const other=e.zone.query(e.x,e.y,3.3).find(o=>{
        const p=this.roster.get(o);
        return o!==e&&p&&!o.dead&&o.state!=='downed'&&p.nextTalk<now+ticks(4)&&p.shift?.state!=='rest'&&!o.moving&&!o.carriedBy&&o.aggro===undefined&&!p.alert;
      });
      if(other&&this.world.combat.lineClear(e,other)){
        const next=this.roster.get(other)!;
        if(this.world.street.exchange(e,other,[staffVoice[life.def.resident!.job][1],tone[next.def.resident!.temper]])){
          next.nextTalk=life.nextTalk;
          this.world.metrics.inc('residentExchanges');
        }
      }
    }
    return true;
  }

  interact(c:PlayerConn,e:Entity){
    const life=this.roster.get(e),me=c.e;
    if(!life||!me||e.dead||e.state==='downed')return false;
    this.face(e,me.x,me.y);
    const res=life.def.resident!;
    if(life.alert){
      if(life.nextWarn<=this.world.tick){
        life.nextWarn=this.world.tick+ticks(4);
        this.world.street.speak(e,'Espera ahí. Primero tengo que comprobar qué pasa.');
      }
      return true;
    }
    if(life.nextWarn<=this.world.tick){
      life.nextWarn=this.world.tick+ticks(6);
      const now=this.world.tick,character=c.p?.charId,opt=e.npc!.rng();
      const recognized=character&&life.recent?.character===character&&life.recent.until>now;
      const line=recognized&&opt<.42?'Nos hemos cruzado antes. '+tone[res.temper]:
        opt<.42?res.personal:opt<.8?staffVoice[res.job][this.isWorking(e)?0:1]:tone[res.temper];
      if(character)life.recent={character,until:now+ticks(110)};
      this.world.street.speak(e,line);
    }
    if(e.npcShop&&this.isWorking(e))this.world.survival.openShop(c,e.npcShop,e);
    return true;
  }

  noise(e:Entity,source:Entity,radius:number){
    const life=this.roster.get(e);
    if(!life||radius<7||e.aggro!==undefined||e.carriedBy)return false;
    const res=life.def.resident!,now=this.world.tick;
    if(life.alert&&life.alert.until>now)return true;
    const staying=(res.job==='seguridad'||res.job==='policia')&&this.isWorking(e);
    const curious=res.temper==='curioso'||res.temper==='metodico';
    const dx=source.x-e.x,dy=source.y-e.y,len=Math.max(1,Math.hypot(dx,dy));
    const sign=staying||curious?1:-1,distance=staying?Math.min(4,len):curious?0:4;
    const x=e.x+dx/len*distance*sign,y=e.y+dy/len*distance*sign;
    life.alert={until:now+ticks(staying?7:4)};
    e.path=[];e.moving=false;e.npcShop=undefined;
    this.face(e,source.x,source.y);this.pose(e,staying?'gesto':undefined);
    const p=distance?nearestWalkable(e.zone.grid,x,y,2):null;
    if(p)this.walk(e,p.x,p.y);
    this.label(e,staying?'Comprueba el aviso':curious?'Escucha lo que pasa':'Se aparta del ruido');
    this.world.street.speak(e,staying?'Voy a comprobar de dónde viene ese ruido.':curious?'Eso no sonó como un escape.':'Mejor me aparto.');
    this.world.metrics.inc('residentReactions');return true;
  }

  nearPlayer(e:Entity,player:Entity,aimed:boolean,weapon:boolean){
    const life=this.roster.get(e),now=this.world.tick;
    if(!life||(!aimed&&!weapon)||e.aggro!==undefined||e.dead||e.state==='downed')return;
    const res=life.def.resident!;
    const worker=(res.job==='seguridad'||res.job==='policia')&&this.isWorking(e);
    const holds=aimed&&worker&&res.job==='seguridad'&&e.zone.def.casino;
    const cooldown=life.nextWarn>now||life.alert;
    if(cooldown&&!holds)return;
    if(!aimed&&!worker&&res.temper!=='cauto'&&res.temper!=='curioso')return;
    if(!this.world.combat.lineClear(e,player))return;
    if(holds)this.security.set(player,now+ticks(9));
    if(cooldown)return;
    if(!aimed&&!worker&&e.npc!.rng()>.36)return;
    life.nextWarn=now+ticks(17);
    life.alert={until:now+ticks(aimed?6:4)};
    this.face(e,player.x,player.y);e.path=[];e.moving=false;e.npcShop=undefined;
    const covers=aimed&&!worker;
    this.pose(e,covers?undefined:'gesto');
    if(covers){e.emote={move:'manos-arriba',at:Date.now()};e.labelVer++;}
    const line=worker?(aimed?'Baja el arma. Mantén las manos a la vista.':'Mantén el arma guardada mientras estés aquí.'):
      aimed?(res.temper==='nervioso'?'¡No dispares! ¡Me voy!':'Tranquilo. No voy a acercarme.'):res.temper==='curioso'?'Ese equipo pesa. Yo no lo llevaría todo el día.':'Voy a dejarte pasar primero.';
    this.label(e,worker?'En alerta':covers?'Con las manos arriba':res.temper==='curioso'?'Observa el arma':'Mantiene la distancia');
    this.world.street.speak(e,line);
    this.world.metrics.inc('residentReactions');
  }
}
