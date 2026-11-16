# Vértice · novedades de la v0.9

## 1. Controles

- **Solo se anda con WASD.** El clic izquierdo ya no mueve al personaje ni le hace caminar hacia nada.
- **W y S ya no van al revés.** W sube en la pantalla y S baja.
- **Clic izquierdo = interactuar a distancia.**
  - Hablar, comerciar, examinar o abrir el menú de una persona funciona hasta a 7 m, sin moverte.
  - Si está más lejos, el juego te pide que te acerques con WASD.
  - Las puertas se cruzan desde muy cerca (unos 2 m).
- **Clic derecho mantenido + clic izquierdo = atacar.**
  - Si estás fuera de alcance, ya no persigues al objetivo: tienes que acercarte tú.
- **Teclas que cambian** (las teclas que hayas personalizado se respetan):

  | Acción | Tecla nueva | Antes |
  |---|---|---|
  | Modo hackeo | `R` | `R` era «retirada» |
  | Retirada al refugio | `,` | `R` |
  | Patada | `Q` | `Q` era «cancelar» |
  | Cancelar | `Retroceso` | `Q` |
  | Esquivar | `Espacio` | — |

## 2. Modo hackeo (R)

1. Pulsa `R`. Arriba aparece el aviso «⌁ MODO HACKEO» y la mira se vuelve morada.
2. Haz clic en una persona, cámara, cajero o terminal.

Se abre el panel de hackeo de ese objetivo con todas sus opciones: coste de RAM, tiempo, probabilidad, alcance y por qué hay alguna bloqueada. Si no tienes cyberdeck, el panel te lo dice. `R` otra vez o `Esc` sale del modo.

## 3. Combate

**Movimientos nuevos**

| Movimiento | Cómo | Qué hace |
|---|---|---|
| Esquiva | `Espacio` | Ruedas 2,6 m hacia donde andas. Durante medio segundo esquivas casi todo (95 % de los golpes y 70 % de las balas). Cuesta aguante y hay que esperar un instante para repetirla. |
| Patada | `Q` | Golpea a quien señalas o al más cercano: lo empuja 1,5 m, lo desequilibra y le rompe el ritmo. No es letal y no gasta munición. |
| Golpe fuerte | `Ctrl` + clic en guardia, con arma cuerpo a cuerpo | ×1,8 de daño, rompe la guardia y aturde, pero es más lento. |
| Ráfaga | `Ctrl` + clic en guardia, con arma de fuego | Tres balas de golpe: menos precisa, mucho daño. |

**Balas más visibles**
- Trazadoras más gruesas, con halo de color y punta blanca brillante.
- Fogonazo en estrella que ilumina la calle.
- Casquillos que saltan del arma y chispas cuando la bala falla.
- La cámara tiembla un poco con los disparos y golpes fuertes.

**Más sangre**
- Chorros de gotas con física que salen en la dirección del impacto y manchan el suelo al caer.
- Charcos más ricos y con brillo húmedo, que crecen bajo los cuerpos que se desangran.
- El cromo no sangra: suelta chispas.

## 4. Personaje mucho más detallado (prioridad)

- **Texturas de alta resolución.** Se dibujan a píxel en el navegador (8 px por unidad, el doble en pantallas densas), así que ocupan más memoria pero se ven mucho mejor.
  - 24 tejidos: cuero con brillo, vaquero con costuras, camuflaje, cuadros, punto, kevlar, fibra de carbono, holográfico, lentejuelas, serpiente, acolchado, pana, seda, neón, circuito…
  - Todos con volumen: sombra en los bordes y brillo.
- **Tatuajes de verdad.** 22 diseños dibujados sobre la piel, no una raya de color: dragón con escamas, carpas, calavera, mandala, rosas con espinas, llamas, telaraña, alas, biomecánico, glitch, acuarela, puntillismo…
  - Eliges dónde: un brazo, los dos, piernas, cuello, pecho o todo el cuerpo.
  - Eliges el color de la tinta.
  - Hay 10 tatuajes faciales: lágrimas, código, código de barras, luna…
