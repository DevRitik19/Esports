-- Indexes for the control room's lookups: a match's disputes and subs, the
-- open disputes and unapproved results it counts, and a game's stages.

create index if not exists disputes_match on disputes (match_id);
create index if not exists disputes_open on disputes (created_at desc) where status = 'open';
create index if not exists lobby_disputes_match on lobby_disputes (match_id);
create index if not exists lobby_disputes_open on lobby_disputes (created_at desc) where status = 'open';
create index if not exists sub_requests_match on sub_requests (match_id);
create index if not exists maps_pending on maps (match_id) where status = 'pending';
create index if not exists lobby_stages_game on lobby_stages (game_id, ord);
