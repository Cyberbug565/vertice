# Diseño técnico y supuestos · hito 1

## Qué hay en este corte

Corte jugable de **Ferro**, el distrito portuario de Ciudad Vértice. Es el equivalente original del corte de Watson que pide el prompt maestro:

- **Exterior** de 96 × 64 losetas, dividido en 6 sectores de 32 × 32. Tiene muelles, un canal con dos puentes, avenidas, el Mercado Lumen, el desguace vallado y 25 edificios con silueta, paleta y letreros propios.
- **Tres interiores** con puerta y salida, colisiones, navegación y un servicio con estado: el vestíbulo del Bloque 9 (zona de inicio y descanso), el bar El Relé (la fixer Nadia) y la Clínica Sato (revisión y estimulantes; el quirófano llega en el hito 2).
- **Cinco PNJ con identidad** (Nadia, Lin, Tomás, Doc Sato y Reme). Lin sigue un horario: trabaja en el mercado de 7 a 19 h, pasa la tarde en El Relé y duerme en el Bloque 9, y cruza puertas por su cuenta. Hay además 24 transeúntes con lógica compartida y parámetros, y una multitud configurable (`CROWD_NPCS`) para las pruebas de concentración.
- **Un encargo compartido**, «Luz para el Mercado Lumen». Tiene dos decisiones, una salida pacífica, opciones propias del Solo, el Netrunner y el Tech, una tarea autónoma, y consecuencias personales y de distrito que se pueden comprobar al volver.
- **Los diez roles** son seleccionables y tienen descripción, ingresos, primer trabajo y aportación de grupo. En el hito 1, Solo y Netrunner (más Tech) tienen opciones diferenciadas. El resto usa las rutas comunes: pagar o trabajar.

## Criterios de aceptación del hito 1 y estado

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Dos o más personas desde navegadores distintos coinciden en las mismas calles | ✔ | `e2e/two-browsers.mjs`, prueba de integración «dos personas…» |
| Cruce de sectores | ✔ | Mensaje `sector` al cruzar un límite de bloque de 32 × 32; métrica `sectorCrossings` |
| Dos interiores con salida (hay tres) | ✔ | Integración y e2e: vestíbulo → calle → bar → calle |
| Al menos un PNJ con rutina | ✔ | Lin (horario y cambio de zona por puertas) y transeúntes |
| Encargo compartido | ✔ | Integración: dos participantes en la misma instancia; objetivo compartido notificado al otro |
| Movimiento autónomo por clic | ✔ | Ruta del servidor, predicción local, aproximación automática a puertas y PNJ, tarea de cargar cajas |
| Solo y Netrunner con una primera opción diferenciada | ✔ | Integración: «Netrunner: entra en el terminal…» y «Solo: negocia con Tomás…» |
| Persisten personaje y progreso al reconectar | ✔ | Integración: reconexión, dos pestañas y reinicio del servidor con PostgreSQL |

## Arquitectura

```
navegador (Vite + PixiJS/WebGL2 + DOM)  ──WebSocket──►  Node.js (un proceso)
  intenciones: move/interact/choose/…                     net/     validación zod, límites, latido, contrapresión
  ◄── JSON (control) + binario (posiciones)               world/   tick 20 Hz, autoridades de zona, índice espacial
                                                          game/    efectos transaccionales, hechos, encargos
                                                          db/      PostgreSQL (o PGlite)  ◄── contenido validado al arrancar
```

