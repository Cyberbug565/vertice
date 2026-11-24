import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

async function fixture() {
  const app = await createApp({ port: 0, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, threats: false, lingerSeconds: 0, logLevel: 'warn' });
  const url = 'http://127.0.0.1:' + app.port;
  const join = async (name: string) => {
    const bot = new BotClient(url, name);
    const token = await BotClient.registerAndCreate(url, name);
    await bot.connect(token, app.contentHash);
    const conn = [...app.world.conns.values()].find(c => c.p?.name === name)!;
    const talk = async (dialogue: string) => {
      const target = [...app.world.entities.values()].find(e => e.dialog === dialogue && (!e.privateTo || e.privateTo === conn));
      if (!target) throw new Error('Falta el contacto ' + dialogue);
      await app.world.teleport(conn, target.zone.id, [Math.floor(target.x), Math.floor(target.y)]);
      await bot.cmd({ t: 'closeDialog' });
      const reply = await bot.cmd({ t: 'interact', target: target.id, remote: true }).catch(err => { throw new Error('No se puede hablar con ' + dialogue, { cause: err }); });
      expect(reply.ok, reply.reason).toBe(true);
      await bot.until(() => !!bot.dialog, 3000, dialogue);
    };
    const choose = async (option: string) => {
      await new Promise(resolve => setTimeout(resolve, 55));
      expect(bot.dialog?.options.map(o => o.id), bot.dialog?.text).toContain(option);
      const ack = await bot.cmd({ t: 'choose', dialog: bot.dialog!.dialog, option, opId: randomUUID(), luck: 0 });
      expect(ack.ok).toBe(true);
    };
    return { bot, token, conn, talk, choose };
  };
  return { app, join, url };
}

it('guarda pistas, resuelve tres capítulos sin tiradas y muestra el desenlace del mercado al volver', async () => {
  const { app, join, url } = await fixture();
  const { bot, conn, token, talk, choose } = await join('Cronista');
  try {
    await talk('reme');
    await choose('pista-lista-kanal');
    expect(bot.journal.find(j => j.contract === 'lista-kanal')).toMatchObject({ state: 'lead', category: 'principal' });
    await app.world.facts.setTx(app.db, 'lumen_power', true, 90, 'prueba-apertura').then(apply => apply());
    await talk('nadia');
    await choose('preguntar-kanal'); await choose('aceptar');
    await talk('libro-muelle'); await choose('copiar');
    await talk('alma-ferro'); await choose('trato'); await choose('dar');
    await talk('iria-kanal'); await choose('garantia'); await choose('guardar');
    await talk('nadia'); await choose('oficial');
    expect(bot.journal.find(j => j.contract === 'lista-kanal')).toMatchObject({ state: 'completed', outcome: 'oficial' });
    await talk('sato'); await choose('lote'); await choose('aceptar');
    await talk('archivo-sato'); await choose('doblez'); await choose('tomar');
    await talk('sato'); await choose('resolver'); await choose('anonimo');
    await talk('nadia'); await choose('aceptar');
    await talk('lin'); await choose('turno-luz'); await choose('juntar');
    await talk('alma-ferro'); await choose('plazo'); await choose('tramitar-paralela');
    await talk('nadia'); await choose('moratoria');
    expect(bot.journal.find(j => j.contract === 'apagon-nombres')).toMatchObject({ outcome: 'moratoria', outcomeText: expect.stringContaining('congela las deudas') });
    await talk('nadia'); expect(bot.dialog?.options.map(o => o.id)).toContain('visita-acta');
    bot.close();
    await bot.until(() => bot.closed);
    await app.world.waitForAccountSave(conn.accountId);
    const returning = new BotClient(url, 'Cronista');
    try {
      const welcome = await returning.connect(token, app.contentHash);
      expect(welcome.journal.find(j => j.contract === 'apagon-nombres')).toMatchObject({ state: 'completed', outcome: 'moratoria' });
    } finally { returning.close(); }
  } finally { bot.close(); await app.close(); }
}, 35000);

it('una secundaria desbloquea salidas por sus pistas y un encargo breve se cierra en el lugar', async () => {
  const { app, join } = await fixture();
  const { bot, talk, choose } = await join('Lectora');
  try {
    await talk('reme'); await choose('barrio-cinta-espera');
    await talk('alba-voz'); await choose('aceptar');
    await talk('cinta-ensayo'); await choose('leer');
    await talk('alba-voz');
    expect(bot.dialog?.options.map(o => o.id)).toContain('barrio');
    expect(bot.dialog?.options.map(o => o.id)).not.toContain('privada');
    await choose('barrio');
    expect(bot.journal.find(j => j.contract === 'cinta-espera')).toMatchObject({ category: 'secundaria', outcome: 'barrio' });
    await talk('reme'); await choose('breve-ruta-nueve'); await choose('aceptar');
    await talk('enc-ruta-nueve'); await choose('hacer');
    expect(bot.journal.find(j => j.contract === 'ruta-nueve')).toMatchObject({ category: 'terciaria', state: 'completed' });
  } finally { bot.close(); await app.close(); }
}, 20000);

it('Milo aparece por azar, lleva a su pasajero en coche y deja el hallazgo privado y persistente', async () => {
  const { app, join } = await fixture();
  const guest = await join('Viajera'), other = await join('Curiosa');
  try {
    await app.world.teleport(guest.conn, 'vertice', [667, 465]);
    await app.world.teleport(other.conn, 'vertice', [690, 465]);
    app.world.missions.tick(Date.now(), () => .99);
    expect([...app.world.entities.values()].some(e => e.dialog === 'milo-barranco')).toBe(false);
    app.world.missions.tick(Date.now() + 50_000, () => 0);
    const milo = [...app.world.entities.values()].find(e => e.dialog === 'milo-barranco')!;
    expect(milo.privateTo).toBe(guest.conn);
    await app.world.teleport(other.conn, 'vertice', [667, 465]);
    expect((await other.bot.cmd({ t: 'interact', target: milo.id, remote: true })).ok).toBe(false);
    await guest.talk('milo-barranco');
    await guest.choose('broma'); await guest.choose('ver'); await guest.choose('coche');
    expect(guest.conn.e?.vehicle).toBe('brennan-bisonte');
    expect(guest.conn.e?.missionRide).toBeDefined();
    await guest.bot.until(() => guest.conn.e?.missionRide === undefined, 12000, 'coche en el terraplén');
    expect(guest.conn.e?.x).toBeCloseTo(712.5);
    app.world.missions.tick(Date.now() + 51_000, () => 0);
    await guest.talk('objeto-barranco'); await guest.choose('sonido'); await guest.choose('escuchar'); await guest.choose('testigo');
    expect(guest.bot.journal.find(j => j.contract === 'luz-del-barranco')).toMatchObject({ category: 'evento', outcome: 'testigo' });
    await guest.bot.cmd({ t: 'closeDialog' });
    app.world.missions.tick(Date.now() + 170_000, () => .99);
    await guest.talk('objeto-barranco'); expect(guest.bot.dialog?.text).toContain('cuatro veces');
  } finally { guest.bot.close(); other.bot.close(); await app.close(); }
}, 24000);
