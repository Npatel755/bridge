-- Re-running the simulator used to delete the caller's own blocks on non-default-blocked personas.
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
    -- Seed the persona's default block once; never undo a block the user committed themselves.
    if r.blocked_by_viewer then
      insert into public.blocks (blocker_id, blocked_id) values (me, pid) on conflict do nothing;
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
