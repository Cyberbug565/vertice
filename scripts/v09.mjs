// v0.9 · 100 prendas nuevas (tejidos, detalles y mejoras), 100 implantes nuevos repartidos por todo el cuerpo (con ranuras dobles
// para ojos, oídos, brazos, manos, dedos y piernas) y las matrices de flujo que ahorran RAM. Todo original.

// ---------------------------------------------------------------- ropa
// [id, nombre, estilo, color, tejido, detalle, rareza, precio, mejoras, descripción, extra]
// mejoras: s (habilidades), carry, speed, needs, dodge, hpMax, aim, ramPlus, ramSave · extra: armor, accent, perk
const CABEZA = [
  ['gorro-punto-ceniza', 'Gorro de punto «Ceniza»', 'gorro', '#3a3a44', 'punto', '', 'comun', 30, {}, 'Lana sintética gruesa. Abriga y no llama la atención.'],
  ['gorro-led-pulso', 'Gorro «Pulso» con LED', 'gorro', '#14141e', 'punto', '', 'poco-comun', 140, { s: { actuacion: 1 } }, 'Una franja de luz late al ritmo de la música más cercana.'],
  ['boina-distrito', 'Boina de distrito', 'boina', '#5a2a3a', 'liso', '', 'comun', 45, { s: { negociacion: 1 } }, 'La llevan los viejos del mercado. Te tratan como a uno de ellos.'],
  ['casco-moto-relampago', 'Casco de moto «Relámpago»', 'casco-moto', '#d82020', 'liso', '', 'raro', 680, { s: { conduccion: 2 } }, 'Integral con visor ahumado y HUD de velocidad.', { armor: 2 }],
  ['casco-moto-sombra', 'Casco de moto «Sombra»', 'casco-moto', '#101014', 'carbono', '', 'epico', 2400, { s: { conduccion: 2, sigilo: 1 } }, 'Fibra de carbono mate. No refleja ni las farolas.', { armor: 3 }],
  ['diadema-led-coral', 'Diadema LED «Coral»', 'diadema-led', '#ff6aa8', 'liso', '', 'comun', 60, { s: { actuacion: 1 } }, 'Cuatro diodos que cambian de color.'],
  ['diadema-sinapsis', 'Diadema «Sinapsis»', 'diadema-led', '#43f3ff', 'liso', '', 'epico', 3800, { ramPlus: 2, s: { interfaz: 1 } }, 'Amplificador de señal para netrunners: +2 de RAM.'],
  ['casco-asalto-k9', 'Casco de asalto K-9', 'casco', '#3a4030', 'tactico', '', 'raro', 1200, { s: { percepcion: 1 } }, 'Casco militar con visor balístico.', { armor: 4 }],
  ['sombrero-alas-noche', 'Sombrero «Alas de noche»', 'sombrero', '#1a1a20', 'seda', '', 'poco-comun', 220, { s: { intimidacion: 1 } }, 'Ala ancha y cinta de seda. Para los tratos en sombra.'],
  ['bandana-ruido', 'Bandana «Ruido»', 'bandana', '#2a6ab8', 'cuadros', '', 'comun', 25, {}, 'Estampado de cuadros, gastada por el sol del Yermo.'],
  ['capucha-camaleonica', 'Capucha camaleónica', 'capucha', '#2a3a3a', 'holografico', '', 'legendario', 9500, { s: { sigilo: 3 } }, 'Tejido que copia el color de lo que tiene detrás.', { perk: 'anticamaras' }],
  ['gorra-ruta-38', 'Gorra «Ruta 38»', 'gorra', '#ffb020', 'lona', '', 'comun', 35, { s: { conduccion: 1 } }, 'Gorra de camionero nómada.'],
];
const CARA = [
  ['gafas-sol-espejo', 'Gafas de sol espejo', 'gafas-sol', '#101010', 'liso', '', 'comun', 55, { s: { intimidacion: 1 } }, 'Nadie sabe adónde miras.'],
  ['gafas-sol-ambar', 'Gafas de sol «Ámbar»', 'gafas-sol', '#d89020', 'liso', '', 'poco-comun', 180, { aim: 1 }, 'Cristal tintado que realza el contraste: +1 de puntería.'],
  ['monoculo-tasador', 'Monóculo del tasador', 'monoculo', '#ffd23f', 'liso', '', 'raro', 900, { s: { negociacion: 2, percepcion: 1 } }, 'Lee etiquetas, precios y mentiras.'],
  ['monoculo-balistico', 'Monóculo balístico', 'monoculo', '#ff3040', 'liso', '', 'epico', 4200, { aim: 2, s: { armas: 1 } }, 'Calcula la caída de la bala en tiempo real.'],
  ['visor-tactico-lince', 'Visor táctico «Lince»', 'visor-tactico', '#43f3ff', 'liso', '', 'raro', 1500, { s: { percepcion: 2 } }, 'Cuatro lentes de visión nocturna.', { armor: 1 }],
  ['visor-tactico-halcon', 'Visor táctico «Rapaz»', 'visor-tactico', '#ffb020', 'liso', '', 'legendario', 11000, { aim: 3, s: { percepcion: 2 } }, 'Óptica militar con marcado de objetivos: +3 de puntería.', { armor: 1 }],
  ['mascara-gas-filtro', 'Máscara de gas con filtro', 'mascara-gas', '#2a2a30', 'liso', '', 'poco-comun', 260, { needs: 0.03 }, 'El aire de la ciudad, por fin respirable.', { perk: 'filtro' }],
  ['mascara-gas-plaga', 'Máscara «Plaga»', 'mascara-gas', '#4a5a3a', 'tactico', '', 'raro', 1100, { s: { intimidacion: 2 } }, 'Filtro doble y aspecto de pesadilla.', { perk: 'filtro' }],
  ['bandana-cara-roja', 'Bandana de cara roja', 'bandana-cara', '#a01010', 'cuadros', '', 'comun', 30, { s: { sigilo: 1 } }, 'Tapa la cara de nariz para abajo.'],
  ['bandana-cara-forajido', 'Bandana del forajido', 'bandana-cara', '#1a1a1a', 'cuadros', '', 'poco-comun', 120, { s: { sigilo: 1, intimidacion: 1 } }, 'Las cámaras odian esta bandana.', { perk: 'anticamaras' }],
  ['mascara-demonio-carmesi', 'Máscara de demonio carmesí', 'mascara-demonio', '#b01020', 'liso', '', 'epico', 3600, { s: { intimidacion: 3 } }, 'Cuernos, colmillos y una sonrisa de laca roja.'],
  ['mascara-demonio-hueso', 'Máscara «Hueso»', 'mascara-demonio', '#e8e0d0', 'liso', '', 'legendario', 8800, { s: { intimidacion: 3, sigilo: 2 } }, 'Laca blanca y ojos negros. Dicen que trae suerte en los tiroteos.', { perk: 'anticamaras' }],
];
const TORSO_EXT = [
  ['bomber-orbita', 'Bomber «Órbita»', 'bomber', '#2a3a5a', 'seda', '', 'comun', 160, {}, 'Bomber de satén con puños de punto.', { accent: '#ff6a20' }],
  ['bomber-escuadron', 'Bomber de escuadrón', 'bomber', '#3a4a2a', 'lona', 'parches', 'poco-comun', 420, { s: { atletismo: 1 } }, 'Con los parches de una unidad que ya no existe.', { accent: '#ffb020' }],
  ['bomber-neon-rosa', 'Bomber de neón rosa', 'bomber', '#ff3fa4', 'neon', 'led', 'raro', 1300, { s: { actuacion: 2 } }, 'Brilla en la oscuridad. Imposible pasar desapercibida.', { accent: '#43f3ff' }],
  ['biker-tachuelas', 'Cazadora motera con tachuelas', 'biker', '#14141a', 'cuero', 'tachuelas', 'poco-comun', 520, { s: { intimidacion: 1 } }, 'Cuero grueso, cremallera cruzada y tachuelas en los hombros.', { armor: 1 }],
  ['biker-ruta-roja', 'Cazadora «Ruta roja»', 'biker', '#6a1010', 'cuero', 'cremallera', 'raro', 1600, { s: { conduccion: 2 } }, 'La cazadora de una banda de motoristas ya disuelta.', { armor: 2 }],
  ['biker-kevlar', 'Cazadora motera de kevlar', 'biker', '#2a2a30', 'kevlar', 'cremallera', 'epico', 4800, { s: { conduccion: 1 }, dodge: 0.03 }, 'Parece cuero; para balas de pequeño calibre.', { armor: 4 }],
  ['abrigo-sastre-noir', 'Abrigo largo «Noir»', 'abrigo', '#1a1a22', 'liso', '', 'raro', 1900, { s: { intimidacion: 1, negociacion: 1 } }, 'Lana fría y corte impecable hasta los tobillos.', { armor: 1 }],
  ['abrigo-acolchado-norte', 'Abrigo acolchado «Norte»', 'abrigo', '#2a4a6a', 'acolchado', 'cuello-pelo', 'poco-comun', 380, { needs: 0.05 }, 'Plumón sintético y cuello de pelo. Abriga en las noches de lluvia ácida.'],
  ['abrigo-blindado-ejecutivo', 'Abrigo blindado ejecutivo', 'abrigo', '#2a2a34', 'kevlar', '', 'legendario', 14000, { s: { negociacion: 2 }, hpMax: 15 }, 'Paño de lana sobre tejido balístico de grado militar.', { armor: 6 }],
  ['blazer-corporativo', 'Americana corporativa', 'blazer', '#2a2a3a', 'liso', '', 'poco-comun', 480, { s: { negociacion: 2 } }, 'El uniforme de las plantas altas.', { accent: '#43f3ff' }],
  ['blazer-terciopelo', 'Americana de pana «Viejo cine»', 'blazer', '#5a2a1a', 'pana', '', 'raro', 1100, { s: { actuacion: 2, negociacion: 1 } }, 'Pana marrón y solapa ancha, como en las películas antiguas.', { accent: '#d8b040' }],
  ['blazer-holo', 'Americana holográfica', 'blazer', '#8a6aff', 'holografico', '', 'epico', 5200, { s: { actuacion: 3, negociacion: 1 } }, 'Cambia de color con cada paso. Para las fiestas de las azoteas.'],
  ['haori-tormenta', 'Haori urbano «Tormenta»', 'haori', '#1a2a4a', 'seda', '', 'raro', 1400, { s: { filo: 1 } }, 'Manga ancha, seda pesada y un forro con relámpagos.', { accent: '#43f3ff' }],
  ['haori-grulla', 'Haori «Grulla blanca»', 'haori', '#e8e4dc', 'seda', '', 'epico', 4400, { s: { filo: 2 }, dodge: 0.04 }, 'Tan ligero que parece que flotas.', { accent: '#d02020' }],
  ['poncho-yermo', 'Poncho del Yermo', 'poncho', '#8a5a2a', 'lona', '', 'comun', 110, { needs: 0.04, carry: 2 }, 'Lona encerada contra el polvo y la lluvia.'],
  ['poncho-camuflaje', 'Poncho de camuflaje', 'poncho', '#4a5a3a', 'camuflaje', '', 'poco-comun', 340, { s: { sigilo: 2 } }, 'Desaparece entre la chatarra.'],
  ['armadura-ligera-patrulla', 'Armadura ligera de patrulla', 'armadura', '#2a3a4a', 'tactico', 'placas', 'raro', 2600, { speed: -0.03 }, 'Placas de cerámica sobre tejido táctico.', { armor: 5 }],
  ['armadura-ligera-ronin', 'Armadura «Rōnin»', 'armadura', '#3a1a1a', 'kevlar', 'placas', 'epico', 7800, { s: { filo: 1 }, hpMax: 10 }, 'Placas lacadas en rojo oscuro, inspiradas en armaduras antiguas.', { armor: 6 }],
  ['armadura-centurion', 'Armadura «Centurión»', 'armadura', '#c8ccd8', 'carbono', 'placas', 'legendario', 18000, { hpMax: 20, s: { intimidacion: 2 } }, 'Blindaje corporal completo de una unidad de élite privada.', { armor: 8 }],
  ['cortavientos-rayo', 'Cortavientos «Rayo»', 'cortavientos', '#ffd23f', 'liso', 'reflectante', 'comun', 90, { speed: 0.02 }, 'Ligero y de colores chillones.', { accent: '#2a2a30' }],
  ['cortavientos-maraton', 'Cortavientos de maratón', 'cortavientos', '#43f3ff', 'malla', 'reflectante', 'poco-comun', 300, { speed: 0.04, s: { atletismo: 1 } }, 'Transpirable y aerodinámico: corres más.', { accent: '#ff3fa4' }],
  ['chubasquero-acido', 'Chubasquero antiácido', 'chubasquero', '#7aff5a', 'liso', '', 'comun', 75, { needs: 0.03 }, 'Plástico verde ácido contra la lluvia corrosiva.'],
  ['chubasquero-transparente', 'Chubasquero transparente', 'chubasquero', '#a8c8e8', 'seda', 'led', 'raro', 980, { s: { actuacion: 1 } }, 'Vinilo translúcido con un cordón de luz en el dobladillo.'],
  ['gabardina-detective', 'Gabardina de detective', 'gabardina', '#8a7a5a', 'lona', 'cinturon', 'poco-comun', 460, { s: { investigacion: 2 } }, 'Bolsillos profundos para libretas, grabadoras y secretos.'],
  ['gabardina-serpiente', 'Gabardina de piel de serpiente', 'gabardina', '#4a6a2a', 'serpiente', '', 'epico', 5600, { s: { intimidacion: 2, negociacion: 1 } }, 'Escamas sintéticas que cambian de tono con la luz.', { armor: 2 }],
  ['chaqueta-carbono-fantasma', 'Chaqueta «Fantasma» de carbono', 'chaqueta', '#1a1a1e', 'carbono', 'led', 'legendario', 16000, { dodge: 0.08, s: { sigilo: 2 } }, 'Ultraligera. Cuando corres, apenas pesa: +8 % de esquiva.', { armor: 3, perk: 'reflejos' }],
];
const TORSO_INT = [
  ['camiseta-logo-pixel', 'Camiseta «Píxel»', 'camiseta', '#2a2a3a', 'pixel', '', 'comun', 25, {}, 'Un logotipo de videojuego antiguo, hecho de cuadraditos.'],
  ['camiseta-banda-ruido', 'Camiseta de la banda «Ruido Blanco»', 'camiseta', '#101010', 'liso', '', 'comun', 30, { s: { actuacion: 1 } }, 'Gira de despedida. Otra vez.'],
  ['camiseta-tigre', 'Camiseta de tigre', 'camiseta', '#ff9a20', 'tigre', '', 'poco-comun', 90, { s: { intimidacion: 1 } }, 'Rayas negras sobre naranja.'],
  ['camiseta-reflectante', 'Camiseta reflectante de obra', 'camiseta', '#ff7a10', 'lona', 'reflectante', 'comun', 35, { carry: 1 }, 'Te ven a kilómetros. A veces eso es bueno.'],
  ['tirantes-malla', 'Camiseta de tirantes de malla', 'tirantes', '#101014', 'malla', '', 'comun', 30, { s: { atletismo: 1 } }, 'Para lucir cromo y tatuajes.'],
  ['tirantes-camuflaje', 'Tirantes de camuflaje urbano', 'tirantes', '#5a5e66', 'camuflaje-urbano', '', 'poco-comun', 70, { s: { sigilo: 1 } }, 'Gris, negro y hormigón.'],
  ['tirantes-kevlar', 'Tirantes de kevlar', 'tirantes', '#2a2a30', 'kevlar', '', 'raro', 900, {}, 'Tejido balístico fino bajo la ropa.', { armor: 2 }],
  ['camisa-cuadros-lenador', 'Camisa de cuadros', 'camisa', '#a02020', 'cuadros', '', 'comun', 45, {}, 'Franela gruesa de cuadros rojos y negros.', { accent: '#101010' }],
  ['camisa-seda-flores', 'Camisa de seda estampada', 'camisa', '#2a8a8a', 'seda', '', 'poco-comun', 160, { s: { negociacion: 1 } }, 'Flores tropicales que nunca has visto en la ciudad.'],
  ['camisa-blanca-oficina', 'Camisa blanca de oficina', 'camisa', '#e8eaf0', 'liso', '', 'comun', 40, { s: { negociacion: 1 } }, 'Planchada. Algo es algo.'],
  ['camisa-lentejuelas', 'Camisa de lentejuelas', 'camisa', '#c8c8d8', 'lentejuelas', '', 'raro', 780, { s: { actuacion: 3 } }, 'Para que los focos te encuentren.'],
  ['top-holo-iris', 'Top holográfico «Iris»', 'top', '#c774e8', 'holografico', '', 'raro', 860, { s: { actuacion: 2 } }, 'Arcoíris líquido.'],
  ['top-circuito', 'Top de circuitos', 'top', '#0a1a1a', 'circuito', '', 'epico', 2800, { ramPlus: 1, s: { interfaz: 1 } }, 'Pistas conductoras bordadas que hacen de antena para tu deck: +1 de RAM.'],
  ['arnes-cuero-negro', 'Arnés de cuero negro', 'arnes', '#14141a', 'cuero', '', 'poco-comun', 150, { s: { intimidacion: 1 } }, 'Correas y hebillas sobre la piel desnuda.'],
  ['arnes-tactico', 'Arnés táctico', 'arnes', '#3a4030', 'tactico', '', 'raro', 650, { carry: 4 }, 'Anillas y correas para colgar lo que haga falta: +4 kg de carga.'],
  ['sudadera-glitch', 'Sudadera «Glitch»', 'sudadera', '#1a1a2a', 'pixel', 'led', 'raro', 720, { s: { interfaz: 1 } }, 'El estampado parpadea como una pantalla rota.'],
  ['sudadera-punto-gruesa', 'Sudadera de punto gruesa', 'sudadera', '#6a5a4a', 'punto', '', 'comun', 60, { needs: 0.02 }, 'Calentita y con bolsillo canguro.'],
  ['mono-mecanico-pana', 'Mono de mecánico', 'mono', '#2a4a6a', 'lona', 'parches', 'poco-comun', 190, { s: { reparacion: 2 }, carry: 2 }, 'Bolsillos para cada herramienta.'],
];
const PIERNAS = [
  ['vaquero-gastado', 'Vaquero gastado', 'pantalon', '#3a5a8a', 'vaquero', '', 'comun', 50, {}, 'Desteñido de verdad, no de fábrica.'],
  ['vaquero-negro-pitillo', 'Vaquero negro pitillo', 'leggins', '#14141a', 'vaquero', '', 'comun', 60, { s: { atletismo: 1 } }, 'Ajustado y elástico.'],
  ['cargo-urbano', 'Pantalón cargo urbano', 'cargo', '#4a4a3a', 'lona', '', 'comun', 70, { carry: 2 }, 'Seis bolsillos: +2 kg de carga.'],
  ['cargo-camuflaje', 'Cargo de camuflaje', 'cargo', '#4a5a3a', 'camuflaje', '', 'poco-comun', 160, { carry: 3, s: { sigilo: 1 } }, 'Bolsillos y manchas verdes.'],
  ['cargo-tactico-urbano', 'Cargo de camuflaje urbano', 'cargo', '#5a5e66', 'camuflaje-urbano', '', 'poco-comun', 180, { carry: 3, s: { sigilo: 1 } }, 'Gris hormigón para la jungla de cemento.'],
  ['tactico-rodilleras', 'Pantalón táctico con rodilleras', 'tactico', '#2a2a30', 'tactico', '', 'raro', 900, { dodge: 0.03 }, 'Rodilleras para arrodillarse tras cobertura sin pensarlo.', { armor: 2 }],
  ['tactico-kevlar', 'Pantalón táctico de kevlar', 'tactico', '#1a1a1e', 'kevlar', '', 'epico', 3400, { dodge: 0.04 }, 'Blindado y flexible.', { armor: 3 }],
  ['leggins-holo', 'Leggins holográficos', 'leggins', '#ad8cff', 'holografico', '', 'raro', 640, { s: { actuacion: 1, atletismo: 1 } }, 'Brillan como la gasolina en un charco.'],
  ['leggins-carrera', 'Mallas de carrera', 'leggins', '#101014', 'malla', '', 'poco-comun', 220, { speed: 0.04 }, 'Compresión muscular: corres un 4 % más rápido.'],
  ['pana-marron', 'Pantalón de pana', 'pantalon', '#6a4a2a', 'pana', '', 'comun', 55, {}, 'Como los del abuelo, pero con los bajos remangados.'],
  ['pantalon-cuero', 'Pantalón de cuero', 'pantalon', '#101014', 'cuero', '', 'raro', 980, { s: { intimidacion: 1 } }, 'Cruje al andar.', { armor: 1 }],
  ['pantalon-serpiente', 'Pantalón de serpiente', 'pantalon', '#6a8a2a', 'serpiente', '', 'epico', 2600, { s: { actuacion: 2 } }, 'Escamas verdes que brillan con el neón.'],
  ['bermudas-cuadros', 'Bermudas de cuadros', 'bermudas', '#2a6a4a', 'cuadros', '', 'comun', 35, {}, 'Para los días de calor pegajoso.', { accent: '#e8e4dc' }],
  ['bermudas-cargo', 'Bermudas cargo', 'bermudas', '#8a7a5a', 'lona', '', 'comun', 45, { carry: 1 }, 'Cortas y llenas de bolsillos.'],
  ['shorts-vaquero', 'Shorts vaqueros rotos', 'shorts', '#4a6a9a', 'vaquero', '', 'comun', 40, {}, 'Bajo deshilachado y medias de rejilla debajo.'],
  ['falda-larga-seda', 'Falda larga de seda', 'falda-larga', '#5a1a3a', 'seda', '', 'poco-comun', 260, { s: { actuacion: 1 } }, 'Se mueve como el humo.'],
  ['falda-tartan', 'Falda de tartán', 'falda', '#1a3a2a', 'cuadros', '', 'comun', 60, {}, 'Cuadros verdes y una cadena en la cintura.', { accent: '#d02020' }],
  ['pantalon-exo-sprinter', 'Pantalón «Esprínter» con exomúsculo', 'tactico', '#2a3a4a', 'carbono', '', 'legendario', 15000, { speed: 0.1, s: { atletismo: 3 }, dodge: 0.05 }, 'Fibras musculares artificiales cosidas al tejido: +10 % de velocidad.', { armor: 2, perk: 'reflejos' }],
];
const PIES = [
  ['zapatillas-blancas', 'Zapatillas blancas', 'zapatillas', '#e8eaf0', 'liso', '', 'comun', 60, { speed: 0.01 }, 'Impolutas. Por poco tiempo.'],
  ['zapatillas-neon', 'Zapatillas de neón', 'zapatillas', '#2a2a3a', 'liso', '', 'poco-comun', 180, { speed: 0.02, s: { atletismo: 1 } }, 'Suela de gel y cordones luminosos.'],
  ['zapatillas-cohete', 'Zapatillas «Cohete»', 'zapatillas', '#ff3040', 'malla', '', 'raro', 1200, { speed: 0.05 }, 'Placa de carbono en la suela: +5 % de velocidad.'],
  ['botas-faena', 'Botas de faena', 'botas', '#6a4a2a', 'cuero', '', 'comun', 80, { carry: 1 }, 'Puntera de acero.'],
  ['botas-altas-cordones', 'Botas altas de cordones', 'botas-altas', '#101014', 'cuero', '', 'poco-comun', 240, { s: { intimidacion: 1 } }, 'Veinte agujeros de cordón y una suela que suena a amenaza.'],
  ['botas-altas-vinilo', 'Botas altas de vinilo', 'botas-altas', '#b01060', 'seda', '', 'raro', 860, { s: { actuacion: 2 } }, 'Brillantes como un coche recién pintado.'],
  ['botas-tacticas-delta', 'Botas tácticas «Delta»', 'botas-tacticas', '#2a2a24', 'tactico', '', 'raro', 1100, { dodge: 0.02, s: { sigilo: 1 } }, 'Suela silenciosa y tobillera reforzada.', { armor: 1 }],
  ['botas-tacticas-magneticas', 'Botas tácticas magnéticas', 'botas-tacticas', '#3a3e48', 'carbono', '', 'epico', 3900, { dodge: 0.04, s: { atletismo: 2 } }, 'Agarre perfecto en cualquier superficie metálica.', { armor: 1 }],
  ['tacones-aguja-cromo', 'Tacones de aguja cromados', 'tacones', '#c8ccd8', 'liso', '', 'raro', 950, { s: { actuacion: 2, negociacion: 1 } }, 'Tacón de acero de doce centímetros.'],
  ['tacones-rojos', 'Tacones rojos', 'tacones', '#c01020', 'seda', '', 'poco-comun', 260, { s: { actuacion: 1 } }, 'Clásicos. Peligrosos.'],
  ['mocasines-ejecutivos', 'Mocasines ejecutivos', 'mocasines', '#3a2010', 'cuero', '', 'poco-comun', 320, { s: { negociacion: 2 } }, 'Piel auténtica (eso dicen).'],
  ['plataformas-punk', 'Plataformas punk', 'plataformas', '#14141a', 'cuero', '', 'poco-comun', 280, { s: { intimidacion: 1, actuacion: 1 } }, 'Seis centímetros de suela y hebillas por todas partes.'],
  ['plataformas-holo', 'Plataformas holográficas', 'plataformas', '#94d0ff', 'holografico', '', 'epico', 2900, { s: { actuacion: 3 } }, 'La suela proyecta un pequeño arcoíris en el suelo.'],
  ['botas-sigilo-pluma', 'Botas «Pluma»', 'botas', '#2a2a30', 'malla', '', 'legendario', 12500, { s: { sigilo: 3 }, dodge: 0.05, speed: 0.03 }, 'Suela de espuma inteligente: no hacen ningún ruido.', { perk: 'pasos-silenciosos' }],
];
const SLOTS = [['cabeza', CABEZA], ['cara', CARA], ['torso_ext', TORSO_EXT], ['torso_int', TORSO_INT], ['piernas', PIERNAS], ['pies', PIES]];

