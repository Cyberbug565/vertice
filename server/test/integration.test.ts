// Recorrido multijugador de principio a fin sobre el protocolo real (hito 1).
// Usa PostgreSQL si TEST_DATABASE_URL está definida; si no, PGlite en memoria.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { lineWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];

async function resetDb() {
  if (!DB) return;
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
}

async function boot() {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 6, crowdNpcs: 0, speedScale: 5, lingerSeconds: 1, logLevel: 'warn', cityHourMs: 60000, cityHourOffset: 10 - ((Date.now() / 60000) % 24) });
  base = `http://127.0.0.1:${app.port}`;
}

async function join(username: string, role: string) {
  const token = await BotClient.registerAndCreate(base, username, role);
  const b = new BotClient(base, username);
  clients.push(b);
  await b.connect(token, app.contentHash);
  return { b, token };
}

beforeAll(async () => { await resetDb(); await boot(); });
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

describe('hito 1 · corte jugable de Ferro', () => {
  let ana: BotClient, bruno: BotClient, anaToken = '', brunoToken = '';

  it('creación de personaje: valida puntos y una sola vida activa por cuenta', async () => {
    const { token } = await BotClient.api(base, '/api/register', { username: 'validar', password: 'password1' });
    const bad = { name: 'Malo', origin: 'callejero', role: 'solo', attributes: { INT: 8, REF: 8, DEX: 8, TECH: 8, COOL: 8, WILL: 8, LUCK: 2, MOVE: 2, BODY: 2, EMP: 2 }, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' } };
    await expect(BotClient.api(base, '/api/characters', bad, token)).rejects.toThrow(/55/);
    const good = { ...bad, attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 } };
    await BotClient.api(base, '/api/characters', good, token);
    await expect(BotClient.api(base, '/api/characters', { ...good, name: 'Otro' }, token)).rejects.toThrow(/personaje vivo/);
  });

  it('dos personas coinciden en el mismo vestíbulo y se ven', async () => {
    ({ b: ana, token: anaToken } = await join('ana', 'solo'));
    ({ b: bruno, token: brunoToken } = await join('bruno', 'netrunner'));
    expect(ana.zone).toBe('bloque9');
    await ana.until(() => !!ana.findEntity((e) => e.kind === 'player' && e.name === 'bruno'), 3000, 'ver a bruno');
    await bruno.until(() => !!bruno.findEntity((e) => e.kind === 'player' && e.name === 'ana'), 3000, 'ver a ana');
    expect(ana.sheet!.hpMax).toBe(65);
  });

  it('clic, ruta aceptada, cancelación y colisión', async () => {
    const a = await ana.move(13.5, 8.5);
    expect(a.ok).toBe(true);
    let px = ana.x, py = ana.y;
    for (const [x, y] of a.path!) { expect(lineWalkable(app.world.zones.get('bloque9')!.grid, px, py, x, y)).toBe(true); px = x; py = y; }
    await new Promise((r) => setTimeout(r, 150));
    const s = await ana.cmd({ t: 'stop' });
    expect(s.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    const fx = ana.x, fy = ana.y;
    await new Promise((r) => setTimeout(r, 300));
    expect(Math.hypot(ana.x - fx, ana.y - fy)).toBeLessThan(0.01);
    // Pared del fondo (fila 0) y mostrador: el servidor ajusta al punto transitable o rechaza.
    const wall = await ana.move(8.5, -3);
    expect(wall.ok).toBe(false);
    expect(wall.reason).toMatch(/inaccesible/);
  });

  it('salir a la calle, cruzar sectores y rechazar destinos dentro de edificios', async () => {
    await ana.enterDoor('Salida');
    expect(ana.zone).toBe('vertice');
    const tower = await ana.move(21.5, 14.5);
    expect(tower.ok).toBe(false);
    const sectorMsg = ana.waitFor((m) => m.t === 'sector', 30000, 'cambio de sector');
    await ana.moveAndArrive(45.5, 163.5);
    const m = await sectorMsg as any;
    expect(m.sector).toMatch(/Ferro/);
  });

  it('encargo compartido: aceptar con Nadia en el bar (interior con salida)', async () => {
    await ana.enterDoor('Bar El Relé').catch(async () => { await ana.moveAndArrive(71.5, 182.5); await ana.enterDoor('Bar El Relé'); });
    expect(ana.zone).toBe('bar-rele');
    let d = await ana.interactAndDialog('Nadia');
    expect(d.options.map((o) => o.id)).toContain('accept');
    await ana.choose('accept');
    await ana.until(() => ana.journal.some((j) => j.contract === 'generador-lumen' && j.state === 'active'), 5000, 'diario');
    // Bruno sale del Bloque 9 y entra en el bar.
    await bruno.enterDoor('Salida');
    await bruno.moveAndArrive(71.5, 182.5);
    await bruno.enterDoor('Bar El Relé');
    d = await bruno.interactAndDialog('Nadia');
    await bruno.choose('accept');
    await bruno.until(() => bruno.journal.some((j) => j.contract === 'generador-lumen' && j.participants === 2), 5000, 'dos participantes');
  });

  it('Netrunner: entra en el terminal (tirada con Suerte, idempotente y sin repetir)', async () => {
    await bruno.enterDoor('Salida');
    await bruno.moveAndArrive(74.5, 202.5);
    const d = await bruno.interactAndDialog('Terminal');
    const hack = d.options.find((o) => o.id === 'hack')!;
    expect(hack.disabled).toBeUndefined();
    expect(hack.check!.chance).toBeGreaterThan(0.5);
    const luckBefore = bruno.sheet!.luck;
    const notice = bruno.waitFor((m) => m.t === 'notice' && /Éxito|Fallo/.test(m.text), 5000, 'resultado de tirada');
    await bruno.choose('hack', 4);
    const n = await notice as any;
    expect(n.text).toMatch(/✔ Éxito/); // 6 INT + 4 Interfaz + 2 rol + 4 Suerte ≥ 16 siempre
    await bruno.until(() => bruno.sheet!.luck === luckBefore - 4, 3000, 'Suerte cobrada');
    await bruno.waitFor((m) => m.t === 'notice' && /Prueba obtenida/.test(m.text), 8000, 'efecto tras canalizar 3 s');
  });

  it('Solo: negocia con Tomás leyendo la amenaza y consigue el acoplamiento', async () => {
    await ana.enterDoor('Salida');
    await ana.moveAndArrive(70.5, 198.5);
    const d = await ana.interactAndDialog('Tomás');
    expect(d.options.map((o) => o.id)).toEqual(expect.arrayContaining(['buy', 'solo', 'work']));
    await ana.choose('solo', 4);
    await ana.until(() => ana.sheet!.inventory.some((i) => i.def === 'acoplamiento'), 5000, 'acoplamiento');
    await bruno.waitFor((m) => m.t === 'notice' && /objetivo compartido/.test(m.text), 5000, 'aviso compartido a bruno');
  });

  it('instalar el generador cambia un hecho de distrito visible para todos', async () => {
    await ana.moveAndArrive(45.5, 162.5);
    await ana.interactAndDialog('Generador');
    const facts = bruno.waitFor((m) => m.t === 'facts' && (m as any).facts.lumen_power === true, 12000, 'luz en el mercado');
    await ana.choose('install');
    await facts;
    await ana.until(() => !ana.sheet!.inventory.some((i) => i.def === 'acoplamiento'), 3000, 'pieza consumida');
  });

  it('dos decisiones finales distintas con pago por contribución y consecuencias comprobables', async () => {
    const moneyA = ana.sheet!.money, moneyB = bruno.sheet!.money;
    await ana.moveAndArrive(71.5, 182.5); await ana.enterDoor('Bar El Relé');
    await ana.interactAndDialog('Nadia');
    const rewardA = ana.waitFor((m) => m.t === 'reward', 5000, 'recompensa');
    await ana.choose('give_fixer');
    const ra = await rewardA as any;
    expect(ra.lines.join(' ')).toMatch(/\+200/);
    expect(ana.sheet!.money).toBe(moneyA + 200);

    await bruno.moveAndArrive(71.5, 182.5); await bruno.enterDoor('Bar El Relé');
    await bruno.interactAndDialog('Nadia');
    const rewardB = bruno.waitFor((m) => m.t === 'reward', 5000, 'recompensa');
    await bruno.choose('give_market');
    const rb = await rewardB as any;
    expect(rb.lines.join(' ')).not.toMatch(/50 %/); // el hackeo del Netrunner cuenta como aportación al equipo → cobra los 80
    expect(bruno.sheet!.money).toBe(moneyB + 80);

    // Al volver, la fixer y la comerciante reaccionan distinto a cada uno.
    ana.dialog = undefined;
    let d = await ana.interactAndDialog('Nadia');
    expect(d.text).toMatch(/confianza/);
    d = await bruno.interactAndDialog('Nadia');
    expect(d.text).toMatch(/mercado/);
    const rows = await app.db.query<any>("SELECT character_id, contract_version, option_id FROM decisions WHERE option_id IN ('give_fixer','give_market')");
    expect(rows.rows.length).toBe(2);
    expect(rows.rows.every((r: any) => r.contract_version === 1)).toBe(true);
  });

  it('operaciones idempotentes: repetir el mismo opId no cobra dos veces', async () => {
    await bruno.cmd({ t: 'closeDialog' });
    // Lin está en el mercado (de día) o en el bar (tarde): la buscamos donde esté.
    const h = app.world.cityHour();
    if (h >= 19 && h < 23) { /* en el bar */ } else if (h >= 7 && h < 19) { await bruno.enterDoor('Salida'); await bruno.moveAndArrive(34.5, 169.5); } else return; // de noche descansa
    const d = await bruno.interactAndDialog('Lin');
    expect(d.text).toMatch(/amigo/);
    const shop = bruno.waitFor((m) => m.t === 'shop', 4000, 'puesto de Lin');
    await bruno.choose('shop');
    const sv = (await shop as any).view;
    const fideos = sv.items.find((i: any) => i.item === 'fideos-krill');
    expect(fideos.discount).toBe(20); // precio de amigo por aliarse con el mercado
    const before = bruno.sheet!.money;
    const opId = randomUUID().replace(/-/g, '');
    const a1 = await bruno.cmd({ t: 'buy', shop: 'puesto-lin', item: 'fideos-krill', qty: 1, opId });
    expect(a1.ok).toBe(true);
    await bruno.until(() => bruno.sheet!.money === before - fideos.price, 3000, 'compra');
    const again = await bruno.cmd({ t: 'buy', shop: 'puesto-lin', item: 'fideos-krill', qty: 1, opId });
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/ya procesada/);
    await new Promise((r) => setTimeout(r, 200));
    expect(bruno.sheet!.money).toBe(before - fideos.price);
  });

  it('persistencia y reconexión: misma vida, zona, dinero y diario', async () => {
    const zone = ana.zone, money = ana.sheet!.money, x = ana.x, y = ana.y;
    ana.close();
    await new Promise((r) => setTimeout(r, 1500)); // el bar es zona protegida: se retira y guarda al instante
    const again = new BotClient(base, 'ana-2'); clients.push(again);
    const w = await again.connect(anaToken, app.contentHash);
    expect(w.zone).toBe(zone);
    expect(Math.hypot(w.x - x, w.y - y)).toBeLessThan(0.5);
    expect(w.sheet.money).toBe(money);
    expect(w.journal.find((j) => j.contract === 'generador-lumen')!.state).toBe('completed');
    ana = again;
  });

  it('reconexión desde dos pestañas: la nueva toma el control y no se duplica la entidad', async () => {
    const tab2 = new BotClient(base, 'bruno-tab2'); clients.push(tab2);
    const kicked = bruno.waitFor((m) => m.t === 'kicked', 5000, 'expulsión de la pestaña vieja');
    const w = await tab2.connect(brunoToken, app.contentHash);
    await kicked;
    expect(w.you).toBe(bruno.you);
    await new Promise((r) => setTimeout(r, 300));
    const brunos = [...app.world.entities.values()].filter((e) => e.kind === 'player' && e.name === 'bruno');
    expect(brunos.length).toBe(1);
    bruno = tab2;
  });

  it('reinicio del servidor: el estado confirmado sobrevive', async () => {
    if (!DB) return; // PGlite en memoria no sobrevive a un reinicio de proceso
    const money = bruno.sheet!.money;
    for (const c of clients) c.close();
    await new Promise((r) => setTimeout(r, 300));
    await app.close();
    await boot();
    const b = new BotClient(base, 'bruno-restart'); clients.push(b);
    const w = await b.connect(brunoToken, app.contentHash);
    expect(w.sheet.money).toBe(money);
    expect(w.facts.lumen_power).toBe(true);
    const ledger = await app.db.query<any>('SELECT sum(delta)::int AS s FROM ledger l JOIN characters c ON c.id = l.character_id WHERE c.name = $1', ['bruno']);
    expect(ledger.rows[0].s).toBe(money); // el libro cuadra con el saldo
  });
});
