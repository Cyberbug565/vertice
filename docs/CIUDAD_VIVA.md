# Vértice 0.25 · Ciudad viva

## Explorar el mapa

Pulsa **M**, arrastra el plano con el ratón o el dedo y gira la rueda para ampliar el punto bajo el cursor. Las flechas desplazan el plano cuando tiene el foco. Los botones **+**, **−** y **Centrar en mí** también funcionan en pantalla táctil. En un interior puedes alternar entre la planta y la ciudad.

Cada personaje descubre celdas de ocho por ocho casillas. Pasar por la puerta de un comercio descubre la calle. Entrar guarda el nombre y el marcador del local, también en el minimapa. El guardado pertenece al personaje y se conserva entre sesiones. **Descifrar** abre la cartografía municipal para ese personaje a partir de **Interfaz 15 de 25**. El servidor comprueba el nivel.

## Locomoción

El juego elige entre paseo, marcha, trote, esprint, cautela, carga y cojera según la velocidad, la guardia y el estado del personaje. La carga contempla el peso y transportar un cuerpo. Una lesión unilateral modifica el apoyo de esa pierna. Personajes y PNJ comparten los ciclos. La cadera, la rodilla, el tobillo y la puntera se mueven por separado y el brazo contrario acompaña la zancada.

En [ciclos.json](../client/src/render/motion/ciclos.json), cada fila contiene cadera, rodilla, orientación de la suela, puntera, hombro y codo, en grados. Los nueve instantes describen un ciclo completo. La marcha reserva aproximadamente el 60 % al apoyo y el 40 % al balanceo. El trote y el esprint acortan el apoyo. Las mallas de ropa y ciberware reutilizan los huesos del personaje. El porteo aprovecha el clip de Quaternius cuando el modelo lo admite. [Fases de la marcha](https://www.ouhsc.edu/bserdac/dthompso/web/gait/terms.htm) · [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html).

## Añadir diálogos

En [server/voices/calle](../server/voices/calle) cada archivo agrupa un tema o una reacción. Esta versión contiene 200 aperturas con cinco contestaciones escritas para cada una, repartidas entre 20 temas. Hay módulos de comentarios para sobresaltos, curiosidad, empujones, saludos y para el momento en que alguien apunta. Los dos hablantes se turnan. El servidor comprueba el entorno y guarda un historial corto por hablante.

Desde la v0.37 hay además diálogos por zona en [server/voices/zonas](../server/voices/zonas), en formato `.voz`: ver [DIALOGOS_ZONA.md](DIALOGOS_ZONA.md).

Para añadir una exclamación cuando un PNJ cauto ve un arma potente, abre [susto.json](../server/voices/calle/susto.json) y añade una cadena al array **comentarios**. Para añadir una conversación de ese mismo tema, añade una entrada como esta a **escenas**.

```json
{
  "abre": "¿Has visto lo que lleva al hombro?",
  "respuestas": [
    "Sí. Esperemos al siguiente ascensor.",
    "Lo he visto. Ven, hay sitio aquí detrás."
  ]
}
```

Usa **requiere** para los requisitos del módulo o de una escena. **all** exige todas las etiquetas, **any** al menos una y **none** excluye las indicadas. Puedes omitir cualquiera de las tres listas. Ejemplos de etiquetas que ya genera el juego:

| Situación | Etiquetas |
| --- | --- |
| Arma equipada y visible con daño máximo de 30 o más, o rareza legendaria o mítica | `arma:potente` |
| Temperamento del observador | `caracter:cauto`, `caracter:curioso` |
| Policía o implante a la vista | `policia:visible`, `cromo:visible` |
| Momento, lugar o mobiliario | `dia`, `noche`, `barrio:ferro`, `cerca:busstop`, `cerca:bench`, `servicio:clinica` |
| Interacción inmediata | `apuntado`, `empujon`, `saludo`, `buscado` |

El alcance de la reacción al arma es de ocho casillas con visión directa. El personaje la tiene que llevar equipada. Un arma en la mochila no genera esa reacción.

Las [voces de misión](../server/voices/misiones) tienen un archivo por personaje con un array por etapa. Nadia, Iris, Sable y Teo tienen 125 líneas cada uno. Para conservar los objetivos y las elecciones del diálogo, añade la frase al array de la etapa que le corresponda. Reinicia el servidor después de editar estos archivos.

## Probar la actualización

En Windows, abre **iniciar-local.bat**. También puedes ejecutar `npm run local` con Node 22.12 o posterior. Para publicar desde el mismo proyecto, usa **publicar.bat**. Las pruebas de regresión se ejecutan con `npm test`.

## Imágenes de la versión

[Recorrido y descubrimiento de la Clínica Sato](pruebas-025/mapa.png) · [Rodilla y tobillo de la Corredora con body corto](pruebas-025/corredora-visible.png) · [La misma pierna bajo la falda en cuatro poses](pruebas-025/pierna-corredora.png) · [Cuatro estilos con abrigo y brazo Vigía](pruebas-025/estilos-de-paso.png).

El mapa se dibuja con el código del cliente y el conocimiento guardado durante una partida de prueba. Las láminas de movimiento usan los modelos, texturas, pesos y ángulos del juego en un banco con cámara fija. Los números indican la flexión de cada rodilla en ese instante. Las faldas largas y el vestido reparten el movimiento del bajo entre ambos muslos y ambas pantorrillas. El borde de tela opaca oculta los mismos puntos en el implante y en la piel.
