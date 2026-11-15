-- Esquema inicial (hito 1). Todas las operaciones económicas e irreversibles son transaccionales e idempotentes.
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_username_uq ON accounts (lower(username));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Cada fila es una VIDA de personaje. 'dead' es terminal.
CREATE TABLE characters (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'downed', 'dead')),
  origin TEXT NOT NULL,
  role TEXT NOT NULL,
  attributes JSONB NOT NULL,
  skills JSONB NOT NULL,
  appearance JSONB NOT NULL,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  role_rank INT NOT NULL DEFAULT 1,
  money BIGINT NOT NULL DEFAULT 0 CHECK (money >= 0),
  hp INT NOT NULL,
  stamina INT NOT NULL,
  luck INT NOT NULL,
  humanity INT NOT NULL,
  stance TEXT NOT NULL DEFAULT 'avoid',
  zone_id TEXT NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  rules_version TEXT NOT NULL,
  content_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  died_at TIMESTAMPTZ
);
-- Solo una vida activa por cuenta (alfa) y nombres únicos entre vivos.
CREATE UNIQUE INDEX characters_one_active_uq ON characters (account_id) WHERE status <> 'dead';
CREATE UNIQUE INDEX characters_name_alive_uq ON characters (lower(name)) WHERE status <> 'dead';

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  def_id TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  slot TEXT,
  UNIQUE (character_id, def_id)
);

CREATE TABLE reputation (
  character_id UUID NOT NULL REFERENCES characters(id),
  faction_id TEXT NOT NULL,
  value INT NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, faction_id)
);

CREATE TABLE character_flags (
  character_id UUID NOT NULL REFERENCES characters(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (character_id, key)
);

-- Libro de movimientos económicos: cada operación tiene un identificador único (idempotencia).
CREATE TABLE ledger (
  op_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_char_idx ON ledger (character_id, created_at);

-- Registro de operaciones persistentes del cliente (reintentos devuelven el mismo resultado).
CREATE TABLE ops (
  op_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  kind TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tiradas comprometidas: una por personaje y clave de tirada (sin repetir hasta sacar éxito).
CREATE TABLE skill_checks (
  character_id UUID NOT NULL REFERENCES characters(id),
  check_key TEXT NOT NULL,
  op_id TEXT NOT NULL UNIQUE,
  attr TEXT NOT NULL, attr_value INT NOT NULL, skill TEXT NOT NULL, skill_value INT NOT NULL,
  bonus INT NOT NULL, luck_spent INT NOT NULL, roll INT NOT NULL, total INT NOT NULL, dv INT NOT NULL,
  success BOOLEAN NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, check_key)
);

CREATE TABLE contract_instances (
  id UUID PRIMARY KEY,
  contract_id TEXT NOT NULL,
  version INT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'resolved')),
  objectives JSONB NOT NULL DEFAULT '{}'::jsonb,
  contributors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX contract_instances_one_open ON contract_instances (contract_id) WHERE state = 'open';

CREATE TABLE contract_progress (
  character_id UUID NOT NULL REFERENCES characters(id),
  instance_id UUID NOT NULL REFERENCES contract_instances(id),
  contract_id TEXT NOT NULL,
  version INT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'completed', 'abandoned')),
  objectives JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, instance_id)
);
CREATE UNIQUE INDEX contract_progress_one_completed ON contract_progress (character_id, contract_id) WHERE state = 'completed';

-- Decisiones de historia: quién decidió, qué versión de la misión y qué resultado se aplicó.
CREATE TABLE decisions (
  id BIGSERIAL PRIMARY KEY,
  op_id TEXT NOT NULL UNIQUE,
  character_id UUID NOT NULL REFERENCES characters(id),
  dialog_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  contract_id TEXT,
  contract_version INT,
  instance_id UUID,
  result JSONB NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hechos de distrito con caducidad (p. ej. el mercado tiene luz).
CREATE TABLE world_facts (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Traslados entre autoridades de zona (puertas). Idempotentes por identificador.
CREATE TABLE zone_transfers (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  from_zone TEXT NOT NULL,
  to_zone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memorial (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  character_id UUID NOT NULL UNIQUE REFERENCES characters(id),
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
