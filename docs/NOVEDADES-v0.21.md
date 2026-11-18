# Vértice v0.21 — Personajes cartoon, animaciones de librería, arma pesada del orco y Tormenta más baja

## La Tormenta, más baja

Con 3 m y unas piernas tan largas quedaba desproporcionada. Ahora:
- **mide unos 2,4 m**: sigue siendo más alta que cualquier persona, pero ya no es un gigante;
- **las piernas son un 45 % más cortas** (muslos, rodillas y tobillos), y el tronco, los brazos y las alas mantienen su tamaño;
- la altura total se ajusta después a 2,4 m, así que queda robusta y con las piernas cortas, sin estirarse;
- la sombra se ha reducido a juego.

Funciona igual con el modelo Ophiel (`tormenta.glb` de la release «armaduras») y con la Tormenta de placas.

## Personajes cartoon de pocos polígonos

En el creador hay una sección nueva, **«Modelo»**: «Personalizable» (el cuerpo de siempre, con ropa, peinado y cara) o uno de los 31 personajes cartoon:
- **Oficios** («Vocations and Uniforms», 17):
  - hombre y mujer base;
  - ejecutivo y ejecutiva;
  - médico y enfermera;
  - ingeniero, científico y mecánico;
  - estudiante (chico y chica) y profesora;
  - policía y agente de tráfico;
  - bombero, basurero y soldado.

  Los dos niños del pack no se usan.
- **Medievales** («Medieval 3D People» de CraftPix, 14): vecinos, rey, reina, campesinos y ricos.

**Cómo se mueven:**
- El personaje cartoon se monta sobre un esqueleto invisible del juego, que sigue moviéndose con todo el sistema: andar, correr, agacharse, rodar, golpes, armas y las animaciones nuevas.
- En cada fotograma se copia la pose hueso a hueso. Se corrige la diferencia de postura de reposo (en T o en A) y se escala a la altura de la cadera, así que la cabeza grande del estilo cartoon se conserva.

**En la calle:**
- cerca de la mitad de los transeúntes lleva un personaje cartoon (oficios y algún medieval);
- más de la mitad de los policías son el policía o el agente de tráfico del pack.

## Atuendos completos (Quaternius, CC0)

Dos prendas de cuerpo entero hechas para el mismo esqueleto que los cuerpos del juego, en versión de hombre y de mujer:
- **Atuendo de jornalero** (240 €): camisa, chaleco, pantalón y botas.
- **Atuendo de explorador** (680 €, +2 a esquivar): capucha, hombreras, cinturones y botas altas.

Se venden en Aurora 24H. Se atan a los huesos de la persona y se mueven con ella. El cuerpo de debajo se oculta, salvo la cara, para que no se transparente.

## Animaciones de la librería universal (Quaternius UAL2, CC0)

Están hechas para el mismo esqueleto, así que se usan directamente sobre los cuerpos del juego (y, a través de ellos, sobre los cartoon):
- **Puñetazo:** gancho con su recuperación.
- **Armas de una mano:** dos tajos que se alternan, y un tercero para el golpe fuerte (Ctrl).
- **Guardia con arma:** postura de bloqueo con el clic derecho.
- **Recibir un golpe:** el tronco se encoge y retrocede.
- **Levantarse del suelo** tras caer, dormir o quedar inconsciente.
- **Gestos de la calle:** hablar por teléfono, cruzarse de brazos (gente esperando en paradas y junto a carteles), negar y asentir al hablar.

Mientras se anda, solo se usa la parte de arriba: las piernas siguen el paso.

**Sobre andar, correr, saltar y agacharse:** la librería que llegó es la UAL2 «Standard», y esa **no trae ciclos de andar, correr ni agacharse**; están en la primera librería (UAL1). Por eso esos movimientos siguen siendo los del juego, que ya se adaptan a la velocidad real. Si subes la UAL1 a la release «moveset», se pueden integrar igual.

## Cuchilla serrada del orco: arma pesada y su moveset

