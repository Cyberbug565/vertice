-- v0.6: estado del cuerpo (heridas y miembros perdidos), historia del personaje, identificación por cámaras,
-- coches aparcados con maletero y antecedentes públicos.
ALTER TABLE characters ADD COLUMN body JSONB, ADD COLUMN bio JSONB, ADD COLUMN identified JSONB;
ALTER TABLE cars_owned ADD COLUMN zone TEXT, ADD COLUMN pos_x REAL, ADD COLUMN pos_y REAL;
CREATE TABLE car_trunk (
  car_id UUID NOT NULL REFERENCES cars_owned(id) ON DELETE CASCADE,
  def_id TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (car_id, def_id)
);
CREATE TABLE public_records (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  crime TEXT NOT NULL,
  district TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX public_records_char_idx ON public_records (character_id);