export function clothesV09() {
  const out = [];
  for (const [slot, list] of SLOTS) for (const [id, name, style, color, pattern, detail, rarity, price, m, desc, extra = {}] of list) {
    const mods = { skills: m.s ?? {}, carry: m.carry ?? 0, speed: m.speed ?? 0, needs: m.needs ?? 0, dodge: m.dodge ?? 0, hpMax: m.hpMax ?? 0, aim: m.aim ?? 0, ramPlus: m.ramPlus ?? 0, ramSave: m.ramSave ?? 0 };
    const wear = { slot, style, color, pattern, ...(detail ? { detail } : {}), ...(extra.accent ? { accent: extra.accent } : {}), mods, ...(extra.perk ? { perk: extra.perk } : {}) };
    out.push({ id, name, desc: desc + (extra.perk ? ` ${PERK_TXT[extra.perk]}` : ''), weight: slot === 'torso_ext' ? 1.2 : slot === 'pies' ? 0.8 : 0.4, price, category: 'ropa', rarity, ...(extra.armor ? { armor: extra.armor } : {}), wear });
  }
  return out;
}
export const PERK_TXT = {
  anticamaras: 'Capacidad: las cámaras no consiguen identificarte la mitad de las veces.',
  filtro: 'Capacidad: inmune a gases y humos, y los bajones de las drogas duran la mitad.',
  reflejos: 'Capacidad: rodar para esquivar cuesta la mitad de aguante.',
  'pasos-silenciosos': 'Capacidad: los PNJ tardan más en darse cuenta de que te acercas.',
};

