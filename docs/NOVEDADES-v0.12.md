# Vértice v0.12 — Controles fiables, personajes 3D de más calidad, fantasmas y armas nuevas

## Fallos arreglados

### No se podía entrar ni salir de los edificios con el clic

- **Causa:** desde que los personajes son 3D, el juego dibuja en tres pasadas. Pixi mandaba los clics a lo último que había dibujado, que era la capa de noche y luces, no el mundo. Por eso ningún clic llegaba a puertas, PNJ u objetos.
- **Arreglo:** el mundo vuelve a recibir los clics.
- Además:
  - las puertas se abren desde **3,2 m** (antes 2,2);
  - los avisos flotantes ya no tapan el clic.

### Interactuar con la E

- **E** interactúa con lo que señalas con el ratón o, si no señalas nada, con lo más cercano. El orden es: puertas, objetos y personas tranquilas.
- Encima aparece un aviso **«E · Entrar en…»**, **«E · Usar…»** o **«E · Hablar con…»**.

### Rodar varias veces seguidas

- **El «teletransporte»:**
  - **Causa:** el cliente movía al personaje al instante, pero hasta que llegaba la confirmación del servidor el corrector creía que ibas 2,6 m desviado. Al rodar varias veces seguidas el desvío pasaba de 3 m y te devolvía de golpe.
  - **Arreglo:** la posición confirmada se desplaza a la vez. Si el servidor rechaza la voltereta (sin aguante o aún recuperándote), se deshace con suavidad.
- **La voltereta no se predice si no puede hacerse:** el cliente aplica las mismas reglas que el servidor (0,9 s de recuperación y aguante) antes de mover al personaje.
- **Desplazamiento continuo:** recorre la distancia en 0,26 s en vez de saltar.
- **«Se echaba a dormir»:**
  - **Causa:** la voltereta 3D giraba sobre los pies y a mitad de giro el cuerpo quedaba tumbado.
  - **Arreglo:** ahora es una voltereta agachada que gira sobre el centro del cuerpo, con piernas y brazos recogidos, y no se reinicia a medias.

### Retroceso «unos pasos atrás» a los 5–10 minutos

Había dos causas:

1. **El servidor perdía tiempo:**
   - **Causa:** cuando el servidor iba cargado (más PNJ, más actividad con el paso del tiempo), descartaba el tiempo atrasado. El cliente sí lo vivía, se adelantaba y luego el servidor te devolvía atrás.
   - **Arreglo:** ese tiempo se devuelve a quien anda con WASD, en subpasos para no atravesar paredes.
2. **Con pocos FPS el cliente se quedaba atrás:**
   - **Causa:** el cliente recortaba cada fotograma a 0,1 s.
   - **Arreglo:** ahora usa el tiempo real (hasta 0,5 s, en subpasos).

La corrección de posición es ahora proporcional y suave; solo recoloca de golpe si el desfase pasa de 6 m.

### Caída del servidor con las multas policiales

- **Causa:** si te detenían mientras tu dinero cambiaba, la multa dejaba el saldo negativo. La base de datos lo rechazaba y el error tumbaba el servidor entero.
- **Arreglo:**
  - la multa se calcula con el saldo real dentro de la transacción;
  - los errores sueltos se registran sin parar el mundo.

## Teclas sin conflictos

- Hay una migración automática de tus teclas guardadas:
  - **E** queda siempre para interactuar;
  - si una configuración antigua tenía dos acciones en la misma tecla, cada una vuelve a su tecla por defecto (o se queda sin asignar si esa ya está ocupada).
- Las teclas importantes no cambian: WASD, R (armas), Q (hackear), F (patada), Espacio (esquivar), H, Z, B, V, I, C, X, K, M y J.
- **1–4** (habilidades), **Esc** y **Ctrl** (golpe fuerte) ya no se pueden reasignar a otra cosa.
- El aviso del modo hackeo muestra la tecla correcta.

## Personajes 3D de más calidad

