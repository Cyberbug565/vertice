# Los turnos de Ciudad Vértice

Vértice 0.28 añade 67 personajes con nombre, aspecto, frase personal, ritmo de paso y horario. Su rutina se calcula con el reloj de la ciudad, que comparten todos los jugadores conectados.

| Oficio | Personas | Dónde encontrarlas |
|---|---:|---|
| Seguridad privada | 12 | Los cinco casinos y La Reserva |
| Crupieres y personal de sala | 9 | Mesas de los casinos y salas de Gran Meridiano |
| Dependientes | 16 | Supermercado, farmacias, armería, boutiques, electrónica, cafetería, mercado y locales nocturnos |
| Agentes de la PCV | 10 | Ferro, Cénit, Colinas Doradas, Neón Rojo y El Arrabal |
| Reparto | 7 | Encargos de día y de noche por distintos distritos |
| Limpieza urbana | 3 | Recorridos de calles y zonas de servicio |
| Técnicos de red | 3 | Paneles de fibra y alumbrado |
| Vecinos | 7 | Recados, paseos y paradas con distintos horarios |

Cada persona alterna **trabajo, pausa y descanso**. Los tramos de madrugada pueden cruzar medianoche. Un turno puede definir varias paradas, un punto al que mira el NPC y una pose, como contestar al teléfono, revisar una terminal o sentarse. Las patrullas nuevas usan el sistema de reconocimiento y persecución de la PCV durante su turno. El cazador de recompensas, los vigilantes de edificios y los personajes de misión conservan sus sistemas.

## Probar en partida

- Visita Gran Meridiano a las 10:00 y después a las 22:00 del juego. **Nora Ríos** vigila durante el día y **Jan Lozano** toma el turno de noche.
- Habla con un dependiente en el mostrador para abrir su tienda. Una sesión de compra abierta se invalida cuando esa persona deja el turno. Las terminales y máquinas automáticas siguen disponibles.
- Habla con la gente de la calle. Algunos recuerdan un encuentro reciente. Si dos NPC coinciden de cerca y se ven mutuamente, pueden intercambiar un comentario sobre su trabajo y una respuesta que depende del carácter de su compañero.
- Un guardia advierte si ve a alguien apuntar. Si lo encañonan dentro de su casino, pausa las **nuevas apuestas y desafíos** de esa persona durante nueve segundos desde el último aviso detectado. Una mano que ya tiene dinero comprometido se puede terminar. Un ruido fuerte puede hacer que un guardia investigue, que una persona curiosa se quede escuchando o que otra busque distancia.
- Para forzar una hora inicial de prueba en local, el servidor acepta `CITY_HOUR_MS` y `CITY_HOUR_OFFSET`. La hora de ciudad se calcula con el tiempo del servidor y el avance a partir del desfase.

## Implementación y medida

Los NPC atendidos por el sistema usan las zonas activas y el presupuesto de rutas que ya tenía el servidor. Se escalonan las decisiones, se reutilizan las rutas entre zonas y se buscan compañeros de conversación solo cerca de un observador. En sectores vacíos se reconcilia el turno una vez por segundo sin calcular un camino individual. En traslados hacia un interior observado, el personaje entra por su puerta de llegada. Los actores vistos siguen desplazándose sobre la rejilla. El servidor conserva la autoridad y replica las palabras, poses y posiciones con el protocolo actual.

En la prueba de cuatro cambios de hora sin jugadores se registraron **0 decisiones de IA y 0 peticiones de ruta del reparto nuevo**. La prueba con dos conexiones verifica la apertura del comercio, la invalidación al acabar el turno, los avisos y la pausa de apuestas. Son contadores de simulación de una prueba local y no cifras de FPS ni de capacidad máxima.

[Horarios de muestra](pruebas-028/horarios.png) · [Contadores originales](pruebas-028/simulacion.json) · [Datos editables del reparto](../content/npcs/turnos.json)

## Referencias

Rockstar explicó que diseña actividades ambientales recurrentes para lugares concretos y alterna sucesos discretos con otros reconocibles y menos frecuentes. La decisión en Vértice fue dar a los oficios destinos propios y limitar la repetición de saludos, conversaciones y reacciones. [Entrevista con el equipo de mundo y población de GTA VI en Destructoid](https://www.destructoid.com/reviews/grand-theft-auto-6-review/)

CD Projekt RED describe un sistema de policía que comunica claramente la escalada, persigue según las circunstancias y permite salir de la situación al romper el contacto. En Vértice el aviso de seguridad y la pausa de apuestas son visibles, tienen duración acotada y forman parte de las reglas de los casinos. [Policía de Cyberpunk 2077 en la actualización 2.0](https://www.cyberpunk.net/en/news/48766/whats-coming-in-update-2-0-revamped-police)