- **20 estilos de prenda:** bomber, cazadora motera, abrigo largo, americana, haori, poncho, armadura ligera, arnés, camiseta, tirantes, camisa, cortavientos, chubasquero…
- **Más complementos:**
  - Pantalones cargo, tácticos con rodilleras, leggins, bermudas y falda larga.
  - 7 tipos de calzado.
  - Gorro, boina, casco de moto y diadema LED.
  - Gafas de sol, monóculo, visor táctico, máscara de gas, bandana y máscara de demonio.
- **Detalles de la ropa:** cremalleras, tachuelas, parches, luces LED, cuello de pelo, bandas reflectantes, cinturón y placas.
- **Más acabado en general:** contornos, costuras, puños, pupilas con brillo, párpados, sombra en la cara, mechones de pelo y suelas.

### 100 prendas nuevas

- Repartidas en 12 de cabeza, 12 de cara, 26 chaquetas y abrigos, 18 de torso, 18 pantalones y faldas y 14 calzados.
- Cada una tiene su tejido, color y detalle, y muchas traen mejoras: habilidades, esquiva, salud, puntería, RAM, carga o velocidad.
- Algunas tienen una **capacidad especial**:
  - **Anticámaras:** las cámaras no te identifican la mitad de las veces.
  - **Filtro:** los bajones de las drogas duran la mitad.
  - **Reflejos:** rodar cuesta la mitad de aguante.
  - **Pasos silenciosos:** la policía tiene que estar más cerca para verte.
- Ejemplos legendarios:
  - Chaqueta «Fantasma» de carbono: +8 % de esquiva.
  - Pantalón «Esprínter» con exomúsculo: +10 % de velocidad.
  - Armadura «Centurión».
  - Botas «Pluma».
- Están en las tiendas de ropa según su rareza; las tácticas, también en la armería.
- Los PNJ ya visten con toda esta variedad.

**Unity:** no se ha usado. Vértice es un juego web (TypeScript + PixiJS) y Unity no encaja sin rehacer el cliente entero. Por eso el detalle se consigue con estas texturas generadas a alta resolución.

## 5. Ciberware: 102 implantes nuevos y ranuras dobles

**Ranuras con varios huecos**

| Ranura | Huecos |
|---|---|
| Ojos | 2 (izquierdo y derecho) |
| Oídos | 2 |
| Brazos | 2 |
| Hombros | 2 |
| Manos | 2 |
| Dedos | 4 (2 por mano) |
| Piernas | 2 |
| Corteza | 3 |
| Esqueleto, sistema nervioso, circulatorio, piel, glándulas y memoria | 2 cada una |

La pantalla de ciberware muestra cada hueco con su nombre (Ojo izq., Dedos der., …).

**Los 102 implantes** cubren todo el cuerpo: ojos, oídos, brazos, manos, dedos, piernas, corteza, SO, esqueleto, columna, hombros, sangre, corazón, pulmones, nervios, piel, cara, glándulas y memoria. Los de gama alta hacen cosas especiales:

| Implante | Qué hace |
|---|---|
| Ojo «Absoluto» (legendario) | El 90 % de tus disparos acierta aunque estés fuera de tu alcance seguro (hasta 1,5 veces el alcance del arma). |
| Brazo «Desviador» | En guardia con un arma blanca desvías el 60 % de las balas. |
| Brazo «Sísmico» | Cada puñetazo empuja y aturde. |
| Mano «Vampiro» | Recuperas el 20 % del daño que haces cuerpo a cuerpo. |
| Corazón «Segundo aliento» | Una vez cada 30 min, al caer, te levantas con un tercio de la salud. |
| Córtex «Ejecutor» | Doble daño contra quien está por debajo del 30 % de salud. |
| Blindaje reactivo «Bastión» | El primer golpe cada 8 s pierde un 80 % de daño. |
| Piel «Espejo» | Devuelve un 25 % del daño cuerpo a cuerpo. |
| Ojo «Cazador térmico», radar | Marcas rojas sobre los hostiles cercanos, también tras las paredes. |
| Pierna de salto reforzado / «Felina» | Ruedas más largas que cansan la mitad. |
| Pierna «Pistón» | Patadas de 3 m. |
| Gatillo neural (brazo «Torreta» y dedo) | −30 % de tiempo entre disparos. |
| Nanobots sanguíneos | Regeneran salud fuera de combate. |
| Coagulante | Corta antes las hemorragias. |
| Córtex «Calma» | Menos ciberpsicosis. |
| Pieles ignífuga y aislante | Sin quemaduras; las descargas y los PEM no te aturden. |

