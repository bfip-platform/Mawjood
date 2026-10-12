# D0.5 Workstream 7 — Implementation Roadmap D1–D8

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** PLANNING ONLY (per owner decisions 2026-10-12). No D1 execution authorized.
**Inputs:** `D0_TO_D05_HANDOFF.md` · `D0_EXECUTIVE_REPORT.md` · `_COORDINATOR_FINDINGS.md` · `ENGINEERING_STANDARDS.md`

## 0. Authority envelope (read before anything else)

The 9 owner decisions (2026-10-12) authorize **product planning only**. They do **not**
authorize: production migrations, deployments, billing activation, or application-code
changes on main. Owner approval is required for: merges, prod migrations, deploys,
billing activation, and material product decisions (final quota numbers, prices).
This roadmap plans stages D1–D8 as future execution phases; every stage inherits the
ENGINEERING_STANDARDS batch lifecycle: implement → test → independent review →
exact-head CI → Draft PR. The agent never merges.

---

## 1. Staging principles

1. **Data protection before everything (P0 first).** D1 resolves the memory-contract
   violations (F-MEM-01, F-MEM-02) because every later stage — quotas, billing,
   App Factory ADOPTs — reasons about saved memories as durable objects. Building
   quota logic or AI features on a code path that still silently deletes facts would
   cement the data-loss bug into product contracts.
2. **Security before commercial.** D2 hardens breach/abuse vectors (photo escalation,
   public AI-spend oracle, uncapped AI cost) before D4 designs billing, because a
   commercial launch multiplies the blast radius of every open exploit: charging
   users while their photos are exfiltratable is a liability event, not a launch.
3. **Fail-closed foundations before entitlements.** D2's per-user AI spend cap and
   entitlement fail-closed semantics are prerequisites for D4's Stripe/entitlement
   design — you cannot price a tier you cannot enforce.
4. **Reliability before scale-out features.** D3 (indexes, janitor design, observability,
   offline) lands before D5/D6 product work so new features are born measurable and
   the telemetry janitor has data to retain.
