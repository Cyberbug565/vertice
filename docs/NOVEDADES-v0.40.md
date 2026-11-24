# Vértice v0.40: arreglos de las cámaras cercanas, distancia de dibujado, tráfico 3D y balas por calibre

## 1. Los PNJ se ven siempre en tercera y primera persona

El cono de visión (solo ves lo que tienes delante) es una regla de equilibrio de la vista cenital: desde arriba no se puede ver más que el resto. En tercera persona daba la sensación de fallo: girabas la cámara hacia atrás y la gente de tu espalda no estaba.

- El cliente le dice al servidor qué cámara usas (también al reconectar).
- Con tercera o primera persona, el servidor envía **todos los PNJ a tu alcance**, aunque estén a tu espalda o detrás de una esquina, y el cliente los dibuja.
- Los **jugadores** siguen con el cono de visión, que es la regla de equilibrio.
- Con la cenital todo sigue como antes.

## 2. Edificios: sin huecos ni bases flotando

- **La causa:** el cielo de las vistas cercanas era una esfera más grande que el límite de dibujado de la cámara. Lo que quedaba más allá no se pintaba: salían manchas negras en el cielo y los edificios lejanos aparecían cortados, como si no hubieran cargado o flotaran sobre el negro.
- **El arreglo:** el cielo y la niebla se ajustan ahora a la distancia de dibujado.
- **Comprobado en el navegador:** se midió la base de los 751 edificios de la ciudad. Todos tocan el suelo (y = 0) y todos tienen su modelo.
- **Por si acaso:** la geometría de los edificios se apoya en el suelo al cargarse, aunque el modelo venga desplazado.

## 3. Distancia de dibujado con neblina de contaminación

Nuevo ajuste en **Ajustes → Distancia de dibujado**, de 40 a 320 m (por defecto 120 m). Vale para las cámaras en tercera y primera persona.

- La cámara no dibuja nada más allá. Con menos distancia, el juego va más fluido.
- Antes del límite, todo se funde en una **boina de contaminación**:
  - de día, una calima parda;
  - de noche, una niebla morada teñida de neón.
- El horizonte del cielo es del mismo color, así que no hay corte.
- Con más distancia, la niebla empieza más lejos y se ve más ciudad.

## 4. Coches 3D en el tráfico, con frecuencia según lo caros que son

El tráfico solo se dibujaba en 2D, y desde las cámaras cercanas no se veía ningún coche. Ahora, en tercera y primera persona, cada coche del tráfico usa su **modelo 3D**, el mismo de los coches que se compran y se conducen: los de la release convertidos. Mantiene su carril, gira en los cruces, frena en los semáforos y se mantiene fuera del cono de visión.

**Frecuencia por rareza:** cada modelo sale en proporción inversa a su precio. Como en la calle real, un utilitario se ve mucho más que un superdeportivo:

| Coche | Precio | Peso en el tráfico |
|---|---:|---:|
| Nezumi 125 (moto) | 3.900 €$ | 6,42 |
| Pulga | 5.200 €$ | 5,74 |
| Gorrión | 8.400 €$ | 4,55 |
| Garza GT | 42.000 €$ | 1,43 |
| Imperial | 198.000 €$ | 0,34 |
| Relámpago X | 420.000 €$ | 0,16 |
| Singularidad | 980.000 €$ | 0,07 |

Los coches que antes no salían nunca (el Espectro, la Sakura, el Duque…) aparecen ahora alguna vez. Los vehículos de servicio (patrullas, rescate, bomberos, reparto) mantienen su propia frecuencia.

## 5. Balas por calibre

Al disparar en tercera o primera persona sale de la boca del arma la **bala de su calibre**, con su trazadora detrás. Además:
- un **fogonazo** en la boca del arma;
- la **vaina** sale despedida, bota en el suelo y se queda unos segundos;
- en el impacto, un chispazo.

Los perdigones de escopeta se abren en cono. Las armas de energía disparan bolas de plasma, rayos de riel o pulsos.

| Calibre | Armas |
|---|---|
| 9 mm | Pistola ligera, compacta e inteligente; subfusil compacto e inteligente; dedo pistola |
| .45 ACP | Pistola silenciada (subsónica) y subfusil |
| .357 Magnum | Revólver pesado |
| 5,56 mm | Rifle de asalto y ametralladora ligera |
| 7,62×39 | Carabina |
| 7,62×51 | Rifle de precisión y ametralladora rotativa |
| .50 BMG | Francotirador inteligente |
| Calibre 12 | Escopetas y cañón de antebrazo (9 perdigones) |

**Los modelos:**
- **Origen:** son los del paquete **FIELDWORK P05 Ammo Bundle** de CuiGames, de la release «balasyarmas». De cada calibre se usa la bala, sin la vaina, y la vaina aparte para los casquillos.
- **Tamaño y trazadora:** como una bala real mide 1–2 cm y no se vería, se dibuja 4 veces más grande, en proporción entre calibres. La trazadora es más larga y gruesa cuanto mayor es el calibre.
- **Licencia:** permite usar los modelos en el juego pero no redistribuir los archivos sueltos. Por eso no van en el repositorio: se generan en cada máquina en `client/public/models/extra/balas/` (ignorada por git).
- **Generación:** `npm run build` los descarga y convierte la primera vez (`tools/balas/descargar.mjs` y `tools/balas/extraer.mjs`). Si no se puede, el juego usa balas modeladas con las medidas reales de cada calibre.
- Más adelante llegarán más armas y munición a esa misma release.

Créditos: *Munición 3D por CuiGames — https://cuigames.itch.io*.

## Pruebas

- **`server/test/v40.test.ts`:**
  - con la cámara en tercera persona, un PNJ a tu espalda se replica y un jugador a tu espalda no;
  - al volver a la cenital, el PNJ desaparece otra vez;
  - los coches caros pesan menos en el tráfico que los baratos;
  - la carpeta de modelos con licencia no va en git.
- **`e2e/v39-camaras.mjs`:** comprueba además que un disparo en tercera persona dibuja la bala 3D y su vaina, y que la distancia de dibujado limita la cámara.

Capturas en `docs/pruebas-040/`.
