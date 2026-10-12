# D0 Coordinator Findings — Consolidated Audit Report

**Mission:** MAWJOOD D0 full project discovery & audit (coordinator synthesis of 7 workstreams)
**Repo:** bfip-platform/Mawjood · **Branch:** `d0/discovery-audit` @ `1c3c57b` ("D-1/D-1.1: engineering governance, CI and security hardening (#2)")
**Date:** 2026-10-12 · **Method:** read-only source audit; no files written to repo by workstreams; no production access
**Workstreams:** 1-codebase-inventory · 2-product/UX · 3-memory-retention · 4-security/architecture · 5-performance/scale · 6-app-factory-reuse · 7-commercial-readiness

> Each finding: [SEVERITY] Title | Evidence (exact paths) | Impact | Recommendation | Verification needed.
> Severities: CRITICAL (blocks launch / active data-loss or breach vector), HIGH (must fix pre-launch), MEDIUM (fix soon), LOW (hygiene), INFO (inventory/context).
> Tags: [CONFIRMED] code-evident · [RISK] plausible, needs repro · [UNTESTED] assumed, not verified.

---

## PART A — HEADLINE FINDINGS (read first)

### Memory contract
- [CRITICAL] **Nightly `memory-consolidate` hard-deletes saved memory facts — 90-day decay + 200-fact cap, no tier distinction** [CONFIRMED] | Evidence: `supabase/functions/memory-consolidate/index.ts:128-155` (importance ≤ 1 facts untouched 90 days → hard delete); `supabase/functions/_shared/memory.ts:221-237` (`pruneFacts(keep=200)` deletes weakest beyond 200/user); no Free/Plus check in either path. The project's own doc already flags the conflict: `docs/autonomous/MAWJOOD_PRODUCT_RECOVERY_AND_MEMORY_PLAN.md:10` | Impact: Directly contradicts the approved durable-memory promise ("saved memories persist for Free and Plus"). Plus users get silently evicted facts at 91 days idle or past 200 facts. | Recommendation: D0 decision required — disable decay + cap-delete (cap should block new saves / require user choice), or make retention tier-aware and disclosed. Do not let this job run in production as-is. | Verification needed: Is the function deployed + scheduled? No in-repo scheduler (no pg_cron entry, no workflow trigger; gate is `x-cron-secret` per `supabase/tests/auth-gates-check.mjs:68`) — impact is conditional on an external cron the audit could not observe. **Note:** WS5 found `pruneFacts` also runs on the write path, so the 200-cap may bite even if the cron never fires.
- [HIGH] **`forget_fact` chat tool over-deletes on substring match, no trash/undo** [CONFIRMED] | Evidence: `supabase/functions/chat/index.ts:329-343` — deletes every fact whose normalized text contains ANY single query token; hard delete via service_role; memory facts (`note_id = NULL`) have no trash path (`packages/voice-engine/src/client.ts:1085-1345`) | Impact: one common word can irreversibly wipe multiple unrelated core memories | Recommendation: exact/mkey-scoped matching or confirm-listing before delete; route through trash/undo | Verification: none (code-evident)

### Security
- [HIGH] **Cross-user private-photo read escalation via unverified `notes.photo_url` + `can_read_photo`** [CONFIRMED] | Evidence: `supabase/functions/chat/index.ts:836-839` stores client-supplied `photo_url` (only `startsWith('https://')` check); `supabase/migrations/0029_private_storage.sql:55-72` — `can_read_photo` grants SELECT on `storage.objects` when any accessible note references the object path; `packages/voice-engine/src/client.ts:698-712` exposes object paths via `getPublicUrl` | Impact: an ex-family member (or anyone retaining a photo URL) references the victim's URL from their own note → `createSignedUrl` yields indefinite reads of the victim's private photo — defeats the 0029 P0-6 fix | Recommendation: validate photo URL storage path starts with `${userId}/` server-side (or store object path only); harden `can_read_photo` to require object-owner/space-context match | Verification: scratch-project repro (victim uploads → attacker references → signed URL succeeds)
- [MEDIUM] **Unauthenticated AI-spend oracle — `route` and `classify` edge functions are public yet client-invoked** [CONFIRMED — corroborated by WS1 + WS4] | Evidence: `supabase/functions/route/index.ts` (no auth check; calls AI provider when regex layer misses); `supabase/functions/classify/index.ts` (no `getUser`); invoked with anon key at `packages/voice-engine/src/client.ts:355,476`; the static tripwire's own comment (`supabase/tests/auth-gates-check.mjs`) claims "not invoked by the client" — false | Impact: anyone with the shipped anon key can burn Groq/OpenAI quota; error path leaks provider text (`route/index.ts` catch slices 120 chars) | Recommendation: require JWT + add both to per-user rate limiter, or route behind `chat` | Verification: confirm deployed `verify_jwt` settings (no config.toml in repo)