5. **Design-only for irreversible surfaces.** Indexes/janitors (decision #8), Stripe
   (decision #3), and vault-crypto ADAPT are design + test in their stages; production
   execution needs separate owner approval. The roadmap never schedules an
   irreversible prod action as a stage's own exit criterion.
6. **Batch sizing for autonomous execution.** Each stage decomposes into governed
   batches of 3–6 implementation tasks, each batch ending in exactly one Draft PR
   with independent review + exact-head CI (9/9 green). A stage with >6 tasks ships
   multiple Draft PRs in dependency order; no PR stacks on an unreviewed or red PR.
7. **Legal is P0 but parallel.** Terms/Privacy/18+ enforcement are launch-blocking
   (F-COM-02) and therefore planned in D4 — legal drafting has no code dependency
   on D1–D3, so it runs in parallel without diluting the P0 technical batches.
   D4's legal deliverables are gated on counsel/owner sign-off, not on D1–D3 exits.

**Adjustment note vs. the suggested allocation:** the D0 handoff's suggested
D1–D8 mapping is adopted with two changes: (a) `route`/`classify` gating and the
AI spend cap move firmly into D2 (security) rather than straddling D1/D2, because
both are abuse vectors, not data-durability issues; (b) the constant-time admin
compare + race fixes move from D3 into D2 as T-D2 items, since they are security
hardening (WS4), leaving D3 purely reliability/performance. Everything else follows
the suggested allocation.

---

## 2. Stage definitions D1–D8

### D1 — P0 Data Protection (decisions #1, #2, #6, #7)

**Exact scope.** Resolve all memory-contract violations so saved memories are
durable as approved: no auto-deletion by age, plan downgrade, or quota overflow.
Redesign the three destructive code paths; keep the 30-day trash recovery; design
creation/storage quota *mechanics* (block-new-saves semantics) without inventing
numeric values.

**Deliverables.**
- `memory-consolidate` redesigned: destructive decay removed; non-destructive
  maintenance design (importance re-scoring, duplicate-candidate surfacing to user)
  per decisions #1/#7.
- `pruneFacts` redesigned: 200-cap becomes block-new-save / explicit-user-choice —
  never silent delete. Tier-aware behavior designed (Free/Plus creation limits as
  options; overflow never deletes existing).
- `forget_fact` redesigned: exact/mkey-scoped matching or confirm-listing before
  delete; deletes route through trash/undo.
- Trash: 30-day retention enforced and launch-safe (no 30→0 flip).
- Quota mechanics spec: creation/storage limit enforcement points, overflow UX,
  evidence-based numeric options (from `ai_events` cost data + storage measurements)
  for owner approval — options only, no finalized numbers.

**Prerequisites / dependencies.** D0.5 spec approved + merged; decisions #1–9
detailed designs reviewed; scratch Supabase project available for destructive-path
repro (never repro destructive behavior against prod data).

**Implementation tasks.**
- T-D1-1: Remove 90-day importance-1 hard delete from `memory-consolidate`
  (`supabase/functions/memory-consolidate/index.ts:128-155`); add guard assertion
  that no delete path remains in the function.
- T-D1-2: Design + implement non-destructive maintenance (importance re-score,
  duplicate candidates surfaced to user, nothing auto-deleted).
- T-D1-3: Redesign `pruneFacts` (`_shared/memory.ts:221-237`): cap → block new
  saves or require explicit user choice; add per-tier creation-limit hooks (options).
- T-D1-4: Redesign `forget_fact` (`chat/index.ts:329-343`): exact/mkey-scoped
  matching; confirm-listing UX; route through trash/undo.
- T-D1-5: Enforce trash 30-day recovery; regression test that purge only deletes
  already-trashed expired rows; verify no launch flag flips retention to zero.
- T-D1-6: Verify cascade map unchanged: Plus→Free preserves (no FK path),
  `space_members` removal no-cascade, 7-day chat sweep touches only `chat_sessions`.
- T-D1-7: Quota mechanics spec + evidence-based numeric options (no final numbers).

**Security requirements.** Threat-model the new user-choice/delete paths for
prompt-injection-driven deletion (multi-approval + server-side re-checks already
mitigate destructive ops — extend to the new confirm-listing path). All deletes
audited.

**Test / acceptance gates.** Behavioral tests: facts survive >90 days idle and
>200 facts/user; write-path `pruneFacts` no longer deletes; `forget_fact` with a
common token deletes nothing without confirmation; trash restore within 30 days;
downgrade simulation preserves all memories. Static tripwire asserting zero
`DELETE` statements in `memory-consolidate`.

**Independent review requirements.** Memory-retention specialist re-verifies the
full cascade map + the three redesigned paths against decisions #1/#7 text;
second reviewer checks quota mechanics can't be weaponized into silent deletion.

**Recovery / rollback plan.** Migrations are additive (new columns/flags, e.g.
`deleted_via`, `deletion_confirmed_at`); no data migration deletes rows. Rollback =
revert function deploys; data written during the window remains intact because
nothing destructive runs. Scratch-project repro before any staging deploy.

**Draft PR strategy.** One Draft PR (`d1/data-protection`) containing T-D1-1–T-D1-7;
if review demands splits, PR order: T-D1-1/T-D1-2 first (decay removal is the
launch blocker), then T-D1-3/T-D1-4, then T-D1-5–T-D1-7.

**Exit criteria.** (1) Zero destructive memory-deletion paths in code (static +
behavioral proof). (2) Independent review sign-off on decisions #1/#7 conformance.
(3) Exact-head CI 9/9 green. (4) Draft PR open, owner-mergeable. (5) Quota options
documented, numbers explicitly unfinalized.

---

### D2 — P0 Security Hardening (WS4 findings)

**Exact scope.** Close the confirmed breach/abuse vectors and harden auth-adjacent
paths. No feature work.

**Deliverables.**
- `photo_url` server-side validation (storage path must start with `${userId}/`
  or store object-path-only) + `can_read_photo` hardened to require
  object-owner/space-context match (F-SEC-01).
- `route` + `classify` gated: JWT required, added to per-user rate limiter
  (F-SEC-02).
- Per-user daily AI spend cap using existing `ai_events` token accounting,
  admin-settable cap + spend alerts (F-SEC-03). Cap *mechanics*; default threshold
  is an owner decision (see §6).
- Constant-time `ADMIN_TOKEN` compare on admin functions (F-SEC-04).
- `SELECT FOR UPDATE` on `toolExecuteAction` approval→execute and `join-family`
  used_count increment; invite-code entropy/rate-limit on `join-family` (F-SEC-05).
- `report-error` stops storing client free-text (F-SEC-07).
- Groq 429 retry becomes exponential backoff (F-SEC-09).
- `eval_mode` impersonation path: require `INTERNAL_FN_SECRET` rotation procedure +
  audit logging of every impersonated call (F-SEC-06).

**Prerequisites / dependencies.** D1's deletion-safety primitives (trash/undo
paths) — several D2 fixes route rejected/rolled-back operations through them.
Scratch-project repro of the photo escalation (Claim B) before fixing, to verify
the fix actually closes the chain.

**Implementation tasks.**
- T-D2-1: Scratch-project repro of cross-user photo read escalation (victim upload
  → attacker reference → signed URL). Record as evidence.
- T-D2-2: Server-side `photo_url` validation + `can_read_photo` hardening; re-run
  repro to confirm closure.
- T-D2-3: Gate `route`/`classify` (JWT + rate limiter); verify anon-key calls now
  401/429; fix the false tripwire comment.
- T-D2-4: Per-user daily AI spend cap (fail-closed on accounting errors — see §5).
- T-D2-5: Constant-time admin-token compare; `SELECT FOR UPDATE` races;
  join-family entropy + rate limit.
- T-D2-6: `report-error` sanitization; Groq exponential backoff; `eval_mode` audit.

**Security requirements.** Each fix ships with a threat-model note + a negative
test (attack that must now fail). Photo fix verified by the same repro chain that
demonstrated the escalation.

**Test / acceptance gates.** Auth-gates tripwire extended to `route`/`classify`;
repro scripts for photo escalation (must fail post-fix); spend-cap test with
fail-closed accounting outage; race tests for approval/invite paths.

**Independent review requirements.** Security reviewer (not the implementer)
re-runs the photo-escalation repro and the AI-spend oracle probe against the
patched branch; signs off that both chains are closed.

**Recovery / rollback plan.** All changes are function-code + migration-additive.
Rollback = redeploy previous function versions; no data migration is destructive.
If the spend cap mis-fires (false positives), kill-switch env var disables
enforcement while keeping accounting.

**Draft PR strategy.** Two Draft PRs in order: PR-A (T-D2-1–T-D2-4: photo + oracle
+ spend cap — the launch blockers); PR-B (T-D2-5–T-D2-6: hardening). PR-B may be
reviewed in parallel but merges only after PR-A is owner-merged.

**Exit criteria.** (1) Photo-escalation chain closed (repro fails). (2) `route`/
`classify` reject unauthenticated callers. (3) Spend cap enforced + fail-closed.
(4) Independent security review sign-off. (5) Exact-head CI 9/9 on each PR head.

---

### D3 — Reliability & Performance (P1)

**Exact scope.** Make the system measurable and survivable under load; lay the
observability foundation D5–D8 will depend on.

**Deliverables.**
- Indexes (decision #8, design + test only): `pg_trgm` + GIN for search,
  `items.note_id` FK index, `(space_id, kind)` composite — benchmarked at
  1k/10k/100k rows via EXPLAIN ANALYZE on seeded fixtures.
- Telemetry retention janitor for `rate_limits`, `ai_events`, `ops_events`
  (design + test only; never touches saved memories; prod execution needs owner
  approval).
- Sentry + uptime checks + alerts wired; `ops_events` actually watched.
- Offline read cache + queue-and-sync; offline banner.
- Benchmark harness implementing the WS5 plan (DB seed/EXPLAIN, k6 on
  chat/extract at 50–100 VUs, AI cost accounting from `ai_events`, connection
  soak, realtime fan-out, client boot budgets) with first measurements against
  the WS5 targets (chat fast-path p95 < 1.5s; AI chat p95 < 8s; DB hot-query
  p95 < 100ms; AI cost < $0.50/MAU/mo; zero connection errors).
- Idempotency fixes: duplicate notes on retry, unguarded extract.

**Prerequisites / dependencies.** D2's spend cap (benchmarks must not burn
uncapped AI budget); D1's non-destructive maintenance design (the janitor must
provably exclude memory tables).

