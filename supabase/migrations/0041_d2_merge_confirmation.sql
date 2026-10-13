-- ═══════════════════════════════════════════════════════════════════════════
-- 0041_d2_merge_confirmation.sql — Charter D2 review fix (2026-10-12)
-- Merging duplicate memories moves the loser to trash, so it follows the
-- SAME owner delete-safety ruling as forgetting (2026-10-12): the model
-- may only create a preview; execution requires the user to send the
-- server-issued code as their own message. The preview is a
-- pending_actions row (action_type='merge_memory') validated, claimed
-- and executed by the same machinery as 'forget_memory' (0036/0037).
--   · action_type CHECK gains 'merge_memory'
-- Additive + idempotent. No data changes.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  alter table public.pending_actions drop constraint if exists pending_actions_action_type_check;
  alter table public.pending_actions
    add constraint pending_actions_action_type_check
    check (action_type in ('create_tab','delete_tab','create_space','delete_space','forget_memory','merge_memory'));
end $$;
