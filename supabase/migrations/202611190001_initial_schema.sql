-- MinaFlow: run once in a new Supabase project's SQL Editor.
-- Supabase Auth owns accounts/passwords; do not create a password table.
-- This migration deliberately fails on existing names rather than altering data.
begin;

create table public.user_settings (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  -- NULL means unknown. These are user-reported values, not predictions.
  usual_cycle_length_days smallint check (usual_cycle_length_days > 0),
  usual_period_length_days smallint check (usual_period_length_days > 0),
  irregular_cycles boolean,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  -- Dates represent the user's calendar days, not UTC timestamps.
  start_date date not null,
  end_date date,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_date_order check (end_date is null or end_date >= start_date),
  constraint periods_unique_start unique (user_id, start_date)
);

-- A missing end_date means the period is ongoing.
create unique index periods_one_ongoing_per_user
  on public.periods (user_id) where end_date is null;

create table public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text check (mood in ('great', 'good', 'okay', 'low', 'tired')),
  flow text check (flow in ('none', 'spotting', 'light', 'medium', 'heavy')),
  -- NULL means not recorded; an empty array means explicitly no symptoms.
  symptoms text[],
  pain_level smallint check (pain_level between 0 and 10),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_check_ins_unique_day unique (user_id, entry_date),
  constraint daily_check_ins_symptoms_allowed check (
    symptoms is null or (
      symptoms <@ array['cramps', 'headache', 'bloating', 'fatigue',
        'back_pain', 'breast_tenderness', 'acne', 'nausea', 'sleep_changes']::text[]
      and array_position(symptoms, null) is null
      and cardinality(symptoms) <= 9
    )
  )
);

-- Unique constraints above also index per-user calendar/history queries.
create function public.minaflow_set_record_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := now();
  else
    NEW.created_at := OLD.created_at;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger user_settings_timestamps before insert or update on public.user_settings
  for each row execute function public.minaflow_set_record_timestamps();
create trigger periods_timestamps before insert or update on public.periods
  for each row execute function public.minaflow_set_record_timestamps();
create trigger daily_check_ins_timestamps before insert or update on public.daily_check_ins
  for each row execute function public.minaflow_set_record_timestamps();

revoke all on function public.minaflow_set_record_timestamps() from public, anon, authenticated;

alter table public.user_settings enable row level security;
alter table public.periods enable row level security;
alter table public.daily_check_ins enable row level security;

-- Give signed-in users CRUD privileges, subject to the ownership policies below.
-- Explicitly remove privileges that could otherwise bypass row-level policies,
-- such as TRUNCATE. Anonymous requests have no table access.
revoke all on table public.user_settings, public.periods, public.daily_check_ins
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.user_settings, public.periods, public.daily_check_ins
  to authenticated;

create policy user_settings_owner on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy periods_owner on public.periods
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy daily_check_ins_owner on public.daily_check_ins
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
