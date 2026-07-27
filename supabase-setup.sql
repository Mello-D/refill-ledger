-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

create table households (
  id text primary key,
  store jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security is enabled with NO policies added, which means the
-- table itself cannot be read or written directly via the public anon key
-- (default deny). Instead, four narrow functions below are the only way in.
-- Each requires the exact household code as a parameter, so there is no way
-- to list or dump every household's data in one request — you can only ever
-- touch the one row whose code you already know.
alter table households enable row level security;

create or replace function household_exists(code text)
returns boolean
language sql security definer as $$
  select exists(select 1 from households where id = code);
$$;

create or replace function get_household(code text)
returns jsonb
language sql security definer as $$
  select store from households where id = code;
$$;

create or replace function create_household(code text)
returns void
language sql security definer as $$
  insert into households(id, store) values (code, '{}'::jsonb)
  on conflict (id) do nothing;
$$;

create or replace function save_household(code text, new_store jsonb)
returns void
language sql security definer as $$
  update households set store = new_store, updated_at = now() where id = code;
$$;

grant execute on function household_exists(text) to anon;
grant execute on function get_household(text) to anon;
grant execute on function create_household(text) to anon;
grant execute on function save_household(text, jsonb) to anon;