### Commercial blockers
- [CRITICAL] **No billing rails — zero Stripe integration** | Evidence: no Stripe SDK/usages anywhere; only "parked" comments (`apps/mobile/src/app/index.tsx:5573`, `supabase/functions/admin-set-limits/index.ts:3`, `docs/ROADMAP.md:32,107,259`) | Impact: cannot charge anyone; plan changes/proration/dunning/invoices all absent; `user_subscriptions` written manually only | Recommendation: Stripe Checkout + billing webhooks + customer portal; owner decision: is Stripe still postponed? | Verification: owner input
- [CRITICAL] **No Terms, Privacy Policy, DPA, consent, or age-gate anywhere in repo** | Evidence: repo-wide filename/content search returned zero legal docs; no consent at signup/onboarding | Impact: public launch and app-store listing legally non-viable; GDPR erasure backend exists with no policy to point to | Recommendation: draft Privacy Policy + Terms before any public launch; document minor-data posture (family product) | Verification: owner/legal input
- [CRITICAL] **No SEO / PWA / deep links on the web product** | Evidence: `apps/mobile/dist/index.html` — title only, zero meta/OG tags; no manifest, no service worker; web router has 2 routes, no shareable invite/item URLs | Impact: undiscoverable, uninstallable, unshareable web product | Verification: none (code-evident)

### Reliability / observability
- [HIGH] **No per-tier AI usage quotas — uncapped cost center** | Evidence: `supabase/functions/_shared/rate-limit.ts` is anti-abuse throttle (20/min, 200/hr) not a plan quota; `admin-set-limits` LIMITS map has no AI-token cap; 200 chats/hr × 5 ReAct steps = up to 1,000 model calls/user/hour; fail-open on store errors | Impact: one abusive/buggy free user can burn unbounded GPT-5-mini + Groq spend | Recommendation: daily per-user AI token budget (token accounting already in `ai_events`), admin-settable cap + spend alerts | Verification: aggregate `ai_events` tokens/user/day on prod to size caps
- [HIGH] **`%…%` ILIKE search with no trigram/FTS index — linear scan per search** | Evidence: `packages/voice-engine/src/client.ts:2195-2228`; `supabase/functions/chat/index.ts:140-145`; zero pg_trgm/GIN indexes in all migrations | Impact: every in-app search and chat search-tool call scans all rows of a space | Recommendation: `pg_trgm` + GIN indexes (or tsvector FTS) | Verification: benchmark at 1k/10k/100k rows
- [HIGH] **Unindexed FK `items.note_id`; no (space_id, kind) composite index** | Evidence: `supabase/migrations/0002_items.sql:6-7`; hot queries at `packages/voice-engine/src/client.ts:655,1058,1108,1139,1191,777` | Impact: item reads degrade to scans-per-space as items accumulate | Recommendation: two indexes (see WS5) | Verification: EXPLAIN ANALYZE on seeded fixture
- [MEDIUM] **No Sentry/crash reporting, no product analytics, no uptime checks, no alerts** | Evidence: zero hits for sentry/posthog/amplitude/mixpanel/crashlytics in `apps/mobile/src`, `package.json`, `app.json`; `ops_events`/`report-error` tables exist but nothing watches them | Impact: blind to real-user crashes, funnel drop-off, downtime | Recommendation: Sentry + minimal privacy-respecting analytics + uptime check | Verification: confirm nobody monitors `ops_events` today
- [MEDIUM] **No offline support** | Evidence: no NetInfo/connectivity detection in `apps/mobile/src`; every write assumes live Supabase | Impact: memory app that needs signal to recall anything — trust-breaker | Recommendation: offline banner + read cache + queue-and-sync

