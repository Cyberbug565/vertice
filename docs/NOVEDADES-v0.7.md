# Novedades de la v0.7 · «Ciudad hostil»

Esta versión incluye la **vida nocturna y el mercado negro** que llegaron en el parche de ChatGPT: bares y discoteca, bailes, bebidas y drogas con dependencia, y repartos para las bandas.

Sobre eso trae:

- controles nuevos: WASD para andar y el ratón para interactuar, apuntar y bloquear;
- un panel del cuerpo siempre a mano;
- chat local y global;
- un aspecto más cyberpunk;
- una ciudad mucho más peligrosa: maleantes, policía que tarda en llegar, recompensas que publica la ciudad, ciberpsicópatas… y tu propia ciberpsicosis.

## 1. Controles nuevos

- **Andar con `W` `A` `S` `D`** (o las flechas).
  - El personaje se mueve al instante y se desliza por las paredes.
  - Al soltar la tecla, se para.
  - Hacer clic en el suelo ya no mueve.
- **Bailar con `B`**.
- **Clic izquierdo**:

  | Sobre… | Hace |
  | --- | --- |
  | Una persona | Abre su menú (hablar, robar, KO, atacar, hackear…) |
  | Tu personaje | Abre tu menú: bailar, ver el cuerpo, inventario, dormir, retirada y a qué zona del cuerpo apuntas |
  | Una puerta u objeto | Vas hasta allí y lo usas |

- **Clic derecho mantenido**:
  - **Arma a distancia: apuntas**.
    - Tu personaje mira al cursor y anda más despacio.
    - Junto al cursor aparece una retícula que se va llenando.
    - Cuando está llena y verde, el objetivo está dentro de tu alcance de tiro seguro. Si haces clic izquierdo sobre él, **el disparo acierta seguro**.
    - En rojo, está a tu alcance pero el tiro no es seguro.
  - **Arma cuerpo a cuerpo: bloqueas**. Paras la mayor parte de cada golpe cuerpo a cuerpo que recibes (te llega un 35 % del daño) y eres más difícil de alcanzar.
  - Con el clic derecho pulsado, **clic izquierdo sobre alguien = atacar** directamente, a la zona del cuerpo que hayas elegido.
- **Teclas reorganizadas** por uso. Las más usadas están alrededor de WASD: `Q` cancelar, `E` interactuar, `R` retirada, `F` cuerpo, `G` buscar, `T` maletero, `Z` dormir, `X` cromo, `C` ficha, `V` conducir. Las menos usadas quedan más lejos.
- **`Esc` abre el menú**: Continuar, Ajustes, **Teclas** y **Cerrar sesión**.
  - En **Teclas** puedes cambiar cualquier tecla: haz clic en ella y pulsa la nueva.
  - Hay un botón para volver a las teclas de serie.

## 2. Panel del cuerpo y cromo que no sangra

- Es una **silueta pequeña y fija** (a la izquierda) que puedes dejar abierta mientras peleas. Se muestra u oculta con `F`.

  | Color | Estado |
  | --- | --- |
  | Verde | Sana |
  | Amarillo | Herida |
  | Rojo (parpadea) | Crítica |
  | Granate, con borde discontinuo rojo | Perdida |
  | Cian | Cromo en buen estado |
  | Naranja | Cromo dañado |
  | Rojo | Cromo averiado |

- Debajo de la silueta se ve la hemorragia por segundo.
- **Haz clic en una zona herida** para curarla con lo que lleves:

  | Remedio | Herida que cura | Hemorragia que corta |
  | --- | --- | --- |
  | Venda | 10 puntos | 70 % |
  | Estimulante | 18 puntos | Toda |
  | Estabilizador | 14 puntos | 85 % |
  | Analgésicos | 6 puntos | Nada |

- **Las partes robóticas no sangran**, pero se dañan. A partir de 24 de daño se averían:
  - cada brazo averiado da −2 a la puntería;
  - cada pierna averiada te frena.
- El cromo **se repara en un matasanos**: en su consulta aparece «Reparar cromo dañado», con el precio según el daño.

## 3. Chat local y global y nuevo aspecto

- **Chat local** (`Intro`): lo oyen los que están cerca y sale como **bocadillo encima de tu personaje**.
- **Chat global** (`Y`): llega a toda la ciudad y aparece en el **panel de la derecha**. Se puede escribir uno cada 4 s.
- **Más caras** al crear el personaje:
  - 8 formas de cara (nuevas: cuadrada, corazón, ancha y afilada);
  - 5 narices: recta, chata, aguileña, pequeña y ancha;
  - 5 bocas: neutra, sonrisa, seria, labios gruesos y fina.

  La gente de la calle también las usa.
