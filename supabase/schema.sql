-- Attendly attendance tracker: Supabase schema + initial timetable.
-- Multi-user edition: every account gets its own private subjects, timetable and attendance.
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- It is safe to run again on an existing single-user database; existing rows are assigned
-- to the first profile so that no attendance history is lost.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'pending' check (role in ('admin', 'pending')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per-user attendance tables
-- ---------------------------------------------------------------------------

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 6), -- Monday=1 ... Saturday=6
  start_time time not null,
  end_time time not null,
  subject_id uuid references public.subjects(id) on delete set null,
  is_variable boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint timetable_slot_time_valid check (end_time > start_time)
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date date not null,
  slot_id uuid references public.timetable_slots(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  start_time time not null,
  end_time time not null,
  status text not null default 'unmarked' check (status in ('present', 'absent', 'cancelled', 'unmarked')),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint class_session_time_valid check (end_time > start_time)
);

-- Upgrade a database that predates per-user accounts.
alter table public.subjects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.timetable_slots add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.class_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.timetable_slots ts
set user_id = s.user_id
from public.subjects s
where ts.subject_id = s.id and ts.user_id is null;

update public.class_sessions cs
set user_id = ts.user_id
from public.timetable_slots ts
where cs.slot_id = ts.id and cs.user_id is null;

update public.subjects
set user_id = (select id from public.profiles order by created_at asc limit 1)
where user_id is null;

update public.timetable_slots
set user_id = (select id from public.profiles order by created_at asc limit 1)
where user_id is null;

update public.class_sessions
set user_id = (select id from public.profiles order by created_at asc limit 1)
where user_id is null;

alter table public.subjects alter column user_id set default auth.uid();
alter table public.timetable_slots alter column user_id set default auth.uid();
alter table public.class_sessions alter column user_id set default auth.uid();

alter table public.subjects alter column user_id set not null;
alter table public.timetable_slots alter column user_id set not null;
alter table public.class_sessions alter column user_id set not null;

-- Replace the old global unique rules with per-account ones.
alter table public.subjects drop constraint if exists subjects_name_key;
alter table public.timetable_slots drop constraint if exists timetable_slot_day_start_unique;
alter table public.class_sessions drop constraint if exists class_session_slot_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subjects_user_name_key' and conrelid = 'public.subjects'::regclass
  ) then
    alter table public.subjects add constraint subjects_user_name_key unique (user_id, name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'timetable_slot_user_day_start_unique' and conrelid = 'public.timetable_slots'::regclass
  ) then
    alter table public.timetable_slots
      add constraint timetable_slot_user_day_start_unique unique (user_id, day_of_week, start_time);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_session_user_slot_unique' and conrelid = 'public.class_sessions'::regclass
  ) then
    alter table public.class_sessions
      add constraint class_session_user_slot_unique unique (user_id, session_date, slot_id);
  end if;
end $$;

create index if not exists class_sessions_user_date_idx on public.class_sessions(user_id, session_date);
create index if not exists class_sessions_user_subject_date_idx on public.class_sessions(user_id, subject_id, session_date);
create index if not exists timetable_slots_user_day_idx on public.timetable_slots(user_id, day_of_week);

-- ---------------------------------------------------------------------------
-- Seed the default timetable for a single account
-- ---------------------------------------------------------------------------

