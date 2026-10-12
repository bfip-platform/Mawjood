# D1 — Maintenance Model, Cascade Map & Quota Mechanics (B5: T-D1-2 / T-D1-6 / T-D1-7)

**Date:** 2026-10-12 · **Branch:** `d1/data-protection` · **Authority:** D0.5 spec `MEMORY_AND_AI_PRODUCT_SPEC.md` §§1, 3–6; owner decisions #1, #2, #6, #7.
**Status:** implemented in B1–B4 (this document is the model + verification record). No numbers are finalized here — quota caps remain owner options (OD-01/02).

---

## 1. Non-destructive maintenance model (T-D1-2) — "the gardener"

`memory-consolidate` now performs exactly four steps per active user, in order. **No step hard-deletes a live memory.**

| Step | Behavior | Where |
|---|---|---|
| 1. Daily episode | Unchanged: summarizes today's notes into an `episode` fact via `upsertFacts` | `memory-consolidate` step 1 |
| 2. Duplicate surfacing | Same-normalized-text groups are counted as `duplicate_candidates` for the review UX — rows untouched. **Only** byte-identical retry duplicates (same `mkey`, created ≤24h apart) are auto-**trashed** (recoverable) | step 2 + engine `trashFact` |
| 3. Visibility maintenance | `applyMemoryMaintenance`: importance ≤1 & untouched >90d → `meta.retrieval_boost = 0.5` (ranking penalty, applied in `scoreFact`); untouched >180d & importance ≤2 → `meta.review_candidate = true`. Metadata UPDATEs only, idempotent | engine `planMemoryMaintenance` (pure) + `applyMemoryMaintenance` |
| 4. Trash purge | `purgeExpiredTrashedFacts`: deletes ONLY rows already `status='trashed'` whose `meta.trashed_at` is >30 days old | engine (single sanctioned `items` delete) |

