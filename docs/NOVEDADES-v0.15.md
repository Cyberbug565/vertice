# Vértice v0.15 — Cuerpos con esqueleto, exoarmadura «Tormenta» y un centro moderno

## Cuerpos nuevos (Quaternius, CC0)

- **Todas las personas** usan los cuerpos del pack *Universal Base Characters* de Quaternius (dominio público): un cuerpo **masculino** y otro **femenino**, con esqueleto de verdad.
  - Jugadores, PNJ, fantasmas y la vista previa del creador y del inventario.
- **Un cuerpo, muchas personas.** Se modela una vez y cada persona lo comparte; solo cambian:
  - **la cara**: mandíbula, pómulos, nariz, cejas y barbilla, según la forma elegida y una semilla propia, así que nadie se repite;
  - **la piel**: los 18 tonos;
  - **la ropa por zonas**: torso, mangas, pantalón y calzado, con sus tejidos;
  - **el pelo**: corto, rapado, largo y moños del pack, más los peinados propios del juego, con barba si toca.
- **Cuerpo base** es una opción nueva del creador (Masculino / Femenino).
  - Los PNJ lo reciben al azar, y si llevan barba, masculino.
- **El cromo y las amputaciones** siguen funcionando:
  - un brazo o una pierna de cromo pasa a metal con líneas de luz;
  - un miembro perdido desaparece entero.
- **Se anima con los huesos:** andar, correr, gestos, bailes, sentarse, manos arriba, rodar, quedar tumbado, golpes y patadas.
  - La estela de Kairós copia la pose del instante.
- **Las manos se cierran** sobre lo que sujetan.
- Peso: 3,4 MB (texturas reducidas a 1024 px).

## Agarrar el arma y tamaños reales

- **Las armas ya no son de juguete.** Con el cuerpo nuevo van a tamaño real:
  - un fusil de asalto mide unos 92 cm, un subfusil 50 cm y una pistola 21 cm;
  - antes se encogían al 75 % y el fusil parecía del tamaño de la mano.
- **Fusiles, escopetas y subfusiles se llevan a dos manos:**
  - **en reposo:** culata baja y cañón hacia abajo;
  - **al apuntar o disparar:** a la altura del hombro, con el codo doblado y el tronco girado;
  - **retroceso** al disparar.
- **La mano libre va al guardamanos.** Cada arma marca dónde se agarra y el brazo se coloca solo (cinemática inversa de dos huesos), sea cual sea la pose.
- **Pistolas:**
  - a una mano en reposo;
  - **a dos manos al apuntar**, con el brazo algo recogido para que la otra mano llegue a la empuñadura.

## Exoarmadura «Tormenta»

Basada en la imagen 25 del pack de iconos: la figura de roca partida por rayos azules, convertida en armadura moderna. Es un **diseño original** generado por código; la imagen no se incluye.

- **Placas facetadas** de aleación color pizarra:
  - coraza, gorguera, faja y escarcela;
  - hombreras;
  - brazales y antebrazos, musleras, rodilleras y espinilleras.
- Las placas van **colgadas de los huesos**, así que se mueven con el cuerpo.
- **Grietas de luz azul** que laten, con algún chispazo de vez en cuando.
- Debajo, un traje del mismo tono con la textura del cuerpo.
- **Estadísticas:**

  | Blindaje | Vida | Carga | Velocidad | Rareza | Precio |
  |---|---|---|---|---|---|
  | 9 | +10 | +4 kg | −5 % | épica | 18 500 €$ |

  - Se vende en la **Armería Halcón**.
- No se puede elegir gratis en el creador: hay que comprarla.

## Ciudad más moderna

- **Neón de colores que cambian.** Algo más de la mitad de las tiras de neón van girando de tono poco a poco, cada una con su desfase. Las demás laten, y unas pocas parpadean como un tubo gastado.
- **Más neón:**
  - franjas cada tres plantas en las fachadas que ve la cámara;
  - una segunda esquina iluminada en otro color.
- **Megatorres en el centro (Cénit):**
  - las torres del distrito corporativo suben a **42–170 m**;
  - van **escalonadas** en dos o tres tramos cada vez más estrechos;
  - cada retranqueo lleva **corona de neón** y aristas iluminadas;
  - en lo alto, una **aguja con baliza roja**.
- **Ventanas encendidas de noche.** Los cristales de los edificios se encienden al anochecer, cada ventana a su aire: luz cálida, alguna rosa y alguna azul fría.
- Las fachadas invisibles que deciden cuándo se vuelve transparente un edificio tienen la misma altura que las torres nuevas, así que siguen atenuándose cuando tapan al jugador.

## Packs revisados

| Pack | Decisión | Motivo |
|---|---|---|
| `Universal.Base.Characters.Standard.zip` | **Usado** | Licencia CC0 |
| `All.together-…zip` (Humans_Master.fbx) | No usado | No trae fichero de licencia, y el pack de Quaternius ya cubre lo pedido |
| FREE Lowpoly Cyberpunk Weapons | No usado | Su licencia prohíbe redistribuir los archivos originales y el repositorio es público; además, los modelos se basan en arte conceptual de otra persona. Las armas siguen con el pack CC0 de Quaternius, ahora a tamaño real |
| Free Dissolve Shader | No usado | Es solo para Unity (URP); no funciona en el navegador |
| FREE RAW 29 Icons | Solo la imagen 25 | Como referencia de la exoarmadura; no se incluye |
| Tokens y música | No usados | No se pidieron para esta versión |
| Texturas de edificios cyberpunk | Sin texturas | En la release no había texturas de edificios, así que se hizo con neón animado, ventanas encendidas y torres nuevas |

## Técnico

- **Cliente:**
  - `client/src/render/human3d.ts`:
    - carga del kit y zonas del cuerpo por peso de hueso;
    - sombreador de piel, ropa, cromo y cara;
    - pose por huesos y cinemática inversa de la mano libre;
    - exoarmadura.
  - `client/src/render/city3d.ts`:
    - megatorres;
    - material de neón animado (`tickNeon`);
    - ventanas nocturnas (`setCityNight`);
    - `megaHeight`, compartido con la vista.
  - `client/src/render/chars3d.ts`:
    - cuerpo del kit en el modelo;
    - postura de armas a tamaño real;
    - fantasmas que conservan el sombreador;
    - estela con esqueleto.
- **Contenido:**
  - `exo-tormenta` en `content/items/ropa-v09.json` y en la Armería Halcón;
  - `body` en el aspecto (`BODIES`).
- **Pruebas:**
  - `server/test/v15.test.ts`: cuerpo base, la armadura no se elige al crear, venta, vestirla y blindaje;
  - total: 116/116 en serie;
  - e2e de dos navegadores y de controles: OK;
  - `e2e/shots-v15.ts`: capturas del creador, del inventario con la armadura, del centro de noche y de la armadura en la calle.
