-- What staff can change on a game's public page without a deploy: its key
-- dates (null keeps the published ones from the code) and a notice shown at
-- the top of every tab of that game.

create table game_pages (
  game_id text primary key references games on update cascade on delete cascade,
  key_dates jsonb check (key_dates is null or jsonb_typeof(key_dates) = 'array'),
  notice text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table game_pages enable row level security;
create policy "game_pages public read" on game_pages for select using (true);
create policy "game_pages game staff write" on game_pages for all to authenticated
  using (staff_for(game_id)) with check (staff_for(game_id));
