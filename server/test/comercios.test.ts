import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { findPath, type ServerMsg } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { protectionPolicy } from '../src/world/robberies.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

let app: Awaited<ReturnType<typeof createApp>>;
const bots: BotClient[] = [];
const connect = (b: BotClient) => [...app.world.conns.values()].find(c=>c.p?.name === b.name)!;
const object = (key: string) => [...app.world.entities.values()].find(e=>e.businessSite === key)!;
const waitResult = (b: BotClient) => b.waitFor<Extract<ServerMsg,{t:'reward'}>>(m=>m.t==='reward' && m.title.startsWith('Botín ·'),9000,'botín');

beforeAll(async () => {
  app=await createApp({port:0,host:'127.0.0.1',pgliteDir:'memory://',databaseUrl:undefined,ambientNpcs:0,crowdNpcs:0,
    threats:false,lingerSeconds:0,needsScale:0,logLevel:'warn',cityHourOffset:13-Date.now()/225000%24});
  app.world.survival.rng=()=>.01;
});
afterAll(async () => { for (const b of bots) b.close(); await app?.close(); });

async function join(name: string) {
  const url='http://127.0.0.1:'+app.port,b=new BotClient(url,name);
  bots.push(b);
  await b.connect(await BotClient.registerAndCreate(url,name,'solo','callejero'),app.contentHash);
  return b;
}

async function atCounter(b: BotClient, site: string) {
  const e=object(site), c=connect(b);
  await app.world.teleport(c,e.zone.id,[Math.floor(e.x)+1,Math.floor(e.y)]);
  return e;
}

async function business(b: BotClient,key: string) {
  const anchor=object(key);
  const wait=b.waitFor<Extract<ServerMsg,{t:'business'}>>(m=>m.t==='business' && m.view.target===anchor.id);
  expect((await b.cmd({t:'business',target:anchor.id,action:'view',opId:randomUUID()})).ok).toBe(true);
  return (await wait).view;
}

it('coloca ocho locales accesibles y asigna reservas a todos los comercios y matasanos', () => {
  const w=app.world;
  expect(w.c.shops.filter(s=>s.business)).toHaveLength(8);
  for (const shop of w.c.shops.filter(s=>s.business)) {
    const z=w.zones.get(shop.zone)!;
    const f=w.interiors.frame(z.def);
    expect(f,shop.id).toBeDefined();
    expect(findPath(z.grid,11.5,5.5,5.5,5.5).ok,shop.id).toBe(true);
    expect(object('tienda:'+shop.id),shop.id).toBeDefined();
  }
  for (const shop of w.c.shops.filter(s=>s.zone!=='*')) expect(object('tienda:'+shop.id),shop.id).toBeDefined();
  for (const doc of w.c.ripperdocs) expect(object('consulta:'+doc.id),doc.id).toBeDefined();
  const mini=object('tienda:mini-bloque22'), jewel=object('tienda:aurea-colinas'), doc=object('consulta:okami');
  expect([...mini.zone.actors].filter(e=>e.businessGuard)).toHaveLength(0);
  for (const high of [jewel,doc]) expect([...high.zone.actors].filter(e=>e.businessGuard && e.weaponId==='rifle-asalto')).toHaveLength(3);
  expect([...object('consulta:remache').zone.actors].some(e=>e.title==='Protección de la banda' && e.faction==='engranajes')).toBe(true);
});

it('resuelve dos intentos concurrentes de sigilo con un único botín persistente y sin aviso', async () => {
  const a=await join('SigiloVega'), b=await join('SigiloLuz');
  const w=app.world, sid='tienda:mini-bloque22';
  const door=[...w.entities.values()].find(e=>e.doorTo?.zone==='mini-bloque22-int')!;
  await w.teleport(connect(a),door.zone.id,[Math.floor(door.x),Math.floor(door.y)]);
  await a.enterDoor('Mini 24');
  const spot=await atCounter(a,sid);
  await atCounter(b,sid);
  for(const bot of [a,b])connect(bot).p!.attributes.DEX=10;
  const cash=connect(a).p!.money + connect(b).p!.money;
  expect((await business(a,sid)).options.find(x=>x.action==='stealth')?.blocked).toBeUndefined();
  const start=(bot:BotClient)=>bot.cmd({t:'business',target:spot.id,action:'stealth',opId:randomUUID()});
  expect((await Promise.all([start(a),start(b)])).every(m=>m.ok)).toBe(true);
  await a.until(()=>[a,b].some(bot=>bot.log.some(m=>m.t==='reward'&&m.title.startsWith('Botín'))),8000);
  const count=await app.db.query<{count:string}>("SELECT COUNT(*) FROM ops WHERE kind='commerce-raid' AND result->>'site'=$1 AND result->>'success'='true'",[sid]);
  expect(Number(count.rows[0].count)).toBe(1);
  expect(connect(a).p!.money+connect(b).p!.money).toBeGreaterThan(cash);
  expect(connect(a).p!.wanted+connect(b).p!.wanted).toBe(0);
  expect((await business(a,sid)).options.every(o=>o.blocked?.includes('reponiendo'))).toBe(true);
});

