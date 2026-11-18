# Vértice v0.17 — La Tormenta de verdad, peinados de la colección y piezas del samurái

## Superarmadura «Tormenta» (modelo Ophiel)

He borrado mi diseño anterior. La Tormenta es ahora la armadura **Ophiel** de la release «armaduras».

**Cómo se ve:**
- Ángel guerrero acorazado de unos **3,5 m** (dos veces una persona), con **alas** y **halo**.
- **Negra con azul neón**: placas de metal negro con filo de luz azul que late, y las piezas pequeñas (gemas, juntas) encendidas en azul neón.
- El halo gira y las alas respiran.

**Cómo se preparó el modelo:**
- El original es una escultura de ZBrush de **27 millones de polígonos y 844 MB**.
- En Blender se repartió el presupuesto de polígonos por tamaño de pieza, se dejó en **unos 147 000 polígonos (3,7 MB)** y se separó en **cabeza, halo, torso, alas, brazos, antebrazos, muslos, espinillas y pies**.
- No tiene esqueleto: cada parte cuelga de su articulación y se mueve con la misma pose que la persona (andar, correr, golpear, caer).

**Cómo funciona en el juego:**
- **Se pregunta antes de ponérsela.** El aviso dice que una vez dentro no se puede salir nunca más; hay que pulsar «Entrar para siempre».
- **No se quita nunca:**
  - el servidor rechaza quitarla y cualquier cambio de ropa mientras la llevas;
  - tampoco se puede poner sin la confirmación.
- Sigue siendo **mítica y única**: la da el último encargo de Teo (Proyecto TORMENTA) y solo se pierde al morir; pasa a quien te mate.
- Mientras se descarga el modelo, se ve al piloto.

## Peinados de la colección (release «pelos»)

- **105 peinados** de `nv+toufa.obj`, más **1 pelo realista** sacado de `Asian-Male.blend`.
- Cada uno es un modelo de verdad y **se encaja sobre la cabeza** de cada cuerpo:
  - toma la escala de la anchura de su cabeza;
  - sigue la forma propia de la cara de cada persona;
  - se tiñe del color de pelo elegido.
- **Creador:** fila nueva **«Peinados de la colección»** con miniatura de cada peinado (renderizadas en Blender).
- Se descargan solo cuando alguien los lleva (unos 350 kB cada uno). Si no están en el servidor, se pone un peinado normal.

## Piezas del samurái (release «armaduras»)

El samurái cibernético es un modelo de una sola pieza, sin esqueleto y en una postura girada. Se enderezó en Blender:
- el eje lateral sale de la anchura de la cadera;
- el delante, de la máscara;
- se quitaron las espadas y el cuerpo.

Se sacaron dos prendas:

| Prenda | Hueco | Qué es | Precio |
|---|---|---|---|
| **Kabuto oni de neón** | Cabeza | Casco negro con máscara oni de ojos cian y penacho blanco; blindaje 4 | 7800 €$ |
| **Grebas flotantes samurái** | Pies | Grebas azul acero con sandalias de levitación; +velocidad y esquiva | 6400 €$ |

Las dos van con sus texturas originales y se venden en la Armería Halcón y en Ropa Neón.

## Lo que no se pudo usar

| Recurso | Motivo |
|---|---|
| **Zbuilder 2 for ZBrush** | Es un plugin comercial de ZBrush sin licencia. Su formato (`.pkzb`) solo se abre dentro de ZBrush. No lo uso ni lo incluyo. |
| **Modular Sentry (3Darknight)** | Son torretas, no una armadura. Su licencia permite usarlas en un juego pero no redistribuir los archivos, así que no van al repositorio público. |
| **Pechera, hakama y brazos del samurái** | El modelo es de una pieza: la pechera arrastra un brazo y la katana, y la hakama arrastra las vainas cruzadas. Quedaban rotas. |
| **mainRobot.fbx** | Robot con esqueleto que no es un pelo ni una prenda. Queda para otra versión (PNJ o ciberware). |
| **Ropa futurista y urbana de internet** | La red de esta sesión no deja entrar en quaternius.com ni itch.io. Lo más adecuado que encontré es «Modular Character Outfits – Fantasy» de Quaternius (CC0 y hecho para nuestros mismos cuerpos y esqueleto), pero es de fantasía. Para ropa futurista o urbana con licencia libre hace falta que subas los paquetes a una release o que se permitan esos dominios. |

## Recursos fuera del repositorio

- La licencia de Ophiel, de la colección de peinados, de Asian-Male y del samurái **no está confirmada**, así que **no están en el repositorio público**.
- Van en el paquete `vertice-extra-v17.tar.gz` (28 MB).
- **`tools/fetch-assets.mjs`** lo baja de la release `modelos-extra-v17` y lo descomprime en `client/public/models/extra/`.
  - `npm run build` lo llama solo, y `npm run assets` lo fuerza.
  - Si no está, el juego funciona igual: se ve al piloto en lugar de la Tormenta, no sale la colección de peinados y el kabuto y las grebas no se ven.
- Desde esta sesión no puedo crear releases (GitHub lo prohíbe para este tipo de sesión), así que la release `modelos-extra-v17` hay que crearla a mano con ese archivo.

## Técnico

- **Cliente:**
  - `client/src/render/tormenta3d.ts` sustituye a `mech3d.ts` (borrado) y a la exoarmadura de placas (borrada de `human3d.ts`).
  - `client/src/render/hairs3d.ts`: carga de peinados bajo demanda.
  - `client/src/render/samurai3d.ts`: piezas del samurái.
  - `clothes3d.ts`: encaje de peinados, casco y botas en el cuerpo.
- **Compartido:** `HAIR_COLLECTION` en `shared/src/appearance.ts`.
- **Protocolo:** `wear` con `confirm`.
- **Pruebas:**
  - `server/test/v17.test.ts` y `v16.test.ts` (Tormenta: confirmación y permanencia).
  - Total: 122/122 en serie.
  - e2e de controles y de dos navegadores: OK. En una pasada, el paso de las dos pestañas se pasó de tiempo por la carga de la máquina; repetido, pasó.
