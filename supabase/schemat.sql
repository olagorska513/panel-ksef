-- Panel KSeF - schemat bazy Supabase.
-- Uruchom raz w Supabase: SQL Editor -> New query -> wklej całość -> Run.
-- Skrypt można bezpiecznie uruchomić ponownie.

-- ---------- Komunikaty KSeF (zapisuje je GitHub Actions kluczem tajnym) ----------

create table if not exists public.komunikaty (
  id          uuid primary key,
  data        date not null,
  tytul       text not null,
  adres       text not null,
  tresc       text not null default '',
  testowy     boolean not null default false,
  dla_klienta text,
  pobrano     timestamptz not null default now()
);

create table if not exists public.stan (
  id                   int primary key default 1 check (id = 1),
  ostatnie_sprawdzenie timestamptz
);
insert into public.stan (id) values (1) on conflict do nothing;

-- Terminy przerw wyciągnięte z treści komunikatu: [{ "od": "...", "do": "..." }]
alter table public.komunikaty add column if not exists okresy jsonb not null default '[]';

-- Stan KSeF z Latarni MF (zapisuje go GitHub Actions co 15 minut)
alter table public.stan add column if not exists latarnia_status text;
alter table public.stan add column if not exists latarnia_komunikaty jsonb not null default '[]';
alter table public.stan add column if not exists latarnia_sprawdzenie timestamptz;

-- ---------- Profile użytkowników ----------
-- Każde nowe konto od razu ma dostęp. Administrator może je zablokować (zatwierdzony = false).
-- Pierwsze konto w systemie zostaje automatycznie administratorem.

create table if not exists public.profile (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  zatwierdzony boolean not null default true,
  admin        boolean not null default false,
  utworzono    timestamptz not null default now()
);

create or replace function public.nowy_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pierwszy boolean;
begin
  -- Blokada chroni przed dwoma "pierwszymi" kontami zakładanymi w tej samej chwili
  lock table public.profile in exclusive mode;
  pierwszy := not exists (select 1 from public.profile);
  insert into public.profile (id, email, zatwierdzony, admin)
  values (new.id, new.email, true, pierwszy);
  return new;
end;
$$;

drop trigger if exists po_rejestracji on auth.users;
create trigger po_rejestracji
  after insert on auth.users
  for each row execute function public.nowy_profil();

create or replace function public.ma_dostep()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile where id = auth.uid() and zatwierdzony);
$$;

create or replace function public.czy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile where id = auth.uid() and zatwierdzony and admin);
$$;

-- ---------- Uprawnienia (Row Level Security) ----------

alter table public.komunikaty enable row level security;
alter table public.stan enable row level security;
alter table public.profile enable row level security;

-- Nazwy reguł z wcześniejszej wersji skryptu
drop policy if exists "Odczyt komunikatów dla zatwierdzonych" on public.komunikaty;
drop policy if exists "Odczyt stanu dla zatwierdzonych" on public.stan;
drop policy if exists "Administrator zatwierdza konta" on public.profile;

drop policy if exists "Odczyt komunikatów dla niezablokowanych" on public.komunikaty;
create policy "Odczyt komunikatów dla niezablokowanych" on public.komunikaty
  for select to authenticated using (public.ma_dostep());

drop policy if exists "Odczyt stanu dla niezablokowanych" on public.stan;
create policy "Odczyt stanu dla niezablokowanych" on public.stan
  for select to authenticated using (public.ma_dostep());

drop policy if exists "Własny profil lub administrator" on public.profile;
create policy "Własny profil lub administrator" on public.profile
  for select to authenticated using (id = auth.uid() or public.czy_admin());

drop policy if exists "Administrator blokuje konta" on public.profile;
create policy "Administrator blokuje konta" on public.profile
  for update to authenticated using (public.czy_admin()) with check (public.czy_admin());

-- Użytkownicy strony mogą tylko czytać; administrator może zmieniać wyłącznie kolumnę "zatwierdzony"
revoke all on public.komunikaty, public.stan, public.profile from anon, authenticated;
grant select on public.komunikaty, public.stan, public.profile to authenticated;
grant update (zatwierdzony) on public.profile to authenticated;

revoke execute on function public.nowy_profil() from public, anon, authenticated;
