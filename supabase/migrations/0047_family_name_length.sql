-- 0047 — CFP-01 item 3: server-side boundary for the family-name limit (20).
--
-- The rename path writes directly to `spaces` over PostgREST (RLS: owner
-- only), so the database is the server boundary for this field. This
-- trigger enforces the limit ONLY for family spaces and ONLY when a row
-- is written — existing rows are never re-validated or modified, and
-- custom/private/work spaces are untouched (AI-created custom spaces
-- legitimately store "<icon> <name>" up to 60 chars per migration 0034's
-- design; built-in family seed name is 'Family').
--
-- Additive and non-destructive: no column, policy, or data changes.
-- Rollout follows the standing owner-gated path (staging/scratch first).

create or replace function public.enforce_family_name_length()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'family' and char_length(new.name) > 20 then
    raise exception 'family space name exceeds 20 characters'
      using errcode = '22001';
  end if;
  return new;
end;
$$;

drop trigger if exists spaces_family_name_length on public.spaces;
create trigger spaces_family_name_length
  before insert or update of name on public.spaces
  for each row
  execute function public.enforce_family_name_length();