create or replace function public._seed_attendly_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user is null then
    return;
  end if;

  insert into public.subjects (user_id, name) values
    (target_user, 'Orthopedics'),
    (target_user, 'Clinical Postings'),
    (target_user, 'Gen. Medicine'),
    (target_user, 'OBGY'),
    (target_user, 'Pediatrics'),
    (target_user, 'General Surgery'),
    (target_user, 'Ophthalmology'),
    (target_user, 'Anesthesia'),
    (target_user, 'ENT'),
    (target_user, 'Dermatology'),
    (target_user, 'Psychiatry'),
    (target_user, 'Radiology'),
    (target_user, 'ECCA'),
    (target_user, 'Yoga A / Sports B'),
    (target_user, 'Yoga C / Sports D'),
    (target_user, 'Yoga B / Sports A'),
    (target_user, 'Yoga D / Sports C')
  on conflict (user_id, name) do nothing;

  -- The 12:00-13:00 lunch period is intentionally omitted.
  -- Saturday 09:00-12:00 is variable and is assigned per date in the Attendance screen.
  insert into public.timetable_slots
    (user_id, day_of_week, start_time, end_time, subject_id, is_variable, sort_order)
  select
    target_user,
    v.day_of_week,
    v.start_time,
    v.end_time,
    s.id,
    v.is_variable,
    v.sort_order
  from (values
    (1, time '08:00', time '09:00', 'Orthopedics', false, 1),
    (1, time '09:00', time '12:00', 'Clinical Postings', false, 2),
    (1, time '13:00', time '14:00', 'Gen. Medicine', false, 3),
    (1, time '14:00', time '15:00', 'OBGY', false, 4),
    (1, time '15:00', time '16:00', 'OBGY', false, 5),
    (1, time '16:00', time '17:00', 'Yoga A / Sports B', false, 6),
    (2, time '08:00', time '09:00', 'Pediatrics', false, 7),
    (2, time '09:00', time '12:00', 'Clinical Postings', false, 8),
    (2, time '13:00', time '14:00', 'Gen. Medicine', false, 9),
    (2, time '14:00', time '15:00', 'General Surgery', false, 10),
    (2, time '15:00', time '16:00', 'General Surgery', false, 11),
    (2, time '16:00', time '17:00', 'Yoga C / Sports D', false, 12),
    (3, time '08:00', time '09:00', 'General Surgery', false, 13),
    (3, time '09:00', time '12:00', 'Clinical Postings', false, 14),
    (3, time '13:00', time '14:00', 'Ophthalmology', false, 15),
    (3, time '14:00', time '15:00', 'Gen. Medicine', false, 16),
    (3, time '15:00', time '16:00', 'Gen. Medicine', false, 17),
    (3, time '16:00', time '17:00', 'Yoga B / Sports A', false, 18),
    (4, time '08:00', time '09:00', 'Anesthesia', false, 19),
    (4, time '09:00', time '12:00', 'Clinical Postings', false, 20),
    (4, time '13:00', time '14:00', 'General Surgery', false, 21),
    (4, time '14:00', time '15:00', 'Orthopedics', false, 22),
    (4, time '15:00', time '16:00', 'OBGY', false, 23),
    (4, time '16:00', time '17:00', 'Yoga D / Sports C', false, 24),
    (5, time '08:00', time '09:00', 'OBGY', false, 25),
    (5, time '09:00', time '12:00', 'Clinical Postings', false, 26),
    (5, time '13:00', time '14:00', 'ENT', false, 27),
    (5, time '14:00', time '15:00', 'Dermatology', false, 28),
    (5, time '15:00', time '16:00', 'General Surgery', false, 29),
    (5, time '16:00', time '17:00', 'ECCA', false, 30),
    (6, time '08:00', time '09:00', 'Gen. Medicine', false, 31),
    (6, time '09:00', time '12:00', null, true, 32),
    (6, time '13:00', time '14:00', 'Psychiatry', false, 33),
    (6, time '14:00', time '15:00', 'Pediatrics', false, 34),
    (6, time '15:00', time '16:00', 'Radiology', false, 35),
    (6, time '16:00', time '17:00', 'ECCA', false, 36)
  ) as v(day_of_week, start_time, end_time, subject_name, is_variable, sort_order)
  left join public.subjects s
    on s.name = v.subject_name and s.user_id = target_user
  on conflict (user_id, day_of_week, start_time) do nothing;
end;
$$;

-- Called from the app for accounts that existed before per-user seeding was added.
create or replace function public.seed_attendly_data()
returns void
language sql
security definer
set search_path = public
as $$
  select public._seed_attendly_user(auth.uid());
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'pending')
  on conflict (id) do update set email = excluded.email;

  perform public._seed_attendly_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

revoke all on function public._seed_attendly_user(uuid) from public;
revoke all on function public.seed_attendly_data() from public;
grant execute on function public.seed_attendly_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: each account can only touch its own rows
-- ---------------------------------------------------------------------------

-- A security-definer helper avoids recursive profile RLS checks.
create or replace function public.is_attendly_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.timetable_slots enable row level security;
alter table public.class_sessions enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_attendly_admin());

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
on public.profiles for all
to authenticated
using (public.is_attendly_admin())
with check (public.is_attendly_admin());

drop policy if exists "Admins can manage subjects" on public.subjects;
drop policy if exists "Users can manage own subjects" on public.subjects;
create policy "Users can manage own subjects"
on public.subjects for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Admins can manage timetable" on public.timetable_slots;
drop policy if exists "Users can manage own timetable" on public.timetable_slots;
create policy "Users can manage own timetable"
on public.timetable_slots for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Admins can manage class sessions" on public.class_sessions;
drop policy if exists "Users can manage own class sessions" on public.class_sessions;
create policy "Users can manage own class sessions"
on public.class_sessions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Ensure the signed-in client role can reach the tables; RLS remains the security boundary.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.timetable_slots to authenticated;
grant select, insert, update, delete on public.class_sessions to authenticated;
grant execute on function public.is_attendly_admin() to authenticated;