// ---------------------------------------------------------------- ciberware
// Ranuras dobles: dos ojos, dos oídos, dos brazos, dos manos, cuatro dedos (dos por mano) y dos piernas.
// [id, nombre, ranura, región, grado, capacidad, humanidad, precio, fabricante, rareza, efectos, descripción, extra]
// extra: ability {kind,name,cooldown,duration,power}, passive, visible
const C = [
  // --- ojos (2 ranuras)
  ['ojo-lince', 'Ojo «Lince»', 'ojos', 'ojos', 1, 2, 1, 900, 'aurora', 'comun', { skills: { percepcion: 1 } }, 'Zoom óptico ×4 y balance de blancos nocturno.'],
  ['ojo-contraste', 'Ojo de contraste alto', 'ojos', 'ojos', 1, 2, 1, 1100, 'teselia', 'comun', { skills: { percepcion: 1, armas: 1 } }, 'Resalta siluetas sobre el fondo.'],
  ['ojo-cazador-termico', 'Ojo «Cazador térmico»', 'ojos', 'ojos', 2, 3, 2, 3800, 'halcon', 'raro', { skills: { percepcion: 2 } }, 'Visión térmica: marca a los hostiles cercanos aunque estén tras una pared.', { passive: 'vision-termica', visible: 'ojos' }],
  ['ojo-nocturno', 'Ojo nocturno', 'ojos', 'ojos', 1, 2, 1, 1400, 'chatarreros', 'poco-comun', { skills: { percepcion: 2 } }, 'Intensificador de luz: los callejones oscuros ya no lo son tanto.'],
  ['ojo-tasador', 'Ojo del tasador', 'ojos', 'ojos', 2, 2, 2, 3200, 'aurora', 'raro', { skills: { negociacion: 2, investigacion: 1 } }, 'Reconoce marcas, falsificaciones y precios de mercado.'],
  ['ojo-predictivo', 'Ojo predictivo «Augur»', 'ojos', 'ojos', 3, 4, 3, 9500, 'teselia', 'epico', { dodge: 0.12 }, 'Lee la tensión muscular de quien te ataca medio segundo antes: +12 % de esquiva.', { visible: 'ojos' }],
  ['ojo-microscopio', 'Ojo microscópico', 'ojos', 'ojos', 3, 3, 3, 8200, 'okami', 'epico', { skills: { medicina: 2, reparacion: 2 } }, 'Ampliación ×400: suturas y soldaduras perfectas.'],
  ['ojo-absoluto', 'Ojo «Absoluto»', 'ojos', 'ojos', 4, 6, 6, 42000, 'halcon', 'legendario', { skills: { armas: 2 } }, 'Coprocesador balístico de uso militar: el 90 % de tus disparos acierta aunque estés fuera de tu alcance seguro.', { passive: 'ojo-absoluto', visible: 'ojos' }],
  ['ojo-espectral', 'Ojo espectral', 'ojos', 'ojos', 4, 5, 5, 36000, 'aurora', 'legendario', { skills: { percepcion: 3, sigilo: 1 } }, 'Ve en el espectro de las cámaras: sabes cuándo te graban y cuándo no.', { passive: 'vision-termica', visible: 'ojos' }],
  // --- oídos (2)
  ['oido-filtro-ruido', 'Oído con filtro de ruido', 'oidos', 'cara', 1, 1, 0, 600, 'chatarreros', 'comun', { skills: { percepcion: 1 }, needs: { hunger: 1, thirst: 1, fatigue: 0.95 } }, 'Silencia el tráfico: duermes y piensas mejor.'],
  ['oido-afinado', 'Oído afinado', 'oidos', 'cara', 1, 1, 1, 700, 'engranajes', 'comun', { skills: { percepcion: 1 } }, 'Amplifica los sonidos débiles.'],
  ['oido-traductor-callejero', 'Oído traductor callejero', 'oidos', 'cara', 2, 2, 1, 2400, 'aurora', 'raro', { skills: { negociacion: 1, actuacion: 1 } }, 'Traduce jergas de banda en tiempo real.'],
  ['oido-sonar', 'Oído sónar «Murciélago»', 'oidos', 'cara', 3, 3, 3, 7600, 'teselia', 'epico', { skills: { percepcion: 3 }, dodge: 0.04 }, 'Ecolocalización: oyes los pasos de quien te flanquea.'],
  ['oido-escucha-remota', 'Oído de escucha remota', 'oidos', 'cara', 4, 4, 4, 28000, 'okami', 'legendario', { skills: { investigacion: 3, percepcion: 2 } }, 'Recoge conversaciones a cincuenta metros a través de los cristales.'],
  // --- brazos (2)
  ['brazo-refuerzo-hidraulico', 'Refuerzo hidráulico de brazo', 'brazo', 'brazos', 2, 4, 3, 4200, 'engranajes', 'raro', { meleeDmg: 0.12, carry: 5 }, 'Pistones en el codo: golpeas y cargas más.', { visible: 'brazo' }],
  ['brazo-estabilizador', 'Estabilizador de brazo', 'brazo', 'brazos', 2, 3, 2, 3600, 'halcon', 'raro', { skills: { armas: 2 } }, 'Giroscopios que anulan el temblor al apuntar.', { visible: 'brazo' }],
  ['brazo-torreta', 'Brazo «Torreta»', 'brazo', 'brazos', 3, 6, 5, 14000, 'halcon', 'epico', { skills: { armas: 2 } }, 'Gatillo neural y cargador en el antebrazo: −30 % de tiempo entre disparos.', { passive: 'gatillo-neural', visible: 'brazo' }],
  ['brazo-sismico', 'Brazo «Sísmico»', 'brazo', 'brazos', 4, 7, 6, 38000, 'engranajes', 'legendario', { meleeDmg: 0.3 }, 'Cada puñetazo lleva una onda de choque: empuja y aturde a quien golpeas.', { passive: 'puno-sismico', visible: 'brazo' }],
  ['brazo-desviador', 'Brazo «Desviador»', 'brazo', 'brazos', 4, 6, 5, 40000, 'okami', 'legendario', { skills: { filo: 2 } }, 'Servos ultrarrápidos: en guardia con un arma blanca desvías el 60 % de las balas.', { passive: 'desvio-balas', visible: 'brazo' }],
  ['brazo-cuchilla-gemela', 'Cuchilla gemela de antebrazo', 'brazo', 'brazos', 3, 5, 5, 12500, 'okami', 'epico', { meleeDmg: 0.15, skills: { filo: 1 } }, 'Una segunda hoja retráctil que se suma a la primera.', { visible: 'brazo' }],
  ['brazo-blindaje-placas', 'Blindaje de placas de brazo', 'brazo', 'brazos', 2, 3, 2, 3900, 'chatarreros', 'poco-comun', { armor: 1 }, 'Placas de acero soldadas a mano.', { visible: 'brazo' }],
  ['brazo-garfio', 'Brazo con garfio', 'brazo', 'brazos', 3, 4, 4, 9800, 'saqueadores', 'epico', { skills: { atletismo: 2 } }, 'Lanza un cable con garfio: te impulsa hacia tu objetivo.', { ability: { kind: 'carga', name: 'Garfio', cooldown: 14, power: 7 }, visible: 'brazo' }],
  // --- manos (2)
  ['mano-firme', 'Mano firme', 'manos', 'manos', 1, 2, 1, 1200, 'teselia', 'comun', { skills: { armas: 1 } }, 'Microestabilizadores en la muñeca.'],
  ['mano-quirurgica', 'Mano quirúrgica', 'manos', 'manos', 2, 2, 2, 3400, 'okami', 'raro', { skills: { medicina: 2 }, surgery: 0.02 }, 'Pulso de cirujano y bisturí láser retráctil.'],
  ['mano-carterista', 'Mano de carterista', 'manos', 'manos', 2, 2, 2, 3000, 'saqueadores', 'raro', { steal: 2, skills: { sigilo: 1 } }, 'Yemas sensibles y articulaciones silenciosas.'],
  ['mano-palma-iman', 'Palma magnética', 'manos', 'manos', 2, 3, 2, 2800, 'engranajes', 'poco-comun', { carry: 3, skills: { reparacion: 1 } }, 'Sujeta herramientas, armas y puertas de coche.'],
  ['mano-garra-escalada', 'Mano de escalada', 'manos', 'manos', 1, 2, 1, 1600, 'saqueadores', 'poco-comun', { skills: { atletismo: 2 } }, 'Microganchos en las yemas para trepar por cualquier fachada.'],
  ['mano-vampiro', 'Mano «Vampiro»', 'manos', 'manos', 4, 5, 6, 34000, 'okami', 'legendario', { meleeDmg: 0.1 }, 'Microagujas en los nudillos: recuperas salud con cada golpe que das (20 % del daño).', { passive: 'vampiro', visible: 'brazo' }],
  ['mano-guante-choque', 'Guante de choque', 'manos', 'manos', 3, 3, 3, 8800, 'teselia', 'epico', { meleeDmg: 0.08 }, 'Descarga eléctrica en cada golpe: aturde un instante.', { passive: 'puno-electrico' }],
  // --- dedos (4: dos por mano)
  ['dedo-ganzua', 'Dedo ganzúa', 'dedos', 'manos', 1, 1, 1, 800, 'saqueadores', 'comun', { steal: 1 }, 'La punta del índice se convierte en una ganzúa electrónica.'],
  ['dedo-linterna', 'Dedo linterna', 'dedos', 'manos', 1, 1, 0, 300, 'chatarreros', 'comun', { skills: { investigacion: 1 } }, 'Un LED en la yema. Útil en los callejones.'],
  ['dedo-conector', 'Dedo conector', 'dedos', 'manos', 1, 1, 1, 900, 'teselia', 'comun', { skills: { interfaz: 1 } }, 'Clavija de datos para enchufarte a cualquier terminal.'],
  ['dedo-pistola', 'Dedo pistola', 'dedos', 'manos', 2, 2, 2, 3800, 'saqueadores', 'raro', { skills: { armas: 1 } }, 'Una bala de 5 mm escondida en el meñique: +1 a disparar.'],
  ['dedo-veneno', 'Dedo inyector', 'dedos', 'manos', 2, 2, 3, 4200, 'okami', 'raro', { meleeDmg: 0.05, skills: { sigilo: 1 } }, 'Aguja retráctil con neurotoxina.'],
  ['dedo-gatillo-sinaptico', 'Dedo «Gatillo sináptico»', 'dedos', 'manos', 3, 2, 3, 9200, 'halcon', 'epico', {}, 'Conexión directa con el gatillo: −30 % de tiempo entre disparos.', { passive: 'gatillo-neural' }],
  ['dedo-chip-pago', 'Dedo con chip de pago', 'dedos', 'manos', 1, 1, 1, 1100, 'saqueadores', 'poco-comun', { steal: 1, skills: { negociacion: 1 } }, 'Un chip clonado de pago sin contacto. No preguntes de quién.'],
  ['dedo-memoria', 'Dedo de memoria', 'dedos', 'manos', 2, 1, 1, 2600, 'teselia', 'raro', { ramPlus: 1 }, 'Una tarjeta de memoria en la falange: +1 de RAM.'],
  ['dedo-filo-monomolecular', 'Uña monomolecular', 'dedos', 'manos', 3, 2, 3, 8600, 'okami', 'epico', { meleeDmg: 0.1, skills: { filo: 1 } }, 'Corta como un bisturí molecular.'],
  // --- piernas (2)
  ['pierna-muelle', 'Pierna de muelles', 'pierna', 'piernas', 2, 4, 3, 4400, 'engranajes', 'raro', { speed: 0.04, skills: { atletismo: 1 } }, 'Tendones de acero: corres y saltas más.', { visible: 'pierna' }],
  ['pierna-amortiguador', 'Amortiguador de rodilla', 'pierna', 'piernas', 1, 2, 1, 1400, 'chatarreros', 'comun', { dodge: 0.02 }, 'Para caer de dos pisos sin romperte nada.', { visible: 'pierna' }],
  ['pierna-salto-reforzado', 'Pierna de salto reforzado', 'pierna', 'piernas', 3, 5, 4, 11000, 'halcon', 'epico', { speed: 0.05, dodge: 0.05 }, 'Ruedas de esquiva mucho más largas y que cansan la mitad.', { passive: 'salto-reforzado', visible: 'pierna' }],
  ['pierna-esprinter', 'Pierna «Esprínter»', 'pierna', 'piernas', 3, 5, 4, 12500, 'aurora', 'epico', { speed: 0.08 }, 'Fibra de carbono y músculo artificial: +8 % de velocidad.', { visible: 'pierna' }],
  ['pierna-silenciosa', 'Pierna silenciosa', 'pierna', 'piernas', 2, 3, 2, 4600, 'okami', 'raro', { skills: { sigilo: 2 } }, 'Articulaciones lubricadas con gel: los PNJ tardan más en oírte llegar.', { passive: 'pasos-silenciosos', visible: 'pierna' }],
  ['pierna-ancla', 'Pierna «Ancla»', 'pierna', 'piernas', 2, 4, 3, 3900, 'engranajes', 'raro', { carry: 8, armor: 1 }, 'Pistones de carga pesada: nadie te tumba.', { visible: 'pierna' }],
  ['pierna-salto-felino', 'Pierna «Felina»', 'pierna', 'piernas', 4, 6, 5, 39000, 'okami', 'legendario', { speed: 0.1, dodge: 0.08 }, 'Aterrizas sin hacer ruido y te mueves como un gato.', { passive: 'salto-reforzado', visible: 'pierna' }],
  ['pierna-patada-piston', 'Pierna «Pistón»', 'pierna', 'piernas', 3, 4, 4, 9400, 'engranajes', 'epico', { meleeDmg: 0.08 }, 'Tus patadas lanzan a la gente tres metros.', { passive: 'patada-piston', visible: 'pierna' }],
  // --- corteza (3)
  ['cortex-calculo', 'Coprocesador de cálculo', 'cortex', 'corteza', 1, 2, 1, 1500, 'teselia', 'comun', { skills: { investigacion: 1, reparacion: 1 } }, 'Haces cuentas de cabeza más rápido que una calculadora.'],
  ['cortex-idiomas', 'Chip de idiomas', 'cortex', 'corteza', 1, 1, 1, 900, 'aurora', 'comun', { skills: { negociacion: 1 } }, 'Doce idiomas y treinta jergas callejeras.'],
  ['cortex-tactico', 'Córtex táctico', 'cortex', 'corteza', 2, 3, 3, 4600, 'halcon', 'raro', { skills: { armas: 1, cuerpo: 1 } }, 'Analiza coberturas y líneas de tiro.'],
  ['cortex-memoria-cuantica', 'Memoria cuántica', 'cortex', 'corteza', 3, 4, 3, 13500, 'teselia', 'epico', { ramPlus: 3, ramSave: 0.12 }, 'Comprime procesos: +3 de RAM y −12 % de gasto de RAM.'],
  ['cortex-ejecutor', 'Córtex «Ejecutor»', 'cortex', 'corteza', 4, 5, 6, 41000, 'halcon', 'legendario', { skills: { armas: 1, filo: 1 } }, 'Detecta el punto débil de quien está malherido: doble daño contra objetivos por debajo del 30 % de salud.', { passive: 'ejecutor' }],
  ['cortex-calma', 'Córtex «Calma»', 'cortex', 'corteza', 2, 2, 0, 3600, 'aurora', 'raro', { skills: { actuacion: 1 } }, 'Regula el cortisol: resistes mejor la ciberpsicosis.', { passive: 'calma' }],
  ['cortex-critico', 'Córtex de precisión quirúrgica', 'cortex', 'corteza', 3, 3, 3, 11000, 'okami', 'epico', { crit: 0.1 }, 'Encuentra arterias y articulaciones: +10 % de críticos.', { passive: 'critico' }],
  ['cortex-marcador', 'Córtex «Marcador»', 'cortex', 'corteza', 3, 4, 3, 12000, 'halcon', 'epico', { skills: { percepcion: 2 } }, 'Marca a todos los enemigos cercanos: se ven a través de las paredes y les aciertas mejor.', { ability: { kind: 'marcar', name: 'Marcar objetivos', cooldown: 40, duration: 15, power: 2 } }],
  // --- SO
  ['so-centinela-basico', 'SO «Centinela» básico', 'so', 'so', 1, 2, 1, 1600, 'teselia', 'comun', { skills: { percepcion: 1 } }, 'Avisa de amenazas en tu campo visual.'],
  ['so-guardian', 'SO «Guardián»', 'so', 'so', 3, 4, 4, 12000, 'okami', 'epico', { armor: 1 }, 'Levanta un escudo de energía que absorbe el próximo daño.', { ability: { kind: 'escudo', name: 'Escudo cinético', cooldown: 35, duration: 8, power: 40 } }],
  ['so-salto', 'SO «Salto»', 'so', 'so', 3, 4, 4, 11500, 'halcon', 'epico', { speed: 0.03 }, 'Sobrecarga las piernas para un salto de seis metros.', { ability: { kind: 'salto', name: 'Salto potenciado', cooldown: 12, power: 6 } }],
  ['so-tormenta', 'SO «Tormenta»', 'so', 'so', 4, 6, 6, 45000, 'teselia', 'legendario', { ramPlus: 2 }, 'Pulso electromagnético que aturde y daña a todos los que te rodean (doble contra cromados).', { ability: { kind: 'pulso', name: 'Tormenta', cooldown: 30, duration: 3, power: 30 } }],
  // --- esqueleto, columna y torso
  ['esqueleto-grafeno', 'Esqueleto de grafeno', 'esqueleto', 'esqueleto', 3, 5, 4, 13000, 'engranajes', 'epico', { hpMax: 25, armor: 1 }, 'Huesos recubiertos de grafeno: +25 de salud.'],
  ['esqueleto-ligero', 'Esqueleto aligerado', 'esqueleto', 'esqueleto', 2, 3, 2, 3800, 'aurora', 'raro', { speed: 0.03, dodge: 0.03 }, 'Huesos huecos de aleación: más ligero y rápido.'],
  ['blindaje-reactivo', 'Blindaje reactivo «Bastión»', 'esqueleto', 'esqueleto', 4, 6, 5, 39000, 'halcon', 'legendario', { armor: 2 }, 'Placas que se endurecen al impacto: el primer golpe cada 8 s se reduce un 80 %.', { passive: 'blindaje-reactivo', visible: 'torso' }],
  ['columna-flex', 'Columna flexible', 'columna', 'esqueleto', 2, 3, 2, 3200, 'aurora', 'raro', { skills: { atletismo: 2 } }, 'Vértebras de polímero: te contorsionas como un acróbata.'],
  ['columna-carga', 'Columna de carga', 'columna', 'esqueleto', 2, 3, 2, 3400, 'engranajes', 'poco-comun', { carry: 10 }, 'Soporte vertebral reforzado: +10 kg de carga.'],
  ['hombro-pivote', 'Hombro pivotante', 'hombros', 'brazos', 2, 3, 2, 2900, 'engranajes', 'poco-comun', { skills: { cuerpo: 1 } }, 'Rotación completa del hombro.'],
  ['hombro-lanzador', 'Hombro lanzador', 'hombros', 'brazos', 3, 5, 4, 10500, 'halcon', 'epico', { skills: { armas: 1 } }, 'Minilanzagranadas en la escápula: una carga explosiva a tu alrededor.', { ability: { kind: 'torbellino', name: 'Granada de hombro', cooldown: 25, power: 1 } }],
  // --- circulatorio, corazón y pulmones
  ['sangre-nanobots', 'Nanobots sanguíneos', 'circulatorio', 'circulatorio', 3, 3, 3, 10000, 'okami', 'epico', { regen: 1 }, 'Reparan los tejidos fuera de combate: +1 de salud por segundo.', { passive: 'nanorregenerador' }],
  ['sangre-coagulante', 'Coagulante sintético', 'circulatorio', 'circulatorio', 2, 2, 2, 3600, 'okami', 'raro', {}, 'Las hemorragias se cortan solas mucho antes.', { passive: 'coagulante' }],
  ['sangre-oxigeno', 'Sangre oxigenada', 'circulatorio', 'circulatorio', 2, 2, 2, 3200, 'aurora', 'raro', { skills: { atletismo: 1 } }, 'Más oxígeno en cada glóbulo: recuperas aguante el doble de rápido.', { passive: 'corazon-reactor' }],
  ['corazon-reactor', 'Corazón «Reactor»', 'corazon', 'circulatorio', 3, 4, 4, 12000, 'teselia', 'epico', { hpMax: 15 }, 'Bomba sanguínea doble: +15 de salud y aguante el doble de rápido.', { passive: 'corazon-reactor' }],
  ['corazon-segundo-aliento', 'Corazón «Segundo aliento»', 'corazon', 'circulatorio', 4, 5, 5, 44000, 'okami', 'legendario', { hpMax: 20 }, 'Desfibrilador interno: una vez cada 30 minutos, cuando caes, te levantas con un tercio de la salud.', { passive: 'segundo-aliento' }],
  ['pulmon-filtro', 'Pulmones con filtro', 'pulmones', 'circulatorio', 2, 2, 2, 2800, 'aurora', 'raro', { needs: { hunger: 1, thirst: 1, fatigue: 0.9 } }, 'Inmune a gases y humos; los bajones de las drogas duran la mitad.', { passive: 'filtro' }],
  ['pulmon-apnea', 'Pulmones de apnea', 'pulmones', 'circulatorio', 1, 1, 1, 1300, 'chatarreros', 'comun', { skills: { atletismo: 1 } }, 'Diez minutos sin respirar.'],
  // --- nervioso
  ['nervios-reflejos', 'Reflejos potenciados', 'nervioso', 'nervioso', 2, 3, 3, 4800, 'halcon', 'raro', { attrs: { REF: 1 } }, '+1 a Reflejos.'],
  ['nervios-sinapsis-rapida', 'Sinapsis rápida', 'nervioso', 'nervioso', 3, 4, 4, 12500, 'teselia', 'epico', { attrs: { REF: 1 }, dodge: 0.05 }, 'Las señales nerviosas viajan por fibra óptica.'],
  ['nervios-dolor-cero', 'Bloqueador del dolor', 'nervioso', 'nervioso', 2, 2, 3, 3600, 'okami', 'raro', { hpMax: 10 }, 'No sientes las heridas (lo cual no siempre es bueno).'],
  ['nervios-modo-dios', 'Supresor «Guerra»', 'nervioso', 'nervioso', 4, 6, 7, 47000, 'halcon', 'legendario', { attrs: { REF: 1 }, meleeDmg: 0.15 }, 'Durante unos segundos, todo a tu alrededor va a cámara lenta.', { ability: { kind: 'tiempo-bala', name: 'Guerra', cooldown: 60, duration: 8 } }],
  // --- tegumentario (piel)
  ['piel-subdermica-ligera', 'Malla subdérmica ligera', 'tegumento', 'tegumentario', 1, 2, 1, 1800, 'chatarreros', 'comun', { armor: 1 }, 'Una malla de fibra bajo la piel.'],
  ['piel-espejo', 'Piel «Espejo»', 'tegumento', 'tegumentario', 3, 4, 4, 13000, 'aurora', 'epico', { armor: 1 }, 'Polímero reactivo: devuelve un 25 % del daño de los golpes cuerpo a cuerpo.', { passive: 'piel-espejo' }],
  ['piel-camaleon', 'Piel camaleónica', 'tegumento', 'tegumentario', 3, 3, 4, 12000, 'aurora', 'epico', { skills: { sigilo: 3 } }, 'Cromatóforos sintéticos: te funde con el entorno.', { ability: { kind: 'invisible', name: 'Camuflaje', cooldown: 45, duration: 8 } }],
  ['piel-ignifuga', 'Piel ignífuga', 'tegumento', 'tegumentario', 2, 2, 2, 3300, 'engranajes', 'raro', { armor: 1 }, 'Las quemaduras no prenden en ti.', { passive: 'ignifugo' }],
  ['piel-aislante', 'Piel aislante', 'tegumento', 'tegumentario', 2, 2, 2, 3500, 'teselia', 'raro', { armor: 1 }, 'Las descargas eléctricas y los PEM no te aturden.', { passive: 'aislante' }],
  ['piel-tatuaje-vivo', 'Tatuaje vivo', 'piel', 'tegumentario', 1, 1, 1, 1200, 'aurora', 'poco-comun', { skills: { actuacion: 1 } }, 'Tinta de nanopartículas que se mueve sobre tu piel.'],
  // --- cara, mandíbula y laringe
  ['cara-mascara-sintetica', 'Rostro sintético', 'cara', 'cara', 3, 2, 4, 11000, 'aurora', 'epico', { skills: { actuacion: 2, sigilo: 1 } }, 'Cambia rasgos a voluntad: las cámaras no saben quién eres la mitad de las veces.', { passive: 'anticamaras' }],
  ['mandibula-trituradora', 'Mandíbula trituradora', 'mandibula', 'cara', 2, 2, 3, 2900, 'chatarreros', 'poco-comun', { needs: { hunger: 0.85, thirst: 1, fatigue: 1 }, skills: { intimidacion: 1 } }, 'Comes cualquier cosa. Sonríes de forma inquietante.'],
  ['laringe-modulada', 'Laringe modulada', 'laringe', 'cara', 2, 1, 2, 3100, 'aurora', 'raro', { skills: { actuacion: 2, negociacion: 1 } }, 'Imita cualquier voz que hayas oído.'],
  // --- glándulas y digestivo
  ['glandula-chispa', 'Glándula suprarrenal «Chispa»', 'glandula', 'circulatorio', 2, 2, 3, 3800, 'okami', 'raro', { meleeDmg: 0.06 }, 'Un chute de adrenalina que te cura un poco.', { ability: { kind: 'curar', name: 'Adrenalina', cooldown: 50, duration: 6, power: 0.25 } }],
  ['glandula-calma-quimica', 'Glándula de calma', 'glandula', 'circulatorio', 1, 1, 1, 1100, 'aurora', 'comun', { skills: { negociacion: 1 } }, 'Serotonina a demanda.'],
  ['digestivo-reciclador', 'Reciclador digestivo', 'digestivo', 'circulatorio', 1, 1, 1, 1400, 'chatarreros', 'comun', { needs: { hunger: 0.8, thirst: 0.85, fatigue: 1 } }, 'Aprovechas hasta la última caloría.'],
  // --- memoria y RAM
  ['bateria-ram-externa', 'Batería de RAM subcutánea', 'bateria', 'so', 2, 2, 2, 3600, 'teselia', 'raro', { ramPlus: 2 }, 'Memoria extra bajo la clavícula: +2 de RAM.'],
  ['bateria-ram-doble', 'Batería de RAM doble', 'bateria', 'so', 3, 3, 3, 10500, 'teselia', 'epico', { ramPlus: 4, ramSave: 0.05 }, '+4 de RAM y −5 % de gasto.'],
  ['regulador-ram', 'Regulador de flujo', 'bateria', 'so', 4, 4, 4, 32000, 'teselia', 'legendario', { ramPlus: 5, ramSave: 0.18 }, 'Gestor militar de memoria: +5 de RAM y −18 % de gasto de RAM (Kairós, hackeos y habilidades).'],
  ['regulador-ram-civil', 'Regulador de flujo civil', 'bateria', 'so', 2, 2, 2, 4200, 'aurora', 'raro', { ramPlus: 1, ramSave: 0.08 }, 'La versión de tienda: −8 % de gasto de RAM.'],
  // --- especiales y de alta gama
  ['implante-sombra', 'Implante «Sombra»', 'emisor', 'tegumentario', 4, 5, 5, 41000, 'okami', 'legendario', { skills: { sigilo: 4 } }, 'Suprime tu firma térmica, sonora y electrónica: invisible durante más tiempo.', { ability: { kind: 'invisible', name: 'Sombra', cooldown: 50, duration: 14 } }],
  ['implante-senuelo-holo', 'Proyector de señuelo', 'proyector', 'so', 3, 3, 3, 9500, 'aurora', 'epico', {}, 'Un holograma tuyo atrae todas las miradas.', { ability: { kind: 'senuelo', name: 'Señuelo', cooldown: 40, duration: 10 } }],
  ['implante-radar', 'Radar de proximidad', 'radar', 'so', 2, 2, 2, 3400, 'halcon', 'raro', { skills: { percepcion: 2 } }, 'Ves a los hostiles en el minimapa aunque no los veas tú.', { passive: 'vision-termica' }],
  ['implante-overclock', 'Overclock neural', 'cortex', 'corteza', 3, 4, 5, 13500, 'teselia', 'epico', { skills: { interfaz: 2 } }, 'Llena tu RAM al instante. Te deja la cabeza ardiendo.', { ability: { kind: 'pico-ram', name: 'Overclock', cooldown: 90 } }],
  ['implante-francotirador', 'Módulo «Francotirador»', 'brazo', 'brazos', 4, 5, 5, 37000, 'halcon', 'legendario', { skills: { armas: 3 } }, 'Tu próximo disparo hace el doble de daño; recarga rápida.', { ability: { kind: 'disparo-cargado', name: 'Tiro de gracia', cooldown: 18 }, visible: 'brazo' }],
  ['implante-berserk', 'Glándula «Furia»', 'glandula', 'circulatorio', 4, 5, 7, 36000, 'saqueadores', 'legendario', { meleeDmg: 0.2, hpMax: 10 }, 'Te lanzas contra el enemigo más cercano y lo golpeas como un tren.', { ability: { kind: 'carga', name: 'Furia', cooldown: 16, power: 9 } }],
  ['implante-sprint', 'Inyector de esprint', 'glandula', 'circulatorio', 2, 2, 3, 4200, 'aurora', 'raro', { speed: 0.02 }, 'Diez segundos corriendo como el viento.', { ability: { kind: 'esprint', name: 'Esprint', cooldown: 35, duration: 10 } }],
  ['implante-piel-titan', 'Dermis «Titán»', 'tegumento', 'tegumentario', 4, 6, 5, 43000, 'engranajes', 'legendario', { armor: 3, hpMax: 20 }, 'Placas subcutáneas de grafeno: +3 de blindaje y +20 de salud.'],
  ['implante-quimera', 'Fusión «Quimera»', 'esqueleto', 'esqueleto', 4, 7, 7, 48000, 'saqueadores', 'legendario', { attrs: { BODY: 1 }, meleeDmg: 0.2, hpMax: 15 }, 'Músculo injertado de origen dudoso: más fuerza, más salud, más hambre.'],
  ['implante-oraculo', 'Oráculo de combate', 'cortex', 'corteza', 4, 5, 5, 40000, 'teselia', 'legendario', { dodge: 0.1, crit: 0.08 }, 'Prevé los movimientos del rival: +10 % de esquiva y +8 % de críticos.', { passive: 'critico' }],
];

