-- Plugin framework: registry, installations, connector accounts, encrypted credentials, sync jobs, import records, provenance.

create table public.plugins (
  id text primary key,                     -- manifest id, e.g. "linkedin-export"
  name text not null,
  version text not null,
  description text not null default '',
  author text not null default '',
  kind text not null check (kind in ('builtin','community')),
  manifest jsonb not null,
  capabilities text[] not null default '{}',
  service_url text,                         -- community connectors run as external HTTPS services
  status text not null default 'active' check (status in ('active','disabled','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plugins_updated before update on public.plugins for each row execute function public.set_updated_at();

create table public.plugin_manifests (
  plugin_id text not null references public.plugins(id) on delete cascade,
  version text not null,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  primary key (plugin_id, version)
);

create table public.plugin_installations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plugin_id text not null references public.plugins(id) on delete cascade,
  enabled boolean not null default true,
  granted_capabilities text[] not null default '{}',
  installed_at timestamptz not null default now(),
  unique (owner_id, plugin_id)
);

create table public.connector_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plugin_id text not null references public.plugins(id) on delete cascade,
  provider text not null,
  external_account_id text,
  display_label text not null default '',
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected','revoked','error')),
  last_sync_at timestamptz,
  last_error text,
  sync_cursor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, plugin_id, provider)
);
create trigger connector_accounts_updated before update on public.connector_accounts for each row execute function public.set_updated_at();

-- Encrypted credentials; service role only, scoped to (owner, connector).
create table private.connector_credentials (
  account_id uuid primary key references public.connector_accounts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext bytea not null,
  nonce bytea not null,
  key_id text not null default 'v1',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table private.oauth_states (
  state text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plugin_id text not null,
  code_verifier text,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plugin_id text not null references public.plugins(id) on delete cascade,
  account_id uuid references public.connector_accounts(id) on delete set null,
  kind text not null check (kind in ('preview','import','sync')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index sync_jobs_owner on public.sync_jobs(owner_id, created_at desc);

-- Normalized imported records (people / edges / claims) with provenance.
create table public.import_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plugin_id text not null references public.plugins(id) on delete cascade,
  account_id uuid references public.connector_accounts(id) on delete cascade,
  sync_job_id uuid references public.sync_jobs(id) on delete set null,
  record_type text not null check (record_type in ('person','edge','claim')),
  provider text not null,
  provider_id text,
  source_url text,
  retrieved_at timestamptz not null default now(),
  relationship_type text check (relationship_type in ('personal','colleague','mutual_connection','follower','following','unknown')),
  relationship_direction text check (relationship_direction in ('outbound','inbound','mutual')),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  payload jsonb not null,
  field_provenance jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected','merged','ambiguous')),
  contact_id uuid,
  created_at timestamptz not null default now(),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete set null (contact_id)
);
create index import_records_owner on public.import_records(owner_id, plugin_id);
create index import_records_contact on public.import_records(contact_id);

alter table public.evidence add constraint evidence_import_record_fk
  foreign key (import_record_id) references public.import_records(id) on delete cascade;
alter table public.contact_edges add constraint contact_edges_import_record_fk
  foreign key (import_record_id) references public.import_records(id) on delete cascade;

create table public.rate_limits (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (owner_id, bucket, window_start)
);

-- RLS
alter table public.plugins enable row level security;
create policy plugins_read on public.plugins for select to authenticated using (status <> 'revoked');
alter table public.plugin_manifests enable row level security;
create policy plugin_manifests_read on public.plugin_manifests for select to authenticated using (true);
alter table public.plugin_installations enable row level security;
create policy plugin_installations_owner on public.plugin_installations for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.connector_accounts enable row level security;
create policy connector_accounts_owner_select on public.connector_accounts for select to authenticated using (owner_id = (select auth.uid()));
create policy connector_accounts_owner_update on public.connector_accounts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.sync_jobs enable row level security;
create policy sync_jobs_owner_select on public.sync_jobs for select to authenticated using (owner_id = (select auth.uid()));
alter table public.import_records enable row level security;
create policy import_records_owner on public.import_records for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.rate_limits enable row level security; -- no policies: service role only

-- Rate limit helper used by edge functions (service role). Returns true when allowed.
create or replace function public.take_rate_limit(p_owner uuid, p_bucket text, p_limit int, p_window_sec int) returns boolean
language plpgsql security definer set search_path = public as $$
declare ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec); c int;
begin
  insert into public.rate_limits (owner_id, bucket, window_start, count) values (p_owner, p_bucket, ws, 1)
    on conflict (owner_id, bucket, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return c <= p_limit;
end $$;
revoke all on function public.take_rate_limit from public, anon, authenticated;

-- Disconnect / revoke a connector: credentials gone, imported-only data removed, dependent caches cleared.
create or replace function public.disconnect_connector(p_account_id uuid, p_delete_data boolean default true) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare me uuid := (select auth.uid()); acc public.connector_accounts; removed_contacts int := 0; removed_records int := 0;
begin
  select * into acc from public.connector_accounts where id = p_account_id and owner_id = me;
  if acc is null then raise exception 'not found' using errcode = 'P0002'; end if;
  delete from private.connector_credentials where account_id = acc.id;
  if p_delete_data then
    -- contacts that exist only because of this account (no other evidence, notes, or manual relationship)
    with sole as (
      select c.id from public.contacts c
      where c.owner_id = me
        and exists (select 1 from public.import_records r where r.contact_id = c.id and r.account_id = acc.id)
        and not exists (select 1 from public.import_records r where r.contact_id = c.id and r.account_id is distinct from acc.id)
        and not exists (select 1 from public.evidence e where e.contact_id = c.id and e.import_record_id is null)
        and not exists (select 1 from public.notes n where n.contact_id = c.id)
        and c.relationship_source = 'plugin'
    ), del as (delete from public.contacts where id in (select id from sole) returning 1)
    select count(*) into removed_contacts from del;
    with del as (delete from public.import_records where account_id = acc.id returning 1) select count(*) into removed_records from del;
    delete from public.ask_queries where owner_id = me;       -- cached results may cite removed records
    update public.project_requests set plan = null where owner_id = me;
  end if;
  update public.connector_accounts set status = 'disconnected', sync_cursor = '{}'::jsonb where id = acc.id;
  return jsonb_build_object('removed_contacts', removed_contacts, 'removed_records', removed_records);
end $$;
revoke all on function public.disconnect_connector from public, anon;
grant execute on function public.disconnect_connector to authenticated;
