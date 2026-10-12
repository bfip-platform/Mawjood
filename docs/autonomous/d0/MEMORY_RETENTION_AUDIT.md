# D0 — Memory Retention Audit

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Scope:** The product's core memory contract. Every claim verified against code.

## Verdicts on the 7 contract claims

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Saved memories durable for Free+Plus | ❌ **CONTRADICTED** | 90-day decay + 200-cap, no tier check |
| 2 | No age-based auto-deletion | ❌ **CONTRADICTED** | `memory-consolidate/index.ts:128-155` |
| 3 | Downgrade Plus→Free preserves memories | ✅ **CONFIRMED** | No FK path; `plan_id` ON DELETE RESTRICT |
| 4 | Quotas restrict creation, not deletion | ❌ **CONTRADICTED** (memory quota) | `pruneFacts` deletes; creation-time quotas correctly block-only |
| 5 | View/edit/export/delete own memories | ✅ **CONFIRMED** | Caveat: `forget_fact` over-deletes (HIGH) |
| 6 | Chat retention separate from memory retention | ✅ **CONFIRMED** | Distinct tables/paths |
| 7 | 7-day chat sweep never touches memories | ✅ **CONFIRMED** | `index.tsx:1069` deletes only `chat_sessions` |

## The two destructive paths (code-verified)

### Path A — 90-day decay (`memory-consolidate`)
```ts
// supabase/functions/memory-consolidate/index.ts:128-155
// importance-1 facts untouched 90 days → hard delete (limit 50/run)
```
- Gate: `x-cron-secret`. **No in-repo scheduler found** — impact conditional on external cron.
- The project's own `docs/autonomous/MAWJOOD_PRODUCT_RECOVERY_AND_MEMORY_PLAN.md:10` flags the conflict; code still deletes.

### Path B — 200-fact cap (`pruneFacts`)
```ts
// supabase/functions/_shared/memory.ts:221-237
// beyond 200/user → delete weakest (low importance, stalest)
```
- **Runs on the write path** — live even if the cron never fires.
- No Free/Plus distinction.

### Path C — `forget_fact` over-deletion (chat tool)
```ts
// supabase/functions/chat/index.ts:329-343
// deletes every fact whose normalized text contains ANY single query token
```
- One common word can wipe multiple unrelated memories. No trash/undo for `note_id = NULL` facts.

## Cascade map (verified)

| Trigger | Effect | Safe? |
|---|---|---|
| `auth.users` delete | Full CASCADE wipe | ✅ Only via user-requested `account-delete` |
| `spaces` delete | Cascades notes/items | ✅ App guards (custom non-empty-blocked) |
| `space_members` removal | **No cascade** | ✅ Churn-safe (behavioral test 6) |
| Billing tables → user data | **No cascades** | ✅ |
| Trash purge | Only already-trashed expired rows | ✅ |

## Owner decisions required (blocking any durable-memory claim)

1. `memory-consolidate`: disable decay / tier-aware redesign / keep-as-is
2. `pruneFacts`: cap should block new saves or require user choice — never silent-delete
3. `forget_fact`: exact-match or confirm-listing; route through trash
4. Intended Plus memory quota (none exists)
5. `trash_retention_days` 30→0 launch flip

## Verification needed

- Is `memory-consolidate` deployed + scheduled? (dashboard check)
- Behavioral test step 6 over-claims churn safety (tests grants-row churn only, not consolidate decay) — extend in D0.5
