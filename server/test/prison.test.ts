import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildZoneGrid, findPath, prisonZone, PRISON_EXIT } from '@vertice/shared';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { createApp } from '../src/app.js';
import { loadValidatedContent } from '../src/content.js';
import { sentenceFor } from '../src/game/sentencing.js';

it('aplica los plazos, la reincidencia y la clasificación de Las Salinas',()=>{
  expect(sentenceFor({robo:1},{},0)).toMatchObject({days:3,wing:'patrimonio'});
  expect(sentenceFor({robo:1},{robo:4},0)).toMatchObject({days:6,wing:'patrimonio'});
  expect(sentenceFor({fraude:1},{},0).wing).toBe('fraude');
  expect(sentenceFor({homicidio:1},{},0)).toMatchObject({days:5,wing:'violencia'});
  expect(sentenceFor({homicidio:2},{},0)).toMatchObject({days:14,wing:'alta'});
  const {content}=loadValidatedContent();
  const zones=content.zones.filter(z=>prisonZone(z.id));
  expect(zones).toHaveLength(14);
  expect(content.npcs.filter(n=>n.id.startsWith('penal-'))).toHaveLength(49);
  for(const z of zones){
    const grid=buildZoneGrid(z);
    const cells=z.id.match(/^penal-(?:patrimonio|fraude|violencia|alta)$/)?
      [6,16,30,40].flatMap(x=>[10,22,34].map(y=>({id:'celda',at:[x,y]}))):[];
    for(const o of [...z.objects,...z.doors,...cells]){
      const r=findPath(grid,z.safePoint[0]+.5,z.safePoint[1]+.5,o.at[0]+.5,o.at[1]+.5);
      expect(r.ok,z.id+'/'+o.id+' '+o.at.join(',')).toBe(true);
    }
  }
});

