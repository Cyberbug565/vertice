# Vértice v0.13 — Cadáveres, contenedores, mundo vivo y creador en 3D

## Cadáveres

- **Duran una semana de juego** (10 h 30 min reales).
  - Antes desaparecían a los 90 s.
  - Hay un tope de 80 por zona: si se pasa, el servicio de limpieza se lleva los más viejos que nadie ha encontrado.
  - Viven en la memoria del servidor, así que si se reinicia el servidor desaparecen.
- **Sangre:** cada muerte deja un charco.
  - Se oscurece al secarse y se borra a los **50 minutos** (tiempo real).
  - Si arrastras el cuerpo en los primeros 15 minutos, deja un **rastro de gotas**.
  - Al entrar en una zona ves toda la sangre que sigue fresca.
- **Registro completo:** el panel de saqueo es como tu inventario, en pequeño.
  - Muestra **dinero**, **ciberware**, **armas** e **inventario**.
  - Cada casilla se coge con un clic, o todo con **«Cogerlo todo»**.
  - Lo que lleva encima es lo que tenía de verdad: su arma y munición, uniformes de agentes, vendas, estimulantes, comida, ganzúas y droga en los barrios sin ley.
  - El cromo que se le ve (brazos, ojos, piernas…) se puede extraer. Pide Reparación (4 por grado) y sale como implante robado sin instalar.
  - El panel se cierra si te alejas del cuerpo.
  - Registrar a un civil inconsciente a la vista sigue siendo delito.

## Esconder cuerpos y contenedores

- **Carga el cadáver** (menú del cuerpo) y pulsa **E** junto a un contenedor para meterlo dentro.
- Caben 3 cuerpos en un contenedor de basura y 1 en un cubo, bidón, caja, taquilla o cámara frigorífica.
- Si alguien te ve hacerlo, te recuerda como si te hubiera visto matar.
- **Rebuscar en la basura** (E junto al contenedor): chatarra, comida, a veces munición, vendas, una ganzúa o droga.
  - Cada contenedor se puede volver a rebuscar a los 10 minutos.
  - Si hay un cuerpo dentro, lo encuentras.
- **Esconderte dentro** de un contenedor grande o una taquilla:
  - nadie te ve, ni los transeúntes ni la PCV;
  - sales con E o moviéndote;
  - los demás jugadores tampoco te ven.

## Si dejas el cuerpo a la vista

1. **Alguien lo encuentra.** Un transeúnte o un agente con línea de visión a 8 m o menos grita y huye. En zona roja, muchos miran hacia otro lado. En zona negra, nadie llama.
2. **Llaman a la PCV.** Todos los jugadores cercanos reciben el aviso y quien mató, esté donde esté.
3. **Llega la PCV** a los 15–30 s y acordona la escena con un agente y un forense.
4. **Revisan las cámaras** cercanas (a 14 m o menos del lugar del crimen) y las que te grabaron al matar.
   - Si te grabaron: identificación pública, nivel de búsqueda y aviso a toda la ciudad.
   - Si no hay imágenes: «sin pistas».
   - Con el camuflaje óptico solo ven una silueta.
5. **Se llevan el cuerpo** a los 2 minutos. La sangre se queda hasta que se seca.

## Confirmaciones dentro del juego

Las 15 preguntas que salían en una ventana del navegador ahora aparecen en una ventana del juego, con su estilo y con Intro / Esc:
- implantar o insertar matrices;
- comprar perks, casas y coches;
- robar en tiendas, hackear ascensores, dejar la banda o un encargo;
- cambiar de oficio;
- cruzar a una zona roja;
- cerrar sesión.

## Mundo vivo

- **Conversaciones de verdad:** dos transeúntes que se paran a charlar se miran, gesticulan y se contestan, con frase, respuesta y a veces réplica. Hay 12 charlas distintas.
- **Usan el mobiliario:**
  - se sientan en los bancos;
  - sacan algo de la máquina o del cajero;
  - compran en el quiosco y regatean en los puestos;
  - tiran la basura;
  - esperan el bus mirando el móvil;
  - fuman junto a una farola;
  - miran anuncios y hologramas.
