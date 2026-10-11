# ADR-0001: Deny-by-default RLS for system tables

**Status:** accepted
**Date:** 2026-10-11
**Context:** D-1.1 behavioral security work

## Context

Mawjood's Postgres schema has two kinds of tables:

1. **User-data tables** (`spaces`, `space_members`, `notes`, `items`, `borrows`,
   `storage.objects`, …) — rows belong to users; access is governed by RLS
   policies gated on `auth.uid()` and space membership.
2. **System tables** (`ai_governance`, `ai_evals`, `pending_actions`,
   `broadcasts`, `feature_flags`, `subscription_plans`, `subscription_grants`,
   `user_subscriptions`, `promotions`, `ops_events`, `rate_limits`, …) —
   configuration, billing records, governance state, and telemetry.

The D-1 RLS audit (static) required ≥1 policy per public table. Thirteen
system tables have zero policies, which the audit flagged.

## Decision

System tables keep **RLS enabled with zero policies** — deny-by-default.
All access goes through audited edge functions using `service_role`
(which bypasses RLS by design). The mobile client never queries these
tables directly (verified by grep over `apps/mobile/src`; see D-1.1 WS2).

Adding permissive policies to satisfy a naive "every table needs a policy"
rule would **weaken** security by opening direct client access paths that
do not exist today.

## Consequences

- `supabase/tests/rls-audit.mjs` allowlists these tables (`SYSTEM_TABLES`)
  with this justification inline.
- Any NEW system table must be added to the allowlist with a comment naming
  the edge function(s) that serve it, or given explicit policies if direct
  client access is intended.
- If a future feature needs direct client reads of a system table (e.g.
  public pricing), that is a deliberate policy addition, reviewed as a
  security change — not a drive-by.

## Alternatives considered

- **Add `FOR SELECT USING (true)` policies:** rejected — opens unauthenticated
  read paths; no benefit.
- **Add service_role-only policies:** no-op (service_role bypasses RLS);
  rejected as theater.
- **Move system tables to a non-public schema:** reasonable long-term
  hardening; deferred (requires PostgREST schema config changes).
