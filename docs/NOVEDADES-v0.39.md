# Vértice v0.39: cámaras en tercera y primera persona

Ahora hay tres cámaras y se cambia entre ellas con una tecla (**F5** por defecto; se puede cambiar en Esc → Teclas):

**Cenital → Tercera persona → Primera persona → Cenital…**

El juego recuerda la última que usaste. Las animaciones adicionales para estas vistas llegarán más adelante; de momento se usan las que ya había.

| Cámara | Cómo se ve | Controles |
|---|---|---|
| **Cenital** | La de siempre: isométrica desde arriba. | Igual que antes (rueda para acercar o alejar). |
| **Tercera persona** | Detrás del personaje, a la altura del hombro y un poco a su derecha. Si una pared, un edificio o una farola se interponen, la cámara se acerca para no atravesarlos. Con la Tormenta puesta se aleja y sube en proporción. | Arrastra con el botón izquierdo para girar y mirar arriba o abajo. La rueda acerca o aleja la cámara (de 1,4 a 7 losetas). |
| **Primera persona** | Desde los ojos del personaje: la cámara va pegada al hueso de la cabeza, así que sigue al cuerpo al andar, agacharse o rodar. Tu propio modelo no se dibuja y hay una mirilla en el centro. | Arrastra para mirar. |

## Controles en las vistas cercanas

- **Movimiento:** W anda hacia donde mira la cámara, S hacia atrás y A y D de lado. Si giras la cámara con una tecla pulsada, el rumbo cambia sobre la marcha.
- **Un clic sin arrastrar** sigue siendo un clic: interactúa con lo que hay bajo el puntero (puertas, personas, objetos). Elige lo más cercano a la cámara que tenga el cuerpo bajo el ratón. Arrastrar nunca cuenta como clic.
- **Apuntar:** el puntero apunta al punto del suelo bajo el ratón (guardia, golpes, mirar).
- **Al pasar el ratón:** las etiquetas de nombre, los bocadillos de diálogo y los datos del escáner (Interfaz) se colocan sobre cada persona en 3D.
- **Aviso de la tecla E:** aparece en el centro, bajo la mirilla.

## Qué hay detrás

La vista cenital es un dibujo 2D isométrico (Pixi) con los personajes, los edificios, las puertas y los coches en 3D encima. Desde cerca ese dibujo no cuadra, así que con las cámaras cercanas se deja de pintar y se levanta el resto en 3D a partir de la misma definición de la zona (`client/src/render/world3d.ts`):

- **Suelo:** una textura sacada de la rejilla de la zona, con los colores de siempre (asfalto, aceras, plazas, tierra, agua…) y las franjas de los pasos de cebra. De cerca, un grano fino y las juntas entre baldosas en aceras, plazas y suelos de interior.
- **Mobiliario y objetos:** farolas con su luz, marquesinas, bancos, cajeros, máquinas, contenedores, coches aparcados, vallas, puestos… como volúmenes sencillos con su color. Las pantallas y los neones brillan.
- **Muros de los interiores:** cada casilla no transitable que linda con el suelo es un muro.
- **Cielo:** degradado de día o de noche según la hora de la ciudad, con niebla a lo lejos. En los interiores, un techo oscuro.
- **Luz:** baja de noche, porque desde cerca no está la capa de oscuridad de la vista cenital.

Los edificios no se atenúan en las vistas cercanas: no hace falta, la cámara los esquiva. La lógica del juego no cambia: el cono de visión y lo que el servidor te deja ver son los mismos en las tres cámaras.

## Pruebas

`e2e/v39-camaras.mjs`, con el servidor en marcha, comprueba lo siguiente:
- F5 recorre las tres cámaras y vuelve a la cenital;
- con la cámara girada en varios ángulos, W va hacia donde mira y D a su derecha;
- arrastrar gira la vista sin contar como clic, y un clic sobre la puerta en tercera persona la abre;
- en primera persona no se dibuja tu modelo y sí la mirilla.

Siguen pasando `e2e/two-browsers.mjs` y `e2e/v12-controls.ts`, que usan la cámara cenital, la de por defecto.

Capturas en `docs/pruebas-039/`.