Habilidades activas nuevas:
- **Marcar objetivos:** +2 a acertarles y los ves tras las paredes.
- **Escudo cinético:** absorbe 40 puntos de daño.
- **Salto potenciado:** 6 m.
- Además, Tormenta (PEM), Garfio, Furia, Sombra, Tiro de gracia, Overclock y otras.

Los implantes nuevos están en el catálogo de los matasanos según su grado. Los legendarios solo los tienen algunos de grado V.

## 6. Onda Carmín

- **Dos ondas:**
  - La roja (letal) es la de siempre.
  - La amarilla de noqueo (`matriz-carmin:ko`) aparece como habilidad propia en la barra.
- **Efecto visual:** una explosión de aura con anillos, hexágonos y glifos de código que se expanden (rojos o amarillos), una columna de luz, un destello que ilumina la calle y un temblor de cámara.
- **Radio de 11 m** (antes 7). El daño es mayor en el centro.
- **La fuerza depende de tu Interfaz:**
  - Letal: 80 + 8 × Interfaz de daño.
  - Contra jugadores: 45 + 3 × Interfaz.
- **Ningún jefe cae de una onda.** Los jefes son los de las leyendas, los ciberpsicópatas y cualquier PNJ con 250 de salud o más.
  - La roja les quita entre el 35 % y el 75 % de la vida, según tu Interfaz, y siempre les deja al menos 1 punto.
  - La amarilla los noquea con una probabilidad del 20 % al 70 %; si no, los aturde varios segundos.

## 7. Sonido y música (sin derechos de autor)

Todo se sintetiza en el momento con Web Audio; no hay muestras grabadas.

- **Disparos distintos por arma:** pistola, revólver, escopeta, rifle, francotirador, subfusil, ametralladora, plasma, táser y arco.
- **Combate:**
  - Golpes de puño y de filo, patadas y silbido al esquivar.
  - Impactos en carne y chasquidos metálicos en el cromo.
- **Voces:** quejidos de dolor, gritos con heridas graves o críticas y grito al morir. Las voces son graves o agudas.
- **Ambiente:** coches que pasan (con efecto Doppler), bocinas, sirenas cuando te busca la policía, explosión de la Onda Carmín y chirridos de hackeo.
- Todo se coloca en el espacio: volumen por distancia, panorámica izquierda/derecha y eco de callejón.
- **Música:** nueva escena «noche» de synthwave oscuro, y arpegios filtrados con eco en la calle y en la acción.

## 8. Balance

**Matriz CARMÍN**
- +45 de capacidad de cromo (antes +25) y +20 de RAM (antes +8).
- El cromo cuesta 25 puntos menos de humanidad.
- Todo lo que gasta RAM cuesta un 45 % menos: Kairós, ondas, etc.

**Matrices de flujo nuevas** (ahorran menos RAM que CARMÍN):

| Matriz | Rareza | Ahorro de RAM | Dónde está |
|---|---|---|---|
| Flujo | rara | −12 % | Nodo del Vacío |
| Cauce | épica | −20 % | Nodo del Vacío y perista |
| Delta | legendaria | −30 % | Perista |

**Ahorro de RAM de los implantes:** memoria cuántica, baterías de RAM, regulador de flujo… El ahorro de todo se suma hasta un máximo del 60 %. Así el gasto del Kairós se ajusta a tus combinaciones de cromo y RAM.

