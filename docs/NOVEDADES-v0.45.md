# Vértice v0.45: conducción con peso, taller de coches y HUD más limpio

## 1. HUD limpio al mirar por una mira

Con una mira montada, al apuntar (clic derecho en tercera o primera persona) desaparece todo el HUD. Solo quedan las barras de **salud** y **aguante**. Al dejar de apuntar, todo vuelve. Sin mira no cambia nada: se apunta con el punto.

## 2. Salud, aguante y necesidades

- **Salud y aguante:** son dos barras continuas sobre la imagen, sin el panel negro de detrás.
  - Al recibir un golpe, lo perdido se queda un instante en un tono claro y luego se va, para que se note.
  - Por debajo del 25 %, la barra late.
- **Hambre, sed y sueño:** son tres círculos con su icono (cubiertos, gota y luna).
  - El anillo de cada uno está lleno cuando estás bien y **se vacía a medida que la necesidad aprieta**.
  - Por debajo del 25 % se pone rojo; al borde, parpadea.
- **Cifras:** los números salen solo mientras mantienes **Alt**. La tecla se puede cambiar en Teclas → «Ver cifras».
- El panel del personaje (nombre, nivel, dinero…) baja un poco y ya no repite estas barras.

## 3. Conducción

### Qué se ha analizado

**GTA V.** Lo que lo hace divertido es que responde enseguida:
- el coche gira mucho a poca velocidad y la dirección se suaviza al ir rápido;
- el freno de mano hace pivotar el coche;
- hay ayudas invisibles que lo enderezan si contravolanteas un poco.

Lo que le falta: el peso. Un todoterreno y un deportivo se diferencian sobre todo en la punta, casi todos frenan igual y la carrocería apenas se mueve.

**GTA VI (por lo que se ha mostrado).** Va hacia más peso: suspensiones que trabajan, carrocerías que se inclinan en las curvas y cabecean al frenar, y coches pesados que se sienten pesados. No se ha intentado copiar nada concreto, solo esa dirección.

**Juegos de carreras.**
- Los arcade-simulación (estilo Forza Horizon) consiguen que el derrape apetezca pero haya que ganárselo: el agarre se acaba de forma progresiva y se recupera contravolanteando.
- Los simuladores puros castigan cada error. Para una ciudad con policía y tráfico es demasiado.
- Los arcade puros (estilo Burnout) dan sensación de velocidad con la cámara y el sonido más que con la física.

**La vida real.** Lo que más se nota al volante:
- **Peso:** inercia al girar y frenadas más largas.
- **Reparto de masas:** al frenar se carga el morro y el coche gira mejor; al acelerar se descarga.
- **Tracción:**
  - delantera: se va de morro (subviraje);
  - trasera: suelta la cola si das gas en curva (sobreviraje);
  - total: aplomo.
- **Agarre:** cada neumático tiene un límite y no puede empujar y girar a la vez al máximo (el «círculo de fricción»).

**El intermedio elegido:**
- controles directos y ayudas de GTA V;
- peso, balanceo y diferencias de tracción reales;
- un derrape progresivo y controlable de arcade-simulación;
- velocidad que se siente por la cámara, el sonido y las marcas.

### Cómo funciona (`shared/src/driving.ts`)

El servidor y el cliente calculan lo mismo. Así el coche responde al instante en tu pantalla y no se puede hacer trampa.

El coche tiene un **rumbo** (hacia dónde apunta el morro) y una **velocidad** (hacia dónde se mueve de verdad):
- el volante gira el morro;
- los neumáticos intentan que la velocidad siga al morro, pero solo hasta su agarre;
- si pides más, el coche desliza.

Además:
- **Dirección:** se suaviza con la velocidad; con teclado, el volante se mueve a un ritmo (más rápido al soltar).
- **Peso:** cuanto más pesa el coche, más tarda en girar, acelerar y frenar, más rueda sin gas y menos rebota al chocar.
- **Reparto de masas:**
  - frenando, el coche entra mejor en la curva;
  - acelerando, un tracción delantera subvira.
- **Círculo de fricción:** gas a fondo en plena curva suelta la cola de un propulsión trasera.
- **Freno de mano:** bloquea atrás y el coche pivota.
- **Ayuda de estabilidad:** si la cola se va, el coche contravolantea un poco por ti. Ayuda más en un coche de lujo y menos en un superdeportivo.
- **Marchas:** al subir de marcha hay un instante sin empuje (se oye y se nota el tirón). El par cambia dentro de cada marcha.
- **Choques:** el coche rebota según su peso y la cámara tiembla.
- **Levitación:** los vehículos que levitan agarran menos, flotan y derrapan largo, no tienen freno motor y no dejan marcas.

### Cada tipo se conduce distinto

| Tipo | Peso | Tracción | Cómo se siente |
|---|---:|---|---|
| Moto | 210 kg | Trasera | Gira en nada; en curva se inclina hacia dentro; el freno de mano solo ayuda un poco |
| Utilitario | 1.100 kg | Delantera | Noble: se va de morro y no da sustos; el freno de mano lo cruza un poco |
| Furgoneta / pick-up | 2.400 kg | Trasera | Lenta de reacciones, balancea mucho y frena largo |
| Deportivo | 1.350 kg | Trasera | Ágil; con gas a fondo en curva suelta la cola |
| Rally (buggy, Bisonte) | 1.250 kg | Total | Derrapes largos, fáciles de sostener y de recuperar |
| Todoterreno | 2.200 kg | Total | Aplomado, pesado; balancea |
| Lujo | 2.050 kg | Trasera | Suave y blando, con mucha ayuda de estabilidad |
| Blindado | 2.700 kg + blindaje | Total | Un muro: tarda en todo y casi no derrapa |
| Superdeportivo | 1.450 kg | Total | Agarre y carga aerodinámica brutales; cuando se va, se va de golpe |

