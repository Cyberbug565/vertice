# Vértice — RPG multijugador persistente isométrico (alfa v0.40)

La v0.40 arregla las cámaras cercanas:
- **PNJ:** en tercera y primera persona se ven siempre, aunque estén a tu espalda. Los jugadores siguen con el cono de visión, la regla de equilibrio de la cenital.
- **Cielo y edificios:** ya no hay huecos negros en el cielo ni edificios cortados.
- **Distancia de dibujado:** se ajusta en las opciones (40–320 m) y lo lejano se funde en una neblina de contaminación.
- **Tráfico:** los coches 3D circulan por la calle, y los caros se ven menos que los baratos.
- **Balas:** cada arma dispara la bala de su calibre (de 9 mm a .50 BMG y calibre 12), con trazadora, fogonazo y vaina.

[Novedades](docs/NOVEDADES-v0.40.md).

La v0.39 añade dos cámaras a la cenital, y **F5** cambia entre las tres:
- **Tercera persona:** detrás del hombro, con colisión contra paredes y edificios.
- **Primera persona:** desde los ojos del personaje, con mirilla.

En las dos, se arrastra con el ratón para mirar y W anda hacia donde mira la cámara. Para verlas desde cerca se levantan en 3D el suelo, el mobiliario, los muros de los interiores y el cielo según la hora. [Novedades](docs/NOVEDADES-v0.39.md).

La v0.38 reequilibra el arranque y la progresión:
- **Inicios:** 11 (antes 3), cada uno con su ventaja, su dificultad y su sitio de salida.
- **Giro «deuda»:** un préstamo de 15.000 €$ de los Kuro a cambio de +5 puntos de habilidad. Cada día de juego se cobra una cuota; si no pagas, mandan mercenarios a matarte.
- **Ciberware:** 174 implantes con poder y precio acordes a su rareza; los míticos únicos siguen rotos a propósito.
- **La Tormenta:** se mueve con las animaciones capturadas nuevas.
- **Interfaz:** decide cuánto ves de la gente de alrededor (persona o PNJ, nivel, actitud, recompensa, antecedentes, cromo, dinero…) y de tu propio expediente (qué sabe la PCV, el precio por tu cabeza, quién te caza). Es de las habilidades más difíciles de subir, y bandas, carteles y corporaciones te ofrecen contratos si la dominas.
- **HUD:** más limpio, con un panel para elegir qué se ve.

[Novedades](docs/NOVEDADES-v0.38.md) · [equilibrio del ciberware](docs/EQUILIBRIO_CIBERWARE.md).

La v0.37 añade 1.006 diálogos nuevos según la zona: cada barrio habla con su registro (pijo, corporativo, de fiesta, obrero, marginal o del desierto) y los casinos, comisarías, bares, tiendas y clínicas tienen sus propias frases. Hay sátira, humor negro y burlas según la pinta del jugador. Funciona como el sistema de respuestas por reglas de Valve: primero se mira el contexto y luego gana la frase más específica. [Novedades](docs/NOVEDADES-v0.37.md) · [cómo funciona y cómo escribir más](docs/DIALOGOS_ZONA.md).

La v0.36 pone puertas de verdad en las fachadas: las del kit de edificios de Kenney (un portal y una puerta doble de cristal), encajadas en el muro de cada edificio, con hojas que se abren hacia dentro al acercarse alguien. Además, 32 portales que estaban sueltos en la acera quedan pegados a su edificio. [Novedades y capturas](docs/NOVEDADES-v0.36.md).

La v0.35 abre los edificios de viviendas por dentro: el portal es una puerta que da al vestíbulo, y por la escalera se sube planta a planta hasta la puerta de tu piso. Ya no hay pantallas de carga: las puertas se abren y se cierran, y la ciudad no se reconstruye al entrar y salir de un interior (de unos 750 ms a menos de 80 ms). Los dos casinos grandes tienen dos porteros en la puerta que te dicen si entras o no, y la PCV patrulla alrededor de cada comisaría. Las plantas y casas solo existen en el servidor mientras alguien las usa. [Novedades, capturas y medidas](docs/NOVEDADES-v0.35.md).

La v0.33 amplía la ciudad hacia el sur con cinco distritos. Los peatones circulan por aceras y pasos señalizados. Al caminar o apuntar se orienta el campo visual. La ficha de cada óptica indica su alcance y su ángulo. Los muros bloquean incluso la visión panorámica.

