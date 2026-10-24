-- Nearby discovery: prefs, sessions, restricted presence, match events, blocks/reports, simulator.
-- Raw coordinates live only in private.presence (service role + security-definer RPCs). Clients get coarse bands.

create table public.discovery_prefs (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  radius_m int not null default 100 check (radius_m in (50,100,250)),
  relevance_threshold real not null default 0.3 check (relevance_threshold between 0 and 1),
  audience text not null default 'both' check (audience in ('both','existing','new')),
  haptics boolean not null default true,
  visual_only boolean not null default false,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  session_minutes int check (session_minutes is null or session_minutes between 15 and 480),
  per_person_cooldown_sec int not null default 3600,
  burst_max int not null default 3,
  burst_window_sec int not null default 600,
  updated_at timestamptz not null default now()
);
create trigger discovery_prefs_updated before update on public.discovery_prefs for each row execute function public.set_updated_at();

create table public.discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('foreground','background','simulated')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,                 -- null = until manually stopped
  ended_at timestamptz,
  end_reason text
);
create index discovery_sessions_active on public.discovery_sessions(owner_id) where ended_at is null;

create table private.presence (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  session_id uuid not null references public.discovery_sessions(id) on delete cascade,
  geog geography(point, 4326) not null,
  accuracy_m real not null,
  sampled_at timestamptz not null,
  expires_at timestamptz not null,
  radius_m int not null,
  simulated boolean not null default false,
  publish_count int not null default 0,
  last_publish_at timestamptz not null default now()
);
create index presence_geog on private.presence using gist(geog);

