# Vértice v0.20 — El control es tuyo, calles conectadas y puñetazos

## La Tormenta (modelo Ophiel)

El juego **no puede ver el modelo** porque no está en ninguna release que pueda descargar. Lo que hay ahora:
- en la release «armaduras» está el `Ophiel.fbx` original, de 844 MB, que el juego no puede usar tal cual;
- la versión preparada para el juego (3,7 MB, con las partes separadas) nunca llegó a subirse;
- desde aquí no puedo subir archivos a las releases: GitHub lo prohíbe para este tipo de sesión.

Por eso se ve la Tormenta de placas.

**Cómo ponerla (2 minutos):**
1. En GitHub: *Releases → «armaduras» → Edit* (el lápiz).
2. Arrastra el archivo **`tormenta.glb`** (te lo paso en el chat) a la zona de adjuntos y pulsa *Update release*.
3. Vuelve a desplegar el juego. Si lo ejecutas en tu ordenador, usa `npm run assets` y luego `npm run build`.
   - `tools/fetch-assets.mjs` busca primero el paquete completo y, si no está, descarga ese `tormenta.glb` suelto.
   - Si además subes `vertice-extra-v17.tar.gz` a la misma release, se descargan también los 106 peinados y las piezas del samurái.

## El control es siempre del jugador

**El fallo:** con la postura «Evitar» (la que viene marcada), al recibir un disparo el personaje salía corriendo solo hacia el refugio más cercano y no te dejaba moverte. Con «Defender» o «Agresiva» se lanzaba a devolver el golpe.

**Ahora:**
- **Esas reacciones solo ocurren en modo automático.**
- Además, **WASD cancela cualquier ruta o acción pendiente**: ir hacia alguien, la retirada, etc.

## Calles conectadas

**El problema:** 65 extremos de calzada morían en la acera, con un paso de peatones que no llevaba a ningún sitio, y los coches desaparecían ahí:
- la mayoría se quedaban a 1–7 casillas de la avenida de los antiguos límites de las zonas;
- los de la Marea acababan en el antiguo canal.

**Ahora:**
- `scripts/v20.mjs` **prolonga cada calle hasta la calzada más cercana** en su eje.
- En la unión pone un paso de peatones para quien va por la acera de la avenida.
- Aparta las cámaras de vigilancia que quedaban en medio y quita las farolas o papeleras del tramo nuevo.
- Comprobado: **ningún extremo de calzada acaba en la acera**. Los coches giran en la avenida en vez de desvanecerse.

## Manos vacías: guardia y puñetazo

**Antes:** sin arma no se podía golpear, y la animación de las armas cuerpo a cuerpo no salía si el objetivo estaba fuera de alcance.

**Ahora:**
- **Mantén el clic derecho** para ponerte en guardia (puños arriba). Con un arma cuerpo a cuerpo bloquea igual que antes.
- **Clic izquierdo** (con el derecho mantenido) para golpear hacia el cursor, **haya alguien o no**:
  - el movimiento se ve al momento;
  - si alguien está a tiro delante de ti (en un cono de unos 60°), recibe el golpe;
  - si no, el golpe va al aire.
  - Ctrl + clic: golpe fuerte.
- **Puñetazo nuevo:** recto desde la guardia, alternando derecha e izquierda; el fuerte va con la derecha y gira el tronco.
- **Armas cuerpo a cuerpo:** tajo con impulso, que se recoge sobre el hombro y baja en diagonal girando el tronco; es más largo para que se lea bien.
- Los demás jugadores ven tus golpes al aire (el servidor los reenvía).

## El modelo `Man_bearded_casual_animation.obj`

**No trae animaciones.** El formato OBJ solo guarda una malla estática: este archivo es un único objeto de 1.803 vértices, sin esqueleto ni movimientos.

Para usar sus movimientos hace falta el mismo personaje en **FBX, GLB/glTF o .blend** con las animaciones dentro. Con eso se pueden pasar sus movimientos a nuestro esqueleto. Revisa también que su licencia permita usarlo en el juego.

## Técnico

- **Servidor:**
  - `combat.counter` solo con `auto.on`;
  - `combat.swing` (golpe al aire o al que esté delante);
  - `steer` borra `pendingAction`.
- **Protocolo:** mensaje `swing { dx, dy, heavy }`.
- **Cliente:**
  - `view.swing()` anima tu golpe al momento;
  - las animaciones nuevas están en `chars3d.ts`;
  - el tráfico ignora los tramos que repiten parte de otra calle.
- **Compartido:** el mapa de calzadas da prioridad a las calles largas.
- **Contenido:** `scripts/v20.mjs` (idempotente; también lo llama `gen-content.mjs`).
- **Pruebas:**
  - `server/test/v20.test.ts`: sin retirada automática, golpe al aire, golpe que alcanza y ningún extremo de calle sin salida;
  - `survival.test` y `v05.test` hacen invulnerable al personaje que antes huía solo;
  - total: 138/138;
  - e2e de dos navegadores: OK;
  - e2e de controles: falla el paso «E sale del bar» por tiempo de espera en esta máquina. Falla igual con la v0.19 sin cambios: el renderizado por software va a 0–2 FPS.