export function cyberwareV09(list) {
  const ids = new Set(C.map((x) => x[0]));
  const out = list.filter((d) => !ids.has(d.id));
  for (const [id, name, slot, region, grade, capacity, humanity, price, maker, rarity, fx, desc, extra = {}] of C) {
    const effects = { attrs: fx.attrs ?? {}, skills: fx.skills ?? {}, hpMax: fx.hpMax ?? 0, confront: 0, steal: fx.steal ?? 0, surgery: fx.surgery ?? 0, carry: fx.carry ?? 0, ram: 0, armor: fx.armor ?? 0,
      meleeDmg: fx.meleeDmg ?? 0, speed: fx.speed ?? 0, carSpeed: 0, dodge: fx.dodge ?? 0, ...(fx.needs ? { needs: fx.needs } : {}),
      ...(fx.ramPlus ? { ramPlus: fx.ramPlus } : {}), ...(fx.ramSave ? { ramSave: fx.ramSave } : {}), ...(fx.regen ? { regen: fx.regen } : {}), ...(fx.crit ? { crit: fx.crit } : {}) };
    out.push({ id, name, family: FAMILY[slot] ?? 'Especial', slot, grade, capacity, humanity, price, maker, desc, effects, region, rarity, prosthetic: false, visible: extra.visible ?? 'ninguna',
      ...(extra.ability ? { ability: { duration: 0, power: 0, ...extra.ability } } : {}), ...(extra.passive ? { passive: extra.passive } : {}) });
  }
  return out;
}
const FAMILY = { ojos: 'Óptica', oidos: 'Audio', brazo: 'Brazos', manos: 'Manos', dedos: 'Dedos', pierna: 'Piernas', cortex: 'Neural', so: 'Sistema operativo', esqueleto: 'Esqueleto', columna: 'Esqueleto',
  hombros: 'Esqueleto', circulatorio: 'Circulatorio', corazon: 'Circulatorio', pulmones: 'Circulatorio', nervioso: 'Nervioso', tegumento: 'Piel', piel: 'Piel', cara: 'Cara', mandibula: 'Cara', laringe: 'Cara',
  glandula: 'Glándulas', digestivo: 'Digestivo', bateria: 'Memoria', emisor: 'Especial', proyector: 'Especial', radar: 'Especial' };
