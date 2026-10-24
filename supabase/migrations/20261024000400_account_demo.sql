-- Account export/deletion and demo scaffolding.

-- Full export of everything the user owns (no other users' data, no raw location).
create or replace function public.export_account() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'profile_tags', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profile_tags t where t.owner_id = me),
    'profile_entries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profile_entries t where t.owner_id = me),
    'contacts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.contacts t where t.owner_id = me),
    'notes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.notes t where t.owner_id = me),
    'evidence', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.evidence t where t.owner_id = me),
    'contact_claims', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.contact_claims t where t.owner_id = me),
    'contact_edges', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.contact_edges t where t.owner_id = me),
    'reminders', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.reminders t where t.owner_id = me),
    'interactions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.interactions t where t.owner_id = me),
    'ask_queries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ask_queries t where t.owner_id = me),
    'project_requests', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.project_requests t where t.owner_id = me),
    'outreach_drafts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.outreach_drafts t where t.owner_id = me),
    'discovery_prefs', (select to_jsonb(t) from public.discovery_prefs t where t.owner_id = me),
    'discovery_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.discovery_sessions t where t.owner_id = me),
    'match_events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.match_events t where t.owner_id = me),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.blocks t where t.blocker_id = me),
    'reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.reports t where t.reporter_id = me),
    'plugin_installations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.plugin_installations t where t.owner_id = me),
    'connector_accounts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.connector_accounts t where t.owner_id = me),
    'import_records', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.import_records t where t.owner_id = me)
  );
end $$;
revoke all on function public.export_account from public, anon;
grant execute on function public.export_account to authenticated;

-- Delete the auth user; everything cascades from profiles/auth.users.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public, private, auth as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from private.presence where owner_id = me;
  delete from private.presence_pairs where owner_id = me or other_id = me;
  delete from private.connector_credentials where owner_id = me;
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_account from public, anon;
grant execute on function public.delete_account to authenticated;

-- Remove all demo-flagged data for the caller.
create or replace function public.clear_demo_data() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from public.contacts where owner_id = me and is_demo;
  delete from public.import_records where owner_id = me and payload->>'demo' = 'true';
  delete from public.ask_queries where owner_id = me;
  delete from public.match_events where owner_id = me and simulated;
end $$;
revoke all on function public.clear_demo_data from public, anon;
grant execute on function public.clear_demo_data to authenticated;

-- Demo persona profiles live in a dedicated schema and are copied into the caller's account by load_demo_network().
create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;
create table demo.contacts (like public.contacts including defaults);
do $$ declare c text; begin
  for c in select column_name from information_schema.columns where table_schema='demo' and table_name='contacts' and column_name <> 'name' loop
    execute format('alter table demo.contacts alter column %I drop not null', c);
  end loop; end $$;
alter table demo.contacts add column key text unique not null;
create table demo.claims (contact_key text not null, kind text not null, tag text not null, label text not null, status text not null default 'confirmed',
  source text not null default 'manual', excerpt text not null default '', observed_at timestamptz not null default now(), confidence real not null default 1, url text);
create table demo.edges (from_key text, to_key text not null, kind text not null, status text not null default 'confirmed', source text not null default 'manual', note text not null default '', observed_at timestamptz);
create table demo.notes (contact_key text, body text not null, captured_via text not null default 'typed', created_at timestamptz not null default now());
create table demo.reminders (contact_key text, title text not null, due_in_days int not null);
-- Nearby demo personas: real auth users flagged is_demo with discoverable tags and (simulated) presence near a demo anchor.
create table demo.personas (key text primary key, email text not null, display_name text not null, role_title text, company text, school text, city text, bio text,
  skills text[] not null default '{}', interests text[] not null default '{}', nearby_enabled boolean not null default true,
  offset_east_m real not null default 0, offset_north_m real not null default 0, accuracy_m real not null default 10, radius_m int not null default 100,
  blocked_by_viewer boolean not null default false, note text);