---

## PART B — WORKSTREAM SUMMARIES

### WS1 · Codebase inventory (confidence: HIGH repo-side)
34 migrations (0001–0034, waves verified), 22 edge functions + `_shared/` (12 modules), `apps/mobile` (Expo ~57, `index.tsx` 6,034 lines), `packages/voice-engine` (`client.ts` 2,420 lines — the edge-function caller), `apps/mobile/admin.html` (1,286-line admin console), 9 CI jobs. Classification counts: (a) implemented+verified 7 · (b) insufficiently tested 8 · (c) partial 3 · (d) planned-only 12 · (e) missing 6 · (f) broken/unsafe 1 active + 3 D-1.1 carry-overs.
- [MEDIUM] Supabase Redirect URLs allowlist empty → production magic-link auth blocked pending owner action | Evidence: `docs/autonomous/CAPABILITY_REGISTRY.md` "Real accounts" row | Verification: Supabase dashboard
- [INFO] No `supabase/config.toml` in repo (CI scaffolds it) — deployed function JWT settings unverifiable from repo
- [INFO] `apps/mobile/dist/` untracked/gitignored; `apps/mobile/.env` gitignored mode 600 (URL + anon key only)
- Unresolved: which of 34 migrations are applied to prod (mixed registry evidence); CI status on this branch; "Phase A security probe" results not found in-branch; Oct-9 token / PAT revocation (owner action)

### WS2 · Product/UX audit (confidence: HIGH code-mapped, MEDIUM runtime)
Works: magic-link auth + anon upgrade, notes/voice (transcribe→extract pipeline; audio deleted post-transcription per user policy), family spaces/invites/permissions, AI chat (ReAct, governed structural actions with double approval), tasks/reminders (pg_cron 15-min), watch nudges, borrows, shopping, agenda, morning digest, expenses, export/delete (double-confirm), trash tiers, secret vaults (bcrypt codes, decoy vaults, 7-day master recovery), admin console, AR/EN i18n with compile-enforced parity.
- [MEDIUM] Dev demo-seed button (🧪) exposed to real users in chat header (`index.tsx:3957`) → seeds demo data into real account | Rec: build-gate it
- [MEDIUM] Secret-vault paid-gate is a code comment (`LAUNCH:` flip at `client.ts:1460-1476`) — currently open to all free users | Rec: explicit launch decision
- [MEDIUM] Subscription UI promises payment that doesn't exist (dead "soon" menu item, disabled paywall button) while only manual admin grants work
- [MEDIUM] Anonymous trial has no UI entry → upgrade banner is dead code
- [LOW] a11y: 17 labels in 5.6k-line screen, zero `accessibilityRole`; web = stretched phone UI (no responsive layout); photos only (no document attachments); no in-app support channel; `admin.html` serving path unclear
- Unresolved: dashboard checks (redirect URLs, cron jobs incl. memory-consolidate, secrets, push credentials); no tests at all for edge-handler logic, vault, export/delete, UI rendering

