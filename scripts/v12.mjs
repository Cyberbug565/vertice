// v0.12 · Diez armas nuevas (con su modelo 3D propio en el cliente) repartidas por armerías, mercadillos y perista.
export const NEW_WEAPONS = [
  { id: 'pistola-compacta', name: 'Pistola compacta', desc: 'Distancia 10 m · pequeña y fácil de esconder.', weight: 0.7, price: 240, category: 'arma', rarity: 'comun',
    weapon: { kind: 'ranged', family: 'Pistola', damage: [8, 13], range: 10, cooldown: 0.8, accuracy: 1, ammo: 'bala-pistola', mag: 8, nonlethal: 'no', noise: 0.7, tech: 'clasica', traits: [] } },
  { id: 'subfusil-compacto', name: 'Subfusil compacto', desc: 'Distancia 11 m · ráfagas cortas y culata plegable.', weight: 2.1, price: 820, category: 'arma', rarity: 'poco-comun',
    weapon: { kind: 'ranged', family: 'Subfusil', damage: [7, 11], range: 11, cooldown: 0.45, accuracy: 0, ammo: 'bala-pistola', mag: 25, nonlethal: 'no', noise: 0.85, tech: 'clasica', traits: [] } },
  { id: 'carabina', name: 'Carabina de culata de madera', desc: 'Distancia 16 m · vieja, robusta y precisa.', weight: 3.1, price: 900, category: 'arma', rarity: 'comun',
    weapon: { kind: 'ranged', family: 'Rifle', damage: [13, 19], range: 16, cooldown: 0.9, accuracy: 2, ammo: 'bala-rifle', mag: 15, nonlethal: 'no', noise: 0.9, tech: 'clasica', traits: [] } },
  { id: 'escopeta-bombeo', name: 'Escopeta de corredera', desc: 'Distancia 8 m · seis cartuchos y un chasquido que asusta.', weight: 3.4, price: 760, category: 'arma', rarity: 'poco-comun',
    weapon: { kind: 'ranged', family: 'Escopeta', damage: [16, 26], range: 8, cooldown: 1.3, accuracy: 1, ammo: 'cartucho', mag: 6, nonlethal: 'no', noise: 1, tech: 'potencia', traits: [] } },
  { id: 'ametralladora-ligera', name: 'Ametralladora ligera', desc: 'Distancia 17 m · caja de 80 balas y bípode.', weight: 8.5, price: 4200, category: 'arma', rarity: 'raro',
    weapon: { kind: 'ranged', family: 'Ametralladora', damage: [11, 17], range: 17, cooldown: 0.35, accuracy: -1, ammo: 'bala-rifle', mag: 80, nonlethal: 'no', noise: 1, tech: 'potencia', traits: [] } },
  { id: 'cuchillo-combate', name: 'Cuchillo de combate', desc: 'Cuerpo a cuerpo · hoja de 17 cm con sierra. Silencioso.', weight: 0.4, price: 120, category: 'arma', rarity: 'comun',
    weapon: { kind: 'melee', family: 'Cuchillo', damage: [8, 14], range: 1.3, cooldown: 0.8, accuracy: 1, nonlethal: 'no', noise: 0.05, tech: 'clasica', traits: ['sangrado', 'silenciosa'] } },
  { id: 'katana', name: 'Katana', desc: 'Cuerpo a cuerpo · acero plegado, sin trucos.', weight: 1.2, price: 1400, category: 'arma', rarity: 'poco-comun',
    weapon: { kind: 'melee', family: 'Hoja', damage: [14, 22], range: 1.9, cooldown: 1.1, accuracy: 1, nonlethal: 'no', noise: 0.1, tech: 'clasica', traits: ['sangrado'] } },
  { id: 'hacha-bomberos', name: 'Hacha de bombero', desc: 'Cuerpo a cuerpo · pesada; abre puertas y cráneos.', weight: 2.6, price: 180, category: 'arma', rarity: 'comun',
    weapon: { kind: 'melee', family: 'Hoja', damage: [13, 21], range: 1.8, cooldown: 1.6, accuracy: 0, nonlethal: 'opcional', noise: 0.2, tech: 'potencia', traits: ['sangrado'] } },
  { id: 'tuberia', name: 'Tubería de plomo', desc: 'Cuerpo a cuerpo · lo que había en el callejón.', weight: 1.8, price: 15, category: 'arma', rarity: 'comun',
    weapon: { kind: 'melee', family: 'Contundente', damage: [7, 13], range: 1.7, cooldown: 1.3, accuracy: 0, nonlethal: 'opcional', noise: 0.2, tech: 'clasica', traits: ['aturdidora'] } },
  { id: 'mazo', name: 'Mazo de demolición', desc: 'Cuerpo a cuerpo · lento y brutal: derriba de un golpe.', weight: 5, price: 220, category: 'arma', rarity: 'poco-comun',
    weapon: { kind: 'melee', family: 'Contundente', damage: [16, 26], range: 1.9, cooldown: 2, accuracy: -1, nonlethal: 'opcional', noise: 0.3, tech: 'potencia', traits: ['aturdidora'] } },
];

export function armsV12(arms) {
  const ids = new Set(NEW_WEAPONS.map((w) => w.id));
  return [...arms.filter((a) => !ids.has(a.id)), ...NEW_WEAPONS];
}

export function shopsV12(shops) {
  const add = { 'armeria-halcon': { 'pistola-compacta': 6, carabina: 3, 'escopeta-bombeo': 3, 'cuchillo-combate': 8 },
    'armeria-callejon': { 'subfusil-compacto': 3, katana: 2, 'cuchillo-combate': 6, 'escopeta-bombeo': 2 },
    'armas-forja': { 'ametralladora-ligera': 1, mazo: 2 },
    'chatarreria-tomas': { tuberia: 10, 'hacha-bomberos': 3, mazo: 2 },
    'mercadillo-arrabal': { tuberia: 6, 'cuchillo-combate': 3, 'pistola-compacta': 2 },
    'perista-pachinko': { 'subfusil-compacto': 2, 'pistola-compacta': 3 } };
  for (const s of shops) if (add[s.id]) Object.assign(s.stock, add[s.id]);
  return shops;
}
