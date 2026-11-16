-- v0.8.1 · Objetos míticos únicos en todo el servidor: una sola persona puede tenerlos a la vez.
-- Una vez conseguido, la única forma de obtenerlo es matar a quien lo lleva (el mítico pasa al asesino).
CREATE TABLE mythic_owners (
  item_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  since TIMESTAMPTZ NOT NULL DEFAULT now()
);