- **Reaccionan a ti:**
  - **Si les apuntas** con un arma de fuego: **manos arriba** y «¡No dispares!». En cuanto bajas el arma, salen corriendo.
  - **Si les empujas** al pasar: «¡Eh, mira por dónde vas!».
  - **Saludos** según la hora. Si te buscan: «¿No eres el de las noticias?».
- **Sucesos callejeros:** cerca de los jugadores, uno cada 50–110 s:
  - **Atracos:** un pandillero roba a un transeúnte, que levanta las manos y grita «¡Al ladrón!». Puedes intervenir.
  - **Controles de identidad** de la PCV.
  - **Discusiones** que acaban con uno huyendo.
- **Gestos nuevos en 3D:** sentado, manos arriba, al teléfono, fumando y gesticulando al hablar.
- Los PNJ quietos miran hacia donde tienen que mirar.

## Creador de personaje en 3D y más opciones

- **Vista previa 3D** en el creador y en la ficha del personaje:
  - es el mismo modelo que en la calle;
  - se balancea para enseñar cara y costados, y se puede **girar arrastrando**;
  - respira y gesticula;
  - en la ficha lleva el arma que empuñas;
  - si el navegador no puede con el 3D, se usa la vista 2D.
- **Opciones nuevas:**

  | Apartado | Nuevas |
  |---|---|
  | Complexiones | musculoso/a (hombros anchos, brazos gruesos), curvilíneo/a (más cadera), esbelto/a, fornido/a |
  | Peinados | mullet, trenzas pegadas, coleta baja, ondas, moño samurái, pixie |
  | Caras | diamante (con pómulos), triangular |
  | Narices | respingona, rota (de boxeador) |
  | Bocas | media sonrisa |

  Además, la mandíbula cambia con la forma de la cara y la nariz con el tipo.
- **Más polígonos:**
  - cajas más redondeadas;
  - músculos con perfil de 32–36 segmentos;
  - esferas de 32×24;
  - cilindros de 28 segmentos;
  - dedos más suaves.

## Rendimiento y movimiento

- **El cliente ya no se queda atrás con pocos FPS.**
  - **Causa:** Pixi recortaba cada fotograma a 0,1 s. Con pocos FPS el personaje avanzaba menos que en el servidor y luego «patinaba» hasta alcanzarlo.
  - **Arreglo:** ahora usa el tiempo real, hasta 0,5 s.
- **Al soltar la tecla:**
  - los desfases de menos de 25 cm se ignoran;
  - si el aviso de «parado» del servidor llega tarde, el cliente se asienta igualmente a los 0,7 s.
- **Vista previa 3D:** solo dibuja mientras se ve, a unos 30 FPS.

## Técnico

- **Servidor:**
  - `server/src/world/corpses.ts`: cadáveres, botín, sangre, contenedores, esconderse, hallazgo e investigación;
  - `server/src/world/street.ts`: conversaciones, mobiliario, reacciones y sucesos.
- **Protocolo:**
  - mensajes del cliente `loot` (`view` / `money` / `item` / `chrome` / `all`) y `container` (`body` / `search` / `hide` / `out`);
  - mensajes del servidor `lootView` y `blood`;
  - gestos nuevos en `EmoteState`.
- **Cliente:**
  - `client/src/ui/loot.ts`: panel de saqueo;
  - `ask()` en `client/src/ui/dom.ts`: confirmación dentro del juego;
  - `Preview3D` en `client/src/render/chars3d.ts`: vista previa 3D;
  - E según el contexto: salir del escondite, meter el cuerpo, interactuar o el menú del contenedor.
- **Pruebas:**
  - `server/test/v13.test.ts` (4): cadáveres y saqueo, contenedores y escondite, hallazgo con investigación por cámaras, y la zona sin ley;
  - total: 114/114 en serie;
  - e2e de controles completa (incluidos 3 minutos andando) y e2e de dos navegadores: OK;
  - `e2e/shots-v13.ts`: capturas.
