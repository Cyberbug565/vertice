import { VIP } from './casino.js';
// Ensamblado y validación cruzada del contenido: puertas, condiciones, traducciones, objetos y requisitos.
import { ContentSchema, type Content, type Condition, type Effect, type DialogDef, type ContractDef, type MissionContact, type MissionEncounter } from './content-schema.js';
import { buildZoneGrid, isWalkable } from './zonegrid.js';
import { findPath } from './nav.js';
import { hashString } from './rules.js';

/** Recibe un mapa ruta→JSON (p. ej. 'zones/ferro.json') y devuelve el contenido tipado y su huella. */
export function assembleContent(files: Record<string, unknown>): { content: Content; hash: string } {
  const get = (k: string) => { if (!(k in files)) throw new Error(`Falta el fichero de contenido ${k}`); return files[k]; };
  const zones = Object.keys(files).filter((k) => k.startsWith('zones/')).sort().map((k) => files[k]);
  // Un módulo puede añadir escenas y opciones a contactos existentes sin reescribir su ficha.
  type MissionFile = {
    locale: Record<string, string>;
    contracts?: ContractDef[];
    contacts?: MissionContact[];
    encounters?: MissionEncounter[];
    dialogs?: Record<string, DialogDef>;
    extend?: Record<string, {
      entries?: DialogDef['entries'];
      nodes?: DialogDef['nodes'];
      options?: Record<string, DialogDef['nodes'][string]['options']>;
    }>;
  };
  const dialogs = structuredClone(get('dialogs.json')) as Record<string, DialogDef>;
  const locale = { ...get('locale/es.json') as Record<string, string> };
  const contracts = [...get('contracts.json') as ContractDef[]];
  const missionContacts: MissionContact[] = [], missionEncounters: MissionEncounter[] = [];
  for (const path of Object.keys(files).filter(k => k.startsWith('missions/')).sort()) {
    const module = files[path] as MissionFile;
    const mergeNew = <T>(target: Record<string, T>, entries: Record<string, T>) => {
      for (const [key, value] of Object.entries(entries)) {
        if (Object.hasOwn(target, key)) throw new Error(`${path}: clave duplicada ${key}`);
        target[key] = value;
      }
    };
    mergeNew(locale, module.locale);
    mergeNew(dialogs, module.dialogs ?? {});
    contracts.push(...module.contracts ?? []);
    missionContacts.push(...module.contacts ?? []);
    missionEncounters.push(...module.encounters ?? []);
    for (const [id, patch] of Object.entries(module.extend ?? {})) {
      const dialogue = dialogs[id];
      if (!dialogue) throw new Error(`${path}: diálogo desconocido ${id}`);
      mergeNew(dialogue.nodes, patch.nodes ?? {});
      dialogue.entries = [...patch.entries ?? [], ...dialogue.entries];
      for (const [node, options] of Object.entries(patch.options ?? {})) {
        const current = dialogue.nodes[node]?.options;
        if (!current) throw new Error(`${path}: escena desconocida ${id}/${node}`);
        const leave = current.findIndex(o => o.goto == null && !o.effects?.length);
        current.splice(leave < 0 ? current.length : leave, 0, ...options);
      }
    }
  }
  const raw = {
    manifest: get('manifest.json'), attributes: get('attributes.json'), skills: get('skills.json'), roles: get('roles.json'),
    origins: get('origins.json'), factions: get('factions.json'), npcs: [get('npcs.json'), ...Object.keys(files).filter(k=>k.startsWith('npcs/')).sort().map(k=>files[k])].flat(),
    items: [get('items.json'), ...Object.keys(files).filter((k) => k.startsWith('items/')).sort().map((k) => files[k])].flat(),
    zones, dialogs, tasks: get('tasks.json'), contracts, locale, missionContacts, missionEncounters,
    needs: get('needs.json'), market: get('market.json'), shops: get('shops.json'), cyberware: [get('cyberware.json'), ...Object.keys(files).filter(k=>k.startsWith('cyberware/')).sort().map(k=>files[k])].flat(), ripperdocs: get('ripperdocs.json'),
    professions: get('professions.json'), workplaces: get('workplaces.json'), jobs: get('jobs.json'), fugitives: get('fugitives.json'),
    quickhacks: get('quickhacks.json'), ambar: get('ambar.json'), world: get('world.json'),
    perks: get('perks.json'), cars: get('cars.json'), dealers: get('dealers.json'), houses: get('houses.json'), posts: get('posts.json'),
    underworld: get('underworld.json'),
  };
  const parsed = ContentSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Contenido inválido:\n' + parsed.error.issues.slice(0, 20).map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  const keys = Object.keys(files).sort();
  const hash = (hashString(keys.map((k) => k + JSON.stringify(files[k])).join('|')) >>> 0).toString(16);
  return { content: parsed.data, hash: `${parsed.data.manifest.version}+${hash}` };
}

