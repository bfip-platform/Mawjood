-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_notes_authorship_immutable.sql — Stage 1 review fix F1 (2026-10-12)
-- Independent review of 0038 found the binding forgeable: the 0001 UPDATE
-- policy on notes constrains only space_id (no WITH CHECK on created_by),
-- so a user could UPDATE their planted note's created_by to the victim's
-- uid and satisfy 0038's author binding. Reproduced on scratch: forge
-- stuck, can_read_photo granted the attacker the victim's photo.
--
-- Remediation: make authorship immutable at the row level.
--   · created_by is preserved on EVERY update (insert-time policy already
--     binds it to auth.uid(); nothing legitimate ever changes it — note
--     updates touch transcript/audio/status/space/tab only).
--   · photo_url is preserved when a NON-AUTHOR authenticated user tries
--     to change it: members keep editing shared notes' content, but only
--     the author (or a server-side caller without a user JWT) may point
--     a note at a photo object. This also closes the variant where a
--     member re-points the victim's own family note at an UNSHARED
--     private object of the victim's.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.notes_preserve_authorship()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  if new.photo_url is distinct from old.photo_url
     and auth.uid() is not null
     and auth.uid() <> old.created_by then
    new.photo_url := old.photo_url;
  end if;
  return new;
end $$;

drop trigger if exists notes_preserve_authorship on public.notes;
create trigger notes_preserve_authorship
  before update on public.notes
  for each row execute function public.notes_preserve_authorship();
