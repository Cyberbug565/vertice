import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {CASINOS,VIP,buildZoneGrid,findPath,type CasinoGame,type ServerMsg} from '@vertice/shared';
import {BotClient} from '../../tools/loadtest/src/botclient.js';
import {createApp} from '../src/app.js';
import {blackjackValue,pokerPay} from '../src/game/casino-rules.js';

it('evalúa ases de blackjack y la escalera baja y real de póker',()=>{
  expect(blackjackValue([12,25,8])).toBe(12);
  expect(blackjackValue([12,11])).toBe(21);
  expect(pokerPay([8,9,10,11,12])[0]).toBe('Escalera real');
  expect(pokerPay([12,13,27,41,3])[0]).toBe('Escalera');
  expect(pokerPay([9,22,35,48,1])[0]).toBe('Póker');
});

it('permite recorrer los locales, conserva cartas y saldo, y liquida la herencia en un duelo consentido',async()=>{
  const app=await createApp({port:0,host:'127.0.0.1',databaseUrl:undefined,pgliteDir:'memory://',ambientNpcs:0,crowdNpcs:0,needsScale:0,lingerSeconds:0,logLevel:'warn'});
  const base=`http://127.0.0.1:${app.port}`, bots:BotClient[]=[];
  async function login(name:string){
    const token=await BotClient.registerAndCreate(base,name);
    const bot=new BotClient(base,name);bots.push(bot);await bot.connect(token,app.contentHash);
    return {token,bot,conn:[...app.world.conns.values()].find(c=>c.p?.name===name)!};
  }
  const table=(zone:string,game:CasinoGame)=>{
    const z=app.world.zones.get(zone)!;
    const o=z.def.objects.find(o=>o.games?.includes(game))!;
    return [...z.entities].find(e=>e.objId===o.id)!;
  };
  try{
    const a=await login('casinopruebauno'),b=await login('casinopruebados');
    let {bot,conn}=a;
    const put=async(user:typeof a,money:number)=>{
      await app.db.query('UPDATE characters SET money=$2 WHERE id=$1',[user.conn.p!.charId,money]);
      user.conn.p!.money=money;user.conn.p!.rep.set('calle',VIP.reputation);
    };
    const casinoZones=app.world.c.zones.filter(z=>z.casino);
    expect(new Set(casinoZones.map(z=>z.casino!.id)).size).toBe(5);
    for (const z of casinoZones){
      const grid=buildZoneGrid(z);
      for (const o of [...z.objects,...z.doors])
        expect(findPath(grid,z.safePoint[0]+.5,z.safePoint[1]+.5,o.at[0]+.5,o.at[1]+.5),z.id+'/'+o.id).toBeTruthy();
    }
    const door=app.world.c.zones.find(z=>z.id==='vertice')!.doors.find(d=>d.to.zone==='casino-meridiano')!;
    await put(a,1000);
    await app.world.teleport(conn,'vertice',door.at);
    // v0.35 · Los porteros no dejan pasar con el arma en la mano: primero se guarda (puños).
    const armed=bot.waitFor(m=>m.t==='notice'&&m.text.includes('Guarda el arma'));
    await bot.cmd({t:'interact',target:[...conn.e!.zone.entities].find(e=>e.doorTo?.zone==='casino-meridiano')!.id,remote:true});
    await armed;conn.p!.equipped=null;
    const denied=bot.waitFor(m=>m.t==='notice'&&m.text.includes('saldo mínimo'));
    await bot.cmd({t:'interact',target:[...conn.e!.zone.entities].find(e=>e.doorTo?.zone==='casino-meridiano')!.id,remote:true});
    await denied;expect(conn.e!.zone.id).toBe('vertice');
    const rz=table('casino-ultima-ficha','ruleta');
    await app.world.teleport(conn,rz.zone.id,[Math.floor(rz.x),Math.floor(rz.y)]);
    const listen=()=>bot.waitFor((m):m is Extract<ServerMsg,{t:'casino'}>=>m.t==='casino'&&m.view.table===rz.id) as Promise<Extract<ServerMsg,{t:'casino'}>>;
    expect((await bot.cmd({t:'casino',table:rz.id,action:'bet',game:'ruleta',stake:9,opId:randomUUID()})).ok).toBe(false);
    const req={t:'casino',table:rz.id,action:'bet',game:'ruleta',stake:100,pick:'rojo',opId:randomUUID()};
    const output=listen();expect((await bot.cmd(req)).ok).toBe(true);
    const first=(await output).view;
    expect(first.balance).toBe(900+first.result!.payout);
    const retry=listen();expect((await bot.cmd(req)).ok).toBe(true);
    expect((await retry).view.result).toEqual(first.result);
    expect((await app.db.query("SELECT count(*)::int n FROM ledger WHERE character_id=$1 AND reason LIKE 'Apuesta ·%'",[conn.p!.charId])).rows[0].n).toBe(1);
    const p=table(rz.zone.id,'poker');await app.world.teleport(conn,p.zone.id,[Math.floor(p.x),Math.floor(p.y)]);
    const handMsg=bot.waitFor(m=>m.t==='casino'&&m.view.table===p.id&&!!m.view.hand) as Promise<Extract<ServerMsg,{t:'casino'}>>;
    expect((await bot.cmd({t:'casino',table:p.id,action:'bet',game:'poker',stake:50,opId:randomUUID()})).ok).toBe(true);
    const hand=(await handMsg).view.hand!;
    const persisted=(await app.db.query('SELECT state FROM casino_hands WHERE character_id=$1',[conn.p!.charId])).rows[0].state;
    expect(persisted.player).toEqual(hand.player);
    expect(Object.keys(hand)).not.toContain('deck');
    const finish=bot.waitFor(m=>m.t==='casino'&&m.view.result?.id===hand.id) as Promise<Extract<ServerMsg,{t:'casino'}>>;
    expect((await bot.cmd({t:'casino',table:p.id,action:'draw',game:'poker',round:hand.id,hold:31,opId:randomUUID()})).ok).toBe(true);
    expect((await finish).view.result!.player).toEqual(hand.player);
    for (const game of ['rasca','blackjack','deportes','caballos'] as const) {
      const desk=table(game==='deportes'||game==='caballos'?'casino-hipodromo':rz.zone.id,game);
      await app.world.teleport(conn,desk.zone.id,[Math.floor(desk.x),Math.floor(desk.y)]);
      const get=()=>bot.waitFor(m=>m.t==='casino'&&m.view.table===desk.id) as Promise<Extract<ServerMsg,{t:'casino'}>>;
      const status=get();
      expect((await bot.cmd({t:'casino',table:desk.id,action:'view',opId:randomUUID()})).ok).toBe(true);
      const v=get();expect((await bot.cmd({t:'casino',table:desk.id,action:'bet',game,stake:CASINOS[desk.zone.def.casino!.id].min,pick:'0',heat:(await status).view.heat,opId:randomUUID()})).ok).toBe(true);
      let played=(await v).view;
      if(played.hand){
        const done=get();expect((await bot.cmd({t:'casino',table:desk.id,action:'stand',game,round:played.hand.id,opId:randomUUID()})).ok).toBe(true);played=(await done).view;
      }
      expect(played.result?.game).toBe(game);
      expect(played.result?.payout).toBeGreaterThanOrEqual(0);
    }
    const vip=table(VIP.zone,'duelo'), at:[number,number]=[Math.floor(vip.x),Math.floor(vip.y)];
    expect(await app.world.casino.deny(conn.p!,'casino-meridiano',VIP.zone)).toBeTruthy();
    for(const [index,user] of [a,b].entries()){
      await put(user,200000);
      await app.world.teleport(user.conn,VIP.zone,at);
      const home=app.world.c.houses[index].id;
      await app.db.query('INSERT INTO houses_owned (house_id,character_id,price) VALUES ($1,$2,20000)',[home,user.conn.p!.charId]);
      app.world.property.inheritHouse(user.conn.p!,home,20000);
      await app.db.query('INSERT INTO cars_owned (id,character_id,car_id,price) VALUES ($1,$2,$3,3000)',[randomUUID(),user.conn.p!.charId,app.world.c.cars[0].id]);
    }
    const invite=b.bot.waitFor(m=>m.t==='casino'&&!!m.view.invite?.incoming) as Promise<Extract<ServerMsg,{t:'casino'}>>;
    expect((await bot.cmd({t:'casino',table:vip.id,action:'challenge',target:b.bot.you,opId:randomUUID()})).ok).toBe(true);
    const id=(await invite).view.invite!.id;
    expect((await bot.cmd({t:'casino',table:vip.id,action:'accept',round:id,opId:randomUUID()})).ok).toBe(false);
    expect((await b.bot.cmd({t:'casino',table:vip.id,action:'accept',round:id,opId:randomUUID()})).ok).toBe(true);
    const chars=(await app.db.query('SELECT id,status,money FROM characters WHERE id IN ($1,$2)',[conn.p!.charId,b.conn.p!.charId])).rows;
    const winner=chars.find(r=>r.status==='alive'),loser=chars.find(r=>r.status==='dead');
    expect(Number(winner.money)).toBe(400000);expect(Number(loser.money)).toBe(0);
    expect((await app.db.query('SELECT character_id FROM houses_owned ORDER BY house_id')).rows.map(x=>x.character_id)).toEqual([winner.id,winner.id]);
    expect((await app.db.query('SELECT character_id FROM cars_owned')).rows.map(x=>x.character_id)).toEqual([winner.id,winner.id]);
    expect((await app.db.query('SELECT summary FROM memorial WHERE character_id=$1',[loser.id])).rows[0].summary.money).toBe(200000);
    await new Promise(r=>setTimeout(r,1575)); // Deja terminar la retirada de la entidad ya fallecida.
  }finally{
    for(const b of bots)b.close();
    await app.close();
  }
},40000);