export const NEW_CYBER_IDS = C.map((x) => x[0]);

// ---------------------------------------------------------------- matrices de flujo
export function itemsV09(items) {
  const ids = new Set(['matriz-flujo', 'matriz-cauce', 'matriz-delta']);
  return [...items.filter((i) => !ids.has(i.id)),
    { id: 'matriz-flujo', name: 'Matriz Flujo', desc: 'Compresor de procesos para el zócalo de matrices: −12 % de gasto de RAM.', weight: 0, category: 'matriz', rarity: 'raro', price: 9000 },
    { id: 'matriz-cauce', name: 'Matriz Cauce', desc: 'Canaliza los picos de carga: −20 % de gasto de RAM.', weight: 0, category: 'matriz', rarity: 'epico', price: 22000 },
    { id: 'matriz-delta', name: 'Matriz Delta', desc: 'Firmware militar de gestión de memoria: −30 % de gasto de RAM.', weight: 0, category: 'matriz', rarity: 'legendario', price: 48000 },
  ];
}

// ---------------------------------------------------------------- tiendas y matasanos
const STORE_FOR = { comun: ['aurora-24h', 'mercadillo-arrabal', 'ropa-segunda', 'ropa-neon'], 'poco-comun': ['ropa-neon', 'moda-orbita', 'ropa-lumen', 'nomadas-tienda'], raro: ['ropa-lumen', 'moda-orbita', 'armeria-halcon'],
  epico: ['boutique-aurelia', 'moda-orbita', 'electronica-yokai'], legendario: ['boutique-aurelia', 'armeria-halcon'] };
