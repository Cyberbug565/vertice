// Ensamblado y validación cruzada del contenido: puertas, condiciones, traducciones, objetos y requisitos.
import { ContentSchema, type Content, type Condition, type Effect } from './content-schema.js';
import { buildZoneGrid, isWalkable } from './zonegrid.js';
import { hashString } from './rules.js';

/** Recibe un mapa ruta→JSON (p. ej. 'zones/ferro.json') y devuelve el contenido tipado y su huella. */
export function assembleContent(files: Record<string, unknown>): { content: Content; hash: string } {
  const get = (k: string) => { if (!(k in files)) throw new Error(`Falta el fichero de contenido ${k}`); return files[k]; };
  const zones = Object.keys(files).filter((k) => k.startsWith('zones/')).sort().map((k) => files[k]);
  const raw = {
    manifest: get('manifest.json'), attributes: get('attributes.json'), skills: get('skills.json'), roles: get('roles.json'),
    origins: get('origins.json'), factions: get('factions.json'), items: get('items.json'), npcs: get('npcs.json'),
    zones, dialogs: get('dialogs.json'), tasks: get('tasks.json'), contracts: get('contracts.json'), locale: get('locale/es.json'),
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
  const grids = new Map(c.zones.map((z) => [z.id, buildZoneGrid(z)]));
  const itemIds = new Set(c.items.map((i) => i.id));
  const factionIds = new Set(c.factions.map((f) => f.id));
  const roleIds = new Set(c.roles.map((r) => r.id));
  const skillIds = new Set(c.skills.map((s) => s.id));
  const taskIds = new Set(c.tasks.map((t) => t.id));
  const contractIds = new Set(c.contracts.map((t) => t.id));
  const objectiveIds = new Set(c.contracts.flatMap((t) => t.objectives.map((o) => o.id)));
  const loc = (key: string, where: string) => { if (!(key in c.locale)) errs.push(`${where}: falta traducción "${key}"`); };
  const walk = (zone: string, at: readonly number[], where: string) => {
    const g = grids.get(zone);
    if (!g) return errs.push(`${where}: zona desconocida ${zone}`);
    if (!isWalkable(g, at[0] + 0.5, at[1] + 0.5)) errs.push(`${where}: (${at}) no es transitable en ${zone}`);
  };
  if (!zoneIds.has(c.manifest.startZone)) errs.push(`manifest: zona inicial desconocida`);
  else walk(c.manifest.startZone, c.manifest.startAt, 'manifest.startAt');
  if (c.roles.length !== 10) errs.push(`Se esperan 10 roles, hay ${c.roles.length}`);
  for (const r of c.roles) for (const s of Object.keys(r.skills)) if (!skillIds.has(s)) errs.push(`rol ${r.id}: habilidad ${s} desconocida`);
  for (const z of c.zones) {
    const g = grids.get(z.id)!;
    walk(z.id, z.safePoint, `${z.id}.safePoint`);
    for (const d of z.doors) {
      if (!zoneIds.has(d.to.zone)) { errs.push(`${z.id}/${d.id}: destino ${d.to.zone} desconocido`); continue; }
      walk(d.to.zone, d.to.at, `${z.id}/${d.id} destino`);
      const back = c.zones.find((o) => o.id === d.to.zone)!.doors.some((o) => o.to.zone === z.id);
      if (!back) errs.push(`${z.id}/${d.id}: la zona ${d.to.zone} no tiene puerta de regreso`);
    }
    for (const o of z.objects) {
      if (!(o.dialog in c.dialogs)) errs.push(`${z.id}/${o.id}: diálogo ${o.dialog} desconocido`);
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkable(g, o.at[0] + dx + 0.5, o.at[1] + dy + 0.5));
      if (!adj) errs.push(`${z.id}/${o.id}: sin acceso transitable`);
    }
    for (const wp of z.waypoints) walk(z.id, wp, `${z.id}.waypoint`);
    for (const b of z.buildings) if (b.rect[0] + b.rect[2] > z.width || b.rect[1] + b.rect[3] > z.height) errs.push(`${z.id}/${b.id}: fuera de límites`);
  }
  for (const n of c.npcs) {
    if (n.dialog && !(n.dialog in c.dialogs)) errs.push(`npc ${n.id}: diálogo desconocido`);
    for (const s of n.schedule) walk(s.zone, s.at, `npc ${n.id} horario ${s.from}-${s.to}`);
    const hours = new Array(24).fill(0);
    for (const s of n.schedule) for (let h = 0; h < 24; h++) if (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to) hours[h]++;
    if (hours.some((v) => v !== 1)) errs.push(`npc ${n.id}: el horario debe cubrir cada hora exactamente una vez`);
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
  };
  for (const [id, d] of Object.entries(c.dialogs)) {
    for (const en of d.entries) { if (!(en.node in d.nodes)) errs.push(`diálogo ${id}: entrada a nodo ${en.node} inexistente`); en.if.forEach((x) => checkCond(x, `diálogo ${id}`)); }
    if (!d.entries.some((e) => e.if.length === 0)) errs.push(`diálogo ${id}: necesita una entrada sin condiciones como reserva`);
    for (const [nid, n] of Object.entries(d.nodes)) {
      const w = `diálogo ${id}/${nid}`;
      loc(n.text, w);
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
  for (const k of c.contracts) { loc(k.title, k.id); loc(k.summary, k.id); k.objectives.forEach((o) => loc(o.text, `${k.id}/${o.id}`)); }
  return errs;
}

/** Texto localizado con interpolación {clave}. */
export function t(c: Content, key: string, vars?: Record<string, string | number>): string {
  let s = c.locale[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
