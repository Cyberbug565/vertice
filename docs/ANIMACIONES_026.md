# Animaciones de Vértice 0.26

Con **WASD** se ve la marcha capturada. Al correr cambia la zancada. Mantén el **clic derecho** y mueve al personaje hacia atrás o a los lados para desplazarte mirando al cursor. Con los puños libres levanta la guardia de boxeo. Con el escudo cinético activo bloquea con el antebrazo y proyecta el campo de energía. Pulsa **B** para elegir **Brooklyn Uprock**, **Ensayar boxeo** o **Provocar**. Los dos últimos son gestos sociales. Un ataque sigue usando los controles y las reglas de combate.

[Comparativa en movimiento](pruebas-026/comparativa.gif) · [Marcha, carrera y frenada](pruebas-026/marcha-carrera.png) · [Guardias, impactos y baile](pruebas-026/acciones.png)

## Qué se encontró en la release

Se verificaron los SHA-256 de los **31 archivos** de `moveset` (426.254.900 bytes). Se inspeccionaron los fotogramas, huesos y trayectorias de cada FBX nuevo, las animaciones embebidas en los modelos de los ZIP y los grupos de imágenes. En los 199 GLB/glTF distribuidos en el directorio público de esta revisión solo los dos bancos UAL2 contienen pistas de animación. El banco de capturas y el movimiento procedimental del cliente se contabilizan aparte.

| Fuente | Contenido comprobado | Uso en Vértice |
|---|---|---|
| 25 FBX subidos el 22 de noviembre | Una acción por FBX, 65 huesos de origen. Se conservaron 52 articulaciones por cuerpo. | 28 secuencias jugables con fotogramas a 30 Hz e interpolación entre muestras. |
| Universal Animation Library 2 | 43 nombres en el GLB. El GLB con desplazamiento de raíz y las dos versiones FBX repiten las mismas acciones. El maniquí carece de acciones. | El cliente ya contenía 28. Se incorporan los otros 15 en un archivo que se descarga cuando se necesita. El catálogo indica qué acciones tienen un evento de juego. |
| Modular Character Outfits – Fantasy | 121 ficheros. En el cuerpo campesino femenino hay una pista llamada `Jog_Fwd_Loop`. La variación entre las claves de los **195 canales** es cero. | Se descarta esa pose de prueba para la carrera. |
| Free Medieval 3D People | 32 ficheros, incluidos 28 FBX. Ningún FBX contiene curvas de animación. | Son modelos. |
| Vocations and Uniforms | Se revisaron por separado el archivo de Blender suelto y el incluido en el ZIP. Ambos contienen armaduras y objetos. Ninguno contiene acciones. | Los uniformes siguen el esqueleto de quien los lleva. |
| x320p Spritesheets | 672 PNG, 21 acciones en 16 direcciones con capas de cuerpo y arma. Incluyen muerte, impacto, saltos, guardias y anticipaciones. | Son secuencias dibujadas sobre un personaje fijo. El cliente conserva la ropa, el cuerpo y los implantes del personaje personalizable con sus mallas articuladas. |

