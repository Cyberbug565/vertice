// v0.10 · Sigilo: lugares restringidos con arco detector y guardias (comisarías, torres corporativas, laboratorios, el Banco
// Central y el Penal de Hierro nuevos), uniformes para disfrazarse y el dedo pistola como arma integrada (el detector no la ve).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function itemsV10(items) {
  const ids = new Set(['uniforme-pcv', 'uniforme-seguridad', 'bata-laboratorio', 'dedo-pistola-arma']);
  const mods = (s = {}) => ({ skills: s, carry: 0, speed: 0, needs: 0, dodge: 0, hpMax: 0, aim: 0, ramPlus: 0, ramSave: 0 });
  return [...items.filter((i) => !ids.has(i.id)),
    { id: 'uniforme-pcv', name: 'Uniforme de la PCV', desc: 'Disfraz: en comisarías, el penal y el banco nadie sospecha de ti y puedes pasar el arco detector armado. Los agentes que se te acerquen mucho pueden notar que no eres de los suyos.', weight: 1.5, price: 2500, category: 'ropa', rarity: 'raro', armor: 1,
      wear: { slot: 'torso_ext', style: 'chaleco', color: '#22305a', pattern: 'tactico', detail: 'reflectante', accent: '#43a8ff', mods: mods({ intimidacion: 1 }), perk: 'disfraz-pcv' } },
    { id: 'uniforme-seguridad', name: 'Uniforme de seguridad privada', desc: 'Disfraz: en bancos, torres corporativas y laboratorios eres «del personal»; en el banco pasas el detector armado.', weight: 1.2, price: 1800, category: 'ropa', rarity: 'raro',
      wear: { slot: 'torso_ext', style: 'blazer', color: '#16161e', pattern: 'liso', detail: 'cinturon', accent: '#ffd23f', mods: mods({ intimidacion: 1 }), perk: 'disfraz-seguridad' } },
    { id: 'bata-laboratorio', name: 'Bata de laboratorio', desc: 'Disfraz: en torres corporativas y laboratorios, nadie mira dos veces a alguien con bata y tarjeta.', weight: 0.8, price: 900, category: 'ropa', rarity: 'poco-comun',
      wear: { slot: 'torso_ext', style: 'abrigo', color: '#e8eaf0', pattern: 'liso', detail: 'parches', accent: '#43f3ff', mods: mods({ medicina: 1, investigacion: 1 }), perk: 'disfraz-corpo' } },
    { id: 'dedo-pistola-arma', name: 'Dedo pistola', desc: 'Una pistola de 5 mm escondida en el meñique. Silenciosa y casi invisible: los arcos detectores no ven el cromo.', weight: 0, category: 'arma', rarity: 'raro',
      weapon: { kind: 'ranged', family: 'Implante', damage: [7, 12], range: 10, cooldown: 1.2, accuracy: 1, nonlethal: 'no', noise: 0.15, tech: 'clasica', traits: ['silenciosa'] } },
  ];
}

export function cyberwareV10(list) {
  for (const d of list) if (d.id === 'dedo-pistola') { d.effects.weapon = 'dedo-pistola-arma'; d.desc = 'Una bala de 5 mm escondida en el meñique: arma integrada silenciosa que los arcos detectores no ven.'; }
  return list;
}

export function shopsV10(shops) {
  for (const s of shops) {
    if (s.id === 'perista-pachinko') Object.assign(s.stock, { 'uniforme-seguridad': 1, 'bata-laboratorio': 2 });
    if (s.id === 'ropa-segunda') s.stock['bata-laboratorio'] = 2;
  }
  return shops;
}