La v0.34 incorpora la flota de la release «coches» al tráfico y al concesionario. Abre Propiedades para escoger coche, pulsa V en la calle para subir o aparcar, y usa WASD para conducir. La velocidad máxima, aceleración, frenada y agarre dependen del modelo.

La v0.32 amplía Ciudad Vértice al este y al sur, incorpora las fachadas y los contenedores nuevos y añade el [Saeta Vector conducible](docs/ENSANCHE_032.md).
La v0.31 renueva [el trazado y los edificios de Ciudad Vértice](docs/URBANISMO_031.md) con geometría de Lower Manhattan.
La v0.30 revisa la [marcha, los probadores y el creador](docs/ASPECTO_030.md).

La v0.29 abre el [Penal de las Salinas](docs/PENAL.md), con arrestos, expedientes persistentes, cuenta bancaria, turnos, libertad condicional y fugas.

La v0.28 amplía la población con 67 NPC con turnos, patrullas, personal de casino y dependientes. [Horarios, interacciones y pruebas](docs/TURNOS_NPC.md).

La v0.27 abre cinco casinos con eurodólares del juego, mesas animadas y salas VIP. [Ubicaciones, apuestas, reglas y planos](docs/CASINOS.md).

La v0.26 integra las capturas de la release de movimiento para jugadores y NPC. Incluye marcha, carrera, esquivas, guardias, gestos y Brooklyn Uprock. [Ver las fotos, la comparación y las animaciones pendientes](docs/ANIMACIONES_026.md).

La v0.25 añade exploración persistente, mapa desplazable, siete estilos de movimiento y voces de calle y de misiones. [Controles, muestras y guía para añadir diálogos](docs/CIUDAD_VIVA.md).

La v0.24 incorpora 21 implantes 3D visibles, con lado anatómico, ajuste a la ropa y cinco rarezas comprables. [Catálogo, clínicas y fotos de las pruebas](docs/CIBERWARE_3D.md).

Cuentas persistentes, selección de personajes, expediente y memorial detallado; modos **Iniciar en local** y **Publicar**: [guía y comprobaciones](docs/CUENTAS_Y_ARRANQUE.md).

Ajuste de la ropa al cuerpo y las animaciones: [cambios, comprobaciones y capturas](docs/AJUSTE_ROPA.md).

