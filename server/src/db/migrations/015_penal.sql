ALTER TABLE characters ADD COLUMN bank_balance BIGINT NOT NULL DEFAULT 0 CHECK (bank_balance >= 0);
ALTER TABLE characters ADD COLUMN prison_state JSONB;

CREATE TABLE prison_offenses (
  id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  kind TEXT NOT NULL,
  sentence_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX prison_offenses_character ON prison_offenses (character_id, kind, sentence_id);

CREATE TABLE prison_bank_ledger (
  id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL CHECK(balance_after >= 0),
  reason TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