-- consecutive-proximity streaks, per direction
create table private.presence_pairs (
  owner_id uuid not null,
  other_id uuid not null,
  streak int not null default 0,
  last_seen_at timestamptz not null default now(),
  primary key (owner_id, other_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.discovery_sessions(id) on delete set null,
  band text not null check (band in ('very_close','close','nearby')),
  shared_skills text[] not null default '{}',
  shared_interests text[] not null default '{}',
  relevance real not null,
  is_existing_contact boolean not null default false,
  simulated boolean not null default false,
  status text not null default 'new' check (status in ('new','seen','dismissed','muted','intro_requested','blocked','reported')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index match_events_owner on public.match_events(owner_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create table public.mutes (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  until timestamptz,
  primary key (owner_id, other_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  match_event_id uuid references public.match_events(id) on delete set null,
  reason text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  match_event_id uuid references public.match_events(id) on delete set null,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create table public.notification_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  expo_push_token text,
  last_alert_at timestamptz,
  alerts_last_window int not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.discovery_prefs enable row level security;
create policy discovery_prefs_owner on public.discovery_prefs for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.discovery_sessions enable row level security;
create policy discovery_sessions_owner on public.discovery_sessions for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.match_events enable row level security;
create policy match_events_owner_select on public.match_events for select to authenticated using (owner_id = (select auth.uid()));
create policy match_events_owner_update on public.match_events for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.blocks enable row level security;
create policy blocks_owner on public.blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
alter table public.mutes enable row level security;
create policy mutes_owner on public.mutes for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.reports enable row level security;
create policy reports_owner on public.reports for all to authenticated using (reporter_id = (select auth.uid())) with check (reporter_id = (select auth.uid()));
alter table public.intro_requests enable row level security;
create policy intro_requests_parties_select on public.intro_requests for select to authenticated using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
create or replace function public.pair_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;
revoke all on function public.pair_blocked from public, anon;
grant execute on function public.pair_blocked to authenticated;
create policy intro_requests_from_insert on public.intro_requests for insert to authenticated with check (from_id = (select auth.uid()) and not public.pair_blocked(from_id, to_id));
create policy intro_requests_parties_update on public.intro_requests for update to authenticated using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
alter table public.notification_state enable row level security;
create policy notification_state_owner on public.notification_state for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- now the auth trigger (profiles + prefs tables exist)
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- helpers ----------
create or replace function public.distance_band(d double precision) returns text
language sql immutable as $$ select case when d <= 25 then 'very_close' when d <= 75 then 'close' else 'nearby' end $$;

create or replace function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function private.purge_expired_presence() returns void
language sql as $$
  delete from private.presence where expires_at < now();
  update public.discovery_sessions set ended_at = now(), end_reason = 'expired'
    where ended_at is null and expires_at is not null and expires_at < now();
$$;

-- Publish a location sample. Returns {status, expires_at, matches:[match_event ids]}.
-- Enforces: enabled prefs, active session, freshness <=120s, accuracy <=50m, rate limit, both-opt-in, overlap, block, radius=min, 2 stable samples, cooldowns.
create or replace function public.nearby_publish(lat double precision, lng double precision, accuracy_m real, sampled_at timestamptz, p_simulated boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare
  me uuid := (select auth.uid());
  prefs public.discovery_prefs;
  sess public.discovery_sessions;
  pres private.presence;
  cand record;
  new_events uuid[] := '{}';
  my_skills text[]; my_interests text[];
  shared_s text[]; shared_i text[];
  rel real; streak int; recent_alerts int; last_alert timestamptz; existing boolean; other_prefs public.discovery_prefs;
  my_count int; their_count int; ev_id uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform private.purge_expired_presence();
  select * into prefs from public.discovery_prefs where owner_id = me;
  if prefs is null or not prefs.enabled then return jsonb_build_object('status','disabled'); end if;
  select * into sess from public.discovery_sessions where owner_id = me and ended_at is null order by started_at desc limit 1;
  if sess is null then return jsonb_build_object('status','no_session'); end if;
  if p_simulated and sess.mode <> 'simulated' then return jsonb_build_object('status','simulation_not_allowed'); end if;
  if not p_simulated and sess.mode = 'simulated' then return jsonb_build_object('status','session_is_simulated'); end if;
  if sampled_at < now() - interval '120 seconds' or sampled_at > now() + interval '10 seconds' then
    return jsonb_build_object('status','stale_sample'); end if;
  if accuracy_m is null or accuracy_m > 50 then return jsonb_build_object('status','low_accuracy'); end if;
  if lat is null or lng is null or abs(lat) > 90 or abs(lng) > 180 then raise exception 'invalid coordinates' using errcode = '22023'; end if;
  select * into pres from private.presence where owner_id = me;
  if pres is not null and pres.last_publish_at > now() - interval '5 seconds' then
    return jsonb_build_object('status','rate_limited','expires_at',pres.expires_at); end if;

  insert into private.presence (owner_id, session_id, geog, accuracy_m, sampled_at, expires_at, radius_m, simulated, publish_count, last_publish_at)
  values (me, sess.id, st_setsrid(st_makepoint(lng, lat),4326)::geography, accuracy_m, sampled_at, now() + interval '300 seconds', prefs.radius_m, p_simulated, 1, now())
  on conflict (owner_id) do update set session_id = excluded.session_id, geog = excluded.geog, accuracy_m = excluded.accuracy_m,
    sampled_at = excluded.sampled_at, expires_at = excluded.expires_at, radius_m = excluded.radius_m, simulated = excluded.simulated,
    publish_count = private.presence.publish_count + 1, last_publish_at = now();

  select coalesce(array_agg(tag) filter (where kind in ('skill','tool')), '{}'), coalesce(array_agg(tag) filter (where kind = 'interest'), '{}')
    into my_skills, my_interests
    from public.profile_tags where owner_id = me and discoverable and status = 'confirmed';
  my_count := cardinality(my_skills) + cardinality(my_interests);
  if cardinality(my_skills) = 0 or cardinality(my_interests) = 0 then
    return jsonb_build_object('status','ok','note','no_discoverable_tags','expires_at', now() + interval '300 seconds','matches',to_jsonb(new_events)); end if;

  for cand in
    select p.owner_id as other_id, p.radius_m as other_radius,
           st_distance(p.geog, st_setsrid(st_makepoint(lng, lat),4326)::geography) as dist,
           p.accuracy_m as other_acc, p.sampled_at as other_sampled
    from private.presence p
    join public.profiles pr on pr.id = p.owner_id
    where p.owner_id <> me and p.expires_at > now()
      and p.sampled_at > now() - interval '120 seconds' and p.accuracy_m <= 50
      and p.simulated = p_simulated
      and (not p_simulated or pr.is_demo)        -- simulated sessions only match demo personas, never other real users
      and st_dwithin(p.geog, st_setsrid(st_makepoint(lng, lat),4326)::geography, 250)
  loop
    if cand.dist > least(prefs.radius_m, cand.other_radius) then
      delete from private.presence_pairs where owner_id = me and other_id = cand.other_id; continue; end if;
    if private.is_blocked(me, cand.other_id) then continue; end if;
    select * into other_prefs from public.discovery_prefs where owner_id = cand.other_id;
    if other_prefs is null or not other_prefs.enabled then continue; end if;

    select coalesce(array_agg(distinct t.tag) filter (where t.kind in ('skill','tool')), '{}'),
           coalesce(array_agg(distinct t.tag) filter (where t.kind = 'interest'), '{}')
      into shared_s, shared_i
      from public.profile_tags t
      where t.owner_id = cand.other_id and t.discoverable and t.status = 'confirmed'
        and ((t.kind in ('skill','tool') and t.tag = any(my_skills)) or (t.kind = 'interest' and t.tag = any(my_interests)));
    if cardinality(shared_s) = 0 or cardinality(shared_i) = 0 then continue; end if;
    select count(*) into their_count from public.profile_tags where owner_id = cand.other_id and discoverable and status = 'confirmed';
    rel := (cardinality(shared_s) + cardinality(shared_i))::real / greatest(1, least(my_count, their_count));
    rel := least(1, rel + 0.15 * (cardinality(shared_s) + cardinality(shared_i) - 2));
    if rel < prefs.relevance_threshold then continue; end if;

    existing := exists (select 1 from public.contacts c where c.owner_id = me and c.linked_profile_id = cand.other_id and not c.archived);
    if prefs.audience = 'existing' and not existing then continue; end if;
    if prefs.audience = 'new' and existing then continue; end if;
    if exists (select 1 from public.mutes m where m.owner_id = me and m.other_id = cand.other_id and (m.until is null or m.until > now())) then continue; end if;

    insert into private.presence_pairs (owner_id, other_id, streak, last_seen_at) values (me, cand.other_id, 1, now())
      on conflict (owner_id, other_id) do update set streak = case when private.presence_pairs.last_seen_at > now() - interval '180 seconds' then private.presence_pairs.streak + 1 else 1 end, last_seen_at = now()
      returning presence_pairs.streak into streak;
    if streak < 2 then continue; end if;

    select max(created_at) into last_alert from public.match_events where owner_id = me and other_id = cand.other_id;
    if last_alert is not null and last_alert > now() - make_interval(secs => prefs.per_person_cooldown_sec) then continue; end if;
    select count(*) into recent_alerts from public.match_events where owner_id = me and created_at > now() - make_interval(secs => prefs.burst_window_sec);
    if recent_alerts >= prefs.burst_max then continue; end if;

    insert into public.match_events (owner_id, other_id, session_id, band, shared_skills, shared_interests, relevance, is_existing_contact, simulated)
      values (me, cand.other_id, sess.id, public.distance_band(cand.dist), shared_s, shared_i, rel, existing, p_simulated)
      returning id into ev_id;
    new_events := new_events || ev_id;
  end loop;

  return jsonb_build_object('status','ok','expires_at', now() + interval '300 seconds','matches', to_jsonb(new_events));
end $$;
revoke all on function public.nearby_publish from public, anon;
grant execute on function public.nearby_publish to authenticated;

-- Start a session (ends any existing one). Returns the session row.
create or replace function public.nearby_start(mode text) returns public.discovery_sessions
language plpgsql security definer set search_path = public, private as $$
declare me uuid := (select auth.uid()); prefs public.discovery_prefs; s public.discovery_sessions;
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if mode not in ('foreground','background','simulated') then raise exception 'bad mode' using errcode = '22023'; end if;
  select * into prefs from public.discovery_prefs where owner_id = me;
  if prefs is null or not prefs.enabled then raise exception 'nearby is disabled' using errcode = 'P0001'; end if;
  update public.discovery_sessions set ended_at = now(), end_reason = 'restarted' where owner_id = me and ended_at is null;
  delete from private.presence where owner_id = me;
  insert into public.discovery_sessions (owner_id, mode, expires_at)
    values (me, mode, case when prefs.session_minutes is null then null else now() + make_interval(mins => prefs.session_minutes) end)
    returning * into s;
  return s;
end $$;
revoke all on function public.nearby_start from public, anon;
grant execute on function public.nearby_start to authenticated;

-- Stop: removes presence immediately.
create or replace function public.nearby_stop(reason text default 'user') returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from private.presence where owner_id = me;
  delete from private.presence_pairs where owner_id = me or other_id = me;
  update public.discovery_sessions set ended_at = now(), end_reason = left(coalesce(reason,'user'), 40) where owner_id = me and ended_at is null;
end $$;
revoke all on function public.nearby_stop from public, anon;
grant execute on function public.nearby_stop to authenticated;

-- Disabling prefs removes presence too.
create or replace function private.on_prefs_disabled() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if old.enabled and not new.enabled then
    delete from private.presence where owner_id = new.owner_id;
    delete from private.presence_pairs where owner_id = new.owner_id or other_id = new.owner_id;
    update public.discovery_sessions set ended_at = now(), end_reason = 'disabled' where owner_id = new.owner_id and ended_at is null;
  end if;
  return new;
end $$;
create trigger discovery_prefs_disable after update on public.discovery_prefs for each row execute function private.on_prefs_disabled();

-- Blocking removes presence pairing and hides existing matches on both sides.
create or replace function private.on_block() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  delete from private.presence_pairs where (owner_id = new.blocker_id and other_id = new.blocked_id) or (owner_id = new.blocked_id and other_id = new.blocker_id);
  update public.match_events set status = 'blocked' where (owner_id = new.blocker_id and other_id = new.blocked_id);
  update public.intro_requests set status = 'declined', responded_at = now() where status = 'pending' and ((from_id = new.blocked_id and to_id = new.blocker_id) or (from_id = new.blocker_id and to_id = new.blocked_id));
  return new;
end $$;
create trigger blocks_after_insert after insert on public.blocks for each row execute function private.on_block();

-- Coarse payload for a match the caller owns: discoverable fields only.
create or replace function public.match_payload(event_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare me uuid := (select auth.uid()); ev public.match_events; pr public.profiles; tags jsonb;
begin
  select * into ev from public.match_events where id = event_id and owner_id = me;
  if ev is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if private.is_blocked(me, ev.other_id) then raise exception 'blocked' using errcode = '42501'; end if;
  select * into pr from public.profiles where id = ev.other_id;
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'tag',tag,'label',label)), '[]'::jsonb) into tags
    from public.profile_tags where owner_id = ev.other_id and discoverable and status = 'confirmed';
  return jsonb_build_object(
    'event_id', ev.id, 'other_id', ev.other_id, 'band', ev.band, 'relevance', ev.relevance,
    'shared_skills', to_jsonb(ev.shared_skills), 'shared_interests', to_jsonb(ev.shared_interests),
    'is_existing_contact', ev.is_existing_contact, 'simulated', ev.simulated, 'status', ev.status, 'created_at', ev.created_at,
    'profile', jsonb_build_object('display_name', pr.display_name, 'avatar_url', pr.avatar_url, 'role_title', pr.role_title,
      'company', pr.company, 'school', pr.school, 'city', pr.city, 'bio', pr.bio, 'is_demo', pr.is_demo, 'tags', tags));
end $$;
revoke all on function public.match_payload from public, anon;
grant execute on function public.match_payload to authenticated;

-- My current nearby status (no coordinates returned).
create or replace function public.nearby_status() returns jsonb
language sql security definer set search_path = public, private stable as $$
  select jsonb_build_object(
    'session', (select to_jsonb(s) from public.discovery_sessions s where s.owner_id = (select auth.uid()) and s.ended_at is null order by started_at desc limit 1),
    'presence', (select jsonb_build_object('expires_at', p.expires_at, 'sampled_at', p.sampled_at, 'accuracy_m', p.accuracy_m, 'simulated', p.simulated, 'publish_count', p.publish_count)
                 from private.presence p where p.owner_id = (select auth.uid())))
$$;
revoke all on function public.nearby_status from public, anon;
grant execute on function public.nearby_status to authenticated;
