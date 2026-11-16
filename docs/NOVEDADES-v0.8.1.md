# Vértice · novedades de la v0.8.1

## Cuenta de administración del dueño: `mataxhustaadmin`

- Se crea sola cada vez que arranca el servidor, en local y en producción, y tiene todo lo de administración:
  - todo desbloqueado la primera vez que entras con un personaje (nivel 30, dinero, habilidades, matrices, Kairós y confianza total con las leyendas);
  - el menú de trucos (`º`, `` ` `` o `F10`).
- **La contraseña no está en el repositorio.** Solo se guarda su *hash* scrypt en `server/src/world/admin.ts`. Para cambiarla, genera un hash nuevo con `hashPassword` y sustituye la constante `OWNER_ADMIN.passHash`.
- Al arrancar se reescriben el hash y el permiso de administración. Así, si alguien hubiera registrado antes ese nombre, no hereda nada.
- Los nombres `mataxhustaadmin` y `admintester` están reservados: no se pueden registrar desde la web, sea cual sea la combinación de mayúsculas.
- La cuenta de pruebas `admintester` funciona igual que en la v0.8, con contraseña por `ADMIN_TESTER_PASSWORD`. Al arrancar también se corrige su contraseña.

## Objetos míticos únicos en todo el servidor

Los míticos (Matriz CARMÍN, Matriz ECO y el Kairós Experimental «Cometa») existen **una sola vez** en la ciudad.

| Situación | Qué pasa |
|---|---|
| Primera persona que completa el encargo final | Se queda el mítico y queda registrada como su portadora (tabla `mythic_owners`). Toda la ciudad oye el rumor. |
| El portador muere a manos de otra persona | El mítico pasa al asesino. Cuenta tanto si lo remata como si se desangra en los 2 minutos siguientes a la herida. Las matrices llegan a la mochila (también CARMÍN, aunque estuviera insertada); el Kairós llega sin instalar. Se anuncia a toda la ciudad. |
| El portador muere de otra forma (PNJ, quirófano, desangrado sin agresor…) | El mítico se pierde con él y la leyenda vuelve a ofrecerlo al siguiente que termine su encargo final. |
| Venderlo, guardarlo en casa o en el maletero | No se puede. Los peristas no lo compran, no aparece en la lista de venta y no se puede perder en un robo mientras duermes. |

### Encargos finales cuando el mítico ya tiene dueño

La leyenda te dice quién lo tiene («solo matándole») y te paga a lo grande, pero nada mítico:

| Leyenda | Mítico | Si ya tiene dueño |
|---|---|---|
| Iris | Matriz CARMÍN | 40 000 €$ + Matriz Centinela (legendaria) + Ampliación del zócalo |
| Sable | Matriz ECO | 35 000 €$ + Matriz Berserker (legendaria) |
| Teo «Cometa» | Kairós Experimental «Cometa» | 35 000 €$ + Kairós de gama 5 (legendario) |

- La confianza, el acceso al Velo y el título de leyenda se ganan igual.
- Las cuentas de administración tienen copias de prueba de los míticos: no se registran, no bloquean a nadie y no se transfieren.

## Técnico

- **Migración `010_miticos_unicos.sql`**: tabla `mythic_owners(item_id, character_id, since)`.
- **Reclamo atómico**: se hace con `INSERT … ON CONFLICT … WHERE el portador está muerto`, así que si dos personas completan a la vez solo una se lo queda.
- **Código**: `server/src/world/mythics.ts`. La transferencia ocurre dentro de la misma transacción que la muerte.
- **Pruebas**: `server/test/v081.test.ts` (5 pruebas): cuenta del dueño, reclamo y recompensa alternativa, bloqueo de venta y maletero, transferencia al matar y pérdida sin asesino.
- **El zip de ChatGPT** («vida nocturna y mercado negro») ya estaba en GitHub desde el commit `8f22518`. Se ha comprobado que su carpeta es idéntica a ese commit.
