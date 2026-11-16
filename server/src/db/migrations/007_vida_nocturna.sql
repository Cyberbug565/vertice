ALTER TABLE characters ADD COLUMN substance_use JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE characters ADD COLUMN underworld JSONB NOT NULL DEFAULT '{}'::jsonb;
