# Implementation Ledger

Mawjood durable handoffs. Append-only: newest entries first. **Do not
delete prior entries; corrections are appended as new entries, never
rewritten.**

## Entry schema

Each entry records:

- **Date** (ISO, with timezone)
- **Mission / task ID**
- **Branch**
- **Base SHA** (exact commit the work started from)
- **Scope** (what was authorized and built)
- **Changes** (files/areas touched, with resulting SHAs where applicable)
- **Review verdict** (independent review outcome + exact reviewed SHA)
- **CI evidence** (workflow run IDs + SHAs; honest UNKNOWN when not
  observable)
- **Decisions** (material decisions made, with authority)
- **PR URL** (filled by the coordinator after opening)

---

---

## 2026-10-12 — Mission MAWJOOD D0: Full Project Discovery & Audit (COMPLETE)

- **Date:** 2026-10-12 ~04:10 UTC
- **Mission / task ID:** MAWJOOD D0 (owner-dispatched 2026-10-11 23:48 EDT)
- **Branch:** `d0/discovery-audit` (branched from main @ `1c3c57b7`)
- **Base SHA:** `1c3c57b7b99def1816f63286356f95eef98573fe` (D-1/D-1.1 merged; verified)
- **Scope:** Comprehensive evidence-based discovery & audit: codebase inventory,
  product/UX audit, memory-retention audit (core contract), security &
  architecture, performance & scale, App Factory reuse, commercial readiness.
  10 versioned documents under `docs/autonomous/d0/`. Discovery/documentation
  ONLY — zero application code changes. Bans honored: no merge/deploy/prod-data/
  billing changes; no D0.5 begun; PR stays Draft.
- **Method:** 7 parallel audit workstreams via coordinator subagent; critical
  findings spot-verified against source by parent agent.
- **Headline findings:** (1) CRITICAL — memory-consolidate hard-deletes saved
  facts (90-day decay + 200-cap, no tier distinction) — contradicts durable-memory
  promise; (2) HIGH — cross-user photo read escalation via photo_url;
  (3) MEDIUM — route/classify public yet client-invoked (AI-spend oracle);
  (4) CRITICAL commercial — zero Stripe, zero legal docs, zero SEO/PWA;
  (5) HIGH — no AI quotas, ILIKE search w/o index, unindexed items.note_id.
- **Recovery anchor:** `1c3c57b7` (main HEAD at D0 start); branch is docs-only.
- **Review verdict:** pending (owner review of D0 findings required before D0.5).
- **CI evidence:** BLOCKED — GitHub PAT is read-only (`metadata=read` only; 403 on
  blob creation). Cannot push branch, open Draft PR, or trigger CI. Commit
  `1190890` is complete locally on `d0/discovery-audit`; docs-only scope verified.
- **PR URL:** BLOCKED (same PAT issue). Owner options: (a) provide fresh
  fine-grained PAT (Contents:write, Pull requests:write) for push+PR, or
  (b) push the local branch himself.

## 2026-10-11 — Mission MAWJOOD D-1.1 continuation: e2e-auth magic-link failure (COMPLETE)

- **Date:** 2026-10-11 ~16:30 EDT → 2026-10-12 ~03:00 EDT
- **Mission / task ID:** MAWJOOD D-1.1 continuation (owner-authorized 2026-10-11 16:32 EDT)
- **Branch:** `d1/governance-foundation`
- **Final HEAD:** `c23facf0981d57275c272c0d1a143dd1fb6f0ecb` (verified remote via API)
- **Scope:** Investigate the last failing job (`e2e-auth` "Authenticated journey tests") from CI
  run 38117585282 (8/9 pass; `rls-audit` behavioral now PASS); reproduce, fix root cause
  without weakening tests/security; push; rerun full CI on the exact final commit; update
  ledger + recovery checkpoint. Bans: PR #2 Draft; no merge/deploy/prod-data/D0/D0.5.
- **CI failure under diagnosis:** run 38117585282, completed/failure. All 4 Playwright tests
  in `tests/e2e/auth-journey.spec.mjs` failed with 60s timeouts; primary error
  "page.waitForTimeout: Target page, context or browser has been closed" at
  `signInViaMagicLink` (spec line 62), i.e. right after the email-submit step. Supabase
  stack, migrations, Mailpit (54324), and web build all succeeded — infra was fine.
