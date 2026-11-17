# Vértice v0.11 — Personajes en 3D, ciudad más legible y callejones con giros

## Personajes modelados en 3D (vista isométrica)

- Todos los personajes (jugadores, PNJ, policía, jefes) son ahora **modelos 3D articulados**. Se dibujan con Three.js sobre el mismo lienzo que el mapa, con la misma cámara isométrica, así que encajan al píxel con el mundo.
- **Esqueleto completo:** caderas, muslos, rodillas, pies, columna, pecho, hombros, codos, manos, cuello y cabeza. Paneles de abrigo y faldas que se balancean al andar.
- **Animaciones:**
  - andar y correr con zancada, rodillas, braceo y respiración;
  - giro suave hacia donde andas o hacia quien atacas;
  - pose de apuntar (las armas largas se sujetan con las dos manos), guardia y retroceso al disparar;
  - golpes cuerpo a cuerpo normales y fuertes, patada, esquiva rodando y bailes;
  - en el suelo cuando estás derribado, durmiendo o muerto.
- **Detalle:**
  - la ropa usa las mismas texturas que el creador de personaje (tejidos, estampados y tatuajes en la piel);
  - caras pintadas con ojos, cejas, nariz, boca, barba, maquillaje, cicatrices, tatuajes faciales y piercings;
  - peinados, gorros, gafas y máscaras;
  - el **ciberware se ve**: miembros de cromo metálico con luces, ojos de cromo, colores de cromo y miembros amputados.
- **Armas:** el arma que llevas en la mano es un modelo 3D. Las que llevas guardadas van colgadas: las grandes a la espalda con correa y las pequeñas en la cadera con funda.
- **Oclusión correcta:** los edificios y los objetos grandes tapan a los personajes que están detrás. Si un edificio se vuelve transparente porque estás detrás de él, deja de tapar.
- **Ajuste nuevo:** Ajustes → «Personajes en 3D». Se desactiva para equipos lentos y se aplica al recargar. Si el 3D falla en tu navegador, el juego vuelve solo a los personajes 2D.

## Escala y cámara

- **Edificios un 35 % más altos y personajes más pequeños.** Una persona mide ahora la mitad de una planta de edificio.
- Los edificios que tienes **detrás se ven nítidos**. Los que tienes **delante** se vuelven **semitransparentes** y, si acercas mucho la cámara, **casi desaparecen**.

## Colisiones invisibles arregladas

- Ya no te chocas con cosas que no ves. Antes bloqueaban el paso 263 puntos de vivienda, 25 cajeros, las farolas, los rótulos y otros objetos que no se dibujaban.
- Ahora solo bloquea lo que es sólido: máquinas, cajas, generadores, terminales, camas, etc. Lo fino (farolas, bocas de riego, antenas, neones, pantallas) se puede rodear de cerca sin quedarte enganchado.
- Los objetos que no tenían dibujo ahora lo tienen: cajero, buzón de vivienda, Ámbar, inmobiliaria, contratación, soborno, camello, alijo y botín.

## Calles que se distinguen

- **Calzada más oscura y aceras más claras**, con losas dibujadas.
- **Bordillo elevado** en los cuatro lados de la acera, con su sombra sobre el asfalto.
- **Línea blanca de borde** en la calzada.
- **Pasos de cebra** con franjas más claras y bien orientadas.
- **Doble línea amarilla** central y líneas de carril más gruesas.
- Alcantarillas en la calzada y adoquines y charcos en los callejones.
- **De noche:**
  - las farolas iluminan un círculo más grande y su luz tiene dos tonos;
  - la oscuridad general es algo menor;
  - llevas más luz a tu alrededor.

  Calzada, acera y paso de cebra se distinguen sin perder el ambiente.

## Más variedad de edificios

Cada edificio recibe una variante fija según su identificador:

- torres, megabloques y bloques con un **cuerpo superior retranqueado** y cornisa;
- **fachadas de ladrillo** con hiladas;
- **escaleras de incendios** en zigzag con descansillos en cada planta;
- **balcones** con barandilla;
- **toldos** de colores en los bajos comerciales;
- **azoteas equipadas:** pretil, depósito de agua sobre patas, máquinas de aire acondicionado, jardín, helipuerto con balizas o valla publicitaria luminosa.

## Callejones con giros y pasajes

- **27 callejones nuevos en L y en Z** atraviesan las manzanas grandes. Giran a izquierda o derecha y conectan dos calles.
  - Son oscuros, de zona disputada, con basura, tuberías y una luz mortecina en el codo.
- **17 pasajes comerciales iluminados** con suelo de baldosa, tiras de neón y algún quiosco.
- Los trozos de cada manzana tienen alturas distintas, así que las manzanas ya no parecen un bloque macizo.
- Solo se parten manzanas sin puertas, rótulos ni pasarelas, y siempre con las bocas a la calle.

## Técnico

- `client/src/render/chars3d.ts` (nuevo) dibuja los personajes en 3D:
  - comparte el contexto WebGL de Pixi y no redimensiona el lienzo;
  - el orden de dibujo es mundo (Pixi), luego personajes (Three) y luego noche, luces, lluvia y etiquetas (Pixi);
  - guarda y restaura el estado y el viewport de WebGL en cada pasada.
- `shared/src/zonegrid.ts`: listas `THIN_PROPS` y `SOLID_OBJECTS` para el mapa de colisiones.
- `scripts/v11.mjs`: genera los callejones en L y Z y los pasajes. Se ejecuta en `scripts/gen-content.mjs` después de la v0.10.
- `e2e/shots-v11.ts`: capturas de día, de noche y de callejón.
- Pruebas: 105/105 en serie (`--no-file-parallelism`). En paralelo, algún test de v0.6 que depende de tiempos puede fallar por carga. La e2e de dos navegadores pasa completa.
