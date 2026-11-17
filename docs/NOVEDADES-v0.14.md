# Vértice v0.14 — Ciudad en 3D, armas de verdad y caras únicas

## Qué se ha usado de los recursos enviados (y qué no)

| Archivo | Qué es | Licencia | Uso |
|---|---|---|---|
| `kenney_city-kit-commercial_2.1.zip` | Edificios low-poly | **CC0** (dominio público) | ✅ Edificios 3D de la ciudad |
| `FBX-…zip` | Pack de armas low-poly de Quaternius | **CC0** | ✅ Armas de fuego en las manos |
| `human.rar` | «Human ZBuilder» (TurboSquid) | Licencia de TurboSquid: no permite publicar los archivos | ❌ No incluido |
| `ciber.rar` | Robot «Synthoid» (TurboSquid) | Ídem | ❌ No incluido |
| `cyberpunkbuilding.rar` | Edificio hecho por un fan que imita el estilo de un juego comercial (TurboSquid) | Licencia de TurboSquid y diseño derivado de otro juego | ❌ No incluido |
| `mewyork.rar` | Manhattan (TurboSquid) | Licencia de TurboSquid | ❌ No incluido |

El repositorio y el juego son públicos: cualquiera puede descargar los modelos que sirve el navegador. Por eso solo entra lo que es de dominio público. Los créditos están en [`CREDITOS.md`](../CREDITOS.md).

## Ciudad en 3D

- **Las manzanas de la ciudad son edificios 3D** del kit de Kenney, que sustituyen a los prismas 2D.
  - **Bajos y medianos:** rejilla de edificios de unas 2,5 casillas, cada uno con su altura.
  - **Torres:** rascacielos ajustados a su planta y estirados hasta su altura.
  - **Color:** cada manzana toma el de su barrio.
- **Neón en las esquinas** y en el borde del tejado, del color del rótulo, para que la ciudad siga siendo cyberpunk de noche.
- **Los rótulos** van por encima del volumen 3D.
- **Si un edificio te tapa** se vuelve translúcido (sin el efecto «rayos X» de ver todo a través). **Con la cámara muy cerca** desaparece.
- **Los edificios tapan de verdad** a los personajes que tienen detrás.
  - Farolas, marquesinas, cajeros, máquinas, puertas, pasarelas, etc. llevan un volumen invisible para que la fachada 3D no se pinte encima.
- **Rendimiento:**
  - un solo dibujo por modelo y por trozo de mapa de 48×48 casillas, así que la tarjeta solo pinta lo que se ve;
  - el interior de las manzanas usa las versiones ligeras del kit (~200 vértices);
  - con **calidad baja** se usan siempre las ligeras;
  - todo el kit pesa ~3,5 MB y se carga una vez;
  - mientras carga, se ven los edificios 2D de siempre.
- **Los interiores** no cambian.

## Armas de fuego con modelos de verdad

21 armas del juego usan modelos del pack de Quaternius:

| Tipo | Armas |
|---|---|
| Pistolas | ligera, compacta, silenciada (con silenciador), inteligente, de plasma, de agujas |
| Revólveres | pesado, de raíl |
| Subfusiles | subfusil, inteligente, compacto |
| Rifles | de asalto, carabina, de pulsos, de precisión, francotirador inteligente, de dardos, de raíl (bullpup) |
| Escopetas | recortada, de corredera, tecnológica |
| Ametralladora ligera | con bípode |

- **Tamaño real por tipo:** pistola 21 cm, rifle 92 cm, francotirador 1,2 m… El pack es estilizado y se ajusta.
- **Materiales** que reaccionan a la luz (metal, madera, cristal de las miras).
- **Brillo de su tecnología:** plasma en naranja, raíl en azul, inteligente en verde, eléctrica en cian.
- **Las que no tienen modelo** en el pack (táser, ballesta, lanzagranadas, cañón sónico, ametralladora rotativa y todas las de cuerpo a cuerpo) siguen con su modelo propio.

## Un cuerpo base y caras únicas

- **Un solo cuerpo** (el del juego) para todos; **la cara es lo que cambia**. Cada persona tiene la suya, generada a partir de su nombre y siempre igual:
  - **Ojos:** separación, altura, tamaño, forma e inclinación; tamaño del iris; pestañas.
  - **Cejas:** altura, inclinación y longitud.
  - **Nariz:** largo y ancho.
  - **Boca:** ancho y altura.
  - **Rasgos propios:** pecas, un lunar, arrugas de expresión.
  - **Cabeza:** proporciones (±5 %).
- **Textura de la cara al doble de resolución.**
- **Cromo en la cabeza:** tres estilos según la persona (placa lateral, placa de mandíbula o conectores en las sienes y la frente).
- **18 tonos de piel** en el creador, de muy clara a muy oscura, más pieles sintéticas: cromo pálido, gris azulado, lila y menta.
- **Los PNJ** usan 15 tonos de piel.

## Compatibilidad comprobada

- **Kairós:** la estela 3D copia también el arma nueva.
- **CARMÍN y Rafa «Brasas»:** se ven como fantasmas junto a los edificios 3D.
- **Habilidades** del 1 al 4, la vista previa del creador y de la ficha, el saqueo de cadáveres, la sangre y la vida en la calle.
- **Pruebas:**
  - 114 del servidor en serie (la de la v0.6 que depende del azar falla de vez en cuando y pasa al repetirla);
  - e2e de dos navegadores: OK;
  - e2e de controles: OK.