Coches con carácter propio:
- **Espectro:** propulsión trasera y mal genio.
- **Halcón Negro:** muy de cola.
- **Escoria:** el camión de bomberos, 5.200 kg.
- **Sakura:** limusina larga.
- **Uro:** seis ruedas.

**Banco de pruebas** (`npx tsx tools/conduccion-banco.ts`, extracto):

| Coche | Masa | De 0 al 95 % de punta | Freno de mano (deriva máx.) | Gas a fondo en curva |
|---|---:|---:|---:|---:|
| Vidal Pulga (utilitario) | 1.100 kg | 4,5 s | 14° | 0° (se va de morro) |
| Marrow Garza (deportivo) | 1.350 kg | 3,5 s | 61° | 21° |
| Orca Coyote (rally) | 1.470 kg | 3,7 s | 55° | 16° |
| Saeta Relámpago (superdeportivo) | 1.450 kg | 3,8 s | 76° | 9° (tracción total) |
| Marrow Espectro (superdeportivo, trasera) | 1.450 kg | 3,7 s | 79° | 21° |
| Brennan Escoria (antiguo camión de bomberos) | 6.300 kg | 6,6 s | 9° | 0° |

### Mandos

Al volante, WASD dejan de ser direcciones y pasan a ser pedales y volante, como en GTA. Funciona igual en las tres cámaras.

| Tecla | Acción |
|---|---|
| W | Acelerar |
| S | Frenar; parado, marcha atrás |
| A / D | Volante |
| Espacio | Freno de mano |

### Cámara, sonido y efectos

**Cámara de persecución (tercera persona):**
- va detrás del coche con algo de retraso: los pesados la giran más despacio;
- mira un poco hacia donde derrapas;
- se aleja y abre el ángulo con la velocidad;
- tiembla al chocar;
- si giras la vista con el ratón, te deja mirar un momento y vuelve detrás.

**Primera persona:** cámara de capó.

**Carrocería:** se balancea en las curvas (una moto se inclina hacia dentro) y cabecea al frenar y acelerar. Lleva muelle y amortiguador, así que se nota la inercia. Los coches de suspensión blanda (lujo, furgonetas) se mueven más.

**Marcas y humo:**
- los neumáticos dejan marcas en el asfalto al derrapar, al patinar o en frenadas fuertes;
- echan humo al cruzar el coche o al quemar rueda;
- los coches de los demás jugadores también derrapan y dejan marcas: el servidor manda su rumbo y su deriva.

**Sonido:**
- motor sintetizado que sube y baja de vueltas con cada marcha, con un tono distinto por tipo;
- en los vehículos que levitan, un silbido;
- chirrido de neumáticos;
- golpe al chocar.

**Velocímetro:** km/h, marcha (R al ir marcha atrás, N parado) y cuentarrevoluciones. Ocupa el sitio del arma, que al volante no se usa.

## 4. Taller

Los concesionarios tienen ahora **taller**: en el panel, debajo de tu garaje, cada coche tuyo tiene sus piezas. Al pasar el ratón por una opción ves cómo quedarían la masa, el empuje, la frenada y el agarre.

| Pieza | Opciones | Efecto |
|---|---|---|
| Motor | De serie → Admisión y escape → Turbo y centralita → Preparación de carreras | +9 % de empuje y +3,5 % de punta por nivel |
| Frenos | De serie → Pastillas deportivas → Discos perforados → Carbono-cerámicos | +13 % de frenada por nivel |
| Suspensión | De serie → Muelles cortos → Coilovers → Competición | Menos balanceo, más agarre y respuesta |
| Neumáticos | De serie, Deportivos, Semislick, Rally | Deportivos: +10 % de agarre. Semislick: +20 %, pero se van de golpe. Rally: −3 %, con derrapes largos y fáciles |
| Peso | De serie, Aligerado, Reforzado | Aligerado: −12 % de masa. Reforzado: +22 % de masa (más inercia, rebota menos) |

- **Precio:** depende del coche. Preparar un superdeportivo cuesta como un coche barato.
- **Guardado:** las mejoras se guardan por unidad y siguen ahí al aparcar, al viajar o al volver a entrar.

## Pruebas

**`server/test/v45.test.ts`:**
- el superdeportivo derrapa con freno de mano mucho más que el camión de bomberos;
- el camión frena en más metros;
- la propulsión trasera suelta la cola con gas en curva y la tracción delantera no;
- el volante gira hacia el lado correcto;
- hay marcha atrás;
- las mejoras cambian la física;
- en el servidor:
  - los mandos mueven el coche y S frena;
  - otro jugador recibe el rumbo del coche;
  - el taller cobra y guarda las mejoras, y rechaza valores inválidos.

**`server/test/coches.test.ts`:** adaptado a los mandos nuevos.

**`e2e/shots-v45.ts`:**
- barras y anillos sin panel, con las cifras solo con Alt;
- HUD limpio con la mira;
- taller;
- al volante:
  - W acelera y el velocímetro lo marca, y la cámara abre el ángulo;
  - el freno de mano cruza el coche y deja marcas;
  - S frena;
  - el cliente y el servidor coinciden;
- cámara de capó y conducción en cenital.

Capturas en `docs/pruebas-045/`.
