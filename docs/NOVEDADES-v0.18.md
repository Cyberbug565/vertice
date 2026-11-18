# Vértice v0.18 — Cada tiro cuenta

## Salud y heridas, al estilo de los juegos de supervivencia

La salud y las heridas van por separado.
- Cada golpe quita salud en el momento y además **deja una herida en una parte del cuerpo**: cabeza, torso, brazos, manos o piernas.
- Cada herida tiene su tipo, sangra a su manera y necesita su propio tratamiento.

### Tipos de herida

| Herida | Cuándo sale | Cómo sangra | Qué necesita | Tarda en curar |
|---|---|---|---|---|
| **Rasguño** | Arma de filo, golpe flojo | Poco; para sola en un minuto | Una venda para que no se infecte | 1 día de juego |
| **Corte** | Arma de filo, golpe medio | Bastante; baja poco a poco | Venda; la sutura acelera la curación | 3 días |
| **Corte profundo** | Arma de filo, golpe fuerte | Mucho, hasta tratarlo; vendado sigue sangrando algo | **Venda y sutura**: sin sutura no cierra | 2 semanas |
| **Herida de bala** | Armas de fuego | Sangra hasta vendarla; la bala suele quedarse dentro | **Sacar la bala con pinzas** y vendar | 1 semana |
| **Contusión** | Golpes, puños, porras | No sangra | Nada: cura sola | 1 día |
| **Quemadura** | Explosivos | No sangra | Vendar y desinfectar | 3 días |
| **Amputación** | Filo, explosivo o gran calibre contra un miembro destrozado | Muchísimo | Venda para cortar la hemorragia. **No cura nunca**: un matasanos tiene que implantarte el miembro | — |

### Lo que cambia al jugar

- **La salud no se regenera sola.**
  - Solo vuelve **durmiendo**, comido, bebido y con **todas las heridas curadas**.
  - Una amputación sin prótesis impide recuperar salud.
- **Vendas:**
  - cortan la hemorragia de la herida que vendas;
  - sin vendar, las heridas no curan y **se infectan**;
  - una venda se ensucia a las 18 horas de juego y hay que cambiarla.
- **Infección:**
  - una herida infectada no cura y te va quitando salud;
  - la cortan los **antibióticos**;
  - el **desinfectante** protege la herida un día.
- **Sutura y pinzas:**
  - con poca Medicina pueden fallar: duele y la herida sangra más;
  - las pinzas no se gastan.
- **Estimulante:**
  - no cura ninguna herida: da **+30 de salud temporal** durante unos minutos, para llegar a algún sitio;
  - cuando se pasa el efecto, esa salud se va.
  - Analgésicos, adrenalina y biomonitor también dan salud temporal.
- **Estabilizador:** corta de golpe la hemorragia de todas las heridas.
- **Matasanos:**
  - servicio nuevo **«Curar heridas»**: saca balas, sutura, desinfecta, venda y da antibióticos;
  - las amputaciones se arreglan implantando una prótesis.
- **Nanobots sanguíneos y perks de medicina:** ya no regeneran salud; ahora **aceleran la curación** de las heridas y lo que recuperas durmiendo.
- **Material nuevo:**
  - kit de sutura, pinzas quirúrgicas, desinfectante y antibióticos;
  - se venden en la Farmacia (sutura y desinfectante también en el 24 h);
  - aparecen a veces en cadáveres.

### Ventana de salud (tecla H)

- **Silueta de frente:**
  - cada zona se colorea según su peor herida: amarilla leve, naranja, roja grave, verde infectada, granate amputada, cian cromo;
  - las **vendas se ven dibujadas** encima;
  - salen **gotas** donde sangras.
- **Panel de estado:**
  - **estado general** y salud (con la salud temporal y lo que le queda);
  - **dolor**;
  - **hemorragia** total.
- **Lista de heridas por zona:**
  - tipo de herida y su estado (sangra, bala alojada, suturada, vendada, venda sucia, infectada, desinfectada);
  - barra de **curación** con el tiempo que le queda, o el motivo por el que no cura;
  - barra de **infección**.
