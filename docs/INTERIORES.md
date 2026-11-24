# Interiores conectados · Vértice 0.41

Los planos de los locales a pie de calle, los portales y las viviendas se colocan en la huella de su edificio. El marco de la puerta y el punto de entrada comparten posición. En vista isométrica, cerca de un negocio público se recorta la cubierta para ver el interior. Al entrar se sigue viendo la calle alrededor del plano; en primera y tercera persona se ve a través del umbral. La cámara recuerda la dirección de la marcha al cruzar.

Acércate de frente con WASD o pulsa E sobre la puerta. En los portales, el vestíbulo y cada rellano tienen sus peldaños a distinta altura. La puerta de tu piso conserva la llave y los permisos de visita. Las cinco comisarías tienen recepción en la planta baja y una planta de investigación con archivo, sala de entrevistas y zona de trabajo. Se puede subir por los peldaños o accionar la escalera. Las transiciones a ciberespacio y los módulos internos de recintos especiales conservan su funcionamiento previo.

## Renderizado

- El cliente carga hasta dos vistas previas de los accesos públicos cercanos. La caché expulsa plantas y fachadas alejadas, y las viviendas privadas quedan cerradas al visitante. Los personajes y las interacciones se simulan por sala y el servidor valida cada cruce.
- Los materiales y los muebles de cada sala se agrupan en mallas instanciadas. Al cruzar se reutilizan la geometría exterior, el tráfico, la rejilla y el modelo del jugador. La preparación de cada planta conectada evita construir una segunda copia del escenario isométrico.
- El terreno 3D y el minimapa construyen un ráster de colores por loseta y lo proyectan en bloque. La rejilla compartida entre ambos se crea una sola vez por plano.

## Comprobaciones

Las pruebas recorren Aurora 24H en ambos sentidos con teclas, validan el encaje de los pisos y verifican que se pueda subir con WASD a Investigación sin rebotar al rellano anterior. Las pruebas de vivienda comprueban las llaves y la salida al rellano.
