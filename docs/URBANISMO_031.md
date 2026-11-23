# Ciudad Vértice v0.31

Las 31 formas del catálogo proceden de componentes separados del modelo `nylowermanhattan.blend` de la release «new york». Se alinean a sus fachadas y se ajustan a las parcelas de Vértice. Las cornisas y los tramos LED siguen los bordes de la geometría. Los acabados distinguen vidrio corporativo, viviendas, comercios, chapa industrial y ruinas con cubiertas deformadas. [Release de origen](https://github.com/Cyberbug565/vertice/releases/tag/newyork)

| Zona | Trazado y edificios |
|---|---|
| Cénit | Torres corporativas de distinta altura, retranqueos, cristales y coronas luminosas. La travesía y la calle de las Coronas forman una T descentrada adaptada del recorte de calles original. |
| Colinas Doradas | Diez fincas de baja altura con parcelas ajardinadas, accesos pavimentados e iluminación cálida. Los edificios de servicios siguen ocupando las avenidas existentes. |
| Ferro, Neón Rojo y Arrabal | Bloques, galerías, edificios de esquina y marquesinas comerciales. Los escaparates recogen los colores del barrio. |
| Forja, Polígono Abandonado y alrededores | Naves, depósitos, almacenes, cargaderos y estructuras deterioradas. Las entradas de carga enlazan con la arteria del Polígono. |
| El Yermo | Accesos desde la carretera principal, naves bajas, ruinas aisladas y terreno de grava y arena. |

En el censo de 2020, Manhattan superaba los 74.000 habitantes por milla cuadrada, frente a unos 22.000 en Queens y 8.600 en Staten Island. Esa diferencia orientó el contraste entre las manzanas de Cénit y las parcelas más abiertas de Colinas y de El Yermo. La ambientación se inspira en el centro corporativo y la periferia degradada de Cyberpunk 2077. Las calles conservan los destinos de puertas y pasarelas. [Censo y densidad por distrito](https://comptroller.nyc.gov/wp-content/uploads/documents/Popular-Annual-Financial-Report-2024.pdf) · [Guía de Cyberpunk 2077 de CD Projekt Red](https://cdn-s-cyberpunk.cdprojektred.com/CP2077-UE-Booklet-EN-1.pdf)

## Reproducir el catálogo y aplicar el trazado

```sh
blender --factory-startup --disable-autoexec -b /ruta/nylowermanhattan.blend -t 2 \
  --python-exit-code 2 --python tools/urbanismo/extraer.py -- client/src/render/nueva-york.json
git show fd56ba8:content/zones/vertice.json > /tmp/vertice-base.json
node tools/urbanismo/aplicar.mjs /tmp/vertice-base.json content/zones/vertice.json
```

El fichero del catálogo contiene unos 51 KiB de posiciones, caras, aristas de iluminación y ejes de calle. El renderizador comparte la geometría y agrupa las instancias por modelo, material y tramo de mapa. Si se desactivan los edificios 3D, el cliente dibuja una proyección isométrica de las mismas formas. Las nuevas calzadas se leen desde el mapa de suelo que ya usan el tráfico, los peatones y el minimapa.