it('persiste ingreso, cuenta, trabajo, condicional y las tres salidas clandestinas',async()=>{
  const app=await createApp({port:0,host:'127.0.0.1',databaseUrl:undefined,pgliteDir:'memory://',ambientNpcs:0,crowdNpcs:0,needsScale:0,
    lingerSeconds:0,logLevel:'warn',cityHourMs:60_000});
  const w=app.world,base='http://127.0.0.1:'+app.port,bots:BotClient[]=[];
  let hour=9;
  w.cityHour=()=>hour;
  const role='solo';
  async function join(name:string){
    const token=await BotClient.registerAndCreate(base,name,role);
    const bot=new BotClient(base,name);bots.push(bot);
    await bot.connect(token,app.contentHash);
    return {bot,token,conn:[...w.conns.values()].find(c=>c.p?.name===name)!};
  }
  const desk=(zone:string,id:string)=>[...w.zones.get(zone)!.entities].find(e=>e.objId===id)!;
  try{
    const {bot,conn,token}=await join('pruebalassalinas');
    const p=conn.p!,e=conn.e!;
    const atm=[...w.entities.values()].find(o=>o.objKind==='atm'&&o.zone.id==='vertice')!;
    await w.teleport(conn,atm.zone.id,[Math.floor(atm.x),Math.floor(atm.y)]);
    await app.db.query('UPDATE characters SET money=money+1000 WHERE id=$1',[p.charId]);p.money+=1000;
    await app.db.query("INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ($1,$2,1000,$3,'Prueba')",[randomUUID(),p.charId,p.money]);
    const deposit={t:'bank',target:atm.id,action:'deposit',amount:500,opId:randomUUID()};
    expect((await bot.cmd(deposit)).ok).toBe(true);
    expect((await bot.cmd(deposit)).ok).toBe(true);
    expect(p.bank).toBe(500);
    expect((await bot.cmd({t:'bank',target:atm.id,action:'withdraw',amount:200,opId:randomUUID()})).ok).toBe(true);
    expect(p.bank).toBe(300);
    const cyber={id:randomUUID(),def:'brazo-blindaje-placas',part:'brazo_izq',location:'installed' as const,stolen:false};
    p.cyber.push(cyber);
    await app.db.query("INSERT INTO cyberware_instances (id,def_id,character_id,location,part) VALUES ($1,$2,$3,'installed',$4)",[cyber.id,cyber.def,p.charId,cyber.part]);
    await w.prison.note(p.charId,'robo',randomUUID());
    // La ruta de combate de la PCV usa el ingreso y se puede intentar simultáneamente sin cobrar dos veces.
    w.combat.damagePlayer(p,e,p.hp+10,false,{name:'Agente de la PCV',police:true});
    const reward=await bot.waitFor(m=>m.t==='reward'&&m.title.includes('Penal de las Salinas'));
    expect(reward.t).toBe('reward');
    expect(e.zone.id).toBe('penal-patrimonio');
    expect(p.money).toBe(0);
    expect(p.bank).toBe(0);
    expect([...p.inventory.keys()]).toEqual(['camiseta-penal']);
    expect(p.cyber).toContainEqual(expect.objectContaining({def:'brazo-protesico',part:'brazo_izq'}));
    // La deuda es la multa menos lo del banco (300) y la mitad del precio del implante liquidado (v0.38: precios por valor).
    const debt0=1800-300-Math.floor(w.c.cyberware.find(d=>d.id==='brazo-blindaje-placas')!.price/2);
    expect(p.sentence).toMatchObject({days:3,conduct:50,fine:1800,debt:debt0});
    expect(Number((await app.db.query('SELECT sum(delta) AS n FROM ledger WHERE character_id=$1',[p.charId])).rows[0].n)).toBe(0);
    const reopened=new BotClient(base,'reconexion');bots.push(reopened);
    const reconnected=await reopened.connect(token,app.contentHash);
    expect(reconnected.zone).toBe('penal-patrimonio');
    const user=[...w.conns.values()].find(c=>c.p?.charId===p.charId)!;
    const client=reopened;
    const send=(action:string,target?:number,opId=randomUUID())=>client.cmd({t:'penal',action,target,opId});
    const go=async(zone:string,id:string)=>{
      const object=desk(zone,id);
      await w.teleport(user,zone,[Math.floor(object.x),Math.floor(object.y)]);
      expect(user.e!.zone.id).toBe(zone);
      return object;
    };
    await w.teleport(user,'vertice',PRISON_EXIT);expect(user.e!.zone.id).toBe('penal-patrimonio');
    await w.teleport(user,'penal-fraude',[10,12]);expect(user.e!.zone.id).toBe('penal-patrimonio');
    const work=await go('penal-taller','penal-taller');
    expect((await send('trabajar',work.id)).ok).toBe(true);
    await client.until(()=>user.p!.sentence!.work===1,9000,'turno de taller');
    expect(user.p!.sentence).toMatchObject({work:1,debt:debt0-54,conduct:59});
    expect(user.p!.bank).toBe(66);
    expect((await send('trabajar',work.id)).ok).toBe(false);
    async function setSentence(fields:Record<string,unknown>){
      const next={...user.p!.sentence!,...fields};
      user.p!.sentence=next;
      await app.db.query('UPDATE characters SET prison_state=$2 WHERE id=$1',[p.charId,JSON.stringify(next)]);
    }
    let records=await go('penal-ingreso','penal-expediente');
    expect((await send('condicional',records.id)).ok).toBe(false);
    await setSentence({begins:Date.now()-800_000,ends:Date.now()+200_000,conduct:77,work:3});
    expect((await send('condicional',records.id)).ok).toBe(true);
    expect(user.e!.zone.id).toBe('vertice');
    expect(user.p!.sentence!.paroleUntil).toBeGreaterThan(Date.now());
    await w.prison.note(p.charId,'fraude',randomUUID());
    await Promise.all([w.combat.arrest(user),w.combat.arrest(user)]);
    expect(user.e!.zone.id).toBe('penal-fraude');

    const gear=await go('penal-servicios','penal-foso');
    for(const guard of gear.zone.entities)if(guard.prisonStaff){guard.dead=true;guard.state='downed';}
    await app.db.query('UPDATE characters SET bank_balance=500 WHERE id=$1',[p.charId]);user.p!.bank=500;
    const once=randomUUID();
    expect((await send('trato',gear.id,once)).ok).toBe(true);
    expect((await send('trato',gear.id,once)).ok).toBe(true);
    expect(user.p!.inventory.get('herramienta-penal')).toBe(1);
    for(let i=0;i<2;i++)expect((await send('trato',gear.id)).ok).toBe(true);
    const dig=await go('penal-servicios','penal-tunel');
    for(let i=0;i<3;i++)expect((await send('cavar',dig.id)).ok).toBe(true);
    expect(user.p!.sentence!.tunnel).toBe(3);
    expect((await send('cavar',dig.id)).ok).toBe(true);
    expect(user.e!.zone.id).toBe('vertice');expect(user.p!.wanted).toBe(3);
    await w.combat.arrest(user);
    expect(user.e!.zone.id).toBe('penal-alta');

    const cargo=await go('penal-servicios','penal-carga');
    expect((await send('carga',cargo.id)).ok).toBe(false);
    hour=4.9;
    expect((await send('carga',cargo.id)).ok).toBe(true);
    hour=5.1;
    await client.until(()=>user.e!.zone.id==='vertice',3000,'recogida del contenedor');
    await w.combat.arrest(user);

    hour=9;await go('penal-servicios','penal-foso');
    const control=await go('penal-control','penal-control');
    expect((await send('control',control.id)).ok).toBe(false);
    for(const guard of control.zone.entities)if(guard.prisonStaff){guard.dead=true;guard.state='downed';}
    expect((await send('control',control.id)).ok).toBe(true);
    expect(user.e!.zone.id).toBe('vertice');
    expect((await app.db.query("SELECT count(*)::int n FROM prison_offenses WHERE character_id=$1 AND kind='fuga'",[p.charId])).rows[0].n).toBe(3);
  }finally{
    for(const bot of bots)bot.close();
    await app.close();
  }
},45000);
