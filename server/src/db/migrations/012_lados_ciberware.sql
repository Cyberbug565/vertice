-- Anteriormente los implantes sin lateral se mostraban a la derecha. Conservar esa primera pieza
-- y cualquier lado ya asignado, incluso si la mochila contiene otras copias.
WITH defs(def_id, limb) AS (VALUES
  ('optica-inspeccion','ojo'),
  ('brazo-protesico','brazo'),
  ('brazos-asistencia','brazo'),
  ('pierna-protesica','pierna'),
  ('cuchillas-antebrazo','brazo'),
  ('puno-hidraulico','brazo'),
  ('canon-antebrazo','brazo'),
  ('ojos-tacticos','ojo'),
  ('latigo-monofilamento','brazo'),
  ('garras-retractiles','mano'),
  ('palma-electrica','mano'),
  ('optica-analisis','ojo'),
  ('ojo-lince','ojo'),
  ('ojo-contraste','ojo'),
  ('ojo-cazador-termico','ojo'),
  ('ojo-nocturno','ojo'),
  ('ojo-tasador','ojo'),
  ('ojo-predictivo','ojo'),
  ('ojo-microscopio','ojo'),
  ('ojo-absoluto','ojo'),
  ('ojo-espectral','ojo'),
  ('brazo-refuerzo-hidraulico','brazo'),
  ('brazo-estabilizador','brazo'),
  ('brazo-torreta','brazo'),
  ('brazo-sismico','brazo'),
  ('brazo-desviador','brazo'),
  ('brazo-cuchilla-gemela','brazo'),
  ('brazo-blindaje-placas','brazo'),
  ('brazo-garfio','brazo'),
  ('mano-firme','mano'),
  ('mano-quirurgica','mano'),
  ('mano-carterista','mano'),
  ('mano-palma-iman','mano'),
  ('mano-garra-escalada','mano'),
  ('mano-vampiro','mano'),
  ('mano-guante-choque','mano'),
  ('pierna-muelle','pierna'),
  ('pierna-amortiguador','pierna'),
  ('pierna-salto-reforzado','pierna'),
  ('pierna-esprinter','pierna'),
  ('pierna-silenciosa','pierna'),
  ('pierna-ancla','pierna'),
  ('pierna-salto-felino','pierna'),
  ('pierna-patada-piston','pierna'),
  ('implante-francotirador','brazo')
), installed AS (
  SELECT ci.*, d.limb FROM cyberware_instances ci JOIN defs d USING(def_id)
  WHERE ci.location='installed' AND ci.character_id IS NOT NULL
), pending AS (
  SELECT id, character_id, limb, row_number() OVER (PARTITION BY character_id, limb ORDER BY created_at,id) AS pos
  FROM installed WHERE part IS NULL
), free AS (
  SELECT owner.character_id, owner.limb, s.side,
         row_number() OVER (PARTITION BY owner.character_id, owner.limb ORDER BY s.priority) AS pos
  FROM (SELECT DISTINCT character_id, limb FROM pending) owner CROSS JOIN (VALUES ('der',1),('izq',2)) s(side,priority)
  WHERE NOT EXISTS (SELECT 1 FROM installed i WHERE i.character_id=owner.character_id AND i.limb=owner.limb AND i.part=owner.limb || '_' || s.side)
)
UPDATE cyberware_instances ci SET part=p.limb || '_' || f.side FROM pending p JOIN free f USING(character_id,limb,pos) WHERE ci.id=p.id;
