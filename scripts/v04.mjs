// Contenido de la v0.4: árbol de perks, ropa, armas nuevas, ciberware con habilidades, coches, concesionarios y viviendas.
// Lo usa gen-content.mjs. Todo es original (marcas, modelos y nombres inventados).

// ---------------------------------------------------------------- perks
// [id, nombre, descripción, rama (habilidad), nivel, coste, requisitos de habilidad, nivel de personaje, perks previos, mods, flag]
const P = [
  // Armas a distancia
  ['pulso-firme', 'Pulso firme', '+10 % de daño con armas a distancia.', 'armas', 1, 1, { armas: 3 }, 1, [], { rangedDmg: 0.1 }],
  ['recarga-rapida', 'Recarga rápida', 'Las armas a distancia disparan un 15 % más rápido.', 'armas', 2, 1, { armas: 6 }, 1, ['pulso-firme'], { rangedCd: 0.15 }],
  ['tirador', 'Tirador', '+2 a impactar a distancia y 10 % de golpes críticos (doble daño).', 'armas', 3, 2, { armas: 10 }, 5, ['recarga-rapida'], { rangedAcc: 2, crit: 0.1 }],
  ['a-quemarropa', 'A quemarropa', '+25 % de daño a menos de 3 m con cualquier arma de fuego.', 'armas', 3, 1, { armas: 12, atletismo: 5 }, 5, ['pulso-firme'], { closeDmg: 0.25 }],
  ['ojo-de-dios', 'Ojo de Dios', 'Nivel 25. Tus disparos no fallan dentro del alcance del arma, sin penalización por distancia, y un 30 % son críticos.', 'armas', 5, 3, { armas: 25 }, 15, ['tirador'], { crit: 0.2 }, 'ojo-de-dios'],
  // Cuerpo a cuerpo
  ['golpe-firme', 'Golpe firme', '+10 % de daño cuerpo a cuerpo.', 'cuerpo', 1, 1, { cuerpo: 3 }, 1, [], { meleeDmg: 0.1 }],
  ['esquiva', 'Esquiva', '10 % de probabilidad de esquivar por completo un golpe.', 'cuerpo', 2, 1, { cuerpo: 7, atletismo: 5 }, 1, ['golpe-firme'], { dodge: 0.1 }],
  ['noqueador', 'Noqueador', '+3 al intentar dejar KO y +20 % de daño no letal.', 'cuerpo', 3, 1, { cuerpo: 10 }, 3, ['golpe-firme'], { koBonus: 3 }],
  ['frenesi', 'Frenesí', 'Al derribar a alguien recuperas 10 de salud y tu siguiente ataque sale al instante.', 'cuerpo', 4, 2, { cuerpo: 15 }, 8, ['esquiva'], {}, 'frenesi'],
  ['danza-cuchillas', 'Danza de cuchillas', 'Nivel 25. Cada golpe cuerpo a cuerpo alcanza también a todos los enemigos a tu alrededor.', 'cuerpo', 5, 3, { cuerpo: 25 }, 15, ['frenesi'], { meleeDmg: 0.15 }, 'danza'],
  // Interfaz (red)
  ['buffer', 'Búfer ampliado', '+2 de RAM máxima.', 'interfaz', 1, 1, { interfaz: 3 }, 1, [], { ram: 2 }],
  ['compilador', 'Compilador', 'Los quickhacks cuestan un 20 % menos de RAM.', 'interfaz', 2, 1, { interfaz: 7 }, 1, ['buffer'], { hackCost: 0.2 }],
  ['subida-rapida', 'Subida rápida', 'Los quickhacks suben un 30 % más rápido.', 'interfaz', 3, 1, { interfaz: 10 }, 3, ['compilador'], { hackSpeed: 0.3 }],
  ['sin-rastro', 'Sin rastro', 'La Red Centinela te rastrea la mitad de veces.', 'interfaz', 3, 1, { interfaz: 12, sigilo: 6 }, 5, ['compilador'], { trace: 0.5 }],
  ['cadena-red', 'Reacción en cadena', 'Si un quickhack deja KO o mata, salta gratis a otra persona cercana.', 'interfaz', 4, 2, { interfaz: 15 }, 8, ['subida-rapida'], {}, 'cadena'],
  ['dios-red', 'Fantasma en la red', 'Nivel 25. Subidas instantáneas, mitad de RAM y +3 a todos los hackeos.', 'interfaz', 5, 3, { interfaz: 25 }, 15, ['cadena-red'], { hackChance: 3 }, 'dios-red'],
  // Sigilo
  ['manos-ligeras', 'Manos ligeras', '+2 a robar y a hurtar en tiendas.', 'sigilo', 1, 1, { sigilo: 3 }, 1, [], { steal: 2 }],
  ['fantasma', 'Fantasma', 'Los delitos sin policía a menos de 18 m no suben tu búsqueda.', 'sigilo', 3, 2, { sigilo: 10 }, 5, ['manos-ligeras'], {}, 'fantasma'],
  ['carterista', 'Carterista experto', '+3 a robar y el botín de los robos es un 50 % mayor.', 'sigilo', 3, 1, { sigilo: 15 }, 6, ['manos-ligeras'], { steal: 3, robLoot: 0.5 }],
  ['sombra', 'Sombra', 'Nivel 25. Nadie se da cuenta de tus robos fallidos y la policía no te reconoce.', 'sigilo', 5, 3, { sigilo: 25 }, 15, ['fantasma'], { steal: 3 }, 'sombra'],
  // Atletismo
  ['zancada', 'Zancada', '+6 % de velocidad al andar.', 'atletismo', 1, 1, { atletismo: 3 }, 1, [], { speed: 0.06 }],
  ['mula', 'Mula de carga', '+15 kg de capacidad de carga.', 'atletismo', 2, 1, { atletismo: 6 }, 1, ['zancada'], { carry: 15 }],
  ['aguante', 'Aguante', '+20 de aguante y +10 de salud máxima.', 'atletismo', 3, 1, { atletismo: 10 }, 3, ['mula'], { stamina: 20, hpMax: 10 }],
  ['segunda-vida', 'Segunda vida', 'Una vez por día de juego, si caes con heridas mortales te levantas a los 6 s con la mitad de salud.', 'atletismo', 4, 2, { atletismo: 12, medicina: 6 }, 12, ['aguante'], {}, 'segunda-vida'],
  ['imparable', 'Imparable', 'Nivel 25. +25 % de velocidad y la carga nunca te frena.', 'atletismo', 5, 3, { atletismo: 25 }, 15, ['aguante'], { speed: 0.25 }, 'imparable'],
  // Medicina
  ['primeros-auxilios', 'Primeros auxilios', 'Recuperas 1 de salud cada 4 s fuera de combate.', 'medicina', 1, 1, { medicina: 3 }, 1, [], { regen: 0.25 }],
  ['metabolismo', 'Metabolismo eficiente', 'El hambre, la sed y el sueño suben un 15 % más despacio.', 'medicina', 2, 1, { medicina: 8 }, 1, ['primeros-auxilios'], { needs: 0.15 }],
  ['cirujano', 'Ojo clínico', '+5 % de supervivencia en cada operación de cromo.', 'medicina', 3, 1, { medicina: 12 }, 5, ['metabolismo'], { surgery: 0.05 }],
  ['milagro', 'Milagro', 'Nivel 25. Te estabilizas tú solo cuando caes, una vez por hora real, y regeneras el triple.', 'medicina', 5, 3, { medicina: 25 }, 15, ['cirujano'], { regen: 0.5 }, 'milagro'],
  // Negociación
  ['regateo', 'Regateo', 'Compras un 5 % más barato.', 'negociacion', 1, 1, { negociacion: 4 }, 1, [], { price: 0.05 }],
  ['buen-vendedor', 'Buen vendedor', 'Vendes un 15 % más caro.', 'negociacion', 2, 1, { negociacion: 8 }, 1, ['regateo'], { sell: 0.15 }],
  ['contactos', 'Contactos', 'Los sobornos a la PCV cuestan la mitad y compras otro 5 % más barato.', 'negociacion', 3, 1, { negociacion: 12 }, 5, ['regateo'], { price: 0.05, bribe: 0.5 }],
  ['lengua-de-plata', 'Lengua de plata', 'Nivel 25. Todo un 20 % más barato (casas y coches incluidos) y la PCV te deja ir sin pagar.', 'negociacion', 5, 3, { negociacion: 25 }, 15, ['contactos'], { price: 0.1 }, 'lengua'],
  // Intimidación
  ['mirada-dura', 'Mirada dura', '+1 a enfrentamientos y defensa.', 'intimidacion', 1, 1, { intimidacion: 5 }, 1, [], { confront: 1 }],
  ['extorsion', 'Extorsión', '+2 a robar a la cara y +10 % a las recompensas cobradas.', 'intimidacion', 2, 1, { intimidacion: 10 }, 3, ['mirada-dura'], { steal: 2, bounty: 0.1 }],
  ['terror', 'Leyenda de la calle', 'Nivel 25. Los PNJ de menor nivel huyen al verte armado y las bandas no se atreven contigo.', 'intimidacion', 5, 3, { intimidacion: 25 }, 15, ['extorsion'], { confront: 2 }, 'terror'],
  // Percepción
  ['ojo-avizor', 'Ojo avizor', 'Encuentras un 25 % más al rebuscar y +5 % de esquiva.', 'percepcion', 1, 1, { percepcion: 4 }, 1, [], { rummage: 0.25, dodge: 0.05 }],
  ['analista', 'Analista', 'Los escaneos y el análisis profundo cuestan 1 de RAM y +1 a hackear.', 'percepcion', 2, 1, { percepcion: 10 }, 3, ['ojo-avizor'], { hackChance: 1 }, 'analista'],
  ['lector', 'Lector de personas', 'Nivel 25. Ves el nivel, la salud y las estadísticas de cualquiera sin hackear.', 'percepcion', 5, 3, { percepcion: 25 }, 12, ['analista'], {}, 'lector'],
  // Reparación
  ['manitas', 'Manitas', '+3 de capacidad de cromo.', 'reparacion', 1, 1, { reparacion: 5 }, 1, [], { chrome: 3 }],
  ['ingeniero', 'Ingeniería de implantes', 'Las habilidades de tus implantes se recargan un 20 % antes.', 'reparacion', 3, 1, { reparacion: 12 }, 5, ['manitas'], { cooldown: 0.2 }],
  ['maestro-cromo', 'Maestro del cromo', 'Nivel 25. +12 de capacidad de cromo y recargas un 40 % más rápidas.', 'reparacion', 5, 3, { reparacion: 25 }, 15, ['ingeniero'], { chrome: 12, cooldown: 0.2 }],
  // Conducción
  ['volante', 'Buen volante', 'Tus coches van un 10 % más rápido.', 'conduccion', 1, 1, { conduccion: 4 }, 1, [], { carSpeed: 0.1 }],
  ['piloto', 'Piloto', 'Nivel 25. +30 % de velocidad al volante y el viaje en coche entre distritos es instantáneo.', 'conduccion', 5, 3, { conduccion: 25 }, 12, ['volante'], { carSpeed: 0.3 }, 'piloto'],
  // Filo (la vida al límite del cromo, «edgerunner»)
  ['sangre-de-cromo', 'Sangre de cromo', '+4 de capacidad de cromo.', 'filo', 1, 1, { filo: 3 }, 1, [], { chrome: 4 }],
  ['al-limite', 'Al límite', '+10 de capacidad de cromo y, con menos del 30 % de salud, +3 a todo en combate.', 'filo', 3, 2, { filo: 10 }, 5, ['sangre-de-cromo'], { chrome: 10 }, 'al-limite'],
  ['corazon-de-cromo', 'Corazón de cromo', 'Nivel 25. Las habilidades de tus implantes se recargan el doble de rápido y hacen un 25 % más de daño.', 'filo', 5, 3, { filo: 25 }, 15, ['al-limite'], { cooldown: 0.5 }, 'corazon-cromo'],
  // Generales
  ['aprendiz', 'Aprendiz eterno', 'Todas tus habilidades ganan un 15 % más de experiencia.', 'general', 1, 1, {}, 4, [], { skillXp: 0.15 }],
  ['superviviente', 'Superviviente', '+15 de salud máxima.', 'general', 2, 1, {}, 8, [], { hpMax: 15 }],
  ['veterano', 'Veterano de Vértice', '+1 a todas las tiradas de enfrentamiento y +10 % de experiencia de personaje.', 'general', 3, 2, {}, 16, ['aprendiz'], { confront: 1, xp: 0.1 }],
];
export function perks() {
  return P.map(([id, name, desc, skill, tier, cost, skills, level, prev, mods, flag]) => ({ id, name, desc, skill, tier, cost, requires: { skills, level, perks: prev }, mods, ...(flag ? { flag } : {}) }));
}