### WS3 · Memory-retention audit (confidence: HIGH code paths)
Per-claim verdicts: (1) durable for Free+Plus — **CONTRADICTED** (90-day decay + 200-cap, both tiers); (2) no age-based auto-deletion — **CONTRADICTED**; (3) downgrade preserves — **CONFIRMED** (no FK path; `plan_id` ON DELETE RESTRICT); (4) quotas restrict creation only — **CONTRADICTED** for memory quota (pruneFacts deletes); creation-time quotas (vault cap, tab limits, family slots) correctly block-only; (5) view/edit/export/delete own — **CONFIRMED** (caveat: forget_fact over-deletion); (6) chat retention separate — **CONFIRMED** (distinct tables/paths); (7) 7-day chat sweep never touches memories — **CONFIRMED** (`app/index.tsx:1069` deletes only `chat_sessions`).
Cascade map: `auth.users` delete → full CASCADE wipe (only via user-requested `account-delete`); `spaces` delete → cascades notes/items (app guards: only custom non-empty-blocked spaces); `space_members` removal → **no cascade** (churn-safe, confirmed); billing tables → user data: **no cascades**; trash purge only deletes already-trashed expired rows (safe). Behavioral test step 6 over-claims churn safety (tests grants-row churn only, not consolidate decay).
Unresolved: live schedule/deployment of memory-consolidate (determines active incident vs dormant code); intended Plus memory quota (none exists); launch flip of `trash_retention_days` default 30→0.

### WS4 · Security & architecture (confidence: HIGH code-evident)
Beyond Part A: RLS enabled on all 27 public tables, zero `USING (true)` policies, 13 zero-policy tables = documented deny-by-default allowlist; service_role confined to edge functions via `Deno.env` (zero client usage); secrets clean in working tree (gitleaks present); file/audio buckets private since 0029 (modulo the photo-escalation finding); prompt-injection residual is single-user self-injection, mitigated for destructive ops by multi-approval + server-side re-checks; `{ error }` envelope convention followed; audit-baseline accepts 2 advisories (braces, node-forge, review-by 2027-01-10, fail-closed gate).
- [MEDIUM] Non-constant-time `ADMIN_TOKEN` compare on admin fns (own `edge-auth.ts` uses constant-time) [CONFIRMED]
- [MEDIUM] `eval_mode` user-impersonation path in chat (`index.ts:852-856`) — INTERNAL_FN_SECRET leak = full impersonation [RISK]
- [LOW] `toolExecuteAction` approval→execute TOCTOU (no row lock) [RISK]; `join-family` used_count check-then-increment race [RISK]; `report-error` stores client free-text despite "never user content" header [CONFIRMED]; invite codes ~29.6 bits, no rate limit on join-family [RISK]; Groq 429 "backoff" is a single fixed 1.5s retry, not exponential [CONFIRMED]
- RLS behavioral coverage gap: borrows, shopping_lists, space_tabs, profiles-peers, chat_sessions, device_tokens, trash_bin, vault tables rely on static audit only [UNTESTED semantics]
- Unresolved: prod secret strength/rotation; per-function `verify_jwt` deploy settings; deployed-source drift; fresh `npm audit` (sandbox-blocked); APP_BRAIN prompt sensitivity

### WS5 · Performance & scalability (confidence: HIGH code-evidence, MEDIUM impact magnitudes)
Beyond Part A: one chat turn = ~10–14 DB round-trips + up to 5 sequential model calls, no AI-result caching (only in-memory remoteConfig/signedUrlCache); telemetry tables (`rate_limits`, `ai_events`, `ops_events`) grow unbounded, no janitor; `memory-consolidate` documented "nightly" but has no schedule/callers (quality decay if never runs; unbudgeted AI cost if scheduled); realtime fan-out refetches whole lists per change; pg_cron reminder scans re-scan growing candidate set; storage posture good (client-side JPEG compression, audio deleted) except public-bucket caveat + unbounded signed-URL cache; idempotency gaps (duplicate notes on retry, unguarded extract); tenant isolation relies on RLS + one fail-open vault path (pre-0034 DBs).
**Explicitly NOT benchmarked:** no perf tests exist; ENGINEERING_STANDARDS §7 budgets are review-enforced guidelines ("benchmark harness tracked gap"). No p50/p95 ever measured — no scalability claims are demonstrated.
Proposed targets: chat fast-path p95 < 1.5s; AI chat p95 < 8s; DB hot-query p95 < 100ms; AI cost < $0.50/MAU/mo; zero connection errors. Benchmark plan: (1) DB seed + EXPLAIN ANALYZE at 1k/10k/100k rows; (2) k6 load on chat/extract at 50–100 VUs; (3) AI cost accounting from `ai_events`; (4) connection soak; (5) realtime fan-out test; (6) client bundle/boot budgets.
Unresolved: prod table sizes/plan limits; prod cron existence; provider pricing; push chunking behavior at scale.

