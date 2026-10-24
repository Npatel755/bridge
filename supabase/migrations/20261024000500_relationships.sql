-- Widen the relationship vocabulary used by the app (manual cards, notes, imports). Followers/following stay distinct.
alter table public.contacts drop constraint if exists contacts_relationship_check;
alter table public.contacts add constraint contacts_relationship_check check (relationship in (
  'personal','colleague','mutual_connection','follower','following','unknown',
  'friend','former_colleague','classmate','mentor','mentee','family','acquaintance','client','collaborator','met_once'));
-- Sessions always expire; a null session length made the client treat a fresh session as expired.
update public.discovery_prefs set session_minutes = 60 where session_minutes is null;
alter table public.discovery_prefs alter column session_minutes set default 60;
