# D0 → D0.5 Handoff

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Status:** D0 complete. **D0.5 is NOT authorized** — owner approval required.

## Entry criteria for D0.5

- [ ] Owner approves D0 findings (this document set)
- [ ] Owner decisions on the 9 items below
- [ ] Draft PR merged by owner (or D0.5 branches from this HEAD)

## Owner decisions required

| # | Decision | Blocks |
|---|---|---|
| 1 | `memory-consolidate`: disable decay / tier-aware redesign / keep-as-is | Any durable-memory claim |
| 2 | Intended Plus memory quota (none exists) | Entitlement design |
| 3 | Stripe: still postponed or in scope? | All billing work |
| 4 | Vault paid-gate LAUNCH flip | Vault launch |
| 5 | Age-gate / children's-data posture | Legal docs |
| 6 | `trash_retention_days` 30→0 launch flip | Trash UX |
| 7 | Schedule `memory-consolidate` or remove "nightly" claim | Ops honesty |
| 8 | Approve index additions + retention janitor (repo-modifying) | Perf work |
| 9 | ai-provider-core GPT-5/Groq quirk coverage | ADOPT scope |

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