// ---------------------------------------------------------------- ropa
// [id, nombre, hueco, estilo, color, rareza, precio, blindaje, mejoras, peso, descripción]
const W = [
  // Cabeza
  ['gorra-neon', 'Gorra de neón', 'cabeza', 'gorra', '#ff3fa4', 'comun', 35, 0, {}, 0.2, 'Visera con tira luminosa.'],
  ['gorra-tactica', 'Gorra táctica', 'cabeza', 'gorra', '#3a4a3a', 'poco-comun', 120, 0, { skills: { percepcion: 1 } }, 0.2, 'Con microcámara de retrovisión.'],
  ['capucha-urbana', 'Capucha urbana', 'cabeza', 'capucha', '#2a2a3a', 'comun', 40, 0, { skills: { sigilo: 1 } }, 0.3, 'Para pasar desapercibida.'],
  ['bandana-roja', 'Bandana roja', 'cabeza', 'bandana', '#a82020', 'comun', 20, 0, {}, 0.1, 'Clásica de barrio.'],
  ['sombrero-ala', 'Sombrero de ala ancha', 'cabeza', 'sombrero', '#3a2a1a', 'poco-comun', 160, 0, { skills: { actuacion: 1 } }, 0.3, 'Estilo de detective de los de antes.'],
  ['casco-moto', 'Casco de moto', 'cabeza', 'casco', '#e8e8f0', 'poco-comun', 220, 1, {}, 1.2, 'Protege la cabeza en caídas y peleas.'],
  ['casco-balistico', 'Casco balístico Halcón', 'cabeza', 'casco', '#2a3a4a', 'raro', 900, 2, {}, 1.6, 'Placa compuesta de grado militar.'],
  ['corona-aurelia', 'Diadema Aurelia', 'cabeza', 'bandana', '#ffd23f', 'epico', 2400, 0, { skills: { actuacion: 2, negociacion: 1 } }, 0.1, 'Joya de las Colinas con LED de oro.'],
  // Cara
  ['gafas-sol', 'Gafas de sol', 'cara', 'gafas', '#1a1a1a', 'comun', 30, 0, {}, 0.1, 'Para el sol y para no mirar a nadie.'],
  ['gafas-hud', 'Gafas con HUD', 'cara', 'gafas', '#43f3ff', 'poco-comun', 260, 0, { skills: { percepcion: 1, armas: 1 } }, 0.1, 'Superponen distancias y objetivos.'],
  ['visor-tactico', 'Visor táctico', 'cara', 'visor', '#ff8a3d', 'raro', 850, 1, { skills: { armas: 2 } }, 0.3, 'Visor de combate con telemetría.'],
  ['mascara-filtro', 'Máscara de filtro', 'cara', 'mascara', '#3a3a3a', 'comun', 60, 0, { needs: 0.03 }, 0.3, 'Filtra el aire de Forja.'],
  ['mascara-oni', 'Máscara oni', 'cara', 'mascara', '#a82020', 'epico', 1800, 1, { skills: { intimidacion: 3 } }, 0.4, 'Laca roja del Clan Kitsune.'],
  ['visor-neural', 'Visor neural «Prisma»', 'cara', 'visor', '#b46cff', 'legendario', 6500, 1, { skills: { interfaz: 3, percepcion: 2 } }, 0.2, 'Interfaz óptica que refuerza la conexión con el deck.'],
  // Torso exterior
  ['chaqueta', 'Chaqueta reforzada', 'torso_ext', 'chaqueta', '#40506a', 'comun', 90, 1, {}, 2, 'Ropa de calle con forro balístico ligero (blindaje 1).'],
  ['bomber-cuero', 'Bomber de cuero sintético', 'torso_ext', 'chaqueta', '#5a2a1a', 'comun', 140, 1, {}, 2, 'Clásica, cálida y con bolsillos.'],
  ['cazadora-neon', 'Cazadora de neón', 'torso_ext', 'chaqueta', '#ff3fa4', 'poco-comun', 380, 1, { skills: { actuacion: 1 } }, 1.8, 'Paneles luminosos que cambian con la música.'],
  ['chaleco-balistico', 'Chaleco balístico', 'torso_ext', 'chaleco', '#3a3a2a', 'poco-comun', 300, 3, {}, 4, 'Placas de cerámica. Pesa, pero para balas.'],
  ['ropa-impermeable', 'Gabardina impermeable', 'torso_ext', 'gabardina', '#3a4a4a', 'comun', 70, 0, { needs: 0.02 }, 1.5, 'Duermes mejor a la intemperie.'],
  ['chaleco-carga', 'Chaleco de carga', 'torso_ext', 'chaleco', '#4a4a3a', 'poco-comun', 260, 1, { carry: 12 }, 1.5, 'Muchos bolsillos: +12 kg de carga.'],
  ['gabardina-blindada', 'Gabardina blindada', 'torso_ext', 'gabardina', '#2a2a30', 'raro', 1100, 4, {}, 4, 'Larga, negra y a prueba de navajas.'],
  ['abrigo-nomada', 'Abrigo nómada', 'torso_ext', 'gabardina', '#8a6a3a', 'raro', 900, 2, { needs: 0.05, carry: 8 }, 3, 'Resiste el polvo del Yermo.'],
  ['americana-ejecutiva', 'Americana ejecutiva', 'torso_ext', 'traje', '#1a1a2a', 'raro', 1300, 1, { skills: { negociacion: 2 } }, 1.5, 'Corte de Cénit: abre puertas.'],
  ['chaqueta-tactica', 'Chaqueta táctica Halcón', 'torso_ext', 'chaqueta', '#2a3a4a', 'epico', 3600, 5, { carry: 5 }, 3.5, 'Kevlarina tejida y refuerzos en hombros.'],
  ['abrigo-nanofibra', 'Abrigo de nanofibra «Eclipse»', 'torso_ext', 'gabardina', '#101018', 'legendario', 9800, 6, { skills: { sigilo: 2 }, speed: 0.03 }, 2, 'Absorbe la luz y los impactos.'],
  // Torso interior
  ['camiseta-basica', 'Camiseta básica', 'torso_int', 'top', '#e8e8f0', 'comun', 15, 0, {}, 0.2, 'Algodón reciclado.'],
  ['camiseta-banda', 'Camiseta de grupo', 'torso_int', 'top', '#1a1a1a', 'comun', 35, 0, { skills: { actuacion: 1 } }, 0.2, 'De una banda de rock que ya no existe.'],
  ['camisa-seda', 'Camisa de seda sintética', 'torso_int', 'traje', '#e8d8f0', 'poco-comun', 220, 0, { skills: { negociacion: 1 } }, 0.2, 'Brilla bajo el neón.'],
  ['sudadera-capucha', 'Sudadera con capucha', 'torso_int', 'sudadera', '#3a3a4a', 'comun', 60, 0, {}, 0.6, 'Cómoda y anónima.'],
  ['top-malla', 'Top de malla', 'torso_int', 'top', '#ff3fa4', 'poco-comun', 120, 0, { skills: { actuacion: 1 } }, 0.1, 'Para el club.'],
  ['camiseta-termica', 'Camiseta térmica', 'torso_int', 'top', '#2a4a5a', 'raro', 600, 1, { needs: 0.05 }, 0.3, 'Regula la temperatura: duermes mejor.'],
  ['mono-trabajo', 'Mono de trabajo', 'torso_int', 'mono', '#ff8a3d', 'comun', 70, 0, { carry: 4 }, 1.2, 'De los de Forja.'],
  ['camisa-blindada', 'Camisa con malla de aramida', 'torso_int', 'traje', '#e8e8f0', 'epico', 2600, 2, { skills: { negociacion: 1 } }, 0.8, 'Parece una camisa normal.'],
  // Piernas
  ['vaqueros', 'Vaqueros', 'piernas', 'pantalon', '#2a3a5a', 'comun', 45, 0, {}, 0.8, 'Duran toda la vida.'],
  ['pantalon-cargo', 'Pantalón cargo', 'piernas', 'pantalon', '#4a4a3a', 'comun', 70, 0, { carry: 6 }, 1, 'Bolsillos para todo: +6 kg.'],
  ['falda-vinilo', 'Falda de vinilo', 'piernas', 'falda', '#1a1a1a', 'poco-comun', 160, 0, { skills: { actuacion: 1 } }, 0.4, 'Reflejos de neón.'],
  ['shorts-deporte', 'Pantalón corto deportivo', 'piernas', 'shorts', '#3a3a6a', 'comun', 30, 0, { speed: 0.02 }, 0.3, 'Ligeros para correr.'],
  ['pantalon-traje', 'Pantalón de traje', 'piernas', 'pantalon', '#1a1a2a', 'poco-comun', 200, 0, { skills: { negociacion: 1 } }, 0.6, 'A juego con la americana.'],
  ['pantalon-tactico', 'Pantalón táctico blindado', 'piernas', 'pantalon', '#2a3a2a', 'raro', 950, 2, { carry: 4 }, 2, 'Rodilleras y placas en el muslo.'],
  ['mallas-nanofibra', 'Mallas de nanofibra', 'piernas', 'pantalon', '#101018', 'epico', 2900, 1, { speed: 0.06, skills: { atletismo: 2 } }, 0.3, 'Ligeras como una segunda piel.'],
  // Pies
  ['deportivas', 'Deportivas', 'pies', 'deportivas', '#e8e8f0', 'comun', 60, 0, { speed: 0.02 }, 0.6, 'Para la calle.'],
  ['botas-trabajo', 'Botas de trabajo', 'pies', 'botas', '#5a3a1a', 'comun', 80, 0, {}, 1.2, 'Puntera de acero.'],
  ['zapatos-piel', 'Zapatos de piel', 'pies', 'zapatos', '#1a1010', 'poco-comun', 240, 0, { skills: { negociacion: 1 } }, 0.6, 'Relucientes.'],
  ['botas-militares', 'Botas militares', 'pies', 'botas', '#2a2a2a', 'raro', 700, 1, { skills: { atletismo: 1 } }, 1.4, 'Suela antideslizante y refuerzo.'],
  ['zapatillas-led', 'Zapatillas LED «Pulso»', 'pies', 'deportivas', '#43f3ff', 'epico', 1900, 0, { speed: 0.06, skills: { actuacion: 1 } }, 0.5, 'Amortiguación activa: más rápido.'],
  ['botas-gravedad', 'Botas de grafeno «Ícaro»', 'pies', 'botas', '#ffd23f', 'legendario', 7200, 1, { speed: 0.1, skills: { atletismo: 3 } }, 0.8, 'Lo mejor que se puede llevar en los pies.'],
];
export function clothing() {
  return W.map(([id, name, slot, style, color, rarity, price, armor, mods, weight, desc]) => ({ id, name, desc, weight, price, category: 'ropa', rarity, ...(armor ? { armor } : {}), wear: { slot, style, color, mods } }));
}

