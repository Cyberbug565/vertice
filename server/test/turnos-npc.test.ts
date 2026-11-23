import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {facingToIdx,prisonZone} from '@vertice/shared';
import {BotClient} from '../../tools/loadtest/src/botclient.js';
import {createApp} from '../src/app.js';
import {shiftAt} from '../src/world/city-people.js';

it('sincroniza relevos, comercio, conversación y seguridad con dos clientes y acota el trabajo sin observadores',async()=>{
  const app=await createApp({port:0,host:'127.0.0.1',databaseUrl:undefined,pgliteDir:'memory://',ambientNpcs:0,crowdNpcs:0,needsScale:0,lingerSeconds:0,threats:false,logLevel:'warn'});
  const {world:w,metrics}=app,bots:BotClient[]=[];
  const active=()=>[...w.entities.values()].filter(e=>e.npc?.def?.resident);
  let hour=10;
  w.cityHour=()=>hour;
  const flow=()=>{w.cityPeople.everySecond();w.step();};
  const counts=()=>Object.fromEntries(['residentDecisions','residentPathIntents','residentDormantTransitions'].map(k=>[k,metrics.counters[k]??0]));
  const report:Record<string,unknown>={};
  try{
    w.stop();
    const day=active(),defs=day.map(e=>e.npc!.def!);
    const city=defs.filter(n=>!prisonZone(n.schedule[0].zone));
    expect(city).toHaveLength(95); // v0.35: 67 + 8 porteros + 20 agentes de patrulla
    expect(new Set(city.map(n=>n.name)).size).toBe(95);
    expect(defs.filter(n=>prisonZone(n.schedule[0].zone))).toHaveLength(49);
    expect(new Set(defs.map(n=>n.id)).size).toBe(defs.length);
    for(const def of defs){
      expect(new Set(def.schedule.map(s=>s.state))).toEqual(new Set(['work','talk','rest']));
      for(let t=0;t<24;t+=.25)expect(shiftAt(def,t),def.name).toBeTruthy();
    }
    metrics.resetWindows();
    for(const time of [10,21,0,7]){
      hour=time;flow();
      for(const e of active()){
        const shift=shiftAt(e.npc!.def!,hour);
        expect(e.zone.id,e.name).toBe(shift.zone);
        expect(e.label,e.name).toBe(shift.label);
      }
    }
    expect(counts().residentDecisions).toBe(0);
    expect(counts().residentPathIntents).toBe(0);
    expect(counts().residentDormantTransitions).toBeGreaterThan(60);
    report['cuatro_horas_sin_jugadores']=counts();
    const find=(job:string,zone:string)=>active().find(e=>e.npc!.def!.resident!.job===job&&e.npc!.def!.schedule[0].zone===zone&&shiftAt(e.npc!.def!,hour).state==='work')!;
    hour=10;flow();
    const zone='casino-meridiano',dayGuard=find('seguridad',zone)!;
    hour=22;flow();const nightGuard=find('seguridad',zone)!;
    expect(nightGuard).not.toBe(dayGuard);
    expect(dayGuard.zone.id).not.toBe(zone);
    expect(nightGuard.zone.id).toBe(zone);
    report['relevo_meridiano']={dia:dayGuard.name,noche:nightGuard.name};
    hour=10;flow();
    const activeCop=find('policia','vertice');
    expect(activeCop.npcType).toBe('police');expect(w.cityPeople.isWorking(activeCop)).toBe(true);
    const vendor=find('venta','okami-super-int');
    expect(vendor.npcShop).toBe('okami-super');

    // Reanudamos el reloj de simulación para recibir instantáneas del servidor real.
    w.start();
    const base=`http://127.0.0.1:${app.port}`;
    const connections=[];
    for(const name of ['visitanteturno','testigoturno']){
      const token=await BotClient.registerAndCreate(base,name);
      const bot=new BotClient(base,name);bots.push(bot);await bot.connect(token,app.contentHash);
      connections.push([...w.conns.values()].find(c=>c.username===name)!);
    }
    const [a,b]=bots,[ac,bc]=connections;
    const go=async(conn:typeof ac,e:typeof vendor,offset=0)=>{
      await w.teleport(conn,e.zone.id,[Math.floor(e.x),Math.floor(e.y)+offset]);
      await (conn===ac?a:b).cmd({t:'guard',on:true,facing:facingToIdx(e.x-conn.e!.x,e.y-conn.e!.y)});
      await (conn===ac?a:b).cmd({t:'guard',on:false});
    };
    await go(ac,vendor);await go(bc,vendor,1);
    await a.until(()=>a.entities.has(vendor.id));await b.until(()=>b.entities.has(vendor.id));
    const shop=a.waitFor(m=>m.t==='shop'&&m.view.shop==='okami-super');
    const line=b.waitFor(m=>m.t==='speech'&&m.id===vendor.id);
    expect((await a.cmd({t:'interact',target:vendor.id,remote:true})).ok).toBe(true);
    await shop;await line;
    hour=20;
    const invalid=await a.cmd({t:'buy',shop:'okami-super',item:'refresco-neon',qty:1,opId:randomUUID()});
    expect(invalid.ok).toBe(false);
    await a.until(()=>vendor.npcShop===undefined,4000);
    hour=10;
    const secure=active().find(e=>e.npc!.def!.resident!.job==='seguridad'&&e.npc!.def!.schedule[0].zone==='casino-ultima-ficha'&&shiftAt(e.npc!.def!,hour).state==='work')!;
    await a.until(()=>secure.zone.id==='casino-ultima-ficha', 6000);
    await go(ac,secure,1);await go(bc,secure,2);
    await a.until(()=>a.entities.has(secure.id));
    ac.e!.weaponId='pistola-ligera';ac.e!.guard=true;
    ac.e!.facing=facingToIdx(secure.x-ac.e!.x,secure.y-ac.e!.y);
    const warned=b.waitFor(m=>m.t==='speech'&&m.id===secure.id&&m.text.includes('Baja el arma'));
    w.cityPeople.nearPlayer(secure,ac.e!,true,false);
    await warned;
    const table=[...secure.zone.entities].find(e=>e.objKind==='casino')!;
    w.moveEntityTo(ac.e!,secure.zone,table.x,table.y);
    expect((await a.cmd({t:'casino',table:table.id,action:'bet',game:'ruleta',stake:10,pick:'rojo',opId:randomUUID()})).reason).toContain('pausado tus apuestas');
    ac.e!.guard=false;
    expect(metrics.counters.residentReactions).toBeGreaterThan(0);
    expect(metrics.counters.residentDecisions).toBeGreaterThan(0);
    report['juego_con_dos_clientes']={...counts(),reacciones:metrics.counters.residentReactions};
    if(process.env.VERTICE_NPC_PRUEBA)(await import('node:fs')).writeFileSync(process.env.VERTICE_NPC_PRUEBA,JSON.stringify(report,null,2)+'\n');
  }finally{for(const bot of bots)bot.close();await app.close();}
},35000);