it('la intimidación de un comercio sin presupuesto no genera una patrulla', async () => {
  const a=await join('AtracoBajo'), c=connect(a), w=app.world, key='tienda:la-caldera';
  const s=await atCounter(a,key);
  c.p!.equipped='porra-electrica';
  c.p!.attributes.COOL=10;
  expect((await business(a,key)).protection).toMatch(/tarifa/);
  const result=waitResult(a);
  expect((await a.cmd({t:'business',target:s.id,action:'threat',opId:randomUUID()})).ok).toBe(true);
  await result;
  expect(a.log.some(m=>m.t==='notice' && /tarifa.*no está cubierta/.test(m.text))).toBe(true);
  w.robberies.tick(Date.now()+120000);
  expect([...s.zone.actors].some(e=>e.dispatchedUntil)).toBe(false);
  expect(protectionPolicy(9,0,false).budget).toBeLessThan(protectionPolicy(9,0,false).fee);
});

it('la fuerza exige neutralizar al personal y guardias, y activa una patrulla de pago',async () => {
  const a=await join('AsaltoGala'), c=connect(a), w=app.world, key='tienda:aurea-colinas';
  const store=await atCounter(a,key);
  const clerk=[...store.zone.actors].find(e=>e.businessJob===key)!;
  const security=[...store.zone.actors].filter(e=>e.businessGuard===key);
  expect((await a.cmd({t:'business',target:store.id,action:'force',opId:randomUUID()})).reason).toMatch(/personal/);
  clerk.state='downed';
  expect((await a.cmd({t:'business',target:store.id,action:'force',opId:randomUUID()})).reason).toMatch(/seguridad/);
  for(const guard of security)guard.state='downed';
  expect((await business(a,key)).guards).toBe(0);
  const result=waitResult(a);
  expect((await a.cmd({t:'business',target:store.id,action:'force',opId:randomUUID()})).ok).toBe(true);
  await result;
  const paid=await app.db.query<{calls_spent:number}>('SELECT calls_spent FROM business_reserves WHERE site=$1',[key]);
  expect(Number(paid.rows[0].calls_spent)).toBeGreaterThan(0);
  expect(c.p!.wanted).toBeGreaterThan(0);
  w.robberies.tick(Date.now()+45000);
  expect([...store.zone.actors].filter(e=>e.npcType==='police' && e.dispatchedUntil)).toHaveLength(2);
  await w.teleport(c,'bloque9',[8,8]);
});

it('un matasanos puede morir y la reserva entrega ciberware robado con procedencia',async () => {
  const a=await join('CromoSombra'), c=connect(a), w=app.world, key='consulta:remache';
  const safe=await atCounter(a,key);
  const doc=[...safe.zone.actors].find(e=>e.businessJob===key)!;
  expect(doc.npcMax).toBeGreaterThan(0);
  expect(doc.npcType).toBe('civil');
  doc.state='downed';
  await w.teleport(c,safe.zone.id,[Math.floor(doc.x)+1,Math.floor(doc.y)]);
  const kill=await a.cmd({t:'hostile',target:doc.id,action:'finish',opId:randomUUID(),remote:true});
  expect(kill.ok,kill.reason).toBe(true);
  expect(doc.dead).toBe(true);
  for (const guard of [...safe.zone.actors].filter(e=>e.businessGuard===key)) guard.state='downed';
  await atCounter(a,key);
  const result=waitResult(a);
  expect((await a.cmd({t:'business',target:safe.id,action:'force',opId:randomUUID()})).ok).toBe(true);
  await result;
  const persisted=await app.db.query<{stolen:boolean;history:{event:string}[]}>("SELECT stolen,history FROM cyberware_instances WHERE character_id=$1 AND stolen AND location='inventory'",[c.p!.charId]);
  expect(persisted.rows.some(r=>r.stolen && r.history.some(h=>h.event.includes('Taller Remache')))).toBe(true);
  expect(a.log.some(m=>m.t==='notice' && /banda se encarga/.test(m.text))).toBe(true);
});
