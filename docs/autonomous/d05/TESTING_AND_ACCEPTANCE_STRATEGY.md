# D0.5 — Testing & Acceptance Strategy

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPECIFICATION ONLY — planning document. No test code written in D0.5.
**Inputs:** `workstream-06-technical.md` §11 · `workstream-07-roadmap.md` §2 (per-stage gates) · D0 AI-E2E reconciliation · 9 approved owner decisions

---

## PART A — Testing architecture

### 1. Current state (D0-verified)

| Suite | Status |
|---|---|
| `supabase/tests/authz-behavioral.mjs` (37 policies) | ✅ CI-enforced |
| RLS static audit | ✅ CI-enforced |
| `tests/e2e/auth-journey.spec.mjs` (4 journeys) + smoke | ✅ CI-enforced |
| Unit tests | ✅ 33/33 |
| Edge-function handler tests | ❌ **Zero** |
| AI-path E2E (chat/extract/memory-learn/ask/transcribe) | ❌ **Zero** — reconciled D0 gap |
| Vault / export / delete flow tests | ❌ **Zero** |
| UI rendering tests | ❌ **Zero** |
| Performance benchmarks | ❌ **None** |

### 2. Unit tests

- **Scope:** pure logic in `packages/edge-shared/` (promoted `_shared`), `voice-engine` transport helpers, migration idempotency helpers.
- **Standard:** every new pure function ships with unit tests; coverage gate on `packages/edge-shared` (target ≥80% on trust-boundary modules: `edge-auth`, `rate-limit`, `governance`).
- **CI:** `ci` job extended; failures block PRs.

### 3. Edge-function handler tests (new suite — closes the zero-coverage gap)

- **Runner:** Deno test suite; each handler invoked with synthetic requests.
- **AI paths** (chat, extract, memory-learn, ask, transcribe): run against a **mock AI provider** implementing the `_shared/ai.ts` interface with deterministic scripted responses (fixed transcripts, fixed extract JSON, scripted ReAct tool calls).
- **Assertions per handler:** contract shapes (§2 DATABASE_AND_API_CONTRACTS), DB writes, idempotency replay, rate-limit and quota behavior, and the **no-content-in-logs invariant** (message content/transcripts/secrets never in `ai_events`/`ops_events`/Sentry).
- **Compatibility harness (Gate C):** the same tests run twice — once against `_shared/ai.ts`, once against `ai-provider-core` — with output equivalence asserted.

### 4. Mock-AI E2E harness (closes the D0 AI-E2E gap)

- **Playwright suite extended** with a sandboxed AI key (or mock edge) covering: voice note → transcript → extract → items visible; chat turn → answer + saved fact; family invite → join → shared item visible.
- **Execution:** runs on preview deploys, not on every PR (cost/time); **blocks release**.
- **Acceptance:** the D0 AI-E2E gap is closed when these journeys are green on staging.

### 5. RLS behavioral tests

- Extend `supabase/tests/authz-behavioral.mjs` with per-table scenario matrices for the 8 untested-semantics tables (`borrows`, `shopping_lists`, `space_tabs`, `profiles` peers, `chat_sessions`, `device_tokens`, `trash_bin`, vault tables): owner read/write, member read/denied-write, non-member denied, second-tenant denied, service_role allowed.
- Priority: `vault_*` → `trash_bin` → `device_tokens` → `chat_sessions` → rest.
- Each scenario asserts exact denial: no rows returned AND no error leakage.

### 6. Contract tests

Every edge function in the API contract list gets a contract test (inputs → outputs → error codes) run in CI against deployed preview functions. Breaking contract changes require a versioned function (`chat-v2`) — the contract test suite pins the old shape until the minimum supported app version passes.

### 7. CI/CD pipeline

**Keep the 9 jobs:** `ci`, `secret-scan`, `vuln-scan`, `rls-audit`, `auth-gates`, `e2e-smoke`, `e2e-auth`, `standards`, `provenance`.

**Add:**
- `edge-integration` — mock-provider handler suite (§3)
- `contract-tests` — preview contract suite (§6)
- `benchmark-smoke` — seeded EXPLAIN ANALYZE assertions (graduates `ENGINEERING_STANDARDS.md` §7 budgets from guidelines to CI assertions once the harness exists, D1)

**Deployment pipeline:** `preview → staging → prod`. Every PR gets a preview Supabase project (migrations applied, seeded fixture). Staging mirrors prod config (RLS, crons active, sandboxed AI keys). Prod deploys are owner-approved, migration-gated (additive-only), with automatic rollback on uptime-probe failure.

---

## PART B — Per-stage acceptance gates (merged from roadmap §2)

Every stage D1–D8 inherits the ENGINEERING_STANDARDS batch lifecycle: **implement → test → independent review → exact-head CI → Draft PR**. The agent never merges. Each stage carries five gate sections:

