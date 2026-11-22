import { describe, expect, it } from 'vitest';
import { Atlas, cellKey, type ZoneDef } from '@vertice/shared';
import { atlasMarks, MapViewport } from '../src/ui/atlas-view';
import { cadence, chooseGait, gaitProfile, sampleLeg, type Gait } from '../src/render/locomotion';
import cycles from '../src/render/motion/ciclos.json';
import cityData from '../../content/zones/vertice.json';

const city = cityData as ZoneDef;
const clinic = city.doors.find(d => d.to.zone === 'clinica-sato')!;

describe('atlas del personaje', () => {
  it('arrastra, amplía manteniendo fijo el punto bajo el cursor y puede volver al jugador', () => {
    const camera = new MapViewport(city);
    camera.width = 790;
    camera.height = 420;
    camera.focus({x:110,y:180});
    const before = camera.world(310,155);
    camera.zoomAt(2,310,155);
    expect(camera.world(310,155).x).toBeCloseTo(before.x,8);
    expect(camera.world(310,155).y).toBeCloseTo(before.y,8);
    const p = camera.screen(before);
    camera.pan(43,-29);
    expect(camera.screen(before).x-p.x).toBeCloseTo(43);
    expect(camera.screen(before).y-p.y).toBeCloseTo(-29);
    camera.focus(before);
    expect(camera.screen(before)).toEqual({x:395,y:210});
  });
  it('visitar una celda no descubre la puerta y cambiar de personaje borra el plano recibido', () => {
    const atlas = new Atlas();
    const [x,y] = clinic.at;
    atlas.apply({cells:[cellKey('vertice',x,y)],places:[],unlocked:false},true);
    expect(atlas.seen('vertice',x,y)).toBe(true);
    expect(atlasMarks(city,atlas).places).toEqual([]);
    atlas.apply({cells:[],places:[clinic.to.zone],unlocked:false});
    expect(atlasMarks(city,atlas).places.map(p=>p.id)).toContain(clinic.id);
    atlas.apply({cells:[],places:[],unlocked:true});
    expect(atlasMarks(city,atlas).places).toHaveLength(city.doors.length);
    atlas.apply({cells:[],places:[],unlocked:false},true);
    expect(atlas.seen('vertice',x,y)).toBe(false);
    expect(atlas.knows(clinic.to.zone)).toBe(false);
  });
});

describe('articulación de la marcha', () => {
  it('cierra siete ciclos continuos y conserva la flexión independiente de rodilla, tobillo y punta', () => {
    const all = Object.keys(cycles).filter(k=>k!=='canales') as Gait[];
    expect(all.length).toBeGreaterThanOrEqual(7);
    for(const style of all){
      const p=gaitProfile(style);
      expect(p.tiempos.length).toBeGreaterThanOrEqual(9);
      const a=new Float64Array(6), b=new Float64Array(6);
      sampleLeg(style,0,a); sampleLeg(style,1-1e-8,b);
      for(let i=0;i<a.length;i++)expect(a[i]).toBeCloseTo(b[i],5);
      const samples=Array.from({length:100},(_,frame)=>{
        sampleLeg(style,frame/100,b);
        return [b[1],b[2],b[3]];
      });
      for(let joint=0;joint<3;joint++){
        const angles=samples.map(frame=>frame[joint]);
        expect(Math.max(...angles)-Math.min(...angles)).toBeGreaterThan(.15);
      }
      expect(p.poses.some(frame=>frame[3]<-5)).toBe(true);
      expect(cadence(style,2)).toBeGreaterThan(0);
    }
    expect(gaitProfile('marcha').apoyo).toBeCloseTo(.6);
    expect(gaitProfile('esprint').apoyo).toBeLessThan(gaitProfile('marcha').apoyo);
  });
  it('elige el paso por carga, lesión, guardia y velocidad', () => {
    expect(chooseGait(1,false,false)).toBe('paseo');
    expect(chooseGait(2.4,false,false)).toBe('marcha');
    expect(chooseGait(3.9,true,false)).toBe('trote');
    expect(chooseGait(5.5,true,false)).toBe('esprint');
    expect(chooseGait(2,false,true)).toBe('cautela');
    expect(chooseGait(2,false,false,['paso-carga'])).toBe('carga');
    expect(chooseGait(3,true,false,[],true)).toBe('cojera');
  });
});