export function validateContent(c: Content): string[] {
  const errs: string[] = [];
  const zoneIds = new Set(c.zones.map((z) => z.id));
  const districtIds = new Set(c.zones.flatMap((z) => z.districts.map((d) => d.id)));
  const grids = new Map(c.zones.map((z) => [z.id, buildZoneGrid(z)]));
  const itemIds = new Set(c.items.map((i) => i.id));
  const factionIds = new Set(c.factions.map((f) => f.id));
  const roleIds = new Set(c.roles.map((r) => r.id));
  const skillIds = new Set(c.skills.map((s) => s.id));
  const taskIds = new Set(c.tasks.map((t) => t.id));
  const contractIds = new Set(c.contracts.map((t) => t.id));
  const objectiveIds = new Set(c.contracts.flatMap((t) => t.objectives.map((o) => o.id)));
  const encounterIds = new Set(c.missionEncounters.map(e => e.id));
  if (contractIds.size !== c.contracts.length) errs.push('Misiones: contratos duplicados');
  if (objectiveIds.size !== c.contracts.reduce((n, x) => n + x.objectives.length, 0)) errs.push('Misiones: objetivos duplicados');
  if (encounterIds.size !== c.missionEncounters.length) errs.push('Misiones: eventos duplicados');
  // v0.38 · Inicios: lugar transitable, objetos, habilidades y facciones que existan.
  const checkOrigins = () => { for (const o of c.origins) {
    if (o.start) walk(o.start.zone, o.start.at, `origen ${o.id}`);
    for (const [it] of o.items) if (!itemIds.has(it)) errs.push(`origen ${o.id}: objeto desconocido ${it}`);
    for (const k of Object.keys(o.skills)) if (!skillIds.has(k)) errs.push(`origen ${o.id}: habilidad desconocida ${k}`);
    for (const k of Object.keys(o.rep)) if (!factionIds.has(k)) errs.push(`origen ${o.id}: facción desconocida ${k}`);
  } };
  const loc = (key: string, where: string) => { if (!(key in c.locale)) errs.push(`${where}: falta traducción "${key}"`); };
  const walk = (zone: string, at: readonly number[], where: string) => {
    const g = grids.get(zone);
    if (!g) return errs.push(`${where}: zona desconocida ${zone}`);
    if (!isWalkable(g, at[0] + 0.5, at[1] + 0.5)) errs.push(`${where}: (${at}) no es transitable en ${zone}`);
  };
  if (!zoneIds.has(c.manifest.startZone)) errs.push(`manifest: zona inicial desconocida`);
  else walk(c.manifest.startZone, c.manifest.startAt, 'manifest.startAt');
  checkOrigins();
  if (c.roles.length !== 10) errs.push(`Se esperan 10 roles, hay ${c.roles.length}`);
  for (const r of c.roles) for (const s of Object.keys(r.skills)) if (!skillIds.has(s)) errs.push(`rol ${r.id}: habilidad ${s} desconocida`);
  for (const z of c.zones) {
    const g = grids.get(z.id)!;
    walk(z.id, z.safePoint, `${z.id}.safePoint`);
    for (const d of z.doors) {
      if (!zoneIds.has(d.to.zone)) { errs.push(`${z.id}/${d.id}: destino ${d.to.zone} desconocido`); continue; }
      walk(d.to.zone, d.to.at, `${z.id}/${d.id} destino`);
      const back = c.zones.find((o) => o.id === d.to.zone)!.doors.some((o) => o.to.zone === z.id);
      if (!back && !z.id.startsWith('casa-')) errs.push(`${z.id}/${d.id}: la zona ${d.to.zone} no tiene puerta de regreso`); // las casas son instancias: su salida se fija al entrar
    }
    for (const o of z.objects) {
      if(o.kind==='casino'&&(!z.casino||!o.games?.length||new Set(o.games).size!==o.games.length||
        o.games.includes('duelo')!==(z.id===VIP.zone)))
        errs.push(`${z.id}/${o.id}: mesa de casino mal configurada`);
      if (o.dialog && !(o.dialog in c.dialogs)) errs.push(`${z.id}/${o.id}: diálogo ${o.dialog} desconocido`);
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkable(g, o.at[0] + dx + 0.5, o.at[1] + dy + 0.5));
      if (!adj) errs.push(`${z.id}/${o.id}: sin acceso transitable`);
    }
    if (z.nightlife) {
      const [x, y, w, h] = z.nightlife.floor;
      if (z.kind !== 'interior') errs.push(`${z.id}: la pista de baile necesita un interior`);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) walk(z.id, [x + dx, y + dy], `${z.id}.pista`);
    }
    for (const wp of z.waypoints) walk(z.id, wp, `${z.id}.waypoint`);
    for (const b of z.buildings) if (b.rect[0] + b.rect[2] > z.width || b.rect[1] + b.rect[3] > z.height) errs.push(`${z.id}/${b.id}: fuera de límites`);
  }
  const crews = new Map(c.underworld.crews.map((crew) => [crew.id, crew]));
  if (crews.size !== c.underworld.crews.length) errs.push('Mercado negro: bandas duplicadas');
  const sites = [...c.underworld.contacts, ...c.underworld.buyers, ...c.underworld.crews.flatMap((crew) => crew.bases)];
  if (new Set(sites.map((s) => s.id)).size !== sites.length) errs.push('Mercado negro: puntos duplicados');
  for (const s of sites) walk(s.zone, s.at, `Mercado negro / ${s.id}`);
  for (const crew of crews.values()) {
    if (!c.factions.some((f) => f.id === crew.id && f.kind === 'gang')) errs.push(`Mercado negro: banda desconocida ${crew.id}`);
    if (crew.tier === 'secundaria' ? crews.get(crew.parent ?? '')?.tier !== 'principal' : crew.parent !== undefined) errs.push(`Mercado negro: jerarquía inválida de ${crew.id}`);
    if (new Set(crew.bases.map((b) => b.zone)).size !== crew.bases.length) errs.push(`Mercado negro: bases duplicadas para ${crew.id}`);
    for (const rival of crew.rivals) if (rival === crew.id || !factionIds.has(rival)) errs.push(`Mercado negro: rival inválido de ${crew.id}: ${rival}`);
    for (const b of crew.bases) if (!c.zones.some((z) => z.id === b.zone && z.gangBase?.faction === crew.id)) errs.push(`Mercado negro: base ${b.zone} ajena a ${crew.id}`);
    if (!c.underworld.buyers.some((b) => b.crew === crew.id)) errs.push(`Mercado negro: ${crew.id} no tiene compradores`);
  }
  for (const b of c.underworld.buyers) if (!crews.has(b.crew) || !c.zones.some((z) => z.id === b.zone && z.kind === 'exterior')) errs.push(`Mercado negro: comprador inválido ${b.id}`);
  for (const item of c.items.filter((i) => i.substance)) {
    if (!item.consumable || (item.substance?.kind === 'drug' ? item.category !== 'contrabando' || !item.price : item.category !== 'bebida')) errs.push(`Consumible inválido: ${item.id}`);
  }
  if (new Set(c.npcs.map(n=>n.id)).size!==c.npcs.length)errs.push('NPC: identificadores duplicados');
  for (const n of c.npcs) {
    if (n.dialog && !(n.dialog in c.dialogs)) errs.push(`npc ${n.id}: diálogo desconocido`);
    if(n.resident && n.shop && !c.shops.some(s=>s.id===n.shop))errs.push(`npc ${n.id}: tienda desconocida`);
    for (const s of n.schedule) {
      walk(s.zone,s.at,`npc ${n.id} horario ${s.from}-${s.to}`);
      for(const at of s.stops??[])walk(s.zone,at,`npc ${n.id} parada`);
    }
    const hours=[...new Set([0,...n.schedule.flatMap(s=>[s.from,s.to]).filter(h=>h<24)])].sort((a,b)=>a-b);
    if(hours.some(h=>n.schedule.filter(s=>s.from<=s.to?h>=s.from&&h<s.to:h>=s.from||h<s.to).length!==1))
      errs.push(`npc ${n.id}: los horarios deben cubrir la jornada sin solaparse`);
  }
  const checkCond = (cond: Condition, where: string) => {
    if ('role' in cond && !roleIds.has(cond.role)) errs.push(`${where}: rol ${cond.role}`);
    if ('notRole' in cond && !roleIds.has(cond.notRole)) errs.push(`${where}: rol ${cond.notRole}`);
    if ('contract' in cond && !contractIds.has(cond.contract)) errs.push(`${where}: encargo ${cond.contract}`);
    if ('objective' in cond && !objectiveIds.has(cond.objective)) errs.push(`${where}: objetivo ${cond.objective}`);
    if ('hasItem' in cond && !itemIds.has(cond.hasItem)) errs.push(`${where}: objeto ${cond.hasItem}`);
  };
  const checkEff = (e: Effect, where: string) => {
    if ('item' in e && !itemIds.has(e.item)) errs.push(`${where}: objeto ${e.item}`);
    if ('rep' in e && !factionIds.has(e.rep)) errs.push(`${where}: facción ${e.rep}`);
    if ('task' in e && !taskIds.has(e.task)) errs.push(`${where}: tarea ${e.task}`);
    if ('acceptContract' in e && !contractIds.has(e.acceptContract)) errs.push(`${where}: encargo ${e.acceptContract}`);
    if ('completeContract' in e && !contractIds.has(e.completeContract)) errs.push(`${where}: encargo ${e.completeContract}`);
    if ('completeObjective' in e && !objectiveIds.has(e.completeObjective)) errs.push(`${where}: objetivo ${e.completeObjective}`);
    if ('notice' in e) loc(e.notice, where);
    if ('missionRide' in e && !c.missionEncounters.some(x => x.id === e.missionRide && x.ride)) errs.push(`${where}: trayecto desconocido ${e.missionRide}`);
    if ('completeContract' in e) {
      const outcomes = c.contracts.find(x => x.id === e.completeContract)?.outcomes;
      if (outcomes && Object.keys(outcomes).length && !(e.outcome in outcomes)) errs.push(`${where}: desenlace desconocido ${e.outcome}`);
    }
  };
  for (const [id, d] of Object.entries(c.dialogs)) {
    for (const en of d.entries) { if (!(en.node in d.nodes)) errs.push(`diálogo ${id}: entrada a nodo ${en.node} inexistente`); en.if.forEach((x) => checkCond(x, `diálogo ${id}`)); }
    if (!d.entries.some((e) => e.if.length === 0)) errs.push(`diálogo ${id}: necesita una entrada sin condiciones como reserva`);
    for (const [nid, n] of Object.entries(d.nodes)) {
      const w = `diálogo ${id}/${nid}`;
      loc(n.text, w);
      if (new Set(n.options.map(o => o.id)).size !== n.options.length) errs.push(`${w}: opciones duplicadas`);
      for (const o of n.options) {
        loc(o.text, `${w}/${o.id}`);
        if (o.failText) loc(o.failText, `${w}/${o.id}`);
        if (o.goto && !(o.goto in d.nodes)) errs.push(`${w}/${o.id}: goto ${o.goto} inexistente`);
        if (o.failGoto && !(o.failGoto in d.nodes)) errs.push(`${w}/${o.id}: failGoto ${o.failGoto} inexistente`);
        if (o.check && !skillIds.has(o.check.skill)) errs.push(`${w}/${o.id}: habilidad ${o.check.skill}`);
        if (o.requireText) loc(o.requireText, `${w}/${o.id}`);
        if (o.require.length && !o.requireText) errs.push(`${w}/${o.id}: require sin requireText`);
        if (o.channel) loc(o.channel.label, `${w}/${o.id}`);
        o.require.forEach((x) => checkCond(x, `${w}/${o.id}`));
        o.if.forEach((x) => checkCond(x, `${w}/${o.id}`));
        o.effects.forEach((x) => checkEff(x, `${w}/${o.id}`));
        o.fail.forEach((x) => checkEff(x, `${w}/${o.id}`));
      }
    }
  }
  for (const t of c.tasks) {
    for (const s of t.steps) if ('moveTo' in s) walk(s.zone, s.moveTo, `tarea ${t.id}`); else loc(s.label, `tarea ${t.id}`);
    t.onComplete.forEach((x) => checkEff(x, `tarea ${t.id}`));
    loc(t.label, `tarea ${t.id}`);
  }
  for (const k of c.contracts) {
    loc(k.title, k.id); loc(k.summary, k.id);
    if (k.lead) loc(k.lead, k.id);
    for (const text of Object.values(k.outcomes)) loc(text, k.id);
    k.objectives.forEach(o => loc(o.text, `${k.id}/${o.id}`));
  }
  const contacts = [...c.missionContacts, ...c.missionEncounters.flatMap(e => [e.contact, ...e.sites])];
  if (new Set(contacts.map(s => s.id)).size !== contacts.length) errs.push('Misiones: contactos duplicados');
  for (const site of contacts) {
    walk(site.zone, site.at, site.id);
    if (!(site.dialogue in c.dialogs)) errs.push(`${site.id}: diálogo desconocido ${site.dialogue}`);
  }
  for (const encounter of c.missionEncounters) {
    loc(encounter.rumor, encounter.id);
    if (c.contracts.find(k => k.id === encounter.contract)?.category !== 'evento') errs.push(`${encounter.id}: contrato de evento inválido`);
    if (encounter.ride) {
      if (!c.cars.some(car => car.id === encounter.ride?.car)) errs.push(`${encounter.id}: coche de evento inválido`);
      for (const at of encounter.ride.route) walk(encounter.contact.zone, at, encounter.id);
      const grid = grids.get(encounter.contact.zone), points = encounter.ride.route;
      if (grid && points.some(([x,y], i) => i > 0 && !findPath(grid, points[i-1][0]+.5, points[i-1][1]+.5, x+.5, y+.5, 8000).ok))
        errs.push(`${encounter.id}: trayecto bloqueado`);
    }
  }

  // ---- Sistemas de la v0.2: mercado, tiendas, ciberware, matasanos, oficios, empleos y fugitivos.
  const shopIds = new Set(c.shops.map((x) => x.id));
  const cyberIds = new Set(c.cyberware.map((x) => x.id));
  const profIds = new Set(c.professions.map((x) => x.id));
  const wpIds = new Set(c.workplaces.map((x) => x.id));
  const npcIds = new Set(c.npcs.map((x) => x.id));
  const docIds = new Set(c.ripperdocs.map((x) => x.id));
  for (const corp of c.market.corps) if (!factionIds.has(corp.id)) errs.push(`mercado: corporación ${corp.id} no es una facción`);
  for (const sh of c.shops) {
    if (sh.zone !== '*' && !zoneIds.has(sh.zone)) errs.push(`tienda ${sh.id}: zona ${sh.zone}`);
    if (!factionIds.has(sh.owner)) errs.push(`tienda ${sh.id}: dueño ${sh.owner}`);
    for (const it of Object.keys(sh.stock)) { const d = c.items.find((i) => i.id === it); if (!d) errs.push(`tienda ${sh.id}: objeto ${it}`); else if (!d.price) errs.push(`tienda ${sh.id}: ${it} sin precio base`); }
  }
  for (const z of c.zones) for (const o of z.objects) {
    if ((o.kind === 'shop' || o.kind === 'vending') && (!o.shop || !shopIds.has(o.shop))) errs.push(`${z.id}/${o.id}: tienda ${o.shop}`);
    if (o.kind === 'workplace' && (!o.workplace || !wpIds.has(o.workplace))) errs.push(`${z.id}/${o.id}: puesto ${o.workplace}`);
    if (o.kind === 'bed' && !o.sleep) errs.push(`${z.id}/${o.id}: cama sin calidad de sueño`);
    if (['generator', 'terminal', 'crates', 'board'].includes(o.kind) && !o.dialog) errs.push(`${z.id}/${o.id}: necesita diálogo`);
  }
  for (const w of c.workplaces) walk(w.zone, w.at, `puesto ${w.id}`);
  for (const cw of c.cyberware) if (!factionIds.has(cw.maker)) errs.push(`ciberware ${cw.id}: fabricante ${cw.maker}`);
  for (const d of c.ripperdocs) {
    if (!npcIds.has(d.npc)) errs.push(`matasanos ${d.id}: PNJ ${d.npc}`);
    if (!zoneIds.has(d.zone)) errs.push(`matasanos ${d.id}: zona ${d.zone}`);
    for (const x of [...d.stock, ...d.stolenStock]) if (!cyberIds.has(x)) errs.push(`matasanos ${d.id}: ciberware ${x}`);
  }
  for (const [id, dg] of Object.entries(c.dialogs)) for (const n of Object.values(dg.nodes)) for (const o of n.options) for (const e of [...o.effects, ...o.fail]) {
    if ('open' in e && e.open === 'shop' && (!e.id || !shopIds.has(e.id))) errs.push(`diálogo ${id}: tienda ${e.id}`);
    if ('open' in e && e.open === 'clinic' && (!e.id || !docIds.has(e.id))) errs.push(`diálogo ${id}: matasanos ${e.id}`);
    if ('contribute' in e && !objectiveIds.has(e.contribute)) errs.push(`diálogo ${id}: objetivo ${e.contribute}`);
  }
  for (const j of c.jobs) {
    if (!profIds.has(j.profession)) errs.push(`empleo ${j.id}: oficio ${j.profession}`);
    if (!wpIds.has(j.workplace)) errs.push(`empleo ${j.id}: puesto ${j.workplace}`);
    if (!factionIds.has(j.employer)) errs.push(`empleo ${j.id}: empleador ${j.employer}`);
  }
  if (c.jobs.length < 100) errs.push(`Se esperan al menos 100 empleos, hay ${c.jobs.length}`);
  for (const p of c.professions) if (!skillIds.has(p.skill)) errs.push(`oficio ${p.id}: habilidad ${p.skill}`);
  for (const f of c.fugitives) {
    if (!zoneIds.has(f.zone)) errs.push(`fugitivo ${f.id}: zona ${f.zone}`);
    else walk(f.zone, [f.area[0], f.area[1]], `fugitivo ${f.id}`);
    if (!factionIds.has(f.poster)) errs.push(`fugitivo ${f.id}: anunciante ${f.poster}`);
  }
  // ---- v0.3: armas, facciones, mundo, ciberware visible.
  for (const it of c.items) if (it.weapon?.ammo && !itemIds.has(it.weapon.ammo)) errs.push(`arma ${it.id}: munición ${it.weapon.ammo}`);
  for (const f of c.factions) {
    for (const r of Object.keys(f.relations)) if (!factionIds.has(r)) errs.push(`facción ${f.id}: relación con ${r} desconocida`);
    for (const z of f.territory) if (!zoneIds.has(z) && !districtIds.has(z)) errs.push(`facción ${f.id}: territorio ${z}`);
    if (f.weapon && !itemIds.has(f.weapon)) errs.push(`facción ${f.id}: arma ${f.weapon}`);
  }
  for (const z of c.zones) for (const g of z.gangs) if (!factionIds.has(g.faction)) errs.push(`${z.id}: banda ${g.faction}`);
  for (const cw of c.cyberware) if (cw.effects.weapon && !itemIds.has(cw.effects.weapon)) errs.push(`ciberware ${cw.id}: arma ${cw.effects.weapon}`);
  // ---- v0.4
  const perkIds = new Set(c.perks.map((x) => x.id));
  for (const pk of c.perks) {
    if (pk.skill !== 'general' && !skillIds.has(pk.skill)) errs.push(`perk ${pk.id}: rama ${pk.skill}`);
    for (const k of Object.keys(pk.requires.skills)) if (!skillIds.has(k)) errs.push(`perk ${pk.id}: habilidad ${k}`);
    for (const k of pk.requires.perks) if (!perkIds.has(k)) errs.push(`perk ${pk.id}: requiere ${k}`);
  }
  for (const d of c.dealers) { if (!zoneIds.has(d.zone)) errs.push(`concesionario ${d.id}: zona ${d.zone}`); if (!c.cars.some((x) => d.classes.includes(x.class))) errs.push(`concesionario ${d.id}: sin coches`); }
  const housingObjs = new Set(c.zones.flatMap((z) => z.objects.filter((o) => o.kind === 'housing').map((o) => o.id)));
  for (const h of c.houses) { if (!housingObjs.has(h.building)) errs.push(`casa ${h.id}: portal ${h.building}`); if (!zoneIds.has(h.template)) errs.push(`casa ${h.id}: plantilla ${h.template}`); }
  for (const z of c.zones) for (const o of z.objects) if (o.kind === 'dealer' && !c.dealers.some((d) => d.id === o.dealer)) errs.push(`${z.id}/${o.id}: concesionario ${o.dealer}`);
  for (const p of c.posts) { if (!zoneIds.has(p.zone)) errs.push(`puesto ${p.id}: zona ${p.zone}`); else walk(p.zone, p.at, `puesto ${p.id}`); if (!skillIds.has(p.skill)) errs.push(`puesto ${p.id}: habilidad ${p.skill}`); }
  for (const it of c.items) for (const k of Object.keys(it.wear?.mods.skills ?? {})) if (!skillIds.has(k)) errs.push(`prenda ${it.id}: habilidad ${k}`);
  { const seen = new Set<string>(); for (const it of c.items) { if (seen.has(it.id)) errs.push(`objeto repetido: ${it.id}`); seen.add(it.id); } } // v0.22
  for (const cw of c.cyberware) for (const k of Object.keys(cw.effects.skills ?? {})) if (!skillIds.has(k)) errs.push(`ciberware ${cw.id}: habilidad ${k}`);
  for (const d of c.world.districts) if (!zoneIds.has(d.zone) && !districtIds.has(d.zone)) errs.push(`mundo: distrito ${d.zone}`);
  for (const p of c.ambar) for (const z of p.zones) if (!zoneIds.has(z) && !districtIds.has(z)) errs.push(`Ámbar ${p.id}: zona ${z}`);
  const cells = new Set<string>();
  for (const d of c.world.districts) { const k = `${d.gx},${d.gy}`; if (cells.has(k)) errs.push(`mundo: dos distritos en ${k}`); cells.add(k); }
  return errs;
}

/** Texto localizado con interpolación {clave}. */
export function t(c: Content, key: string, vars?: Record<string, string | number>): string {
  let s = c.locale[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
