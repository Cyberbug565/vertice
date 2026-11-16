-- v0.4: habilidades 1–25 con experiencia, perks, ropa equipada, viviendas, alijos y coches.
ALTER TABLE characters
  ADD COLUMN skill_xp JSONB,
  ADD COLUMN perks JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN skill_points_spent INT NOT NULL DEFAULT 0,
  ADD COLUMN wear JSONB,
  ADD COLUMN second_life_at BIGINT NOT NULL DEFAULT 0;
CREATE TABLE houses_owned (
  house_id TEXT PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  price BIGINT NOT NULL,
  permits JSONB NOT NULL DEFAULT '[]',
  bought_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX houses_owned_char_idx ON houses_owned (character_id);
CREATE TABLE house_stash (
  house_id TEXT NOT NULL,
  def_id TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (house_id, def_id)
);
CREATE TABLE cars_owned (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id),
  car_id TEXT NOT NULL,
  price BIGINT NOT NULL,
  bought_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cars_owned_char_idx ON cars_owned (character_id);