const inR = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
/** Marca los lugares restringidos, pone guardias y crea el Banco Central y el Penal de Hierro con sus puertas y rótulos. */
export function zonesV10(C) {
  const zdir = join(C, 'zones');
  const readZ = (id) => JSON.parse(readFileSync(join(zdir, `${id}.json`), 'utf8'));
  const writeZ = (z) => writeFileSync(join(zdir, `${z.id}.json`), JSON.stringify(z, null, 1) + '\n');
  let marked = 0;
  for (const f of readdirSync(zdir)) {
    const id = f.replace(/\.json$/, '');
    let r = null, det = false, guards = 0;
    if (/^comisaria/.test(id)) { r = 'policia'; det = true; guards = 3; }
    else if (/^torre-.*-p0$/.test(id)) { r = 'corporativo'; det = true; guards = 2; }
    else if (/^torre-/.test(id)) { r = 'corporativo'; }
    else if (/^(laboratorio-int|teselia-int|oficinas-halcon-int|blindados-halcon-int)$/.test(id)) { r = id === 'laboratorio-int' ? 'laboratorio' : 'corporativo'; det = true; guards = 2; }
    if (!r) continue;
    const z = readZ(id);
    z.restricted = r; if (det) z.detector = true; else delete z.detector;
    if (guards) z.police = Math.max(z.police ?? 0, guards);
    writeZ(z); marked++;
  }
  // ---- Banco Central y Penal de Hierro: nuevos lugares restringidos con su puerta en la ciudad.
  const city = readZ('vertice');
  const solid = (x, y) => city.buildings.some((b) => inR(x, y, b.rect)) || city.blocks.some((b) => inR(x, y, b.rect)) || city.ground.some((g) => ['void', 'water'].includes(g.type) && inR(x, y, g.rect));
  const busy = (x, y) => [...city.doors, ...city.objects].some((d) => Math.abs(d.at[0] - x) <= 2 && Math.abs(d.at[1] - y) <= 2) || city.props.some((p) => p.at[0] === x && p.at[1] === y);
  const entrance = (district, avoid = []) => {
    const d = city.districts.find((x) => x.id === district);
    for (const b of city.buildings.filter((b) => d && inR(b.rect[0], b.rect[1], d.rect) && b.rect[2] >= 4 && !avoid.includes(b.id))) {
      const x = b.rect[0] + Math.floor(b.rect[2] / 2), y = b.rect[1] + b.rect[3];
      if (!solid(x, y) && !solid(x, y + 1) && !busy(x, y)) return { b, at: [x, y], land: [x, y + 1] };
    }
    return null;
  };
  city.doors = city.doors.filter((d) => !['banco-central', 'penal-hierro'].includes(d.to.zone));
  const bank = entrance('cenit');
  const jail = entrance('poligono', bank ? [bank.b.id] : []);
  const made = [];
  if (bank) {
    bank.b.sign = 'BANCO CENTRAL'; bank.b.signColor = '#ffd23f';
    city.doors.push({ id: 'puerta-banco-central', name: 'Banco Central de Vértice', at: bank.at, to: { zone: 'banco-central', at: [10, 12] }, danger: 'public', sign: 'BANCO', signColor: '#ffd23f', signIcon: 'escudo' });
    city.props = city.props.filter((p) => !(Math.abs(p.at[0] - bank.at[0]) <= 1 && Math.abs(p.at[1] - bank.at[1]) <= 1));
    const props = [];
    for (let x = 3; x <= 17; x += 2) props.push({ type: 'column', at: [x, 3] });
    for (const x of [4, 8, 12, 16]) props.push({ type: 'plant', at: [x, 11] });
    props.push({ type: 'screen', at: [10, 1], color: '#ffd23f', blocking: false }, { type: 'sofa', at: [3, 9] }, { type: 'sofa', at: [17, 9] });
    writeZ({ id: 'banco-central', name: 'Banco Central de Vértice', kind: 'interior', width: 21, height: 14, danger: 'public', base: 'tile', wallColor: '#3a3220', furnished: true, restricted: 'banco', detector: true, police: 3,
      blocks: [{ type: 'counter', rect: [4, 5, 13, 1], height: 1, color: '#5a4a2a' }, { type: 'wall', rect: [1, 2, 19, 1], height: 3, color: '#2a2418' }],
      props, doors: [{ id: 'salida-banco', name: 'Salida a la calle', at: [10, 13], to: { zone: 'vertice', at: bank.land }, danger: 'public' }],
      objects: [{ id: 'banco-cajero-1', name: 'Cajero del banco', at: [2, 7], kind: 'atm' }, { id: 'banco-cajero-2', name: 'Cajero del banco', at: [18, 7], kind: 'atm' }, { id: 'banco-cam-1', name: 'Cámara de seguridad', at: [1, 4], kind: 'camera' }, { id: 'banco-cam-2', name: 'Cámara de seguridad', at: [19, 4], kind: 'camera' },
        { id: 'banco-terminal', name: 'Terminal de la cámara acorazada', at: [10, 4], kind: 'computer' }],
      waypoints: [[10, 8], [5, 9], [15, 9]], safePoint: [10, 11] });
    made.push('banco-central');
  }
  if (jail) {
    jail.b.sign = 'PENAL DE HIERRO'; jail.b.signColor = '#c8ccd8';
    city.doors.push({ id: 'puerta-penal-hierro', name: 'Penal de Hierro · visitas', at: jail.at, to: { zone: 'penal-hierro', at: [12, 14] }, danger: 'public', sign: 'PENAL', signColor: '#c8ccd8', signIcon: 'escudo' });
    city.props = city.props.filter((p) => !(Math.abs(p.at[0] - jail.at[0]) <= 1 && Math.abs(p.at[1] - jail.at[1]) <= 1));
    const blocks = [{ type: 'barrier', rect: [1, 6, 23, 1], height: 2, color: '#3a3e48' }];
    for (let x = 2; x < 23; x += 4) blocks.push({ type: 'wall', rect: [x, 1, 1, 4], height: 3, color: '#2a2e38' });
    const props = [];
    for (let x = 3; x < 23; x += 4) props.push({ type: 'bed', at: [x, 2] });
    for (const x of [5, 10, 15, 20]) props.push({ type: 'table', at: [x, 10] });
    writeZ({ id: 'penal-hierro', name: 'Penal de Hierro · sala de visitas', kind: 'interior', width: 25, height: 16, danger: 'public', base: 'metal', wallColor: '#22262e', furnished: true, restricted: 'carcel', detector: true, police: 4,
      blocks, props, doors: [{ id: 'salida-penal', name: 'Salida a la calle', at: [12, 15], to: { zone: 'vertice', at: jail.land }, danger: 'public' }],
      objects: [{ id: 'penal-cam-1', name: 'Cámara de seguridad', at: [1, 8], kind: 'camera' }, { id: 'penal-cam-2', name: 'Cámara de seguridad', at: [23, 8], kind: 'camera' }, { id: 'penal-terminal', name: 'Terminal de celdas', at: [12, 8], kind: 'computer' }],
      waypoints: [[12, 11], [6, 12], [18, 12]], safePoint: [12, 13] });
    made.push('penal-hierro');
  }
  writeZ(city);
  return { marked, made };
}