**Kairós Experimental «Cometa» (mítico)**
- Zona de 16 m (antes 12).
- Los demás se mueven al 7 % de su velocidad (antes 15 %).
- Tú vas a ×2,4.
- Gasta lo mismo, menos tu ahorro de RAM.

## 9. Ciudad

**Nivel 2 · Pasarelas de Vértice**
- Una zona nueva y transitable: red de pasarelas elevadas sobre el abismo de luces de la ciudad.
- Tiene 13 plataformas, el Mercado colgante (zona segura), el Bar Altura, el Mirador, el Jardín de antenas, puestos, máquinas expendedoras, cámara y PNJ.
- **26 escaleras**, una en cada extremo de las 13 pasarelas del mapa, con el rótulo «▲ NIVEL 2 · PASARELAS». Desde cada plataforma se baja a la calle correspondiente.
- Sustituye a las 4 pasarelas sueltas que había.

**Farolas**
- Antes había 290 en la calzada, 76 en pasos de cebra y 17 en el agua.
- 311 se han movido a la acera más cercana y se han quitado 350 que estaban amontonadas.
- Cada distrito tiene su color de luz: rosa en Neón Rojo, sodio naranja en Forja, blanco frío en Colinas, cian en Ferro…

**Iluminación dinámica**
- Una capa de oscuridad real a la que le abren luz las farolas, los neones, los hologramas, las puertas, los puestos, los coches, los fogonazos, la Onda Carmín y una pequeña luz alrededor de ti.
- Los callejones con pocas farolas quedan oscuros de verdad.

**84 rótulos luminosos** sobre las puertas de los locales públicos, con icono:
- COMISARÍA (escudo), FARMACIA (cruz verde), MATASANOS (en las clínicas conocidas), ÁMBAR · URGENCIAS, ARMERÍA, HOTEL, MOTEL, CONCESIONARIO, SUPERMERCADO, ROPA, IGLESIA…
- Las puertas sin rótulo de los matasanos clandestinos y las bases de banda siguen sin cartel.

**Más PNJ y más diversidad**
- 72 transeúntes por defecto (antes 48).
- Todos vestidos al azar con los tejidos, prendas, tatuajes, calzado y complementos nuevos. Las bandas llevan más tatuajes, tachuelas y máscaras; la policía, equipo táctico.
- **19 rutinas nuevas.**
  - De día: hablar por teléfono, hacer fotos, repartir folletos, hacer ejercicio, pedir limosna, discutir, pasear al perro robot, esperar el bus, bailar con auriculares y predicar.
  - De noche: beber en la acera, bailar, hacer pintadas, vigilar la esquina, gritarse, fumar en un portal, parar un taxi, cantar borracho y trapichear.
  - Muchas llevan su frase en un bocadillo.

## Técnico

**Ficheros nuevos**
- Contenido: `scripts/v09.mjs`.
- Cliente: `client/src/render/character.ts`, `client/src/render/textures.ts` y `client/src/sfx.ts`.

**Esquema de contenido**
- Ropa: `pattern`, `detail`, `accent`, `perk` y nuevas mejoras.
- Ciberware: `ramPlus`, `ramSave`, `regen`, `crit` y `passive`.
- Puertas con `sign`.
- Decorado `citylights`.
- Ranuras con capacidad en `CYBER_SLOT_CAPACITY`.

**Protocolo**
- Mensajes nuevos: `hackMenu` y `dodge`.
- `interact` y `hostile` aceptan `remote`.
- Acciones nuevas `heavy` y `kick`, y efectos nuevos `dodge`, `kick`, `heavy` y `wave`.

**Servidor**
- Sin el campo `remote`, la aproximación automática antigua sigue funcionando (la usan los bots y las pruebas).
- Corregido un fallo intermitente al elegir el distrito de los ciberpsicópatas: se tiraba el dado dos veces.

**Pruebas**
- `server/test/v09.test.ts` (10 pruebas).
- La e2e de dos navegadores se acerca con WASD y la aproximación del servidor.
- Total: 98 pruebas de servidor y la e2e en verde.