### WS6 · App Factory reuse (confidence: MEDIUM-HIGH Mawjood-side, MEDIUM factory-side)
D-1.1 verdicts (ADOPT 2 · ADAPT 7 · DEFER 8 · REJECT 1) survive spot-checks: ai-provider-core→ADOPT (replaces hand-rolled `_shared/ai.ts` 67 lines: Groq/OpenAI paths + GPT-5 quirks); ops-telemetry-core→ADOPT (replaces `_shared/log.ts` 76 lines); ui-core→REJECT confirmed structural (Expo/RN, React-DOM lib unusable). ADAPT→gap mapping verified in-tree (memory, notification-delivery, rate-limit — already partially converged via `_shared/rate-limit.ts` on 8 functions, audit, i18n, data-portability, vault-crypto). Maturity: ai-provider/ops-telemetry mature (reviewed); memory/notification/i18n are Mawjood's own production code (usage = maturity evidence; factory side 0 tests); vault-crypto highest-risk (crypto, 0 tests — test-first gate non-negotiable); rate-limit/audit-storage/data-portability/theme-engine experimental. Blockers still apply: node:crypto in 7 cores (edge-functions-only consumption until injection lands); 0 tests on 5 cores; registry publication state UNKNOWN; Issue #92 open caveat attaches to Stage D reviews. Mawjood→factory candidates: `rate-limit.ts` (Supabase store the core lacks), `governance.ts` (AI-prompt governance, novel), `edge-auth.ts` (trust-boundary helpers).
Prioritized shortlist: 1) ai-provider ADOPT → 2) ops-telemetry ADOPT → 3) rate-limit/notification/i18n/memory ADAPT (bidirectional for rate-limit) → 4) audit/data-portability ADAPT → 5) vault-crypto ADAPT LAST → 6) extract rate-limit-store/governance/edge-auth upstream. Assessment only — no integration performed or authorized.
Unresolved: registry publication state; whether ai-provider-core covers GPT-5-mini/Groq quirks; crypto-injection status of the 7 cores.

### WS7 · Commercial readiness (confidence: HIGH areas 1,2,4,6,10,11,12; MEDIUM 3,5,7,9)
Verdicts: billing MISSING · entitlements PARTIAL (fragmented, fail-open; no AI/storage quotas) · account lifecycle PARTIAL (delete/export present; email-change + deactivation missing) · privacy MISSING · reliability PARTIAL (root boundary only; no offline) · monitoring MISSING · a11y PARTIAL · i18n PRESENT · support PARTIAL (good onboarding; no help/FAQ/contact) · admin PRESENT (best-in-repo: bans, grants, plans, promos, governance) · legal MISSING · web-specific MISSING.
Top-10 gaps: (1) no billing rails (2) no Terms/Privacy/consent (3) no AI cost caps (4) no observability (5) no SEO/PWA/deep-links (6) no offline (7) no support path (8) no email-change/deactivation (9) a11y ~17 labels (10) no product incident runbook/status page (existing doc governs AI agents, not outages).
Unresolved (owner/runtime): is Stripe still postponed? contrast/keyboard/screen-reader pass on live build; browser-compat matrix; is `ops_events` monitored? admin audit-trail immutability; age-gate/children-data posture; whether tab-limit paywall is armed in prod config.

---

## PART C — CROSS-WORKSTREAM CORROBORATIONS & CONTRADICTIONS

