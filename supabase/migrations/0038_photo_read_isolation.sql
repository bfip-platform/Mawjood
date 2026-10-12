-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_photo_read_isolation.sql — Stage 1 security fix (2026-10-12)
-- D0 HIGH (reproduced end-to-end on scratch 2026-10-12): can_read_photo's
-- note branch granted a storage read whenever ANY note the caller could
-- access referenced the object path — and notes.photo_url is client-
-- supplied. An attacker planted the victim's private photo URL in a note
-- in the attacker's OWN space and could then read the victim's object
-- (signed URLs), defeating the 0029 owner-folder design.
--
-- Hardening (defense layer 1 of 2; layer 2 validates photo_url at the
-- chat write path):
--   · the sponsoring note may only vouch for photos uploaded by the
--     note's own author: object folder (owner prefix) = notes.created_by
--   · the URL match is an exact suffix comparison — the object name can
--     no longer inject LIKE wildcards (% / _) to broaden the match
-- Intended sharing is preserved: a family member still reads a photo that
-- another member attached to their own note in the shared space (folder =
-- that member = note author, space accessible to the reader).
-- Idempotent (create or replace).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.can_read_photo(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_bucket_id = 'item-photos'
    and (
      (storage.foldername(p_name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.notes n
        where public.can_access_space(n.space_id)
          and (storage.foldername(p_name))[1] = n.created_by::text
          and right(n.photo_url, length('/item-photos/' || p_name)) = '/item-photos/' || p_name
      )
    );
$$;

revoke all on function public.can_read_photo(text, text) from public, anon;
grant execute on function public.can_read_photo(text, text) to authenticated;
