-- Attendly attendance tracker: Supabase schema + initial timetable.
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'pending' check (role in ('admin', 'pending')),
  created_at timestamptz not null default now()
);

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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 1 and 6), -- Monday=1 ... Saturday=6
  start_time time not null,
  end_time time not null,
  subject_id uuid references public.subjects(id) on delete set null,
  is_variable boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint timetable_slot_time_valid check (end_time > start_time),
  constraint timetable_slot_day_start_unique unique (day_of_week, start_time)
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  slot_id uuid references public.timetable_slots(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  start_time time not null,
  end_time time not null,
  status text not null default 'unmarked' check (status in ('present', 'absent', 'cancelled', 'unmarked')),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint class_session_time_valid check (end_time > start_time),
  constraint class_session_slot_unique unique (session_date, slot_id)
);

create index if not exists class_sessions_date_idx on public.class_sessions(session_date);
create index if not exists class_sessions_subject_date_idx on public.class_sessions(subject_id, session_date);

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
create policy "Admins can manage subjects"
on public.subjects for all
to authenticated
using (public.is_attendly_admin())
with check (public.is_attendly_admin());

drop policy if exists "Admins can manage timetable" on public.timetable_slots;
create policy "Admins can manage timetable"
on public.timetable_slots for all
to authenticated
using (public.is_attendly_admin())
with check (public.is_attendly_admin());

drop policy if exists "Admins can manage class sessions" on public.class_sessions;
create policy "Admins can manage class sessions"
on public.class_sessions for all
to authenticated
using (public.is_attendly_admin())
with check (public.is_attendly_admin());

-- Ensure the signed-in client role can reach the tables; RLS remains the security boundary.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.timetable_slots to authenticated;
grant select, insert, update, delete on public.class_sessions to authenticated;
grant execute on function public.is_attendly_admin() to authenticated;

-- Initial subjects from the supplied timetable.
insert into public.subjects (name) values
  ('Orthopedics'),
  ('Clinical Postings'),
  ('Gen. Medicine'),
  ('OBGY'),
  ('Pediatrics'),
  ('General Surgery'),
  ('Ophthalmology'),
  ('Anesthesia'),
  ('ENT'),
  ('Dermatology'),
  ('Psychiatry'),
  ('Radiology'),
  ('ECCA'),
  ('Yoga A / Sports B'),
  ('Yoga C / Sports D'),
  ('Yoga B / Sports A'),
  ('Yoga D / Sports C')
on conflict (name) do nothing;

-- Initial weekly timetable. The 12:00–13:00 lunch period is intentionally omitted.
-- Saturday 09:00–12:00 is variable and is assigned per date in the Attendance screen.
insert into public.timetable_slots
  (day_of_week, start_time, end_time, subject_id, is_variable, sort_order)
select
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
left join public.subjects s on s.name = v.subject_name
on conflict (day_of_week, start_time) do nothing;
