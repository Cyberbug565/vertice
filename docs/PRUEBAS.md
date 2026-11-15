# Evidencia de pruebas · hito 1

Fecha de las mediciones: 15-11-2026. Versión de contenido `0.1.0`, reglas `reglas-0.1.0`, protocolo 1.

## Entorno de medición y límites

| Elemento | Valor |
| --- | --- |
| Máquina | Contenedor Linux en la nube, **4 vCPU** y 15 GiB de RAM. Servidor, PostgreSQL 16 y generador de carga **en la misma máquina** (la referencia pide el generador fuera) |
| Servidor | Node.js 22.23 + `tsx`, un proceso, PostgreSQL 16.x local |
| Navegador | Chromium headless (Playwright 1.63) con **SwiftShader**: WebGL rasterizado por CPU, **sin GPU**. Los FPS medidos así no representan una GPU integrada real |
| Mapa | Ferro (96 × 64 losetas, 6 sectores) + 3 interiores |
| Poblaciones | *bots* = clientes sintéticos sobre el protocolo real; *PNJ funcionales* = PNJ seleccionables con lógica. En el hito 1 no hay multitud puramente decorativa |

**Pendiente de medir en el entorno de referencia** (servidor de 4 vCPU y 8 GiB con el generador en otra máquina, y cliente con GPU integrada a 1280 × 720). Los comandos están al final.

## Pruebas automatizadas

| Conjunto | Resultado | Comando |
| --- | --- | --- |
| Unitarias: reglas (ejemplo 50 % → 70 % con 2 de Suerte, salud, cromo, Humanidad 60 → 48/43, umbral T), proyección iso inversa, códec binario, A*, validación cruzada del contenido | 11/11 ✔ | `npm test` |
| Integración multijugador sobre el protocolo real (13 casos, ver abajo) | 13/13 ✔ con PGlite y 13/13 ✔ con PostgreSQL | `TEST_DATABASE_URL=… npm test` |
| Dos navegadores reales (11 pasos) | 11/11 ✔ (`e2e/out/resultado.json`) | `npm run test:e2e` |
| Red degradada: RTT 50, 150 y 250 ms, 64 KiB/s, cortes bruscos | 3/3 ✔ | `npm run degraded -w tools/loadtest` |

Casos de integración: validación de creación y vida única · dos jugadores se ven · ruta aceptada, cancelación y colisión · salir a la calle, cruzar un sector y rechazar un destino dentro de un edificio · aceptar el encargo en el bar (interior) · Netrunner hackea con Suerte (cobro único, efecto tras canalizar 3 s) · Solo negocia y el objetivo compartido avisa al otro jugador · la instalación cambia un hecho de distrito para todos · dos decisiones finales con pago por contribución (200 frente a 40 €$), reacciones distintas al volver y decisiones con versión 1 en la base de datos · `opId` repetido no cobra dos veces · reconexión: misma zona, posición, dinero y diario · dos pestañas sin entidad duplicada · reinicio del servidor: saldo, hecho de distrito y libro económico cuadran.

### Red degradada (`loadtest-results/degraded-*.json`)

| RTT | Ack de movimiento (mediana) | Corte antes de llegar la compra | Corte tras aplicarla, antes del ack | Cobros (2 compras) | Deriva de posición al reconectar |
| --- | --- | --- | --- | --- | --- |
| 50 ms | 53 ms | se aplica en el reintento | «Operación ya aplicada» | 2 ✔ | 0 |
| 150 ms | 152 ms | se aplica en el reintento | «Operación ya aplicada» | 2 ✔ | 0 |
| 250 ms | 252 ms | se aplica en el reintento | «Operación ya aplicada» | 2 ✔ | 0 |

## Capacidad del servidor (`loadtest-results/*.json`)

Presupuestos: tick p95 ≤ 25 ms y p99 ≤ 40 ms dentro del intervalo de 50 ms; recepción media ≤ 25 KiB/s en carga repartida y p95 ≤ 70 KiB/s en el punto concurrido (ventanas de 1 s).

| Escenario | Población | Medido | Tick p50 / p95 / p99 / máx | Recepción por cliente: media / p95 (1 s) | Ack de movimiento p95 | RSS | Errores |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Concentración** (mercado) | 40 bots + 85 PNJ en Ferro (60 de multitud en el punto de interés) | 20 min | 1,54 / **2,23** / **2,94** / 23,6 ms | 7,14 / **7,94** KiB/s | 1,0 ms | 216 MiB estable | 0 |
| **Carga repartida** | 100 bots + 29 PNJ | 3 min | 2,28 / **5,12** / **6,50** / 11,7 ms | **3,76** / 7,19 KiB/s | 1,6 ms | 196 MiB | 2 (puerta fuera de vista, el bot reintenta) |
| **Carga repartida, 60 min** | 100 bots + 29 PNJ | **60 min** | 2,19 / **3,33** / **4,54** / 12,9 ms | **2,99** / 5,71 KiB/s | 1,2 ms | 217 → 221 MiB en 48 min | 2 (puerta fuera de vista) |
| Saturación | 500 bots en un solo distrito | 2 min | 21,1 / 31,1 / 35,9 / 75,4 ms | 11,2 / 22,1 KiB/s | 21 ms | 224 MiB | 12 (puerta fuera de vista) |

