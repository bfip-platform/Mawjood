# Staging Phase 1 — Owner approval checklist

Only the owner can give the approvals in §1–§2. §3 is the secrets
inventory runbook gate G2 executes against (names and purposes only —
**no values exist in this document or anywhere in the repo**). §4
lists what is deliberately **not** part of Phase 1. §5 lists the
preparation that needed no approval and is already done, with its
evidence.

## §1 — Approve the package

- [ ] Approve `RUNBOOK.md` (gates G0–G7) as the Phase 1 execution
      authority, against `PREFLIGHT_EVIDENCE.md` and
      `RISK_BLOCKER_REGISTER.md`.
- [ ] Confirm the Phase 1 scope boundary: **$0 spend**, no provider
      keys, no production contact, benchmark data frozen.

## §2 — Gate approvals (each is separate; none implies the next)

- [ ] **G0** — access + preflight re-run (read-only; implied by §1,
      listed for completeness).
- [ ] **G1** — apply migration 0046 to **scratch only**, with the
      runbook's postchecks and proven rollback.
- [ ] **G2a** — generate and set the non-provider secrets of §3 on
      scratch (values via the owner's secure channel into his
      password manager; never in chat/files).
- [ ] **G3** — deploy all 24 Edge Functions to scratch in four
      batches, with the runbook's smoke checks.
- [ ] **G4** — Auth configuration, **after deciding the staging web
      URL** (register R-URL — pick one, or defer G4/G7 explicitly):
  - [ ] Decision: staging URL = ______________ (owner fills in;
        candidates and trade-offs in the register — none is
        pre-selected).
  - [ ] Decision: enable anonymous sign-ins on scratch for fixture
        T6 (yes / no — "no" invokes the G6 substitution, R-ANON).
- [ ] **G5** — create test fixtures T1–T5 (+T6 if enabled above),
      knowingly accepting the recorded deviation: DOB is SQL-seeded
      in Phase 1; the in-app declaration UI is covered at G7 or in
      the paid phase (R-FIXTURE-DRIFT).
- [ ] **G6** — execute the zero-paid-AI test matrix (rows (a)–(i)).
- [ ] **G7** — (optional for Phase 1 sign-off) build + publish the
      staging web build at the G4-decided location.

## §3 — Staging secrets inventory (authoritative for G2)

Platform-injected — exist by platform design, never set manually,
and **not** returned by the secrets list endpoint (which covers
user-defined secrets only). Functions receive them as environment
variables.

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Project API URL for function-side clients |
| `SUPABASE_ANON_KEY` | Anon-role key for function-side clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (engine purge, account erasure, logging, spend ledger writes) |

User-defined — set by G2a (Phase 1) with **fresh staging-only
values**; production's values are never read or reused:

| Name | Purpose | Generation / source | Read by (code census at `7237a17c`) |
|---|---|---|---|
| `INTERNAL_FN_SECRET` | Function-to-function authentication for internal chains | `openssl rand -hex 32`, executor-generated at execution time | 2 read sites in the function tree (`_shared` internal-header checks and their consumers) |
| `CRON_SECRET` | Guards cron/scheduled invocations (e.g. notify, telemetry-janitor) | `openssl rand -hex 32` | 2 read sites (`telemetry-janitor` among them) |
| `ADMIN_TOKEN` | Admin console + `admin-*` function authorization | `openssl rand -hex 32` | 7 read sites (the `admin-*` function family) |
| `VAULT_MGMT_SECRET` | Vault management operations | `openssl rand -hex 32` | 2 read sites (`vault-master` family) |
| `AI_DAILY_SPEND_CAP_USD` | Per-user daily AI spend cap for staging | Literal value **`0.50`** per the merged staging plan §6 (production's provisional $2.00 default is untouched) | `supabase/functions/_shared/spend.ts` |

Deferred to G2b (paid phase — NOT set in Phase 1):

| Name | Purpose | Source |
|---|---|---|
| `OPENAI_API_KEY` | Selects the OpenAI provider in `aiConfig()` (chat gpt-5-mini, vision gpt-4o-mini) | The owner's **dedicated staging key** — separate OpenAI project with its own hard usage limit; never the production key value (`../OPENAI_INTEGRATION_AUDIT.md`) |
| `GROQ_API_KEY` | Transcription (whisper-large-v3-turbo); Groq fallback provider | Owner's separate free-tier key, if he wants staging transcription parity |

Must be **absent** on scratch — the G0/G2 postchecks assert it:

| Name | Why |
|---|---|
| `AI_SPEND_CAP_OFF` | Kill switch that **disables** the spend cap entirely. Must never be set in staging. |
| `JANITOR_ENABLED` | Telemetry janitor master gate. Left unset in Phase 1; the janitor stays off. |

Storage rule for every generated value: the scratch secret store +
the **owner's password manager** only. Never chat, never a file,
never the execution log, never this repo.

## §4 — Explicitly NOT part of Phase 1 (separate owner gates)

- [ ] **G2b + the paid live-model phase**: provider keys on scratch,
      the AI-driven journeys and the 25-payload injection corpus of
      `../STAGING_TEST_PLAN.md`, the cap-trip test, and the **$10
      total exercise budget** (merged plan §6, blocker B1) with its
      four hard stops.
- [ ] Production rollout of migrations 0035→0046 + function deploys
      (`../PROD_ROLLOUT_RUNBOOK.md`) — untouched by Phase 1.
- [ ] Creating the `supabase_migrations` tracking schema on scratch
      (R-TRACK) — a tooling decision, not a staging prerequisite.
- [ ] Quota/pricing decisions (OD-01/02), the $2/day production cap
      confirmation, Stripe activation, counsel review, OD-39 —
      unchanged owner items from the earlier checklists.

## §5 — Safe preparation already done (no approval needed)

| Item | Evidence |
|---|---|
| This readiness package (runbook, evidence, register, checklist) | This directory, `docs/autonomous/launch/staging-phase1/` |
| Live read-only preflight of scratch + production | `PREFLIGHT_EVIDENCE.md` (2026-10-13): isolation PASS, schema at 0045, 0046 absent (2 ways), 0 secrets, 0 functions, Auth defaults, frozen benchmark counts |
| Merged staging deployment plan + test plan | `../STAGING_DEPLOYMENT_PLAN.md`, `../STAGING_TEST_PLAN.md` (PR #44, merged) |
| OpenAI integration audit (reuse-as-is; dedicated staging key) | `../OPENAI_INTEGRATION_AUDIT.md` (PR #45, merged) |
| F-LAUNCH-01 local proof, incl. the rollback G1 relies on | `supabase/tests/hard-delete-check.mjs` — 20/20 on local PostgreSQL (PR #43): direct DELETE dead for owner/member/anon, RPC semantics + atomicity + concurrency, rollback restores and re-apply closes |
| Migration-chain verification | `supabase/tests/migrate-check` + `migrate-lib.mjs` — 22 assertions, ALL GREEN at the release candidate |
| Unit suite at the source tree | 180/180 (includes age-gate boundary math and the spend-cap invariants G6 leans on) |

**First execution gate:** §1 + the G1 line of §2. With those two
approvals (and a per-session token, B2-access), execution starts at
G0 the same day.