**Report shape** (returned as the function's HTTP response): `{ users, episodes, merged, duplicate_candidates, rescored, review_flagged, trash_purged }`. The old `decayed` / `pruned` counters are retired. *Correction (independent review F2):* unlike spec §3.3/§6.3's "logged to `ops_events`", the current function does **not** persist the report — it is response-only (a pre-existing pattern). Persisting run reports is a small observability follow-up, recorded here rather than silently claimed.

**Memory-trash window (independent review F3):** the purge uses a **fixed 30 days** for memory facts (spec §5.2's window), independent of `profiles.trash_retention_days` grants above 30 that apply to `trash_bin` content. A user granted 90 days keeps *bin* content for 90 but trashed *memories* for 30. Unifying the two windows is an owner decision for a later pass; D1 follows §5.2 literally.

**Known spec deltas (recorded, not silently dropped):**
- Spec §6.3 dry-run mode (`?dry_run=1`) is **not** implemented in D1. The planner (`planMemoryMaintenance`) is pure, so a dry-run endpoint is a small follow-up; the gardener's writes are metadata-only, which is why D1 did not gate on it.
- Spec §3.1 "any user interaction resets `retrieval_boost`" is partially wired: `scoreFact` *applies* the boost; the reset hooks (view/edit/chat reference) belong to the §2 memory-UX surfaces that do not exist yet (no memories screen). Edits via `upsertFacts` refresh `updated_at`, so a re-learned fact naturally exits the stale set on the next pass, but its stored `retrieval_boost` is only rewritten by the planner. Flagged for the D2 memory-UX workstream.
- Spec §3.2's "boost already decayed" precondition for review flagging was implemented as *age + importance* only (flag at >180d, importance ≤2): an importance-2 fact never receives the §3.1 rescore (which targets ≤1), so requiring a decayed boost would have made importance-2 facts unflaggable forever. Flagging is harmless and user-dismissible; the deviation favors the product intent ("very-low-importance untouched memories are review candidates").

## 2. Deletion cascade map (T-D1-6) — verified against migrations 0001–0035

Every path that can remove an `items` row (memory facts live there, `kind='memory'`):

| Trigger | Mechanism | Effect on memory facts | Sanctioned? |
|---|---|---|---|
| User forgets (chat) | `toolForgetFact` → `trashFact` | status → `trashed`, recoverable 30d | ✅ door #1 (spec §1) |
| User-confirmed merge | review UX (future) → trash the loser | recoverable | ✅ door #2 (not yet built; gardener only surfaces) |
| Retry-duplicate auto-trash | gardener step 2 | recoverable | ✅ §6.1 exception |
| Trash window expiry | gardener step 4 (`purgeExpiredTrashedFacts`) | hard delete of already-trashed rows only | ✅ door #4 (decision #6) |
| Account delete | `account-delete` fn: explicit per-space `items` deletes, then spaces/chats/trash/vault/grants/telemetry + storage; `trash_bin.user_id` FK cascades from `auth.users` | full wipe, user-requested | ✅ door #3 |
| Space delete | `items.space_id → spaces ON DELETE CASCADE` (0002) | deleting a space deletes its items | ⚠️ user-initiated structural action; memories live in the **private** space, which the app does not offer to delete outside account-delete. No code path deletes a private space on downgrade/member change. |
| Note delete | `items.note_id → notes ON DELETE SET NULL` (0002) | facts survive their source note (spec §2.4) | ✅ by design |
| Space-member removal | RLS/access change only (D0 audit) | no row deletion | ✅ churn-safe |
| Plan downgrade / expiry | profiles limit columns only; **no FK from billing tables to `items`** (verified: no migration references) | nothing deleted; trash window floored at 30d by migration 0035 | ✅ decision #1.3 |
| Chat transcript sweep (7d) | touches `chat_sessions`/`chat_messages` only | never touches `items` | ✅ spec §10 |

**Episode-merge delete (old `memory-consolidate:122`) — classified:** it hard-deleted the older of two facts sharing normalized text, *regardless of `mkey`*. Two distinct facts phrased identically (e.g. the same line learned under two keys) would silently lose one row and its metadata. Classification: **unsafe dedupe — removed in B1** and replaced by candidate surfacing + the narrow retry-duplicate trash above.

**Static enforcement:** a unit-test guard asserts (a) zero `.from('items').delete()` in `memory-consolidate` and `chat`, (b) exactly one in the engine, located inside `purgeExpiredTrashedFacts`.

## 3. Quota mechanics (T-D1-7) — mechanics implemented, numbers NOT chosen

Implemented (B2): `quotaGate(count, cap)` (pure), `countFactsForQuota` (read-only), `oldestWeakestForReview` (read-only cleanup candidates), `upsertFacts(..., { cap })` → at cap, **new** saves return `blocked` and nothing is deleted; same-`mkey` updates are never blocked. `remember_fact` surfaces `blocked_by_quota`; `memory-learn` logs the blocked count in `ops_events`. **No caller passes a cap today** — production behavior is unchanged until the owner sets one.

Owner options (from spec §4.4, unchanged — decision #2 requires evidence before choosing):

| Option | Free | Plus | Basis |
|---|---|---|---|
| A — generous free | 500 facts | 5,000 facts | ~2y heavy use; Plus effectively unlimited |
| B — tight free | 200 facts | 2,000 facts | stronger paid differentiation |
| C — usage-based | 100 new/mo, store uncapped | 1,000 new/mo, store uncapped | gates the real cost driver (creation calls) |

Evidence still needed before the owner picks: facts-per-user distribution + per-fact extraction cost from `ai_events`. D1 did not measure production (no prod data access was used or needed). Grandfathering rule (spec §4.4): users already over a future cap keep everything; only new saves block.

## 4. Deployment preconditions (for the owner's later, separate approval)

1. Migration `0035_d1_data_protection.sql` must be applied to a database **before** the B1–B4 functions are deployed to it (the `'trashed'` status and the floor trigger are prerequisites). D1 itself deploys nothing.
2. CI `migrate-check` proves 0001–0035 apply cleanly (twice) on a fresh database, with the two new 0035 assertions green.
3. Scratch verification (synthetic data, ref `caimavjwasxiegjhxdsr` only) follows `D1_SCRATCH_ENVIRONMENT_PLAN.md`.

---

## Addendum (2026-10-12) — owner delete-safety correction: confirmed forget

Owner review of PR #15 found that a unique match (or a model-supplied
`fact_id`) trashed a memory on the model's assertion alone. Corrected so
that **AI-initiated forgetting is preview-only**:

- `forget_fact` (query or `fact_id`) only SELECTS a memory and creates a
  pending preview — a `pending_actions` row (`action_type='forget_memory'`,
  migration 0036) carrying a server-issued 6-digit confirmation code bound
  to (user, fact set, 30-minute expiry, single use).
- The move to trash executes ONLY in a deterministic, pre-model fast path:
  the user sends «نفّذ <code>» as their own message; the server looks the
  code up (`payload->>confirm_code`), validates user/status/expiry/code
  (`validateForgetConfirmation`), and only then runs
  `executeConfirmedForget`. A model-generated `fact_id`, a model-claimed
  confirmation, and forged/expired/replayed codes all trash nothing
  (negative-tested). New previews supersede older ones; at most one live
  code per user.
- The governed-actions rail was audited for cross-talk: `capFor` now fails
  closed on unknown action types, `toolExecuteAction` no longer defaults
  to `executeDeleteSpace`, and the preview payload deliberately names its
  space field `memory_space_id` (never `space_id`).
- **Delete Forever stays separate and user-only (spec §1 door #3):** it is
  the explicit in-app action on Trash rows (`deleteTrashRowForever` /
  `emptyTrash` in the mobile client). No edge function references it; the
  AI surface can neither invoke it nor reach `trash_bin`. The gardener's
  expired-trash purge (door #4) is unchanged.
- Deployment precondition grows: migrations **0035 + 0036** must be
  applied to a database before these functions deploy to it.

## Addendum 2 (2026-10-12) — confirmation hardening: atomic claim + fail-closed expiry

Owner re-review required two guarantees, both initially ABSENT and now
implemented + behaviorally proven on the scratch database:

- **Single-use under concurrency:** validation is now followed by an
  atomic claim — one conditional `UPDATE … SET status='executing' WHERE
  status='pending'` (migration 0037 adds the `executing` status). Exactly
  one concurrent caller wins; execution requires the claimed state and
  finalizes `executing → executed`; a failed execution releases the claim
  back to `pending` (a stuck `executing` row fails closed). Proven on the
  real scratch DB: 4 parallel claims → exactly 1 winner.
- **Fail-closed expiry:** the schema default was verified on the real DB —
  `expires_at = now() + '00:30:00'::interval`, NOT NULL, inserts land
  exactly 30.0 minutes out. The code no longer trusts comparisons that
  fail open on garbage: `Date.parse` NaN (missing/empty/malformed expiry)
  is treated as expired in both validation and execution (negative-tested
  for undefined/null/''/'not-a-date'/invalid ISO).
- Deployment precondition is now migrations **0035 + 0036 + 0037**.
