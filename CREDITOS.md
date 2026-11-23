# Créditos de recursos externos

Vértice es un proyecto original. Aquí figuran los recursos de terceros y su procedencia.

| Recurso | Autor | Licencia | Dónde se usa |
|---|---|---|---|
| City Kit Commercial 2.1 (edificios y versiones ligeras) | Kenney — www.kenney.nl | CC0 1.0 (dominio público) | `client/public/models/kenney/`: edificios de respaldo para zonas sin modelo asignado |
| Puertas recortadas de City Kit Commercial 2.1 (building-c: portal; building-a: puerta doble de cristal) | Kenney — www.kenney.nl | CC0 1.0 (dominio público) | `client/public/models/puertas/`, recortadas con `tools/puertas/extraer.py` (v0.36) |
| Pack de armas low-poly (pistolas, revólveres, subfusiles, rifles, escopetas, francotiradores y accesorios) | Quaternius — quaternius.com | CC0 1.0 (dominio público) | `client/public/models/armas/`: armas de fuego en las manos |
| Universal Base Characters (cuerpos masculino y femenino con esqueleto, peinados y barba) | Quaternius — quaternius.com | CC0 1.0 (dominio público) | `client/public/models/humanos/`: cuerpos de todas las personas (texturas reducidas a 1024 px) |
| Universal Animation Library 2 (Standard): 28 animaciones recortadas | Quaternius — quaternius.com | CC0 1.0 (dominio público) | `client/public/models/anim/ual2.glb`: golpes, bloqueo, reacciones y gestos |
| Modular Character Outfits – Fantasy (Standard): jornalero y explorador | Quaternius — quaternius.com | CC0 1.0 (dominio público) | `client/public/models/atuendos/`: atuendos completos (texturas de color a 1024 px) |
| Vocations and Uniforms (Free): 17 personajes de oficios | Su autor en itch.io (ver la ficha original del recurso) | CC BY-SA | `client/public/models/cartoon/`: convertidos del `.blend` a GLB con una paleta común, sin otros cambios. Esos archivos derivados se distribuyen con la misma licencia CC BY-SA |

### Geometría urbana (v0.31)

