# D1 — Pre-Execution Readiness Report & Execution Plan

**Date:** 2026-10-12 · **Prepared by:** agent (read-only verification; no code changed, nothing provisioned, nothing deployed)
**Authority:** `docs/autonomous/d05/D05_TO_D1_HANDOFF.md` + repository engineering governance
**Verdict: NO-GO (conditional)** — all engineering prerequisites verified; **3 owner actions outstanding** (§6). D1 must not start until they close and the owner says "begin D1".

---

## 1. Verified state

| Check | Result | Evidence |
|---|---|---|
| Main HEAD | ✅ `cc7397ffad9bf8753676ae7cfc942ab7a0d16107` | Matches owner-stated merge SHA; PR #14 "docs: preserve Mawjood chat-first UX architecture" |
| Main CI | ✅ 9/9 PASS | Run `38283087091` (push, success): ci, standards, rls-audit, e2e-auth, secret-scan, e2e-smoke, provenance, auth-gates, vuln-scan |
| D0.5 incorporated | ✅ | PR #13 merged (main `9e2e407`); 23 docs under `docs/autonomous/d05/` on main |
| UX Decision #12 incorporated | ✅ | PR #14 merged; `UX_ARCHITECTURE_CORRECTION.md` + OD-41 on main |
| D1 designs #1/#2/#6/#7 | ✅ reviewed | `MEMORY_AND_AI_PRODUCT_SPEC.md` §§3–5 (decay→visibility+review queue; pruneFacts→block-on-overflow; forget_fact→scoped match + trash + confirmation) with acceptance criteria + test plans; trash design in §5 + migrations 0017/0019 |
| Test harness | ✅ ready | CI: unit (`supabase/tests/unit.test.mjs`), migrate-check, rls-audit, authz-behavioral, auth-gates, Playwright e2e vs local Supabase. **Note:** zero existing coverage of prune/forget/decay — the 4 new behavioral tests are D1 deliverables (failing-first), per handoff |
| Independent reviewer | ✅ identified | Fresh-context review agent (review-only mandate, not the implementer) per established governance pattern; owner is merge authority |

## 2. Destructive paths — verified present in current main (D1 targets)

| Path | Location | Behavior today |
|---|---|---|
| 90-day decay | `supabase/functions/memory-consolidate/index.ts:130-144` | Hard-deletes importance-1 facts untouched 90 days |
| 200-cap prune | `supabase/functions/_shared/memory.ts:224-237` (`pruneFacts`, keep=200) | Hard-deletes weakest facts on the **write path** — live even if no cron exists |
| Broad forget | `supabase/functions/chat/index.ts:329-343` (`toolForgetFact`) | Substring match: any query token in title/details → hard-deletes ALL hits; no confirmation, no trash |
| Trash | migrations 0017/0019 | `trash_bin` exists; `trash_retention_days` default 30 **but framed as a paid-plan hook** (`>0` = Plus) — decision #6 requires the approved 30-day recoverable policy; downgrade behavior must preserve memories (T-D1-5 scope) |

## 3. Unresolved / not satisfiable from this environment

| Item | Status |
|---|---|
| **Prod `memory-consolidate` scheduling** | ✅ **RESOLVED 2026-10-12 ~13:53 EDT** (owner logged into dashboard; agent inspected read-only): `cron.job` contains exactly 2 jobs — `mawjood-due-reminders` and `mawjood-watch-reminders` (both */15 min, active) — **no job invokes memory-consolidate**. The function IS deployed (23 edge functions) but nothing inside Supabase or the repo schedules it. A hypothetical external (non-Supabase) cron hitting the function URL cannot be seen from here, but there is no evidence of one. **R-1 urgency: decay path appears dormant; pruneFacts write-path deletion remains LIVE regardless.** |
| **Scratch Supabase project** | ❌ **Not provisioned.** No Docker/Supabase CLI on the agent VM; CI's local stack covers automated tests, but the handoff (§4) requires a scratch cloud project for destructive-path repros + migration dry-runs. Owner to provision (free tier) and provide transient access at D1 start. |
| **Prod migration state** (which of 34 migrations are applied in prod) | ⚠️ Unresolved since D0 — document during D1 scratch work; never probe prod destructively. |

