-- Admins run every game whatever `games` says (staff_for and the app ignore it
-- for them), so for an admin `games` now means the games whose pages list them
-- as the point of contact. Null still means every game, as before.

create or replace function game_referees(game text)
returns table (name text, role text, email text, phone text, discord text, contacts_visible boolean)
language sql stable security definer set search_path = public as $$
  with viewer as (select (staff_for(game) or leads_in(game)) as ok)
  select coalesce(nullif(s.name, ''), split_part(s.email, '@', 1)),
         s.role::text,
         case when v.ok then s.email end,
         case when v.ok then s.phone end,
         case when v.ok then s.discord end,
         v.ok
  from staff s, viewer v
  where s.listed and (s.games is null or game = any (s.games))
  order by s.role = 'admin', s.games is null, s.name nulls last, s.email;
$$;
