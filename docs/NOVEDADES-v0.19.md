# Vértice v0.19 — Ciudad transitable, tráfico con semáforos y optimización

## La Tormenta sustituye al personaje

**El fallo:** al meterse en la Tormenta, el personaje se quedaba casi desnudo y sin la armadura.
- El modelo de la armadura (Ophiel) no está en el repositorio: se descarga de la release `modelos-extra-v17`.
- Esa release nunca se llegó a crear, así que el juego no lo encontraba.
- En ese caso se veía al piloto con la ropa quitada.

**Ahora:**
- **La armadura es el personaje**: el piloto no se ve nunca, ni mientras se descarga el modelo.
- Si el modelo no está, se monta una **Tormenta de placas** con las mismas articulaciones, de dos veces la altura de una persona:
  - coraza negra con filos de neón azul;
  - núcleo de fusión en el pecho;
  - casco con visor y mochila del reactor con toberas;
  - hombreras, brazos y piernas blindados.
- En cuanto llega el modelo Ophiel, se cambia sola.
- `tools/fetch-assets.mjs` busca el paquete de modelos en `modelos-extra-v17` y también en la release **`armaduras`**. Basta con subir `vertice-extra-v17.tar.gz` a cualquiera de las dos.
- El servidor devuelve **404** para un archivo que no existe (antes devolvía la página del juego y el cargador tardaba en darse cuenta).

## Callejones de punta a punta, sin suelos negros

**El problema:**
- En la Marea, dos **canales de agua** (casi negros en pantalla) cortaban el distrito de arriba abajo y de lado a lado.
- Muchos callejones morían en ellos.

**Lo que he cambiado:**
- Esos canales son ahora **paseos peatonales**. Se han quitado sus barandillas.
- Solo queda agua en el puerto del borde del mapa, en un azul que se distingue.
- El suelo de los callejones es más claro.
- Comprobado con una búsqueda por todo el mapa: **todas las casillas transitables están conectadas** y cada callejón tiene al menos dos salidas.

## Contorno de los edificios transparentes

- Cuando un edificio se vuelve transparente (o desaparece porque la cámara está muy cerca), se dibuja **su planta en el suelo**:
  - una línea negra fina, con un filo claro para que se lea de noche;
  - aparece y se va con el mismo fundido que el edificio.
- Así siempre sabes que ahí hay un edificio, aunque no lo veas.
- Pasa con los edificios cercanos que te tapan. Los lejanos solo lo dibujan cuando desaparecen al acercarte.
- El neón de un edificio transparente se apaga. Antes dejaba la pantalla llena de rayas de colores.

## Aceras, pasos de peatones y semáforos

- **Aceras más anchas:** las 10 avenidas de 10–11 casillas ceden una casilla de calzada a la acera por cada lado.
- **Pasos de peatones nuevos:** 118, a mitad de las calles largas (cada ~48 casillas), además de los de los cruces.
- **Los transeúntes van por la acera:**
  - 337 de los 458 puntos de paseo de los PNJ estaban en mitad de la calzada; ahora están en la acera más cercana;
  - para los peatones, la calzada «cuesta» mucho en la búsqueda de rutas y el paso de peatones casi nada, así que cruzan por los pasos.
- **Semáforos (rojo, ámbar y verde):**
  - Un ciclo de 30 s, desfasado por barrios, que comparten el servidor y el cliente.
  - Las calles horizontales y verticales se alternan, con un segundo de todo en rojo.
  - Los coches paran en la línea de detención si su semáforo está en rojo (o en ámbar si aún pueden frenar).
  - Los peatones esperan en la acera hasta que su muñeco se pone verde. Mientras parpadea no empiezan a cruzar.
  - Cuando los peatones cruzan, los coches de esa calle están en rojo (comprobado en las pruebas).
  - Cada paso tiene un semáforo en las dos aceras, con luces para coches y muñeco para peatones.

## Calles conectadas: los coches ya no desaparecen

**Por qué desaparecían:** cada coche recorría su tramo de calle y, al llegar al final, saltaba al principio. Como las calles estaban partidas en los antiguos límites de las zonas, los coches se esfumaban ahí.

**El tráfico nuevo** circula por una **red de calles conectada**:
- en cada cruce el coche puede girar, y al final de una calle gira a la fuerza (los giros se ven como una curva);
- guarda distancia con el de delante;
- frena si hay alguien en su carril;
- respeta los semáforos.

**Solo cerca del jugador:**
- Los coches solo existen en un radio de ~45 casillas alrededor de la cámara (34, 22 o 10 según la calidad).
- **Aparecen y se van con un fundido**, nunca de golpe.
- En el servidor, los transeúntes y bandas lejos de todo jugador ya no se mueven ni piensan.
- **Los personajes también aparecen y desaparecen con un fundido** al entrar y salir del campo de visión.

## Optimización y fallos

- **El cliente pasaba ~40 % del tiempo compilando sombreadores.** Cuando se iba el último PNJ que usaba un sombreador, three.js lo borraba y lo recompilaba al llegar el siguiente; además, en cada compilación leía el registro de errores de WebGL, que bloquea la GPU.
  - Ahora los programas se quedan en memoria (son ~50) y esa comprobación solo se hace en desarrollo.
  - En la misma prueba, la CPU pasa de estar siempre ocupada a estar ~90 % libre.
- La «firma» de cada modelo (su apariencia serializada) ya no se recalcula en cada fotograma: solo cuando cambia algo.
- Se ha quitado una búsqueda cuadrática en la atenuación de edificios.
- El servidor va sobrado: 0,7 ms de media por tick (de 50 ms) con 4 jugadores y la población entera.

## Técnico

- **Compartido:**
  - `shared/src/traffic.ts`: semáforos (`carLight`, `walkLight`), mapa de calzadas (`roadMap`, `crossingAxis`);
  - `findPath(…, { pedestrian: true })`.
- **Servidor:** rutas de peatones en `npcPath`; espera en rojo (`waitsForLight`); 404 para estáticos inexistentes.
- **Cliente:**
  - `client/src/render/traffic.ts`: tráfico y semáforos;
  - contorno de edificios y fundido de personajes;
  - Tormenta de placas en `tormenta3d.ts`.
- **Contenido:** `scripts/v19.mjs` (idempotente; también lo llama `gen-content.mjs`).
- **Pruebas:**
  - `server/test/v19.test.ts`: canales, semáforos coherentes, peatones que cruzan por el paso, espera en rojo y mapa conectado;
  - `nav.test` actualizado;
  - total: 134/134 en serie;
  - e2e de dos navegadores y de controles: OK.
- **Capturas:** `e2e/shots-v19.ts`.
