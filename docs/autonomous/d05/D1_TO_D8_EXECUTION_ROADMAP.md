# D1–D8 Execution Roadmap

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-07-roadmap.md` (authoritative) · `workstream-INDEX.md`
**Status:** PLANNING ONLY. No D1 execution authorized. Owner approval required before D1 begins.

## 0. Authority envelope

The 9 owner decisions (2026-10-12) authorize **product planning only**. They do not authorize: production migrations, deployments, billing activation, or application-code changes on main. Owner approval is required for: merges, prod migrations, deploys, billing activation, and material product decisions (final quota numbers, prices).

Every stage inherits the ENGINEERING_STANDARDS batch lifecycle: implement → test → independent review → exact-head CI → Draft PR. The agent never merges.

**Staging authority note:** WS7 owns staging. One cross-workstream contradiction was resolved during synthesis (C1): WS1 grouped Stripe/billing under D3; WS7 places it in D4. **D4 wins** — billing design requires D2's fail-closed entitlements and D1's quota mechanics as prerequisites.

## 1. Staging principles

1. **Data protection before everything (P0 first).** D1 resolves memory-contract violations first — every later stage reasons about saved memories as durable objects.
2. **Security before commercial.** D2 hardens breach/abuse vectors before D4 designs billing — charging users while photos are exfiltratable is a liability event.
3. **Fail-closed foundations before entitlements.** D2's spend cap + fail-closed semantics are prerequisites for D4's Stripe/entitlement design.
4. **Reliability before scale-out features.** D3 (indexes, janitor, observability, offline) lands before D5/D6 product work.
5. **Design-only for irreversible surfaces.** Indexes/janitors, Stripe, vault-crypto ADAPT are design + test in their stages; production execution needs separate owner approval.
6. **Batch sizing.** Each stage decomposes into governed batches of 3–6 tasks, each ending in one Draft PR with independent review + exact-head CI (9/9 green).
7. **Legal is P0 but parallel.** Terms/Privacy/18+ enforcement (D4) have no code dependency on D1–D3 and run in parallel.

---

## 2. Stage definitions

### D1 — P0 Data Protection (decisions #1, #2, #6, #7)

**Scope.** Resolve all memory-contract violations: no auto-deletion by age, plan downgrade, or quota overflow. Redesign three destructive code paths; keep 30-day trash; design quota *mechanics* (block-new-saves) without numeric values.

**Deliverables:** `memory-consolidate` redesigned (decay removed; non-destructive maintenance design); `pruneFacts` redesigned (cap → block-new-save / user choice, never silent delete); `forget_fact` redesigned (exact/mkey match or confirm-listing; trash/undo routing); trash 30-day enforced; quota mechanics spec + evidence-based numeric *options* (no final numbers).

**Prerequisites:** D0.5 spec approved + merged; decisions #1–9 detailed designs reviewed; scratch Supabase project for destructive-path repro.

**Tasks:** T-D1-1 remove 90-day hard delete (`memory-consolidate/index.ts:128-155`) + guard assertion; T-D1-2 non-destructive maintenance design; T-D1-3 `pruneFacts` redesign (`_shared/memory.ts:221-237`); T-D1-4 `forget_fact` redesign (`chat/index.ts:329-343`); T-D1-5 trash 30-day enforcement + regression test; T-D1-6 cascade-map verification; T-D1-7 quota mechanics spec + numeric options.

**Security:** threat-model new delete paths for prompt-injection-driven deletion; all deletes audited.

**Test gates:** facts survive >90d idle and >200/user; write-path pruneFacts no longer deletes; forget_fact with common token deletes nothing without confirmation; trash restore <30d; downgrade preserves; static tripwire: zero DELETE in memory-consolidate.

**Review:** memory-retention specialist re-verifies cascade map + three redesigned paths vs decisions #1/#7; second reviewer checks quota mechanics can't become silent deletion.

**Recovery:** migrations additive (new columns/flags); rollback = revert function deploys; nothing destructive runs during window.

**PR strategy:** one Draft PR (`d1/data-protection`); split order if needed: decay removal first, then pruneFacts/forget_fact, then trash/quota.

**Exit:** (1) zero destructive memory-deletion paths (static + behavioral proof); (2) independent review sign-off on #1/#7; (3) CI 9/9; (4) Draft PR owner-mergeable; (5) quota options documented, numbers unfinalized.

### D2 — P0 Security Hardening

**Scope.** Close confirmed breach/abuse vectors; harden auth-adjacent paths. No feature work.

**Deliverables:** `photo_url` server-side validation + `can_read_photo` hardening (F-SEC-01); `route`/`classify` gated — JWT + rate limiter (F-SEC-02); per-user daily AI spend cap via `ai_events` (fail-closed; F-SEC-03); constant-time ADMIN_TOKEN compare (F-SEC-04); SELECT FOR UPDATE on approval/invite races + join-family entropy/rate-limit (F-SEC-05); `report-error` sanitization (F-SEC-07); Groq exponential backoff (F-SEC-08); `eval_mode` audit logging (F-SEC-06).

**Prerequisites:** D1 deletion-safety primitives (trash/undo); scratch-project photo-escalation repro before fixing.

**Tasks:** T-D2-1 scratch repro of photo escalation (evidence); T-D2-2 photo fix + repro re-run; T-D2-3 gate route/classify + fix false tripwire comment; T-D2-4 spend cap (fail-closed); T-D2-5 constant-time compare + races; T-D2-6 sanitization + backoff + eval_mode audit.

**Security:** each fix ships threat-model note + negative test; photo fix verified by the same repro chain.

**Test gates:** auth-gates tripwire extended; repro scripts must fail post-fix; spend-cap fail-closed test; race tests.

**Review:** security reviewer (not implementer) re-runs photo repro + AI-spend probe on patched branch.

**Recovery:** function-code + additive migrations; rollback = redeploy previous versions; spend-cap kill-switch env var.

**PR strategy:** PR-A (T-D2-1–T-D2-4: photo + oracle + cap); PR-B (T-D2-5–T-D2-6: hardening). PR-B merges only after PR-A owner-merged.

**Exit:** (1) photo chain closed; (2) route/classify reject unauthenticated; (3) spend cap enforced + fail-closed; (4) security review sign-off; (5) CI 9/9 per PR.

### D3 — Reliability & Performance (P1)

**Scope.** Measurable, survivable under load; observability foundation.

**Deliverables:** index set — pg_trgm+GIN, `items.note_id`, `(space_id, kind)` (decision #8, design + test only); telemetry janitor for `rate_limits`/`ai_events`/`ops_events` (design + test; never memory tables); Sentry + uptime + alerts; offline read cache + queue-and-sync; benchmark harness + first measurements vs targets (chat fast-path p95 <1.5s; AI chat p95 <8s; DB p95 <100ms; AI cost <$0.50/MAU/mo); idempotency fixes.

**Prerequisites:** D2 spend cap (benchmarks must not burn uncapped budget); D1 maintenance design (janitor exclusion proof).

**Tasks:** T-D3-1 index design + EXPLAIN ANALYZE at 1k/10k/100k; T-D3-2 janitor (allowlist + memory-table exclusion assertion); T-D3-3 Sentry/uptime/alerts; T-D3-4 offline cache + sync; T-D3-5 benchmark harness + baseline; T-D3-6 idempotency fixes.

**Security:** janitor allowlist test-enforced; Sentry scrubs PII/tokens; no voice/photo payloads in errors.

**Test gates:** baseline numbers published; janitor dry-run proves zero memory-table impact; offline queue sync test.

**Review:** performance reviewer validates methodology + janitor proofs.

**Recovery:** indexes CONCURRENTLY; janitor disabled-by-default + dry-run; offline cache behind flag.

**PR strategy:** PR-A (T-D3-1–T-D3-3); PR-B (T-D3-4–T-D3-6). Benchmarks run against PR-A head.

**Exit:** (1) baseline published; (2) janitor memory-safe in dry-run; (3) Sentry/uptime live on staging; (4) offline test green; (5) review + CI 9/9.

### D4 — Commercial & Legal Design (P2; P0 legal items) — includes T-D4-1 Stripe architecture

**Scope.** Design (not activate) the complete commercial surface. All numeric/pricing/activation decisions stay with the owner.

**Deliverables:** Stripe architecture design (Checkout, idempotent webhooks, portal, proration/dunning design — no live keys); fail-closed entitlement service design; evidence-based quota/price *options* (no final numbers); Terms + Privacy + DPA drafts; 18+ registration enforcement (decision #5); email-change + deactivation flows; dead commercial UI cleanup (seed gate, paywall honesty, trial entry).

**Prerequisites:** D2 fail-closed semantics + spend cap; D1 quota mechanics. Legal drafts need owner/counsel sign-off (not a D1–D3 dependency — runs parallel).

**Tasks:** T-D4-1 Stripe architecture design; T-D4-2 entitlement service design; T-D4-3 quota/price options paper; T-D4-4 legal drafts + 18+ design; T-D4-5 email-change + deactivation; T-D4-6 dead UI cleanup.

**Security:** webhook signature verification design; no client secrets; server-side entitlement checks; Privacy draft matches actual data flows.

**Test gates:** webhook idempotency in harness; entitlement matrix fail-closed unit tests; legal drafts vs actual code data flows.

**Review:** billing-architecture review by someone who shipped Stripe webhooks; legal drafts require owner/counsel (agent review insufficient).

**Recovery:** design-only; T-D4-6 UI fixes revertible. Stripe activation explicitly out of scope.

**PR strategy:** one design-doc PR + one small code PR (T-D4-6). Stripe design doc precedes any future implementation.

**Exit:** (1) Stripe design approved; (2) entitlement fail-closed proven; (3) legal drafts match data flows; (4) quota/price options delivered, unfinalized; (5) vault paid gate still off (decision #4, test-verified).

### D5 — UX & Web (P2)

**Scope.** Usable, discoverable, supportable. Brand visual direction (doc 23 gate) applies when owner approves — D5 architecture must not pre-commit to unapproved visuals.

**Deliverables:** responsive web layout; SEO/PWA/deep-links; a11y pass (WCAG 2.2 AA); in-app support; light design system.

**Prerequisites:** D4 support/legal content; D3 offline cache.

**Tasks:** T-D5-1 responsive layout; T-D5-2 SEO/PWA/deep-links; T-D5-3 a11y pass + screen-reader verification; T-D5-4 in-app support; T-D5-5 design-system foundations.

**Security:** deep links leak no object paths/tokens; contact form rate-limited + sanitized.

**Test gates:** Lighthouse thresholds; screen-reader walkthrough; deep-link e2e.

**Review:** a11y review (keyboard + screen reader); SEO/PWA checklist.

**Recovery:** client-only; revert deploy. Deep-link routes additive.

**PR strategy:** one Draft PR per group (layout; SEO/PWA; a11y+support).

**Exit:** (1) Lighthouse green; (2) screen-reader sign-off; (3) deep links safe; (4) support reachable; (5) CI 9/9.

### D6 — AI / Memory Product (P2–P3)

**Scope.** Non-destructive memory intelligence + search quality + the missing AI test harness.

**Deliverables:** maintenance surfacing UX; trigram/FTS search with ranking (semantic-search provider decision stays open); AI-E2E test harness (chat/extract/learn regression, multi-approval destructive-op tests, forget_fact confirm-listing tests).

**Prerequisites:** D1 (maintenance design + deletion safety); D3 (index baseline + harness).

**Tasks:** T-D6-1 maintenance UX; T-D6-2 FTS/trigram + latency vs baseline; T-D6-3 AI-E2E harness; T-D6-4 prompt-injection regression tests.

**Security:** governed-action model on all new surfaces; maintenance can never auto-delete (decision #7, test-enforced).

**Test gates:** harness green on D1–D3 heads; search p95 in budget; "no maintenance path deletes without user action" test.

**Review:** AI-behavior reviewer covers D0-flagged gaps.

**Recovery:** additive, flagged. Rollback = flag off.

**PR strategy:** harness PR first, features stacked only after harness reviewed (test-before-feature).

**Exit:** (1) harness green covering D0 gaps; (2) search in budget; (3) no auto-delete path (test proof); (4) review + CI 9/9.

### D7 — App Factory Integration (P3, gated ADOPTs)

**Scope.** Adopt proven cores under decision #9 gates; bidirectional convergence.

**Deliverables:** ai-provider-core ADOPT (only after 3 gates); ops-telemetry-core ADOPT; rate-limit bidirectional convergence; governance.ts/edge-auth.ts upstream proposals; vault-crypto ADAPT last (test-first).

**Prerequisites:** registry publication state resolved (F-AF-05, currently UNKNOWN — blocks all ADOPTs); D2 security posture; D3 telemetry.

**Tasks:** T-D7-1 resolve registry auth; T-D7-2 ai-provider gate verification; T-D7-3 ai-provider ADOPT; T-D7-4 ops-telemetry ADOPT; T-D7-5 rate-limit convergence; T-D7-6 vault-crypto ADAPT (last).

**Security:** diff-review of each core's security-relevant code; node:crypto cores edge-only until injection resolved.

**Test gates:** D6 harness green before AND after each ADOPT; 3 gates evidenced.

**Review:** factory-side (no fork) + Mawjood-side (no regression) reviewers.

**Recovery:** one revertible PR per ADOPT; old `_shared` kept one stage as fallback.

**PR strategy:** one Draft PR per ADOPT, in order; never stack unreviewed.

**Exit:** (1) 3 gates evidenced; (2) harness green post-ADOPT; (3) vault-crypto test-first or deferred with owner sign-off; (4) CI 9/9 per PR.

### D8 — Launch Readiness

**Scope.** Prove operability — runbooks, drills, commercial checklist. No new product behavior.

**Deliverables:** incident runbook + status page; DR drill (backup/restore on scratch, RTO/RPO); commercial launch checklist; launch-gate sign-off sheet (finding → closing evidence).

**Prerequisites:** ALL D1–D7 exits met; §6 decisions resolved or launch-block-flagged; Stripe go-live separately authorized.

**Tasks:** T-D8-1 runbook + status page; T-D8-2 DR drill; T-D8-3 launch-gate evidence sheet; T-D8-4 owner-action checklist (redirect URLs, revocations, Stripe go-live, legal sign-off) — tracked, not executed by agent.

**Security:** runbook covers breach response with containment steps; on-call defined.

**Test gates:** DR drill executed (not tabletop); runbook walkthrough with simulated incident.

**Review:** adversarial fresh-eyes review of launch-gate sheet.

**Recovery:** N/A — the launch gate is the rollback (no launch until signed).

**PR strategy:** docs-only Draft PR(s).

**Exit:** (1) DR drill with RTO/RPO; (2) runbook + status page live; (3) gate sheet fully evidenced; (4) owner actions tracked; (5) explicit owner launch authorization — never self-authorized.

---

## 3. Finding → stage traceability (40 IDs)

| Finding ID | D0 source | Severity | Stage | Task(s) |
|---|---|---|---|---|
| F-MEM-01 | memory-consolidate 90-day decay + 200-cap, no tier distinction | CRITICAL | D1 | T-D1-1, T-D1-2, T-D1-3 |
| F-MEM-02 | `forget_fact` substring over-deletion, no trash/undo | HIGH | D1 | T-D1-4 |
| F-MEM-03 | 7-day chat sweep confirmed memory-safe (guard) | INFO | D1 | T-D1-6 |
| F-SEC-01 | cross-user photo read via `photo_url` + `can_read_photo` | HIGH | D2 | T-D2-1, T-D2-2 |
| F-SEC-02 | `route`/`classify` public AI-spend oracle | MEDIUM | D2 | T-D2-3 |
| F-SEC-03 | no per-tier AI quotas, uncapped cost | HIGH | D2 (+D4 options) | T-D2-4, T-D4-3 |
| F-SEC-04 | non-constant-time `ADMIN_TOKEN` compare | MEDIUM | D2 | T-D2-5 |
| F-SEC-05 | approval TOCTOU / join-family race / weak invite codes | LOW–MED | D2 | T-D2-5 |
| F-SEC-06 | `eval_mode` impersonation path | RISK | D2 | T-D2-6 |
| F-SEC-07 | `report-error` stores client free-text | CONFIRMED | D2 | T-D2-6 |
| F-SEC-08 | Groq 429 single fixed retry | CONFIRMED | D2 | T-D2-6 |
| F-PERF-01 | ILIKE search, no trigram/FTS index | HIGH | D3 | T-D3-1 |
| F-PERF-02 | unindexed `items.note_id`, missing `(space_id, kind)` | HIGH | D3 | T-D3-1 |
| F-PERF-03 | no Sentry/analytics/uptime/alerts | MEDIUM | D3 | T-D3-3 |
| F-PERF-04 | no offline support | MEDIUM | D3 | T-D3-4 |
| F-PERF-05 | telemetry tables unbounded, no janitor | MEDIUM | D3 | T-D3-2 |
| F-PERF-06 | no benchmarks; budgets unmeasured | INFO | D3 | T-D3-5 |
| F-PERF-07 | idempotency gaps (duplicate notes, unguarded extract) | MEDIUM | D3 | T-D3-6 |
| F-COM-01 | zero Stripe | CRITICAL | D4 | T-D4-1 |
| F-COM-02 | zero Terms/Privacy/DPA/consent/age-gate | CRITICAL | D4 | T-D4-4 |
| F-COM-03 | zero SEO/PWA/deep-links | CRITICAL | D5 | T-D5-2 |
| F-COM-04 | entitlements partial, fail-open | HIGH | D4 | T-D4-2 |
| F-COM-05 | email-change + deactivation missing | MEDIUM | D4 | T-D4-5 |
| F-COM-06 | no support path | MEDIUM | D5 | T-D5-4 |
| F-COM-07 | a11y ~17 labels, no roles | LOW–MED | D5 | T-D5-3 |
| F-COM-08 | no incident runbook/status page | MEDIUM | D8 | T-D8-1 |
| F-COM-09 | demo-seed button exposed to users | MEDIUM | D4 | T-D4-6 |
| F-COM-10 | subscription UI promises nonexistent payment | MEDIUM | D4 | T-D4-6 |
| F-COM-11 | anon trial has no UI entry | LOW | D4 | T-D4-6 |
| F-COM-12 | redirect-URL allowlist empty (owner action) | MEDIUM | D8 | T-D8-4 |
| F-UX-01 | web = stretched phone UI | LOW | D5 | T-D5-1 |
| F-AF-01 | ai-provider-core ADOPT (conditional, dec. #9) | INFO | D7 | T-D7-2, T-D7-3 |
| F-AF-02 | ops-telemetry-core ADOPT | INFO | D7 | T-D7-4 |
| F-AF-03 | rate-limit bidirectional convergence | INFO | D7 | T-D7-5 |
| F-AF-04 | vault-crypto ADAPT last, 0 tests | RISK | D7 | T-D7-6 |
| F-AF-05 | registry publication state UNKNOWN (blocks ADOPTs) | BLOCKER | D7 | T-D7-1 |
| F-BRAND-01 | no brand identity / visual direction chosen | INFO | D5* | Brand gate (doc 23) |
| F-BRAND-02 | generic SaaS-dashboard risk in current UI | INFO | D5* | Brand gate (doc 23) |
| F-BRAND-03 | no logo/mark, no marketing voice | INFO | D5* | Brand gate (doc 23) |
| F-BRAND-04 | motion/illustration system undefined | INFO | D5* | Brand gate (doc 23) |

*Coverage: every P0 finding has a stage + task. F-MEM-03 is a guard (verify-no-change). Brand findings route through the brand approval gate (owner decision, not an implementation stage).*

---

## 4. Dependency graph summary

- D2 → D1: deletion-safety primitives (trash/undo) for rejected/rolled-back ops.
- D4 → D2: entitlement fail-closed + spend cap before tier design.
- D4 → D1: quota mechanics parameterize the Free/Plus options.
- D3 → D2: spend cap before AI benchmark workloads.
- D3 → D1: maintenance design defines janitor exclusion scope.
- D5 → D4: support/legal content for FAQ + PWA shell.
- D5 → D3: offline cache reused by PWA.
- D6 → D1 + D3: maintenance UX + search measured vs baseline.
- D7 → D2 + D3: cores meet security posture; registry state gates all ADOPTs.
- D8 → D1–D7: launch gate signable only when all exits met.
- Legal (T-D4-4) is dependency-free — runs parallel from D0.5 approval.

## 5. Autonomous execution rules

**Agent may (all stages):** read-only analysis; write code/docs/tests on feature branches; run test suites + linters; scratch-project repros; open Draft PRs; request independent review; report with exact SHAs/run IDs.

**Always needs owner approval:** merges (agent never merges); production migrations; deployments; billing activation; final quota numbers and prices; legal text sign-off (owner/counsel); vault paid-gate flip; prod janitor/index execution; any App Factory ADOPT; launch authorization.

**Per-stage additions:** D1 — no destructive migration even on staging without sign-off; quota numbers stay options. D2 — attack repros on scratch only; auth defaults fail-closed. D3 — indexes on scratch/CI only; janitor disabled + dry-run. D4 — legal text never presented as final; no live Stripe keys. D5 — deep-link URL schemes need owner confirmation. D6 — new AI behaviors need product review before PR. D7 — gate evidence reviewed before PR; registry-auth is owner/infra. D8 — launch gate never self-signed.

---

## Appendix A — Risk register (10 risks)

| # | Risk | Mitigation | Contingency |
|---|---|---|---|
| R-1 | `memory-consolidate` scheduled in prod and deleting NOW (unverifiable in D0) | T-D1-1 first; pre-work: owner checks dashboard crons | Emergency disable via `x-cron-secret` rotation + owner notice |
| R-2 | Photo-escalation exploited before D2 | T-D2-1 repro first; interim storage signing rotation | Breach runbook (D8); audit storage access logs |
| R-3 | AI-spend abuse via public route/classify | D2 PR-A prioritized; interim provider rate limits | Spend alerts; rotate anon key |
| R-4 | Autonomous drift into prod changes | §5 rules; planning-only envelope; routing check | Any unapproved prod mutation = stop + report + revert |
| R-5 | D0.5 "planning" becomes implementation | Exit criteria require owner merge; agent never merges | Parent audits PR contents vs plan |
| R-6 | Stripe design under-scopes webhooks/dunning | Reviewer must have shipped Stripe before | D8 gate blocks go-live until verified |
| R-7 | App Factory ADOPT regression | Three #9 gates + harness green before/after | Revert single-PR ADOPT; fallback in-tree |
| R-8 | Owner-approval bottleneck | Batch manual steps; parallel owner-independent work | D8 tracks owner actions |
| R-9 | Launch without signed legal / weak 18+ gate | T-D4-4 parallel from day one; counsel sign-off | Launch gate fails closed |
| R-10 | Prompt-injection via voice triggers destructive AI action | Governed actions + double approval; T-D6-4 tests | Kill-switch: disable action tools server-side |

---

*End of D1–D8 Execution Roadmap. All 9 owner decisions honored as hard constraints. D1 begins only when the D1 handoff prerequisites are met and the owner explicitly authorizes.*