export function shopsV09(shops, clothes) {
  const byId = new Map(shops.map((s) => [s.id, s]));
  clothes.forEach((it, i) => {
    const list = STORE_FOR[it.rarity] ?? ['ropa-neon'];
    const shop = byId.get(list[i % list.length]) ?? byId.get('ropa-neon');
    if (shop) shop.stock[it.id] = it.rarity === 'legendario' ? 1 : it.rarity === 'epico' ? 2 : it.rarity === 'raro' ? 3 : 6;
    // Las prendas tácticas también en la armería.
    if (/armadura|tactic|kevlar/.test(it.id) && byId.get('armeria-halcon')) byId.get('armeria-halcon').stock[it.id] ??= 2;
  });
  for (const s of shops) {
    if (s.id === 'nodo-vacio') Object.assign(s.stock, { 'matriz-flujo': 2, 'matriz-cauce': 1 });
    if (s.id === 'perista-pachinko') Object.assign(s.stock, { 'matriz-delta': 1, 'matriz-cauce': 1 });
  }
  return shops;
}
export function ripperdocsV09(docs, cyber) {
  const defs = cyber.filter((d) => NEW_CYBER_IDS.includes(d.id));
  for (const d of docs) for (const c of defs) {
    if (c.grade > d.maxGrade) continue;
    // Los estrictos no tocan cromo de saqueadores; los legendarios solo los tienen los mejores (grado V) y no todos.
    if (d.morality === 'estricta' && c.maker === 'saqueadores') continue;
    if (c.rarity === 'legendario' && (d.maxGrade < 5 || (c.id.length + d.id.length) % 3 === 0)) continue;
    if (!d.stock.includes(c.id)) d.stock.push(c.id);
  }
  return docs;
}

