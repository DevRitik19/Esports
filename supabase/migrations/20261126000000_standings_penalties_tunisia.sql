-- Auditable manual points adjustments; results remain the base calculation.
create table team_point_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games on update cascade on delete cascade,
  team_id text not null references teams on update cascade on delete cascade,
  points_delta integer not null check (points_delta between -100 and 100 and points_delta <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index team_point_adjustments_game_team on team_point_adjustments (game_id, team_id);
alter table team_point_adjustments enable row level security;
create policy "team point adjustments public read" on team_point_adjustments for select using (true);
create policy "team point adjustments admin write" on team_point_adjustments for all to authenticated
  using (is_admin()) with check (is_admin());

-- S&D is now Tunisia instead of Firing Range for the CODM group-stage schedule.
insert into map_pool (mode, map) values ('SND', 'Tunisia') on conflict (mode, map) do nothing;
delete from map_pool where mode = 'SND' and map = 'Firing Range';
update match_days set map = 'Tunisia' where mode = 'SND';
update matches set map = 'Tunisia', updated_at = now()
  where game_id = 'codm' and mode = 'SND' and stage = 'group';
