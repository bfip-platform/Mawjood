# Mawjood Engineering Standards

Adapted from App Factory engineering practices for Mawjood's reality:
Expo (React Native + Web) client, Supabase backend, small team, pre-launch.
Each standard names its **executable check** (CI or script) or the **review
evidence** required. Aspirational rules without a check are marked `[GUIDELINE]`.

---

## 1. Clean architecture and module boundaries

- `apps/mobile/src/`: `app/` (Expo Router screens only) — no business logic
  in route files beyond composition; `lib/` (domain logic, pure where
  possible); `components/` (presentational).
- `packages/voice-engine/`: the AI/data client. UI never calls Supabase
  edge functions directly — it goes through `VoiceEngine`.
- `supabase/functions/_shared/`: shared edge-function code (auth, crypto).
  No function duplicates shared logic by copy-paste.
- **Check:** `scripts/standards-check.mjs` — fails if `app/` files import
  from `supabase/functions`, or if two functions define the same exported
  helper name (copy-paste detector, allowlisted in `_shared`).

## 2. Dependency direction and separation of concerns

Allowed direction: `app/` → `components/` → `lib/` → `packages/voice-engine`
→ `supabase-js`. Never the reverse. Edge functions: handler → `_shared/` →
platform APIs. UI never imports server-only modules.

- **Check:** `scripts/standards-check.mjs` — import-graph walk; fails on
  upward or cross-layer imports (e.g. `lib/` importing from `app/`).

## 3. Strict TypeScript and input validation

- `strict: true` everywhere (already set in `apps/mobile/tsconfig.json`).
- No `any` in new code; `unknown` + narrowing at boundaries.
- All edge-function inputs validated with a schema (zod-style) before use;
  all client inputs that reach the DB go through the typed client.
- **Check:** CI `typecheck` job (`tsc --noEmit`); standards-check fails on
  new `any` in changed files (diff-aware).

## 4. Consistent API contracts and error handling

- Edge functions: `{ data }` on success, `{ error: <string> }` on failure
  (current codebase convention); HTTP status matches the error class
  (401 unauthenticated, 403 unauthorized, 404 not found, 429 rate-limited,
  500 internal). Structured `{ error: { code, message } }` is a future
  improvement — do not mix conventions within a function.
- Client: never surfaces raw error objects or stack traces to the UI;
  user-facing messages come from `i18n`.
- Request IDs on every edge-function call (already in telemetry); client
  crash handler reports with the request ID.
- **Check:** `auth-gates-check.mjs` (existing) verifies 401/403/404 gating;
  standards-check verifies every `functions/` handler returns the
  `{ error: { code } }` shape on its failure paths (AST-light grep + review).

## 5. Database transaction and migration standards

- Every migration runs in its own transaction (Supabase behavior; the CI
  migrate-check replicates it).
- Migrations are append-only once merged to `main`. Pre-merge, idempotency
  fixes are allowed with documented justification (see D-1.1 WS1 findings).
- New migrations MUST be re-runnable: `IF NOT EXISTS` / `DROP … IF EXISTS` /
  existence guards. The CI `ci` job re-applies every migration twice —
  a failure there blocks the PR.
- No `CREATE INDEX CONCURRENTLY` inside transaction-wrapped migrations
  (it cannot run in a transaction); large backfills use batched updates.
- **Migration discipline (adopted D-1.1, from WS1 audit):**
  1. Historical migrations are immutable once deployed to production.
     Never edit a migration file after it has run on any production
     database. Corrective changes go in a NEW migration file (append-only).
  2. All new migrations must be idempotent (`IF NOT EXISTS` /
     `DROP … IF EXISTS` / `CREATE OR REPLACE` / seed-if-empty).
  3. Pre-production exception (used once, D-1, 2026-10-10): historical
     files 0001/0002/0004/0006/0007/0008/0012/0028 were edited in place
     to satisfy rule 2, because append-only migrations cannot retroactively
     make historical files re-runnable. Each edit is a provable no-op on
     first application (verified: WS1 audit, all SAFE). This exception is
     CLOSED — rule 1 now applies.
  4. Seed data is seed-if-empty (`WHERE NOT EXISTS`); later seed changes
     require a new migration.