## 4. Credential revocation status (checked without exposing anything)

| Credential | Status |
|---|---|
| GitHub PAT pasted in chat 2026-10-12 | ❌ **STILL VALID** (authenticated API call succeeded 2026-10-12 ~13:35 EDT) — **not revoked. Owner action.** |
| Supabase access token (Oct 9, transient) | ⚠️ Cannot verify from here (never stored). Owner to confirm revocation in the Supabase dashboard. |

## 5. D1 execution plan (upon authorization)

- **Branch:** `d1/data-protection` from main HEAD at authorization time (expected base: `cc7397ff` or later).
- **Routing:** owner confirms the D1 execution prompt belongs to the executing chat before the first mutation (handoff §5).
- **Batches (one Draft PR, split order if review demands):**
  1. **B1 — T-D1-1 decay removal** (launch blocker first): delete the 90-day hard-delete; replace with §3 visibility re-score + review flagging; guard assertion test.
  2. **B2 — T-D1-3 pruneFacts redesign:** remove the delete loop; `countFactsForQuota` + candidate listing (read-only); block-on-overflow at the write path (no numbers finalized — OD-01/02 stay open).
  3. **B3 — T-D1-4 forget_fact redesign:** tiered matching (exact → candidate list → user picks → trash, never hard-delete); ambiguous query deletes zero; undo restores.
  4. **B4 — T-D1-5 trash enforcement:** 30-day recoverable trash per decision #6 incl. downgrade/quota-exhaustion preservation; regression tests.
  5. **B5 — T-D1-2 + T-D1-6 + T-D1-7:** non-destructive maintenance model; cascade-map verification (incl. the episode-merge delete at `memory-consolidate:122` — classified: dedupe of merged duplicate, verify it never drops unique content); quota mechanics + numeric OPTIONS (not finalized).
- **Per-batch evidence gate:** implement → new behavioral tests (failing-first, then passing) → independent review → exact-head CI 9/9 → only then next batch. Static proof (no `.delete()` on memory paths outside approved trash flows) + behavioral proof (seeded scratch runs: 90-day survival, >200 facts survival, forget-confirmation, trash restore).
- **Rollback:** all changes are function-code + additive migrations only; rollback = revert the function deploy / PR commits. Nothing destructive runs during D1; no prod migrations (separate owner approval required later).
- **Stop conditions:** any task needing a new product decision → STOP, return to owner (never weaken a criterion); any red/unreviewed batch → no stacking; scratch repro shows data loss → halt and report before proceeding.
- **Bans (carry forward):** no merges by agent, no deploys, no prod migrations, no billing activation, no quota numbers finalized, no D2 scope.

## 6. Owner actions actually needed (complete list)

1. **Revoke the GitHub PAT** pasted in chat on 2026-10-12 (still valid — verified). (GitHub → Settings → Developer settings → Personal access tokens.)
2. **Confirm the Oct-9 Supabase access token is revoked** (Supabase dashboard → Account → Access Tokens).
3. ~~**Check prod scheduling**~~ ✅ DONE 2026-10-12: not scheduled in pg_cron (see §3).
4. ~~**Provision a scratch Supabase project**~~ ✅ DONE 2026-10-12: `mawjood-d1-scratch` (ref `caimavjwasxiegjhxdsr`, Free plan, $0 confirmed at creation; isolation verified — empty DB, 0 functions, 0 cron jobs, own keys). Setup/test plan: `D1_SCRATCH_ENVIRONMENT_PLAN.md`. Migrations not yet applied (route: owner CLI or transient mgmt token at D1 start).
5. **Say "begin D1"** (with routing confirmation for the executing chat) once 1–4 are done.

*End of readiness report. D1 NOT started.*
