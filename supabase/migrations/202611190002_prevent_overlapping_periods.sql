-- Run after 202611190001_initial_schema.sql, before using period-write routes.
-- Uses a database constraint so concurrent requests cannot insert overlaps.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;
alter table public.periods
  add constraint periods_no_overlap
  exclude using gist (
    user_id with =,
    daterange(start_date, end_date, '[]') with &&
  );
commit;
