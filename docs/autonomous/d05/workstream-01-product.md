# D0.5 — Workstream 01: Product Specification

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** Draft — product planning only; does not authorize implementation, production migration, billing activation, or owner approval.

**Inputs (read, read-only):** `D0_TO_D05_HANDOFF.md`, `FEATURE_STATUS_MATRIX.md`, `CODEBASE_INVENTORY.md`, `COMMERCIAL_READINESS_GAP_ANALYSIS.md`, `MEMORY_RETENTION_AUDIT.md` (all in `docs/autonomous/d0/`).

**Mandatory owner decisions (#1–#9, approved 2026-10-12)** are hard constraints on this document. They are cited per-section as D1…D9. Nothing in this spec violates, sets, or overrides them: quotas are proposed as *options*, never finalized (D2); vault stays ungated until billing+entitlements ready (D4); launch is 18+ only, no child implementation now (D5); trash keeps 30-day recovery (D6); no destructive memory consolidation — non-destructive maintenance only (D7); indexes/janitors are design/test only (D8).

**Feature classification key** (used in §2):
- `EXISTING` — implemented in the repo; evidence cited per feature (path + commit-verified behavior).
- `REMEDIATION` — redesign/fix of an existing feature required by a D0 finding; cites the finding and the mandatory decision(s).
- `NEW` — capability absent from the repo; required for a complete commercial web product.

Traceability rule: every feature carries an ID (`F-<n>`), every journey a `J-<n>` ID, every open question a `Q-<n>` ID. Cross-references: §2 catalog ↔ §3 roles ↔ §4 journeys ↔ §5 questions.

---

## 1. Product vision

**Mawjood (موجود — "found it")** is an AI-powered personal and family memory platform: a durable, commercial-grade web application that remembers what matters to you and your family, answers questions about it in natural language (bilingual Arabic/English), and helps households coordinate — items, tasks, lists, reminders, and private information — from voice or text.

Three product promises, in priority order:
1. **Durability.** A saved memory is never silently deleted — not by age, plan downgrade, or quota overflow (D1). Trust is the product.
2. **Family-first.** Private, Work, and Family spaces with manager/member permissions; coordination tools (tasks, shopping, borrowing, expenses) built for real households.
3. **Reusable architecture.** The platform is designed as a memory core (API-first services, RLS-isolated data) reusable for future iOS/Android native clients and future product lines, with the web app as the first complete commercial surface.

**Scope discipline (not MVP):** this spec covers the full commercial web product — auth, memory, AI, family, vault, tasks/notifications, billing/entitlements, admin/ops, privacy/legal, web-specific (SEO/PWA/deep-links), a11y, i18n. Anything marked NEW is required for launch unless an open question resolves otherwise; nothing is deferred to "v2" by default.

---

## 2. Complete feature catalog

### 2.1 Personal + family memory spaces (F-1.x)

**F-1.1 — Space model (Private / Family / Work)** · `EXISTING`
- *Behavior:* Every account owns a Private space; additional spaces of type `family` or `work` can be created or joined. Content (notes, items, tasks, photos) is scoped to a space via `space_id`; the app never leaks content across spaces.
- *Workflows:* create space; switch space tabs; invite members (F-4.x); delete space (blocked when non-empty, with move-or-trash option per `apps/mobile/src/app/index.tsx` delTab flow).
- *Dependencies:* `spaces`, `space_members`, `space_invites` tables; RLS member policies.
- *Permissions:* any signed-in user may create/join; delete requires manager role; deleting a non-empty space is blocked until contents are moved or trashed (guarded app-side).
- *Data:* `spaces(id, type, name, owner_id, ...)`, `space_members(user_id, space_id, role)`.
- *Failure cases:* double-create race; joining an expired/full invite; orphan content on owner account delete.
- *Acceptance:* spaces isolate content (2-user isolation tested, `tests/e2e/auth-journey.spec.mjs`); no cross-space read via direct API calls.
- *Testing:* behavioral authz tests; e2e isolation journey; race tests under concurrent joins.

**F-1.2 — Space tabs & tab proposals** · `EXISTING` (tabs) / `REMEDIATION` for proposal UX gaps
- *Behavior:* Content is organized into tabs within a space. When the AI notices notes clustering around a person/topic/project it *proposes* a new tab (`tab_proposals` table, migration 0033); creation is user-confirmed — the AI never creates tabs silently. Dedupe window: same space + normalized name, 90 days.
- *Permissions:* any member may create from a proposal; family proposals are visible to the whole family; only the proposing user may dismiss/create their own row.
- *Acceptance:* a tab proposal produces a tappable card; tapping creates exactly one tab; dismissing removes it; no duplicate proposals within 90 days.
- *Testing:* proposal lifecycle tests; dedupe regression tests.

### 2.2 Durable saved memories + memory management (F-2.x)

**F-2.1 — Durable saved memories (no auto-deletion)** · `REMEDIATION` (D1, D7; D0 MEMORY_RETENTION_AUDIT paths A/B)
- *Behavior:* A saved memory (note, extracted fact, item) is never deleted by age, plan downgrade, or quota overflow. Concretely: the 90-day importance-1 hard delete in `supabase/functions/memory-consolidate/index.ts:128-155` is REMOVED; `pruneFacts` in `supabase/functions/_shared/memory.ts:221-237` no longer deletes — when the fact cap is reached it blocks new saves with an explicit user message and offers explicit user actions (delete some, archive, or upgrade). `forget_fact` chat tool (`chat/index.ts:329-343`) is replaced with exact/mkey-scoped matching or a confirm-listing flow, and deletions route through trash with undo.
- *Data requirements:* memory store keeps facts/notes; trash rows retain restorable payload; no destructive nightly job (`memory-consolidate` may be retained only for non-destructive maintenance per F-2.3, or decommissioned).
- *Failure cases:* cap reached during write path — must fail closed (block + explain), never silent-delete; concurrent saves at cap boundary.
- *Acceptance:* (a) facts untouched 90+ days remain readable; (b) exceeding the fact cap returns an explicit "limit reached" state and preserves all existing facts; (c) `forget_fact` deletes only exactly-matched facts and each deletion appears in trash.
- *Testing:* retention regression suite (age, downgrade, overflow scenarios); concurrency tests; audit-log verification of every deletion.

**F-2.2 — Memory facts store with importance metadata** · `EXISTING` (behavior) — safe core retained
- *Behavior:* `memory-learn` extracts facts from transcripts; facts carry importance, space, user; retrieval feeds chat/ask context.
- *REMEDIATION aspect:* consolidation remains but is non-destructive (see F-2.3); the 200-cap deletion behavior is replaced (F-2.1).
- *Acceptance:* facts are retrievable in chat answers; no write path deletes.

**F-2.3 — Non-destructive memory maintenance** · `NEW` (authorized by D7)
- *Behavior:* Non-destructive upkeep only: importance re-scoring, duplicate/similar-fact detection that *surfaces merge candidates to the user* (user confirms; originals preserved in trash), and index maintenance. No scheduled destructive decay; the "nightly consolidation" destructive concept is retired.
- *Permissions:* maintenance never deletes; any merge requires explicit user confirmation.
- *Acceptance:* maintenance run produces zero deletions; candidate list is user-visible; confirmed merges are logged and reversible via trash.
- *Testing:* maintenance-run integration tests asserting deletion count = 0.

**F-2.4 — Memory feedback** · `EXISTING` (migration 0023 `memory_feedback`)
- *Behavior:* user feedback on memory quality (e.g., "wrong memory") captured to improve extraction.
- *Testing:* feedback round-trip tests.

### 2.3 AI conversational assistant (F-3.x)

**F-3.1 — Conversational AI assistant (ReAct, max 5 steps)** · `EXISTING`
- *Behavior:* `chat` edge function (JWT) runs a ReAct agent (≤5 steps) with tool access (memory lookup, save facts, structural actions); chat fast-paths confident statements without model round-trips (`app-brain.ts`, `index.tsx:2504+`). Chat sessions stored in `chat_sessions` — separate retention from memories (7-day client-side sweep deletes sessions only, never memories; D0 verified `index.tsx:1069`).
- *Dependencies:* `_shared/ai.ts` provider layer; OpenAI/Groq keys (server secrets); `ai_events` cost accounting.
- *Permissions:* JWT required; per-user rate limits (`rate_limits`) and (planned) per-user daily AI spend cap (P0 item).
- *Data:* `chat_sessions`, `ai_events` (spend/cost), `ops_events`.
- *Failure cases:* provider outage/slowdown → graceful fallback message; 5-step budget exhausted → summarize-so-far; injection attempts → structural actions require double approval (`admin-ai-governance`).
- *Acceptance:* answers use saved memories; destructive actions never execute without double approval; provider failure degrades to informative message without data loss.
- *Testing:* edge-function integration tests with mock AI provider (D0 gap: zero automated AI E2E — closing this is required); approval-flow tests; injection regression tests.

**F-3.2 — `ask` Q&A over memories** · `EXISTING`
- *Behavior:* `ask` fn answers questions directly over memory store (lighter than full chat loop).
- *Testing:* same mock-provider integration harness as F-3.1.

**F-3.3 — AI governance console** · `EXISTING`
- *Behavior:* `admin-ai-governance` fn + admin page section: review/approve governed structural actions, audit AI events.
- *Permissions:* admin token only; constant-time token compare (P1 hardening).
- *Testing:* approval-flow tests; audit-trail completeness.

**F-3.4 — Route/classify hardening** · `REMEDIATION` (D0 findings M1)
- *Behavior:* `route` and `classify` edge functions are currently PUBLIC; must require JWT + rate limiting.
- *Acceptance:* unauthenticated calls rejected; authenticated abuse throttled.
- *Testing:* auth-gate tests extended to both functions.

**F-3.5 — Per-user daily AI spend cap** · `NEW` (P0; uses existing `ai_events` accounting)
- *Behavior:* enforceable per-user daily AI cost cap with evidence-based default options (D2 — numbers proposed, not finalized); on cap, assistant degrades to non-AI retrieval answers (saved memories still searchable, no new generation).
- *Acceptance:* cap breach blocks generation spend; user sees clear status; spend resets daily.
- *Testing:* cap enforcement tests with mocked costs.

**F-3.6 — ai-provider-core adoption (conditional)** · `NEW` (D9)
- *Behavior:* assessment/integration of the shared provider core in edge functions — allowed only after (a) compatibility verification (Groq + OpenAI paths, GPT-5-mini quirks), (b) security review, (c) regression verification vs existing `_shared/ai.ts` behavior.
- *Testing:* regression suite comparing old/new provider outputs across routing scenarios (`routing.scenarios.ts`).

### 2.4 Voice capture / transcription / extraction (F-4.x)

**F-4.1 — Voice notes + transcription** · `EXISTING`
- *Behavior:* client records audio (VoiceWave UI, `src/lib/engine.ts`); `transcribe` fn (JWT) uses Groq whisper-large-v3-turbo; transcript returned to chat pipeline; **audio is deleted after transcription and `audio_url` nulled** per standing audio policy ("بنمسح الصوت… بنكتفي بالصور").
- *Permissions:* JWT; microphone permission on device.
- *Data:* transient audio object; transcript text persisted in notes.
- *Failure cases:* transcription failure → audio retained transiently, user notified, retry offered; provider error → fallback message.
- *Acceptance:* voice note produces a transcript note; no audio persists post-transcription under normal flow.
- *Testing:* transcribe integration tests (mock Whisper); policy-enforcement test (audio_url null after success).

**F-4.2 — AI extraction (transcript → tasks/items/memories)** · `EXISTING`
- *Behavior:* `extract` fn parses transcript into structured items (tasks, shopping, appointments, things, expenses, borrows, watches) and memory facts; e2e-covered at data level.
- *Acceptance:* "اشتري حليب" → shopping item; "أحمد: اشتري حليب" → task assigned to أحمد; item photo attachments preserved on notes.
- *Testing:* extraction unit tests with fixed transcripts; mock-provider integration tests.

**F-4.3 — Fast-path intents (no agent round-trip)** · `EXISTING`
- *Behavior:* deterministic handlers intercept confident intents client-side: morning digest ("شو عندي اليوم؟", `src/lib/morningDigest.ts`), expenses ("صرفت 40 على الخضرة" / "قديش صرفنا هالشهر؟", `src/lib/expenses.ts`), smart shopping (`smartShopping.ts`), lost-item lookup (`lostItem.ts`), habits (`habits.ts`), watch reminders (`watch.ts`), item timeline (`itemTimeline.ts`), user memory (`userMemory.ts`). Extracted titles match transcript language (standing rule).
- *Acceptance:* each fast path resolves without an LLM call where designed; voice phrasing coverage includes Arabic and English.
- *Testing:* intent-parsing tests per engine; bilingual phrase fixtures.

### 2.5 Notes / photos / documents / attachments (F-5.x)

**F-5.1 — Text notes** · `EXISTING`
- *Behavior:* CRUD on `notes` (space-scoped, RLS-verified); titles default to transcript language; duplicates not piled on re-saves (standing extract rules).
- *Acceptance:* create/edit/delete round-trip; deletion routes to trash (F-9.2).

**F-5.2 — Photos** · `EXISTING` / `REMEDIATION` (photo security H1)
- *Behavior:* attach photos in chat input + preview strip; photos render in bubbles/cards + fullscreen viewer; `notes.photo_url`; extract copies note photos to things. REMEDIATION: close the `photo_url` validation gap and harden `can_read_photo` so storage URLs cannot be abused cross-user (D0 H1, P0).
- *Permissions:* photo access only for users entitled to the note's space.
- *Acceptance:* a user cannot read another user's photo URL; all photo URLs validated server-side.
- *Testing:* cross-user photo access tests (negative); URL validation fuzz tests.

**F-5.3 — Documents & file attachments** · `NEW`
- *Behavior:* attach documents/files to notes and vault items (PDF, images, common office formats); virus/size validation; storage quota counts against tier limits (D2).
- *Acceptance:* attach → stored → listed → downloadable by entitled users; oversize upload rejected with clear message.
- *Testing:* upload pipeline tests; entitlement and quota gating tests.

### 2.6 Family membership / invitations / permissions (F-6.x)

**F-6.1 — Family spaces** · `EXISTING`
- *Behavior:* `spaces` type `family`; member list with roles; churn-safe removal (behavioral test 6).
- *Acceptance:* removing a member removes access, not content (no cascade).

**F-6.2 — Invitations (code, 7-day expiry, 10 uses)** · `EXISTING` / `REMEDIATION` (M5 race)
- *Behavior:* `join-family` redeems invite codes; `space_invites` tracks `used_count`; REMEDIATION: `SELECT FOR UPDATE` on redemption to close the used-count race (P1 item 10).
- *Permissions:* invite creation by family manager; redemption by authenticated user within expiry/use limits.
- *Failure cases:* expired code; exhausted uses; concurrent redemptions beyond the cap.
- *Acceptance:* an invite cannot be redeemed more than 10 times even under concurrency; expired codes rejected.
- *Testing:* redemption race tests.

**F-6.3 — Roles & permissions (manager / member)** · `EXISTING`
- *Behavior:* `space_members.role`; manager: invite, remove members, delete/rename space, manage tabs; member: contribute content, propose tabs.
- *Testing:* role matrix tests (see §3).

**F-6.4 — Family slots (multi-family billing hook)** · `EXISTING` (schema)
- *Behavior:* `profiles.family_slots` (migration 0024): first family free (`=1`); extra family spaces require a new slot, set by Stripe webhook per paid family subscription.
- *Dependencies:* Stripe design (F-8.1); entitlement service (F-8.2).
- *Acceptance:* joining/creating a second family without an available slot is blocked with an upgrade path.
- *Testing:* slot enforcement tests.

### 2.7 Belongings / item management (F-7.x)

**F-7.1 — Things & item kinds** · `EXISTING`
- *Behavior:* `items` table kinds: `task`, `appointment`, `shopping`, `place`, `spec`, `opinion`, `checklist`, `thing`, `expense`, `watch` (migrations through 0022); item timeline (`itemTimeline.ts`); statuses open/done.
- *Acceptance:* item kind coverage in extraction; timeline renders item history.

**F-7.2 — "Where is X?" lookup (أين أشيائي؟)** · `EXISTING`
- *Behavior:* natural-language item lookup with place + price ("وين X؟"); fast-path in chat.
- *Testing:* retrieval accuracy fixtures.

**F-7.3 — Borrowing tracking (مين أخذها؟)** · `EXISTING`
- *Behavior:* `borrows` (migration 0012): lend/return extraction; "🤝 مع أحمد" badge + due date + two-tap "✅ رجع" in things list; return fast-path "رجع X".
- *Acceptance:* lend creates borrow record; return closes it; overdue borrows surface in morning digest.
- *Testing:* lend/return lifecycle tests; RLS on borrows.

**F-7.4 — Prevention watches (رجّعته لمكانه؟)** · `EXISTING`
- *Behavior:* item kind `watch`: "أخذت المفك على الكراج" → after due time, whole space is asked "رجّعته لمكانه؟"; one reminder per watch, re-armed on due-date change (`send_watch_reminders`, pg_cron 15-min, idempotent).
- *Acceptance:* due watch fires exactly once per due-date; re-arm works.

**F-7.5 — Shopping lists** · `EXISTING`
- *Behavior:* per-person lists; bought items move to history; not-found recorded; resolved lists archive; smart shopping engine (`smartShopping.ts`).
- *Testing:* list lifecycle; archive semantics.

**F-7.6 — Household expenses** · `EXISTING`
- *Behavior:* "صرفت 40 على الخضرة" → expense item; "قديش صرفنا هالشهر؟" → monthly totals; `src/lib/expenses.ts`.
- *Testing:* parsing fixtures; aggregation tests.

**F-7.7 — Habits** · `EXISTING` (client engine `habits.ts`)
- *Behavior:* habit tracking surfaced in-app.
- *Testing:* habit streak/CRUD tests. *(Open: define product-visible behavior — Q-12.)*

### 2.8 Vault + private info (F-8.x)

**F-8.1 — Secret vault (tabs, codes, decoy)** · `EXISTING` (schema + `vault-master` fn; 0 automated tests)
- *Behavior:* private vault with bcrypt-hashed access codes and decoy vaults (migrations 0026–0029); secret tabs in the app; `vault-master` fn (JWT) handles vault operations. **Paid gate stays OFF** (D4) — vault available as designed until billing AND entitlement enforcement are both ready and owner-approved; the `LAUNCH:` flip in code must not be activated in D0.5 work.
- *Permissions:* vault contents never readable by other family members; decoy opens a separate plausible vault.
- *Data:* `vaults`, master-code hashes (bcrypt), decoy config; private storage rows.
- *Failure cases:* wrong code (rate-limited attempts); lost code → recovery policy (Q-9).
- *Acceptance:* family members cannot see vault contents via any API path; decoy mode indistinguishable; wrong-code attempts throttled.
- *Testing:* full vault test suite (absent today — required): access control, decoy, brute-force throttling, cross-user isolation.

**F-8.2 — Vault documents** · `NEW`
- *Behavior:* file/document storage inside vault (encrypted at rest); counts toward tier storage quotas (D2).
- *Acceptance:* vault files readable only after vault unlock; deletion via trash.
- *Testing:* encryption + access tests.

### 2.9 Tasks / reminders / notifications (F-9.x)

**F-9.1 — Tasks & agenda** · `EXISTING`
- *Behavior:* assignable tasks ("أحمد: اشتري حليب"); agenda = appointments with date/time; status open/done; timezone-aware (migration 0031).
- *Testing:* assignment, status transitions, timezone rendering.

**F-9.2 — Scheduled reminders (pg_cron 15-min)** · `EXISTING`
- *Behavior:* `send_due_reminders()` (migration 0020) every 15 min; each item reminded once (`reminder_sent_at`); re-armed on due-date change; notifications via `notify` fn → device push (`device_tokens`, `src/lib/push.ts`).
- *Dependencies:* pg_cron configured in production; push provider credentials.
- *Failure cases:* cron not scheduled in prod (D0 verification item); push token expired → silent skip + token cleanup.
- *Acceptance:* due reminder delivered ≤15 min after due time; exactly once per due-date.
- *Testing:* reminder scheduler tests (requires prod cron verification).

**F-9.3 — Morning digest** · `EXISTING`
- *Behavior:* "شو عندي اليوم؟" → one bubble: today's agenda + due/overdue tasks + open shopping lists + open borrows (`morningDigest.ts`).
- *Acceptance:* digest reflects current space state; not saved as a note.
- *Testing:* digest composition tests.

**F-9.4 — Admin broadcast** · `EXISTING` (`admin-broadcast`)
- *Behavior:* ops-initiated notifications to users (announcements, maintenance windows).
- *Permissions:* admin only; scoped targeting.

### 2.10 Memory search / retrieval / organization / discovery (F-10.x)

**F-10.1 — Search** · `EXISTING` / `REMEDIATION` (scale)
- *Behavior:* `%…%` ILIKE search today — works but unscalable. REMEDIATION: pg_trgm index (D8, design/test in D0.5) and/or full-text search; keeps behavior identical, scales reads.
- *Acceptance:* search latency targets in PERFORMANCE doc; results identical-or-better relevance.
- *Testing:* benchmark harness (P1 item 12).

**F-10.2 — Organization (tabs, item kinds, statuses)** · `EXISTING`
- *Behavior:* space tabs, item kinds, open/done statuses, timeline.

**F-10.3 — Discovery (tab proposals, smart surfacing)** · `EXISTING` (proposals) / `NEW` (extended surfacing)
- *Behavior:* tab proposals (F-1.2); future: proactive "you asked about X before" surfacing — non-destructive, user-dismissable.

### 2.11 User profiles + account lifecycle (F-11.x)

**F-11.1 — Registration (magic-link, 18+ gate)** · `EXISTING` / `REMEDIATION` (age gate)
- *Behavior:* magic-link auth (`AuthScreen.tsx`); profiles row created (migration 0010). REMEDIATION: 18+ eligibility enforcement at registration (D5) — date-of-birth self-attestation (method in Q-6); reflected in Terms/Privacy (F-12.1); no child accounts or child-specific features; architecture keeps extensibility for future parent-managed child accounts without implementing them now.
- *Data:* `profiles` (+ DOB attestation fields — NEW, Q-6); `family_slots`.
- *Failure cases:* invalid/expired magic link; under-18 attempt → blocked with clear message.
- *Acceptance:* under-18 registration is rejected; successful registration creates isolated profile.
- *Testing:* age-gate tests; link-expiry tests.

**F-11.2 — Anonymous trial + upgrade** · `EXISTING` (partially dead code)
- *Behavior:* anonymous trial with data preserved on upgrade to permanent account (same id). REMEDIATION: the upgrade banner is dead code (`index.tsx:627`) — restore a working UI entry point.
- *Acceptance:* trial data intact after upgrade; single identity post-upgrade.
- *Testing:* upgrade journey tests (J-1 covers).

**F-11.3 — Profiles** · `EXISTING`
- *Behavior:* display name, language preference, timezone; RLS-verified.

**F-11.4 — Email change** · `NEW`
- *Behavior:* verified email-change flow (confirm old + verify new); sessions preserved.
- *Acceptance:* change requires verification of the new address; old address notified.
- *Testing:* full email-change journey.

**F-11.5 — Account deactivation** · `NEW`
- *Behavior:* temporary deactivation: sign-in blocked, data retained (durable per D1), family memberships suspended (not deleted); reactivation restores state.
- *Acceptance:* deactivated user cannot sign in; data intact on reactivation.
- *Testing:* deactivate/reactivate cycle.

**F-11.6 — Account deletion (cascade)** · `EXISTING`
- *Behavior:* `account-delete` fn; full CASCADE wipe via `auth.users` delete (verified safe, user-initiated only).
- *REMEDIATION:* currently untested — add tests; confirm deletion honors 30-day trash semantics for recoverable content before final wipe (D6 consistency — Q-5).
- *Acceptance:* delete wipes all user data; no orphan rows; family content handled per churn-safe rules (member removal, not content cascade).
- *Testing:* deletion integration tests with row-count assertions.

### 2.12 Subscriptions / billing / entitlements (F-12.x)

**F-12.1 — Stripe subscription design** · `NEW` (D3)
- *Behavior:* complete billing design — Checkout, webhooks, customer portal, plan changes, proration, dunning, invoices. **Design in D0.5; no activation until owner approves design and explicitly authorizes go-live.**
- *Dependencies:* entitlement service (F-12.2); plans/promos admin (`admin-subscribe`, `admin-set-limits`, migration 0032).
- *Acceptance:* design doc covers full lifecycle incl. failed payments (dunning), plan upgrades/downgrades (durable memories preserved per D1), invoice history, tax handling approach (Q-7).
- *Testing:* webhook handler tests with Stripe fixtures; proration math tests.

**F-12.2 — Entitlement service (fail-closed)** · `REMEDIATION` (currently fragmented, fail-open)
- *Behavior:* single source of truth for plan entitlements (AI quotas, storage, family slots, vault access when D4 gate lifts); every gated check fails closed (deny on error/unknown).
- *Acceptance:* no feature accessible without a granted entitlement; unknown plan state → denied.
- *Testing:* fail-closed tests (simulated entitlement-store outage).

**F-12.3 — Free/Plus quota design (evidence-based options)** · `NEW` (D2)
- *Behavior:* explicit creation/storage limits per tier (AI generations, notes/facts, storage bytes, family slots). Numbers are NOT finalized — D0.5 proposes evidence-based *options* (from `ai_events` cost data + storage measurements) for owner approval. Hard rule: exceeding a limit blocks new creation; existing saved memories are never deleted (D1).
- *Acceptance:* options doc with cost basis; enforcement UX spec ("limit reached" states, upgrade path).
- *Testing:* quota enforcement tests run against proposed option sets.

**F-12.4 — Subscription UI** · `REMEDIATION`
- *Behavior:* replace dead "soon" items (which promise payment that doesn't exist) with real plan management once F-12.1 ships; until then, no payment promises in UI.
- *Acceptance:* no UI text promises unavailable billing.

### 2.13 Admin / support / ops tools (F-13.x)

**F-13.1 — Admin console** · `EXISTING`
- *Behavior:* `admin.html` (1,286 lines): user management (`admin-user`), bans, grants, plans, promos (`admin-subscribe`, `admin-set-limits`, migration 0032), stats (`admin-stats`), catalog (`admin-catalog`), broadcast (`admin-broadcast`), AI governance page (`admin-ai-governance`).
- *Permissions:* admin token (constant-time compare hardening, P1); service_role server-side.
- *REMEDIATION:* token handling stays transient; add audit logging on all mutating admin actions.
- *Testing:* admin action audit tests; authz negative tests.

**F-13.2 — Observability (Sentry + uptime + alerts)** · `NEW` (P1)
- *Behavior:* crash reporting, uptime checks, alerting on error-rate/SLO breach.
- *Acceptance:* alert fires on defined SLO breach; crashes symbolicated.

**F-13.3 — Support path** · `NEW`
- *Behavior:* in-app help/FAQ/contact; ticket intake; status communication channel.
- *Acceptance:* user can reach support from the app; SLA documented (Q-8).

**F-13.4 — Ops telemetry janitor (design/test only)** · `REMEDIATION` (D8)
- *Behavior:* retention janitor for `rate_limits`, `ai_events`, `ops_events` — approved for design/testing only, not production execution; absolute rule: never deletes saved memories.
- *Testing:* janitor dry-run tests asserting zero memory-table touches.

**F-13.5 — Database indexes (design/test only)** · `REMEDIATION` (D8)
- *Behavior:* pg_trgm + `items.note_id` + `(space_id, kind)` indexes — design/test in D0.5; production execution pending approval.
- *Testing:* query-plan benchmarks before/after.

**F-13.6 — Incident runbook + status page** · `NEW`
- *Behavior:* outage runbook for on-call; public status page.
- *Acceptance:* runbook covers auth outage, provider outage, data-incident steps.

### 2.14 Privacy / export / deletion / recovery (F-14.x)

**F-14.1 — RLS isolation** · `EXISTING`
- *Behavior:* 27 RLS-enabled tables; zero `USING(true)` (D-1 verified); behavioral tests.
- *Testing:* keep CI-enforced RLS audit + behavioral suite green.

**F-14.2 — GDPR-style export** · `EXISTING` (`account-export`; untested)
- *Behavior:* full user data export (notes, items, facts, photos, tasks, vault metadata as applicable).
- *REMEDIATION:* add tests; define export format + delivery (download link, expiry) — Q-10.
- *Acceptance:* export contains all user-scoped data; machine-readable format.

**F-14.3 — Trash + 30-day recovery** · `EXISTING` (retention default)
- *Behavior:* soft delete to `trash_bin`; 30-day recovery window (D6 — the `trash_retention_days` 30→0 launch flip is NOT approved). `forget_fact` deletions route through trash (F-2.1).
- *Permissions:* only the owning user may restore/permanently delete their trashed rows.
- *Failure cases:* restore of items whose parent space/tab was deleted.
- *Acceptance:* any deleted note/item/fact restorable within 30 days; purge after 30 days deletes only already-trashed rows.
- *Testing:* trash lifecycle tests (delete → restore → expire → purge).

**F-14.4 — Legal docs (Terms / Privacy / consent)** · `NEW` (P0)
- *Behavior:* Terms of Service, Privacy Policy, consent capture (18+ attestation, D5); DPA posture for processors.
- *Acceptance:* legal docs published in-app and on web; consent recorded per user.
- *Testing:* consent-flow tests. *(Legal review is an owner step, not agent-executed.)*

### 2.15 Web / a11y / i18n (F-15.x)

**F-15.1 — Web app (Expo export)** · `EXISTING` (partial)
- *Behavior:* responsive web build; phone-UI stretch fixed.
- *REMEDIATION/NEW:* SEO (meta, sitemap, SSR where feasible), PWA (installable, offline read cache per P1 item 9), deep-links (note/item/share URLs).
- *Acceptance:* installable PWA; shareable deep links open the right content for entitled users.
- *Testing:* Lighthouse budgets; PWA installability checks; deep-link routing tests.

**F-15.2 — Offline read cache + queue-and-sync** · `NEW` (P1)
- *Behavior:* offline read of cached memories; writes queued and synced (no silent loss); conflict policy defined (Q-11).
- *Acceptance:* airplane-mode read of recent memories; queued writes sync on reconnect.
- *Testing:* offline simulation tests.

**F-15.3 — Accessibility** · `REMEDIATION`
- *Behavior:* labels, roles, keyboard navigation, focus management, screen-reader support (today ~17 labels in a 6k-line screen; zero `accessibilityRole`).
- *Acceptance:* a11y audit pass; keyboard-only journey completion; screen-reader smoke tests.

**F-15.4 — i18n (AR/EN)** · `EXISTING`
- *Behavior:* compile-enforced AR/EN parity; drawer language toggle persisted; `ui_lang` follows UI language in chat.
- *Acceptance:* every user-facing string exists in both languages; parity check stays CI-enforced.

**F-15.5 — Error reporting** · `EXISTING` (`report-error` fn)
- *Behavior:* client error reports stored (free-text; JWT). Privacy review: free-text may contain PII — retention/redaction policy required (Q-13).

### 2.16 Public config & remote feature flags (F-16.1) · `EXISTING`
- *Behavior:* `public-config` fn (public by design) serves app config; remote feature flags (`src/lib/remoteConfig.ts`, `scopeGuard.ts`) gate features (e.g., vault flag).
- *Acceptance:* flags toggle features without deploy; flag evaluation logged.
- *Testing:* flag-matrix tests.

---

## 3. User roles & permissions matrix

**Roles:** `ANON` anonymous trial · `FREE` registered free · `PLUS` paid subscriber · `FMGR` family manager · `FMEM` family member (note: FMGR/FMEM are *space-scoped*, orthogonal to FREE/PLUS) · `ADMIN` platform admin.

`—` = not applicable. Vault row reflects D4 (gate off): vault available as designed; entitlement enforcement deferred.

| Feature (§2) | ANON | FREE | PLUS | FMEM | FMGR | ADMIN |
|---|---|---|---|---|---|---|
| Register / magic-link (F-11.1) | — (pre) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anonymous trial (F-11.2) | ✅ | — | — | — | — | — |
| Private space (F-1.1) | ✅ local | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create family/work space (F-1.1) | ❌ | ✅* | ✅ | ✅* | ✅ | ✅ |
| Join via invite (F-6.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invite members (F-6.3) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remove members (F-6.3) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 2nd+ family slot (F-6.4) | ❌ | ❌ | ✅† | ❌ | ❌ | ✅ |
| Voice notes + transcription (F-4.1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI chat / ask (F-3.1/3.2) | ✅‡ | ✅‡ | ✅ | ✅‡ | ✅‡ | ✅ |
| AI extraction (F-4.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fast-path intents (F-4.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Text notes (F-5.1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Photos (F-5.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Documents (F-5.3) | ❌ | ✅† | ✅ | ✅† | ✅† | ✅ |
| Belongings: things/lookup (F-7.1/7.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Borrowing (F-7.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Watches (F-7.4) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shopping lists (F-7.5) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expenses (F-7.6) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tasks/agenda/reminders (F-9.1/9.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Morning digest (F-9.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vault (F-8.1) | ❌ | ✅ (D4) | ✅ | ✅ (D4) | ✅ (D4) | ❌§ |
| Vault documents (F-8.2) | ❌ | ✅† (D4) | ✅ | ✅† (D4) | ✅† (D4) | ❌§ |
| Search (F-10.1) | ✅ own | ✅ own | ✅ | ✅ space | ✅ space | ❌§ |
| Tab proposals create (F-1.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage tabs (delete/rename) | ❌ | ✅ own | ✅ own | ❌ | ✅ | ✅ |
| Memory feedback (F-2.4) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export own data (F-14.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Trash restore own (F-14.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Delete account (F-11.6) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Email change (F-11.4) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deactivate account (F-11.5) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Billing: subscribe/manage (F-12.1) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin console (F-13.1) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin broadcast (F-9.4) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI governance (F-3.3) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Legend / notes:**
- `*` Creating a family space consumes a family slot; first is free (F-6.4).
- `†` Subject to tier quotas/storage limits once D2 options are owner-approved; enforcement fails closed (F-12.2).
- `‡` ANON/FREE AI usage subject to the per-user daily AI spend cap (F-3.5) and rate limits.
- `§` Admin has no user-data access — admin tools operate on accounts/entitlements, never read user memories, vault, or exports. (Privacy boundary; verify in tests.)

**Permission principles:** (1) space membership is the data boundary — no role grants cross-space reads; (2) family membership never grants vault access (D4/privacy); (3) entitlement checks fail closed; (4) destructive actions (member removal, space delete, account delete) require explicit confirmation; (5) admin actions are audit-logged.

---

## 4. User journeys & workflows

### J-1 — Signup → onboarding (covers F-11.1, F-11.2, F-11.3, F-14.4)
1. User opens web app → sees landing (SEO page, F-15.1) with Sign in / Try anonymously.
2. Chooses email sign-in → enters email → magic link sent (expiry stated, e.g. 15 min — Q-4).
3. Clicks link → account created; 18+ attestation presented (D5) with Terms/Privacy acceptance; consent recorded.
4. Profile setup: display name, language (AR/EN), timezone (auto-detected, editable).
5. Onboarding tour: Private space explained; one sample voice-note prompt; family invite entry point.
6. Anonymous path: "Try first" → trial space created locally; upgrade banner (restored, F-11.2) → enters email → same identity, trial data preserved.
- *Acceptance:* under-18 attestation blocks registration; trial upgrade preserves 100% of trial content; consent timestamp stored.

### J-2 — Voice note → memory (covers F-4.1, F-4.2, F-5.1, F-5.2)
1. User taps mic in a space → records ("اشتريت حليب من كارفور") → stops.
2. Transcription runs (Groq Whisper); transcript shown for confirmation/edit.
3. AI extraction creates: note (transcript), shopping/thing/task items as parsed; photo attached if taken.
4. Audio deleted post-transcription per policy; `audio_url` nulled.
5. Memory facts learned (`memory-learn`) for durable recall.
- *Acceptance:* end-to-end voice→structured items ≤ target latency (PERFORMANCE); audio never persists after success; user can correct transcript before extraction commits.
- *Failure path:* transcription fails → note saved as "voice note (transcription pending)" with retry; audio retained only until success.

### J-3 — Ask the AI (covers F-3.1, F-3.2, F-4.3, F-10.1)
1. User asks "وين المفتاح الاحتياطي؟" → fast-path lookup if confident; else chat/ask.
2. Assistant retrieves from memory facts + notes + items (space-scoped) → answers with sources.
3. Structural action proposed ("أحفظ هاي كملاحظة؟") → user confirms → governed action executes (double approval for destructive).
4. "شو عندي اليوم؟" → morning digest bubble (no agent round-trip, not saved as note).
- *Acceptance:* answers cite the memory they came from where feasible; destructive actions never run unconfirmed; injection-prompted destructive action is refused/logged.

### J-4 — Family invite → join (covers F-6.1, F-6.2, F-6.3)
1. Family manager creates invite → code shown (7-day expiry, 10 uses stated).
2. Invitee (signed in) enters code → `join-family` validates (expiry, uses, slot availability) → joins as member.
3. Member sees family space content; manager permissions remain with manager.
4. Member removal by manager → access revoked, content preserved (churn-safe).
- *Acceptance:* 11th concurrent redemption fails; expired code rejected with clear message; removed member's contributions remain.

### J-5 — Create task / reminder (covers F-9.1, F-9.2)
1. Voice or text: "ذكّرني أدفع الفاتورة بكرا الساعة ٥" → task + reminder created with timezone-aware due time; user confirms parsed time.
2. pg_cron fires at due time → push notification delivered (≤15 min granularity).
3. User marks done from notification or app; reminder_sent stamped (once per due-date).
- *Acceptance:* reminder fires exactly once per due-date; timezone changes re-render correctly; missed (offline) reminders deliver on reconnect with "missed" labeling (Q-11).

### J-6 — Vault setup (covers F-8.1, F-8.2; D4)
1. User opens secret vault tab → sets master code (strength requirements, Q-9) → optional decoy vault with separate code.
2. Adds private notes/photos/documents (F-8.2); contents never appear in family spaces, search, digests, or AI answers to other members.
3. Unlock via code (rate-limited attempts); lock on background/timeout (Q-9).
4. "اسأل خزنتك" (vault-aware AI) answers only after unlock, only to the owner.
- *Acceptance:* no API path leaks vault content to family members; wrong-code lockout after N attempts; decoy indistinguishable.

### J-7 — Upgrade to Plus (covers F-12.1, F-12.2, F-12.3, F-12.4)
1. User hits a quota ("limit reached" state, F-12.3) or opens Plans → sees Free vs Plus (evidence-based limits, prices set post-D2 approval).
2. Stripe Checkout → payment → webhook → entitlements updated (family slots, AI quota, storage).
3. Customer portal: change plan, cancel, invoices; downgrade preserves all saved memories (D1) and blocks only new over-quota creation.
4. Dunning: failed payment → grace + retry + clear status; service continues during grace (Q-7).
- *Acceptance:* upgrade/downgrade round-trip preserves every saved memory; failed webhook retried idempotently.

### J-8 — Export / delete account (covers F-14.2, F-11.6, F-14.3)
1. Export: user requests export → job builds machine-readable archive (format per Q-10) → time-limited download link; notified on completion.
2. Delete: user confirms (typed confirmation + consequences listed, incl. family spaces left as member) → 30-day trash window applies to recoverable content (Q-5) → final cascade wipe; confirmation email.
- *Acceptance:* export contains all user-scoped data; post-delete, zero user rows remain (verified by count query); family spaces survive member deletion.

### J-9 — Trash recovery (covers F-14.3)
1. User deletes a note/item/fact → moved to trash with "Undo" bar (client `UndoBar.tsx`).
2. Trash view lists trashed items with days-remaining; restore returns item to original space/tab (or nearest valid parent if parent gone).
3. After 30 days, purge deletes only already-trashed rows.
- *Acceptance:* restore within 30 days is lossless; post-30-day purge touches only trash rows (never live memories).

---

## 5. Open product questions

Anything below is **not owner-approved**. Do not treat listed options as decisions; do not invent answers during D0.5 implementation planning.

**Quotas & pricing (D2 — options only, never finalized here):**
- **Q-1.** What are the evidence-based Free/Plus quota *options* (AI generations/day, notes+facts cap, storage GB, family slots)? Inputs: `ai_events` cost data, storage measurements. Owner approves numbers.
- **Q-2.** Plus price point(s), billing cadence, and regional pricing (MENA vs US)?
- **Q-3.** What happens to *new* creation UX when a quota is hit mid-flow (e.g., mid voice-note)? Block-before-start vs block-at-save?

**Account lifecycle:**
- **Q-4.** Magic-link expiry and resend throttling values?
- **Q-5.** Does account *deletion* apply the 30-day trash window (delayed wipe) or immediate cascade? (D6 says trash keeps 30-day recovery; deletion semantics must be consistent.)
- **Q-6.** 18+ enforcement method (D5): self-attestation checkbox vs DOB entry vs third-party verification? What data is stored, and where (privacy minimization)?
- **Q-7.** Billing edge cases: dunning grace length, tax/VAT handling, refund policy, failed-webhook recovery SLO.

**Vault:**
- **Q-8.** Vault code recovery policy: is there any recovery (loses privacy) or strict "lost code = lost vault" (loses users)? Master-code strength rules; auto-lock timeout; brute-force lockout thresholds.
- **Q-9.** When D4's gate lifts, is vault a Plus-only feature or free with limits? (Decision: gate stays off until billing+entitlements ready — the *tier placement* is still open.)

**Privacy & data:**
- **Q-10.** Export format (JSON + media archive?), delivery method, link expiry, large-export handling.
- **Q-11.** Offline conflict policy: last-write-wins vs field merge vs user-pick? Missed-reminder labeling and catch-up behavior.
- **Q-12.** Habits (`habits.ts` exists): what is the user-visible product behavior — full habit tracker or lightweight streaks?
- **Q-13.** `report-error` free-text retention/redaction policy (PII risk).

**Family & spaces:**
- **Q-14.** Work spaces: same billing as family slots, or separate? Max spaces per user?
- **Q-15.** Space-owner transfer: can a family manager hand off ownership? What happens when the last manager leaves/deactivates?

**Support & ops:**
- **Q-16.** Support SLA and staffing model for launch (in-app contact exists, but who answers?).
- **Q-17.** Status-page provider and incident communication language (AR/EN both?).

**AI & providers (D9):**
- **Q-18.** `ai-provider-core` adoption decision after the three gates (compatibility, security, regression) — who runs the gates and what are the pass thresholds?
- **Q-19.** Prompt-injection residual risk (single-user self-injection): accept, mitigate further, or disclose?

**Web:**
- **Q-20.** PWA offline scope: full read cache vs recent-N? Deep-link auth behavior for logged-out recipients (magic-link handoff vs login wall)?

---

## Traceability summary

| Decision | Sections enforcing it |
|---|---|
| D1 durable memories | F-2.1, F-12.3, J-7, J-8 |
| D2 quotas as options | F-12.3, Q-1/Q-2/Q-3 |
| D3 Stripe in scope | F-12.1, F-6.4, J-7 |
| D4 vault gate off | F-8.1, §3 vault rows, J-6, Q-9 |
| D5 18+ only | F-11.1, F-14.4, J-1, Q-6 |
| D6 trash 30-day | F-14.3, J-8, J-9, Q-5 |
| D7 non-destructive only | F-2.1, F-2.3 |
| D8 design/test only | F-10.1, F-13.4, F-13.5 |
| D9 ai-provider-core conditional | F-3.6, Q-18 |

**Document status:** draft for D0.5 planning. Next: quota options analysis (workstream: billing), entitlement service design, age-gate UX spec, vault threat model.