// ---------------------------------------------------------------- ciudad: farolas, letreros y el Nivel 2 (pasarelas)
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** v0.9 · Color de las farolas de cada distrito: identidad nocturna propia. */
const LAMP_COLORS = { colinas: '#e8f4ff', 'neon-rojo': '#ff6ab4', forja: '#ff9a30', arrabal: '#ffd060', ferro: '#7ae8ff', cenit: '#c8d8ff', 'muelles-viejos': '#8affd0', poligono: '#ffb060', vertedero: '#d8ff7a', 'cementerio-trenes': '#ff7a5a', yermo: '#ffc890', 'descampado-norte': '#f0d0a0' };
const inR = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
const SIGNS = [
  [/comisar|PCV/i, 'COMISARÍA', '#43a8ff', 'escudo'],
  [/farmacia|botiqu/i, 'FARMACIA', '#5aff7a', 'cruz'],
  [/Ámbar/, 'ÁMBAR · URGENCIAS', '#ffb020', 'cruz'],
  [/cl[ií]nica/i, 'MATASANOS', '#ff3fa4', 'cruz'],
  [/armer|armas/i, 'ARMERÍA', '#ff5a3a', 'diana'],
  [/motel/i, 'MOTEL', '#ff8a3d', ''], [/hotel/i, 'HOTEL', '#ff8a3d', ''],
  [/concesionario|autos|motos|blindados|usados/i, 'CONCESIONARIO', '#ffd23f', ''],
  [/gasolinera/i, 'GASOLINERA', '#ffd23f', ''], [/iglesia/i, 'IGLESIA', '#e8e0d0', ''],
  [/ramen|comedor/i, 'COMIDA', '#ff6a20', ''], [/inmobiliaria/i, 'INMOBILIARIA', '#7dd3a0', ''],
  [/supermercado|24h|mercadillo/i, 'SUPERMERCADO', '#5affc8', ''], [/ropa|moda|boutique/i, 'ROPA', '#ff6aa8', ''], [/electr[oó]nica/i, 'ELECTRÓNICA', '#43f3ff', ''],
  [/bar |club|discoteca|casino|pachinko/i, null, '#b46cff', ''],
  [/Nivel 2/, '▲ NIVEL 2 · PASARELAS', '#43f3ff', 'flecha'],
];
/** Rótulo para la puerta de un local público (las puertas sin rótulo y las bases de banda se quedan sin él). */
function signFor(d) {
  if (/sin rótulo/i.test(d.name) || /^(base|refugio)-/.test(d.to.zone)) return null;
  for (const [re, text, color, icon] of SIGNS) if (re.test(d.name)) return { text: text ?? d.name.toUpperCase().slice(0, 18), color, icon };
  return /^torre|arcolog|aguja|oficinas|laborator|centro|almac|taller|nodo/i.test(d.name) ? { text: d.name.toUpperCase().slice(0, 20), color: '#c8ccd8', icon: '' } : null;
}