- **Menú de tratamiento:**
  - se abre con clic derecho (o clic) en una herida;
  - muestra solo lo que tiene sentido para esa herida y cuántas unidades llevas.
  - Accesos directos a antibióticos, estabilizador y estimulante.
- La silueta pequeña sigue en el HUD; al hacer clic se abre la ventana.

Así el PvP es peligroso de verdad: un tiroteo te deja días de recuperación, vendas que cambiar y, si te cortan un brazo, una visita obligada al matasanos.

## Cuenta de administración

- **La superarmadura «Tormenta» ya está en tu mochila** (inventario → Ropa). Al ponértela se pide confirmación.
- **Menú de trucos:** genera **cualquier objeto**, matriz o implante.
  - Filtro por categoría y contador de resultados.
  - Lista con desplazamiento: hasta 400 resultados de una vez.

## El otro «Tormenta»

Había otros dos objetos con el mismo nombre que la superarmadura. Se han renombrado:

| Antes | Ahora |
|---|---|
| SO «Tormenta» (ciberware) | **SO «Relámpago»** (su habilidad también se llama «Relámpago») |
| Haori urbano «Tormenta» | **Haori urbano «Aguacero»** |

Los identificadores internos no cambian: quien ya los tenía los conserva.

## Ropa y peinados mejor encajados

- **Chaquetas, americanas, trajes y gabardinas, abiertas de verdad:**
  - se ve la camiseta de debajo de arriba abajo;
  - abertura recta con **solapas en V** y vista más oscura en el borde.
- **Cierres:**
  - **cremallera** en bomber, cazadora motera (cruzada), cortavientos, chubasquero y mono;
  - **botones** en camisas, chalecos y abrigos.
- **Detalles:**
  - **puños y bajo elásticos** en sudaderas y bombers;
  - **bolsillos de parche** con solapa;
  - **bolsillo canguro** en las sudaderas;
  - costuras laterales.
- **Más holgura** en chaquetas, bombers, sudaderas y trajes: ya no parecen un jersey pintado.
- **Bajo recto a la altura del cinturón.** Antes las camisetas y sudaderas bajaban en pico hasta la entrepierna, como un body.
- **Peinados de la colección:**
  - debajo llevan una base de pelo pegada al cráneo, así que ya no asoma el cuero cabelludo entre mechones;
  - son un poco más grandes y van algo más bajos, para que la cabeza no se salga por arriba.

## Técnico

- **Compartido:**
  - `shared/src/body.ts` con el modelo de heridas: `Wound`, `WOUND_INFO`, `TREATMENTS`, `treatmentsFor`, `woundStatus`, `woundList`, `effectiveBleed`, `painOf` y `woundCarePrice`;
  - las partidas antiguas convierten el daño por zonas en contusiones.
- **Servidor:**
  - `server/src/world/wounds.ts` reescrito: `hit`, `tick`, `hourly`, `treat`, `stabilize`, `antibiotics` y `restore`;
  - `survival.ts`: sin regeneración automática, salud temporal (`tempHp`), `treatWound` y `clinicHeal`.
- **Protocolo:**
  - `treat` ahora lleva `{ wound, action }`;
  - mensaje nuevo `clinicHeal`;
  - la ficha incluye `body.list`, `tempHp` y `pain`.
- **Cliente:**
  - `client/src/ui/body.ts`: ventana de salud nueva;
  - `clothes3d.ts`: confección en el sombreado (abertura, cierres, puños, bolsillos y costuras) y base de pelo.
- **Pruebas:**
  - `server/test/v18.test.ts` (7 pruebas de heridas, tratamientos, infección, curación, salud que no vuelve sola y estimulantes);
  - `v07` reescrita para el nuevo tratamiento;
  - `v08` comprueba la Tormenta del admin y generar matrices y objetos;
  - total: 129/129 en serie;
  - e2e de dos navegadores y de controles: OK.
- **Capturas:** `e2e/shots-v18.ts`.
