-- v0.5: puestos de trabajo fijos (uno por persona, una persona por puesto) y ajustes del modo automático.
CREATE TABLE posts_held (
  post_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL UNIQUE REFERENCES characters(id),
  hired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE characters ADD COLUMN autopilot JSONB;