create or replace function public.load_demo_network() returns jsonb
language plpgsql security definer set search_path = public, demo as $$
declare me uuid := (select auth.uid()); n int; r record; cid uuid; eid uuid; from_id uuid; to_id uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform public.clear_demo_data();
  create temp table if not exists _keymap (key text primary key, id uuid) on commit drop;
  delete from _keymap;
  for r in select * from demo.contacts loop
    insert into public.contacts (owner_id, name, first_name, last_name, email, phone, headline, company, school, location, how_met, met_at,
      relationship, relationship_source, relationship_status, last_interaction_at, links, archived, is_demo)
    values (me, r.name, r.first_name, r.last_name, r.email, r.phone, coalesce(r.headline,''), coalesce(r.company,''), coalesce(r.school,''), coalesce(r.location,''), coalesce(r.how_met,''), r.met_at,
      coalesce(r.relationship,'unknown'), coalesce(r.relationship_source,'manual'), coalesce(r.relationship_status,'confirmed'), r.last_interaction_at, coalesce(r.links,'[]'::jsonb), coalesce(r.archived,false), true)
    returning id into cid;
    insert into _keymap values (r.key, cid);
  end loop;
  for r in select * from demo.claims loop
    select id into cid from _keymap where key = r.contact_key;
    insert into public.evidence (owner_id, contact_id, source, excerpt, observed_at, confidence, url)
      values (me, cid, r.source, r.excerpt, r.observed_at, r.confidence, r.url) returning id into eid;
    insert into public.contact_claims (owner_id, contact_id, kind, tag, label, status, evidence_id)
      values (me, cid, r.kind, r.tag, r.label, r.status, eid) on conflict do nothing;
  end loop;
  for r in select * from demo.edges loop
    from_id := null;
    if r.from_key is not null then select id into from_id from _keymap where key = r.from_key; end if;
    select id into to_id from _keymap where key = r.to_key;
    eid := null;
    if r.note <> '' then
      insert into public.evidence (owner_id, contact_id, source, excerpt, observed_at) values (me, to_id, r.source, r.note, coalesce(r.observed_at, now())) returning id into eid;
    end if;
    insert into public.contact_edges (owner_id, from_contact_id, to_contact_id, kind, source, status, evidence_id, note)
      values (me, from_id, to_id, r.kind, r.source, r.status, eid, r.note);
  end loop;
  for r in select * from demo.notes loop
    cid := null; if r.contact_key is not null then select id into cid from _keymap where key = r.contact_key; end if;
    insert into public.notes (owner_id, contact_id, body, captured_via, created_at) values (me, cid, r.body, r.captured_via, r.created_at);
  end loop;
  for r in select * from demo.reminders loop
    cid := null; if r.contact_key is not null then select id into cid from _keymap where key = r.contact_key; end if;
    insert into public.reminders (owner_id, contact_id, title, due_at) values (me, cid, r.title, now() + make_interval(days => r.due_in_days));
  end loop;
  -- link demo contacts that are also demo nearby personas
  update public.contacts c set linked_profile_id = p.id
    from demo.personas dp join auth.users u on u.email = dp.email join public.profiles p on p.id = u.id
    where c.owner_id = me and c.is_demo and lower(c.name) = lower(dp.display_name);
  select count(*) into n from public.contacts where owner_id = me and is_demo;
  return jsonb_build_object('contacts', n);
end $$;
revoke all on function public.load_demo_network from public, anon;
grant execute on function public.load_demo_network to authenticated;

-- Simulator: place demo personas around the caller's simulated position. Labeled simulated; only runs in a 'simulated' session.
create or replace function public.demo_place_personas(lat double precision, lng double precision) returns jsonb
language plpgsql security definer set search_path = public, private, demo as $$
declare me uuid := (select auth.uid()); sess public.discovery_sessions; r record; pid uuid; placed int := 0; psess uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into sess from public.discovery_sessions where owner_id = me and ended_at is null and mode = 'simulated' order by started_at desc limit 1;
  if sess is null then raise exception 'start a simulated session first' using errcode = 'P0001'; end if;
  for r in select dp.*, u.id as uid from demo.personas dp join auth.users u on u.email = dp.email loop
    pid := r.uid;
    -- persona prefs + session
    insert into public.discovery_prefs (owner_id, enabled, radius_m) values (pid, r.nearby_enabled, r.radius_m)
      on conflict (owner_id) do update set enabled = excluded.enabled, radius_m = excluded.radius_m;
    if r.blocked_by_viewer then
      insert into public.blocks (blocker_id, blocked_id) values (me, pid) on conflict do nothing;
    else
      delete from public.blocks where blocker_id = me and blocked_id = pid;
    end if;
    if not r.nearby_enabled then delete from private.presence where owner_id = pid; continue; end if;
    select id into psess from public.discovery_sessions where owner_id = pid and ended_at is null order by started_at desc limit 1;
    if psess is null then
      insert into public.discovery_sessions (owner_id, mode) values (pid, 'simulated') returning id into psess;
    end if;
    insert into private.presence (owner_id, session_id, geog, accuracy_m, sampled_at, expires_at, radius_m, simulated)
      values (pid, psess,
        st_project(st_setsrid(st_makepoint(lng, lat),4326)::geography, sqrt(r.offset_east_m^2 + r.offset_north_m^2), atan2(r.offset_east_m, r.offset_north_m)),
        r.accuracy_m, now(), now() + interval '300 seconds', r.radius_m, true)
      on conflict (owner_id) do update set session_id = excluded.session_id, geog = excluded.geog, accuracy_m = excluded.accuracy_m,
        sampled_at = now(), expires_at = excluded.expires_at, radius_m = excluded.radius_m, simulated = true;
    placed := placed + 1;
  end loop;
  return jsonb_build_object('placed', placed);
end $$;
revoke all on function public.demo_place_personas from public, anon;
grant execute on function public.demo_place_personas to authenticated;

-- Explain, for the simulator UI, why each persona did or did not match (no coordinates; uses the same rules as nearby_publish).
create or replace function public.demo_persona_report() returns jsonb
language sql security definer set search_path = public, private, demo stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', dp.key, 'display_name', dp.display_name, 'note', dp.note, 'nearby_enabled', dp.nearby_enabled,
    'approx_distance_m', round(sqrt(dp.offset_east_m^2 + dp.offset_north_m^2)), 'accuracy_m', dp.accuracy_m, 'radius_m', dp.radius_m,
    'blocked_by_viewer', dp.blocked_by_viewer,
    'matched', exists (select 1 from public.match_events m join auth.users u on u.id = m.other_id where m.owner_id = (select auth.uid()) and u.email = dp.email and m.simulated and m.created_at > now() - interval '1 hour')
  ) order by dp.key), '[]'::jsonb) from demo.personas dp
$$;
revoke all on function public.demo_persona_report from public, anon;
grant execute on function public.demo_persona_report to authenticated;
