-- v0.3: armas equipadas, rama de netrunner, implantes por extremidad, suscripciones de Rescate Ámbar y tipo de derribo.
ALTER TABLE characters
  ADD COLUMN equipped TEXT,
  ADD COLUMN net_xp INT NOT NULL DEFAULT 0,
  ADD COLUMN net_rank INT NOT NULL DEFAULT 0,
  ADD COLUMN downed_lethal BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cyberware_instances ADD COLUMN part TEXT;
ALTER TABLE bounties ADD COLUMN alive_only BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE ambar_subscriptions (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  plan TEXT NOT NULL,
  uses_left INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ambar_char_idx ON ambar_subscriptions (character_id, expires_at);