[Release analizada](https://github.com/Cyberbug565/vertice/releases/tag/moveset) · [Inventario con procedencia y huellas de los archivos](pruebas-026/inventario.json) · [Estado individual de las 43 acciones UAL2](pruebas-026/universal.csv)

## Qué anima cada FBX

Los intervalos de fotogramas y las transformaciones de cada secuencia se pueden consultar en la herramienta de empaquetado. Derecha e izquierda se determinan desde el personaje. El movimiento horizontal de navegación lo decide el servidor. En el uprock se conserva el desplazamiento de la pelvis respecto al punto donde empezó el baile.

| Archivo del usuario | Acción visible en el juego |
|---|---|
| Standard.Walk | Marcha y paseo a distinta cadencia. |
| Change.Direction | Invertir la marcha durante la carrera. La zancada tras el giro proporciona el ciclo de trote frontal. |
| Run.Forward.Arc.Left | Esprint frontal al enderezar su trayectoria y carrera en curva al girar, con reflejo para la curva opuesta. |
| Running | Esquiva lateral. La pelvis desciende hasta 0,12 m y los pies pasan por encima de ella. Repetirlo como carrera haría rodar al jugador en cada ciclo. |
| Run.Backwards | Retroceso en guardia. Se alterna el apoyo del inicio y se recorta la bajada final hasta la posición agachada. |
| Strafing.1 / Strafing | Pasos hacia la izquierda y la derecha respectivamente al apuntar o bloquear. |
| Catwalk.Walk.Start.Turn.180.Right | Media vuelta al arrancar en sentido contrario desde parado. |
| Drunk.Walk | Marcha tras alcanzar un 35 % de embriaguez. El estado visible se replica a otros jugadores. |
| Injured.Run | Carrera con la pierna lesionada descargada y reflejo anatómico para la lesión contraria. La cojera al andar conserva su paso específico. |
| Walk.With.Rifle | Paso con arma larga. Los brazos conservan la empuñadura y el punto de apoyo propios del modelo del fusil. |
| Run.To.Rolling | Voltereta frontal con la esquiva. El giro y la altura proceden de la captura. |
| Jumping.Down | Descenso y recepción al usar el salto del implante. |
| Standing.Up | Incorporación tras dejar el suelo al recuperarse o al despertar. |
| Boxing | Golpe fuerte a mano vacía. Otro intervalo del mismo archivo mantiene la guardia con ambos puños recogidos. |
| Lead.Jab | Jab de combate, reflejado al cambiar de mano. |
| Receive.Uppercut.To.The.Face | Reacción a un golpe sin arma en la cabeza. Los impactos de bala mantienen su reacción propia. |
| Sword.And.Shield.Block | Entrada y mantenimiento del bloqueo con escudo cinético, en reposo o andando. |
| Draw.Sword.1 | Desenvainar al equipar una hoja compatible. |
| Great.Sword.Jump.Attack | Ataque fuerte de katana y golpe aéreo de la combinación de cuchilla pesada. |
| Punching.Bag | Ensayo de boxeo desde el menú B. |
| Brooklyn.Uprock | Baile seleccionable por el jugador. También está en el repertorio de los locales. |
| Taunt | Gesto de provocación desde B. |
| Opening | Manipulación de la máquina por los peatones y apertura al rebuscar en un contenedor. |
| Throw | Lanzar la basura al llegar un peatón al contenedor. |

El banco principal pesa **597.410 bytes**. Las 15 acciones adicionales de UAL2 ocupan **1.151.808 bytes** en un segundo archivo con carga bajo demanda. El cliente utiliza los mismos recursos relativos en local y detrás de Cloudflare. El renderizador Pixi proyecta los canales de marcha y gestos en 2D. La superarmadura Tormenta conserva su animador mecánico.

## Comparación de movimiento

Se reprodujo la misma entrada de marcha, carrera y parada a 60 actualizaciones por segundo sobre el mismo cuerpo femenino, con la pierna Corredora y la misma cámara. Se midieron diez articulaciones de brazos y piernas. Las fotografías usan la geometría deformada por Three, la ropa y el ciberware del juego. El segundo banco usa un cuerpo masculino con cazadora y brazo Vigía.

| Movimiento | Giro P95 anterior | Giro P95 actual | Mayor giro anterior | Mayor giro actual |
|---|---:|---:|---:|---:|
| Marcha | 3,23° | 4,05° | 4,50° | 6,37° |
| Carrera | 4,66° | 8,26° | 5,95° | 10,03° |
| Cambiar de ritmo y frenar | 7,08° | 6,21° | 13,22° | 10,03° |

El P95 es el giro entre dos fotogramas por debajo del que quedan el 95 % de las muestras. Marcha y carrera mueven las articulaciones más deprisa. En los cambios de ritmo el pico baja un 24 %. La variación de la velocidad angular P95 durante esas transiciones sube de 2,73° a 3,61° por intervalo de actualización. El resultado es una zancada más marcada con un menor salto máximo al cambiar de ritmo. Esta prueba mide el esqueleto y fija la frecuencia de muestreo. No mide los FPS de un navegador.

[Medidas originales](pruebas-026/fluidez.json)

## Animaciones fundamentales que faltan en partida

| Prioridad | Situación | Lo que ya hay | Lo que falta integrar |
|---|---|---|---|
| 1 | Cobertura y sigilo | La cobertura modifica los enfrentamientos y hay un paso cauteloso. | Agacharse y levantarse, avanzar agachado, pegarse a cobertura baja o alta y asomarse a cada lado. Faltan clips específicos. |
| 1 | Armas de fuego | Empuñar, caminar con fusil, apuntar y retroceso. Existe desenvaine de hoja. | Sacar y enfundar pistola y fusil, cambio de cargador y vuelta a puntería. Una recarga funcional necesitaría además distinguir cargador y reserva en las reglas. |
| 1 | Heridos, rescate y muerte | Impactos, derribo, postura tumbada, incorporarse y paso con carga. | Caídas direccionales para los cuerpos personalizables, arrodillarse para vendar o reanimar, recoger y depositar al herido y arrastrarlo. Los sprites de muerte están dibujados sobre otro cuerpo. |
| 1 | Navegación por obstáculos | Esquivas, pivotes y aterrizaje con implante. | Salto normal con despegue, vuelo y recepción, escalones y paso de vallas. Para trepar un metro y para deslizarse hay clips UAL2, pendientes de conectar a obstáculos y colisiones. |
| 2 | Interacciones cotidianas | Manipulación en máquinas y contenedores, teléfono, sentarse, fumar y gesto de consumo. | Recoger del suelo y de un estante, entregar o recibir un objeto a la altura correcta y transición entre silla y postura de pie. |
| 2 | Vehículos | Conducir y aparcar ya son acciones de juego. | Abrir la puerta del vehículo, subir, adoptar la postura de conducción, girar el volante y bajar por el lado libre. |
| 2 | Conversación y trabajos | Hay frases contextuales y gestos como asentir o cruzarse de brazos. | Saludar, señalar un punto del mundo y trabajar con herramientas de los oficios de Vértice. UAL2 trae movimientos de cultivo y tala que se pueden reutilizar si se añaden esos trabajos. |

## Reproducir

`npm run local` arranca el juego para jugar y `npm run publicar` conserva el arranque de publicación. Con Blender, Python, NumPy y SciPy se puede reconstruir el banco desde los archivos de la release.

```sh
blender -b --disable-autoexec -P tools/animaciones/leer-fbx.py -- CARPETA_RELEASE CARPETA_NPZ
python tools/animaciones/empaquetar.py CARPETA_NPZ client/public/models/anim/ciudad-026.vtm
python tools/animaciones/completar-ual.py CARPETA_RELEASE/Universal.Animation.Library.2.Standard.zip client/public/models/anim
npm run typecheck
npm test -- --reporter=dot
npm run build -w client
```

Para repetir las fotos, define `VERTICE_MOVESET_FOTOS` con la carpeta de salida y `VERTICE_CANVAS` con el módulo local de `@napi-rs/canvas`. Ejecuta `npx vitest run client/test/moveset.test.ts`. Si defines `VERTICE_MOVESET_FOTOGRAMAS` también se exportan los fotogramas individuales de la comparativa.