// ---------------------------------------------------------------- armas nuevas
// [id, nombre, tipo, familia, daño, alcance, cadencia, precisión, munición, no letal, tecnología, rasgos, precio, peso, rareza, descripción]
const A = [
  ['nunchakus', 'Nunchakus', 'melee', 'Contundente', [7, 12], 1.6, 0.7, 2, null, 'opcional', 'clasica', ['aturdidora'], 260, 0.8, 'comun', 'Rápidos y difíciles de esquivar. Aturden.'],
  ['tonfa-aturdidora', 'Tonfa aturdidora', 'melee', 'Contundente', [6, 10], 1.5, 0.8, 2, null, 'solo', 'potencia', ['aturdidora', 'electrica'], 450, 0.9, 'poco-comun', 'Reglamentaria de la PCV. Solo deja KO.'],
  ['lanza-electrica', 'Lanza eléctrica', 'melee', 'Hoja', [10, 18], 2.4, 1.2, 1, null, 'opcional', 'tecnica', ['electrica'], 1900, 3, 'raro', 'Alcance largo para un arma de mano.'],
  ['martillo-neumatico', 'Martillo neumático', 'melee', 'Contundente', [18, 30], 1.7, 1.8, -2, null, 'opcional', 'potencia', ['aturdidora', 'area'], 2400, 7, 'raro', 'Cada golpe sacude a todo el que esté cerca.'],
  ['hacha-plasma', 'Hacha de plasma', 'melee', 'Hoja', [14, 26], 1.8, 1.4, 0, null, 'no', 'tecnica', ['quemadura', 'perforante'], 3200, 3.5, 'epico', 'El filo de plasma ignora el blindaje y quema.'],
  ['espada-monofilamento', 'Espada de monofilamento', 'melee', 'Hoja', [16, 28], 1.8, 1.1, 1, null, 'no', 'tecnica', ['perforante', 'sangrado'], 5500, 1.5, 'legendario', 'Un hilo de una molécula sobre una hoja de carbono.'],
  ['pistola-silenciada', 'Pistola silenciada', 'ranged', 'Pistola', [9, 14], 11, 0.9, 1, 'bala-pistola', 'no', 'clasica', ['silenciosa'], 900, 1.2, 'poco-comun', 'Los delitos con ella suben la búsqueda la mitad.'],
  ['pistola-plasma', 'Pistola de plasma', 'ranged', 'Pistola', [14, 22], 12, 1.0, 0, 'celula-energia', 'no', 'tecnica', ['quemadura'], 2600, 1.4, 'raro', 'Dispara plasma que sigue quemando.'],
  ['revolver-riel', 'Revólver de riel', 'ranged', 'Revólver', [24, 34], 16, 1.6, -1, 'celula-energia', 'no', 'tecnica', ['perforante'], 4200, 2.2, 'epico', 'Atraviesa paredes, blindajes y lo que haya detrás.'],
  ['pistola-agujas', 'Pistola de agujas', 'ranged', 'Pistola', [6, 10], 10, 0.6, 2, 'aguja', 'opcional', 'inteligente', ['silenciosa', 'inteligente'], 1700, 0.9, 'raro', 'Agujas guiadas que no hacen ruido.'],
  ['smg-inteligente', 'Subfusil inteligente', 'ranged', 'Subfusil', [8, 12], 14, 0.5, 1, 'bala-pistola', 'no', 'inteligente', ['inteligente'], 3100, 2.8, 'raro', 'Balas autoguiadas: ni la distancia las despista.'],
  ['escopeta-tecnologica', 'Escopeta tecnológica', 'ranged', 'Escopeta', [20, 34], 7, 1.5, 0, 'cartucho', 'no', 'tecnica', ['perforante', 'area'], 3600, 4, 'epico', 'Perdigones cargados que atraviesan y abren en abanico.'],
  ['rifle-pulsos', 'Rifle de pulsos', 'ranged', 'Rifle', [12, 18], 18, 0.7, 1, 'celula-energia', 'opcional', 'tecnica', ['electrica'], 3900, 3.6, 'raro', 'Descargas que fríen nervios y circuitos.'],
  ['ballesta-carbono', 'Ballesta de carbono', 'ranged', 'Arco', [16, 26], 16, 1.6, 2, 'virote', 'no', 'clasica', ['silenciosa', 'sangrado'], 1500, 2.5, 'poco-comun', 'Silenciosa y letal: los virotes desgarran.'],
  ['rifle-dardos', 'Rifle de dardos sedantes', 'ranged', 'Rifle', [4, 8], 14, 1.4, 1, 'dardo-sedante', 'solo', 'clasica', ['aturdidora', 'silenciosa'], 1300, 3, 'poco-comun', 'Para cazar con vida.'],
  ['canon-sonico', 'Cañón sónico', 'ranged', 'Especial', [8, 14], 6, 1.2, 1, 'celula-energia', 'opcional', 'tecnica', ['aturdidora', 'area'], 2900, 4.5, 'raro', 'Onda de choque que derriba a varios a la vez.'],
  ['ametralladora-rotativa', 'Ametralladora rotativa', 'ranged', 'Ametralladora', [9, 14], 13, 0.35, -2, 'bala-rifle', 'no', 'potencia', ['area'], 6900, 14, 'epico', 'Lluvia de plomo. Pesa una barbaridad.'],
  ['francotirador-inteligente', 'Francotirador inteligente', 'ranged', 'Rifle', [30, 44], 32, 2.2, 3, 'bala-rifle', 'no', 'inteligente', ['inteligente', 'perforante'], 7800, 6, 'legendario', 'La bala dobla esquinas para encontrar a su objetivo.'],
  ['lanzagranadas-emp', 'Lanzagranadas PEM', 'ranged', 'Especial', [16, 26], 14, 2.5, -1, 'granada-emp', 'no', 'tecnica', ['emp', 'area', 'aturdidora'], 6400, 6, 'epico', 'Funde el cromo y aturde a todo el grupo.'],
];
const AMMO = [
  ['granada-emp', 'Granada PEM', 'Munición para el lanzagranadas PEM.', 0.4, 90],
  ['virote', 'Virote de carbono', 'Munición para ballestas.', 0.05, 6],
  ['aguja', 'Agujas guiadas', 'Munición para la pistola de agujas.', 0.01, 3],
  ['dardo-sedante', 'Dardo sedante', 'Munición no letal para el rifle de dardos.', 0.02, 8],
];
// Armas integradas en implantes nuevos.
const AI = [
  ['latigo-monofilamento-arma', 'Látigo de monofilamento', 'melee', 'Implante', [12, 20], 3, 1.0, 1, 'no', 'tecnica', ['sangrado', 'area'], 'Un hilo que sale de la muñeca y corta lo que toca.'],
  ['garras-arma', 'Garras retráctiles', 'melee', 'Implante', [10, 16], 1.4, 0.6, 2, 'no', 'tecnica', ['sangrado'], 'Cinco cuchillas bajo las uñas.'],
  ['palma-taser-arma', 'Palma eléctrica', 'melee', 'Implante', [6, 10], 1.4, 0.9, 2, 'solo', 'tecnica', ['electrica', 'aturdidora'], 'Descarga desde la palma de la mano: deja KO.'],
];
export function weapons() {
  const out = [];
  for (const [id, name, kind, family, damage, range, cooldown, accuracy, ammo, nonlethal, tech, traits, price, weight, rarity, desc] of A)
    out.push({ id, name, desc, weight, price, category: 'arma', rarity, weapon: { kind, family, damage, range, cooldown, accuracy, ...(ammo ? { ammo } : {}), nonlethal, tech, traits } });
  for (const [id, name, desc, weight, price] of AMMO) out.push({ id, name, desc, weight, price, category: 'municion' });
  for (const [id, name, kind, family, damage, range, cooldown, accuracy, nonlethal, tech, traits, desc] of AI)
    out.push({ id, name, desc, weight: 0, category: 'arma', rarity: 'raro', weapon: { kind, family, damage, range, cooldown, accuracy, nonlethal, tech, traits } });
  return out;
}

