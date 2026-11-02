-- Demo data for local development (`make seed`). Idempotent: each sheet is
-- inserted only if its barcode is unknown.
--
--   3558380077619  Azul (found, with structured rules)
--   5901234123457  Les Aventuriers du Rail (found, rules still preparing)
--   4006381333931  a highlighter pen (not_board_game)

DO $$
DECLARE
  game_id BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM catalog.barcodes WHERE barcode = '3558380077619') THEN
    INSERT INTO catalog.games (
      name, localized_names, publisher, year, bgg_id, confidence,
      players_min, players_max, players_recommended, min_age, duration_min, duration_max,
      languages, description, turn_summary, end_timing, end_winner, categories, generated_by
    ) VALUES (
      'Azul', '{"fr": "Azul", "en": "Azul"}', 'Plan B Games', 2017, 230802, 'high',
      2, 4, '{2,3}', 8, 30, 45,
      '{fr,en}',
      '{"fr": "Décorez les murs du palais royal avec les plus beaux azulejos.", "en": "Decorate the walls of the royal palace with the finest azulejos."}',
      '{"fr": "Prenez des tuiles d''une même couleur, posez-les sur une ligne de motif, puis décorez votre mur en fin de manche.", "en": "Take tiles of one color, place them on a pattern line, then tile your wall at the end of the round."}',
      '{"fr": "La partie s''arrête à la fin de la manche où un joueur complète une ligne horizontale.", "en": "The game ends after the round in which a player completes a horizontal row."}',
      '{"fr": "Le joueur avec le plus de points gagne.", "en": "The player with the most points wins."}',
      '{abstract,family}', 'seed'
    ) RETURNING id INTO game_id;

    INSERT INTO catalog.game_rule_items (game_id, section, item_key, sort_order, player_counts, optional, title, text) VALUES
      (game_id, 'setup', 'setup-1', 1, '{2}', NULL, NULL, '{"fr": "Placez 5 fabriques au centre de la table.", "en": "Place 5 factory displays in the middle of the table."}'),
      (game_id, 'setup', 'setup-2', 2, '{3}', NULL, NULL, '{"fr": "Placez 7 fabriques au centre de la table.", "en": "Place 7 factory displays in the middle of the table."}'),
      (game_id, 'setup', 'setup-3', 3, '{4}', NULL, NULL, '{"fr": "Placez 9 fabriques au centre de la table.", "en": "Place 9 factory displays in the middle of the table."}'),
      (game_id, 'setup', 'setup-4', 4, NULL, NULL, NULL, '{"fr": "Remplissez chaque fabrique avec 4 tuiles tirées du sac.", "en": "Fill each factory display with 4 tiles drawn from the bag."}'),
      (game_id, 'turn_step', 'turn-1', 1, NULL, false, '{"fr": "Offre", "en": "Factory offer"}', '{"fr": "Prenez toutes les tuiles d''une couleur dans une fabrique ou au centre.", "en": "Take all tiles of one color from a factory display or from the center."}'),
      (game_id, 'turn_step', 'turn-2', 2, NULL, false, '{"fr": "Placement", "en": "Placement"}', '{"fr": "Posez-les sur une ligne de motif ; l''excédent tombe sur le plancher.", "en": "Place them on one pattern line; the excess falls to the floor line."}'),
      (game_id, 'special_rule', 'rule-1', NULL, NULL, NULL, '{"fr": "Premier joueur", "en": "First player"}', '{"fr": "Le premier à prendre au centre récupère le marqueur premier joueur et perd 1 point.", "en": "The first to take from the center takes the first player marker and loses 1 point."}'),
      (game_id, 'end_trigger', 'end-1', NULL, NULL, NULL, NULL, '{"fr": "Un joueur a complété une ligne horizontale de son mur.", "en": "A player has completed a horizontal row of their wall."}'),
      (game_id, 'scoring', 'scoring-1', 1, NULL, NULL, NULL, '{"fr": "+2 par ligne horizontale complète, +7 par colonne, +10 par couleur complète.", "en": "+2 per complete row, +7 per column, +10 per complete color."}'),
      (game_id, 'tie_breaker', 'tie-1', 1, NULL, NULL, NULL, '{"fr": "Le joueur avec le plus de lignes horizontales complètes l''emporte.", "en": "The player with the most complete horizontal rows wins."}');

    INSERT INTO catalog.game_sources (game_id, title, url) VALUES
      (game_id, 'BoardGameGeek', 'https://boardgamegeek.com/boardgame/230802/azul');

    INSERT INTO catalog.barcodes (barcode, status, game_id, source) VALUES
      ('3558380077619', 'found', game_id, 'manual');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM catalog.barcodes WHERE barcode = '5901234123457') THEN
    INSERT INTO catalog.games (
      name, localized_names, publisher, year, confidence, players_min, players_max, min_age,
      duration_min, duration_max, languages, description, categories, generated_by
    ) VALUES (
      'Ticket to Ride', '{"fr": "Les Aventuriers du Rail", "en": "Ticket to Ride"}', 'Days of Wonder', 2004, 'high',
      2, 5, 8, 30, 60, '{fr,en}',
      '{"fr": "Construisez des lignes de chemin de fer à travers l''Amérique du Nord.", "en": "Build railway routes across North America."}',
      '{family,strategy}', 'seed'
    ) RETURNING id INTO game_id;

    INSERT INTO catalog.barcodes (barcode, status, game_id, source) VALUES
      ('5901234123457', 'found', game_id, 'manual');
  END IF;

  INSERT INTO catalog.barcodes (barcode, status, source, retry_after)
  VALUES ('4006381333931', 'not_board_game', 'manual', now() + interval '30 days')
  ON CONFLICT (barcode) DO NOTHING;
END $$;
