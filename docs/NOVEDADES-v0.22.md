# Vértice v0.22 — Ropa 3D por capas, ropa interior y cuerpos desnudos

## 50 prendas de la release «ropa», ajustadas a los dos cuerpos

| Tipo | Prendas |
|---|---|
| Chaquetas y abrigos | abrigo largo «Monje», chaqueta cyberpunk clásica, chaqueta «CSI», chaqueta plateada, chaqueta caqui, chaqueta táctica, cazadora de cremallera; chaqueta cyberpunk con capucha, chaqueta corta «2099» y abrigo «Cyber-pop» (mujer) |
| Camisetas y jerséis | jersey cyberpunk, sudadera gruesa, jersey de punto; top futurista, top «Alas» y top «Cyber-pop» (mujer) |
| Monos, trajes y vestidos (ocupan camiseta y pantalón) | mono de bolsillos; mono de policía cyber, body cyberpunk, conjunto dorado, corsé, vestido y traje sci-fi (mujer) |
| Pantalones y faldas | pantalón de cuero ajustado, pantalón cyberpunk, pantalón urbano; cargo futurista, pantalón «Alas», pantalón «Cyber-pop», falda de volantes y falda larga (mujer) |
| Botas y guantes | botas futuristas, botas de cordones, botas de asalto, guantes de nudillos, guantes de asalto |
| Cascos y gorras | casco holográfico, casco de cúpula, casco de piloto, casco «Ronin oni», capucha cyberpunk, gorra táctica |
| Máscaras | pasamontañas, máscara de carbono, máscara cyberpunk, máscara estilizada, máscara táctica, gafas tácticas |
| Accesorios | chaleco de placas (va encima de la chaqueta), auriculares tácticos |

**Lo que no ha entrado.** Revisé las prendas una a una con capturas, de pie y andando. Estas no se pudieron ajustar bien porque su modelo original no está en una postura aprovechable:

| Prenda | Por qué |
|---|---|
| Chaqueta de moto de invierno | Venía animada en una postura de conducir. |
| Gabardina «Concepto 001» | Esqueleto de VRoid con la malla deformada. |
| Mono de asalto «Striker» | Malla de una animación de ataque. |
| Parka urbana | Mangas y capucha fusionadas con el cuerpo del modelo original. |
| Chubasquero largo | Mangas cosidas a los faldones. |
| Armadura «Valquiria rosa» | Es un personaje entero con la armadura pegada, no una prenda (y su licencia no permite redistribuirla). |

Del conjunto «Striker» sí están las botas, los guantes, la gorra y las gafas, y de la parka, el pantalón. La chaqueta cyberpunk con capucha solo encaja en el cuerpo femenino, así que es de mujer.

**Cómo se han ajustado.** Cada prenda venía de un autor distinto, a otra escala y en otra postura (en T, en A, con esqueleto…). Un proceso automático en Blender hace lo siguiente para cada una y para cada cuerpo:
1. Busca la escala, la posición y la postura de brazos y piernas con las que la prenda «abraza» el cuerpo.
2. La pasa a la postura del cuerpo del juego.
3. Le pone los pesos de los huesos del kit, así se mueve con el personaje: andar, correr, golpes y animaciones.
4. La separa de la piel.
5. Calcula qué partes del cuerpo tapa. Esas no se dibujan, así la piel nunca atraviesa la tela.

**Por sexo.**
- Las prendas de mujer (faldas, vestidos, tops, corsé…) solo las ve y se las puede poner el cuerpo femenino.
- Las demás son unisex y tienen un ajuste propio para cada cuerpo.
- No hay ningún cartel que lo indique: la prenda del otro cuerpo no aparece en la tienda ni en el inventario.

**Dónde se compran.**
- **Moda Órbita y Ropa Neón:** ropa futurista.
- **Armería Halcón:** equipo táctico.
- **Ropa Lumen y Ropa de Segunda Mano:** lo de diario.
- **Boutique Aurelia:** lencería, conjunto dorado y vestido.

## Ropa por capas: solo se cambia lo del mismo tipo

**Los huecos:** chaqueta, camiseta, pantalón, botas, casco, máscara, guantes, accesorio, ropa interior de arriba y ropa interior de abajo. Ponerte algo solo sustituye lo que llevabas en ese hueco.
- Puedes llevar chaqueta y camiseta a la vez.
- También chaqueta sin camiseta: si la chaqueta va abierta, se ve el cuerpo.
- Puedes ir con pantalón y sin camiseta.

**Las piezas que ocupan dos huecos:**
- Un mono, un vestido o un traje ocupan la camiseta y el pantalón.
- Ponerte un pantalón con un mono puesto te quita el mono.

**Quitar y volver a poner.** En la pantalla de personaje cada hueco tiene un **✕** para quitar lo que llevas: esa parte queda al aire. La **↺** vuelve a ponerte la ropa de serie de tu personaje.

## Cuerpos desnudos y ropa interior

**Los cuerpos.**
- Los dos cuerpos del juego están desnudos debajo de la ropa.
- Tienen anatomía adulta: pezones y areolas en los dos, vulva en el femenino y pene y testículos en el masculino.
- A la piel del kit le he quitado la ropa interior que traía pintada.

**La ropa interior.**
- **De serie:** calzoncillos (hombre), sujetador y braguitas (mujer).
- **En las tiendas, cada una en negro, blanco, rojo y neón:**
  - de hombre: calzoncillos, bóxer y camiseta interior;
  - de mujer: braguitas, tanga, sujetador y top deportivo;
  - lencería de encaje: braguitas, tanga y sujetador (mujer).

**Opción «Desnudos (contenido adulto)».** Está en el menú de opciones y viene activada. Si la desactivas, quien no lleve ropa interior se ve con la de serie.

**Arreglo del kit:** el cuerpo femenino tenía un corte de luz bajo el pecho, por las costuras del modelo. Ya no se ve.

## Recursos y licencias

- **Prendas en el repositorio:** las 50, con licencia CC-BY y ajustadas a los cuerpos (unos 30 MB), en `client/public/models/prendas/<cuerpo>/`.
- **Créditos:** autores y enlaces en `CREDITOS.md`.

## Técnico

- **Compartido:**
  - `garments.ts`: catálogo de prendas 3D y de ropa interior, la ropa interior de serie y `bodyKindOf`, que decide el cuerpo igual en el servidor y en el cliente;
  - huecos nuevos: `accesorio`, `interior_sup`, `interior_inf`;
  - en las prendas, `also` (otros huecos que ocupa) y `sex`;
  - en la apariencia, `garments`, `bare`, `underTop` y `underBottom` con sus colores;
  - el validador de contenido avisa de los ids de objeto repetidos.
- **Servidor:**
  - `wear` con quitar (`null`) y volver a la ropa de serie (`default`);
  - huecos ocupados por un mono;
  - control de sexo;
  - `wornAppearance` calcula las prendas 3D, las partes al aire y la ropa interior;
  - las tiendas no enseñan la ropa del otro cuerpo.
- **Cliente:**
  - `render/garments3d.ts`: carga, ata cada prenda a los huesos y separa las capas;
  - en `human3d.ts`, por cada persona, los vértices del cuerpo que tapa cada prenda, la ropa interior pintada sobre la piel con encaje, los genitales y las normales soldadas;
  - opción de desnudos;
  - pantalla de personaje con los huecos nuevos, **✕** y **↺**.
- **Herramientas de Blender:**
  - `fit.py`: el ajuste de las prendas;
  - generador de las texturas de piel y de las máscaras de ropa interior.
- **Pruebas:** `server/test/v22.test.ts`.
