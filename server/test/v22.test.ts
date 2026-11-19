// v0.22 · Ropa por capas (chaqueta, camiseta, pantalón, botas, casco, máscara, guantes, accesorio y ropa interior),
// quitarse la ropa (se ve el cuerpo), prendas de un solo sexo, monos que ocupan dos huecos y prendas 3D ajustadas.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { wornAppearance } from '../src/game/player.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { GARMENTS, UNDERWEAR, WEAR_SLOTS } from '@vertice/shared';

const DB = process.env.TEST_DATABASE_URL;
const pub = (p: string) => fileURLToPath(new URL(`../../client/public/${p}`, import.meta.url));
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });
async function join(name: string, body: 'masculino' | 'femenino') {
  const token = await BotClient.registerAndCreate(base, name, 'solo', 'callejero', {});
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  const c = [...app.world.conns.values()].find((x) => x.p?.name === name)!;
  c.p!.appearance = { ...c.p!.appearance, body };
  return c;
}
const wear = (c: any, slot: string, item: string | null) => (app.world as any).survival.wear(c, slot, item);
const give = (c: any, ...ids: string[]) => { for (const id of ids) c.p.inventory.set(id, 1); };

describe('v0.22', () => {
  it('hay huecos para chaqueta, camiseta, pantalón, botas, casco, máscara, guantes, accesorio y ropa interior', () => {
    for (const s of ['torso_ext', 'torso_int', 'piernas', 'pies', 'cabeza', 'cara', 'manos', 'accesorio', 'interior_sup', 'interior_inf']) expect((WEAR_SLOTS as readonly string[]).includes(s)).toBe(true);
  });

  it('quitarse una prenda deja esa parte al aire y «default» devuelve la ropa de serie', async () => {
    const c = await join('desnudo', 'masculino');
    wear(c, 'torso_int', null); wear(c, 'torso_ext', null);
    let a: any = wornAppearance(app.world.c, c.p!);
    expect(a.bare.split(',')).toContain('torso');
    wear(c, 'piernas', null); wear(c, 'interior_inf', null);
    a = wornAppearance(app.world.c, c.p!);
    expect(a.bare.split(',')).toContain('piernas');
    expect(a.underBottom).toBe('');
    wear(c, 'torso_int', 'default'); wear(c, 'torso_ext', 'default');
    a = wornAppearance(app.world.c, c.p!);
    expect((a.bare ?? '').split(',')).not.toContain('torso');
  });

  it('solo se cambia la prenda del mismo hueco: chaqueta y camiseta a la vez, o chaqueta sin camiseta', async () => {
    const c = await join('capas', 'masculino');
    give(c, 'chaqueta-caqui', 'jersey-cyber', 'pantalon-cuero-ajustado');
    wear(c, 'torso_ext', 'chaqueta-caqui'); wear(c, 'torso_int', 'jersey-cyber'); wear(c, 'piernas', 'pantalon-cuero-ajustado');
    let a: any = wornAppearance(app.world.c, c.p!);
    expect(a.garments.split(',').sort()).toEqual(['chaqueta-caqui', 'jersey-cyber', 'pantalon-cuero-ajustado']);
    wear(c, 'torso_int', null);
    a = wornAppearance(app.world.c, c.p!);
    expect(a.garments.split(',')).toEqual(['chaqueta-caqui', 'pantalon-cuero-ajustado']);
    expect(c.p!.wear.torso_ext).toBe('chaqueta-caqui');
  });

  it('un mono ocupa camiseta y pantalón; ponerse un pantalón lo quita', async () => {
    const c = await join('monos', 'masculino');
    give(c, 'mono-bolsillos', 'pantalon-cuero-ajustado');
    wear(c, 'piernas', 'pantalon-cuero-ajustado');
    wear(c, 'torso_int', 'mono-bolsillos');
    expect(c.p!.wear.piernas).toBe('');
    wear(c, 'piernas', 'pantalon-cuero-ajustado');
    expect(c.p!.wear.torso_int).toBe('');
    expect(c.p!.wear.piernas).toBe('pantalon-cuero-ajustado');
  });

  it('la ropa de mujer no se la puede poner un hombre (ni la ve en la tienda) y al revés', async () => {
    const m = await join('hombre22', 'masculino'), f = await join('mujer22', 'femenino');
    give(m, 'falda-larga', 'sujetador-negro', 'boxer-negro'); give(f, 'falda-larga', 'sujetador-negro', 'boxer-negro');
    expect(() => wear(m, 'piernas', 'falda-larga')).toThrow();
    expect(() => wear(m, 'interior_sup', 'sujetador-negro')).toThrow();
    expect(() => wear(f, 'interior_inf', 'boxer-negro')).toThrow();
    wear(f, 'piernas', 'falda-larga'); wear(f, 'interior_sup', 'sujetador-negro');
    const a: any = wornAppearance(app.world.c, f.p!);
    expect(a.underTop).toBe('sujetador');
    const market = (app.world as any).survival.market;
    const ids = (p: any) => market.shopView('moda-orbita', p).items.map((x: any) => x.item);
    expect(ids(f.p)).toContain('falda-larga');
    expect(ids(m.p)).not.toContain('falda-larga');
  });

  it('cada prenda 3D tiene su modelo ajustado a los cuerpos que la pueden llevar', () => {
    for (const g of GARMENTS.filter((x) => !x.extra)) {
      for (const k of g.sex === 'u' ? ['masculino', 'femenino'] : g.sex === 'm' ? ['masculino'] : ['femenino']) expect(existsSync(pub(`models/prendas/${k}/${g.id}.glb`)), `${k}/${g.id}`).toBe(true);
      expect(app.world.c.items.some((i) => i.wear?.style === `g:${g.id}`)).toBe(true);
    }
    expect(GARMENTS.length).toBeGreaterThanOrEqual(50);
  });

  it('ropa interior y lencería a la venta, y los cuerpos traen sus máscaras de ropa interior', () => {
    expect(UNDERWEAR.filter((u) => u.lace).length).toBeGreaterThanOrEqual(3);
    for (const u of UNDERWEAR) expect(app.world.c.items.some((i) => i.wear?.style === `u:${u.id}`)).toBe(true);
    expect(app.world.c.shops.find((s) => s.id === 'boutique-aurelia')!.stock['sujetador-encaje-negro']).toBeGreaterThan(0);
    for (const k of ['masculino', 'femenino']) expect(existsSync(pub(`models/humanos/interior-${k}.png`))).toBe(true);
  });
});
