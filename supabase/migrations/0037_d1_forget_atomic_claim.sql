-- ═══════════════════════════════════════════════════════════════════════════
-- 0037_d1_forget_atomic_claim.sql — D1 confirmation hardening (2026-10-12)
-- Single-use under concurrency needs an atomic claim state: a validated
-- forget preview is claimed pending → executing by ONE conditional UPDATE
-- (exactly one concurrent caller wins); execution finalizes it to
-- 'executed', and a failed execution releases it back to 'pending'.
--   · status CHECK gains 'executing'
-- Additive + idempotent. No data changes.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  alter table public.pending_actions drop constraint if exists pending_actions_status_check;
  alter table public.pending_actions
    add constraint pending_actions_status_check
    check (status in ('pending','approved','executed','cancelled','expired','superseded','executing'));
end $$;
