# Novedades de la v0.3 · «Megápolis»

Ciudad Vértice deja de ser solo el distrito Ferro: ahora es una megápolis de siete distritos con bandas, policía, médicos de pago, armas, hackeo de verdad y personajes mucho más detallados.

## 1. Personajes detallados y personalizables

- Nuevo paso **Aspecto** en la creación, con **vista previa en vivo** y a tamaño grande:
  - Complexión: delgado, medio o robusto.
  - 10 peinados y 7 colores de pelo; color de ojos (incluidos ópticos de neón); vello facial.
  - 7 prendas (chaqueta, gabardina, chaleco, sudadera, traje, top o mono de trabajo), con color de prenda y de pantalón.
  - Accesorios: gafas, visor, máscara, gorra, capucha o auriculares.
  - Tatuaje facial y color de acento para las luces y el cromo.
  - Botón **🎲 Aleatorio**.
  - Botón **Probar cromo**: muestra cómo se vería tu personaje con implantes.
- Las caras tienen ojos, cejas, nariz y boca, y la ropa y el pelo se dibujan por capas.

## 2. La megápolis: siete distritos y un mapa global

| Distrito | Ambiente | Policía |
| --- | --- | --- |
| **Ferro** | Puerto, Mercado Lumen y el Relé | Media |
| **Cénit** | Centro corporativo, rascacielos y arcologías | Alta |
| **Colinas Doradas** | Villas privadas y sede de Rescate Ámbar | Alta |
| **Neón Rojo** | Clubs, casinos y pachinko (Clan Kitsune, Las Furias) | Baja |
| **Forja** | Fábricas y chimeneas (Los Engranajes) | **No entra** |
| **El Arrabal** | Barrio obrero (Hermandad del Sol) | Baja |
| **El Yermo** | Desierto a las afueras (Nómadas del Polvo, Saqueadores) | **No entra** |

- Todos los distritos se cargan a la vez. Los distritos se conectan por avenidas en sus bordes.
- Solo se simulan los transeúntes de las zonas con jugadores; el resto queda congelado y no gasta servidor.
- **Mapa global** (tecla **M**): todos los distritos en cuadrícula, con su miniatura, una marca de «estás aquí», y para cada distrito sus facciones, locales y salidas.

## 3. Más futurista y cromo visible

- Coches que circulan por las calles y **coches voladores** entre los edificios.
- Balizas en las azoteas, hologramas, vallas publicitarias y tiras de neón. Las afueras tienen palmeras, chimeneas, chatarra y tiendas de campaña.
- **El cromo se ve por partes**: cabeza, ojos, cuerpo, brazo izquierdo, brazo derecho, pierna izquierda y pierna derecha. Al implantarte un brazo o una pierna, esa extremidad pasa a ser metálica, con articulaciones iluminadas. Los transeúntes y los pandilleros también llevan cromo, sobre todo Los Engranajes.
- Nuevos implantes de extremidad: cuchillas de antebrazo, puño hidráulico y cañón de antebrazo. Funcionan como armas integradas.

## 4. Menú de opciones con clic derecho

**Clic derecho sobre una persona, un cajero o una tienda** abre un menú agrupado:

- **Social:** hablar o robar como carterista.
- **Combate:** dejar KO o atacar a matar.
- **Recompensa:** capturar con vida o cobrar.
- **Red:** quickhacks.
- **Cuerpos:** rematar, cargar o estabilizar.

Cada opción muestra su probabilidad de éxito y qué pasa si sale mal.

- Las recompensas pueden ser **«solo vivo»** o **«vivo o muerto»**. Una «solo vivo» se cobra solo si dejas KO al objetivo; si lo matas, no cobras.
- Al poner una recompensa puedes marcar la casilla «solo vivo».

## 5. Más locales y más gente

- 21 tiendas y 43 zonas (interiores incluidos). Entre los locales nuevos:
  - Clínica Okami, Doc Yuki y el taller de Los Engranajes.
  - Club Kitsune, el pachinko, el casino Loto y el motel.
  - La comisaría, la armería del callejón, el ramen y la gasolinera.
  - Cajeros automáticos en las calles.
- Las calles se llenan de transeúntes, pandilleros de cada facción en su territorio y patrullas de la PCV. Los PNJ hablan con bocadillos sobre la cabeza.

## 6. Facciones y relaciones

- **22 facciones** inspiradas en arquetipos del género, todas con nombres originales:
  - Bandas: Los Chatarreros, Hojas Rojas, Los Engranajes, Clan Kitsune, Hermandad del Sol y Las Furias.
  - Netrunners: Voces del Vacío.
  - Nómadas: Nómadas del Polvo y Saqueadores del Yermo.
  - Fuerzas del orden: la Policía de Ciudad Vértice (corrupta), la Unidad Hierro (táctica de élite) y la Red Centinela (policía de la red).
  - Servicios: Rescate Ámbar.
  - Corporaciones: Halcón Dynamics, Grupo Okami, Teselia Neural, Aurora Logística y Kaiten Inmobiliaria.
  - Otras: la red de Nadia, el Mercado Lumen y el comercio independiente.
- Cada facción tiene un **territorio**, **aliados** y **enemigos**.
- Tu reputación con cada facción va de −100 a +100. Ayudar o atacar a una facción afecta, a la mitad, a sus aliados (en el mismo sentido) y a sus enemigos (en sentido contrario).
- Con mala reputación, sus miembros te atacan en su territorio.
- Panel **Facciones** (tecla **F**): tarjetas con color, descripción, barra de relación, territorio, aliados y enemigos.

