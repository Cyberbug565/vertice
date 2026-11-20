-- Las cuentas conservan todas sus vidas y recuerdan la última selección.
DROP INDEX characters_one_active_uq;
CREATE INDEX characters_account_status_idx ON characters (account_id, status, created_at DESC);
ALTER TABLE accounts ADD COLUMN selected_character_id UUID REFERENCES characters(id);
UPDATE accounts a SET selected_character_id = (SELECT c.id FROM characters c WHERE c.account_id=a.id AND c.status <> 'dead' ORDER BY c.created_at DESC, c.id LIMIT 1);
ALTER TABLE characters ADD COLUMN played_ms BIGINT NOT NULL DEFAULT 0 CHECK (played_ms >= 0);
ALTER TABLE characters ADD COLUMN history_since TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE characters ADD COLUMN downed_by JSONB, ADD COLUMN downed_cause TEXT;

-- Hechos confirmados por el servidor; la clave evita contar reintentos dos veces.
CREATE TABLE character_activity (
  event_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  kind TEXT NOT NULL CHECK (kind IN ('kill', 'drug_sale')),
  amount INT NOT NULL DEFAULT 1 CHECK (amount > 0),
  value BIGINT NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX character_activity_char_idx ON character_activity (character_id, at);

-- La adquisición sobrevive a la venta, extracción, traspaso y muerte del portador.
CREATE TABLE character_cyberware (
  character_id UUID NOT NULL REFERENCES characters(id),
  instance_id UUID NOT NULL,
  def_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, instance_id)
);
INSERT INTO character_cyberware (character_id, instance_id, def_id, acquired_at) SELECT character_id, id, def_id, created_at FROM cyberware_instances WHERE character_id IS NOT NULL;
CREATE FUNCTION remember_cyberware_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.character_id IS NOT NULL THEN INSERT INTO character_cyberware (character_id, instance_id, def_id) VALUES (NEW.character_id, NEW.id, NEW.def_id) ON CONFLICT DO NOTHING; END IF; RETURN NEW; END; $$;
CREATE TRIGGER cyberware_owner_history AFTER INSERT OR UPDATE OF character_id ON cyberware_instances FOR EACH ROW EXECUTE FUNCTION remember_cyberware_owner();

-- Ventas antiguas que sí guardaban cantidades verificables.
INSERT INTO character_activity (event_id, character_id, kind, amount, value, detail, at)
 SELECT 'legacy-sale:' || op_id, character_id, 'drug_sale', -(result->'item'->>'delta')::int, (result->>'money')::bigint,
 jsonb_build_object('item', result->'item'->>'id'), created_at FROM ops
 WHERE kind='underworld' AND result->>'reason' LIKE 'Mercado negro · venta%' AND (result->'item'->>'delta')::int < 0;
INSERT INTO character_activity (event_id, character_id, kind, amount, value, detail, at)
 SELECT 'legacy-sale:' || op_id, character_id, 'drug_sale', (result->>'qty')::int, (result->>'total')::bigint,
 jsonb_build_object('item', result->>'itemId'), created_at FROM ops
 WHERE kind='sell' AND result->>'itemId'='neblina' AND (result->>'qty')::int > 0;