**Implementation tasks.**
- T-D3-1: Index set design + EXPLAIN ANALYZE benchmarks at 1k/10k/100k rows.
- T-D3-2: Telemetry janitor (design + test; allowlist tables only; assertion that
  memory tables are never in scope).
- T-D3-3: Sentry + uptime + alerts; `ops_events` monitoring runbook entry.
- T-D3-4: Offline read cache + queue-and-sync + banner.
- T-D3-5: Benchmark harness + first measurement pass vs WS5 targets.
- T-D3-6: Idempotency fixes (notes retry, extract guard).

**Security requirements.** Janitor allowlist enforced by test (any table outside
`rate_limits`/`ai_events`/`ops_events` fails CI). Sentry configured to scrub PII/
tokens; no voice/photo payloads in error reports.

**Test / acceptance gates.** Benchmark numbers recorded as the performance
baseline; janitor dry-run on fixture proving zero memory-table impact; offline
queue sync test (airplane-mode write → reconnect → single write, no dupes).

**Independent review requirements.** Performance reviewer validates benchmark
methodology (seed realism, VU profile) and confirms janitor exclusion proofs.

**Recovery / rollback plan.** Index creation is `CONCURRENTLY` (no table locks);
janitor ships disabled-by-default with dry-run mode; offline cache is additive
client state — rollback = feature-flag off.

