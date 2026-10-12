-- ═══════════════════════════════════════════════════════════════════════════
-- 0036_d1_forget_confirmation.sql — D1 delete-safety correction (2026-10-12)
-- AI-initiated forgetting becomes preview-only: a forget preview is a
-- pending_actions row (action_type='forget_memory') carrying a server-issued
-- confirmation code in its payload. The move to trash executes only when the
-- user sends the code as their own chat message and the server validates it
-- (user-bound, 30-min expiry from the table default, single use).
--   · action_type CHECK gains 'forget_memory'
--   · status CHECK gains 'superseded' (a newer preview replaces older ones)
-- Additive + idempotent. No data changes.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  alter table public.pending_actions drop constraint if exists pending_actions_action_type_check;
  alter table public.pending_actions
    add constraint pending_actions_action_type_check
    check (action_type in ('create_tab','delete_tab','create_space','delete_space','forget_memory'));

  alter table public.pending_actions drop constraint if exists pending_actions_status_check;
  alter table public.pending_actions
    add constraint pending_actions_status_check
    check (status in ('pending','approved','executed','cancelled','expired','superseded'));
end $$;
