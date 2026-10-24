-- Bridge core schema: profiles, private network memory, evidence, reminders, searches, drafts.
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pgcrypto;

create schema if not exists private;   -- never exposed through PostgREST
revoke all on schema private from public, anon, authenticated;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.is_owner(owner uuid) returns boolean
language sql stable as $$ select owner = (select auth.uid()) $$;

-- ---------- profiles (one per auth user) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  role_title text not null default '',
  career_stage text not null default '',
  company text not null default '',
  school text not null default '',
  major text not null default '',
  industry text not null default '',
  city text not null default '',
  region text not null default '',
  languages text[] not null default '{}',
  collaboration_prefs text not null default '',
  working_style text not null default '',
  availability text not null default '',
  contact_method text not null default '',
  networking_prefs jsonb not null default '{}'::jsonb,
  portfolio_links jsonb not null default '[]'::jsonb,
  onboarding_step int not null default 0,
  onboarding_complete boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.discovery_prefs (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- Discoverable subset of a profile (what another Bridge user may see in a nearby match)
create table public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('skill','tool','interest','goal','offer')),
  tag text not null,
  label text not null,
  source text not null default 'self_reported',
  status text not null default 'confirmed' check (status in ('confirmed','suggested','rejected')),
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, tag)
);
create index profile_tags_owner on public.profile_tags(owner_id);

create table public.profile_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('experience','education','project','certification')),
  title text not null,
  org text not null default '',
  description text not null default '',
  start_date date, end_date date,
  url text,
  created_at timestamptz not null default now()
);
create index profile_entries_owner on public.profile_entries(owner_id);

-- ---------- private network memory ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  first_name text, last_name text,
  email text, phone text,
  headline text not null default '',
  company text not null default '',
  school text not null default '',
  location text not null default '',
  how_met text not null default '',
  met_at date,
  relationship text not null default 'unknown'
    check (relationship in ('personal','colleague','mutual_connection','follower','following','unknown')),
  relationship_source text not null default 'manual',
  relationship_status text not null default 'confirmed' check (relationship_status in ('confirmed','suggested','rejected')),
  last_interaction_at timestamptz,
  links jsonb not null default '[]'::jsonb,
  linked_profile_id uuid references public.profiles(id) on delete set null, -- if the contact is also a Bridge user
  archived boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index contacts_owner on public.contacts(owner_id) where not archived;
create trigger contacts_updated before update on public.contacts for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  body text not null,
  captured_via text not null default 'typed' check (captured_via in ('typed','voice','import')),
  extraction_status text not null default 'none' check (extraction_status in ('none','pending','suggested','reviewed','failed')),
  extraction jsonb,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade
);
create index notes_owner on public.notes(owner_id, created_at desc);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  source text not null check (source in ('self_reported','manual','note','csv_import','phone_contacts','plugin','extracted','ai_suggested','demo')),
  excerpt text not null default '',
  note_id uuid references public.notes(id) on delete set null,
  import_record_id uuid, -- fk added in plugins migration
  url text,
  observed_at timestamptz not null default now(),
  confidence real not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade
);
create index evidence_contact on public.evidence(contact_id);

create table public.contact_claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  kind text not null check (kind in ('skill','tool','interest','goal','offer','project','org','role')),
  tag text not null,
  label text not null,
  status text not null default 'confirmed' check (status in ('confirmed','suggested','rejected')),
  evidence_id uuid references public.evidence(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  unique (contact_id, kind, tag, evidence_id)
);
create index contact_claims_contact on public.contact_claims(contact_id);
create index contact_claims_owner_tag on public.contact_claims(owner_id, tag);

create table public.contact_edges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  from_contact_id uuid, -- null = the owner
  to_contact_id uuid not null,
  kind text not null check (kind in ('knows','works_with','introduced','follows','followed_by','same_org','same_school')),
  source text not null default 'manual',
  status text not null default 'confirmed' check (status in ('confirmed','suggested','rejected')),
  evidence_id uuid references public.evidence(id) on delete set null,
  import_record_id uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (from_contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  foreign key (to_contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  check (from_contact_id is distinct from to_contact_id)
);
create index contact_edges_owner on public.contact_edges(owner_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid,
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade
);
create index reminders_owner on public.reminders(owner_id, due_at);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  kind text not null default 'outreach' check (kind in ('outreach','meeting','call','message','intro_request','other')),
  summary text not null default '',
  occurred_at timestamptz not null default now(),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade
);
create index interactions_contact on public.interactions(contact_id, occurred_at desc);

-- ---------- searches, recommendations, drafts ----------
create table public.ask_queries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  mode text not null default 'deterministic',
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index ask_queries_owner on public.ask_queries(owner_id, created_at desc);

create table public.project_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  roles jsonb not null default '[]'::jsonb,
  plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger project_requests_updated before update on public.project_requests for each row execute function public.set_updated_at();

create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid,
  via_contact_id uuid,
  subject text not null default '',
  body text not null,
  purpose text not null default '',
  status text not null default 'draft' check (status in ('draft','copied','sent_manually','discarded')),
  created_at timestamptz not null default now(),
  foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  foreign key (via_contact_id, owner_id) references public.contacts(id, owner_id) on delete set null
);

-- Embeddings live in their own table; never exposed to other users (RLS by owner).
create table public.contact_embeddings (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  model text not null,
  content_hash text not null,
  embedding vector(256) not null,
  updated_at timestamptz not null default now()
);
create index contact_embeddings_owner on public.contact_embeddings(owner_id);

create or replace function public.match_contacts(query_embedding vector(256), match_count int default 20)
returns table (contact_id uuid, similarity real)
language sql stable security invoker as $$
  select e.contact_id, (1 - (e.embedding <=> query_embedding))::real
  from public.contact_embeddings e
  where e.owner_id = (select auth.uid())
  order by e.embedding <=> query_embedding
  limit least(match_count, 100)
$$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['profile_tags','profile_entries','contacts','notes','evidence','contact_claims','contact_edges',
    'reminders','interactions','ask_queries','project_requests','outreach_drafts','contact_embeddings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_owner_all on public.%I for all to authenticated using (public.is_owner(owner_id)) with check (public.is_owner(owner_id))', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
