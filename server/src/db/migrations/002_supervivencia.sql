-- v0.2: necesidades, oficios, ciberware, red de mercado, recompensas, incidentes y muerte definitiva.
ALTER TABLE characters
  ADD COLUMN hunger REAL NOT NULL DEFAULT 15,
  ADD COLUMN thirst REAL NOT NULL DEFAULT 15,
  ADD COLUMN fatigue REAL NOT NULL DEFAULT 15,
  ADD COLUMN wanted REAL NOT NULL DEFAULT 0,
  ADD COLUMN profession TEXT NOT NULL DEFAULT 'vagabundo',
  ADD COLUMN profession_rank INT NOT NULL DEFAULT 0,
  ADD COLUMN profession_xp INT NOT NULL DEFAULT 0,
  ADD COLUMN auto_needs BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN active_job TEXT,
  ADD COLUMN downed_left_ms INT,
  ADD COLUMN cause_of_death TEXT,
  ADD COLUMN humanity_max INT;

-- Instancias únicas de ciberware con procedencia e historial (un objeto tiene una sola ubicación válida).
CREATE TABLE cyberware_instances (
  id UUID PRIMARY KEY,
  def_id TEXT NOT NULL,
  character_id UUID REFERENCES characters(id),
  location TEXT NOT NULL CHECK (location IN ('inventory', 'installed', 'shop', 'lost')),
  shop_id TEXT,
  stolen BOOLEAN NOT NULL DEFAULT false,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cyberware_owner_idx ON cyberware_instances (character_id, location);

-- Red de mercado: existencias por tienda y política de precios de cada corporación.
CREATE TABLE market_stock (
  shop_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  stock REAL NOT NULL,
  target REAL NOT NULL,
  sold_total INT NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, item_id)
);
CREATE TABLE corp_policy (
  corp_id TEXT PRIMARY KEY,
  markup REAL NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE price_history (
  id BIGSERIAL PRIMARY KEY,
  corp_id TEXT NOT NULL,
  markup REAL NOT NULL,
  reason TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recompensas sobre jugadores y PNJ. El dinero de particulares queda retenido en el libro económico.
CREATE TABLE bounties (
  id UUID PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('player', 'npc')),
  target_char UUID REFERENCES characters(id),
  target_npc TEXT,
  target_name TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  placed_by UUID REFERENCES characters(id),
  poster TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'claimed', 'cancelled', 'expired')),
  claimed_by UUID REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX bounties_active_idx ON bounties (status);

CREATE TABLE job_log (
  id BIGSERIAL PRIMARY KEY,
  op_id TEXT NOT NULL UNIQUE,
  character_id UUID NOT NULL REFERENCES characters(id),
  job_id TEXT NOT NULL,
  pay BIGINT NOT NULL,
  result JSONB NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_log_char_idx ON job_log (character_id, job_id, at);

CREATE TABLE incidents (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  actor_char UUID,
  victim_char UUID,
  victim_npc TEXT,
  zone TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