El orco del `x320p_Spritesheets.zip` es un personaje en 2D (dibujos planos), así que su arma no se puede «sacar» tal cual para el mundo 3D. Se ha **recreado en 3D a partir de los dibujos**:
- una hoja larga y oxidada con 8 dientes en el filo;
- la punta en gancho;
- la guarda de hierro y un mango largo.

**Cuchilla serrada de desguace** (rara, 3400 €):
- daño 18–30 y alcance 2,1 m;
- causa sangrado;
- se lleva a la espalda;
- se vende en la Chatarrería de Tomás y en Armas Pesadas de Forja.

**Moveset de las armas pesadas** (cuchilla serrada, mazo, martillo neumático, hachas, tubería y bate). Son tres ataques inspirados en los del orco, que se encadenan golpe a golpe:
1. **Barrido giratorio:** recoge el arma atrás y da una vuelta completa con los brazos extendidos.
2. **Doble tajo:** de arriba abajo en diagonal y vuelta de revés.
3. **Salto con golpe:** se agacha, salta con el arma sobre la cabeza y la clava en el suelo.

Cada uno dura 1,1–1,3 s. El tiempo de espera del arma pesada (×1,8 con Ctrl) hace que no se puedan encadenar más rápido.

**Controles:** mantén el clic derecho (guardia) y pulsa el izquierdo.
- **Arreglado:** con el derecho pulsado, el navegador no avisaba del clic izquierdo y el golpe no salía.
- **Arreglado:** si el cursor estaba sobre tu propio personaje, se abría tu menú en vez de golpear.
- **Arreglado:** la postura de bloqueo ya no tapa los brazos mientras dura un ataque pesado.

## Recursos y licencias

- **En el repositorio:**
  - `client/public/models/cartoon/`: 17 personajes en GLB con una paleta común (unos 7 MB), «Vocations and Uniforms», CC BY-SA. Convertidos del `.blend` original a GLB, sin otros cambios.
  - `client/public/models/atuendos/`: 4 atuendos, 4,6 MB.
  - `client/public/models/anim/ual2.glb`: 28 animaciones, 1,9 MB.
- **Fuera del repositorio:** el pack medieval de CraftPix. Su licencia permite usarlo en el juego pero no redistribuir los archivos. `npm run assets` lo descarga de la release «moveset» (`Free.Medieval.3D.People.Low.Poly.Pack.zip`) en `client/public/models/extra/medieval/`. Si no está, esos personajes se ven con el cuerpo normal.

## Técnico

- **Compartido:**
  - `CARTOON_MODELS` y `Appearance.model` (validado);
  - `TOPS` añade `atuendo-campesino` y `atuendo-explorador`;
  - emote `brazos`;
  - el mazo y la cuchilla serrada son armas grandes (a dos manos, a la espalda).
- **Cliente:**
  - `render/cartoon3d.ts`: carga y copia de pose por huesos;
  - `render/outfit3d.ts`: atuendos atados al esqueleto;
  - `render/anim3d.ts`: muestreo de clips sobre los huesos;
  - en `chars3d.ts`: moveset pesado por fotogramas clave, `playClips` y el modelo de la cuchilla;
  - `tormenta3d.ts`: `fitBody`, con las piernas al 55 % y la altura a 2,4 m;
  - `view.ts`: clic izquierdo con el derecho pulsado (`mousedown`).
- **Servidor:** modelos cartoon para transeúntes y policía; gesto de cruzarse de brazos en paradas y carteles.
- **Contenido:** `cuchilla-serrada` y los dos atuendos, con sus tiendas.
- **Herramientas:** `fetch-assets.mjs` descarga y descomprime el pack medieval (sin dependencias, con `zlib`).
- **Pruebas:**
  - `server/test/v21.test.ts`: validación del modelo, los 17 GLB, atuendos a la venta, la cuchilla como arma grande y en sus tiendas, transeúntes con modelo y la librería de animaciones;
  - total: 144/144;
  - e2e de dos navegadores: OK;
  - e2e de controles: OK.
