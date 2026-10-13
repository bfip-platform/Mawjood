# Staging Phase 1 — Preflight evidence summary (live, 2026-10-13)

**Status: EXECUTED (read-only).** This is the evidence base for
`RUNBOOK.md`. Every Phase 1 gate's prechecks re-verify against these
values; any drift from them at execution time is a STOP condition
(runbook §Global stop conditions).

Source tree: `main` @ `7237a17cc2d47bbfe146678ba98c21117dac46ea`
(includes PR #44 staging plan + PR #45 OpenAI audit addendum).

## Method

- Access: the owner's **transient** Supabase Management API token,
  supplied per session under the standing transient-credential rule —
  used for this battery only, **never stored** in chat, files, memory,
  or the repo; it joins the owner's revoke list after use.
- Calls: Management API `GET` endpoints only
  (`/v1/projects`, `/v1/projects/{ref}/functions`,
  `/v1/projects/{ref}/secrets`, `/v1/projects/{ref}/config/auth`), plus
  **SELECT-only** schema probes through
  `POST /v1/projects/{ref}/database/query`. No write, deploy, or
  configuration call was made. No provider (paid AI) call was made.
- Secret handling: the secrets endpoint returns **names + digests
  only**; no secret value was seen, printed, or recorded anywhere in
  this battery.

## Findings

### Projects (isolation)

| Check | Result |
|---|---|
| Scratch project | `caimavjwasxiegjhxdsr` (`mawjood-d1-scratch`), created 2026-10-12, `ACTIVE_HEALTHY`, us-east-2 |
| Production project | `mwjzosfrxwxcrzcsiear`, created 2026-09-22, `ACTIVE_HEALTHY`, us-east-2 |
| Relationship | Distinct refs, same owner org; scratch was created empty — no production data was ever copied into it (created-empty record + residue content below corroborate) |

**PASS** — scratch is isolated from production by project, by data,
and by credentials (below).

### Secrets (names only)

| Project | User-defined secrets |
|---|---|
| Scratch | **ZERO** — the secrets list is empty |
| Production | Includes `OPENAI_API_KEY` and `GROQ_API_KEY` (live-verified **by name**), plus the production operations set |

Consequence, per `../OPENAI_INTEGRATION_AUDIT.md`: production runs the
OpenAI premium path; **scratch has no provider key and therefore
cannot spend** — with functions deployed but no keys set, `aiConfig()`
(`supabase/functions/_shared/ai.ts`) yields an empty-key Groq config
whose model calls fail closed. This is the foundation of the Phase 1
zero-paid-AI test matrix (runbook G6).

Note: the Management API secrets list covers **user-defined** secrets
only. Platform-injected keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) are managed by the platform, are not
listed there, and are delivered to functions as environment variables
by design.

### Schema (scratch) — physically at migration 0045

Verified present by object inventory (SELECT-only probes):

- `profiles.birth_date`, type `date` (migration 0045)
- `items.updated_at` column (migration 0042)
- RPCs `try_charge_ai_spend` and `ai_spend_total` (migration 0044)
- `pending_actions` table (0034, extended 0036/0037) and
  `ai_spend_daily` table (0044)
- Core tables: `items`, `notes`, `spaces`, `profiles`, `trash_bin`,
  and the rest of the 0001–0045 schema

### Migration 0046 — ABSENT on scratch (proven two ways)

1. `pg_proc`: `hard_delete_items` and `hard_delete_shopping_list`
   count = **0**.
2. `pg_policies` for `items` = exactly
   {`items_member_read` (SELECT), `items_member_write` (ALL)} — the
   pre-0046 posture; the F-LAUNCH-01 policy split has not been applied.

This is expected: 0046 is applied by runbook gate G1.

### Methodological note — migration tracking is ABSENT (read this)

`supabase_migrations.schema_migrations` **does not exist** on scratch.
Migrations 0001–0045 were applied as **raw SQL** through the Management
API `database/query` endpoint, never through a migration runner, so:

- `GET /v1/projects/{ref}/database/migrations` returns `[]` — an
  **artifact**, not a state reading. Schema state on this database can
  only be established by object inventory (as done above).
- Any future tool that trusts the tracking table (e.g. a CLI
  `db push` / `migration list`) will misread this database as
  unmigrated. Staging therefore applies 0046 by the **same raw-SQL
  route** (runbook G1) and does **not** silently adopt the CLI against
  this database. Recorded as risk R-TRACK in
  `RISK_BLOCKER_REGISTER.md`.

### Edge Functions

| Project | Deployed functions |
|---|---|
| Scratch | **0** |
| Production | 23 |

Repo inventory (deploy target list for runbook G3): **24** deployable
functions in `supabase/functions/` at the source tree above —
account-delete, account-export, admin-ai-governance, admin-broadcast,
admin-catalog, admin-set-limits, admin-stats, admin-subscribe,
admin-user, ask, chat, classify, extract, family-members, join-family,
memory-consolidate, memory-learn, notify, public-config, report-error,
route, telemetry-janitor, transcribe, vault-master — plus `_shared/`,
which is bundled into each function at deploy time and is not deployed
standalone.

### Auth configuration (scratch)

| Field | Live value |
|---|---|
| `site_url` | `http://localhost:3000` (platform default) |
| `uri_allow_list` | **EMPTY** |
| `mailer_autoconfirm` | `false` |
| `enable_anonymous_sign_ins` | `null` (not enabled) |

The empty allow-list is blocker B4 (runbook G4): no staging web origin
can receive an auth redirect until the owner decides the staging URL
(register item R-URL). No URL has been invented for this package.

### Data (scratch) — benchmark residue, FROZEN

| Table | Rows |
|---|---|
| `items` | 100,002 |
| `notes` | 20,001 |
| `spaces` | 2 |

This is the D2/D3 trigram-benchmark residue (bench space
`047a3e5a-494d-43c8-b84a-142e364514ee`, +1 space) plus battery rows.
**It is never deleted or modified by any Phase 1 step.** The counts
above are a standing invariant: every gate re-checks them, and any
drift is a global stop condition (risk R-BENCH).

## Not probed in this battery (stated, not assumed)

- Row count of `ai_spend_daily` on scratch (runbook G0 records it as a
  baseline before any fixture exists).
- Storage bucket/object state on scratch (the G6 photo-isolation row
  identifies its bucket from the fixture note's `photo_url` at
  execution time).
- Cron jobs on scratch (no Phase 1 gate depends on them; the janitor
  stays disabled — `JANITOR_ENABLED` unset).

## Verdict

**PREFLIGHT PASS.** Scratch matches every assumption in the merged
staging plan (`../STAGING_DEPLOYMENT_PLAN.md`): isolated, schema at
0045, 0046 absent, zero secrets, zero functions, Auth URLs unset.
Phase 1 execution itself has **NOT** started — it begins only at the
owner's approval of `RUNBOOK.md` (see `OWNER_APPROVAL_CHECKLIST.md`).
