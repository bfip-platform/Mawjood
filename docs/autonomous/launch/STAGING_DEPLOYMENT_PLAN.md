# Staging deployment plan — live-model E2E readiness

**Status: PREPARED — NOT EXECUTED.** Nothing in this plan has been deployed,
provisioned, or spent. Execution requires the owner's explicit approval of
this plan and the spend proposal in §6. Release candidate: `main` @
`7f4bad04cbc208adc06b80d643f190ae515e30c6` (PR #42 integration + PR #43
F-LAUNCH-01 remediation, both owner-merged; merged tree re-verified
locally: unit suite 180/180, migrate-check ALL GREEN incl. 0046).

## 1. Target: reuse the scratch project as the staging backend

**Recommendation: reuse `mawjood-d1-scratch`** (ref `caimavjwasxiegjhxdsr`,
us-east-2, Free plan) as the staging Supabase project. Provisioning a third
project adds cost-surface and setup time for no isolation gain.

### Isolation audit (verified by record, 2026-10-12; re-verify at execution)

| Check | Evidence |
|---|---|
| Distinct project | Scratch ref `caimavjwasxiegjhxdsr` ≠ production ref `mwjzosfrxwxcrzcsiear`; separate project created empty on 2026-10-12 under the owner's org |
| No production data | Created empty (0 tables, 0 functions, 0 buckets at creation); only synthetic/bench data was ever added by this program; no production data was copied at any point |
| Own credentials | Scratch has its own API keys and DB password (owner-held; the DB password was form-generated at creation and never recorded) |
| Production untouched | Every program migration/test ran against scratch or local PostgreSQL only; production was never a deploy or test target |
| Residue to know about | ~100,001 bench items + ~20,001 bench notes in bench space `047a3e5a-…` (D3 benchmark), battery leftovers are cleaned; two inert `storage.objects` catalog rows (platform-blocked deletion, disclosed in PR #17). Harmless for E2E; optional cleanup in §3 step 0 |

**Caveat (honest):** the agent's previous scratch access route (a helper
using the owner's transient Management API token) no longer exists in the
agent's current environment, and the underlying token is on the owner's
revoke list. Live re-verification of scratch state is therefore a
**preflight step at execution time** (§3 step 0), done by whoever holds
access then — the plan does not pretend it was re-checked today.

### Reuse vs provision

| Reuse as-is | Must be done for staging |
|---|---|
| The scratch project + its Auth service | Apply migration **0046** (scratch carries 0001–0045 by record; 0046 is new) |
| Its schema (0001–0045), RLS, RPCs | Deploy the **24 RC edge functions** (list in §2) from `main @ 7f4bad04` |
| Its storage buckets | Set the function **secrets** (§4 — names only; values owner-set) |
| The GitHub Pages trial origin for web | Configure scratch **Auth Site URL / Redirect URLs** for the staging web origin |
| The D6 harness + injection corpus (in-repo) | Seed the **test accounts** (§5 of the test plan) with adult `birth_date` |
| | Point a staging **web build** at scratch (`EXPO_PUBLIC_*`, §2) |

## 2. What gets deployed

**Edge functions (24, deploy ALL to avoid `_shared` skew — same doctrine
as the production runbook):** account-delete, account-export,
admin-ai-governance, admin-broadcast, admin-catalog, admin-set-limits,
admin-stats, admin-subscribe, admin-user, ask, chat, classify, extract,
family-members, join-family, memory-consolidate, memory-learn, notify,
public-config, report-error, route, telemetry-janitor, transcribe,
vault-master. (`supabase/functions/_shared/` is bundled into each at
deploy time; there is no separate deploy for it.)

**Web build:** `npx expo export --platform web` from `apps/mobile` with
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set to the
**scratch** project's values, and the baseUrl handling from AGENTS.md
(temp-set `experiments.baseUrl` for the Pages subpath, restore after).
Publish to the existing Pages trial path or a staging branch — never
overwrite anything that points at production.

**Mobile:** no store build needed for E2E. Expo Go / dev client with the
same two `EXPO_PUBLIC_*` variables pointed at scratch.

## 3. Execution sequence (each step gated by its preflight)

0. **Preflight — scratch state (read-only).** Confirm: project ref is the
   scratch ref (hard-stop if it is the production ref); migration state
   (expect 0001–0045; `profiles.birth_date` present; `hard_delete_items`
   absent until step 1); function list is empty or stale (fine); note the
   two reminder cron jobs that ship with the migrations.
   *Rollback: none (read-only).*
1. **Apply migration 0046** to scratch (Management API SQL or dashboard).
   Verify: `pg_policies` for items/shopping_lists show no ALL/DELETE;
   both `hard_delete_*` functions exist with prosecdef.
   *Rollback (scratch only): the runbook's 0046 rollback snippet.*
2. **Set secrets** (§4) on the scratch project. Verify by name listing
   only — never print values.
   *Rollback: unset the secrets (also the global hard stop, §6).*
3. **Deploy the 24 functions** from the RC tree. Verify: function list
   matches §2; `public-config` responds; an unauthenticated `chat` call
   is refused (auth gate), not a 500.
   *Rollback: delete the deployed functions (scratch returns to inert).*
4. **Auth configuration**: set Site URL + Redirect URLs to the staging
   web origin on the **scratch** project only.
   *Rollback: restore previous values (record them in step 0 output).*
5. **Publish the staging web build** (§2). Verify the build's bundle
   references the scratch ref (grep the artifact for the ref string —
   and confirm the production ref string is ABSENT).
   *Rollback: unpublish / restore the previous build.*
6. **Seed test accounts** per the test plan §1 (sign up through the app
   so Auth rows are real; set `birth_date` via the in-app gate where the
   scenario calls for it, or by SQL for pre-set fixtures).
   *Rollback: delete the test users (account-delete function or dashboard).*
7. **Run the test plan** (`STAGING_TEST_PLAN.md`) within the §6 budget.
   *Stop conditions in §6 apply at all times.*

## 4. Secrets inventory (NAMES ONLY — values are owner-set, never in chat)

Platform-injected (never set manually): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Owner-set on the scratch project:

| Name | Purpose | Staging note |
|---|---|---|
| `OPENAI_API_KEY` | Primary provider (gpt-5-mini chat, gpt-4o-mini vision) | Setting this selects the OpenAI provider (`aiConfig()`); the live-E2E runs against it. **Use a DEDICATED staging key — do not reuse the production key value** (see `OPENAI_INTEGRATION_AUDIT.md`) |
| `GROQ_API_KEY` | Transcription (whisper-large-v3-turbo); Groq-only fallback provider | Optional but recommended — matches the production configuration's shape |
| `INTERNAL_FN_SECRET` | Internal function-to-function auth | Fresh value for staging; do NOT copy production's |
| `CRON_SECRET` | Cron/notify invocation guard | Fresh value for staging |
| `ADMIN_TOKEN` | Admin console/functions | Fresh value for staging |
| `VAULT_MGMT_SECRET` | Vault management functions | Fresh value for staging |
| `AI_DAILY_SPEND_CAP_USD` | Per-user daily AI cap | Set per §6 proposal (staging: `0.50`) |
| `AI_SPEND_CAP_OFF` | Kill switch — **disables** the cap | **MUST NOT be set in staging** (preflight asserts its absence) |
| `JANITOR_ENABLED` | Telemetry janitor master gate | Leave unset (janitor stays off) |

App build-time (public, anon-level): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY` — scratch values for staging builds.

## 5. Rollback doctrine

Staging is disposable by design: the full rollback is "unset secrets +
delete functions + (optionally) delete test users" and the scratch
project returns to its pre-staging state. Migration 0046 on scratch may
stay applied (it is part of the RC schema) or be rolled back with the
runbook snippet. Nothing in this plan touches production, so no
production rollback exists or is needed.

## 6. Spend review & staging limits (owner approval required)

**Current default (code):** `AI_DAILY_SPEND_CAP_USD` unset ⇒ **$2.00 per
user per day** (provisional, owner-flagged for confirmation since PR #19).
Enforcement is the atomic ledger (0044): the ledger total can never
exceed the cap. `AI_SPEND_CAP_OFF=1` disables enforcement entirely.

**Staging proposal (strict):**
- `AI_DAILY_SPEND_CAP_USD = 0.50` on the scratch project.
- At most **6 test accounts** ⇒ worst-case ledger total **$3.00/day**
  across the whole staging exercise, and the journeys/corpus are sized
  to land far below that.
- **Total exercise budget ceiling: $10** of provider spend across all
  staging live testing (all days, all accounts) — tracked against the
  provider dashboards by the owner.
- **Hard stop (any one halts the run immediately):** (a) the $10 ceiling
  is reached; (b) ANY injection-corpus payload executes an action without
  a valid «نفّذ <code>» confirmation; (c) the spend ledger and
  `ai_events` fail to reconcile; (d) any cross-space data exposure.
  **Stop action:** unset `OPENAI_API_KEY` and `GROQ_API_KEY` on the
  scratch project (takes effect without a redeploy) and notify the owner.
- Production's cap default is **not** changed by this proposal; the
  $2/day confirmation remains a separate owner decision (checklist §4).

## 7. Blockers to execution (exact)

| # | Blocker | Owner action |
|---|---|---|
| B1 | This plan + the §6 budget are unapproved | Approve (or amend) the plan and budget |
| B2 | No agent access route to scratch currently exists (prior transient-token helper is gone; token is on the revoke list) | Either execute the deploy steps yourself using §3, reconnect the Supabase connector, or provide a fresh transient token via the secure route at execution time |
| B3 | Provider keys are owner-held (transient-only rule) | Set `OPENAI_API_KEY` (+ `GROQ_API_KEY`) as scratch secrets in the dashboard |
| B4 | Scratch Auth URLs point nowhere useful | Set in step 4 (needs B2's access) |
| B5 | Migration 0046 not yet on scratch | Applied in step 1 (needs B2's access) |

None of B2–B5 can be cleared by the agent alone under the standing
no-deploy / transient-credential rules — by design.
