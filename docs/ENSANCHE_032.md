# Ensanche y Saeta Vector

La malla exterior pasa de 608 × 344 a 744 × 432 losetas. Las avenidas que bordeaban la ciudad enlazan con cuarenta manzanas nuevas mediante veintiún tramos de calzada. Los cruces alimentan el tráfico y el mapa y los callejones tienen pasos libres entre las parcelas.

| Zona | Distribución |
|---|---|
| Cénit | Seis diseños de fachada procedentes de los dos escenarios de la release. Las torres se concentran en el centro y los podios quedan a pie de calle. |
| Dársena Este y Terminal Intermodal | Patios de carga con contenedores azules, verdes y oxidados, apilado de dos alturas y grúas. |
| Polígono Salobre, Fundición Sur y Patio de Vías | Naves bajas, depósitos, patios y calles de servicio. |
| Arco Sur, Ronda del Río y Llanos Orientales | Bloques medianos en Arco Sur y construcciones más espaciadas en la periferia. |

El Saeta Vector se vende en el Concesionario Saeta de Colinas Doradas y en Motos Kōtetsu. Se conduce con los controles habituales y se puede seleccionar en Propiedades. La tecla V permite subir y aparcar. Aparcar guarda su posición y deja el maletero accesible en la calle. El modelo se carga al aparecer un Vector y conserva sus faros, pilotos y propulsores en marcha y aparcado.

## Regenerar las adaptaciones

Los originales están en la [release «new york»](https://github.com/Cyberbug565/vertice/releases/tag/newyork). El script de edificios usa Blender 5.0 para `Cyberpunk_Building_blend.1.blend`. El escenario de John Doe se extrae del ZIP y las seis imágenes `BaseColor` del RAR se preparan a 256 px conservando sus nombres.

```sh
blender -b Cyberpunk_Building_blend.1.blend --disable-autoexec --python tools/ensanche/mallas.py -- torres /tmp/torres.json
blender -b CuberpunkCityWithKaws.blend --disable-autoexec --python tools/ensanche/mallas.py -- barrio /tmp/barrio.json
blender -b --python tools/ensanche/mallas.py -- contenedores /tmp/contenedores.json 'Cyberpunk+Container.obj' /ruta/colores
node --input-type=module -e "import fs from 'node:fs'; const p=['torres','barrio','contenedores']; const all=Object.assign({},...p.map(n=>JSON.parse(fs.readFileSync('/tmp/'+n+'.json','utf8')))); fs.writeFileSync('client/src/render/modelos-ensanche.json',JSON.stringify(all)+'\n')"
blender -b --python tools/ensanche/coche.py -- CyberpunkDeLorean.ma client/public/models/vehiculos/vector.glb
git show 9a244f1:content/zones/vertice.json > /tmp/vertice-031.json
node tools/ensanche/trazado.mjs /tmp/vertice-031.json content/zones/vertice.json
```

El catálogo almacena formas indexadas, una paleta por superficie y la intensidad de emisión para los neones. El cliente comparte geometría y materiales por tramo. La forma compacta del coche conserva la carrocería y tres grupos de iluminación en un solo GLB.