### Gate framework (applies to every stage)

1. **Test / acceptance gates** — the concrete behavioral assertions that must pass (see per-stage list below).
2. **Independent review requirements** — a reviewer who did not implement the work re-verifies the stage's claims against the spec text.
3. **Recovery / rollback plan** — migrations are additive; every stage defines how to roll back its changes without data loss.
4. **Draft PR strategy** — stages decompose into 3–6-task batches, each ending in exactly one Draft PR; a stage with >6 tasks ships multiple Draft PRs in dependency order; no PR stacks on an unreviewed or red PR.
5. **Exit criteria** — numbered, checkable conditions; the stage is not done until all are met.

### Per-stage gates summary

| Stage | Test / acceptance gates | Independent review | Exit criteria (headline) |
|---|---|---|---|
| **D1** — P0 Data Protection | Facts survive >90d idle and >200 facts/user; write-path `pruneFacts` no longer deletes; `forget_fact` with common token deletes nothing without confirmation; trash restore within 30d; downgrade preserves all; static tripwire: zero DELETE in `memory-consolidate` | Memory-retention specialist re-verifies cascade map + 3 redesigned paths vs decisions #1/#7; second reviewer checks quota mechanics can't be weaponized into silent deletion | Zero destructive memory-deletion paths in code (static + behavioral) |
| **D2** — P0 Security | Auth-gates tripwire extended to `route`/`classify`; anon-key AI calls rejected/rate-limited; photo-escalation repro fails (chain closed); per-user AI spend cap enforced; constant-time admin compare; invite/approval races closed under concurrency tests | Security reviewer (not the implementer) re-verifies each P0 finding's closing evidence | Photo chain closed; `route`/`classify` gated; spend cap live |
| **D3** — Reliability & Perf | Benchmark numbers recorded (seeded EXPLAIN ANALYZE); janitor dry-run counts match; Sentry + uptime + alerts live; offline outbox sync tests; conflict merge candidates surface | Performance reviewer validates benchmark methodology + numbers | Baseline benchmarks published; janitor proven safe on staging |
| **D4** — Commercial & Legal | Design-review gates (no prod to test against): Stripe design approved; entitlement matrix reviewed; Terms/Privacy/18+ reviewed by counsel/owner; vault gate still off (verified by test); dead commercial UI cleaned | Billing-architecture review; legal sign-off (counsel/owner) | Stripe design approved; legal docs signed off; entitlement matrix complete |
| **D5** — Web Product & UX | Lighthouse thresholds (performance/a11y/SEO) green; screen-reader pass signed off; RTL/LTR layout verified; PWA installable; deep links resolve | a11y review by tester using keyboard + screen reader | Lighthouse green; a11y pass signed |
| **D6** — AI Product & Search | AI-E2E harness green covering D0 gaps; search latency p95 within budget on seeded data; mock-provider equivalence holds | AI-behavior reviewer checks harness fidelity vs production behavior | Harness green; search targets met |
| **D7** — App Factory Integration | Regression suite (D6 harness) green before AND after each ADOPT; three #9 gates documented with evidence per gate; vault-crypto test-first gate | Factory-side reviewer confirms ADOPT correctness | All three #9 gates evidenced for ai-provider-core |
| **D8** — Launch Readiness | DR drill actually executed (not tabletop) with recorded RTO/RPO; runbook + status page live; launch-gate evidence sheet complete (every P0/P1 finding → closing PR/SHA/test); adversarial review | Fresh-eyes reviewer attempts to poke holes in the launch-gate sheet | DR drill executed; launch-gate sheet fully evidenced; owner-action items closed |

### Launch-gate sign-off sheet (D8)

A single sheet mapping every P0/P1 D0 finding to its closing evidence (PR, SHA, test). The launch gate itself is the final acceptance: no launch without the sheet fully evidenced and owner-signed.

---

## PART C — Traceability

| Test layer | Requirement source | Stage introduced | CI job |
|---|---|---|---|
| Unit | §2 | D1 | `ci` (extended) |
| Edge handler + mock AI | §3 | D1–D2 | `edge-integration` (new) |
| Mock-AI E2E | §4 | D6 (harness), release-blocking | preview deploys |
| RLS behavioral | §5 | D2 | `rls-audit` (extended) |
| Contract | §6 | D1–D2 | `contract-tests` (new) |
| Benchmark smoke | Perf targets | D3 | `benchmark-smoke` (new) |
| Per-stage gates | Part B | D1–D8 | stage exit criteria |

## Open decisions

Coverage target % for `packages/edge-shared` (proposed ≥80% on trust-boundary modules) · mock-provider fidelity bar (who signs off the mock matches production) · benchmark-smoke assertion thresholds (set after first D3 run) · E2E AI journey cost budget for preview runs.