// ---------------------------------------------------------------- ciberware: regiones y habilidades
export const REGION_OF_SLOT = { ojos: 'ojos', oidos: 'cara', seguridad: 'corteza', brazo: 'brazos', pierna: 'piernas', piernas: 'piernas', tegumento: 'tegumentario', digestivo: 'circulatorio', renal: 'circulatorio', cortex: 'corteza', so: 'so', piel: 'tegumentario', circulatorio: 'circulatorio' };
export const CYBER_UPGRADES = {
  'camuflaje-optico': { ability: { kind: 'invisible', name: 'Camuflaje', cooldown: 90, duration: 8 } },
  'piernas-salto': { ability: { kind: 'esprint', name: 'Esprint', cooldown: 30, duration: 6, power: 0.7 } },
  'biomonitor-experimental': { unique: 'autoestim' },
  'cuchillas-antebrazo': { ability: { kind: 'torbellino', name: 'Torbellino', cooldown: 25, power: 1 } },
  'canon-antebrazo': { ability: { kind: 'disparo-cargado', name: 'Disparo cargado', cooldown: 30, power: 2 } },
  'cyberdeck-militar': { ability: { kind: 'pico-ram', name: 'Pico de RAM', cooldown: 120 } },
  'puno-hidraulico': { ability: { kind: 'pulso', name: 'Onda de choque', cooldown: 40, duration: 2, power: 6 } },
};
// [id, nombre, familia, ranura, región, grado, capacidad, humanidad, precio, fabricante, descripción, efectos, visible, habilidad, único]
const CW = [
  ['reflejos-sobrealimentados', 'Reflejos sobrealimentados', 'Sistema nervioso', 'nervioso', 'nervioso', 4, 8, 5, 6800, 'halcon', 'Acelera tus sinapsis: durante unos segundos todo va a cámara lenta para ti (atacas mucho más rápido y esquivas).', {}, 'ninguna', { kind: 'tiempo-bala', name: 'Tiempo bala', cooldown: 60, duration: 6 }],
  ['refuerzo-sinaptico', 'Refuerzo sináptico', 'Sistema nervioso', 'nervioso', 'nervioso', 2, 3, 2, 1500, 'teselia', 'Tus reflejos esquivan solos: 12 % de esquiva.', { dodge: 0.12 }, 'ninguna'],
  ['segundo-corazon', 'Segundo corazón', 'Circulatorio', 'corazon', 'circulatorio', 5, 9, 5, 9500, 'okami', 'Un corazón de reserva: una vez cada dos días de juego, si te matan, vuelves a la vida con la mitad de salud.', {}, 'ninguna', null, 'segundo-corazon'],
  ['glandula-adrenalina', 'Glándula de adrenalina', 'Circulatorio', 'glandula', 'circulatorio', 2, 4, 2, 1600, 'okami', 'Libera adrenalina sintética: recuperas un 35 % de salud en 5 s.', {}, 'ninguna', { kind: 'curar', name: 'Adrenalina', cooldown: 45, duration: 5, power: 0.35 }],
  ['pulso-emp', 'Emisor de pulso PEM', 'Tegumentario', 'emisor', 'tegumentario', 4, 7, 4, 5900, 'halcon', 'Suelta un pulso que aturde y daña a todos los que tengas a 5 m, sobre todo a los muy cromados.', {}, 'torso', { kind: 'pulso', name: 'Pulso PEM', cooldown: 75, duration: 3, power: 8 }],
  ['piernas-propulsion', 'Piernas de propulsión', 'Piernas', 'piernas', 'piernas', 3, 6, 3, 3900, 'engranajes', 'Propulsores en los gemelos: te lanzas sobre tu objetivo y golpeas con ventaja.', { speed: 0.05 }, 'piernas', { kind: 'carga', name: 'Carga', cooldown: 20, power: 6 }],
  ['proyector-holografico', 'Proyector holográfico', 'Corteza frontal', 'proyector', 'corteza', 3, 5, 3, 3300, 'teselia', 'Proyecta un doble tuyo: quien te ataca pierde tu rastro unos segundos.', {}, 'ninguna', { kind: 'senuelo', name: 'Señuelo', cooldown: 60, duration: 5 }],
  ['latigo-monofilamento', 'Látigo de monofilamento', 'Brazos', 'brazo', 'brazos', 4, 7, 5, 6100, 'engranajes', 'Arma integrada: un látigo de un hilo molecular. Alcance 3 m y corta a varios a la vez.', { weapon: 'latigo-monofilamento-arma' }, 'brazo'],
  ['garras-retractiles', 'Garras retráctiles', 'Manos', 'manos', 'manos', 2, 4, 3, 2200, 'engranajes', 'Arma integrada: cuchillas bajo las uñas, rápidas y sangrantes.', { weapon: 'garras-arma' }, 'ninguna'],
  ['palma-electrica', 'Palma eléctrica', 'Manos', 'manos', 'manos', 2, 3, 2, 1800, 'halcon', 'Arma integrada no letal: una descarga desde la palma te deja noquear sin armas.', { weapon: 'palma-taser-arma' }, 'ninguna'],
  ['optica-analisis', 'Óptica de análisis', 'Ojos', 'ojos', 'ojos', 2, 3, 1, 1700, 'teselia', 'Al pasar el ratón ves el nivel y la salud de cualquiera, y el menú muestra sus estadísticas.', { skills: { percepcion: 1 } }, 'ojos', null, 'lector'],
  ['modulador-voz', 'Modulador de voz', 'Cara', 'laringe', 'cara', 1, 2, 1, 900, 'teselia', 'Cambia tu voz y tu cara ante las cámaras: tu nivel de búsqueda baja el doble de rápido.', { skills: { actuacion: 1, negociacion: 1 } }, 'ninguna', null, 'modulador'],
  ['compartimento-oculto', 'Compartimento oculto', 'Esqueleto', 'compartimento', 'esqueleto', 1, 2, 1, 800, 'chatarreros', 'Un hueco en las costillas: los robos te quitan la mitad.', {}, 'ninguna', null, 'compartimento'],
  ['esqueleto-titanio', 'Esqueleto de titanio', 'Esqueleto', 'esqueleto', 'esqueleto', 3, 7, 3, 4600, 'halcon', 'Huesos reforzados: +20 de salud, +20 kg de carga y blindaje 1.', { hpMax: 20, carry: 20, armor: 1 }, 'ninguna'],
  ['huesos-densos', 'Huesos densos', 'Esqueleto', 'esqueleto', 'esqueleto', 2, 4, 2, 1900, 'engranajes', '+10 de salud y +15 % de daño cuerpo a cuerpo.', { hpMax: 10, meleeDmg: 0.15 }, 'ninguna'],
  ['interfaz-vehiculo', 'Interfaz de vehículo', 'Corteza frontal', 'interfaz-coche', 'corteza', 1, 2, 1, 750, 'aurora', 'Conectas el coche a tu cerebro: +20 % de velocidad al volante y +2 a conducción.', { carSpeed: 0.2, skills: { conduccion: 2 } }, 'ninguna'],
  ['traductor-cultural', 'Traductor cultural', 'Corteza frontal', 'traductor', 'corteza', 1, 2, 1, 650, 'teselia', '+2 a negociación y +1 a actuación.', { skills: { negociacion: 2, actuacion: 1 } }, 'ninguna'],
  ['implante-mandibula', 'Mandíbula de acero', 'Cara', 'mandibula', 'cara', 2, 3, 2, 1200, 'engranajes', 'Cromo a la vista: +2 a intimidación.', { skills: { intimidacion: 2 } }, 'cabeza'],
];
export function cyberwareExtra() {
  return CW.map(([id, name, family, slot, region, grade, capacity, humanity, price, maker, desc, effects, visible, ability, unique]) =>
    ({ id, name, family, slot, region, grade, capacity, humanity, price, maker, desc, effects, visible, ...(ability ? { ability } : {}), ...(unique ? { unique } : {}) }));
}