- **Limpieza visual con estilo cyberpunk**:
  - paneles con esquinas cortadas, neón y rejilla de líneas;
  - tipografía técnica (Rajdhani y Share Tech Mono);
  - barras segmentadas.
  - La barra inferior es más limpia: arriba las acciones; abajo los paneles como iconos con su tecla al lado (el nombre aparece al pasar el ratón).

## 4. Recompensas que publica la ciudad

- Cada 2 min 30 s, aproximadamente, la ciudad publica **una recompensa nueva**: un objetivo con nombre, alias y delito.
  - Es más probable que aparezca en zonas rojas y negras, y allí suele valer más.
  - Se anuncia a todos los jugadores.
- **La ciudad tiene un tope de 8 recompensas propias a la vez.** Las que ponen los jugadores no tienen tope.
- Si el objetivo muere por otra causa, su recompensa desaparece y deja hueco para otra.

## 5. Cuanto más vale, más peligroso… y mejor botín

| Recompensa | Arma | Salud | Escoltas |
| --- | --- | --- | --- |
| 150–500 €$ | Pistola | Unos 70–100 | Ninguno |
| 500–1.500 €$ | Subfusil | Unos 120–150 | 1 o 2 |
| 1.500–3.500 €$ | Fusil de asalto | Unos 190–220 | 2 o 3 |
| 3.500–8.000 €$ | Escopeta tecnológica | Unos 280–310 | 3 o 4 |

- **Los escoltas siguen y defienden** a su jefe: si alguien le dispara, van a por quien ha sido.
- **El botín crece con la recompensa**:
  - dinero extra (cada vez más por nivel);
  - su arma y munición;
  - estimulantes;
  - en las más altas, a menudo un implante sin instalar.

## 6. Maleantes, víctimas y policía que llega de forma orgánica

- **Maleantes por la calle**: 4 por distrito en zonas negras, 3 en zonas rojas, y 1 o 2 en las vigiladas.
  - De vez en cuando eligen a alguien y van a por él: un civil o, a veces, un jugador.
  - Atacan más de noche y en zonas peligrosas.
- **Las víctimas reaccionan**:
  - huyen pidiendo socorro (lo normal);
  - algunas **plantan cara**;
  - otras **se paran a llamar a la policía**.
- **Los testigos** también pueden llamar.
- **La PCV llega de forma orgánica**:
  - **Por qué viene**: una **cámara** ve la agresión, o alguien **llama**.
  - **Si hay una patrulla cerca**, acude andando.
  - **Si no, sale un coche patrulla** desde la comisaría o patrulla más próxima.
  - **Cuánto tarda**: entre 8 s y 2 min, según la distancia. Las cámaras te avisan del tiempo estimado.
  - **Al llegar**: aparcan a unos metros y entran corriendo a por el agresor.
    - Contra maleantes, ciberpsicópatas y asesinos identificados, disparan a matar.
    - Cuando acaba el aviso, se retiran.
- **En zona negra no viene nadie.**
- **Atacar a un maleante que está agrediendo a alguien no es delito**, y atacar a un ciberpsicópata tampoco.

## 7. Ciberpsicópatas

- Como mucho **dos a la vez**. Aparecen cada 7 minutos aproximadamente, sobre todo en zonas rojas y negras.
- **Son minijefes**:
  - 650–900 de salud;
  - cromo en todo el cuerpo;
  - armas brutales y un 60 % más de daño;
  - un aura roja bajo los pies.
- **Atacan a todo lo que ven**: civiles, policía, bandas y jugadores.
- **Al aparecer**:
  - se emite una **alerta a toda la ciudad**;
  - la PCV pone una **recompensa de 5.000–9.000 €$**;
  - envía 4 agentes.
- **Su cadáver** lleva mucho botín y **3 o 4 implantes potentes**: piernas de salto, acelerador neural, camuflaje óptico, cuchillas, cañón de antebrazo, esqueleto de titanio, segundo corazón…
- **Para sacar el cromo** usa «Extraer cromo» en su menú. Hace falta **Reparación 4 × el grado** del implante. Luego un matasanos te lo puede implantar.

## 8. Tu propia ciberpsicosis