- **Root causes found & fixed (12 total, all test-harness or test-only app affordances —
  ZERO app/backend security or logic defects):**
  1. Fragile submit: `.last().click()` + `press('Enter')`, both with swallowed errors
     (`.catch(() => {})`). Each burned its 30s actionability timeout on a
     non-actionable target → 60s test timeout before Inbucket was ever polled.
     → Explicit bilingual button match + `expect().toBeVisible()` gate.
  2. No sent-state confirmation gate → fail-fast `expect('Check your email|تفقد
     بريدك').toBeVisible()`.
  3. Mailpit API shape: `GET /api/v1/messages` returns `{messages:[...]}`, not a
     bare array; detail uses `.HTML`/`.Text`. → Handle both shapes; bounded poll.
  4. UI default language is Arabic in fresh CI browsers → bilingual regexes.
  5. `toBeHidden()` passes for non-existent elements → explicit `toHaveURL`
     (app origin) gate after magic-link redirect.
  6. Session persistence is async after redirect → poll `browserSession()` up to
     30s instead of single read.
  7. GoTrue per-IP email rate limiting throttled 2nd/3rd/4th magic-link emails →
     tests 2–4 now use `signInWithPassword()` (admin API user creation, no email);
     test 1 keeps the FULL real magic-link UI journey. CI job exposes
     `MAWJOOD_TEST_SUPABASE_SERVICE_KEY`.
  8. `div[role="button"]` matched ZERO elements: RN Web Pressable renders a plain
     `<div>` without `role="button"` unless `accessibilityRole` is set. →
     Added `testID="tab-home"` / `testID={"tab-space-"+type}` to space tab
     Pressables (standard RN testID → `data-testid` on web; no visual/functional
     change); spec uses `getByTestId()`.
  9. Onboarding overlay blocked tab clicks → set `mawjood.welcomed.v1='1'` in
     storage pre-boot (exactly what the app's own `finishWelcome()` writes).
  10. Test 2 created a new space via API, but `pickSpace('private')` resolves
      from the app's booted spaces list → used the default private space instead.
  11. `ensureDefaultSpaces` is async → poll for default space existence.
  12. Note `status` defaulted to non-ready → UI showed "⏳ processing…" not the
      transcript → insert with `status='ready'`.
- **Push:** all commits pushed via Git Data API replay; remote verified at
  `c23facf0981d57275c272c0d1a143dd1fb6f0ecb` (local == remote, clean).
  NOTE: `/tmp/d1_push_pat.py` is ephemeral (wiped between turns); recreated from
  the recorded pattern when needed. The D-1.1 push credential is the user's
  transient PAT (never stored); revoke reminder owed at D-1.1 close.
- **CI rerun:** run 38196503661 on exact HEAD `c23facf0` — **ALL 9 JOBS PASS**
  (ci, secret-scan, vuln-scan, rls-audit, auth-gates, e2e-smoke, e2e-auth,
  standards, provenance). **D-1.1 COMPLETE.**
- **Review verdict:** READY FOR OWNER — all CI green on exact HEAD; PR #2 Draft
  untouched (owner merges directly).
- **Decisions:**
  - No fallback to direct `signInWithOtp` API call on UI-submit failure — a silent
    fallback would weaken the test; the fail-fast gate makes a broken submit visible.
  - Did not touch app/backend logic: all failures were test-harness fidelity or
    test-only affordances (testIDs, storage flags). The single app-code change
    (testID props) is a standard testability affordance with zero functional impact.
- **PR URL:** https://github.com/bfip-platform/Mawjood/pull/2 (Draft; untouched).

- **Date:** 2026-10-11 ~16:30–17:00 EDT
- **Mission / task ID:** MAWJOOD D-1.1 continuation (owner-authorized 2026-10-11 16:32 EDT)
- **Branch:** `d1/governance-foundation`
- **Base SHA:** `4f676e441ee28a9dc314b3061718b7e836ded949` (pushed 2026-10-11 ~02:15 EDT)
- **Scope:** Investigate the last failing job (`e2e-auth` "Authenticated journey tests") from CI
  run 38117585282 (8/9 pass; `rls-audit` behavioral now PASS); reproduce, fix root cause
  without weakening tests/security; push; rerun full CI on the exact final commit; update
  ledger + recovery checkpoint. Bans: PR #2 Draft; no merge/deploy/prod-data/D0/D0.5.
- **CI failure under diagnosis:** run 38117585282, completed/failure. All 4 Playwright tests
  in `tests/e2e/auth-journey.spec.mjs` failed with 60s timeouts; primary error
  "page.waitForTimeout: Target page, context or browser has been closed" at
  `signInViaMagicLink` (spec line 62), i.e. right after the email-submit step. Supabase
  stack, migrations, Mailpit (54324), and web build all succeeded — infra was fine.
- **Root-cause classification:** **TEST-HARNESS bugs (4), NOT app/backend defects.**
  1. Fragile submit: `.last().click()` + `press('Enter')`, both with swallowed errors
     (`.catch(() => {})`). Each burned its 30s actionability timeout on a
     non-actionable target → 60s test timeout hit before Inbucket was ever polled.
     The magic-link email was never requested.
  2. No sent-state confirmation gate: without it, a silent submit failure funnels
     into Inbucket polling for an email that will never arrive (useless timeouts).
  3. Mailpit API shape: `GET /api/v1/messages` returns `{total,unread,messages:[...]}`,
     not a bare array; message detail uses `.HTML`/`.Text`, not `.Body.html`. The old
     code would have thrown TypeError on the first poll.
  4. UI default language is Arabic in fresh CI browsers (`i18n.ts:937`); any
     English-only text selector would never match.
- **Fix (commit `18b5857`, NOT weakening):** explicit bilingual submit-button match
  (`/Send login link|أرسل رابط الدخول/`) + `expect().toBeVisible()` gate; fail-fast
  sent-state gate (`/Check your email|تفقد بريدك/`); bounded 45s Inbucket poll
  handling both Mailpit response shapes; bilingual regexes throughout. The journey
  itself is unchanged — real magic-link via Mailpit, real session, real
  RLS-enforced reads. Failures are now explicit, not mysterious timeouts.
- **Push:** verified local == remote before push (local exactly 1 commit ahead,
  `18b5857`; remote `4f676e44`). Pushed via Git Data API replay (blobs→trees→
  commits→PATCH ref); remote verified at `d70404380f141ad6a25a0cc6fae9e5f08d017c34`.
  NOTE: `/tmp/d1_push_pat.py` is ephemeral (wiped between turns); recreated from
  the recorded pattern when needed. The D-1.1 push credential is the user's
  transient PAT (never stored); revoke reminder still owed at D-1.1 close.
- **CI rerun:** run 38172967289 triggered on exact HEAD `d7040438` — status at ledger
  write time: IN-PROGRESS (see final report for outcome).
- **Review verdict:** pending (CI green on exact HEAD still required).
- **Decisions:**
  - No fallback to direct `signInWithOtp` API call on UI-submit failure — a silent
    fallback would weaken the test (it must exercise the real UI journey); the
    fail-fast gate makes a broken submit visible instead.
  - Did not touch app/backend code: the failure was entirely in the test harness.
- **PR URL:** https://github.com/bfip-platform/Mawjood/pull/2 (Draft; untouched).

## 2026-10-11 — Mission MAWJOOD D-1.1 continuation: CI failure diagnosis + fixes (IN-PROGRESS)

- **Date:** 2026-10-11 ~02:00–06:10 EDT
- **Mission / task ID:** MAWJOOD D-1.1 continuation (owner-authorized 2026-10-11 ~01:50 EDT)
- **Branch:** `d1/governance-foundation`
- **Base SHA:** `240ea83f687b6dccef1012f114275f6541a2231f` (PR #2 verified HEAD)
- **Scope:** Diagnose CI run 38115164580 (7/9 pass; FAIL = `rls-audit` "Behavioral authorization
  tests" + `e2e-auth` "Apply migrations to local Supabase"); reproduce locally; classify each
  root cause (test-harness / migration / real security defect); fix without weakening security;
  finish D-1.1 assessments. Bans: PR #2 stays Draft; no merge/deploy/prod-data/D0/D0.5.
- **CI failure under diagnosis:** run 38115164580, completed/failure. Job-logs API returns 401
  for the connector token — logs could not be downloaded; both failures reproduced locally
  instead (PostgreSQL 18.4 via embedded binaries; supabase CLI 2.120.0).
- **Root-cause classification:**
  - `rls-audit` / behavioral — **TEST-HARNESS bugs (4), NOT security defects, NOT migration
    issues.** The RLS policies were never exercised (harness crashed first); policies
    themselves are sound (proven by the now-green behavioral suite: 37 policies, all
    cross-user/cross-family/removal/anon/billing scenarios pass).
    1. `supabase/tests/authz-behavioral.mjs`: `asUser()` used the Pool API
       (`connect()`→client, `.release()`) on a `pg.Client`. Second `connect()` rejects:
       "Client has already been connected. You cannot reuse a client." → HARNESS ERROR,
       exit 2. Reproduced exactly. Fix: `new pg.Pool()` (per-scenario connections;
       `SET LOCAL` is transaction-scoped + rolled back, no cross-user leakage).
    2. Scratch DB lacked Supabase default GRANTs → every simulated-user query died with
       "permission denied for table" before RLS evaluation. Fix: mirror Supabase's
       default grants (anon/authenticated) in the test setup; RLS remains the
       enforcement boundary. Replicates production; does not weaken any policy.
    3. `auth.uid()` stub not empty-claim safe: Postgres leaves a rolled-back `SET LOCAL`
       custom GUC as `''` (not NULL); `''::json` raises "invalid input syntax for type
       json". Fix: `nullif(..., '')` guard — treats absent claim as absent, matching
       real Supabase behavior.
    4. Step-5 policy-gating heuristic false-positive on
       `storage.objects.item_photos_owner_read`: its qual delegates to the verified
       `can_read_photo` helper (0029; SECURITY DEFINER, search_path=public, gates on
       auth.uid()+can_access_space, EXECUTE only to authenticated). Fix: narrow,
       evidence-backed addition to the test allowlist regex (not a broad exception).
  - `e2e-auth` / migrations — **CI-WORKFLOW bug, NOT migration incompatibility, NOT a
    security defect.** `supabase db push` targets the LINKED hosted project and fails
    with "Cannot find project ref. Have you run supabase link?" when nothing is linked
    (reproduced locally with CLI 2.120.0). The job starts a local stack and never
    links — `db push` could never succeed there. Migrations themselves apply cleanly
    (migrate-check green). Fix: `supabase migration up` ("Apply pending migrations to
    local database" per `supabase migration up --help`).
- **Changes (local, committed):**
  - `supabase/tests/authz-behavioral.mjs` — Pool fix + grants mirroring + auth.uid()
    empty-claim guard + can_read_photo allowlist (4 harness-fidelity fixes)
  - `.github/workflows/ci.yml` — e2e-auth: `supabase db push` → `supabase migration up`
  - `docs/autonomous/SQL_MIGRATIONS_ASSESSMENT.md` — NEW: D-1.1 historical migrations
    assessment (34 migrations; per-migration table; 8 findings F-1..F-8 with file:line
    evidence; verdict: safe to apply fresh + re-run; remediation list)
  - Local commit: `ec8ecc3` (on top of `240ea83f`)
- **Local verification (all green):** migrate-check ✅, rls-audit (static) ✅,
  authz-behavioral ✅ (37 policies, all scenarios), standards-check ✅,
  auth-gates-check ✅, unit tests 33/33 ✅, ci.yml YAML valid (9 jobs).
  Not runnable locally: vuln-scan audit-gate (npm registry audit endpoint blocked by
  sandbox policy — fail-closed by design; passed in CI 38115164580, unaffected by
  these changes), e2e-auth full stack (needs Docker; fix verified via CLI docs +
  direct `db push` failure reproduction), e2e-smoke (was passing; untouched).
- **Assessments completed (3/3):** App Factory reusable cores
  (`APP_FACTORY_CORE_ASSESSMENT.md`, pre-existing WS5) ✅; engineering standards
  (`ENGINEERING_STANDARDS.md` + `standards-check.mjs`, pre-existing WS4) ✅;
  historical SQL migrations (`SQL_MIGRATIONS_ASSESSMENT.md`, NEW this entry) ✅ —
  all evidence-backed, assessment-only, no integration changes.
- **Remaining blockers:**
  1. **PUSH BLOCKED — genuine credential blocker.** `custom.github-mawjood` connector
     PAT is read-only in practice: `git push` → 401, `POST /git/blobs` → 403,
     `PUT /repos/.../contents` → 403 ("Resource not accessible by personal access
     token"). Same 403 was recorded in the D-1 ledger 2026-10-10 ("writes blocked
     post-transfer"). Fixes are committed locally (`ec8ecc3`) and verified; CI
     rerun is pending a working write credential (user-provided PAT as in D-1, or
     connector remediation). Did NOT use `custom.github` for Mawjood writes —
     outside the authorized credential scope for this task.
  2. CI rerun pending blocker 1 (cannot push → cannot trigger CI on the fix HEAD).
- **Review verdict:** pending (independent review + CI green on exact HEAD still required).
- **CI evidence:** run 38115164580 (pre-fix baseline: 7/9 pass, rls-audit + e2e-auth FAIL);
  post-fix CI: BLOCKED on push credential (see blockers). Local reproduction +
  verification evidence above stands in for CI until the rerun.
- **Decisions:**
  - All four rls-audit fixes are test-harness fidelity corrections, classified as
    non-security-weakening with per-fix justification recorded here and in code comments.
  - `can_read_photo` allowlist is narrow (single verified helper) — explicitly NOT a
    broad allowlist; the alternative (rewriting the 0029 migration) was rejected as
    higher-risk.
  - Did not attempt credential-scope expansion to unblock the push; escalated instead.
- **PR URL:** https://github.com/bfip-platform/Mawjood/pull/2 (Draft; description update
  pending push — will record D-1.1 status once the branch is pushed).

## 2026-10-10 — Mission MAWJOOD D-1: engineering governance & CI foundation (COMPLETE)

- **Mission / task ID:** MAWJOOD D-1
- **Branch:** `d1/governance-foundation`
- **Base SHA:** `67ba33f3be77e29a7233ba27510e33a021fb0301`
- **Final HEAD SHA:** `61169863f4e175edf0a692a61ef0bbaeb6b8722b`
- **Commits pushed (via Git Data API replay, content-identical):**
  - `f7c8aaa1` → `8f7d1f70` — feat: D-1 engineering governance & CI foundation
  - `dfd4c7ad` → `27c215b2` — docs: record D-1 recovery checkpoint
  - `94e7597d` → `34ebe502` — fix: CI green round 1 (gitleaks OSS, audit baseline,
    e2e path, idempotent migrations)
  - `6ba07ab3` → `36978d5a` — fix: rls-audit ambiguous tablename; playwright testDir
  - `f78e9538` → `61169863` — fix: rls-audit system-table allowlist; e2e dummy env
- **Scope:** engineering governance document set + CI gates. No product code
  changes; no merges (owner merges directly); no deploys; no prod DB changes.
- **Changes (beyond the governance docs):**
  1. `.github/workflows/ci.yml` — 7 jobs: secret-scan (OSS gitleaks binary;
     the gitleaks GitHub Action now requires a paid license for org repos),
     vuln-scan (baseline gate: `audit-baseline.json` + `scripts/audit-gate.mjs`,
     fails only on NEW high/critical advisories; 4 pre-existing Expo-toolchain
     advisories pinned), e2e-smoke (dummy Supabase env for CI web build),
     auth-gates, rls-audit, ci (migrate-check), provenance.
  2. `audit-baseline.json` (new) + `scripts/audit-gate.mjs` (new).
  3. `tests/e2e/playwright.config.mjs` — webServer path + testDir fixed
     (both are config-file-relative, not cwd-relative).
  4. `supabase/tests/rls-audit.mjs` — qualified ambiguous `tablename`;
     allowlisted 13 deny-by-default system tables (verified: mobile client never
     queries them directly; all access via service_role edge functions).
  5. Migrations `0001,0002,0004,0006,0007,0008,0012,0028` made idempotent
     (`IF NOT EXISTS` / `DROP … IF EXISTS`; 0028 backfill guarded by a
     column-existence DO block).
- **Review verdict:** coordinator self-review + local checks green
  (tsc ×2, expo lint 0 errors, 33/33 unit, 23/23 auth-gates, secret-scan clean).
  No independent third-party review was run (none available in this loop).
- **CI evidence (exact-head runs on the PR branch):**
  - Run 38026484557 (HEAD `27c215b2`): 2 pass / 5 fail — failures root-caused,
    all fixed (see Changes).
  - Run 38026906557 (HEAD `34ebe502`): 5 pass / 2 fail (rls-audit SQL bug,
    e2e testDir) — fixed.
  - Run 38027089633 (HEAD `36978d5a`): 5 pass / 2 fail (rls-audit real finding
    → allowlist; e2e missing env → dummy env) — fixed.
  - Run 38027362760 (HEAD `61169863`): **7/7 SUCCESS** ✅
    (auth-gates, secret-scan, provenance, vuln-scan, ci, rls-audit, e2e-smoke).
- **Decisions:**
  - Secret-scan: OSS gitleaks binary instead of the licensed GitHub Action
    (same engine, same flags + `.gitleaks.toml`).
  - Vuln-scan: checked-in baseline; gate fails only on NEW high/critical
    advisories. Pre-existing Expo-toolchain advisories cannot be fixed without
    breaking the Expo SDK pin — re-audit on every SDK upgrade.
  - RLS audit: 13 system tables are intentionally deny-by-default (RLS on,
    zero policies); adding policies would weaken security. Allowlisted with
    documented justification + client-access verification.
  - E2E: dummy Supabase env vars in CI (clearly marked placeholders); the
    smoke test's documented scope excludes backend connectivity.
  - Migration idempotency is behavior-preserving: prod already has these
    migrations applied; `IF NOT EXISTS` is a no-op there.
- **Limitations:**
  - No independent (third-party) review performed — coordinator + local checks
    only. Owner should review before merging.
  - Migration idempotency validated by CI's re-run gate, not against a prod
    snapshot. Prod already applied these migrations; changes are no-ops there.
  - E2E smoke scope: bundle loads/renders only; no login, no Supabase, no
    user journeys (documented in the spec file).
  - Vuln baseline pins 4 advisories; new advisories fail CI by design.
- **Rollback:** branch-only work. Delete the branch or close the PR to roll
  back; `main` untouched. Migrations not applied to prod by this mission.
- **PR URL:** https://github.com/bfip-platform/Mawjood/pull/2 (Draft — DO NOT MERGE; owner merges directly).

## 2026-10-10 — Mission MAWJOOD D-1: engineering governance & CI foundation (IN-PROGRESS)

- **Mission / task ID:** MAWJOOD D-1
- **Branch:** `d1/governance-foundation`
- **Base SHA:** `67ba33f3be77e29a7233ba27510e33a021fb0301` (main HEAD after
  2026-10-10 recovery rebase; mission base was `531a84e8edcd4756ab3ab068fc42ea162906ed06`).
  Recovery: clean rebase onto `67ba33f3` ("docs: establish Mawjood autonomous
  governance and D0 planning" — ChatGPT bootstrap, 8 docs, merged to main
  2026-10-09). No filename collisions; merged bootstrap documents untouched.
  Pre-rebase backup ref: `d1/governance-foundation-backup` (@ `da6250f`).
  Auth re-check 2026-10-10: `POST /git/blobs` → 403 on both connectors
  (writes blocked post-transfer); reads fine. Push/PR/CI pending credential
  remediation — see "Remaining blockers".
- **Scope:** engineering governance document set + CI gates. No product
  code changes; no merges (owner merges directly); no deploys.
- **Changes (this batch):** 9 governance/support documents under
  `docs/autonomous/` —
  1. `PORTABILITY_AND_HANDOFF.md`
  2. `INCIDENT_RESPONSE.md`
  3. `AGENT_REGISTRY.md`
  4. `AUTONOMY_EVALUATION.md`
  5. `INSTRUCTION_VERSIONING.md`
  6. `IMPLEMENTATION_LEDGER.md` (this file)
  7. `CAPABILITY_REGISTRY.md`
  8. `BATCH_CONTRACT_TEMPLATE.md`
  9. `README.md`
  
  plus 5 sibling-owned documents in the same set —
  `START_HERE.md`, `ENGINEERING_CONSTITUTION.md`,
  `QUALITY_SECURITY_STANDARD.md`, `DEBUGGING_VERIFICATION_PROTOCOL.md`,
  `CONTEXT_ISOLATION_AND_RECOVERY.md`.
- **Review verdict:** pending (independent review required before PR).
- **CI evidence:** pending (CI gates to be established as part of D-1).
- **Decisions:**
  - Governance lives in `docs/autonomous/`, separate from product docs in
    `docs/` root (see `README.md` placement justification).
  - Agent-neutral language throughout (no provider-specific rules).
  - Autonomy levels L0–L3 (not App Factory's D0–D4); no package-factory
    concepts (no SemVer releases, no core tiers, no merge bans).
  - Owner merges directly; agents NEVER merge.
- **PR URL:** TBD (coordinator fills after opening).
