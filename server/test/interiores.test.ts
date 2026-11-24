import { expect, it } from 'vitest';
import { Interiors, roomToCity, cityToRoom, buildZoneGrid, findPath, portalZoneDef, portalZoneId } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { loadValidatedContent } from '../src/content.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

it('ajusta los planos al perímetro construido y reserva otra altura a las plantas superiores', () => {
  const c = loadValidatedContent().content, index = new Interiors(c);
  const city = c.zones.find(z=>z.id==='vertice')!;
  expect(index.around(city.id,360,280,1000).length).toBeGreaterThan(330);
  const room = (id: string) => c.zones.find(z=>z.id===id)!;
  for (const id of ['bloque9','tienda-24h-int','okami-super-int','comisaria-int','comisaria-ferro',
    'yuki-int','comisaria-int-servicios','comisaria-colinas-servicios']) {
    const z=room(id), frame=index.frame(z)!;
    expect(frame,id).toBeDefined();
    const [x,y,w,h]=frame.entrance.rect;
    for(const [a,b] of [[0,0],[z.width,0],[0,z.height],[z.width,z.height]]){
      const pos=roomToCity(frame,a,b);
      expect(pos[0]).toBeGreaterThanOrEqual(x-1e-7);expect(pos[0]).toBeLessThanOrEqual(x+w+1e-7);
      expect(pos[1]).toBeGreaterThanOrEqual(y-1e-7);expect(pos[1]).toBeLessThanOrEqual(y+h+1e-7);
      expect(cityToRoom(frame,...pos)[0]).toBeCloseTo(a);
      expect(cityToRoom(frame,...pos)[1]).toBeCloseTo(b);
    }
    expect(roomToCity(frame,...frame.local)).toEqual(frame.city);
  }
  for (const z of c.zones.filter(z=>z.storey)) {
    const f=index.frame(z)!;
    expect(f.height).toBeGreaterThan(index.frame(room(z.storey!.of))!.height);
    const grid=buildZoneGrid(z);
    expect(findPath(grid,3.5,1.5,z.width-3.5,Math.floor(z.height/2)+.5).ok,z.id).toBe(true);
  }
  for(const h of c.houses){
    const flat={...room(h.template),id:'casa:'+h.id};
    expect(index.frame(flat),h.id).toBeDefined();
  }
  const house = c.houses.find(h=>h.building==='ferro-portal-1') ?? c.houses.find(h=>h.district==='ferro')!;
  const hall = portalZoneDef(c,portalZoneId(house.building,house.floor));
  if(hall?.doors.some(d=>d.id.endsWith(':casa')) && index.frame(hall)) {
    expect(index.frame(hall)?.city).toEqual(index.frame({...room(house.template),id:'casa:'+house.id})?.city);
  }
});

it('cruza por el umbral con el teclado y cambia de planta sin perder la ubicación del inmueble', async () => {
  const app=await createApp({port:0,host:'127.0.0.1',pgliteDir:'memory://',ambientNpcs:0,crowdNpcs:0,threats:false,logLevel:'warn'});
  const url='http://127.0.0.1:'+app.port, bot=new BotClient(url,'Umbral');
  try {
    await bot.connect(await BotClient.registerAndCreate(url,'Umbral'),app.contentHash);
    const c=[...app.world.conns.values()][0], actor=c.e!;
    const walk=(dx:number,dy:number)=>bot.raw({t:'steer',seq:300,dx,dy});
    await app.world.teleport(c,'vertice',[75,187]);
    walk(0,-1);
    await bot.until(()=>bot.zone==='tienda-24h-int',5500,'paso en Aurora desde la calle');
    walk(0,0);
    expect(bot.log.some(m=>m.t==='zone'&&m.zone==='tienda-24h-int'&&m.crossing)).toBe(true);
    const exit=actor.zone.def.doors.find(d=>d.to.zone==='vertice')!;
    await app.world.teleport(c,actor.zone.id,[exit.at[0]-1,exit.at[1]]);
    await bot.until(()=>actor.zone.id==='tienda-24h-int');
    walk(1,0);
    await bot.until(()=>bot.zone==='vertice',5500,'salida sin botón');
    walk(0,0);
    await app.world.teleport(c,'comisaria-int',[3,1]);
    walk(0,-1);
    await bot.until(()=>bot.zone==='comisaria-int-servicios',4500,'subir andando');
    await new Promise(resolve=>setTimeout(resolve,650));
    expect(bot.zone).toBe('comisaria-int-servicios');
    walk(0,0);
    await bot.enterDoor('Bajar a Recepción');
    expect(bot.zone).toBe('comisaria-int');
    expect(app.world.interiors.frame(actor.zone.def)?.height).toBe(0);
  } finally { bot.close();await app.close(); }
},22000);
