-- CODM final format (Master Tournament Doc, Final): 7 groups, three mode days
-- with a fixed map each, 7 lobbies at once, and Domination in place of Control.

-- Domination replaces Control everywhere; existing rows follow the rename.
alter type game_mode rename value 'CTRL' to 'DOM';

-- Group matches carry their lobby and fixed mode/map; the wave is `round`.
alter table matches add column lobby int check (lobby between 1 and 20);
alter table matches add column mode game_mode;
alter table matches add column map text;

alter table match_days add column map text;

-- 7 group winners plus the best runner-up; wins, then head-to-head, then a tiebreaker match.
insert into config (key, value) values
  ('qualifiers_per_group', '1'),
  ('best_runners_up', '1'),
  ('tiebreakers', 'h2h, playoff')
on conflict (key) do update set value = excluded.value;

-- The old five-evening plan is gone.
delete from match_days where day not between '2026-11-23' and '2026-11-25';
insert into match_days (day, mode, map) values
  ('2026-11-23', 'HP', 'Summit'),
  ('2026-11-24', 'DOM', 'Raid'),
  ('2026-11-25', 'SND', 'Firing Range')
on conflict (day) do update set mode = excluded.mode, map = excluded.map;