Novedades de la v0.22 (50 prendas 3D de la release «ropa» ajustadas a los dos cuerpos: chaquetas, camisetas, monos, vestidos, pantalones, faldas, botas, guantes, cascos, máscaras y accesorios; ropa por capas en la que solo se cambia lo del mismo tipo y cada prenda se puede quitar; cuerpos desnudos con anatomía adulta; ropa interior y lencería; prendas de mujer y de hombre separadas; opción de desnudos): [`docs/NOVEDADES-v0.22.md`](docs/NOVEDADES-v0.22.md). Novedades de la v0.21 (31 personajes cartoon de pocos polígonos, oficios y medievales, en el creador y por la calle; atuendos completos de jornalero y explorador; animaciones de la librería universal de Quaternius para golpes, bloqueo, reacciones y gestos; cuchilla serrada del orco y moveset de tres ataques para las armas pesadas; la Tormenta más baja, unos 2,4 m, con las piernas más cortas): [`docs/NOVEDADES-v0.21.md`](docs/NOVEDADES-v0.21.md). Novedades de la v0.20 (el control es siempre del jugador: ya no huye solo al recibir un disparo; todas las calles conectadas con la avenida; guardia con el clic derecho y puñetazo o tajo con el izquierdo, haya alguien o no; cómo subir el modelo de la Tormenta): [`docs/NOVEDADES-v0.20.md`](docs/NOVEDADES-v0.20.md). Novedades de la v0.19 (la Tormenta sustituye siempre al personaje, también sin el modelo descargado; canales convertidos en paseos y callejones de punta a punta; contorno en el suelo de los edificios transparentes; transeúntes por la acera que cruzan por pasos de peatones con semáforo; tráfico por una red de calles conectada, con semáforos, que solo existe cerca del jugador y aparece y se va con un fundido; personajes que aparecen y desaparecen con fundido; el cliente deja de recompilar sombreadores sin parar): [`docs/NOVEDADES-v0.19.md`](docs/NOVEDADES-v0.19.md). Novedades de la v0.18 («cada tiro cuenta»: heridas de bala, rasguños, cortes, cortes profundos, quemaduras y amputaciones que sangran cada una a su ritmo; vendas, sutura, pinzas, desinfectante y antibióticos; infección; heridas que tardan de 1 día a 2 semanas de juego en curar; la salud ya no se regenera sola, solo descansando y sin heridas; estimulantes con salud temporal; ventana de salud con silueta y menú de tratamiento; ropa con chaquetas abiertas, cremalleras, botones y bolsillos, y peinados sin calvas; la Tormenta en la mochila del admin y generador de cualquier objeto): [`docs/NOVEDADES-v0.18.md`](docs/NOVEDADES-v0.18.md). Novedades de la v0.17 (superarmadura «Tormenta» con el modelo Ophiel, negra y azul neón, que se confirma al ponerla y no se quita nunca; 106 peinados de verdad de la release encajados en la cabeza y con miniaturas en el creador; kabuto oni y grebas flotantes sacados del samurái; modelos extra que se descargan con `npm run assets`): [`docs/NOVEDADES-v0.17.md`](docs/NOVEDADES-v0.17.md). Novedades de la v0.16 (ropa generada a partir del cuerpo con dobladillos limpios, guantes, peinados, gorros, máscaras y gafas que encajan, tatuajes visibles; ciberware robótico por gamas de chatarra a lujo; superarmadura «Tormenta» de dos veces el tamaño de una persona, mítica y única; 15 rasgos de cara y texturas nítidas; cámara más cercana con zoom en el creador; edificios a escala de las personas y neón orgánico pegado a las fachadas): [`docs/NOVEDADES-v0.16.md`](docs/NOVEDADES-v0.16.md). Novedades de la v0.15 (cuerpos CC0 de Quaternius con esqueleto, masculino o femenino, que agarran el arma con las dos manos y armas a tamaño real; exoarmadura «Tormenta»; centro de la ciudad con megatorres, neón de colores que cambian y ventanas encendidas de noche): [`docs/NOVEDADES-v0.15.md`](docs/NOVEDADES-v0.15.md). Novedades de la v0.14 (ciudad en 3D con edificios CC0 de Kenney y neón, armas de fuego con modelos CC0 de Quaternius a tamaño real, caras únicas para cada persona sobre un cuerpo base, 18 tonos de piel; créditos en [`CREDITOS.md`](CREDITOS.md)): [`docs/NOVEDADES-v0.14.md`](docs/NOVEDADES-v0.14.md). Novedades de la v0.13 (cadáveres que duran una semana con sangre y saqueo completo, esconderlos en contenedores, rebuscar en la basura y esconderte dentro, hallazgos con investigación por cámaras, confirmaciones dentro del juego, conversaciones y vida en la calle, creador en 3D con más cuerpos, peinados y caras): [`docs/NOVEDADES-v0.13.md`](docs/NOVEDADES-v0.13.md). Novedades de la v0.12 (E para interactuar y clic en puertas arreglado, sin teletransportes al rodar ni retrocesos al andar, personajes 3D con más polígonos y movimientos fluidos, Rafa «Brasas» y CARMÍN como fantasmas que aparecen y desaparecen, estela de Kairós en 3D, 51 modelos de armas y 10 armas nuevas): [`docs/NOVEDADES-v0.12.md`](docs/NOVEDADES-v0.12.md). Novedades de la v0.11 (personajes modelados en 3D con animaciones y cromo visible, edificios más altos y personajes más pequeños, edificios de delante transparentes, colisiones invisibles arregladas, calles y aceras que se distinguen de día y de noche, más variedad de edificios y callejones en L y Z): [`docs/NOVEDADES-v0.11.md`](docs/NOVEDADES-v0.11.md). Novedades de la v0.10 (sigilo: los PNJ solo te detectan si te ven o te oyen, ruido por arma, sospecha, descripciones y caras, disfraces, arcos detectores que no ven el cromo, ruleta de armas, armas visibles a la espalda y la cadera, barra de sigilo y quién te busca, Banco Central y Penal de Hierro): [`docs/NOVEDADES-v0.10.md`](docs/NOVEDADES-v0.10.md). Novedades de la v0.9 (solo WASD y clic a distancia, modo hackeo con R, esquiva, patada y golpe fuerte, balas y sangre más visibles, personaje detallado con tejidos y tatuajes reales, 100 prendas y 102 implantes nuevos con ranuras dobles, Onda Carmín renovada, sonido y música sintetizados, Nivel 2 de pasarelas, iluminación dinámica, rótulos y más PNJ): [`docs/NOVEDADES-v0.9.md`](docs/NOVEDADES-v0.9.md). Novedades de la v0.8.1 (cuenta de administración del dueño y objetos míticos únicos: solo se consiguen matando a quien los lleva): [`docs/NOVEDADES-v0.8.1.md`](docs/NOVEDADES-v0.8.1.md). Novedades de la v0.8 (ciberpsicosis que dura semanas, rarezas e implantes míticos, tres leyendas con sus encargos, zócalo de matrices, ciberespacio y el Velo, aceleradores Kairós que ralentizan el tiempo y cuenta de pruebas con menú de trucos): [`docs/NOVEDADES-v0.8.md`](docs/NOVEDADES-v0.8.md). Novedades de la v0.7 (WASD, apuntar y bloquear con el clic derecho, panel del cuerpo para curarte por zonas, teclas configurables, chat local y global, nuevo aspecto cyberpunk, más caras, recompensas que publica la ciudad, maleantes, policía que llega según la distancia, ciberpsicópatas y ciberpsicosis): [`docs/NOVEDADES-v0.7.md`](docs/NOVEDADES-v0.7.md). Novedades de la v0.6 (combate por zonas del cuerpo con heridas, desangrado y amputaciones, armas visibles con balas trazadoras, límite de armas y maletero, cámaras que te identifican, zonas verde/amarilla/roja/negra, buscador de personas y destino marcado, más muebles para cubrirse, más cuerpos y peinados e historia del personaje): [`docs/NOVEDADES-v0.6.md`](docs/NOVEDADES-v0.6.md). Las de la v0.5 (ciudad única más grande, día y noche de 1 h 30, correr, modo automático, puestos fijos con horario, torres por plantas y bases de bandas): [`docs/NOVEDADES-v0.5.md`](docs/NOVEDADES-v0.5.md). Las de la v0.4 (niveles, habilidades 1–25 y perks, pantalla de personaje, ropa, casas, coches, mercado en tiempo real, cromo con habilidades y calles con carriles): [`docs/NOVEDADES-v0.4.md`](docs/NOVEDADES-v0.4.md). Las de la v0.3: [`docs/NOVEDADES-v0.3.md`](docs/NOVEDADES-v0.3.md). Las de la v0.2: [`docs/NOVEDADES-v0.2.md`](docs/NOVEDADES-v0.2.md). Publicarlo en internet: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

