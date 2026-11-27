-- Discollection : tables du compte. À coller dans Supabase › SQL Editor › New query, puis Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text,
  discogs_user text,
  discogs_token text,
  gsb_key text,
  audd_token text,
  rangement text not null default 'genre',
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  k text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

-- Droits sur les tables pour les utilisateurs connectés
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.notes to authenticated;

alter table public.profiles enable row level security;
alter table public.notes enable row level security;

-- Chacun ne voit et ne modifie que ses propres données.
drop policy if exists "profil personnel" on public.profiles;
create policy "profil personnel" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "notes personnelles" on public.notes;
create policy "notes personnelles" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