// ---------------------------------------------------------------- coches y concesionarios
// [id, nombre, marca, clase, velocidad (× marcha), maletero kg, plazas, blindaje, precio, color, descripción]
const CARS = [
  ['kotetsu-nezumi', 'Nezumi 125', 'Kōtetsu Motors', 'moto', 2.6, 10, 2, 0, 3900, '#43f3ff', 'Scooter eléctrico de reparto. Barato y ágil.'],
  ['kotetsu-raijin', 'Raijin 600', 'Kōtetsu Motors', 'moto', 3.4, 15, 2, 0, 14500, '#ff3fa4', 'Moto deportiva con carenado de neón.'],
  ['kotetsu-oni', 'Oni R1000', 'Kōtetsu Motors', 'moto', 4.0, 15, 2, 0, 38000, '#a82020', 'La moto más rápida de Neón Rojo.'],
  ['brennan-mastin', 'Mastín', 'Brennan Iron', 'moto', 3.0, 30, 2, 1, 21000, '#2a2a2a', 'Moto pesada de cruzar el Yermo.'],
  ['vidal-pulga', 'Pulga', 'Vidal', 'economico', 2.0, 40, 2, 0, 5200, '#ffd23f', 'Utilitario diminuto. Aparca en cualquier sitio.'],
  ['vidal-gorrion', 'Gorrión', 'Vidal', 'economico', 2.2, 70, 4, 0, 8400, '#7dd3a0', 'El coche de todas las familias del Arrabal.'],
  ['vidal-sardina', 'Sardina Turbo', 'Vidal', 'economico', 2.5, 60, 4, 0, 12900, '#ff8a3d', 'Compacto con turbo de serie.'],
  ['hakuro-mikan', 'Mikan', 'Hakuro', 'economico', 2.3, 80, 4, 0, 11800, '#ff8a3d', 'Híbrido fiable, eterno.'],
  ['hakuro-tanuki', 'Tanuki Van', 'Hakuro', 'utilitario', 2.0, 220, 7, 1, 16500, '#e8e8f0', 'Furgoneta con espacio para todo (y para todos).'],
  ['aurora-mula', 'Mula de reparto', 'Aurora Logística', 'utilitario', 1.9, 400, 2, 1, 19800, '#3a8a4a', 'La furgoneta de reparto de Aurora: maletero enorme.'],
  ['brennan-percheron', 'Percherón', 'Brennan Iron', 'utilitario', 2.2, 300, 3, 2, 26500, '#5a4a3a', 'Pick-up de carga pesada.'],
  ['marrow-garza', 'Garza GT', 'Marrow', 'deportivo', 3.2, 50, 2, 0, 42000, '#43f3ff', 'Coupé deportivo para las avenidas de Cénit.'],
  ['marrow-halcon-negro', 'Milano', 'Marrow', 'deportivo', 3.5, 45, 2, 0, 68000, '#1a1a1a', 'Biplaza de carreras ilegales.'],
  ['saeta-dardo', 'Dardo', 'Saeta', 'deportivo', 3.6, 40, 2, 0, 89000, '#ff3fa4', 'Aerodinámica de fibra de carbono.'],
  ['zephyr-brisa', 'Brisa', 'Zephyr', 'deportivo', 3.3, 60, 4, 0, 54000, '#e8e8f0', 'Eléctrico deportivo de cuatro plazas.'],
  ['brennan-bisonte', 'Bisonte', 'Brennan Iron', 'todoterreno', 2.6, 180, 5, 2, 34000, '#8a6a3a', 'Todoterreno nómada de verdad.'],
  ['brennan-uro', 'Uro 6x6', 'Brennan Iron', 'todoterreno', 2.4, 350, 6, 3, 61000, '#4a4a3a', 'Seis ruedas, seis plazas, cero carreteras necesarias.'],
  ['orca-coyote', 'Coyote', 'Orca', 'todoterreno', 2.9, 150, 4, 1, 29000, '#d9a066', 'Buggy de los Nómadas del Polvo.'],
  ['zephyr-aurora', 'Altitud', 'Zephyr', 'lujo', 3.0, 120, 4, 1, 110000, '#e8d8f0', 'Berlina eléctrica para ejecutivos.'],
  ['kaiten-sakura', 'Sakura Limousine', 'Kaiten Motors', 'lujo', 2.6, 160, 6, 2, 165000, '#1a1a2a', 'Limusina con bar y cristales tintados.'],
  ['saeta-imperial', 'Imperial', 'Saeta', 'lujo', 3.2, 100, 4, 1, 198000, '#ffd23f', 'Lujo artesanal de las Colinas.'],
  ['marrow-duque', 'Duque', 'Marrow', 'lujo', 3.1, 110, 4, 1, 142000, '#6b2140', 'Gran turismo de los que ya no se fabrican.'],
  ['halcon-centurion', 'Centurión', 'Halcón Dynamics', 'blindado', 2.6, 200, 5, 5, 185000, '#2a3a4a', 'Blindado ejecutivo: aguanta un asalto.'],
  ['halcon-pretoriano', 'Pretoriano', 'Halcón Dynamics', 'blindado', 2.4, 300, 8, 7, 260000, '#3a3a3a', 'Transporte táctico de la Unidad Hierro (versión civil).'],
  ['saeta-relampago', 'Relámpago X', 'Saeta', 'hiper', 4.4, 30, 2, 0, 420000, '#43f3ff', 'Hiperdeportivo de 1.900 caballos.'],
  ['marrow-espectro', 'Espectro', 'Marrow', 'hiper', 4.6, 25, 2, 0, 650000, '#b46cff', 'Un mito sobre ruedas: solo existen doce.'],
  ['zephyr-singularidad', 'Singularidad', 'Zephyr', 'hiper', 4.8, 35, 2, 1, 980000, '#e8e8f0', 'Prototipo con levitación parcial. El coche más caro de Vértice.'],
];
export function cars() {
  return CARS.map(([id, name, maker, cls, speed, trunk, seats, armor, price, color, desc]) => ({ id, name, maker, class: cls, speed, trunk, seats, armor, price, color, desc }));
}
export const DEALERS = [
  { id: 'saeta-colinas', name: 'Concesionario Saeta', zone: 'concesionario-saeta-int', classes: ['lujo', 'hiper', 'deportivo'], priceMult: 1.05, desc: 'Lujo e hiperdeportivos en las Colinas. Café gratis si puedes pagarlos.' },
  { id: 'kotetsu-neon', name: 'Motos Kōtetsu', zone: 'motos-kotetsu-int', classes: ['moto', 'deportivo'], priceMult: 1, desc: 'Motos y deportivos en el corazón de Neón Rojo.' },
  { id: 'usados-forja', name: 'Usados de Forja', zone: 'usados-forja-int', classes: ['economico', 'utilitario', 'todoterreno', 'moto'], priceMult: 0.8, desc: 'Coches de segunda mano. Sin garantía y sin preguntas.' },
  { id: 'vidal-arrabal', name: 'Autos Vidal', zone: 'autos-vidal-int', classes: ['economico', 'utilitario', 'moto'], priceMult: 0.92, desc: 'Coches de barrio a plazos (que no se pagan a plazos).' },
  { id: 'halcon-cenit', name: 'Blindados Halcón', zone: 'blindados-halcon-int', classes: ['blindado', 'lujo'], priceMult: 1.1, desc: 'Vehículos blindados para quien tiene enemigos.' },
  { id: 'autos-ferro', name: 'Autos del Muelle', zone: 'autos-ferro-int', classes: ['economico', 'utilitario', 'moto'], priceMult: 0.95, desc: 'Lo que llega en los barcos, a buen precio.' },
  { id: 'nomadas-yermo', name: 'Garaje de los Nómadas', zone: 'yermo', classes: ['todoterreno', 'moto', 'utilitario'], priceMult: 0.9, desc: 'Vehículos preparados para el Yermo.' },
];

