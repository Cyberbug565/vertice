# Vértice — RPG multijugador persistente isométrico (alfa v0.2)

Novedades y guía de pruebas de la v0.2: [`docs/NOVEDADES-v0.2.md`](docs/NOVEDADES-v0.2.md). Publicarlo en internet: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

RPG de ambientación cyberpunk que se juega en el navegador. Es persistente, multijugador, con cámara isométrica 2.5D y control por clic. El servidor es autoritativo: Node.js con WebSocket y PostgreSQL. El cliente usa TypeScript, Vite y PixiJS 8 sobre WebGL 2.

> **Edición:** universo original (Ciudad Vértice, distrito Ferro). El motor no conoce ningún lugar concreto: el mapa, los roles, los diálogos, los encargos y las facciones viven en `content/` como datos validados. Más detalles en [`docs/DISENO.md`](docs/DISENO.md#edicion-y-propiedad-intelectual).

## Requisitos

- Node.js ≥ 22.12 y npm 10.
- PostgreSQL 16, de forma **opcional**. Si `DATABASE_URL` está vacío, el servidor usa PGlite, un PostgreSQL embebido en `./data/pglite`.
- Navegador de escritorio con WebGL 2 (Chrome, Edge o Firefox recientes).

## Arranque reproducible

```bash
npm ci
cp .env.example .env          # ajusta DATABASE_URL o déjalo vacío para usar PGlite
docker compose up -d db       # opcional: PostgreSQL 16 local
npm run db:migrate            # crea el esquema (también se aplica al arrancar)
npm run build                 # compila el cliente en client/dist
npm start                     # http://localhost:8080
```

Para desarrollo con recarga en caliente, ejecuta `npm run dev` y abre http://localhost:5173. Vite redirige `/api` y `/ws` al servidor del puerto 8080.

## Dos jugadores en la misma ciudad

1. Abre http://localhost:8080 en una ventana normal **y** en una ventana de incógnito o en otro perfil del navegador. Cada perfil guarda su propia sesión.
2. En cada ventana: **Crear cuenta** → **Crear personaje**. Elige, por ejemplo, *Solo* en una y *Netrunner* en la otra.
3. Los dos aparecéis en el vestíbulo del Bloque 9, que es zona protegida, y os veis. Escribid en el chat local con Enter.
4. Para jugar desde otro ordenador de la red, abre `http://IP-DEL-SERVIDOR:8080`.

## Controles

| Acción | Ratón | Teclado / alternativa accesible |
| --- | --- | --- |
| Moverse | Clic izquierdo en el suelo | — |
| Hablar, entrar o examinar | Clic en la persona, puerta u objeto. El personaje se acerca solo | `Tab` / `Mayús+Tab` selecciona lo cercano y `E` o `Espacio` interactúa. Opciones de diálogo con 1–9 |
| Cancelar la orden | Clic derecho | `S` o el botón **Cancelar** |
| Retirada al refugio protegido más cercano | — | `R` o el botón **Retirada** |
| Diario, ficha, inventario, mapa | — | `J`, `C`, `I`, `M` |
| Dormir o despertar | — | `Z` o el botón **Dormir** |
| Empleos, mercado, recompensas | — | `O`, `K`, `B` |
| Robar, agredir, cobrar recompensa o estabilizar | Clic sobre otra persona o un fugitivo | Menú de acciones con probabilidades |
| Chat local | — | `Enter` |
| Zoom | Rueda | `+` / `−` |

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