## 7. Policía y médicos según el género: a pago y para VIP

- **PCV**: solo patrulla los distritos con policía; en Forja y el Yermo no entra.
  - Atacar o robar donde hay policía sube tu **nivel de búsqueda**. A partir de 2, la PCV pone precio a tu cabeza.
  - Si te pillan, te dejan KO y te detienen: multa y comisaría.
  - En la comisaría puedes **sobornar** para borrar el expediente.
  - Con búsqueda 4 o más aparece la **Unidad Hierro**, que dispara a matar.
- **Rescate Ámbar**: médicos de élite por **suscripción** (tecla **U**). Si caes derribado en una de sus zonas de cobertura, llega un equipo y te reanima. Sin suscripción, nadie viene.

| Plan | Precio | Rescates | Llegada | Cobertura |
| --- | --- | --- | --- | --- |
| Plata | 350 €$ | 1 | ~25 s | Distritos centrales |
| Oro | 900 €$ | 2 | ~15 s | Más distritos |
| Platino | 2200 €$ | Ilimitados | ~8 s | Toda la ciudad |

Cada plan dura 3 días de juego.

## 8. Interfaz más limpia y visual

- Barra inferior con **iconos**: Cancelar, Retirada, postura, Dormir, Diario, Ficha, Inventario, Mapa, Facciones, Empleos, Mercado, Recompensas, Ámbar y Ajustes.
- Panel del **arma equipada** abajo a la derecha: daño, alcance, munición, blindaje, la barra de **RAM** si llevas cyberdeck, el aviso de sobrecarga y tu plan Ámbar.
- Paneles con cabecera de color, tarjetas, chips y barras. Cada facción y cada tipo de arma tiene su color.

## 9. Armas clásicas y futuristas

18 armas, todas con daño, alcance, cadencia, precisión, munición y modo (letal o no letal):

| Tipo | Armas |
| --- | --- |
| Cuerpo a cuerpo | Navaja, bate, machete, porra eléctrica, guanteletes de choque y katana térmica |
| Pistolas | Pistola ligera, revólver pesado y pistola inteligente |
| Fuego | Subfusil, escopeta corta, rifle de asalto y rifle de precisión |
| Tecnológicas | Rifle de riel y táser (no letal) |
| Integradas | Cuchillas de antebrazo, puño hidráulico y cañón de antebrazo |

- Munición: balas de pistola, cartuchos, balas de rifle, células de energía y cargas de táser.
- Las armas de fuego pierden precisión más allá de la mitad de su alcance.
- Para dejar KO con un arma de fuego, el personaje usa la culata.
- Equipa y guarda las armas desde el **Inventario**.

## 10. Netrunner con rama propia, y peso

- **Rango de red** (0–10), independiente del nivel. Cada hackeo con éxito da XP de red. Con más rango, los hackeos:
  - salen más a menudo;
  - suben más rápido;
  - gastan menos RAM;
  - dejan menos rastro.
- La **RAM** se regenera sola. El cyberdeck básico da 6 de RAM; el militar, 20.
- Quickhacks desde el clic derecho:

| Quickhack | Rango mínimo | Efecto |
| --- | --- | --- |
| Escanear | 0 | Información del objetivo |
| Reinicio óptico | 0 | Ciega: más fácil robarle o golpearle |
| Cortocircuito | 0 | Daño |
| **Sobrecarga sináptica** | 2 | Lo deja **KO** |
| **Quemar sinapsis** | 4 | **Lo mata** |
| Vaciar cuenta | 1 | Le roba dinero a una persona |
| Saquear caja registradora | 1 | Le roba dinero a una tienda |
| Saquear cajero | 2 | Le roba dinero a un cajero |

  Cada hackeo puede dejar rastro: si la Red Centinela te rastrea, sube tu nivel de búsqueda.
- **Peso**:
  - Todo lo que llevas pesa: armas, munición, comida y ropa.
  - **Cargar un cuerpo** suma 70 kg.
  - Por encima de tu capacidad vas **cargado** (más lento). Muy por encima, vas **sobrecargado**: muy lento y torpe en combate.
  - Suelta el cuerpo desde el menú de clic derecho.

## Teclas nuevas

| Tecla | Acción |
| --- | --- |
| Clic derecho | Menú de opciones sobre la persona u objeto (en el suelo, cancela) |
| `M` | Mapa global |
| `F` | Facciones |
| `U` | Rescate Ámbar |
| `I` | Inventario y armas |

## Cómo actualizar

- **Con git:** `git pull`, y después `publicar.bat` (Windows) o `publicar.command` (macOS) como siempre.
- **Sin git:** vuelve a descargar el ZIP desde GitHub (**Code → Download ZIP**), descomprímelo encima y abre `publicar.bat`.

La base de datos se migra sola al arrancar. Los personajes antiguos conservan su aspecto, con los valores nuevos por defecto.

## Qué probar y contarme

1. Crea un personaje nuevo y juega con el paso **Aspecto**.
2. Pulsa **M** y viaja a Forja o a Neón Rojo por las avenidas de los bordes.
3. Haz clic derecho sobre un transeúnte, un pandillero y un cajero.
4. Prueba el oficio de cazarrecompensas con una recompensa «solo vivo».
5. Contrata Ámbar Plata, déjate derribar en Ferro y comprueba que te rescatan.
6. Con un netrunner, sube de rango de red saqueando cajeros.
