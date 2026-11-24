import { describe, expect, it } from 'vitest';
import { findPath, isWalkable, seededRng, ZoneSchema, type WeaponDef } from '@vertice/shared';
import { TacticalAI, seesTile, tacticalProfile, type Point } from '../src/world/tactics.js';
import { pedestrianRoute } from '../src/world/pedestrian-routes.js';
import { Zone } from '../src/world/zone.js';
import type { Entity } from '../src/world/entity.js';

const handgun = { kind: 'ranged', range: 18 } as WeaponDef;
const melee = { kind: 'melee', range: 1.7 } as WeaponDef;
const actor = (z: Zone, id: number, type: Entity['npcType'], x: number, y: number, hp = 50) => {
  const e = {
    id, kind: type ? 'npc' : 'player', npcType: type, faction: type === 'hierro' ? 'unidad-hierro' : type === 'police' ? 'pcv' : 'kitsune',
    x, y, npcHp: hp, npcMax: 50, aggro: type ? 1 : undefined, path: [], facing: 0,
    label: '', labelVer: 0, moving: false, state: 'alive',
  } as unknown as Entity;
  z.add(e);
  return e;
};
const arena = (wall = false, opening = 9) => new Zone(ZoneSchema.parse({
  id: 'arena', name: 'Arena de ensayo', kind: 'interior', width: 29, height: 22,
  base: 'tile', danger: 'public', safePoint: [5, 4],
  blocks: wall ? [{ type: 'wall', rect: [13, opening, 1, 20-opening], height: 2 }] : [],
}));
function engine(z: Zone, cover = (_from: Point, _to: Point) => 0) {
  const moves: { id: number; point: Point }[] = [];
  const ai = new TacticalAI((e,x,y) => {
    const path = findPath(z.grid,e.x,e.y,x,y,900);
    if (!path.ok) return false;
    e.path = path.path;
    moves.push({ id: e.id, point: { x, y } });
    return true;
  },cover);
  return { ai, moves };
}