La [release «new york»](https://github.com/Cyberbug565/vertice/releases/tag/newyork) del proyecto aporta el archivo `nylowermanhattan.blend`. El catálogo usa los volúmenes de `Areas:building` y un recorte de las calles de `Ways:highway`. Cartografía © [colaboradores de OpenStreetMap](https://www.openstreetmap.org/copyright). Los materiales, el deterioro y la iluminación son adaptaciones para Vértice.

### Ampliación de la ciudad (v0.32)

- Las torres y el podio de Cénit se extrajeron de `Cyberpunk_Building_blend.1.blend`. Los contenedores usan la geometría de `Cyberpunk+Container.obj` y colores extraídos de `Textures.rar`. [Release «new york»](https://github.com/Cyberbug565/vertice/releases/tag/newyork)
- Las variantes Pasaje Eléctrico, Aurora Neón y Torre Cableada adaptan edificios de John Doe (@born2012), bajo CC BY 4.0. [Cyberpunk City #1](https://sketchfab.com/3d-models/cyberpunk-city-1-14d2eaa145ee42938e004115871adf6c)
- El Saeta Vector adapta el modelo Cyberpunk Flying Car DeLorean de Chaosmonger Studio. Se redujeron las mallas, se sustituyeron los materiales de cámara y se ajustó la escala al juego. [Ficha del autor](https://www.cgtrader.com/free-3d-models/car/concept-car/cyberpunk-flying-car-delorean)

### Ropa 3D (v0.22)

Prendas de Sketchfab que aportó el dueño del proyecto (release «ropa»), ajustadas a los dos cuerpos del juego con Blender: escaladas, puestas en la postura del cuerpo, con los pesos de los huesos del kit y separadas de la piel. Texturas reducidas a 1024 px como máximo. Los archivos derivados están en `client/public/models/prendas/`.

| Prendas | Autor | Licencia |
|---|---|---|
| Casco «Ronin oni» | 6 — [Sketchfab](https://sketchfab.com/3d-models/3ffdc227bda84cacb051f443a5cccaab) | CC-BY 4.0 |
| Top futurista de manga larga | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/9aa10e27c5dd43f58c8d4920cf843016) | CC-BY 4.0 |
| Corsé sci-fi | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/d28c1ffc888f4435bbb361daca449c31) | CC-BY 4.0 |
| Vestido sci-fi | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/fbb07085e6b0419cbcf3636ce93c0083) | CC-BY 4.0 |
| Traje sci-fi ajustado | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/0e938256aa4f4af3b3a23c811da585fa) | CC-BY 4.0 |
| Cargo futurista | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/d06a6332d2394043ae343ea052c40007) | CC-BY 4.0 |
| Falda sci-fi de volantes, Falda sci-fi larga | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/b8c3c5bb9fae44fdb678ce52479d97f5) | CC-BY 4.0 |
| Pasamontañas | Alexander Kurmanin — [Sketchfab](https://sketchfab.com/3d-models/da7ccabba333455db76ecf22c39e341f) | CC-BY 4.0 |
| Casco holográfico | Alexandr33D — [Sketchfab](https://sketchfab.com/3d-models/bc2ae46f6882431497f49abc7668eb3a) | CC-BY 4.0 |
| Casco sci-fi de piloto | cenobyte — [Sketchfab](https://sketchfab.com/3d-models/57c4e5784952425bbe95e5975bbff694) | CC-BY 4.0 |
| Chaqueta plateada | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/31289d17254b403fb939a57f83ea69e1) | CC-BY 4.0 |
| Chaqueta caqui con capucha | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/538a0ad891ac4497a69b29f7ff89a91d) | CC-BY 4.0 |
| Chaqueta táctica | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/0d883d962375451f8d50f830d3b41380) | CC-BY 4.0 |
| Jersey cyberpunk, Pantalón cyberpunk | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/08b9da722fde459d935848ea616e326c) | CC-BY 4.0 |
| Sudadera gruesa con capucha | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/72ba46e828fa418ca3041be51f9bfaa2) | CC-BY 4.0 |
| Mono de trabajo | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/62c381f003474f9584efc1792c32bcf3) | CC-BY 4.0 |
| Pantalón de cuero | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/2bcc007cab704372a0f2a20d0b06ab5d) | CC-BY 4.0 |
| Botas de trabajo | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/40691624e9f74385be852b95b26b9f5f) | CC-BY 4.0 |
| Botas de asalto, Guantes de asalto, Gorra táctica, Gafas tácticas | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/da288adbddf949aa85962968732f0999) | CC-BY 4.0 |
| Guantes tácticos | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/da0ce7101abf4d12be84f661169d7fb9) | CC-BY 4.0 |
| Máscara de carbono | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/2350f25aa25749398abd6a26f769d0ee) | CC-BY 4.0 |
| Chaleco de placas | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/90c084b9a56441b1afcfa9293b6fe4af) | CC-BY 4.0 |
| Auriculares tácticos | DanlyVostok — [Sketchfab](https://sketchfab.com/3d-models/a8ffea33203147609aa8f064e46f8426) | CC-BY 4.0 |
| Chaqueta cyberpunk clásica | dejan31 — [Sketchfab](https://sketchfab.com/3d-models/17813414cc7d447e9f574c4299341c93) | CC-BY 4.0 |
| Abrigo «Cyber-pop», Top «Cyber-pop», Pantalón «Cyber-pop» | deymar — [Sketchfab](https://sketchfab.com/3d-models/55395f2e9fe941b0a2da4e9cbc4e155f) | CC-BY 4.0 |
| Jersey de punto | deymar — [Sketchfab](https://sketchfab.com/3d-models/ffd9ca805e624730aae1fcae790f9769) | CC-BY 4.0 |
| Mono de policía cyber | deymar — [Sketchfab](https://sketchfab.com/3d-models/81b1c3f306e1411bb0a8c1dcff87642c) | CC-BY 4.0 |
| Pantalón urbano | deymar — [Sketchfab](https://sketchfab.com/3d-models/8c3f5983e1a1430783b855271f4f9b64) | CC-BY 4.0 |
| Abrigo largo «Monje» | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/2094df3960104c469eb7e1773780b404) | CC-BY 4.0 |
| Chaqueta cyberpunk con capucha | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/1f3f90e45fe0403da45d56563d39c54a) | CC-BY 4.0 |
| Chaqueta «CSI» | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/43e6b03da2384e82864a6490f6304d5d) | CC-BY 4.0 |
| Chaqueta corta «2099» | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/44c4ae92e7f147989080cf45c26b9f34) | CC-BY 4.0 |
| Body cyberpunk | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/71b1acb4fcc44bfcb3b8a00531f96cf1) | CC-BY 4.0 |
| Capucha cyberpunk | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/06d288816a824e7a947a93e238c4dd64) | CC-BY 4.0 |
| Máscara táctica | Idmenthal — [Sketchfab](https://sketchfab.com/3d-models/a6380b5071e34b908798ec97106a123c) | CC-BY 4.0 |
| Casco de cúpula | infectedfury — [Sketchfab](https://sketchfab.com/3d-models/25461fb372fe4ed0887fca7a1de20f01) | CC-BY 4.0 |
| Máscara estilizada | Matthew Hart — [Sketchfab](https://sketchfab.com/3d-models/c7e0e5820f6a4df196060bc55d857350) | CC-BY 4.0 |
| Máscara cyberpunk | Nabo — [Sketchfab](https://sketchfab.com/3d-models/81437f5b38fb4b38a9063917a2922468) | CC-BY 4.0 |
| Botas futuristas | Nullified — [Sketchfab](https://sketchfab.com/3d-models/70f9ec0ade5345889e45fe75f3e26ffb) | CC-BY 4.0 |
| Cazadora de neón | RahulTambat — [Sketchfab](https://sketchfab.com/3d-models/e78ecaeb5b9c41869c692b884b3097d2) | CC-BY 4.0 |
| Top «Alas», Pantalón «Alas» | RealityRoller — [Sketchfab](https://sketchfab.com/3d-models/c5d9b322ae2b41f0b86bf63371eedde0) | CC-BY 4.0 |
| Conjunto dorado sci-fi | RealityRoller — [Sketchfab](https://sketchfab.com/3d-models/e7205b5f40104bf394349ffb1fc2e84e) | CC-BY 4.0 |

**Cuerpos (v0.22):** las texturas de piel de los cuerpos de Quaternius (CC0) se han modificado para quitar la ropa interior pintada y añadir la anatomía. La ropa interior y la lencería se pintan sobre la piel con máscaras propias (`interior-*.png`). Los genitales masculinos son geometría propia generada por código.

**Medieval 3D People (CraftPix, craftpix.net):** su licencia (craftpix.net/file-licenses) permite usarlo en el juego, pero no redistribuir los archivos. Por eso no está en el repositorio: se descarga de la release `moveset` con `tools/fetch-assets.mjs`.

**Cuchilla serrada y moveset de armas pesadas:** son un modelo y unas animaciones propios, hechos por código. Se inspiran en la hoja de sprites 2D de un orco (`x320p_Spritesheets.zip`) que aportó el dueño del proyecto y que no se incluye.

**Modelos aportados por el dueño del proyecto (no incluidos en el repositorio):** la armadura «Ophiel» (superarmadura «Tormenta»), la colección de peinados `nv+toufa`, el pelo de `Asian-Male` y el samurái cibernético (kabuto y grebas). Su licencia no está confirmada: se distribuyen aparte, en la release `modelos-extra-v17`, y los descarga `tools/fetch-assets.mjs`.

La antigua exoarmadura de placas (v0.15–v0.16) era un diseño propio (placas y grietas de luz generadas por código), inspirado en una imagen de referencia que no se incluye.

No se usa ningún modelo, textura ni diseño de otros videojuegos ni de tiendas con licencias que impidan publicarlos.

## Ciberware visible de Vértice v0.24

Las siguientes obras se adaptaron bajo [Creative Commons Atribución 4.0 Internacional](https://creativecommons.org/licenses/by/4.0/). Las adaptaciones incluyen extracción de las piezas indicadas, reducción de polígonos, ajuste de escala y silueta, materiales de juego, variantes anatómicas y pesos de animación sobre los cuerpos de Quaternius.

| Obra original | Autor | Piezas de Vértice |
| --- | --- | --- |
| [Cybernetic_Arms](https://sketchfab.com/3d-models/cybernetic-arms-57b2232ebbe94f77a89901df5eb5c7f3) | [KeisukePaws](https://sketchfab.com/KeisukePaws) | Brazo Circuito |
| [Robotic Prosthetic Arm](https://sketchfab.com/3d-models/robotic-prosthetic-arm-43b482c8526f45709b56434924dc4d3c) | [Daz](https://sketchfab.com/Darren.Hogan) | Brazo Servo industrial |
| [Bionic arm](https://sketchfab.com/3d-models/bionic-arm-6f344b7280374c42936930fef3069917) | [efforya](https://sketchfab.com/efforya) | Brazo de tendones Biónica |
| [Hand for the robot](https://sketchfab.com/3d-models/hand-for-the-robot-10871b7b2a314f52b36351281ff9903c) | [krilov.aleksandr](https://sketchfab.com/krilov.aleksandr) | Mano de precisión Pinza |
| [leg prosthesis](https://sketchfab.com/3d-models/leg-prosthesis-59d7e2b28b8b45ec8b179fff0134ceec) | [victorghys](https://sketchfab.com/victorghys) | Pierna de encaje |
| [Robotic Prosthetic Leg - Final Assignment](https://sketchfab.com/3d-models/robotic-prosthetic-leg-final-assignment-b3d10eb88e5145be961fe51b4b88a93a) | [Dixcit](https://sketchfab.com/Dixcit) | Pierna Corredora |
| [mech leg](https://sketchfab.com/3d-models/mech-leg-731ac5d369184eb7813ccbd1d2a3886e) | [Ilya.Krupenkov](https://sketchfab.com/Ilya.Krupenkov) | Pierna Grúa |
| [Cyborg Weapon](https://sketchfab.com/3d-models/cyborg-weapon-8bf111f38ff34ad38068739819fdaf0d) | [Enalrem](https://sketchfab.com/enalrem) | Módulo de antebrazo Inductor |
| [Security Cyborg](https://sketchfab.com/3d-models/security-cyborg-94ea8c717c374e3fa8aaa7549235b323) | [fletcherkinnear](https://sketchfab.com/fletcherkinnear) | Cabeza integral Centinela, Mandíbula Mordaza, Óptica Centinela |
| [Cyber Girl](https://sketchfab.com/3d-models/cyber-girl-46640796f0dd4fbab5eba5262d542e25) | [Rotmill](https://sketchfab.com/Rotmill) | Brazo de mensajería, Pierna de mensajería |
| [Spine Implant Segment](https://sketchfab.com/3d-models/spine-implant-segment-8026497f40d646c38de51e86608e2ab0) | [dxvs](https://sketchfab.com/dxvs) | Columna de discos Rótula |

Mano de taller, Vigía, Estibador, Bastión, Arconte, Coloso y Titán se modelaron para Vértice. El [inventario de la release](docs/CIBERWARE_3D.md#inventario-del-release) identifica las piezas y los dos archivos idénticos.

## Flota de Vértice v0.34

La [release `coches`](https://github.com/Cyberbug565/vertice/releases/tag/coches) aporta los archivos de origen. El juego usa versiones normalizadas con texturas reducidas y miniaturas generadas a partir de las mismas mallas.

| Archivos de origen | Uso |
| --- | --- |
| KayKit City Builder Bits 1.0 Free, de Kay Lousberg (CC0) | Compacto, berlina, familiar, taxi y patrulla |
| HoverCars.zip | Doce carrocerías, incluidos modelos civiles, industriales y de emergencias |
| Futuristic Car 2.1, Royal Hyper X, sci fi flying car 01 y BIKE FINAL | Prototipo, hiperdeportivo, maglev y moto |
| Cyberpunk DeLorean, de Chaosmonger Studio | Saeta Vector, ya adaptado en v0.32 |

`HoverCars.unitypackage` repite el paquete HoverCars. Los archivos de texturas y las ilustraciones 2D de la release son recursos gráficos, sin nuevas mallas de vehículos. `Future_CAR_Concept.mb` y `default.c4d` quedan pendientes de una exportación compatible.
