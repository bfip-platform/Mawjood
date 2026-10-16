-- 0048 — CFP-01 item 7: the custom-spaces entitlement limit.
--
-- Follows the established per-user limit pattern (custom_tabs_limit 0016,
-- family_slots 0024, secret_vaults_limit 0018): a profiles column with the
-- FREE default, raisable per user by admin-set-limits / subscription_grants
-- (kind='custom_spaces_limit'), and by plan for subscribers — the paid
-- plans' feature lists gain "custom_spaces_limit:7" (Plus = 3 built-in +
-- 7 custom = 10 spaces total; Free = 3 + 2 = 5). Entitlement RULES live in
-- this data (profile default + plan features + grants), not in code: the
-- manage-space edge function resolves the effective limit as the MAX of
-- the applicable sources, so new tiers are configuration, not code.
--
-- Additive and non-destructive. Downgrades never delete spaces: the limit
-- gates CREATION only (enforced in manage-space); existing spaces and
-- their contents are preserved regardless of plan changes.
-- Rollout follows the standing owner-gated path (staging/scratch first).

alter table public.profiles
  add column if not exists custom_spaces_limit integer not null default 2;

-- Paid plans carry 7 extra spaces (idempotent: only appends when absent).
update public.subscription_plans
set features = features || '["custom_spaces_limit:7"]'::jsonb
where id in ('premium_monthly', 'premium_yearly')
  and not (features @> '["custom_spaces_limit:7"]'::jsonb);
