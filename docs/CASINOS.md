# Casinos de Ciudad Vértice

Localiza el rótulo exterior del casino, entra y acerca al personaje a una mesa o terminal. Haz clic sobre ella o usa la tecla **E**. El mapa sigue el descubrimiento habitual del juego.

| Casino | Distrito | Apuesta mínima | Apuesta máxima |
|---|---|---:|---:|
| Última Ficha | Ferro | 10 €$ | 180 €$ |
| La Bobina | Muelles Viejos | 15 €$ | 240 €$ |
| Cero Rojo | El Arrabal | 20 €$ | 320 €$ |
| Hipódromo Prisma | Polígono Abandonado | 200 €$ | 5.000 €$ |
| Gran Meridiano | Descampado Norte | 5.000 €$ | 100.000 €$ |

Gran Meridiano exige **50.000 €$ de saldo** al entrar desde la calle. Quien tenga una mano allí puede regresar a terminarla aunque su saldo haya bajado. En el vestíbulo están los accesos al Salón Órbita, la Galería de Nácar, el Jardín de Premios y la Tribuna Cenital. El pasillo de servicio lleva a **La Reserva** y solo se muestra con **150.000 €$** y **12 puntos de reputación de calle**. El mapa público omite ese pasillo.

[Planos de los cinco locales](pruebas-027/casinos.jpg) · [Plano de Gran Meridiano y sus salas](pruebas-027/gran-meridiano.jpg)

## Juegos

- **Ruleta europea.** Número, rojo, negro, par o impar. La rueda gira hasta el número que devuelve el servidor. El cero es verde.
- **Póker de cinco cartas.** Jotas o mejor contra tabla de premios. Marca las cartas que quieres conservar y realiza un descarte.
- **Blackjack.** Pide carta o plántate. La banca se planta en 17. Un blackjack natural paga 3 a 2.
- **Rasca y gana.** Arrastra sobre la lámina o pulsa **Descubrir boleto**. Tres símbolos iguales pagan de ×2 a ×30.
- **Deportes y carreras.** Se juegan en Hipódromo Prisma y la Tribuna Cenital. La cartelera cambia cada 90 segundos. Los equipos, caballos y resultados son ficticios. Cada ticket reproduce su propio evento simulado con marcador o pista animada.
- **Ruleta rusa VIP.** Dos jugadores junto a la mesa. Uno invita y el otro confirma expresamente la muerte permanente. Una resolución cinematográfica determina al ganador. El juego transfiere los eurodólares, viviendas con alijo y vehículos con maletero. El perdedor queda en el memorial, que conserva su estado antes del reparto. El motor de muerte sigue gestionando la sucesión de implantes míticos.

Todas las cifras son eurodólares del personaje y los rangos y cuotas se validan en el servidor. Los resultados usan aleatoriedad del servidor. Las apuestas y premios se escriben en el libro de movimientos dentro de la transacción de la jugada. El identificador de operación hace idempotente un reintento. Las manos de cartas y los resultados pendientes de recibir se conservan al desconectarse. El ajuste de movimiento reducido también se aplica a las mesas.

## Pruebas

`npx vitest run server/test/casino.test.ts` comprueba las cinco ubicaciones, los accesos, los siete juegos, la duplicación de solicitudes, las cartas guardadas y la sucesión VIP entre dos clientes WebSocket. `npm run local` sirve los mismos recursos de casino que se usan detrás del túnel de publicación.

Referencias de interacción y presentación consultadas. [Ruleta](https://wizardofodds.com/play/roulette/) · [Blackjack](https://wizardofodds.com/play/blackjack/) · [Póker de cinco cartas](https://wizardofodds.com/play/video-poker/jacks-or-better/) · [Revelado del rasca](https://vaelolab.com/lab/scratch-card-reveal) · [Cartelera virtual de carreras](https://tableroom.itch.io/buchmacher).
