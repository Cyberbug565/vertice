-- Recupera los locales visitados por personajes de versiones anteriores.
INSERT INTO character_flags(character_id, key, value)
SELECT DISTINCT character_id, 'atlas:p:' || zone_id, 'true'::jsonb
FROM (
  SELECT character_id, from_zone AS zone_id FROM zone_transfers
  UNION SELECT character_id, to_zone FROM zone_transfers
  UNION SELECT id, zone_id FROM characters
) visits WHERE zone_id IS NOT NULL
ON CONFLICT DO NOTHING;