**Draft PR strategy.** Up to two Draft PRs: PR-A (T-D3-1–T-D3-3: DB/perf core);
PR-B (T-D3-4–T-D3-6: offline + harness). Order matters: benchmarks (T-D3-5) run
against PR-A's head.

**Exit criteria.** (1) Baseline benchmark numbers published. (2) Janitor proven
memory-safe in dry-run. (3) Sentry/uptime/alerts live on staging. (4) Offline
queue test green. (5) Independent review + exact-head CI 9/9.

---

### D4 — Commercial & Legal Design (P2; P0 legal items)

**Exact scope.** Design (not activate) the complete commercial surface: billing,
entitlements, account lifecycle, legal docs. All numeric/pricing/activation
decisions stay with the owner (§6).

**Deliverables.**
- Stripe design: Checkout, webhooks (idempotent), customer portal, plan changes,
  proration, dunning design, invoices. No live keys, no activation.
- Entitlement service design: fail-closed; Free/Plus capability matrix; AI/storage
  quota enforcement points wired to D1's quota mechanics and D2's spend cap.
- Evidence-based quota/price *options* (from D1 measurements + `ai_events` cost
  data) — options only.
- Terms of Service + Privacy Policy + DPA drafts; consent flows; 18+ enforcement
  at registration (decision #5); architectural note preserving future
  parent-managed child accounts.
- Email-change + deactivation flows (F-COM-05).
- Dead commercial UI fixed: demo-seed button build-gated (F-COM-09); subscription
  "soon"/disabled paywall either wired to design or removed (F-COM-10); anon-trial
  entry restored or banner removed (F-COM-11).

**Prerequisites / dependencies.** D2's entitlement fail-closed semantics and spend
cap (you cannot design tiers you cannot enforce); D1's quota mechanics. Legal
drafts need owner/counsel sign-off (§6) — not a D1–D3 dependency.

**Implementation tasks.**
- T-D4-1: Stripe architecture design doc (flows, webhook idempotency, portal,
  proration/dunning design).
- T-D4-2: Entitlement service design (fail-closed matrix, enforcement points).
- T-D4-3: Quota/price options paper (evidence-based; no final numbers).
- T-D4-4: Terms + Privacy + DPA drafts; 18+ registration enforcement design.
- T-D4-5: Email-change + deactivation flows.
- T-D4-6: Dead commercial UI cleanup (seed gate, paywall honesty, trial entry).

**Security requirements.** Webhook signature verification design; no secrets in
client; entitlement checks server-side only; PII handling in Privacy draft matches
actual data flows (voice deleted post-transcription, photos kept).

**Test / acceptance gates.** Design-review gates (no prod to test against):
webhook idempotency proven in test harness; entitlement matrix unit-tested
fail-closed (deny on unknown/error); legal drafts reviewed against actual code
data flows.

**Independent review requirements.** Billing-architecture review by someone who
has shipped Stripe webhooks before; legal drafts require owner/counsel sign-off
(agent review is insufficient for legal text).

**Recovery / rollback plan.** Design-only stage: no prod surface changes except
T-D4-6 UI honesty fixes (revertible client changes). Stripe activation is
explicitly out of scope — a separate owner-authorized go-live checklist (D8).

**Draft PR strategy.** One design-doc PR + one small code PR (T-D4-6). The Stripe
design doc PR must precede any future Stripe implementation stage.

**Exit criteria.** (1) Stripe design approved in review. (2) Entitlement matrix
fail-closed proven in tests. (3) Legal drafts exist and match actual data flows.
(4) Quota/price options delivered to owner, numbers unfinalized. (5) Vault paid
gate still off (decision #4) — verified by test.

---

### D5 — UX & Web (P2)

**Exact scope.** Make the product usable, discoverable, and supportable.

**Deliverables.**
- Responsive web layout (no more stretched phone UI) (F-UX-01).
- SEO: meta/OG tags; PWA: manifest + service worker; deep links: shareable
  invite/item URLs (F-COM-03).
- a11y pass: labels, roles, keyboard navigation (from ~17 labels baseline)
  (F-COM-07).
- Support path: in-app help/FAQ/contact (F-COM-06).
- Light design system to stop 6k-line-screen drift.

**Prerequisites / dependencies.** D4's support-path and legal content decisions
(FAQ content, contact channel); D3's offline cache (web PWA leverages it).

**Implementation tasks.**
- T-D5-1: Responsive web layout.
- T-D5-2: SEO/PWA/deep-links.
- T-D5-3: a11y pass (labels/roles/keyboard), verified with screen reader.
- T-D5-4: In-app support (help/FAQ/contact).
- T-D5-5: Design-system foundations.

**Security requirements.** Deep-link URLs must not leak object paths or tokens;
signed URLs never in shareable URLs; contact form rate-limited + sanitized.

**Test / acceptance gates.** Lighthouse (performance/a11y/SEO) thresholds set and
met; screen-reader walkthrough; deep-link e2e (link → correct item, no auth leak).

**Independent review requirements.** a11y review by tester using keyboard +
screen reader; SEO/PWA checklist review.

**Recovery / rollback plan.** Client-only changes; rollback = revert deploy.
Deep-link route additions are additive.

**Draft PR strategy.** One Draft PR per task group (layout; SEO/PWA; a11y+support);
each independently reviewable.

**Exit criteria.** (1) Lighthouse thresholds green. (2) Screen-reader pass signed.
(3) Deep links work without leaking auth. (4) Support path reachable in-app.
(5) Exact-head CI 9/9.

---

### D6 — AI / Memory Product (P2–P3)

**Exact scope.** Non-destructive memory intelligence + search quality + the AI
test harness D0 flagged as missing (zero automated AI coverage).

**Deliverables.**
- Non-destructive maintenance productization (from D1's design): importance
  re-scoring visible to user, duplicate candidates surfaced for user decision.
- Search upgrade: trigram/FTS (from D3's indexes) with relevance ranking;
  semantic-search *provider decision* stays open (§6).
- AI-E2E test harness: chat/extract/memory-learn regression suite (the
  manual-only gap), incl. multi-approval destructive-op tests and forget_fact
  confirm-listing tests.

**Prerequisites / dependencies.** D1 (non-destructive maintenance design + deletion
safety); D3 (index baseline + benchmark harness — search quality is measured
against it).

**Implementation tasks.**
- T-D6-1: Maintenance surfacing UX (re-score visibility, duplicate candidates).
- T-D6-2: FTS/trigram search with ranking; latency measured vs D3 baseline.
- T-D6-3: AI-E2E harness: chat/extract/learn regression + destructive-op
  multi-approval tests.
- T-D6-4: Prompt-injection self-injection regression tests for new paths.

**Security requirements.** New AI surfaces inherit the governed-action model
(double approval for destructive ops); maintenance suggestions can never
auto-delete (decision #7 — test-enforced).

**Test / acceptance gates.** Harness green on the D1–D3 heads; search latency p95
within budget; a test asserting "no maintenance path deletes without explicit user
action" passes.

**Independent review requirements.** AI-behavior reviewer checks the harness
covers the D0-flagged gaps (destructive ops, over-deletion, injection).

**Recovery / rollback plan.** Additive features behind flags; harness is
test-only code. Rollback = flag off / revert.

**Draft PR strategy.** One Draft PR (harness first, then features stacked only
after harness PR is reviewed — test-before-feature ordering).

**Exit criteria.** (1) AI-E2E harness green and covering D0 gaps. (2) Search
meets latency budget. (3) No auto-delete path exists in maintenance code (test
proof). (4) Independent review + exact-head CI 9/9.

---

### D7 — App Factory Integration (P3, gated ADOPTs)

**Exact scope.** Adopt proven App Factory cores under the decision #9 gates;
converge shared infrastructure bidirectionally. Assessment-verified only — no
blind adoption.

**Deliverables.**
- `ai-provider-core` ADOPT (edge functions) — only after the three decision-#9
  gates: (a) compatibility (Groq + OpenAI + GPT-5-mini quirks), (b) security
  review of the core, (c) regression vs `_shared/ai.ts`.
- `ops-telemetry-core` ADOPT (replaces `_shared/log.ts`).
- Rate-limit bidirectional convergence (Mawjood's Supabase `rate-limit-store`
  upstreamed; factory improvements pulled).
- `governance.ts` / `edge-auth.ts` upstream extraction proposals.
- `vault-crypto` ADAPT **last**, test-first gate non-negotiable (0 tests today).

**Prerequisites / dependencies.** Registry publication state resolved (F-AF-05 —
currently UNKNOWN; blocks all ADOPTs). D2 (security posture the cores must meet);
D3 (telemetry the ops core replaces). Issue #92 caveat attaches to Stage D reviews.

**Implementation tasks.**
- T-D7-1: Resolve registry auth/publication state (owner/infra input).
- T-D7-2: ai-provider-core gate verification (compat + security + regression).
- T-D7-3: ai-provider-core ADOPT.
- T-D7-4: ops-telemetry-core ADOPT.
- T-D7-5: Rate-limit bidirectional convergence.
- T-D7-6: vault-crypto ADAPT (test-first; last).

**Security requirements.** Each ADOPT ships a diff-review of the core's security
relevant code (auth, secret handling, crypto); node:crypto cores stay
edge-functions-only until injection status is resolved.

**Test / acceptance gates.** Regression suite (D6 harness) green before AND after
each ADOPT; the three #9 gates documented with evidence per gate.

**Independent review requirements.** Factory-side reviewer confirms the ADOPT
doesn't fork the core (upstream-compatible); Mawjood-side reviewer confirms no
behavior regression.

**Recovery / rollback plan.** Each ADOPT is one revertible commit/PR; the
replaced `_shared` module stays in-tree (deprecated, not deleted) for one stage
as a fallback import.

**Draft PR strategy.** One Draft PR per ADOPT, in T-D7-3→T-D7-6 order; never stack
an unreviewed ADOPT under the next.

**Exit criteria.** (1) All three #9 gates evidenced for ai-provider-core.
(2) Regression harness green post-ADOPT. (3) vault-crypto test-first satisfied or
explicitly deferred with owner sign-off. (4) Exact-head CI 9/9 per PR.

---

### D8 — Launch Readiness

**Exact scope.** Prove the product can be operated and launched — runbooks, drills,
and the commercial checklist. This stage produces no new product behavior.

**Deliverables.**
- Incident runbook + product status page (F-COM-08).
- DR drill: backup/restore rehearsal on scratch; RTO/RPO statements.
- Commercial launch checklist: all P0 closed, legal signed, Stripe go-live
  authorized separately, redirect-URL allowlist set (F-COM-12, owner action),
  token/PAT revocations confirmed (outstanding from D-1.1).
- Launch-gate sign-off sheet mapping every P0/P1 finding to its closing evidence.

**Prerequisites / dependencies.** ALL of D1–D7 exit criteria met; owner decisions
in §6 resolved (or explicitly deferred with a launch-blocking flag); Stripe
go-live authorized as its own decision.

**Implementation tasks.**
- T-D8-1: Incident runbook + status page.
- T-D8-2: DR drill on scratch (backup → restore → verify), RTO/RPO recorded.
- T-D8-3: Launch-gate evidence sheet (finding → closing PR/SHA/test).
- T-D8-4: Owner-action checklist (redirect URLs, revocations, Stripe go-live,
  legal sign-off) — tracked, not executed by agent.

**Security requirements.** Runbook covers breach response (photo-exfiltration,
credential leak, AI-spend spike) with containment steps; on-call rotation defined.

**Test / acceptance gates.** DR drill actually executed (not tabletop);
runbook walkthrough with a simulated incident.

**Independent review requirements.** Fresh-eyes reviewer attempts to poke holes in
the launch-gate sheet (adversarial review).

**Recovery / rollback plan.** N/A (no prod changes); the launch gate itself is the
rollback — launch does not proceed until the sheet is fully signed.

**Draft PR strategy.** Docs-only Draft PR(s); no code.

**Exit criteria.** (1) DR drill executed with recorded RTO/RPO. (2) Runbook +
status page live. (3) Launch-gate sheet fully evidenced. (4) Owner-action items
explicitly tracked. (5) Owner gives explicit launch authorization — the agent
never self-authorizes launch.

---

## 3. Traceability hooks (D0 finding → stage → task)

| Finding ID | D0 source | Severity | Stage | Task(s) |
|---|---|---|---|---|
| F-MEM-01 | memory-consolidate 90-day decay + 200-cap, no tier distinction | CRITICAL | D1 | T-D1-1, T-D1-2, T-D1-3 |
| F-MEM-02 | `forget_fact` substring over-deletion, no trash/undo | HIGH | D1 | T-D1-4 |
| F-MEM-03 | 7-day chat sweep confirmed memory-safe (guard, no change) | INFO | D1 | T-D1-6 |
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

Coverage check: every P0 finding (F-MEM-01/02, F-SEC-01/02/03, F-COM-01/02) has a
stage + task. P1/P2/P3 findings all mapped. F-MEM-03 is a guard (verify-no-change).

---

## 4. Autonomous execution rules per stage

**What the agent may do without asking (all stages):** read-only analysis;
write code/docs/tests on a feature branch; run the full test suite + linters;
execute scratch-project repros; open Draft PRs; request independent review;
report status with exact SHAs and run IDs. Routine in-scope steps per the
autonomy grant — nothing more.

**What always needs owner approval (all stages):** merges (owner merges; agent
never merges); production migrations; deployments; billing activation (Stripe
go-live); final quota numbers and prices; legal text sign-off (Terms/Privacy —
owner/counsel); vault paid-gate flip (decision #4); executing the telemetry
janitor or any index change against production (decision #8 — design/test only);
any App Factory ADOPT (gates in §2-D7); launch authorization (D8).

**Per-stage additions:**
- **D1:** agent may redesign delete paths on-branch; may NOT run any destructive
  migration even on staging without owner sign-off; quota numbers stay options.
- **D2:** agent may run attack repros against scratch only; any change to auth
  enforcement defaults ships fail-closed or not at all.
- **D3:** agent may create indexes on scratch/CI fixtures; may NOT run
  `CREATE INDEX` on prod; janitor ships disabled + dry-run.
- **D4:** agent may draft legal text; agent may NOT present it as final or
  binding; Stripe work stops at design (no live keys in repo/CI).
- **D5:** standard client-work autonomy; deep-link URL schemes need owner
  confirmation (public URL namespace is a product decision).
- **D6:** agent may build the harness; new AI behaviors need product review before
  PR (judgment calls are the owner's).
- **D7:** each ADOPT needs its gate evidence reviewed before the PR is opened;
  registry-auth resolution is owner/infra.
- **D8:** agent may drill on scratch; the launch gate is never self-signed.

---

## 5. Cross-stage dependency graph (textual)

- **D2 needs D1's deletion-safety primitives:** several D2 fixes (rejected photo
  uploads, rolled-back approvals) route through trash/undo; those paths must
  exist and be proven non-destructive first.
- **D4 needs D2's entitlement fail-closed:** tier enforcement (T-D4-2) is built
  on the spend-cap accounting and fail-closed semantics from T-D2-4; designing
  prices before enforcement exists prices a fiction.
- **D4 needs D1's quota mechanics:** the Free/Plus creation-limit options
  (T-D4-3) are parameterized over T-D1-3/T-D1-7's enforcement points.
- **D3 needs D2's spend cap:** benchmarks (T-D3-5) run AI workloads; uncapped
  spend during load tests is an avoidable cost incident.
- **D3 needs D1's maintenance design:** the telemetry janitor's exclusion proof
  (T-D3-2) references D1's definition of which tables hold saved memories.
- **D5 needs D4's support/legal content:** FAQ/contact channel (T-D5-4) and
  legal links in the PWA shell come from T-D4-4/T-D4-6 decisions.
- **D5 needs D3's offline cache:** PWA offline behavior (T-D5-2) reuses the
  queue-and-sync from T-D3-4.
- **D6 needs D1 + D3:** maintenance UX builds on D1's non-destructive design;
  search quality is measured against D3's benchmark baseline.
- **D7 needs D2 + D3:** adopted cores must meet D2's security posture and
  replace D3's telemetry plumbing; registry state (T-D7-1) gates everything.
- **D8 needs all of D1–D7:** the launch-gate sheet is only signable when every
  stage's exit criteria are met; owner decisions in §6 are its remaining inputs.
- **Legal (T-D4-4) is dependency-free** and runs in parallel from D0.5 approval —
  flagged here so it isn't starved by the technical sequence.

---

## 6. Open decisions list (NOT owner-approved — each needs a decider)

| # | Decision | Options | Decider |
|---|---|---|---|
| O-1 | Free tier: numeric creation limits (notes/day, facts total, AI calls/day) | Evidence-based options from D1/D2 measurements; owner picks | Owner |
| O-2 | Plus tier: numeric storage/AI limits | Same as O-1; overflow = block-new (never delete, per #2) | Owner |
| O-3 | Per-user daily AI spend cap default | Conservative default vs measured p99; fail-closed | Owner (+ agent proposes) |
| O-4 | Stripe prices (Free/Plus monthly/annual) | Pricing paper in T-D4-3; owner sets | Owner |
| O-5 | Dunning policy (grace period, retries, suspension) | Lenient (7d) vs strict (3d); design in T-D4-1 | Owner |
| O-6 | Refund/chargeback policy | No-refund vs 14-day; must match Terms draft | Owner (+ counsel) |
| O-7 | Semantic search provider | pg_trgm (free, in-DB) vs pgvector vs external API (cost/latency) | Owner (agent recommends) |
| O-8 | Analytics vendor | Privacy-respecting minimal (self-hosted Plausible/PostHog) vs none | Owner |
| O-9 | Push provider | Expo Push vs FCM/APNs direct; chunking behavior at scale | Owner |
| O-10 | Support SLAs + channel | Email-only vs in-app chat; response-time tiers | Owner |
| O-11 | Sentry plan / error-tracking vendor | Free tier vs paid; data-scrubbing config | Owner |
| O-12 | Uptime monitoring vendor | e.g. Better Stack/Checkly; alert routing | Owner |
| O-13 | Terms/Privacy/DPA final text | Agent drafts; **counsel** must sign off | Counsel + Owner |
| O-14 | Age-verification method for 18+ gate | Self-declaration vs ID check (friction vs assurance) | Owner (+ counsel) |
| O-15 | Vault paid-gate activation timing | Stays off until billing+entitlements ready (dec. #4); owner sets date | Owner |
| O-16 | Redirect-URL allowlist values | Production web origin(s) | Owner (dashboard action) |
| O-17 | Prod cron schedule for non-destructive maintenance | Nightly vs weekly vs on-write-only (dec. #7 forbids destructive) | Owner |
| O-18 | Data-retention policy beyond trash (telemetry, logs) | 30/90/365d per table class; janitor implements | Owner |
| O-19 | Launch markets | US-only vs broader (affects legal/tax) | Owner |
| O-20 | Token/PAT revocation confirmation | Outstanding from D-1.1; verify then close | Owner |

---

## 7. D1 handoff prerequisites (what must be true before D1 starts)

1. **D0.5 spec approved + merged by owner.** D1 executes the spec; starting on an
   unapproved spec risks rework against decisions the owner hasn't ratified.
2. **Decisions #1–9 detailed designs reviewed.** The D0.5 workstreams' detailed
   designs for decay/pruneFacts/forget_fact redesigns, quota mechanics, and the
   non-destructive maintenance model have independent review sign-off.
3. **Test harness ready.** CI baseline green on the D1 base branch; the new
   behavioral tests (90-day survival, >200 facts, forget_fact confirmation,
   trash restore) written and failing-then-passing as the work lands.
4. **Scratch Supabase project provisioned.** Destructive-path repros and
   migration dry-runs never touch prod data; prod migration state documented
   (which of the 34 migrations are applied — currently unresolved per D0).
5. **Routing confirmed.** Per the standing routing rule: the D1 execution prompt
   states its intended scope, branch, and PR plan, and the owner confirms the
   prompt belongs to the executing chat before the first repo mutation.
6. **Kill criteria agreed.** If any T-D1 task cannot meet its exit criteria
   (e.g., a delete path that can't be made non-destructive without a product
   decision), work stops and returns to the owner — the stage is not
   "completed" by weakening the criterion.

---

## 8. Risk register (top 10)

| # | Risk | Mitigation | Contingency |
|---|---|---|---|
| R-1 | `memory-consolidate` is actually scheduled in prod and deleting facts NOW (D0 couldn't verify) | D1 T-D1-1 is the first task; pre-work: owner checks dashboard crons (Part E unresolved) | If confirmed active: emergency disable via `x-cron-secret` rotation + owner notice before D1 completes |
| R-2 | Photo-escalation exploited in the wild before D2 lands | T-D2-1 repro first; interim: owner can rotate storage signing config | Breach runbook (D8) covers notification; audit `storage.objects` access logs if available |
| R-3 | AI-spend abuse via public `route`/`classify` before gating | D2 PR-A prioritized; interim provider-side rate limits/quotas | Spend alerts (T-D2-4) fire; rotate anon key if abuse detected |
| R-4 | Autonomous execution drifts into prod changes (the standing failure mode) | §4 rules per stage; planning-only envelope in §0; routing check in §7.5 | Any prod mutation without approval = immediate stop + owner report; revert |
| R-5 | Scope creep: D0.5 "planning" quietly becomes implementation | Each stage's exit criteria require owner merge; agent never merges | Parent agent audits PR contents vs plan before presenting to owner |
| R-6 | Stripe design under-scopes (webhooks, dunning, proration) → billing incidents at launch | T-D4-1 checklist from WS7 gaps; reviewer must have shipped Stripe before | D8 launch gate blocks go-live until billing checklist is independently verified |
| R-7 | App Factory ADOPT introduces regression (ai-provider quirks) | Three #9 gates + D6 harness green before/after; old `_shared` kept one stage | Revert single-PR ADOPT; fallback import already in-tree |
| R-8 | Owner-approval bottleneck stalls the D1–D8 pipeline | Batch manual steps into one message (standing rule); D8 tracks owner actions | Stages with no owner dependency (legal drafting, harness) proceed in parallel |
| R-9 | Legal exposure: launching without signed Terms/Privacy or with weak 18+ gate | T-D4-4 parallel from day one; counsel sign-off required (O-13) | Launch gate (D8) fails closed: no legal sign-off = no launch |
| R-10 | Prompt-injection via voice memories triggers destructive AI action in new D6 surfaces | Governed-action model + double approval extended to all new paths; regression tests (T-D6-4) | Kill-switch: disable the new surface's action tools server-side without a deploy |

---

*End of WS7 roadmap. Next: D0.5 coordinator assembles the 8 workstream specs; owner
approves the D0.5 package; D1 begins only when §7 prerequisites are met.*
