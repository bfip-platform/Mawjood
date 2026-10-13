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
