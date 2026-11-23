import { randomUUID } from 'node:crypto';
import { dutyAt, humanityBase, lineWalkable, prisonZone, PRISON_EXIT, WING_NAME, type ClientMsg, type Offense, type Sentence } from '@vertice/shared';
import type { Queryable } from '../db/db.js';
import { GameError } from '../game/effects.js';
import { chromeParts, effective, wornAppearance, type PlayerState } from '../game/player.js';
import { inferCharge, sentenceFor } from '../game/sentencing.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

type PrisonMsg = Extract<ClientMsg, {t:'penal'}>;
type BankMsg = Extract<ClientMsg, {t:'bank'}>;
type Balances = {money:string|number; bank_balance:string|number; status:string};
const SHIFTS:Record<string,{name:string;pay:number}> = {
  'penal-taller':{name:'Reparar equipos',pay:120},
  'penal-lavanderia':{name:'Clasificar ropa',pay:85},
  'penal-cocina':{name:'Preparar raciones',pay:95},
  'penal-servicios':{name:'Mantener las instalaciones',pay:110},
};
const CREWS=[
  {id:'foso',name:'Los del Foso',rival:'engranajes'},
  {id:'engranajes',name:'Engranajes',rival:'foso'},
  {id:'salmuera',name:'La Salmuera',rival:'kitsune'},
  {id:'kitsune',name:'Kitsune',rival:'salmuera'},
];
const UNIFORM='camiseta-penal';
const TOOL='herramienta-penal';
const BLADE='navaja';

export class Prison {
  private readonly admitting=new Set<string>();
  private readonly incidents=new Map<string,number>();
  private readonly escapes=new Set<string>();
  private readonly releases=new Set<string>();
  private lastHour=-1;

  constructor(private readonly w:World) {}

  private get dayMs(){return this.w.c.manifest.cityHourMs*24;}
  private nowDay(now=Date.now()){return Math.floor(now/this.dayMs+this.w.cfg.cityHourOffset/24);}
  isPrison(zone:string){return prisonZone(zone);}
  capturing(p:PlayerState){return this.admitting.has(p.charId);}
  disconnect(c:PlayerConn){
    if(!c.p||!c.e||!this.escapes.delete(c.p.charId))return;
    c.e.hiddenIn=undefined;delete c.p.buffs.escondido;
  }
  private inCustody(p:PlayerState){return !!p.sentence&&!p.sentence.escapeAt&&!p.sentence.paroleUntil;}
  private notice(c:PlayerConn,text:string,kind:'good'|'bad'|'warn'|'info'='info'){this.w.send(c,{t:'notice',kind,text});}
  private async balances(q:Queryable,p:PlayerState) {
    const r=await q.query<Balances>('SELECT money,bank_balance,status FROM characters WHERE id=$1 FOR UPDATE',[p.charId]);
    if(!r.rows[0]||r.rows[0].status==='dead')throw new GameError('Este expediente está cerrado.');
    return {cash:Number(r.rows[0].money),bank:Number(r.rows[0].bank_balance)};
  }
  private async cash(q:Queryable,p:PlayerState,id:string,delta:number,after:number,reason:string){
    if(!delta)return;
    await q.query('UPDATE characters SET money=$2 WHERE id=$1',[p.charId,after]);
    await q.query('INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ($1,$2,$3,$4,$5)',[id,p.charId,delta,after,reason]);
  }
  private async savings(q:Queryable,p:PlayerState,id:string,delta:number,after:number,reason:string){
    if(!delta)return;
    await q.query('UPDATE characters SET bank_balance=$2 WHERE id=$1',[p.charId,after]);
    await q.query('INSERT INTO prison_bank_ledger (id,character_id,delta,balance_after,reason) VALUES ($1,$2,$3,$4,$5)',[id,p.charId,delta,after,reason]);
  }
  private async remember(q:Queryable,p:PlayerState,s:Sentence){
    await q.query('UPDATE characters SET prison_state=$2 WHERE id=$1',[p.charId,JSON.stringify(s)]);
  }