- **Check:** CI migrate-check (idempotency re-run) — executable, blocking.
  Known gate limitation: it asserts zero errors, not schema convergence
  between runs (tracked improvement).

## 6. Logging, telemetry, and privacy-safe observability

- Per-call telemetry on edge functions (already: `ops_events`, request IDs).
- NEVER log: vault secrets, ghost words, magic-link tokens, raw JWTs,
  PII beyond user_id. Logs carry `user_id` (uuid) — never email, never
  content.
- Client crash reports: sanitized (no transcript text, no file paths
  with user IDs).
- **Check:** secret-scan (gitleaks) on every PR; standards-check fails on
  `console.log` with `transcript|secret|token|password` in the same line
  (heuristic + human review for hits).

## 7. Performance budgets and reproducible benchmarks

- Budgets: chat fast-path p95 < 1.5s (no model call); AI chat p95 < 8s;
  web bundle initial JS < 3.5MB gzip; cold boot to interactive < 4s on
  mid-tier Android.
- Benchmarks run against the local Supabase stack (CI e2e-auth job
  infrastructure) with seeded fixtures — reproducible, not production.
- `[GUIDELINE]` Record p50/p95 in the PR description when touching chat,
  sync, or bundle size. Enforcement is review-based until the benchmark
  harness lands (tracked gap).

## 8. Code ownership and review requirements

- Owner (Rezeq) merges everything; agents never merge, never push to `main`.
- Every PR: CI green on the exact HEAD + owner review. AI-generated code
  gets the same review bar as human code.
- Security-sensitive areas (auth, vault, billing, RLS, migrations) require
  explicit owner sign-off named in the PR — "LGTM" is not enough for these
  paths; the sign-off names the files reviewed.
- **Evidence:** PR #2 (D-1) — Draft, CI 7/7 green, awaiting owner review.

## 9. Architecture Decision Records

- Decisions with lasting consequences go in `docs/autonomous/adr/` as
  `ADR-NNNN-<slug>.md` (status: proposed | accepted | superseded).
- Template: context → decision → consequences → alternatives considered.
- Existing decisions retro-documented as ADRs when touched (no big-bang
  rewrite). First ADR: why RLS deny-by-default for system tables (D-1.1).
- **Check:** standards-check warns (non-blocking) when a PR touches
  `supabase/migrations/` or `supabase/functions/_shared/` without
  adding/updating an ADR.

## 10. Release readiness and rollback procedures

- Release checklist (before any store submission or prod migration):
  1. CI green on the exact release SHA (all jobs, incl. e2e-auth).
  2. Migration dry-run against a prod-clone (never prod directly).
  3. Rollback plan written: for migrations, the compensating migration;
     for client, the previous build artifact + OTA rollback path.
  4. Owner sign-off.
- Client releases: staged rollout (TestFlight internal → external →
  production). Kill-switches (remoteConfig) can disable features without
  a new build.
- Database: no destructive migration without a tested restore. `secret_code`
  column drop (0028) is the template: backfill → verify → drop, each step
  independently re-runnable.
- `[GUIDELINE]` Until the first production release, this section is
  rehearsal — the checklist is exercised on every D-batch.

---

## Executable checks map

| Standard | Check | Enforced in CI |
|---|---|---|
| 1, 2 module boundaries | `scripts/standards-check.mjs` | yes (new job) |
| 3 strict TS | `tsc --noEmit` | yes (existing typecheck) |
| 4 API contracts | `auth-gates-check.mjs` + standards-check | yes |
| 5 migrations | migrate-check idempotency re-run | yes (existing) |
| 6 privacy logging | gitleaks + standards-check heuristic | yes |
| 7 perf budgets | review-based (harness = gap) | no — tracked |
| 8 ownership/review | PR process (owner merges) | process |
| 9 ADRs | standards-check warning | advisory |
| 10 release/rollback | checklist (manual) | process |

## Gaps accepted by this standard (explicit, not hidden)

- No reproducible performance benchmark harness yet (Standard 7).
- No automated API-contract test beyond auth gates (Standard 4 — planned).
- Standards-check is heuristic (grep/AST-light); determined evasion is a
  review problem, not a tooling problem.
