import { expect, it } from 'vitest';
import { canSee, coversActor, findPath, isWalkable, pedestrianGrid, roadMap, UNAIDED_SIGHT } from '@vertice/shared';
import type { PlayerConn } from '../src/world/world.js';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

it('distribuye peatones por barrio y replica solo entidades con línea de visión, también con óptica panorámica', async () => {
  const app = await createApp({port:0,host:'127.0.0.1',pgliteDir:'memory://',ambientNpcs:24,crowdNpcs:0,threats:false,logLevel:'warn'});
  const w = app.world, z = w.zones.get('vertice')!, g = z.grid;
  const url = 'http://127.0.0.1:'+app.port, viewer = new BotClient(url,'Marina');
  try {
    const people = [...z.entities].filter(e => e.dialog === 'transeunte' && e.npcType === 'civil');
    const pavement = pedestrianGrid(g,'stop');
    expect(people.every(e => isWalkable(pavement,e.x,e.y))).toBe(true);
    const count = (id:string) => people.filter(e => z.districtAt(e.x,e.y)?.id === id).length;
    expect(count('cenit')).toBeGreaterThan(count('yermo') * 5);
    expect(new Set(people.map(e => e.appearance?.body)).size).toBe(2);
    const road = roadMap(g);
    const route = findPath(g, 323.5, 435.5, 323.5, 422.5, 20000, {pedestrian:true});
    expect(route.ok).toBe(true);
    let ax=323.5, ay=435.5;
    for(const [bx,by] of route.path){
      const steps=Math.ceil(Math.hypot(bx-ax,by-ay)*20);
      for(let i=1;i<=steps;i++){
        const at=Math.floor(ay+(by-ay)*i/steps)*g.w+Math.floor(ax+(bx-ax)*i/steps);
        if(road.axis[at] && !road.crossing[at]) throw Error('Atajo por asfalto');
      }
      ax=bx;ay=by;
    }
    const probe = (name:string,y:number) => w.addEntity(z,{kind:'npc',name,x:325.5,y,interactive:false,label:''});
    const rear=probe('En la acera de atrás',432.5), hidden=probe('Tras el edificio',447.5);
    await viewer.connect(await BotClient.registerAndCreate(url,'Marina'),app.contentHash);
    const c=[...w.conns.values()].find(o=>o.p?.name==='Marina')!;
    await w.teleport(c,z.id,[325,434]);
    await viewer.cmd({t:'guard',on:true,facing:2});
    const snapshot=()=> (w as unknown as {snapshot(c:PlayerConn):void}).snapshot(c);
    snapshot();
    expect(c.known.has(hidden.id)).toBe(false);
    expect(c.known.has(rear.id)).toBe(false);
    c.p!.cyber.push({id:'test-lente',def:'ojo-panorama',location:'inventory',stolen:false});
    snapshot(); expect(c.known.has(rear.id)).toBe(false);
    c.p!.cyber.at(-1)!.location='installed';
    snapshot(); expect(c.known.has(rear.id)).toBe(true); expect(c.known.has(hidden.id)).toBe(false);
    await viewer.until(()=>viewer.entities.has(rear.id));
    c.p!.cyber.at(-1)!.location='inventory';
    snapshot(); await viewer.until(()=>!viewer.entities.has(rear.id));
    await w.teleport(c,z.id,[325,449]); await viewer.cmd({t:'guard',on:true,facing:6});
    await viewer.until(()=>viewer.entities.has(hidden.id));
    expect(canSee(g,325.5,449.5,6,UNAIDED_SIGHT,325.5,447.5)).toBe(true);
    expect(coversActor([312,436,28,9],16.2,310.5,434.5)).toBe(true);
    expect(coversActor([312,436,28,9],16.2,343.5,447.5)).toBe(false);
  } finally {viewer.close();await app.close();}
});
