CREATE TABLE casino_hands (
  character_id UUID PRIMARY KEY REFERENCES characters(id),
  state JSONB NOT NULL
);

CREATE TABLE casino_receipts (
  character_id UUID NOT NULL REFERENCES characters(id),
  venue TEXT NOT NULL,
  game TEXT NOT NULL,
  result JSONB NOT NULL,
  received BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (character_id, venue, game)
);
