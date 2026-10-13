# Mawjood — Append-only Execution Ledger

> Do not delete, rewrite or silently squash past entries. Add a correction entry when necessary. Do not log credentials or personal user data.
> Instantiated 2026-10-12 from EXECUTION_LEDGER_TEMPLATE.md per the Master Execution Charter. Historical record through D1 lives in IMPLEMENTATION_LEDGER.md (preserved, not rewritten).

## Entry — 2026-10-12 (Stage 0: notes.deleted_at bugfix)
- Timestamp (UTC): 2026-10-12T21:35Z (approx, at commit time)
- Task ID / stage: POST-D1-BUGFIX-01 / Stage 0 of the D2–D9 program
- Agent / reviewer: Muse (implementer) / independent fresh-context reviewer (verdict recorded at PR)
- Status: IN_PROGRESS → VERIFIED at exact-head CI + review (see PR)
- Objective and acceptance criteria: remove every stale `notes.deleted_at` filter (column dropped by migration 0019) so the affected read paths work on the canonical schema; no behavior change on any DB that completed 0019 (trashed notes are moved to trash_bin, so notes rows are all live). Acceptance: 6/6 sites fixed; regression guard + behavioral tests failing-first then green; scratch before/after repro; independent review; exact-head CI 9/9.
- Starting branch / exact SHA: branch `fix/notes-deleted-at` from main `0a4df1087c178ec0ff05cfc0621dda1676b` (D1 merge)
- Changes and paths:
  - `supabase/functions/_shared/tabs.ts` — removed `.is('deleted_at', null)` from listTabs note counts + getTabNotes (query + count); explanatory comment added.
  - `supabase/functions/chat/index.ts` — removed the same filter from toolSearch's notes leg, the move-correction recent-notes lookup, and the per-request light-context notes query; comment at toolSearch.
  - `supabase/tests/unit.test.mjs` — repo-wide guard (no `.is/.eq('deleted_at'` anywhere under supabase/functions) + behavioral tests for listTabs/getTabNotes against a schema-emulating fake PostgREST that returns 42703 for the stale filter (the exact production failure mode) + secret-tab exclusion preserved.
- Commit(s) / PR / CI links: see PR (Draft) — recorded in RECOVERY_CHECKPOINT.md.
- Commands executed and actual results:
  - Scratch repro (isolated DB, synthetic fixtures): all 4 distinct query shapes fail `42703 column "deleted_at" does not exist` BEFORE; return rows AFTER; fixtures cleaned.
  - Unit suite: 82/82 pass (78 prior + 4 new). Failing-first: with the fix stashed, exactly the 4 new tests fail.
- Security/privacy impact: none negative. Vault boundary preserved (secret tab still excluded everywhere; behavioral test asserts the vault note is never counted). No auth/RLS changes.
- Schema/storage/data impact: none. No migrations. No production contact.
- Evidence: test output + scratch repro transcript summarized in the PR body.
- Failure root cause / remediation: migration 0019 replaced soft-delete (`deleted_at`) with the universal trash (`trash_bin` move) and dropped the column; six read paths kept filtering on it. PostgREST errors per query; supabase-js returns `data: null`, and every caller degrades silently (`?? []`, try/catch) — tab counts zeroed, tab reads empty, search lost its notes leg, the move-correction flow never fired, and the agent's per-turn light context never contained recent notes. B1-fix (D1) repaired the same pattern in memory-consolidate; these six sites were its documented out-of-scope remainder.
- Rollback anchor / recovery instructions: revert the single fix commit; the change is filter-removals only.
- Next task and unresolved blockers: Stage 1 security remainder (cross-user private-photo isolation; route/classify auth-gating). Owner decisions pending unchanged: quota numbers (OD-01/02), production application of migrations 0035–0037, credential revocations.