RPG de ambientación cyberpunk que se juega en el navegador. Es persistente, multijugador, con cámara isométrica 2.5D, movimiento con WASD y ratón para interactuar y combatir. El servidor es autoritativo: Node.js con WebSocket y PostgreSQL. El cliente usa TypeScript, Vite y PixiJS 8 sobre WebGL 2.

> **Edición:** universo original (Ciudad Vértice: Ferro, Cénit, Colinas Doradas, Neón Rojo, Forja, El Arrabal y El Yermo). El motor no conoce ningún lugar concreto: el mapa, los roles, los diálogos, los encargos y las facciones viven en `content/` como datos validados. Más detalles en [`docs/DISENO.md`](docs/DISENO.md#edicion-y-propiedad-intelectual).

## Requisitos

- Node.js ≥ 22.12 y npm 10.
- PostgreSQL 16, de forma **opcional**. Si `DATABASE_URL` está vacío, el servidor usa PGlite, un PostgreSQL embebido en `./data/pglite`.
- Navegador de escritorio con WebGL 2 (Chrome, Edge o Firefox recientes).

## Arranque reproducible

```bash
npm ci
cp .env.example .env          # opcional: por defecto usa PGlite (no hace falta instalar PostgreSQL)
docker compose up -d db       # opcional: PostgreSQL 16 local
npm run db:migrate            # crea el esquema (también se aplica al arrancar)
npm run build                 # compila el cliente en client/dist
npm start                     # http://localhost:8080
```

Para desarrollo con recarga en caliente, ejecuta `npm run dev` y abre http://localhost:5173. Vite redirige `/api` y `/ws` al servidor del puerto 8080.

## Jugar con amigos por internet, gratis (túnel de Cloudflare)

Tu ordenador hace de servidor y Cloudflare te da un enlace público `https://….trycloudflare.com`. No necesitas cuenta ni pagar.

1. Instala Node.js 22 (https://nodejs.org) y `cloudflared`:
   - **Windows:** `winget install --id Cloudflare.cloudflared`
   - **macOS:** `brew install cloudflared`
2. **Windows:** doble clic en `publicar.bat`. **macOS:** doble clic en `publicar.command`. **Cualquier sistema:** `npm run publicar`.
3. La primera vez instala y compila (unos minutos). Después aparece el enlace en un recuadro: compártelo.
4. El juego está en internet mientras esa ventana siga abierta. Ctrl+C lo cierra y guarda a todos los personajes. Cada vez que lo abras, el enlace será distinto; los personajes se conservan en `data/pglite`.

Para un mundo que siga abierto aunque apagues el ordenador, consulta [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Dos jugadores en la misma ciudad

1. Abre http://localhost:8080 en una ventana normal **y** en una ventana de incógnito o en otro perfil del navegador. Cada perfil guarda su propia sesión.
2. En cada ventana: **Crear cuenta** → **Crear personaje**. Elige, por ejemplo, *Solo* en una y *Netrunner* en la otra.
3. Los dos aparecéis en el vestíbulo del Bloque 9, que es zona protegida, y os veis. Escribid en el chat local con Intro (o en el global con Y).
4. Para jugar desde otro ordenador de la red, abre `http://IP-DEL-SERVIDOR:8080`.

## Controles

Todas las teclas se pueden cambiar en **Esc → Teclas**. Estas son las de serie:

| Acción | Ratón | Teclado |
| --- | --- | --- |
| Andar · correr | — | `W` `A` `S` `D` o las flechas · `Mayús` |
| Menú de una persona (o el tuyo propio) | Clic izquierdo sobre ella (o sobre ti), **a distancia** (hasta 7 m; el personaje ya no camina con el clic) | `Tab` la señala y `E` interactúa |
| Entrar por una puerta, usar un objeto, hablar con alguien importante | Clic izquierdo a distancia; las puertas, hasta 3 m (acércate con WASD) | `E` con lo señalado o, si no señalas nada, con lo más cercano (sale un aviso «E · …») |
| Apuntar (armas a distancia) o bloquear (cuerpo a cuerpo) | Mantén el clic derecho. Con él pulsado, clic izquierdo sobre alguien = atacar; `Ctrl` + clic = golpe fuerte o ráfaga. Cuando la retícula se llena y se pone verde, el tiro es seguro | — |
| Ruleta de armas (elige qué empuñas o «manos vacías»; mantén y suelta, o pulsa y haz clic) | Ratón para elegir | `R` |
| Modo hackeo (luego clic en una persona, cámara, cajero o terminal) | — | `Q` |
| Esquivar rodando · patada | — | `Espacio` · `F` |
| Panel del cuerpo (heridas; clic en una zona para curarla) | Clic en la silueta | `H` |
| Bailar · dormir · conducir | — | `B` · `Z` · `V` |
| Cancelar · retirada al refugio | — | `Retroceso` · `,` |
| Inventario · ficha · ciberware · habilidades | — | `I` · `C` · `X` · `K` |
| Mapa (clic en el plano para marcar destino) · diario · buscar personas (móvil) · maletero | — | `M` · `J` · `G` · `T` |
| Chat local (bocadillo sobre tu personaje) · chat global (panel de la derecha) | — | `Intro` · `Y` |
| Implantes | — | `1`–`4` |
| Automático · empleos · propiedades · mercado · recompensas · facciones · Ámbar | — | `L` · `O` · `P` · `N` · `U` · `Ñ` · `.` |
| Menú (continuar, ajustes, teclas, cerrar sesión) | Botón ☰ | `Esc` |
| Menú de trucos (solo cuentas de administración) | — | F10 |
| Zoom | Rueda | `+` / `−` |

## Vida nocturna y bajos fondos

El mapa (`M`) señala los locales con ♫. Visita La Última Luz en el Arrabal, Circuito 33 en Forja o las pistas de El Relé, Voltio, Kitsune y el Club de Campo Kaiten. Pide una bebida en la barra y pulsa **Beber**. También puedes tomarla desde el inventario. La embriaguez reduce la puntería y el exceso causa vómitos, sed y fatiga. El consumo repetido puede causar dependencia y abstinencia.

Habla con **Sira «La Señal»** en El Relé para ver los precios, quién controla cada distrito y el riesgo de venta. Puedes comprar y revender por tu cuenta para quedarte con el margen completo, expuesto a compradores que se quedan con parte del dinero y a represalias de las bandas. La reputación en los bajos fondos desbloquea el ingreso en bandas secundarias y organizaciones principales.

Si te afilias, el contacto te entrega un lote para un comprador concreto. La banda reduce el riesgo en los tratos que controla. Sus aliados te dan acceso a sus bases y las bandas rivales te atacan en su territorio. Tras cobrar, el encargo indica qué base recibe el dinero. Pulsa **Marcar ruta** en el HUD o el diario (`J`). Entregar dentro del plazo paga una comisión y mejora tu reputación. Las entregas completadas dan ascensos. Pasarse del plazo o abandonar tiene un coste de reputación. Las sustancias también se pueden consumir desde el inventario y cada una tiene efectos, bajón y dependencia propios.

La música cambia con el lugar y el combate. El navegador sintetiza cinco secuencias originales sin grabaciones ni muestras externas. Ajusta música, ambiente y efectos por separado en **Ajustes**.

## Primer encargo: «Luz para el Mercado Lumen»

Nadia, la fixer del bar El Relé, pide conseguir un acoplamiento de potencia en el desguace de Tomás, instalarlo en el generador del mercado y volver. El encargo es **compartido**: quien lo acepta se une a la instancia abierta y los objetivos comunes avanzan para todos.

- **Decisión 1 (cómo conseguir la pieza).** Comprarla por 120 €$. Trabajar para Tomás: el personaje carga tres cajas de forma autónoma. **Solo**: negociar leyendo la amenaza (COOL + Negociación + rango). **Netrunner**: entrar en el terminal del desguace (INT + Interfaz + rango) para conseguir una prueba que obliga a Tomás a entregarla. Si fallas, Tomás sube el precio.
- **Instalación.** Tarda 4 s. El **Tech** dispone de una instalación limpia con propina. Al terminar, el mercado recupera la luz para todos (hecho de distrito con caducidad).
- **Decisión 2 (salida pacífica).** Puedes dar el control del generador a Nadia (200 €$ y reputación con ella) o a la asociación del mercado (80 €$, reputación vecinal y precio de amigo con Lin). Quien no aportó un objetivo compartido cobra el 50 %. Al volver, Nadia y Lin reaccionan según tu decisión, y el tablón y los transeúntes, al mercado iluminado.

Antes de cada tirada se muestra la probabilidad y lo que ocurre si falla. Se puede reservar Suerte, que se cobra solo al comprometer la tirada, y el resultado queda registrado: no se puede repetir hasta acertar.

## Pruebas

```bash
npm run typecheck
npm test                                    # unitarias + integración multijugador (PGlite en memoria)
TEST_DATABASE_URL=postgres://vertice:vertice@localhost:5432/vertice_test npm test   # contra PostgreSQL, incluye reinicio
npm run test:e2e                            # dos navegadores reales contra un servidor en marcha (requiere Playwright: npm i -D playwright && npx playwright install chromium)
npm run loadtest -- --scenario spread --bots 100 --duration 600
CROWD_NPCS=60 npm start                     # y en otra terminal:
npm run loadtest -- --scenario crowd --bots 40 --duration 1200
./scripts/capacity-run.sh                   # concentración 20 min + carga repartida 60 min
```

El diagnóstico de rendimiento devuelve la duración del tick (p50, p95 y p99), el tráfico, las rutas, los cruces, las escrituras y la memoria. Tiene acceso restringido. Para más de 30 bots desde una misma máquina, ajusta el límite de registro en la configuración local de pruebas.

Los resultados y las condiciones de medición están en [`docs/PRUEBAS.md`](docs/PRUEBAS.md).

## Estructura

```
content/            Mundo como datos: zonas, PNJ, diálogos, encargos, roles, atributos, objetos, facciones, textos (es)
shared/src/         Tipos y esquemas compartidos: protocolo (JSON + binario), reglas, proyección iso, rejilla, A*, validación de contenido
server/src/
  db/               Adaptador PostgreSQL/PGlite y migraciones SQL
  game/             Personajes, diálogos, motor de efectos transaccional e idempotente, hechos de distrito, encargos compartidos
  world/            Simulación a 20 Hz: autoridades de zona, índice espacial, PNJ con horario, tareas, traslados, interés por cliente
  net/              API HTTP, estáticos y WebSocket (validación de esquemas, límites, latido)
client/src/         Vista Pixi (bloques bajo demanda, orden topológico, predicción e interpolación), HUD y menús en DOM, audio
tools/loadtest/     Cliente sintético sobre el protocolo real y generador de carga
e2e/                Recorrido con dos navegadores (Playwright)
docs/               Diseño, supuestos, criterios de aceptación y evidencia de pruebas
```