// ---------------------------------------------------------------- viviendas
export const HOUSE_SIZES = {
  estudio: { base: 18000, w: 12, h: 9, exit: [11, 4], name: 'Estudio' },
  piso: { base: 45000, w: 14, h: 10, exit: [13, 5], name: 'Piso' },
  loft: { base: 90000, w: 16, h: 11, exit: [15, 5], name: 'Loft' },
  atico: { base: 220000, w: 18, h: 12, exit: [17, 6], name: 'Ático' },
  villa: { base: 650000, w: 20, h: 14, exit: [19, 7], name: 'Villa' },
};
const DIST = {
  colinas: { mult: 1.6, sizes: ['villa', 'villa', 'atico', 'loft'] },
  cenit: { mult: 1.4, sizes: ['atico', 'loft', 'piso', 'loft'] },
  'neon-rojo': { mult: 1.0, sizes: ['estudio', 'loft', 'piso', 'atico'] },
  ferro: { mult: 0.8, sizes: ['estudio', 'piso', 'piso', 'loft'] },
  forja: { mult: 0.7, sizes: ['estudio', 'piso', 'loft'] },
  arrabal: { mult: 0.5, sizes: ['estudio', 'estudio', 'piso'] },
};
/** Plantillas de interior de las viviendas (una zona por tamaño; cada casa es una instancia). */
export function houseTemplates() {
  return Object.entries(HOUSE_SIZES).map(([size, s]) => {
    const props = [{ type: 'bed', at: [2, 2], color: '#43f3ff' }, { type: 'table', at: [Math.floor(s.w / 2), Math.floor(s.h / 2)] }, { type: 'plant', at: [s.w - 3, 1] }, { type: 'screen', at: [5, 1], blocking: false, color: '#b46cff' }];
    if (s.w >= 16) props.push({ type: 'table', at: [Math.floor(s.w / 2) + 3, Math.floor(s.h / 2)] }, { type: 'neon', at: [9, 1], blocking: false, color: '#ff3fa4' }, { type: 'bench', at: [3, s.h - 3] });
    if (s.w >= 18) props.push({ type: 'plant', at: [2, s.h - 2] }, { type: 'screen', at: [12, 1], blocking: false, color: '#43f3ff' }, { type: 'shelf', at: [s.w - 5, 1] });
    return {
      id: `casa-${size}`, name: s.name, kind: 'interior', width: s.w, height: s.h, danger: 'protected', base: size === 'estudio' ? 'wood' : size === 'piso' ? 'tile' : 'wood',
      wallColor: { estudio: '#3a3550', piso: '#2f4a5a', loft: '#4a3a2a', atico: '#2a2a3e', villa: '#3a4a3a' }[size], blocks: [], props,
      doors: [{ id: `salida-casa-${size}`, name: 'Salir a la calle', at: s.exit, to: { zone: 'ferro', at: [47, 44] }, danger: 'public' }],
      objects: [
        { id: `cama-casa-${size}`, name: 'Tu cama', at: [3, 2], kind: 'bed', sleep: { quality: 1, price: 0 } },
        { id: `alijo-casa-${size}`, name: 'Alijo', at: [s.w - 3, 2], kind: 'stash' },
      ],
      waypoints: [[s.exit[0] - 2, s.exit[1]]], safePoint: [s.exit[0] - 2, s.exit[1]],
    };
  });
}

