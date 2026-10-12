# D0 → D0.5 Handoff

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Status:** D0 complete. **D0.5 is NOT authorized** — owner approval required.

## Entry criteria for D0.5

- [x] Owner approves D0 findings (approved 2026-10-12 — full 9-decision set)
- [x] Owner decisions on all 9 items (complete — see above)
- [ ] Draft PR #12 merged by owner (PR is ready for merge — see readiness note below)

## Owner decisions — COMPLETE SET APPROVED 2026-10-12

All nine decisions approved by the owner. These authorize **product planning only** — not production migrations, deployment, billing activation, or application-code changes. Do not invent numeric Free/Plus quotas; propose evidence-based options for owner approval during D0.5.

| # | Decision | Status |
|---|---|---|
| 1 | **Durable saved memories:** no automatic deletion by age, plan downgrade, or quota overflow. Redesign decay, pruneFacts, and forget_fact to prevent silent data loss. | ✅ APPROVED 2026-10-12 |
| 2 | **Free/Plus quotas:** design explicit creation and storage limits during D0.5. Existing saved memories must be preserved when limits are exceeded. | ✅ APPROVED 2026-10-12 |
| 3 | **Stripe:** include complete subscription and billing design in the commercial product scope. | ✅ APPROVED 2026-10-12 |
| 4 | **Vault paid gate:** do not activate until billing and entitlement enforcement are ready. | ✅ APPROVED 2026-10-12 |
| 5 | **Launch age eligibility:** 18+ only. Future child accounts require separate approval. | ✅ APPROVED 2026-10-12 (earlier) |
| 6 | **Trash:** retain a 30-day recovery period; do not flip to zero at launch. | ✅ APPROVED 2026-10-12 |
| 7 | **Memory consolidation:** no scheduled destructive decay. Non-destructive maintenance may be designed. | ✅ APPROVED 2026-10-12 |
| 8 | **Database indexes and retention janitors:** approved for design and testing, not production execution. Never delete saved memories through cleanup jobs. | ✅ APPROVED 2026-10-12 |
| 9 | **ai-provider-core:** conditional adoption after compatibility, security, and regression verification. | ✅ APPROVED 2026-10-12 |

### Decision details

**#1 — Durable saved memories (APPROVED):** Saved memories are never automatically deleted — not by age, not by plan downgrade, not by quota overflow. D0.5 must redesign three code paths: (a) the 90-day importance-1 decay in `memory-consolidate`, (b) the 200-fact cap in `pruneFacts` (cap must block new saves or require explicit user choice — never silent-delete), (c) `forget_fact`'s substring over-deletion (exact/mkey-scoped matching or confirm-listing; route through trash/undo).

**#2 — Free/Plus quotas (APPROVED):** D0.5 designs explicit creation and storage limits per tier. Hard rule: exceeding a limit blocks new creation — existing saved memories are never deleted to satisfy a quota. Numeric values are NOT set here; D0.5 proposes evidence-based options (from `ai_events` cost data, storage measurements) for owner approval.

**#3 — Stripe (APPROVED):** Complete subscription and billing design is in scope for the commercial product: Checkout, webhooks, customer portal, plan changes, proration, dunning, invoices. Design in D0.5; no billing activation until owner approves the design and explicitly authorizes go-live.

**#4 — Vault paid gate (APPROVED):** The `LAUNCH:` flip stays off. Vault remains available as designed until billing AND entitlement enforcement are both ready and owner-approved.

**#5 — Age eligibility (APPROVED earlier 2026-10-12):** 18+ only at launch — no child accounts or child-specific features; enforce during registration; reflect in Terms and Privacy Policy; preserve architectural extensibility for future parent-managed child accounts; future minor support needs separate product/legal/security/owner approval.

**#6 — Trash retention (APPROVED):** Keep the 30-day recovery period. Do not flip `trash_retention_days` to zero at launch. Users get a full 30-day undo window on deleted content.

**#7 — Memory consolidation (APPROVED):** No scheduled destructive decay job. The "nightly" consolidation concept is retired as a destructive operation. D0.5 may design non-destructive maintenance (e.g., importance re-scoring, duplicate detection surfacing candidates to the user) — nothing that deletes without explicit user action.

**#8 — Indexes and janitors (APPROVED for design/testing):** The pg_trgm + `items.note_id` + `(space_id, kind)` indexes and the telemetry retention janitor (`rate_limits`, `ai_events`, `ops_events`) are approved for design and testing in D0.5. Not approved for production execution yet. Absolute rule: no cleanup job ever deletes saved memories.

**#9 — ai-provider-core (APPROVED conditional):** Adoption is approved conditional on three gates: (a) compatibility verification (Groq + OpenAI paths, GPT-5-mini quirks covered), (b) security review of the core, (c) regression verification against existing `_shared/ai.ts` behavior. Assessment only in D0.5 planning; integration follows the gates.

## Prioritized work queue

### P0 — data-loss / breach / launch-blocking
1. Resolve memory-consolidate fate (decision #1, #2)
2. Fix photo_url validation + harden `can_read_photo` (H1)
3. Gate `route`/`classify` — JWT + rate limit (M1)
4. Per-user daily AI spend cap (uses existing `ai_events` accounting)
5. Draft Terms + Privacy Policy (decision #5)

### P1 — reliability / scale
6. pg_trgm + `items.note_id` + `(space_id, kind)` indexes (decision #8)
7. Retention janitor for `rate_limits`, `ai_events`, `ops_events`
8. Sentry + uptime checks + alerts
9. Offline read cache + queue-and-sync
10. `SELECT FOR UPDATE` on approval/invite races (M4, M5)
11. Constant-time admin-token compare (M2)
12. Benchmark harness (targets in PERFORMANCE doc)

### P2 — commercial
13. Stripe design (decision #3)
14. Entitlement service (fail-closed)
15. Email-change + deactivation
16. Support path (help/FAQ/contact)
17. SEO / PWA / deep-links
18. a11y pass (labels, roles, keyboard)

### P3 — leverage
19. `ai-provider-core` ADOPT (edge functions)
20. `ops-telemetry-core` ADOPT
21. rate-limit convergence (bidirectional)
22. Upstream Mawjood's rate-limit-store / governance / edge-auth

## Suggested batching

- **Batch 1 (P0):** items 1–5 — single governed batch, independent review, exact-head CI
- **Batch 2 (P1):** items 6–12 — may split into 6–9 (DB/perf) and 10–12 (hardening)
- **Batch 3 (P2):** items 13–18 — commercial; Stripe design may precede implementation
- **Batch 4 (P3):** items 19–22 — needs registry auth prerequisite

## Standing constraints carry forward

- No merges (owner merges) · Draft PRs only · no prod DB changes without approval
- No D0.5 work until this handoff is approved
- Tokens transient-only, never stored
- Each batch: implement → test → independent review → exact-head CI → Draft PR
