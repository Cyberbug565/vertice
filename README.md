# Vértice — RPG multijugador persistente isométrico (alfa v0.12)

Novedades de la v0.12 (E para interactuar y clic en puertas arreglado, sin teletransportes al rodar ni retrocesos al andar, personajes 3D con más polígonos y movimientos fluidos, Rafa «Brasas» y CARMÍN como fantasmas que aparecen y desaparecen, estela de Kairós en 3D, 51 modelos de armas y 10 armas nuevas): [`docs/NOVEDADES-v0.12.md`](docs/NOVEDADES-v0.12.md). Novedades de la v0.11 (personajes modelados en 3D con animaciones y cromo visible, edificios más altos y personajes más pequeños, edificios de delante transparentes, colisiones invisibles arregladas, calles y aceras que se distinguen de día y de noche, más variedad de edificios y callejones en L y Z): [`docs/NOVEDADES-v0.11.md`](docs/NOVEDADES-v0.11.md). Novedades de la v0.10 (sigilo: los PNJ solo te detectan si te ven o te oyen, ruido por arma, sospecha, descripciones y caras, disfraces, arcos detectores que no ven el cromo, ruleta de armas, armas visibles a la espalda y la cadera, barra de sigilo y quién te busca, Banco Central y Penal de Hierro): [`docs/NOVEDADES-v0.10.md`](docs/NOVEDADES-v0.10.md). Novedades de la v0.9 (solo WASD y clic a distancia, modo hackeo con R, esquiva, patada y golpe fuerte, balas y sangre más visibles, personaje detallado con tejidos y tatuajes reales, 100 prendas y 102 implantes nuevos con ranuras dobles, Onda Carmín renovada, sonido y música sintetizados, Nivel 2 de pasarelas, iluminación dinámica, rótulos y más PNJ): [`docs/NOVEDADES-v0.9.md`](docs/NOVEDADES-v0.9.md). Novedades de la v0.8.1 (cuenta de administración del dueño y objetos míticos únicos: solo se consiguen matando a quien los lleva): [`docs/NOVEDADES-v0.8.1.md`](docs/NOVEDADES-v0.8.1.md). Novedades de la v0.8 (ciberpsicosis que dura semanas, rarezas e implantes míticos, tres leyendas con sus encargos, zócalo de matrices, ciberespacio y el Velo, aceleradores Kairós que ralentizan el tiempo y cuenta de pruebas con menú de trucos): [`docs/NOVEDADES-v0.8.md`](docs/NOVEDADES-v0.8.md). Novedades de la v0.7 (WASD, apuntar y bloquear con el clic derecho, panel del cuerpo para curarte por zonas, teclas configurables, chat local y global, nuevo aspecto cyberpunk, más caras, recompensas que publica la ciudad, maleantes, policía que llega según la distancia, ciberpsicópatas y ciberpsicosis): [`docs/NOVEDADES-v0.7.md`](docs/NOVEDADES-v0.7.md). Novedades de la v0.6 (combate por zonas del cuerpo con heridas, desangrado y amputaciones, armas visibles con balas trazadoras, límite de armas y maletero, cámaras que te identifican, zonas verde/amarilla/roja/negra, buscador de personas y destino marcado, más muebles para cubrirse, más cuerpos y peinados e historia del personaje): [`docs/NOVEDADES-v0.6.md`](docs/NOVEDADES-v0.6.md). Las de la v0.5 (ciudad única más grande, día y noche de 1 h 30, correr, modo automático, puestos fijos con horario, torres por plantas y bases de bandas): [`docs/NOVEDADES-v0.5.md`](docs/NOVEDADES-v0.5.md). Las de la v0.4 (niveles, habilidades 1–25 y perks, pantalla de personaje, ropa, casas, coches, mercado en tiempo real, cromo con habilidades y calles con carriles): [`docs/NOVEDADES-v0.4.md`](docs/NOVEDADES-v0.4.md). Las de la v0.3: [`docs/NOVEDADES-v0.3.md`](docs/NOVEDADES-v0.3.md). Las de la v0.2: [`docs/NOVEDADES-v0.2.md`](docs/NOVEDADES-v0.2.md). Publicarlo en internet: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

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
| Menú de trucos (solo cuentas de administración: `mataxhustaadmin` y `admintester`) | — | `º` o `F10` |
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

`/api/metrics` devuelve la duración del tick (p50, p95 y p99), el tráfico, las rutas, los cruces, las escrituras y la memoria. Solo responde desde localhost o con `?token=ADMIN_TOKEN`. Las pruebas de carga para más de 30 bots requieren arrancar el servidor con `AUTH_RATE_LIMIT=100000`, porque todos los bots registran sus cuentas desde la misma IP.

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