/** Coloca portales de viviendas en los edificios sin puerta y genera cientos de casas. Trabaja sobre zonas ya ensanchadas. */
export function placeHousing(zones) {
  const houses = [];
  for (const z of zones) {
    const d = DIST[z.id];
    if (!d || z.kind !== 'exterior') continue;
    const busy = new Set([...z.doors.map((x) => `${x.at[0]},${x.at[1]}`), ...z.objects.map((x) => `${x.at[0]},${x.at[1]}`), ...z.props.map((x) => `${x.at[0]},${x.at[1]}`)]);
    const inRect = (x, y, [rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;
    const free = (x, y) => x > 0 && y > 0 && x < z.width - 1 && y < z.height - 1 && !busy.has(`${x},${y}`)
      && !z.buildings.some((b) => inRect(x, y, b.rect)) && !z.blocks.some((b) => inRect(x, y, b.rect))
      && !z.ground.some((g) => g.type === 'water' && inRect(x, y, g.rect));
    const doorFront = new Set(z.doors.flatMap((x) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => `${x.at[0] + dx},${x.at[1] + dy}`))));
    let bi = 0;
    for (const b of z.buildings) {
      const [bx, by, bw, bh] = b.rect;
      // ¿Ya tiene puerta este edificio? (una puerta pegada a su fachada)
      const hasDoor = z.doors.some((x) => x.at[0] >= bx - 1 && x.at[0] <= bx + bw && x.at[1] >= by - 1 && x.at[1] <= by + bh);
      if (hasDoor || bw < 3 || bh < 3) continue;
      const cands = [[bx + Math.floor(bw / 2), by + bh], [bx + Math.floor(bw / 2) - 1, by + bh], [bx + bw, by + Math.floor(bh / 2)], [bx - 1, by + Math.floor(bh / 2)], [bx + Math.floor(bw / 2), by - 1]];
      const at = cands.find(([x, y]) => free(x, y) && !doorFront.has(`${x},${y}`));
      if (!at) continue;
      bi++;
      const objId = `${z.id}-portal-${bi}`;
      const bname = b.name ?? (b.sign ? `Edificio ${b.sign}` : `Bloque ${bi}`);
      z.objects.push({ id: objId, name: `Portal · ${bname}`, at, kind: 'housing' });
      busy.add(`${at[0]},${at[1]}`);
      const floors = Math.max(1, Math.min(8, Math.round(b.height / 3)));
      const isVilla = d.sizes[0] === 'villa' && b.height < 12;
      const n = isVilla ? 1 : floors;
      for (let f = 0; f < n; f++) {
        const size = isVilla ? 'villa' : d.sizes[(bi + f) % d.sizes.length];
        const s = HOUSE_SIZES[size];
        const letter = 'ABCD'[(bi + f) % 4];
        const price = Math.round((s.base * d.mult * (1 + f * 0.03)) / 100) * 100;
        houses.push({ id: `${objId}-${f + 1}`, name: isVilla ? `${s.name} ${bname.replace(/^Bloque /, 'nº ')}` : `${s.name} ${f + 1}º${letter} · ${bname}`, building: objId, zone: z.id, size, template: `casa-${size}`, price, floor: f + 1 });
      }
    }
  }
  return houses;
}
