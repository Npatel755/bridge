-- Profiles are self-select only, so the Blocked list could not show names. Expose exactly the
-- blocked people's display names to the blocker (they already saw the name in the match card).
create or replace function public.blocked_people()
returns table (blocked_id uuid, display_name text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select b.blocked_id, coalesce(p.display_name, 'Someone'), b.created_at
  from public.blocks b left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;
revoke all on function public.blocked_people() from public;
grant execute on function public.blocked_people() to authenticated;