- **Más polígonos:**
  - cajas redondeadas en torso, cabeza, manos y pies;
  - músculos con perfil anatómico: muslo y brazo anchos arriba, gemelo y antebrazo abultados;
  - rodillas y codos redondeados;
  - esferas y cilindros con el doble de segmentos.
- **Manos con cuatro dedos y pulgar**, también las de cromo, con sus articulaciones.
- Orejas y nariz con volumen.
- **Sombreado físico:** tela y piel reciben luz especular suave, y la iluminación se ha reajustado.
- **Movimiento más fluido:**
  - cada articulación se acerca a su postura objetivo en vez de saltar (andar → apuntar → golpear);
  - golpes, patadas y volteretas siguen siendo rápidos;
  - la cadera acompaña la zancada;
  - en reposo el peso pasa de una pierna a otra;
  - la cabeza compensa el giro del tronco.
- **Más zoom** (hasta ×2,6) para ver el detalle.

## Fantasmas: Rafa «Brasas» y CARMÍN

- Los dos compañeros de las matrices (la Matriz ECO y CARMÍN) son ahora **fantasmas 3D**: translúcidos, teñidos de su color, flotando a un palmo del suelo y mirándote.
- **Aparecen y desaparecen cuando les da la gana:**
  - se quedan entre 15 y 55 s;
  - se desvanecen;
  - vuelven entre 4 y 26 s después en otro sitio a tu alrededor;
  - a veces solo saltan de lado sin irse;
  - parpadean al desvanecerse.
- Solo hablan cuando están visibles.

## Kairós en 3D

- Las **imágenes residuales** vuelven: cada copia es el modelo 3D en su pose de ese instante, del color de tu cromo, y se desvanece.
- Duran más cuanto mejor es tu Kairós.

## Armas: 51 modelos y 10 armas nuevas

- **Cada arma tiene su modelo 3D a escala real**, con corredera, cañón, guardamanos, cargador, culata, gatillo, miras, punto rojo y visores con lente. Algunos detalles:
  - el revólver lleva tambor con recámaras;
  - la escopeta recortada, doble cañón;
  - la de corredera, depósito tubular;
  - el rifle de precisión, visor y bípode;
  - la ametralladora rotativa, seis cañones;
  - la ballesta, palas y cuerda;
  - la katana, curva con tsuba y empuñadura atada;
  - el hacha de bombero, pico;
  - el mazo es de demolición.
- **Brillo según tecnología:** plasma o térmica en naranja, raíl en azul, inteligente en verde, eléctrica en cian.
- **Diez armas nuevas en las tiendas:**

  | Tipo | Armas |
  |---|---|
  | De fuego | pistola compacta, subfusil compacto, carabina de culata de madera, escopeta de corredera, ametralladora ligera |
  | Cuerpo a cuerpo | cuchillo de combate, katana, hacha de bombero, tubería de plomo, mazo de demolición |

  Están en la Armería Halcón, la armería del callejón, Armas Forja, la chatarrería, el mercadillo y el perista.

## Pruebas

- **`server/test/v12.test.ts` (5 pruebas):**
  - tiempo recuperado al andar;
  - voltereta (recuperación, aguante, no tumba);
  - puertas a 3 m;
  - buzones y farolas no bloquean;
  - armas nuevas y callejones con giro.
- **`e2e/v12-controls.ts`** en un navegador real:
  - clic en una puerta: entra;
  - E: sale;
  - 8 volteretas seguidas: sin retroceder nunca;
  - 3 minutos andando en círculos: sin saltos; peor desfase de 2,1 m a 5 FPS en un navegador sin GPU.
- **Carga del servidor con 30 jugadores y ~400 PNJ:** tick p50 1,5 ms, p95 6,7 ms, p99 11 ms. El presupuesto es 50 ms.
- **Resultados:**
  - 110 pruebas en total. En serie pasan todas menos una de la v0.6 que depende de tiradas aleatorias (cámara y buscador); pasa al repetirla y ya fallaba antes de estos cambios.
  - La e2e de dos navegadores pasa completa.
