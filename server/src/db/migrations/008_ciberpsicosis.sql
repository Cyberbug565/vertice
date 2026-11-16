-- v0.7 · Ciberpsicosis: nivel, tiempo pasado del límite y bajada temporal de la tolerancia al cromo.
ALTER TABLE characters ADD COLUMN psyche JSONB NOT NULL DEFAULT '{}'::jsonb;