export function zonesV09(C) {
  const zfile = (id) => join(C, 'zones', `${id}.json`);
  const readZ = (id) => JSON.parse(readFileSync(zfile(id), 'utf8'));
  const writeZ = (z) => writeFileSync(zfile(z.id), JSON.stringify(z, null, 1) + '\n');
  const city = readZ('vertice');
  const groundAt = (x, y) => { let t = city.base; for (const g of city.ground) if (inR(x, y, g.rect)) t = g.type; return t; };
  const solid = (x, y) => x < 1 || y < 1 || x >= city.width - 1 || y >= city.height - 1 || city.buildings.some((b) => inR(x, y, b.rect)) || city.blocks.some((b) => inR(x, y, b.rect)) || ['void', 'water'].includes(groundAt(x, y));
  // ---- 1) Farolas: fuera de la calzada, de los pasos de cebra y del agua; a la acera más cercana (y sin pegarse unas a otras).
  const SIDEWALK = new Set(['sidewalk', 'plaza', 'tile', 'metal', 'deck', 'gravel', 'dirt', 'sand', 'grass', 'market']);
  const taken = new Set();
  const doorTiles = new Set([...city.doors, ...city.objects].map((d) => d.at.join(',')));
  let moved = 0, removed = 0;
  const props = [];
  for (const p of city.props) {
    if (p.type !== 'lamp') { props.push(p); continue; }
    let [x, y] = p.at;
    if (!SIDEWALK.has(groundAt(x, y)) || solid(x, y)) {
      let best = null;
      for (let r = 1; r <= 3 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (SIDEWALK.has(groundAt(nx, ny)) && !solid(nx, ny) && !doorTiles.has(`${nx},${ny}`)) { best = [nx, ny]; break; }
      }
      if (!best) { removed++; continue; }
      [x, y] = best; moved++;
    }
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (taken.has(`${x + dx},${y + dy}`)) { near = true; break; }
    if (near || doorTiles.has(`${x},${y}`)) { removed++; continue; }
    taken.add(`${x},${y}`);
    const dist = city.districts.find((d) => d.rect && inR(x, y, d.rect));
    const col = LAMP_COLORS[dist?.id];
    props.push({ ...p, at: [x, y], ...(col ? { color: col } : {}) });
  }
  city.props = props;

  // ---- 2) Nivel 2: una red de pasarelas transitable que une las 13 pasarelas del mapa, con escaleras en cada extremo.
  for (const f of readdirSync(join(C, 'zones'))) if (/^pasarela-.*\.json$/.test(f)) unlinkSync(join(C, 'zones', f));
  city.doors = city.doors.filter((d) => !/^pasarela-/.test(d.to.zone) && d.to.zone !== 'pasarelas');
  const W = 112, H = 66;
  const ground = [], blocks = [], zprops = [], doors = [], objects = [], buildings = [];
  const plat = city.skybridges.map((sb, i) => {
    const mx = (sb.from[0] + sb.to[0]) / 2, my = (sb.from[1] + sb.to[1]) / 2;
    return { i, sb, x: 8 + Math.round((mx / city.width) * (W - 16)), y: 7 + Math.round((my / city.height) * (H - 14)) };
  });
  // Plazas grandes: mercado colgante, mirador y jardín de antenas.
  const plazas = [{ x: Math.floor(W / 2), y: Math.floor(H / 2), w: 14, h: 9, name: 'Mercado colgante' }, { x: 18, y: 12, w: 10, h: 7, name: 'Mirador' }, { x: W - 18, y: H - 12, w: 10, h: 7, name: 'Jardín de antenas' }];
  const nodes = [...plat.map((p) => ({ x: p.x, y: p.y })), ...plazas.map((p) => ({ x: p.x, y: p.y }))];
  for (const p of plat) ground.push({ type: 'plaza', rect: [p.x - 3, p.y - 2, 7, 5] });
  for (const p of plazas) ground.push({ type: 'tile', rect: [p.x - Math.floor(p.w / 2), p.y - Math.floor(p.h / 2), p.w, p.h] });
  // Árbol mínimo (Prim) + un par de atajos: pasarelas de 3 de ancho en forma de L.
  const inTree = [0], edges = [];
  while (inTree.length < nodes.length) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < nodes.length; b++) if (!inTree.includes(b)) { const d = Math.abs(nodes[a].x - nodes[b].x) + Math.abs(nodes[a].y - nodes[b].y); if (!best || d < best.d) best = { a, b, d }; }
    inTree.push(best.b); edges.push([best.a, best.b]);
  }
  edges.push([plat.length, 0], [plat.length + 1, plat.length + 2]);
  const walk = (a, b) => {
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)], [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    ground.push({ type: 'metal', rect: [x0 - 1, a.y - 1, x1 - x0 + 3, 3] });
    ground.push({ type: 'deck', rect: [b.x - 1, y0 - 1, 3, y1 - y0 + 3] });
    for (let x = x0 + 3; x < x1 - 2; x += 7) zprops.push({ type: 'lamp', at: [x, a.y - 1] });
    for (let y = y0 + 3; y < y1 - 2; y += 7) zprops.push({ type: 'lamp', at: [b.x + 1, y] });
    for (let x = x0 + 6; x < x1 - 2; x += 9) zprops.push({ type: 'neonstrip', at: [x, a.y + 1], blocking: false, color: ['#43f3ff', '#ff3fa4', '#b46cff'][x % 3] });
  };
  for (const [a, b] of edges) walk(nodes[a], nodes[b]);
  // Escaleras: dos por pasarela de la ciudad (una en cada extremo), con su rótulo.
  const free = (x, y) => !solid(x, y) && !city.doors.some((d) => d.at[0] === x && d.at[1] === y) && !city.objects.some((o) => o.at[0] === x && o.at[1] === y);
  const near = (x, y) => { for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (free(x + dx, y + dy)) return [x + dx, y + dy]; return null; };
  for (const p of plat) {
    const ends = [p.sb.from, p.sb.to];
    ends.forEach((end, k) => {
      const dTile = near(end[0], end[1]);
      if (!dTile) return;
      const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [dTile[0] + dx, dTile[1] + dy]).find(([x, y]) => free(x, y)) ?? dTile;
      const up = [p.x + (k ? 2 : -2), p.y];
      city.props = city.props.filter((q) => !(Math.abs(q.at[0] - dTile[0]) <= 1 && Math.abs(q.at[1] - dTile[1]) <= 1));
      city.doors.push({ id: `n2-${p.i}-${k}`, name: 'Escaleras al Nivel 2', at: dTile, to: { zone: 'pasarelas', at: [up[0] + (k ? -1 : 1), up[1]] }, danger: 'public' });
      doors.push({ id: `n2-bajar-${p.i}-${k}`, name: 'Bajar a la calle', at: up, to: { zone: 'vertice', at: land }, danger: 'public' });
    });
    zprops.push({ type: 'holo', at: [p.x, p.y - 2], color: p.sb.color, blocking: false });
  }
  // Mercado colgante con puestos, un bar y bancos; mirador con prismáticos; jardín de antenas.
  const m = plazas[0];
  for (let i = 0; i < 5; i++) zprops.push({ type: 'stall', at: [m.x - 6 + i * 3, m.y - 3] });
  for (let i = 0; i < 4; i++) zprops.push({ type: 'bench', at: [m.x - 5 + i * 3, m.y + 3] });
  zprops.push({ type: 'kiosk', at: [m.x + 6, m.y] }, { type: 'billboard', at: [m.x, m.y - 4] });
  // Construcciones de azotea: solo donde no tapan plataformas, escaleras ni pasarelas.
  const keep = [...plat.map((p) => [p.x - 4, p.y - 3, 9, 7]), ...doors.map((d) => [d.at[0] - 1, d.at[1] - 1, 3, 3])];
  const overlaps = (r) => keep.some((k) => r[0] < k[0] + k[2] && k[0] < r[0] + r[2] && r[1] < k[1] + k[3] && k[1] < r[1] + r[3]);
  for (const b of [{ id: 'n2-bar', name: 'Bar Altura', rect: [m.x + 2, m.y - 4, 4, 3], height: 3, style: 'club', color: '#2a1a3a', sign: 'ALTURA', signColor: '#ff3fa4' },
    { id: 'n2-bar-b', name: 'Bar Altura', rect: [m.x - 6, m.y + 2, 4, 3], height: 3, style: 'club', color: '#2a1a3a', sign: 'ALTURA', signColor: '#ff3fa4' },
    { id: 'n2-kiosco', name: 'Kiosco del Mirador', rect: [plazas[1].x - 4, plazas[1].y - 3, 3, 2], height: 2.5, style: 'shop', color: '#1a2a3a', sign: 'MIRADOR', signColor: '#43f3ff' }])
    if (!overlaps(b.rect) && !buildings.some((o) => o.sign === b.sign)) buildings.push(b);
  for (let i = 0; i < 8; i++) zprops.push({ type: 'antenna', at: [plazas[2].x - 4 + (i % 4) * 2, plazas[2].y - 2 + Math.floor(i / 4) * 3] });
  objects.push({ id: 'n2-vending-1', name: 'Máquina Aurora', at: [m.x + 5, m.y + 2], kind: 'vending', shop: 'aurora-vending' }, { id: 'n2-vending-2', name: 'Máquina Aurora', at: [plazas[1].x + 3, plazas[1].y], kind: 'vending', shop: 'aurora-vending' });
  objects.push({ id: 'n2-cam-1', name: 'Cámara de seguridad', at: [m.x - 6, m.y + 3], kind: 'camera' });
  // El abismo: luces de la ciudad muy abajo (solo decorado).
  const walkable = (x, y) => ground.some((g) => g.type !== 'void' && inR(x, y, g.rect));
  for (let i = 0; i < 260; i++) { const x = (i * 37) % W, y = (i * 53 + Math.floor(i / 7)) % H; if (!walkable(x, y)) zprops.push({ type: 'citylights', at: [x, y], blocking: false, color: ['#43f3ff', '#ff3fa4', '#ffd23f', '#b46cff', '#ff8a3d'][i % 5] }); }
  const waypoints = [...nodes.map((n) => [n.x, n.y]), ...plat.map((p) => [p.x + 1, p.y + 1])];
  // Nada sólido sobre los puntos de paso, las escaleras ni sus casillas de llegada.
  const clear = new Set([...waypoints, ...doors.map((d) => d.at), ...city.doors.filter((d) => d.to.zone === 'pasarelas').map((d) => d.to.at), ...objects.map((o) => o.at)].map((a) => `${a[0]},${a[1]}`));
  for (let i = zprops.length - 1; i >= 0; i--) if (zprops[i].blocking !== false && clear.has(zprops[i].at.join(','))) zprops.splice(i, 1);
  writeZ({
    id: 'pasarelas', name: 'Nivel 2 · Pasarelas de Vértice', kind: 'exterior', width: W, height: H, chunkSize: 16, danger: 'public', base: 'void', ground, blocks, buildings, props: zprops, doors, objects, skybridges: [],
    dangerAreas: [{ level: 'protected', rect: [m.x - 7, m.y - 5, 14, 10] }], sectors: [], waypoints, safePoint: [m.x, m.y], ambient: 6, police: 1, gangs: [], districts: [], furnished: true,
  });
  // ---- 3) Rótulos en las puertas de los locales públicos de la ciudad (comisaría, farmacia, matasanos conocidos…).
  let signs = 0;
  for (const d of city.doors) { const s = signFor(d); if (s) { d.sign = s.text; d.signColor = s.color; if (s.icon) d.signIcon = s.icon; signs++; } else { delete d.sign; delete d.signColor; delete d.signIcon; } }
  writeZ(city);
  // El mapa del mundo también conoce el Nivel 2.
  return { moved, removed, signs, stairs: city.doors.filter((d) => d.to.zone === 'pasarelas').length };
}