Actividad en la concentración: 10 546 órdenes de movimiento, 1059 diálogos y 4961 cruces de sector, sin rutas fallidas, clientes lentos ni instantáneas omitidas.
Actividad en la carga repartida de 60 min: 26 109 movimientos, 9542 cruces de puerta, 1213 diálogos, 532 compras y 944 reconexiones deliberadas. Al terminar, la base de datos tenía 2156 personajes con **0 descuadres** entre saldo y libro económico, ningún inventario negativo y 20 088 traslados registrados. La memoria crece ligeramente (+4 MiB en 48 min) dentro de cachés acotadas; queda anotado para vigilarlo en sesiones más largas.
Actividad en la carga repartida de 3 min: 1451 movimientos, 508 cruces de puerta, 101 compras y 62 reconexiones deliberadas.

**Capacidad declarada (con estas condiciones):** 100 sesiones repartidas y 40 sesiones + 85 PNJ en el mismo punto de interés cumplen el presupuesto con mucho margen en un solo proceso. 500 sesiones **en un solo distrito de 96 × 64** cumplen el p99 (36 ms ≤ 40) pero no el p95 (31 ms > 25). El objetivo de 500 supone jugadores repartidos por toda la ciudad, con varias autoridades de zona. Se evaluará cuando existan más distritos.

## Cliente (`e2e/out/client-perf-low.json`)

| Métrica | Valor | Nota |
| --- | --- | --- |
| Descarga hasta tener control (en frío) | 737 KiB sin comprimir · **196 KiB con brotli** (compresión activa en el servidor: index 0,4 + JS 58 + Pixi 135 + CSS 2 KiB) | Presupuesto ≤ 6 MiB comprimidos |
| Tiempo hasta tener control | en frío 1,6 s (incluye registrar y crear personaje) · en caché 0,5 s | localhost |
| Coste de CPU por fotograma en el punto concurrido, calidad baja, 1280 × 720, 112 entidades visibles | media 0,55 ms · p95 0,62 ms | Lógica JS: interpolación, orden topológico de profundidad, animación |
| FPS con SwiftShader | ≈ 19 | Rasterizado por CPU, **no representativo**; pendiente medir con GPU integrada |
| Recepción del cliente en el punto concurrido | 7,0 KiB/s de media | |

## Regresión registrada: 500 sesiones en un distrito

- **Escenario reproducible:** `AUTH_RATE_LIMIT=100000 AMBIENT_NPCS=24 npm start` y `npm run loadtest -- --scenario spread --bots 500 --duration 120 --warmup 40`.
- **Medición inicial:** tick p95 57,8 ms y p99 67,4 ms, por encima del intervalo de 50 ms.
- **Causa medida** (perfil `--cpu-prof` con 300 bots): de la CPU ocupada, el 37 % se iba en `writev`, es decir, en escrituras de socket por cada mensaje pequeño de cada cliente. El 36 % se iba en `step` y `snapshot`, porque todas las instantáneas caían en el mismo tick. La codificación con asignaciones de objetos sumaba otro 2 %.
- **Cambios:** una sola escritura por cliente e instantánea (`cork`/`uncork`); posiciones a 5 Hz para entidades a más de 12 losetas, con entrega garantizada de la posición final; instantáneas repartidas entre ticks consecutivos (cada cliente sigue a 10 Hz); codificación directa en un búfer reutilizado.
- **Resultado:** tick p95 de 57,8 a **31,1 ms**, p99 de 67,4 a **35,9 ms**, recepción media de 14,5 a 11,2 KiB/s. Tras los cambios, las pruebas de integración siguen pasando 24/24.

## Repetir las mediciones

```bash
# Servidor (en la máquina de referencia)
AUTH_RATE_LIMIT=100000 AMBIENT_NPCS=24 CROWD_NPCS=60 npm start
# Generador (en otra máquina)
npm run loadtest -- --base http://SERVIDOR:8080 --token ADMIN_TOKEN --scenario crowd --bots 40 --duration 1200
npm run loadtest -- --base http://SERVIDOR:8080 --token ADMIN_TOKEN --scenario spread --bots 100 --duration 3600
# Todo seguido en una máquina:
./scripts/capacity-run.sh
# Cliente en el punto concurrido (servidor con CROWD_NPCS=60 y bots activos):
QUALITY=low BASE_URL=http://SERVIDOR:8080 node e2e/client-perf.mjs
# Red degradada:
npm run degraded -w tools/loadtest -- --target 8080 --rtts 50,150,250 --kbps 64
```