- **El servidor es la autoridad.** El cliente solo envía intenciones. Cada orden lleva su secuencia y recibe un `ack` con la ruta aceptada o el motivo del rechazo. Las operaciones persistentes llevan un `opId` y quedan registradas en `ops`: un reintento devuelve «ya aplicada» y no vuelve a cobrar.
- **Simulación** a 20 Hz con paso fijo y recuperación acotada si el proceso se retrasa. Las decisiones de PNJ van escalonadas: a 4 Hz si hay jugadores en la zona y a 1 Hz si no. Las rutas de PNJ tienen un presupuesto por tick (40) y una caché de 3000 rutas comunes. El A* sobre rejilla tiene un límite de expansiones y suaviza la ruta por línea de visión.
- **Interés por cliente.** Cada cliente recibe las entidades de su zona en un radio de 22 losetas, mediante celdas de 8 × 8. Al entrar y salir del radio recibe aparición y desaparición en JSON; las posiciones viajan en binario (9 bytes por entidad). Las entidades a menos de 12 losetas se actualizan a 10 Hz y las lejanas a 5 Hz, y la posición final al detenerse siempre se entrega. Las instantáneas se reparten entre ticks consecutivos y se agrupan en una sola escritura por cliente (cork/uncork). Si el búfer del cliente supera 256 KB se omiten las posiciones, que son el último estado y se reenvían después; por encima de 2 MB se cierra la conexión con el motivo «cliente lento».
- **Traslados entre autoridades** (puertas). Primero se confirma en la base de datos la nueva zona y posición y se registra en `zone_transfers`; solo entonces cambia el propietario en memoria. Si la escritura falla, el origen sigue siendo el propietario y el jugador recibe un aviso.
- **Reconexión.** Al abrir una segunda pestaña, la sesión nueva toma la misma entidad y la anterior recibe `kicked`. Al desconectarse en zona protegida, el personaje se retira y se guarda al instante; en zona pública permanece `LINGER_SECONDS` (10 s) en el mundo antes de retirarse.
- **Persistencia.** PostgreSQL guarda cuentas, sesiones, vidas, inventario, reputación, marcas personales, el libro económico, tiradas, instancias de encargo, progreso, decisiones, hechos de distrito y traslados. El movimiento de alta frecuencia vive en memoria y se guarda cada 15 s, al cruzar puertas y al desconectar.
- **Contenido.** `content/` se valida dos veces: con esquemas zod y con validación cruzada (puertas con destino transitable y regreso, horarios que cubren las 24 h, condiciones y efectos con identificadores existentes, traducciones presentes). El cliente empaqueta el mismo contenido y su huella se compara en el saludo. Si no coincide, pide recargar.

## Valores provisionales (configurables)

| Valor | Dónde |
| --- | --- |
| 55 puntos de creación, atributos 2–8, niveles 1–30 | `shared/src/rules.ts` |
| Salud 25 + 5×BODY + 3×WILL; aguante 40 + 4×BODY + 2×WILL; carga 20 + 6×BODY | `rules.ts` |
| Capacidad de cromo 18 + 2×TECH + BODY; Humanidad 10×EMP; umbral T con límites [40, 70] | `rules.ts` (fórmulas probadas; la mecánica completa llega en el hito 2) |
| Tirada atributo + habilidad + 1d10 (+ rango de rol + Suerte, máx. 4 por tirada) ≥ dificultad | `rules.ts`, `game/effects.ts` |
| Marcha 2,6 losetas/s con MOVE 5 (±0,12 por punto); 1 loseta = 1 unidad de mundo | `rules.ts` |
| 1 hora de juego = 60 s reales | `content/manifest.json` |
| Radio de interés 22 losetas; cerca 12; espera tras desconexión 10 s | `.env` |
| Pago del 50 % sin contribución verificable a un objetivo compartido | `game/effects.ts` |

## Supuestos que afectan a la experiencia