## Entry — 2026-10-12 (Post-merge launch readiness program)
- Timestamp (UTC): 2026-10-13T03:15Z (approx, at commit time)
- Task ID / stage: POST-MERGE-LAUNCH-READINESS (owner instruction 2026-10-12 23:38 EDT)
- Agent / reviewer: Muse (implementer) / independent fresh-context reviewers per PR (verdicts on each PR)
- Status: IN_PROGRESS — PRs #37–#41 open as Drafts; owner merges.
- Starting point verified: PR #36 merged by the owner; `main` = `0cd7546e7bb847887e0b8db72b57b1bbf60a0779` (merge commit verified via API + tree spot-checks: try_charge_ai_spend ×4 in 0044, IMAGE_TOKEN_BOUND = 50_000).
- Deliverables:
  - PR #37 `fix/low-findings-closure` — F-INT-05 (admin-stats full pagination) + F-INT-07 (retried extract chaining, ops-logged failures). Suite 167/167.
  - PR #38 `launch/age-gate` — 18+ enforcement (Decision #5): migration 0045 `profiles.birth_date`, app declaration/blocked screens, chat AI-surface refusal before the spend pre-check, dual-implementation age math pinned by shared boundary tests. Fix round: e2e auth journey completes the gate (CI fixture users had no DOB — the gate working as designed); bootstrap profile-fetch failure fails closed to the declaration screen (no stuck spinner). Suite 167/167; migrate-check ALL GREEN (19 assertions).
  - PR #39 `launch/offline-wiring` — D3 offline layer wired: AsyncStorage KV on the engine singleton, 4 create sites offline-first, cached items read, flush on sign-in + foreground, drawer sync indicator. Suite 166/166; web export green.
  - PR #40 `launch/a11y-completion` — measured audit of all 156 home-screen pressables: 21 genuinely bare controls labeled (16 icon buttons, 4 photo viewers, bubble long-press hint), handler→label guard. Suite 166/166.
  - PR #41 `launch/readiness-docs` — this entry + runbooks: PROD_ROLLOUT_RUNBOOK (0035→0045, pre-flight incl. the items.updated_at probe, per-migration rollback), SCRATCH_VERIFICATION_BATTERY (results below), LIVE_MODEL_E2E_PROTOCOL (ready; execution blocked on staging deploy + keys — owner action), D9 package amended with the fixed RC SHA + corrected AI-cost section, D8 checklist updated.
- Scratch verification battery (scratch only; production untouched; battery rows cleaned, verified 0): 0045 applies, birth_date is date; items RLS on (policies: SELECT + FOR ALL write from 0002 — durability basis is the AI/engine layer + confirmation rails, NOT a policy-layer delete bar; corrected after independent review, see finding F-LAUNCH-01 in the register); trash→restore round trip byte-identical; purge rule excludes restored rows; items.updated_at live with touch trigger; spend ledger charge/readback 0.100000 exact; pending_actions CHECK includes 'executing'; can_read_photo + claim_invite_use present. Full table: docs/autonomous/launch/SCRATCH_VERIFICATION_BATTERY.md.
- Live-model E2E: NOT executed — no deployment of the RC exists, deployment is owner-gated, provider keys are owner-held, and PR-A requires DOB-seeded fixtures. Protocol prepared (docs/autonomous/launch/LIVE_MODEL_E2E_PROTOCOL.md).
- Security/privacy impact: age gate adds a profile DOB (self-declared, owner-writable only under existing RLS). No production contact. No credentials handled.
- Rollback anchors: each PR reverts independently; main remains at the RC until the owner merges.
- Unresolved blockers (owner): merges #37–#41; production rollout decision (0035→0045) + prod schema/backup answers; Stripe activation; OD-01/02 quota/pricing; $2/day cap confirmation; credential revocations; ChatGPT↔GitHub link for the Codex gate (RC fixed at 0cd7546e, or the post-#41 main HEAD); device a11y walkthrough; staging live-model run.

## 2026-10-13 — F-LAUNCH-01 Option B implemented (owner-approved), Draft PR #43

- Migration **0046**: `items_member_write` (FOR ALL) split into INSERT/UPDATE policies — clients hold **no DELETE policy** on items; permanent deletion routes through `public.hard_delete_items(uuid[])` (SECURITY DEFINER, `search_path=''`, auth.uid() required, per-row can_access_space validation, all-or-nothing 42501, EXECUTE to authenticated + service_role only).
- Client: all **9** items-delete sites in `voice-engine/src/client.ts` (incl. two multi-line sites the original census missed: deleteNote L352, deleteSecretNote L1747) now call the RPC via `hardDeleteItems`/`hardDeleteItemsByNote`; trash flows unchanged (snapshots precede the RPC call — guard-pinned). The `shopping_lists` FOR ALL policy is split in the same migration (its items cascade was the same bypass one level up) with `hard_delete_shopping_list` as its only client delete path (2 client sites).
- Server paths untouched (service role): engine purge + account-delete.
- Tests: unit suite 180/180 incl. a multiline-aware zero-direct-delete census guard; migrate-lib 22 assertions; behavioral proof `hard-delete-check.mjs` (owner/member/outsider/atomicity/concurrency/rollback).
- PR #42 verified merged at `843c8734` before branching. No merge/deploy/production change.
