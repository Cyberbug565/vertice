# Misiones de Vértice

La historia principal empieza con el generador del Mercado Lumen y sigue en La lista de Kanal, Nombres prestados y El apagón de los nombres. Reme, Lin y Doc Sato dan las primeras pistas. Si otra persona ya devolvió la luz al mercado, Nadia ofrece investigar Kanal en El Relé.

Las secundarias tienen dos vías de investigación. Puedes resolver el caso con una pista o buscar la otra para ampliar tus opciones. Los encargos breves se cierran en el lugar al realizar la acción que te han pedido. Los sucesos aparecen al recorrer barrios concretos. Al aceptar uno, el objetivo permanece en el diario aunque se cierre la sesión o desaparezca el contacto.

## Añadir un capítulo

Los archivos de `content/missions/` se cargan en orden alfabético. Cada módulo contiene su propio diccionario `locale` y puede declarar `contracts`, `dialogs`, `contacts`, `extend` y `encounters`. Así un capítulo puede añadir una opción a un NPC conocido mediante `extend.<diálogo>.options.<escena>` y añadir escenas mediante `extend.<diálogo>.nodes`. Los identificadores de contratos, objetivos y contactos son únicos.

1. Crea el contrato con categoría, descripción, objetivos y un texto para cada desenlace. Añade `lead` si un contacto puede avisar antes de que comience el encargo.
2. Escribe el diálogo con una entrada de reserva sin condiciones. Usa `if` para mostrar caminos descubiertos y deja una salida por otra vía si una prueba de habilidad puede fallar. Una opción de pista puede escribir `pista:<id-del-contrato>` con valor `true` para guardarla en el diario.
3. Coloca los contactos en casillas transitables. Para un suceso añade el punto donde aparece su contacto y los sitios que se revelan cuando se inicia. El estado del contrato controla cuáles recibe cada jugador.
4. Ejecuta `npm exec -- vitest run server/test/misiones.test.ts`. El arranque valida referencias, posiciones y trayectos. Prueba también una partida nueva y otra que ya haya completado el capítulo anterior.

Las ilustraciones y los efectos de los sitios especiales deben corresponder a una interacción del mundo. El disco de Barranco Seco usa geometría dibujada en el cliente y el trayecto opcional se calcula en el servidor sobre la cuadrícula de la ciudad.
