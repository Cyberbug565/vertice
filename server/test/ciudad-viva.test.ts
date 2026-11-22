import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Atlas, cellKey, skillXpFor } from '@vertice/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { createApp } from '../src/app.js';
import { loadPlayer } from '../src/game/player.js';
import { mapKnowledge, rememberMap } from '../src/game/exploration.js';
import { missionModules, powerful, streetModules, Voices } from '../src/game/voices.js';
import { Street } from '../src/world/street.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

it('contiene mil intercambios distintos y 500 líneas de misión distribuidas por persona y etapa', () => {
  const exchanges = streetModules.flatMap(m=>m.escenas.flatMap(s=>s.respuestas.map(r=>s.abre+'\n'+r)));
  expect(exchanges.length).toBeGreaterThanOrEqual(1000);
  expect(new Set(exchanges).size).toBe(exchanges.length);
  const lines = [...missionModules.values()].flatMap(stages=>Object.values(stages).flat());
  expect(lines.length).toBeGreaterThanOrEqual(500);
  expect(new Set(lines).size).toBe(lines.length);
  for(const who of ['nadia','iris','sable','teo']){
    const stages=Object.values(missionModules.get(who)!);
    expect(stages.length).toBeGreaterThanOrEqual(5);
    for(const pool of stages)expect(pool.length).toBeGreaterThanOrEqual(25);
  }
});
it('aplica los requisitos de carácter y evita repetir una reacción o pista seguida', () => {
  const voices = new Voices(()=>0), npc = {};
  const cautious = new Set(['arma:potente','caracter:cauto']);
  expect(voices.comment(npc,'susto',new Set(['caracter:cauto']))).toBeUndefined();
  expect(voices.comment(npc,'impresionado',cautious)).toBeUndefined();
  const first=voices.comment(npc,'susto',cautious);
  expect(first).toBeTruthy();
  expect(voices.comment(npc,'susto',cautious)).not.toBe(first);
  expect(voices.comment(npc,'impresionado',new Set(['arma:potente','caracter:curioso']))).toBeTruthy();
  expect(voices.mission(npc,'sable','fin')).not.toBe(voices.mission(npc,'sable','fin'));
  expect(powerful(undefined)).toBe(false);
});

it('un transeúnte solo reacciona al arma potente equipada que alcanza a ver',()=>{
  const now=Date.now();
  const bystander=(id:number)=>({id,kind:'npc',npcType:'civil',npc:{type:'ambient',pauseUntil:0},x:5,y:0,path:[],labelVer:0});
  const npcs=[bystander(11),bystander(12)];
  const zone={query:()=>npcs};
  let lineClear=true;
  const weapon={id:'pesada',weapon:{damage:[15,35],kind:'ranged'}};
  const world={c:{items:[weapon]},combat:{lineClear:()=>lineClear},tick:10};
  const street=new Street(world as any) as any;
  street.rng=()=>.1;
  const player:any={kind:'player',x:0,y:0,facing:0,guard:false,conn:{p:{wanted:0}},inventory:[weapon]};
  const perceive=()=>street.aroundPlayer(zone,player,now);
  perceive();expect(street.lines).toHaveLength(0);
  player.weaponId='pesada';lineClear=false;perceive();expect(street.lines).toHaveLength(0);
  lineClear=true;player.buffs={invisible:now+5000};perceive();expect(street.lines).toHaveLength(0);
  player.buffs={};player.x=-6;perceive();expect(street.lines).toHaveLength(0);
  player.x=0;perceive();
  const lines=street.lines as {id:number;text:string}[];
  expect(lines).toHaveLength(2);
  for(const [id,pool] of [[11,'susto'],[12,'impresionado']] as const){
    expect(streetModules.find(m=>m.id===pool)!.comentarios).toContain(lines.find(l=>l.id===id)?.text);
  }
  perceive();expect(street.lines).toHaveLength(2);
});

describe('descubrimiento del mapa por WebSocket y base de datos', () => {
  let app:Awaited<ReturnType<typeof createApp>>;
  const clients:BotClient[]=[];
  beforeAll(async()=>{app=await createApp({port:0,host:'127.0.0.1',pgliteDir:'memory://',ambientNpcs:0,crowdNpcs:0,speedScale:process.env.VERTICE_CAPTURAS?12:1,threats:false,lingerSeconds:0,logLevel:'warn'});});
  afterAll(async()=>{for(const b of clients)b.close();await app?.close();});
  it('recuerda la clínica tras reconectar y exige Interfaz 15 al personaje que descifra el plano', async()=>{
    const base='http://127.0.0.1:'+app.port;
    async function join(name:string,token?:string){
      token??=await BotClient.registerAndCreate(base,name);
      const b=new BotClient(base,name);clients.push(b);
      await b.connect(token,app.contentHash);
      await b.until(()=>b.log.some(m=>m.t==='atlas'&&!!m.reset));
      const c=[...app.world.conns.values()].find(c=>c.p?.name===name)!;
      return {b,c,token};
    }
    const a=await join('PruebaAtlas'), other=await join('OtroAtlas');
    const output=process.env.VERTICE_CAPTURAS;
    if(output){
      await a.b.enterDoor('Salida');
      await a.b.moveAndArrive(39.5,201.5,20000);
    } else await app.world.teleport(a.c,'vertice',[39,201]);
    const door=[...a.c.e!.zone.entities].find(d=>d.doorTo?.zone==='clinica-sato')!;
    expect(door).toBeTruthy();
    const p=a.c.p!, seen=()=>mapKnowledge(p);
    expect(seen().places).not.toContain('clinica-sato');
    await a.b.until(()=>seen().cells.includes(cellKey('vertice',39,201)));
    const states=[seen()];
    expect((await a.b.cmd({t:'interact',target:door.id})).ok).toBe(true);
    await a.b.until(()=>a.b.zone==='clinica-sato'&&seen().places.includes('clinica-sato'));
    states.push(seen());
    expect(mapKnowledge((await loadPlayer(app.db,p.charId))!).places).toContain('clinica-sato');
    const deltas=await Promise.all([rememberMap(app.db,p,'vertice',88,88),rememberMap(app.db,p,'vertice',88,88)]);
    expect(deltas.filter(Boolean)).toHaveLength(1);
    p.skillXp.interfaz=skillXpFor(14);
    expect((await a.b.cmd({t:'mapHack'})).ok).toBe(false);
    p.skillXp.interfaz=skillXpFor(15);
    expect((await a.b.cmd({t:'mapHack'})).ok).toBe(true);
    expect((await a.b.cmd({t:'mapHack'})).ok).toBe(true);
    if(output){
      states.push(seen());
      mkdirSync(output,{recursive:true});
      writeFileSync(joinPath(output,'estados.json'),JSON.stringify(states));
    }
    a.b.close();
    await a.b.until(()=>!app.world.conns.has(a.c.accountId));
    const back=await join('PruebaAtlas',a.token);
    const atlas=new Atlas();
    for(const msg of back.b.log)if(msg.t==='atlas')atlas.apply(msg.map,msg.reset);
    expect(atlas.unlocked).toBe(true);
    expect(atlas.places.has('clinica-sato')).toBe(true);
    expect(mapKnowledge(other.c.p!).unlocked).toBe(false);
    expect(mapKnowledge(other.c.p!).places).not.toContain('clinica-sato');
  });
});