1. **Corroborated (2 workstreams):** `route`/`classify` public + client-invoked (WS1 MEDIUM, WS4 MEDIUM/CONFIRMED) — treat as confirmed.
2. **Corroborated:** memory-consolidate scheduling unknown (WS2 MEDIUM, WS3 CRITICAL-conditional, WS5 MEDIUM) — the job likely never runs, BUT `pruneFacts` also runs on the write path (WS5), so the 200-cap is live regardless.
3. **Corroborated:** no observability (WS5 MEDIUM, WS7 MISSING) + ops-telemetry-core ADOPT (WS6) — organizational awareness exists, implementation doesn't.
4. **Corroborated:** Stripe absent / manual grants only (WS1, WS2, WS7).
5. **Contradiction to resolve:** WS3's CRITICAL (consolidate deletes facts) vs the approved durable-memory rules — the product plan doc itself flags the conflict; code at `1c3c57b` still deletes. Owner decision required in D0.
6. **Tension:** WS4's photo-escalation (HIGH) partially re-opens WS1's "0029 fixed P0-6" — the storage hardening is real but bypassable via the chat photo_url path.

---

## PART D — CONFIDENCE LEVELS

- **HIGH:** repo-side inventory, migration waves, edge-function wiring, RLS policy text, memory-retention code paths, commercial gaps with direct source evidence (billing/legal/SEO/PWA), App Factory Mawjood-side gap mapping.
- **MEDIUM:** exploit chains (photo escalation, AI-spend oracle), impact magnitudes (no prod telemetry), factory-side maturity claims (rest on D-1.1 doc; factory snapshot not available), runtime behaviors (cron firing, push delivery, redirects).
- **LOW / UNVERIFIABLE FROM REPO:** production state — applied migrations, secret values/rotation, `verify_jwt` settings, deployed-source drift, redirect allowlist, scheduled crons, table sizes/plan limits, CI status on this branch, fresh `npm audit`, contrast/browser-compat, token/PAT revocation.

---

## PART E — UNRESOLVED ITEMS (consolidated, need owner/dashboard/runtime)

**Owner decisions:** (1) memory-consolidate: disable vs tier-aware redesign vs keep-as-is (blocks any durable-memory claim); (2) intended Plus memory quota (none exists); (3) Stripe: still postponed or in scope?; (4) vault paid-gate LAUNCH flip; (5) age-gate / children's-data posture; (6) `trash_retention_days` 30→0 launch flip; (7) ai-provider-core GPT-5/Groq quirk coverage; (8) schedule memory-consolidate or remove "nightly" claim; (9) approve index additions + retention janitor (repo-modifying, post-D0).
**Dashboard/runtime checks:** Supabase redirect URLs; scheduled crons; secrets present; storage policies applied; `verify_jwt` per function; prod table sizes; `ops_events` monitoring; admin audit-trail immutability; `admin.html` serving path; push credentials; contrast/a11y/browser-compat passes on live build; CI green on `d0/discovery-audit`; fresh `npm audit`; scratch-project repro of photo escalation; token/PAT revocation confirmation.

---

## PART F — SUGGESTED D0.5 PRIORITY INPUTS (not decisions)

P0 (data-loss / breach / launch-blocking): decide memory-consolidate fate; fix photo_url validation + harden `can_read_photo`; gate `route`/`classify` (JWT + rate limit); add per-user daily AI spend cap; draft Terms + Privacy Policy.
P1 (reliability/scale): pg_trgm + missing indexes; retention janitor for telemetry tables; Sentry + uptime + alerts; offline read cache; `SELECT FOR UPDATE` on approval/invite races; constant-time admin-token compare.
P2 (commercial): Stripe design; entitlement service (fail-closed); email-change + deactivation; support path; SEO/PWA/deep-links; a11y pass.
P3 (leverage): ai-provider-core + ops-telemetry-core ADOPT (edge functions); rate-limit convergence; App Factory registry auth prerequisite.

---
*End of coordinator findings. Workstream agents were read-only; no repo files were modified. This file is the coordinator's synthesis — the 10 versioned D0 deliverables are produced separately by the parent agent.*
