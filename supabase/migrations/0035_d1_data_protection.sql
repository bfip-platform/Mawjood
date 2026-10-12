-- 0035: D1 data protection — recoverable trash for memories + universal
-- 30-day trash floor (owner decision #6).
-- Run in the Supabase SQL editor AFTER 0034. Idempotent: safe to re-run.
--
-- What this does:
-- 1) items.status gains 'trashed' so a memory fact can be moved to trash
--    (status flip + meta.trashed_at) instead of being hard-deleted
--    (forget_fact redesign, spec §5.2). Same drop/add pattern as 0015.
-- 2) profiles.trash_retention_days gets a hard floor of 30 days for EVERY
--    user, every tier. This supersedes the 0017 "paid-plans hook" framing
--    (0 = free/permanent delete): decision #6 makes the 30-day recoverable
--    trash universal, and a plan downgrade must never shorten the window
--    or destroy already-trashed data. Existing rows below 30 are raised;
--    a clamp trigger keeps every future write at or above 30 (admin tools
--    may still grant MORE than 30, never less).

-- 1) items status: add 'trashed'
do $$
begin
  alter table public.items drop constraint if exists items_status_check;
  alter table public.items
    add constraint items_status_check
    check (status in ('open', 'done', 'not_found', 'trashed'));
end $$;

-- 2a) backfill: nobody keeps a sub-30 retention window
update public.profiles
   set trash_retention_days = 30
 where trash_retention_days < 30;

-- 2b) floor enforcement on every future write
create or replace function public.enforce_trash_retention_floor()
returns trigger
language plpgsql
as $$
begin
  if new.trash_retention_days is null or new.trash_retention_days < 30 then
    new.trash_retention_days := 30;
  end if;
  return new;
end $$;

drop trigger if exists profiles_trash_floor on public.profiles;
create trigger profiles_trash_floor
  before insert or update of trash_retention_days on public.profiles
  for each row
  execute function public.enforce_trash_retention_floor();
