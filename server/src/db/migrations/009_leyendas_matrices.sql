-- v0.8 · Matrices del zócalo neural, progreso con las leyendas y cuentas de administración (pruebas).
ALTER TABLE characters ADD COLUMN relics JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE characters ADD COLUMN legends JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE accounts ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