  async note(id:string,kind:Offense,key:string,q:Queryable=this.w.db){
    await q.query('INSERT INTO prison_offenses (id,character_id,kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[key,id,kind]);
  }
  async wanted(p:PlayerState,why:string){
    const kind=inferCharge(why);
    if(!kind||this.inCustody(p)||this.capturing(p))return;
    // Una agresión puede producir varios impactos. Los robos y estafas sí se registran por operación.
    const key=kind==='agresion'?p.charId+':agresion:'+Math.floor(Date.now()/30000):randomUUID();
    await this.note(p.charId,kind,key);
  }
  async homicide(id:string,key:string){
    const c=this.w.survival.connOf(id);
    if(!c?.p||!c.e||!this.inCustody(c.p))return this.note(id,'homicidio',key);
    const p=c.p;
    const applied=await this.w.db.tx(async q=>{
      await this.balances(q,p);
      const rows=await q.query<{prison_state:Sentence}>('SELECT prison_state FROM characters WHERE id=$1',[id]);
      const s=rows.rows[0]?.prison_state;
      if(!s||s.paroleUntil||s.escapeAt){await this.note(id,'homicidio',key,q);return;}
      const r=await q.query('INSERT INTO prison_offenses (id,character_id,kind,sentence_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[key,id,'homicidio',s.id]);
      if(!r.rows.length)return;
      const count=(s.charges.find(ch=>ch.kind==='homicidio')?.count??0)+1;
      const charges=s.charges.filter(ch=>ch.kind!=='homicidio');
      charges.push({kind:'homicidio',count});
      const extra=count===2?9:5;
      const next={...s,charges,days:s.days+extra,ends:Math.max(Date.now(),s.ends)+extra*this.dayMs,conduct:0,
        fine:s.fine+18000,debt:s.debt+18000,disciplineUntil:Date.now()+this.dayMs/12};
      await this.remember(q,p,next);
      return next;
    });
    if(applied){p.sentence=applied;this.notice(c,'Homicidio dentro del penal. Aumenta tu condena y tu deuda.','bad');this.show(c);}
  }

  private async downgrade(q:Queryable,p:PlayerState,debt:number){
    const content=this.w.c.cyberware;
    const defs=new Map(content.map(d=>[d.id,d]));
    const cyber=p.cyber.filter(i=>i.location==='installed').map(i=>({...i}));
    const events:string[]=[];
    let paid=0, recoveredHumanity=0;
    await q.query("UPDATE cyberware_instances SET location='lost', character_id=NULL, history=history || $2::jsonb WHERE character_id=$1 AND location='inventory'",
      [p.charId,JSON.stringify([{at:new Date().toISOString(),event:'inventario requisado en Las Salinas'}])]);
    const offers=cyber.flatMap(i=>{
      const old=defs.get(i.def);
      if(!old||old.rarity==='mitico'||old.grade===1)return [];
      const basic=content.filter(d=>d.grade===1&&!d.unique&&d.slot===old.slot&&d.region===old.region&&d.price<old.price)
        .filter(d=>!old.prosthetic || d.prosthetic)
        .sort((a,b)=>a.price-b.price)[0];
      return basic?[{i,old,basic,credit:Math.floor(old.price/2)}]:[];
    }).sort((a,b)=>b.credit-a.credit);
    for(const {i,old,basic,credit} of offers){
      if(paid>=debt)break;
      const at=new Date().toISOString();
      await q.query("UPDATE cyberware_instances SET location='lost', character_id=NULL, history=history || $2::jsonb WHERE id=$1 AND character_id=$3 AND location='installed'",
        [i.id,JSON.stringify([{at,event:'liquidado para el pago de la multa de Las Salinas'}]),p.charId]);
      i.id=randomUUID();i.def=basic.id;i.stolen=false;
      await q.query("INSERT INTO cyberware_instances (id,def_id,character_id,location,part,history) VALUES ($1,$2,$3,'installed',$4,$5)",[i.id,i.def,p.charId,i.part??null,JSON.stringify([{at,event:'prótesis básica de sustitución'}])]);
      paid+=credit;
      recoveredHumanity+=old.humanity-basic.humanity;
      events.push(`${old.name} → ${basic.name} (+${credit} €$)`);
    }
    return {cyber,events,paid,recoveredHumanity};
  }

  async arrest(c:PlayerConn){
    const p=c.p,e=c.e;
    if(!p||!e||e.transit||this.admitting.has(p.charId)||(p as any).dead)return;
    this.admitting.add(p.charId);
    try{
      if(this.inCustody(p)){
        const s=p.sentence!;
        await this.w.legalTransfer(c,'penal-'+s.wing,s.cell,async q=>{
          await this.balances(q,p);
          const next={...s,conduct:Math.max(0,s.conduct-15),disciplineUntil:Date.now()+this.dayMs/16};
          await this.remember(q,p,next);
          await q.query("UPDATE characters SET hp=20,status='alive',downed_left_ms=NULL WHERE id=$1",[p.charId]);
          return ()=>{p.sentence=next;this.recover(c,20);};
        });
        this.notice(c,'Vigilancia te devuelve a tu celda y anota la falta.','bad');
        return;
      }
      let lines:string[]=[];
      // Resolver módulo y celda con el mismo expediente que se confirma en la transacción.
      const evidence=await this.w.db.query<{kind:Offense;sentenced:boolean;n:number}>(
        'SELECT kind,sentence_id IS NOT NULL AS sentenced,count(*)::int AS n FROM prison_offenses WHERE character_id=$1 GROUP BY 1,2',[p.charId]);
      const pending:Partial<Record<Offense,number>>={},prior:Partial<Record<Offense,number>>={};
      for(const row of evidence.rows)(row.sentenced?prior:pending)[row.kind]=row.n;
      const now=Date.now(),previous=p.sentence;
      const remaining=previous?.escapeAt?Math.max(0,previous.ends-previous.escapeAt):previous?.paroleUntil?Math.max(0,previous.paroleUntil-now):0;
      const plan=sentenceFor(pending,prior,p.wanted);
      const idx=parseInt(p.charId.slice(0,4),16)%12;
      const cell:[number,number]=[[6,16,30,40][idx%4],[10,22,34][Math.floor(idx/4)]];
      const s:Sentence={id:randomUUID(),wing:plan.wing,begins:now,ends:now+plan.days*this.dayMs+remaining,days:plan.days,
        cell,fine:plan.fine,debt:0,conduct:50,work:0,tunnel:0,charges:plan.charges};
      await this.w.legalTransfer(c,'penal-'+s.wing,cell,async q=>{
        const {cash,bank}=await this.balances(q,p);
        const debit=Math.min(bank,plan.fine+(previous?.debt??0));
        const left=plan.fine+(previous?.debt??0)-debit;
        const {cyber,paid,events,recoveredHumanity}=await this.downgrade(q,p,left);
        const humanityMax=Math.min(humanityBase(p.attributes.EMP),p.humanityMax+recoveredHumanity);
        const newBank=bank-debit+Math.max(0,paid-left);
        s.debt=Math.max(0,left-paid);
        s.fine+=previous?.debt??0;
        await this.cash(q,p,s.id+':cash',-cash,0,'Efectivo requisado en Las Salinas');
        await this.savings(q,p,s.id+':fine',newBank-bank,newBank,'Multa e implantes liquidados en Las Salinas');
        await q.query('DELETE FROM inventory_items WHERE character_id=$1',[p.charId]);
        await q.query('INSERT INTO inventory_items (id,character_id,def_id,qty) VALUES ($1,$2,$3,1)',[randomUUID(),p.charId,UNIFORM]);
        const wear={torso_int:UNIFORM},body={...p.body,bleed:0},relics={...p.relics,matrices:[]};
        await this.remember(q,p,s);
        await q.query("UPDATE characters SET wanted=0,hp=20,status='alive',downed_left_ms=NULL,downed_by=NULL,downed_cause='',equipped=NULL,wear=$2,body=$3,relics=$4,identified=NULL,active_job=NULL,autopilot=$5,humanity_max=$6 WHERE id=$1",
          [p.charId,JSON.stringify(wear),JSON.stringify(body),JSON.stringify(relics),JSON.stringify({on:false,personality:p.auto.personality}),humanityMax]);
        await q.query('UPDATE prison_offenses SET sentence_id=$2 WHERE character_id=$1 AND sentence_id IS NULL',[p.charId,s.id]);
        if(!evidence.rows.some(row=>!row.sentenced))await q.query('INSERT INTO prison_offenses (id,character_id,kind,sentence_id) VALUES ($1,$2,$3,$4)',[s.id,p.charId,s.charges[0].kind,s.id]);
        lines=[WING_NAME[s.wing],`${s.days} días de juego${remaining?' más el tiempo pendiente':''}`,
          `Efectivo requisado: ${cash} €$ · Multa: ${s.fine} €$ · Cobro bancario: ${debit} €$`,'Inventario requisado. Se entrega ropa del penal.',...events,
          ...(s.debt>0?[`Deuda pendiente: ${s.debt} €$`]:[])];
        return ()=>{
          p.sentence=s;p.money=0;p.bank=newBank;p.inventory=new Map([[UNIFORM,1]]);p.cyber=cyber;p.wear=wear;
          p.identified=null;p.equipped=null;p.relics=relics;p.humanityMax=humanityMax;p.wanted=0;p.activeJob=null;p.auto.on=false;
          this.recover(c,20);
          e.appearance=wornAppearance(this.w.c,p);e.chrome=chromeParts(this.w.c,p);
        };
      });
      const warrants=this.w.survival.bounties.onPlayer(p.charId).filter(b=>b.poster==='pcv');
      if(warrants.length)await this.w.survival.bounties.cancel(warrants.map(b=>b.id)).catch(err=>console.error('[penal] orden judicial',err));
      this.w.survival.updateMarker(e);
      this.w.send(c,{t:'reward',title:'Ingreso en el Penal de las Salinas',lines});
      this.show(c);
    }finally{this.admitting.delete(p.charId);}
  }

  private recover(c:PlayerConn,hp:number){
    const p=c.p!,e=c.e!;
    p.hp=hp;p.status='alive';p.downedCause='';p.downedUntil=0;p.downedBy=undefined;p.downedLethal=false;
    p.body.bleed=0;p.sleeping=null;p.revive=undefined;
    e.state='alive';e.label='';e.labelVer++;e.task=undefined;e.channel=undefined;e.pendingAction=undefined;
    if(p.carrying){const body=this.w.entities.get(p.carrying);if(body){body.carriedBy=undefined;body.labelVer++;}p.carrying=null;}
    if(e.carriedBy){const carrier=this.w.entities.get(e.carriedBy);const owner=carrier&&this.w.playerOf(carrier);if(owner)owner.carrying=null;e.carriedBy=undefined;}
    for(const o of e.zone.query(e.x,e.y,28))if(o.aggro===e.id)o.aggro=undefined;
  }

  portal(c:PlayerConn,to:string){
    const p=c.p!,from=c.e!.zone.id,s=p.sentence;
    if(this.capturing(p)||this.releases.has(p.charId))return 'Hay un traslado judicial en curso.';
    if(!this.inCustody(p))return prisonZone(to)&&to!=='penal-visitas'?'Esta puerta solo admite internos autorizados.':undefined;
    if(!prisonZone(to)||to==='penal-visitas')return 'La salida se autoriza desde la mesa de expedientes.';
    if(to==='penal-'+s!.wing||to==='penal-ingreso'||to==='penal-infirmaria')return;
    if(['patrimonio','fraude','violencia','alta'].some(wing=>to==='penal-'+wing))return 'Esta puerta pertenece a otro módulo de celdas.';
    if((s!.disciplineUntil??0)>Date.now())return 'Tienes restringidos los desplazamientos por una falta disciplinaria.';
    const duty=dutyAt(this.w.cityHour());
    if(to==='penal-control'&&!['penal-servicios','penal-patio-sur'].includes(from))return 'Acceso controlado desde el patio sur y los servicios.';
    if(to==='penal-cocina'&&['desayuno','comida','trabajo'].includes(duty))return;
    if(['penal-taller','penal-lavanderia'].includes(to)&&duty==='trabajo')return;
    if(to==='penal-servicios'&&['trabajo','patio'].includes(duty))return;
    if(to.startsWith('penal-patio')&&['patio','trabajo'].includes(duty))return;
    if(to==='penal-control'&&duty!=='recuento')return;
    return 'La dependencia está cerrada en este horario. Consulta el expediente.';
  }

  allowCommand(c:PlayerConn,m:ClientMsg){
    const p=c.p!,e=c.e!;
    if((this.capturing(p)||this.releases.has(p.charId))&&m.t!=='ping')return 'Se está tramitando tu ingreso.';
    if(e.hiddenIn&&this.escapes.has(p.charId)&&!['ping','chat','penal'].includes(m.t))return 'Estás escondido. Pulsa «Salir del contenedor» en el expediente.';
    if(!this.inCustody(p))return;
    if(['car','rescue','jobStart','autonomy','casino','marketLive','props','bank'].includes(m.t)||
      (m.t==='auto'&&m.on))return 'Este servicio no está disponible dentro del penal.';
  }

  private desk(c:PlayerConn,id?:number){
    const e=c.e!,o=id?this.w.entities.get(id):undefined;
    return o?.zone===e.zone&&o.objKind==='penal'&&Math.hypot(o.x-e.x,o.y-e.y)<=4.5?o:undefined;
  }
  private actions(c:PlayerConn,o?:Entity):PrisonMsg['action'][]{
    const p=c.p!,id=o?.objId;
    if(this.escapes.has(p.charId))return ['carga'];
    if(!this.inCustody(p))return p.sentence?.debt&&id==='penal-informacion'?['pagar']:[];
    if(!id)return [];
    if(id==='penal-expediente'||id==='penal-salida')return ['condicional','pagar'];
    if(id==='penal-economato')return ['pagar'];
    if(id==='penal-racion')return ['comer'];
    if(id==='penal-trato'||id==='penal-foso')return ['trato'];
    if(id==='penal-tunel')return ['cavar'];
    if(id==='penal-carga')return ['carga'];
    if(id==='penal-control')return ['control'];
    if(id==='penal-auxilio')return ['auxilio'];
    return SHIFTS[id]?['trabajar']:[];
  }
  open(c:PlayerConn,target:Entity){
    if(!this.desk(c,target.id))throw new GameError('Acércate al puesto del penal.');
    this.show(c,target,true);
  }
  show(c:PlayerConn,target?:Entity,open=false,detail?:string){
    const p=c.p;
    if(!p||!c.e)return;
    const o=this.desk(c,target?.id);
    const hour=this.w.cityHour();
    this.w.send(c,{t:'penal',open,view:{state:p.sentence??null,wallet:p.money,bank:p.bank??0,now:Date.now(),hour,dayMs:this.dayMs,
      duty:dutyAt(hour),target:o?.id,actions:this.actions(c,o),hidden:this.escapes.has(p.charId),detail:detail??o?.name}});
  }

  async bank(c:PlayerConn,m:BankMsg){
    const p=c.p!,e=c.e!,o=this.w.entities.get(m.target);
    if(!o||o.objKind!=='atm'||o.zone!==e.zone||Math.hypot(e.x-o.x,e.y-o.y)>4.5||this.inCustody(p))
      throw new GameError('Acércate a un cajero de la ciudad.');
    const id='bank:'+p.charId+':'+m.opId;
    const result=await this.w.db.tx(async q=>{
      const bal=await this.balances(q,p);
      if(m.action==='view')return bal;
      const done=await q.query('SELECT id FROM prison_bank_ledger WHERE id=$1',[id]);
      if(done.rows.length)return bal;
      if(!m.amount)throw new GameError('Indica una cantidad mayor que cero.');
      const amount=m.action==='deposit'?m.amount:-m.amount;
      if(bal.cash-amount<0||bal.bank+amount<0)throw new GameError('Saldo insuficiente.');
      await this.cash(q,p,id,-amount,bal.cash-amount,'Movimiento entre efectivo y banco');
      await this.savings(q,p,id,amount,bal.bank+amount,'Movimiento entre efectivo y banco');
      return {cash:bal.cash-amount,bank:bal.bank+amount};
    });
    p.money=result.cash;p.bank=result.bank;
    this.w.send(c,{t:'bank',target:o.id,wallet:p.money,bank:p.bank});
  }

  private async mutate(c:PlayerConn,fn:(q:Queryable,s:Sentence,bal:{cash:number;bank:number})=>Promise<Sentence>){
    const p=c.p!;
    const result=await this.w.db.tx(async q=>{
      const bal=await this.balances(q,p),rows=await q.query<{prison_state:Sentence}>('SELECT prison_state FROM characters WHERE id=$1',[p.charId]);
      const s=rows.rows[0]?.prison_state;
      if(!s)throw new GameError('No tienes un expediente abierto.');
      const next=await fn(q,s,bal);
      await this.remember(q,p,next);
      return next;
    });
    p.sentence=result;
  }
  private watchers(e:Entity){
    return [...e.zone.query(e.x,e.y,12)].filter(o=>o.prisonStaff&&!o.dead&&o.state!=='downed'&&
      lineWalkable(e.zone.grid,e.x,e.y,o.x,o.y)&&this.w.stealth.sees(o,e));
  }
  incident(e:Entity,target?:Entity){
    const c=e.conn,p=c?.p;
    if(!c||!p||!this.inCustody(p))return;
    const watched=this.watchers(e);
    if(target?.prisonStaff&&!target.dead&&!watched.includes(target))watched.push(target);
    if(!watched.length)return;
    for(const guard of watched){guard.aggro=e.id;guard.aggroLethal=false;}
    const now=Date.now();
    if((this.incidents.get(p.charId)??0)>now)return;
    this.incidents.set(p.charId,now+30000);
    this.w.enqueue(c,async()=>{
      await this.mutate(c,async(_q,s)=>({...s,conduct:Math.max(0,s.conduct-12),disciplineUntil:now+this.dayMs/16}));
      this.notice(c,'Vigilancia registra una falta. Baja tu conducta y se restringen tus permisos.','warn');
      this.show(c);
    });
  }

  private async release(c:PlayerConn,mode:'cumplida'|'condicional'|'fuga'){
    const p=c.p!,entity=c.e!;
    if(!this.inCustody(p)||this.releases.has(p.charId))return;
    this.releases.add(p.charId);
    try{
      await this.w.legalTransfer(c,'vertice',PRISON_EXIT,async q=>{
        await this.balances(q,p);
        const row=await q.query<{prison_state:Sentence}>('SELECT prison_state FROM characters WHERE id=$1',[p.charId]);
        const current=row.rows[0]?.prison_state,now=Date.now();
        if(!current||current.escapeAt||current.paroleUntil)throw new GameError('Tu expediente ya está cerrado.');
        if(mode==='cumplida'&&current.ends>now)throw new GameError('Tu condena aún sigue activa.');
        if(mode==='condicional'&&(now<current.begins+(current.ends-current.begins)*.65||current.conduct<75||current.work<3||(current.disciplineUntil??0)>now))
          throw new GameError('La revisión pide un 65 % cumplido, conducta de 75, tres turnos y ninguna sanción activa.');
        const next:Sentence={...current,...(mode==='fuga'?{escapeAt:now}:{paroleUntil:mode==='condicional'?current.ends:now})};
        await this.remember(q,p,next);
        if(mode==='fuga'){
          await this.note(p.charId,'fuga',current.id+':fuga',q);
          await q.query('UPDATE characters SET wanted=3 WHERE id=$1',[p.charId]);
        }
        return ()=>{
          p.sentence=next;
          entity.hiddenIn=undefined;delete p.buffs.escondido;this.escapes.delete(p.charId);
          if(mode==='fuga')p.wanted=3;
        };
      });
      this.w.survival.updateMarker(entity);
      this.notice(c,mode==='fuga'?'Has salido del penal. La PCV tiene una orden por quebrantamiento.':mode==='condicional'?'Libertad condicional concedida. Una nueva detención puede reactivar el plazo pendiente.':'Puesta en libertad. Tu expediente conserva la deuda pendiente.','good');
      this.show(c);
    }finally{this.releases.delete(p.charId);}
  }

  private async item(q:Queryable,p:PlayerState,id:string,delta:number){
    if(delta>0)await q.query('INSERT INTO inventory_items (id,character_id,def_id,qty) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id,def_id) DO UPDATE SET qty=inventory_items.qty+EXCLUDED.qty',[randomUUID(),p.charId,id,delta]);
    else {
      const r=await q.query('UPDATE inventory_items SET qty=qty+$3 WHERE character_id=$1 AND def_id=$2 AND qty>=-($3::int) RETURNING id',[p.charId,id,delta]);
      if(!r.rows.length)throw new GameError('Te hace falta la herramienta que vende Los del Foso.');
    }
  }

  async command(c:PlayerConn,m:PrisonMsg){
    const p=c.p!,e=c.e!,o=this.desk(c,m.target),now=Date.now();
    if(m.action==='estado'){this.show(c,o,true);return;}
    if(p.status!=='alive'||e.transit)throw new GameError('Espera a recuperarte.');
    if(m.action==='carga'&&this.escapes.has(p.charId)){
      this.escapes.delete(p.charId);e.hiddenIn=undefined;delete p.buffs.escondido;this.show(c,o,true);return;
    }
    if(!o||!this.actions(c,o).includes(m.action))throw new GameError('Acércate al puesto correspondiente.');
    const s=p.sentence!;
    if(m.action==='condicional')return this.release(c,now>=s.ends?'cumplida':'condicional');
    if(m.action==='comer'){
      if(!['desayuno','comida'].includes(dutyAt(this.w.cityHour())))throw new GameError('La ventanilla sirve raciones durante el desayuno y la comida.');
      p.hunger=Math.max(0,p.hunger-22);p.thirst=Math.max(0,p.thirst-18);
      this.show(c,o,true,'Ración y agua entregadas.');return;
    }
    if(m.action==='auxilio'){
      p.hp=Math.max(p.hp,Math.round(effective(this.w.c,p).hpMax*.55));p.body.bleed=0;
      this.show(c,o,true,'Enfermería ha estabilizado tus constantes.');return;
    }
    if(m.action==='trabajar'){
      if(dutyAt(this.w.cityHour())!=='trabajo')throw new GameError('Ahora no hay turno de trabajo.');
      const key=this.nowDay()+':'+(this.w.cityHour()<12?'mañana':'tarde');
      if(s.lastWork===key||e.channel)throw new GameError('Ya has empezado o terminado este turno.');
      const job=SHIFTS[o.objId!]!;
      const finish=()=>this.w.enqueue(c,async()=>{
        if(!this.desk(c,o.id)||!this.inCustody(p)||p.status!=='alive')return;
        try{
          const paid=await this.w.db.tx(async q=>{
            const bal=await this.balances(q,p),rs=await q.query<{prison_state:Sentence}>('SELECT prison_state FROM characters WHERE id=$1',[p.charId]);
            const cur=rs.rows[0]?.prison_state;
            if(!cur||cur.id!==s.id||cur.lastWork===key||cur.paroleUntil||cur.escapeAt)return;
            const fine=Math.min(Math.floor(job.pay*.45),cur.debt),bank=bal.bank+job.pay-fine;
            const next={...cur,debt:cur.debt-fine,conduct:Math.min(100,cur.conduct+9),lastWork:key,work:cur.work+1};
            await this.savings(q,p,cur.id+':job:'+key,job.pay-fine,bank,job.name);
            await this.remember(q,p,next);
            await q.query('INSERT INTO job_log (op_id,character_id,job_id,pay,result) VALUES ($1,$2,$3,$4,$5)',[cur.id+':job:'+key,p.charId,job.name,job.pay,JSON.stringify({ok:true,penal:true})]);
            return {bank,next};
          });
          if(paid){p.sentence=paid.next;p.bank=paid.bank;this.show(c,o,true,`Turno terminado: ${job.pay} €$ y +9 de conducta.`);}
        }finally{this.w.send(c,{t:'action',text:''});}
      });
      e.path=[];e.moving=false;
      e.channel={startTick:this.w.tick,endTick:this.w.tick+130,label:job.name,targetId:o.id,apply:finish};
      this.w.send(c,{t:'action',text:job.name,duration:6.5});
      return;
    }
    if(m.action==='carga'){
      const hour=this.w.cityHour();
      if(hour<4.75||hour>=5.25)throw new GameError('El contenedor de la ruta solo se prepara antes de la salida de las 05:00.');
      if(this.watchers(e).length){this.incident(e);throw new GameError('Un vigilante te está mirando.');}
      this.escapes.add(p.charId);e.path=[];e.steer=undefined;e.moving=false;e.hiddenIn='penal-carga';p.buffs.escondido=now+this.dayMs;
      this.show(c,o,true,'Dentro del contenedor. Espera a que salga el camión.');
      return;
    }
    if(m.action==='control'){
      if([...e.zone.entities].some(g=>g.prisonStaff&&!g.dead&&g.state!=='downed')){
        this.incident(e);throw new GameError('Hay personal activo en la sala de control.');
      }
      return this.release(c,'fuga');
    }
    const op=s.id+':'+m.opId;
    if(m.action==='pagar'){
      let newBank=p.bank??0;
      await this.mutate(c,async(q,cur,bal)=>{
        newBank=bal.bank;
        if((await q.query('SELECT id FROM prison_bank_ledger WHERE id=$1',[op])).rows.length)return cur;
        const pay=Math.min(cur.debt,bal.bank);
        if(!pay)throw new GameError(cur.debt?'Tu cuenta bancaria está a cero.':'No queda deuda por pagar.');
        newBank=bal.bank-pay;
        await this.savings(q,p,op,-pay,newBank,'Pago voluntario de multa');
        return {...cur,debt:cur.debt-pay};
      });
      p.bank=newBank;this.show(c,o,true,'Pago aplicado a la multa.');return;
    }
    if(this.watchers(e).length){this.incident(e);throw new GameError('Un vigilante te está observando.');}
    if(m.action==='trato'){
      const idx=o.objId==='penal-foso'||o.zone.id==='penal-patio-sur'?0:o.zone.id==='penal-patio-norte'?1:o.zone.id==='penal-fraude'?3:2;
      const crew=CREWS[idx]!,id=idx===0?TOOL:BLADE;
      const amount=idx===0?100:150;
      let cash=p.money,bank=p.bank??0,bought=false;
      await this.mutate(c,async(q,cur,bal)=>{
        cash=bal.cash;bank=bal.bank;
        if((await q.query('SELECT id FROM prison_bank_ledger WHERE id=$1',[op])).rows.length)return cur;
        if(bal.bank+bal.cash<amount)throw new GameError(`${crew.name} pide ${amount} €$ por el trato.`);
        const wallet=Math.min(bal.cash,amount),debit=amount-wallet;
        await this.cash(q,p,op,-wallet,bal.cash-wallet,'Trato clandestino en Las Salinas');
        if(debit)await this.savings(q,p,op,-debit,bal.bank-debit,'Trato clandestino en Las Salinas');
        else await q.query("INSERT INTO prison_bank_ledger (id,character_id,delta,balance_after,reason) VALUES ($1,$2,0,$3,'Trato en efectivo')",[op,p.charId,bal.bank]);
        await this.item(q,p,id,1);
        cash=bal.cash-wallet;bank=bal.bank-debit;bought=true;
        return {...cur,network:crew.id};
      });
      if(bought)p.inventory.set(id,(p.inventory.get(id)??0)+1);
      p.money=cash;p.bank=bank;this.show(c,o,true,`${crew.name} te entrega ${idx===0?'una herramienta clandestina':'una navaja'}.`);
      return;
    }
    if(m.action==='cavar'){
      if(s.tunnel>=3)return this.release(c,'fuga');
      let dug=false;
      await this.mutate(c,async(q,cur)=>{
        if(cur.tunnel>=3)return cur;
        const key=cur.id+':excavacion:'+m.opId;
        const id=await q.query('INSERT INTO ops (op_id,character_id,kind,result) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING op_id',[key,p.charId,'penal',JSON.stringify({tunnel:cur.tunnel+1})]);
        if(!id.rows.length)return cur;
        await this.item(q,p,TOOL,-1);dug=true;
        return {...cur,tunnel:cur.tunnel+1};
      });
      if(dug)p.inventory.set(TOOL,Math.max(0,(p.inventory.get(TOOL)??0)-1));
      this.show(c,o,true,p.sentence!.tunnel>=3?'El paso está abierto. Puedes usarlo ahora.':'Has abierto un tramo del paso.');
    }
  }

  everySecond(){
    const hour=this.w.cityHour(),phase=dutyAt(hour),slot=Math.floor(hour);
    for(const c of this.w.conns.values()){
      const p=c.p,e=c.e;
      if(!p||!e||!p.sentence||p.status!=='alive'||e.transit||this.capturing(p)||!this.inCustody(p))continue;
      const s=p.sentence;
      if(s.ends<=Date.now()){if(!this.releases.has(p.charId))void this.release(c,'cumplida').catch(err=>console.error('[penal] salida',err));continue;}
      if(this.escapes.has(p.charId)&&hour>=5&&hour<5.75){
        const spotted=[...e.zone.query(e.x,e.y,2.6)].some(o=>o.prisonStaff&&!o.dead&&o.state!=='downed');
        if(spotted){this.escapes.delete(p.charId);e.hiddenIn=undefined;delete p.buffs.escondido;this.incident(e);this.notice(c,'Inspeccionaron el contenedor antes de la recogida.','bad');this.show(c);}
        else void this.release(c,'fuga').catch(err=>console.error('[penal] carga',err));
        continue;
      }
      if(slot!==this.lastHour){
        this.show(c);
        if(phase==='recuento'&&e.zone.id!=='penal-'+s.wing&&!this.escapes.has(p.charId))this.incident(e);
      }
      if(s.network&&hour>=14&&hour<18&&!e.hiddenIn){
        const rival=CREWS.find(k=>k.id===s.network)?.rival;
        if(rival)for(const other of e.zone.query(e.x,e.y,6)){
          if(other.prisonGang===rival&&!other.aggro&&this.w.stealth.sees(other,e)){other.aggro=e.id;other.aggroLethal=true;break;}
        }
      }
    }
    this.lastHour=slot;
    const now=Date.now();
    if(this.w.tick%1200<20)for(const [id,until] of this.incidents)if(now>=until)this.incidents.delete(id);
  }
}
