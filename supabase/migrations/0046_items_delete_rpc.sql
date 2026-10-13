-- 0046 — F-LAUNCH-01 Option B: no direct client DELETE on items.
--
-- Migration 0002's items_member_write policy is FOR ALL, so any space
-- owner/member could hard-delete any items row in the space with a direct
-- API call — outside the app's trash-snapshot flows, with no audit and no
-- undo (finding F-LAUNCH-01, docs/autonomous/launch/F_LAUNCH_01_ANALYSIS.md).
--
-- This migration splits the write policy: clients keep SELECT (existing
-- items_member_read), INSERT, and UPDATE under can_access_space, but hold
-- NO delete policy. Permanent deletion routes through one tightly scoped
-- SECURITY DEFINER RPC that re-validates the caller and every row.
-- Server-side deletes (engine purge, account erasure) run as service_role
-- and are unaffected. Idempotent.

drop policy if exists "items_member_write" on public.items;
drop policy if exists "items_member_insert" on public.items;
create policy "items_member_insert" on public.items
  for insert with check (public.can_access_space(space_id));
drop policy if exists "items_member_update" on public.items;
create policy "items_member_update" on public.items
  for update using (public.can_access_space(space_id))
  with check (public.can_access_space(space_id));
-- (No DELETE policy: direct client deletes now affect zero rows.)

-- The single authorized permanent-deletion path for clients.
-- Semantics: all-or-nothing — if ANY existing requested row sits in a
-- space the caller cannot access, the call raises 42501 and deletes
-- nothing. Nonexistent ids are ignored. Returns the number of rows
-- actually deleted.
create or replace function public.hard_delete_items(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  if exists (
    select 1 from public.items i
    where i.id = any (p_ids)
      and not public.can_access_space(i.space_id)
  ) then
    raise exception 'not authorized for all requested items' using errcode = '42501';
  end if;
  delete from public.items i where i.id = any (p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.hard_delete_items(uuid[]) is
  'F-LAUNCH-01: the only client path for permanent items deletion. SECURITY DEFINER; validates auth.uid() + can_access_space for every requested row; all-or-nothing.';

revoke all on function public.hard_delete_items(uuid[]) from public;
revoke all on function public.hard_delete_items(uuid[]) from anon;
grant execute on function public.hard_delete_items(uuid[]) to authenticated;
grant execute on function public.hard_delete_items(uuid[]) to service_role;