1. Una cuenta tiene **una vida activa**. La muerte no existe todavía en el hito 1, pero el esquema ya la contempla: el estado `dead` es terminal, hay un índice único de vida activa por cuenta y existe la tabla `memorial`.
2. El encargo **no se repite** por personaje y se **cierra mientras el mercado tiene luz** (90 minutos reales, o 120 si lo instaló un Tech). Cuando el hecho caduca, el generador vuelve a fallar y se abre una instancia nueva.
3. La prueba que obtiene el Netrunner en el terminal no cuenta como contribución a un objetivo compartido. Solo cuentan conseguir la pieza e instalarla. Habría que decidir si las pruebas o el apoyo deben puntuar.
4. Una tirada se compromete una sola vez por personaje y clave. Repetir la opción reutiliza el resultado, para que no se pueda tirar hasta acertar.
5. Los objetos apilables se guardan como fila por definición. Las instancias únicas con historial (implantes, artefactos) llegan con el ciberware en el hito 2.
6. Las zonas disputadas y el PvP no están activos. La interfaz ya muestra el nivel de peligro por loseta y pide confirmación al cruzar una puerta hacia zona disputada.

## Edición y propiedad intelectual

El prompt maestro pide reconstruir Night City y usar personajes y objetos de Cyberpunk 2077 y Edgerunners: V, Relic, Johnny Silverhand, Capri, Afterlife, la clínica de Viktor… Eso sería recrear los niveles y personajes de un juego existente, y las directrices de contenido de fans de CD PROJEKT RED excluyen expresamente los videojuegos. Por eso este repositorio implementa la **edición de universo original** que el propio prompt exige que el motor soporte:

- **Ciudad y lugares:** Ciudad Vértice y el distrito Ferro, con locales, nombres y trazado propios.
- **Roles:** los diez se presentan con nombres genéricos del género y habilidades redactadas de nuevo. Los atributos usan las abreviaturas pedidas.
- **Moneda:** eurocréditos (€$).
- **Facciones:** propias (Los Chatarreros, Hojas Rojas, Policía de Ciudad Vértice, Rescate Ámbar, Halcón Dynamics, Grupo Okami, Asociación del Mercado Lumen…).
- **Arte y audio:** todo es procedural y original.

El motor no contiene ningún dato de mundo en el código. Si en el futuro se consigue una licencia para una edición con otra ambientación, bastaría con cambiar `content/`.

## Decisiones abiertas para la dirección del proyecto

1. Confirmar la edición original como base del proyecto y el nombre de la ciudad.
2. Decidir si las pruebas o el apoyo (como el hackeo del Netrunner) deben contar como contribución al reparto de un encargo de grupo.
3. Fijar la duración del día de juego: ahora 24 minutos reales, y una sesión de 10–20 minutos recorre casi un día entero.
4. Decidir cómo se repiten los encargos de distrito: ahora una vez por personaje.

## Pendiente que afecta al hito 1

- **Medir en el entorno de referencia**: servidor de 4 vCPU y 8 GiB con el generador en otra máquina, y cliente con GPU integrada a 1280 × 720. Las mediciones actuales son de un contenedor sin GPU y con el generador en la misma máquina (ver `docs/PRUEBAS.md`).
- **Cobertura de PNJ en la prueba de navegador**: la e2e no recorre todavía el encargo completo (lo cubre la integración por protocolo). Falta comprobar en navegador la canalización del Netrunner y la recompensa.
- **Reloj de la ciudad**: Lin solo está en el mercado de 7 a 19 h de juego (12 minutos reales de cada 24). Si alguien llega de noche, el diálogo con ella queda en el Bloque 9.

## Siguiente hito (2 · sistemas de supervivencia), en orden propuesto

1. Ficha completa y ciberware: catálogo de grados I–V, instancias equipadas con historial, cirugía transaccional en la Clínica Sato, carga de Humanidad e inestabilidad.
2. Combate automático en el servidor con posturas, cobertura y retirada. Derribo con ventana de rescate de 30 s, Medtech estabilizando y muerte definitiva idempotente. Pruebas de daño duplicado, muerte al cruzar un sector, curación y golpe fatal en el mismo tick, y botín disputado.
3. Acelerador neural (equivalente original del Sandevistan), cyberdeck con RAM y cola, quickhacks sobre una red de 3–5 nodos y protección neural.
4. Zonas disputadas con confirmación individual y rutas por defecto que las evitan.