- **Ahora puedes pasarte de tu límite de cromo**, hasta un 50 % más.
  - Solo con matasanos poco escrupulosos: los estrictos se niegan.
  - El matasanos te avisa del riesgo.
- **Cuanto más te pases, y más tiempo, más sube tu nivel de ciberpsicosis.** La humanidad muy baja también cuenta. Si vuelves por debajo del límite, baja poco a poco.

| Nivel | Qué notas |
| --- | --- |
| 0–25 | **Nada**: al principio no se nota (ni siquiera en tu ficha) |
| 25+ | Insultas a la gente que pasa a tu lado |
| 45+ | Aviso y estado «Inestable». Empujas y pegas a desconocidos |
| 70+ | Estado «Ciberpsicosis». Tus manos disparan solas contra quien tengas cerca (con las consecuencias legales); la pantalla tiembla y se tiñe de rojo |

- **Si has pasado mucho tiempo con ciberpsicosis**, al quitarte un implante tu cuerpo lo rechaza.
  - Tu capacidad de cromo baja de 3 a 10 puntos.
  - Dura de 10 a 90 minutos, según lo grave que haya sido.
  - Se ve en tu ficha.

## Teclas por defecto

| Tecla | Acción | Tecla | Acción |
| --- | --- | --- | --- |
| `W` `A` `S` `D` | Andar | `Mayús` | Correr |
| `E` | Interactuar | `Q` | Cancelar |
| `R` | Retirada | `F` | Panel del cuerpo |
| `B` | Bailar | `Z` | Dormir |
| `V` | Conducir | `Tab` | Señalar lo siguiente |
| `I` | Inventario | `C` | Ficha |
| `X` | Ciberware | `K` | Habilidades |
| `M` | Mapa | `J` | Diario |
| `G` | Buscar (móvil) | `T` | Maletero |
| `Intro` | Chat local | `Y` | Chat global |
| `L` | Automático | `O` | Empleos |
| `P` | Propiedades | `N` | Mercado |
| `U` | Recompensas | `H` | Facciones |
| `.` | Ámbar | `Esc` | Menú |

## Cambios técnicos

- El parche de ChatGPT se ha aplicado tal cual (su commit se conserva).
  - Sus cambios en ficheros que crea el generador se guardan como **capas** (`scripts/overlays/`).
  - El generador (`node scripts/gen-content.mjs`) los vuelve a aplicar, así que no se pierden al regenerar la ciudad.
- **Nuevos mensajes**:
  - `steer`: dirección de WASD, reenviada cada 0,2 s mientras andas; si no llega en 1,5 s, el personaje se para.
  - `guard`: clic derecho.
  - `treat`: curar una zona.
  - `repairChrome`: reparar cromo.
  - `selfSpeed`: tu velocidad exacta, para que el cliente prediga el movimiento.
  - `chat` con canal `global`.
- **Migración `008`**: estado de ciberpsicosis del personaje.
- **Módulo `server/src/world/threats.ts`**: recompensas generadas, maleantes, avisos a la PCV, ciberpsicópatas y ciberpsicosis.
  - Se desactiva con `THREATS=0`. Las pruebas automáticas lo apagan salvo donde se prueba a propósito.
- **Pruebas nuevas en `server/test/v07.test.ts`**:
  - WASD;
  - apuntar y bloquear;
  - curar por zonas y cromo que no sangra;
  - chat local y global;
  - recompensas con tope y escoltas;
  - maleantes, víctimas y policía;
  - ciberpsicópatas y extracción de cromo;
  - ciberpsicosis.
- **Prueba en dos navegadores**: se ha adaptado a WASD y al menú Esc.
- **Capturas**: `npx tsx e2e/shots-v07.ts`.

## Qué probar

1. Crea un personaje y prueba las caras nuevas (forma, nariz y boca).
2. Muévete con WASD y abre tu menú haciendo clic en ti mismo.
3. Con una pistola, mantén el clic derecho sobre alguien hasta que la retícula se ponga verde y haz clic izquierdo.
4. Herido, cúrate desde la silueta del cuerpo (clic en la zona).
5. Escribe en el chat local (`Intro`) y en el global (`Y`).
6. Espera a que la ciudad publique una recompensa grande y ve a por ella… con cuidado con sus escoltas.
7. Pégate con alguien delante de una cámara y mira cuánto tarda la PCV.
8. Si te atreves, busca un ciberpsicópata en las afueras. Con Reparación suficiente, sácale el cromo.