describe('Decisiones tácticas de los PNJ', () => {
  it('la PCV contiene, los mercenarios toman posiciones distintas y las bandas pueden esperar ocultas', () => {
    for (const type of ['police','hierro'] as const) {
      const z = arena(), { ai, moves } = engine(z);
      const target = actor(z,1,undefined,20.5,10.5);
      const lead = actor(z,2,type,10.5,10.5);
      const wing = actor(z,3,type,9.5,9.5);
      const other = actor(z,4,type,9.5,12.5);
      expect(tacticalProfile(lead)).toBe(type === 'police' ? 'police' : 'mercenary');
      expect(ai.plan(lead,target,handgun,10000)).toBe('attack');
      expect(ai.plan(wing,target,handgun,10000)).toBe('moving');
      expect(ai.plan(other,target,handgun,10000)).toBe('moving');
      expect(wing.label).toBe(type === 'police' ? 'Vigilando el paso' : 'Rodeando');
      expect(other.label).toBe('Rodeando');
      expect(Math.hypot(moves[0].point.x-moves[1].point.x,moves[0].point.y-moves[1].point.y)).toBeGreaterThanOrEqual(2.4);
    }
    const z = arena(true,9), { ai, moves } = engine(z);
    const target = actor(z,1,undefined,16.5,7.5);
    const lead = actor(z,2,'gang',10.5,7.5);
    const wing = actor(z,3,'gang',11.5,8.5);
    expect(ai.plan(lead,target,handgun,10000)).toBe('attack');
    expect(ai.plan(wing,target,melee,10000)).toBe('moving');
    expect(wing.label).toBe('Al acecho');
    expect(seesTile(z.grid,target,moves.at(-1)!.point)).toBe(false);
  });

  it('busca una posición protegida al resultar herido y las paredes cortan el disparo', () => {
    const z = arena(), { ai, moves } = engine(z, (_from, to) => to.y < 9 ? 6 : 0);
    const target = actor(z,1,undefined,20.5,10.5);
    const agent = actor(z,2,'police',9.5,11.5);
    agent.lastHitAt = 9400;
    expect(ai.plan(agent,target,handgun,10000)).toBe('moving');
    expect(agent.label).toBe('Buscando cobertura');
    expect(moves[0].point.y).toBeLessThan(9);

    const hurt = actor(z,3,'hierro',9.5,13.5,12);
    expect(ai.plan(hurt,target,handgun,10000)).toBe('moving');
    expect(hurt.label).toBe('Reagrupándose');
    expect(Math.hypot(moves.at(-1)!.point.x-target.x,moves.at(-1)!.point.y-target.y))
      .toBeGreaterThan(Math.hypot(hurt.x-target.x,hurt.y-target.y));
  });

  it('ignora al objetivo nunca visto y conserva solo la última posición observada cuando desaparece', () => {
    const z = arena(true,9), { ai, moves } = engine(z);
    const target = actor(z,1,undefined,16.5,12.5);
    const agent = actor(z,2,'hierro',10.5,12.5);
    expect(ai.plan(agent,target,handgun,10000)).toBe('waiting');
    expect(moves).toHaveLength(0);
    target.x=10.5;target.y=7.5;
    expect(ai.plan(agent,target,handgun,10600)).toBe('attack');
    target.x=19.5;target.y=17.5;
    expect(ai.plan(agent,target,handgun,11200)).toBe('moving');
    expect(moves.at(-1)?.point).toEqual({x:10.5,y:7.5});
    agent.path=[];
    expect(ai.plan(agent,target,handgun,21000)).toBe('end');
    expect(ai.plan(agent,target,handgun,21500,true)).toBe('waiting');
  });

  it('un aviso permite investigar un lugar concreto sin convertirlo en un blanco visible', () => {
    const z = arena(true,9), { ai, moves } = engine(z);
    const target = actor(z,1,undefined,17.5,15.5);
    const agent = actor(z,2,'police',9.5,12.5);
    ai.report(agent,target,{x:11.5,y:9.5},10000);
    expect(ai.plan(agent,target,handgun,10000)).toBe('moving');
    expect(agent.label).toBe('Buscando al objetivo');
    expect(moves[0].point).toEqual({x:11.5,y:9.5});
    expect(ai.observation(agent,target.id,10000)).toBeUndefined();
  });

  it('evalúa encuentros aleatorios con rutas válidas, sin atacar a través de paredes ni ocultación', () => {
    const runs = Math.max(256, Math.min(4096, Number(process.env.VERTICE_TACTICAL_TRIALS) || 256));
    const rng = seededRng(85943);
    let commands = 0, searches = 0, shotChecks = 0;
    for (let i = 0; i < runs; i++) {
      const z = arena(i % 4 !== 0, 6 + Math.floor(rng()*6));
      const { ai, moves } = engine(z, (_from,p) => p.y < 6 ? 3 : 0);
      const t = actor(z,1,undefined,20.5,5.5);
      const npc = actor(z,2,['police','gang','hierro'][i % 3] as Entity['npcType'],6.5 + Math.floor(rng()*6), 4.5 + Math.floor(rng()*11));
      const wing = actor(z,3,npc.npcType,npc.x-2,npc.y+1);
      for (let frame = 0; frame < 14; frame++) {
        t.y = 3.5 + Math.floor(rng()*15);
        t.x = 9.5 + Math.floor(rng()*13);
        if (!isWalkable(z.grid,t.x,t.y)) t.x = 17.5;
        const obscured = i%7 === 0 && frame > 3;
        for (const [agent,weapon] of [[npc,handgun],[wing,i%2===0?melee:handgun]] as const) {
          const action = ai.plan(agent,t,weapon,10000+frame*650,obscured);
          if (action === 'attack') {
            expect(obscured).toBe(false);
            expect(seesTile(z.grid,agent,t)).toBe(true);
            expect(Math.hypot(agent.x-t.x,agent.y-t.y)).toBeLessThanOrEqual(weapon.range-.2);
            shotChecks++;
          }
          if (agent.label === 'Buscando al objetivo') searches++;
          const next = agent.path.shift();
          if (next) {
            expect(isWalkable(z.grid,...next)).toBe(true);
            [agent.x,agent.y] = next;
            z.moved(agent);
          }
        }
      }
      commands += moves.length;
    }
    expect(commands).toBeGreaterThan(runs);
    expect(searches).toBeGreaterThan(runs);
    expect(shotChecks).toBeGreaterThan(runs);
    console.log('[simulación]', { encuentros: runs, rutas: commands, decisionesDeAtaqueValidadas: shotChecks, decisionesDeBusqueda: searches });
  }, 35000);

  it('genera circuitos personales repetibles y variados', () => {
    const z = arena(true,9);
    const routes = Array.from({length:96},(_,i)=>pedestrianRoute(z.grid,9.5,9.5,9,seededRng(100+i),[[6,4],[10,5],[14,5]]));
    expect(routes.every(r=>r.length>=3 && isWalkable(z.grid,...r[0]) && r.at(-1)?.join(',')==='9.5,9.5')).toBe(true);
    expect(new Set(routes.map(r=>JSON.stringify(r))).size).toBeGreaterThan(90);
    expect(pedestrianRoute(z.grid,9.5,9.5,9,seededRng(100),[[6,4],[10,5],[14,5]])).toEqual(routes[0]);
  });
});
