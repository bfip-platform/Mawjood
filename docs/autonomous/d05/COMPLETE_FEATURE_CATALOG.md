# D0.5 — Complete Feature Catalog

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** Workstream 01 §2 · **Status:** Planning only — does not authorize implementation, production migration, billing activation, or owner approval.

**Classification key:**
- `EXISTING` — implemented in the repo; evidence cited per feature.
- `REMEDIATION` — redesign/fix of an existing feature required by a D0 finding; cites the finding and mandatory decision(s).
- `NEW` — capability absent from the repo; required for a complete commercial web product.

**Traceability:** every feature carries an `F-<n>` ID. Owner decisions cited as "Decision #N". Roadmap stages cited as "Stage D-N" per the WS7 staging authority. **Staging fix:** commercial/billing design items (F-12.x, F-6.4) are staged at **Stage D4** per WS7 — the staging authority for the D1–D8 roadmap.

---

## F-1.x — Personal + family memory spaces

### F-1.1 — Space model (Private / Family / Work) · `EXISTING`
- **Behavior:** Every account owns a Private space; additional spaces of type `family` or `work` can be created or joined. Content (notes, items, tasks, photos) is scoped to a space via `space_id`; the app never leaks content across spaces.
- **Workflows:** create space; switch space tabs; invite members (F-6.x); delete space (blocked when non-empty, with move-or-trash option per `apps/mobile/src/app/index.tsx` delTab flow).
- **Dependencies:** `spaces`, `space_members`, `space_invites` tables; RLS member policies.
- **Permissions:** any signed-in user may create/join; delete requires manager role; deleting a non-empty space is blocked until contents are moved or trashed (guarded app-side).
- **Data requirements:** `spaces(id, type, name, owner_id, ...)`, `space_members(user_id, space_id, role)`.
- **Failure cases:** double-create race; joining an expired/full invite; orphan content on owner account delete.
- **Acceptance criteria:** spaces isolate content (2-user isolation tested, `tests/e2e/auth-journey.spec.mjs`); no cross-space read via direct API calls.
- **Testing requirements:** behavioral authz tests; e2e isolation journey; race tests under concurrent joins.

### F-1.2 — Space tabs & tab proposals · `EXISTING` (tabs) / `REMEDIATION` (proposal UX gaps)
- **Behavior:** Content is organized into tabs within a space. When the AI notices notes clustering around a person/topic/project it *proposes* a new tab (`tab_proposals` table, migration 0033); creation is user-confirmed — the AI never creates tabs silently. Dedupe window: same space + normalized name, 90 days.
- **Workflows:** proposal card appears → user taps to create or dismisses; manual tab creation.
- **Dependencies:** `tab_proposals` table; AI clustering (non-destructive).
- **Permissions:** any member may create from a proposal; family proposals visible to the whole family; only the proposing user may dismiss/create their own row.
- **Data requirements:** `tab_proposals(space_id, normalized_name, proposed_at, status)`.
- **Failure cases:** duplicate proposals within dedupe window; proposal for deleted space.
- **Acceptance criteria:** a tab proposal produces a tappable card; tapping creates exactly one tab; dismissing removes it; no duplicate proposals within 90 days.
- **Testing requirements:** proposal lifecycle tests; dedupe regression tests.

---

## F-2.x — Durable saved memories + memory management

### F-2.1 — Durable saved memories (no auto-deletion) · `REMEDIATION` (Decision #1, #7; D0 MEMORY_RETENTION_AUDIT paths A/B)
- **Behavior:** A saved memory (note, extracted fact, item) is never deleted by age, plan downgrade, or quota overflow. Concretely: the 90-day importance-1 hard delete in `supabase/functions/memory-consolidate/index.ts:128-155` is REMOVED; `pruneFacts` in `supabase/functions/_shared/memory.ts:221-237` no longer deletes — when the fact cap is reached it blocks new saves with an explicit user message and offers explicit user actions (delete some, archive, or upgrade). `forget_fact` chat tool (`chat/index.ts:329-343`) is replaced with exact/mkey-scoped matching or a confirm-listing flow, and deletions route through trash with undo.
- **Workflows:** cap-reached → "limit reached" state → user chooses: delete selected, archive, or upgrade (J-7).
- **Dependencies:** memory store; trash (F-14.3); entitlement service (F-12.2).
- **Permissions:** only the owning user may delete their own memories (via explicit action).
- **Data requirements:** memory store keeps facts/notes; trash rows retain restorable payload; no destructive nightly job (`memory-consolidate` retained only for non-destructive maintenance per F-2.3, or decommissioned).
- **Failure cases:** cap reached during write path — must fail closed (block + explain), never silent-delete; concurrent saves at cap boundary.
- **Acceptance criteria:** (a) facts untouched 90+ days remain readable; (b) exceeding the fact cap returns an explicit "limit reached" state and preserves all existing facts; (c) `forget_fact` deletes only exactly-matched facts and each deletion appears in trash.
- **Testing requirements:** retention regression suite (age, downgrade, overflow scenarios); concurrency tests; audit-log verification of every deletion.

### F-2.2 — Memory facts store with importance metadata · `EXISTING` (behavior retained; remediation aspect per F-2.1/F-2.3)
- **Behavior:** `memory-learn` extracts facts from transcripts; facts carry importance, space, user; retrieval feeds chat/ask context.
- **Workflows:** transcript → extraction → fact rows → retrieval in chat answers.
- **Dependencies:** `items` table (kind=memory); `memory-learn` edge function.
- **Permissions:** space-scoped; RLS-enforced.
- **Data requirements:** `items(id, space_id, kind='memory', meta{importance}, ...)`.
- **Failure cases:** extraction duplicates; importance mis-scoring.
- **Acceptance criteria:** facts are retrievable in chat answers; no write path deletes.
- **Testing requirements:** extraction accuracy fixtures; retrieval relevance tests.

### F-2.3 — Non-destructive memory maintenance · `NEW` (authorized by Decision #7)
- **Behavior:** Non-destructive upkeep only: importance re-scoring, duplicate/similar-fact detection that *surfaces merge candidates to the user* (user confirms; originals preserved in trash), and index maintenance. No scheduled destructive decay; the "nightly consolidation" destructive concept is retired.
- **Workflows:** maintenance run → candidate list → user reviews → confirms merges (reversible via trash).
- **Dependencies:** memory store; trash.
- **Permissions:** maintenance never deletes; any merge requires explicit user confirmation.
- **Data requirements:** candidate pairs with similarity scores; merge audit log.
- **Failure cases:** false-positive duplicates surfaced (user dismisses).
- **Acceptance criteria:** maintenance run produces zero deletions; candidate list is user-visible; confirmed merges are logged and reversible via trash.
- **Testing requirements:** maintenance-run integration tests asserting deletion count = 0.

### F-2.4 — Memory feedback · `EXISTING` (migration 0023 `memory_feedback`)
- **Behavior:** user feedback on memory quality (e.g., "wrong memory") captured to improve extraction.
- **Workflows:** "wrong memory" action → feedback row → reviewed in admin/AI governance.
- **Dependencies:** `memory_feedback` table.
- **Permissions:** any member may submit feedback on memories they can see.
- **Data requirements:** `memory_feedback(item_id, user_id, feedback_type, created_at)`.
- **Failure cases:** feedback on deleted items.
- **Acceptance criteria:** feedback is recorded and visible for review.
- **Testing requirements:** feedback round-trip tests.

---

## F-3.x — AI conversational assistant

### F-3.1 — Conversational AI assistant (ReAct, max 5 steps) · `EXISTING`
- **Behavior:** `chat` edge function (JWT) runs a ReAct agent (≤5 steps) with tool access (memory lookup, save facts, structural actions); chat fast-paths confident statements without model round-trips (`app-brain.ts`, `index.tsx:2504+`). Chat sessions stored in `chat_sessions` — separate retention from memories (7-day client-side sweep deletes sessions only, never memories; D0 verified `index.tsx:1069`).
- **Workflows:** user message → fast-path or agent loop → tool calls → answer with sources (J-3).
- **Dependencies:** `_shared/ai.ts` provider layer; OpenAI/Groq keys (server secrets); `ai_events` cost accounting.
- **Permissions:** JWT required; per-user rate limits (`rate_limits`) and per-user daily AI spend cap (F-3.5, P0).
- **Data requirements:** `chat_sessions`, `ai_events` (spend/cost), `ops_events`.
- **Failure cases:** provider outage/slowdown → graceful fallback message; 5-step budget exhausted → summarize-so-far; injection attempts → structural actions require double approval (`admin-ai-governance`).
- **Acceptance criteria:** answers use saved memories; destructive actions never execute without double approval; provider failure degrades to informative message without data loss.
- **Testing requirements:** edge-function integration tests with mock AI provider (D0 gap: zero automated AI E2E — closing this is required); approval-flow tests; injection regression tests.

### F-3.2 — `ask` Q&A over memories · `EXISTING`
- **Behavior:** `ask` fn answers questions directly over memory store (lighter than full chat loop).
- **Workflows:** question → retrieval → direct answer.
- **Dependencies:** memory store; provider layer.
- **Permissions:** JWT; space-scoped retrieval.
- **Data requirements:** read access to `items`, `notes`.
- **Failure cases:** provider failure → fallback.
- **Acceptance criteria:** answers grounded in stored memories.
- **Testing requirements:** same mock-provider integration harness as F-3.1.

### F-3.3 — AI governance console · `EXISTING`
- **Behavior:** `admin-ai-governance` fn + admin page section: review/approve governed structural actions, audit AI events.
- **Workflows:** governed action proposed → admin reviews → approves/rejects → audit logged.
- **Dependencies:** `admin-ai-governance` edge function.
- **Permissions:** admin token only; constant-time token compare (P1 hardening).
- **Data requirements:** governance action queue; audit trail.
- **Failure cases:** approval timeout; audit write failure.
- **Acceptance criteria:** every governed action has an audit record; no action executes without required approvals.
- **Testing requirements:** approval-flow tests; audit-trail completeness.

### F-3.4 — Route/classify hardening · `REMEDIATION` (D0 finding M1)
- **Behavior:** `route` and `classify` edge functions are currently PUBLIC; must require JWT + rate limiting.
- **Workflows:** client calls with JWT → validated → processed; unauthenticated → rejected.
- **Dependencies:** edge auth (`edge-auth.ts`); rate limiter.
- **Permissions:** JWT required.
- **Data requirements:** none beyond auth context.
- **Failure cases:** none (fail closed).
- **Acceptance criteria:** unauthenticated calls rejected; authenticated abuse throttled.
- **Testing requirements:** auth-gate tests extended to both functions.

### F-3.5 — Per-user daily AI spend cap · `NEW` (P0; uses existing `ai_events` accounting)
- **Behavior:** enforceable per-user daily AI cost cap with evidence-based default options (Decision #2 — numbers proposed, not finalized); on cap, assistant degrades to non-AI retrieval answers (saved memories still searchable, no new generation).
- **Workflows:** spend tracked per call → cap check → degrade gracefully with clear user status.
- **Dependencies:** `ai_events` accounting; entitlement service.
- **Permissions:** applies to all tiers (tier-specific values per Decision #2 options).
- **Data requirements:** per-user daily spend aggregates.
- **Failure cases:** accounting write failure → fail closed (block generation, allow retrieval).
- **Acceptance criteria:** cap breach blocks generation spend; user sees clear status; spend resets daily.
- **Testing requirements:** cap enforcement tests with mocked costs.

### F-3.6 — ai-provider-core adoption (conditional) · `NEW` (Decision #9)
- **Behavior:** assessment/integration of the shared provider core in edge functions — allowed only after (a) compatibility verification (Groq + OpenAI paths, GPT-5-mini quirks), (b) security review, (c) regression verification vs existing `_shared/ai.ts` behavior.
- **Workflows:** gate checks → pilot integration → regression comparison → rollout decision.
- **Dependencies:** App Factory `ai-provider-core`; existing `_shared/ai.ts`.
- **Permissions:** n/a (infrastructure).
- **Data requirements:** regression scenario corpus (`routing.scenarios.ts`).
- **Failure cases:** regression detected → rollback to `_shared/ai.ts`.
- **Acceptance criteria:** all three gates pass with documented evidence before any production use.
- **Testing requirements:** regression suite comparing old/new provider outputs across routing scenarios.

---

## F-4.x — Voice capture / transcription / extraction

### F-4.1 — Voice notes + transcription · `EXISTING`
- **Behavior:** client records audio (VoiceWave UI, `src/lib/engine.ts`); `transcribe` fn (JWT) uses Groq whisper-large-v3-turbo; transcript returned to chat pipeline; **audio is deleted after transcription and `audio_url` nulled** per standing audio policy ("بنمسح الصوت… بنكتفي بالصور").
- **Workflows:** record → transcribe → confirm/edit transcript → extract (J-2).
- **Dependencies:** `transcribe` edge function; Groq key (server secret); device microphone permission.
- **Permissions:** JWT; microphone permission on device.
- **Data requirements:** transient audio object; transcript text persisted in notes.
- **Failure cases:** transcription failure → audio retained transiently, user notified, retry offered; provider error → fallback message.
- **Acceptance criteria:** voice note produces a transcript note; no audio persists post-transcription under normal flow.
- **Testing requirements:** transcribe integration tests (mock Whisper); policy-enforcement test (audio_url null after success).

### F-4.2 — AI extraction (transcript → tasks/items/memories) · `EXISTING`
- **Behavior:** `extract` fn parses transcript into structured items (tasks, shopping, appointments, things, expenses, borrows, watches) and memory facts; e2e-covered at data level.
- **Workflows:** transcript → extract → items + facts → user review.
- **Dependencies:** `extract` edge function; provider layer.
- **Permissions:** JWT; space-scoped writes.
- **Data requirements:** `items`, `notes` writes.
- **Failure cases:** mis-extraction → user corrects; provider failure → transcript saved without extraction, retry offered.
- **Acceptance criteria:** "اشتري حليب" → shopping item; "أحمد: اشتري حليب" → task assigned to أحمد; item photo attachments preserved on notes.
- **Testing requirements:** extraction unit tests with fixed transcripts; mock-provider integration tests.

### F-4.3 — Fast-path intents (no agent round-trip) · `EXISTING`
- **Behavior:** deterministic handlers intercept confident intents client-side: morning digest ("شو عندي اليوم؟", `src/lib/morningDigest.ts`), expenses ("صرفت 40 على الخضرة" / "قديش صرفنا هالشهر؟", `src/lib/expenses.ts`), smart shopping (`smartShopping.ts`), lost-item lookup (`lostItem.ts`), habits (`habits.ts`), watch reminders (`watch.ts`), item timeline (`itemTimeline.ts`), user memory (`userMemory.ts`). Extracted titles match transcript language (standing rule).
- **Workflows:** user phrase → intent match → deterministic handler → answer (no LLM call).
- **Dependencies:** client engines in `src/lib/`.
- **Permissions:** same as the underlying data access.
- **Data requirements:** read access to space-scoped tables.
- **Failure cases:** intent mis-match → falls through to AI chat.
- **Acceptance criteria:** each fast path resolves without an LLM call where designed; voice phrasing coverage includes Arabic and English.
- **Testing requirements:** intent-parsing tests per engine; bilingual phrase fixtures.

---

## F-5.x — Notes / photos / documents / attachments

### F-5.1 — Text notes · `EXISTING`
- **Behavior:** CRUD on `notes` (space-scoped, RLS-verified); titles default to transcript language; duplicates not piled on re-saves (standing extract rules).
- **Workflows:** create → edit → delete (routes to trash, F-14.3).
- **Dependencies:** `notes` table; RLS policies.
- **Permissions:** space members (read/write own + shared per role).
- **Data requirements:** `notes(id, space_id, title, body, photo_url, ...)`.
- **Failure cases:** concurrent edits (last-write-wins with conflict note — Q-11).
- **Acceptance criteria:** create/edit/delete round-trip; deletion routes to trash (F-9.2 in WS1 numbering — trash F-14.3).
- **Testing requirements:** CRUD tests; RLS negative tests.

### F-5.2 — Photos · `EXISTING` / `REMEDIATION` (photo security D0 H1)
- **Behavior:** attach photos in chat input + preview strip; photos render in bubbles/cards + fullscreen viewer; `notes.photo_url`; extract copies note photos to things. REMEDIATION: close the `photo_url` validation gap and harden `can_read_photo` so storage URLs cannot be abused cross-user (D0 H1, P0).
- **Workflows:** attach → upload → validated URL stored → rendered.
- **Dependencies:** private storage buckets; `can_read_photo` policy.
- **Permissions:** photo access only for users entitled to the note's space.
- **Data requirements:** `notes.photo_url` (server-validated); storage objects.
- **Failure cases:** invalid URL rejected; oversized image rejected.
- **Acceptance criteria:** a user cannot read another user's photo URL; all photo URLs validated server-side.
- **Testing requirements:** cross-user photo access tests (negative); URL validation fuzz tests.

### F-5.3 — Documents & file attachments · `NEW`
- **Behavior:** attach documents/files to notes and vault items (PDF, images, common office formats); virus/size validation; storage quota counts against tier limits (Decision #2).
- **Workflows:** select file → validate → upload → attach → downloadable by entitled users.
- **Dependencies:** storage buckets; quota enforcement (F-12.3).
- **Permissions:** space members for notes; vault owner for vault items.
- **Data requirements:** file metadata (name, size, mime, storage path).
- **Failure cases:** oversize/unsupported type → rejected with clear message; quota exceeded → blocked with upgrade path.
- **Acceptance criteria:** attach → stored → listed → downloadable by entitled users; oversize upload rejected with clear message.
- **Testing requirements:** upload pipeline tests; entitlement and quota gating tests.

---

## F-6.x — Family membership / invitations / permissions

### F-6.1 — Family spaces · `EXISTING`
- **Behavior:** `spaces` type `family`; member list with roles; churn-safe removal (behavioral test 6).
- **Workflows:** create family space → invite (F-6.2) → manage (F-6.3).
- **Dependencies:** `spaces`, `space_members`.
- **Permissions:** manager creates/manages; members contribute.
- **Data requirements:** `spaces(type='family')`, `space_members(role)`.
- **Failure cases:** last manager leaves (Q-15).
- **Acceptance criteria:** removing a member removes access, not content (no cascade).
- **Testing requirements:** churn-safety tests; RLS tests.

### F-6.2 — Invitations (code, 7-day expiry, 10 uses) · `EXISTING` / `REMEDIATION` (M5 race)
- **Behavior:** `join-family` redeems invite codes; `space_invites` tracks `used_count`; REMEDIATION: `SELECT FOR UPDATE` on redemption to close the used-count race (P1).
- **Workflows:** manager creates invite → code shared → invitee redeems (J-4).
- **Dependencies:** `space_invites`; `join-family` edge function.
- **Permissions:** invite creation by family manager; redemption by authenticated user within expiry/use limits.
- **Data requirements:** `space_invites(code, space_id, expires_at, max_uses, used_count)`.
- **Failure cases:** expired code; exhausted uses; concurrent redemptions beyond the cap.
- **Acceptance criteria:** an invite cannot be redeemed more than 10 times even under concurrency; expired codes rejected.
- **Testing requirements:** redemption race tests.

### F-6.3 — Roles & permissions (manager / member) · `EXISTING`
- **Behavior:** `space_members.role`; manager: invite, remove members, delete/rename space, manage tabs; member: contribute content, propose tabs.
- **Workflows:** role assignment on join; manager actions gated by role checks.
- **Dependencies:** `space_members.role`; RLS policies.
- **Permissions:** per the roles matrix (USER_ROLES_AND_PERMISSIONS.md).
- **Data requirements:** `space_members(role)`.
- **Failure cases:** privilege escalation attempts → denied.
- **Acceptance criteria:** member cannot perform manager actions via direct API calls.
- **Testing requirements:** role matrix tests.

### F-6.4 — Family slots (multi-family billing hook) · `EXISTING` (schema)
- **Behavior:** `profiles.family_slots` (migration 0024): first family free (`=1`); extra family spaces require a new slot, set by Stripe webhook per paid family subscription.
- **Workflows:** create 2nd family → slot check → blocked with upgrade path if none.
- **Dependencies:** Stripe design (F-12.1); entitlement service (F-12.2). **Roadmap stage: D4** (WS7 staging authority).
- **Permissions:** slot grant via billing events only (plus admin).
- **Data requirements:** `profiles.family_slots`.
- **Failure cases:** webhook delayed → grace handling.
- **Acceptance criteria:** joining/creating a second family without an available slot is blocked with an upgrade path.
- **Testing requirements:** slot enforcement tests.

---

## F-7.x — Belongings / item management

### F-7.1 — Things & item kinds · `EXISTING`
- **Behavior:** `items` table kinds: `task`, `appointment`, `shopping`, `place`, `spec`, `opinion`, `checklist`, `thing`, `expense`, `watch` (migrations through 0022); item timeline (`itemTimeline.ts`); statuses open/done.
- **Workflows:** extraction or manual creation → kind-specific rendering → status transitions.
- **Dependencies:** `items` table.
- **Permissions:** space-scoped.
- **Data requirements:** `items(id, space_id, kind, status, title, meta, ...)`.
- **Failure cases:** unknown kind → generic rendering.
- **Acceptance criteria:** item kind coverage in extraction; timeline renders item history.
- **Testing requirements:** kind coverage tests; timeline tests.

### F-7.2 — "Where is X?" lookup (أين أشيائي؟) · `EXISTING`
- **Behavior:** natural-language item lookup with place + price ("وين X؟"); fast-path in chat.
- **Workflows:** "وين المفتاح؟" → lookup → answer with place.
- **Dependencies:** `lostItem.ts`; items store.
- **Permissions:** space-scoped.
- **Data requirements:** item place metadata.
- **Failure cases:** item not found → "not recorded" response.
- **Acceptance criteria:** lookup returns recorded place; bilingual phrasing works.
- **Testing requirements:** retrieval accuracy fixtures.

### F-7.3 — Borrowing tracking (مين أخذها؟) · `EXISTING`
- **Behavior:** `borrows` (migration 0012): lend/return extraction; "🤝 مع أحمد" badge + due date + two-tap "✅ رجع" in things list; return fast-path "رجع X".
- **Workflows:** "أحمد أخذ المفك" → borrow record → due → return confirmed.
- **Dependencies:** `borrows` table; extraction.
- **Permissions:** space members.
- **Data requirements:** `borrows(item_id, borrower, due_date, returned_at)`.
- **Failure cases:** return without lend record → manual resolve.
- **Acceptance criteria:** lend creates borrow record; return closes it; overdue borrows surface in morning digest.
- **Testing requirements:** lend/return lifecycle tests; RLS on borrows.

### F-7.4 — Prevention watches (رجّعته لمكانه؟) · `EXISTING`
- **Behavior:** item kind `watch`: "أخذت المفك على الكراج" → after due time, whole space is asked "رجّعته لمكانه؟"; one reminder per watch, re-armed on due-date change (`send_watch_reminders`, pg_cron 15-min, idempotent).
- **Workflows:** set watch → due → space notified → confirm returned → closed.
- **Dependencies:** pg_cron; `notify` fn.
- **Permissions:** space members.
- **Data requirements:** `items(kind='watch', due_at, reminder_sent_at)`.
- **Failure cases:** cron not scheduled → verification item.
- **Acceptance criteria:** due watch fires exactly once per due-date; re-arm works.
- **Testing requirements:** idempotency tests; re-arm tests.

### F-7.5 — Shopping lists · `EXISTING`
- **Behavior:** per-person lists; bought items move to history; not-found recorded; resolved lists archive; smart shopping engine (`smartShopping.ts`).
- **Workflows:** add items → shop → mark bought → archive.
- **Dependencies:** `items(kind='shopping')`; `smartShopping.ts`.
- **Permissions:** space members.
- **Data requirements:** shopping items with bought/history states.
- **Failure cases:** concurrent bought-marking.
- **Acceptance criteria:** bought items move to history; resolved lists archive.
- **Testing requirements:** list lifecycle; archive semantics.

### F-7.6 — Household expenses · `EXISTING`
- **Behavior:** "صرفت 40 على الخضرة" → expense item; "قديش صرفنا هالشهر؟" → monthly totals; `src/lib/expenses.ts`.
- **Workflows:** voice/text → expense parsed → monthly aggregation query.
- **Dependencies:** `expenses.ts`; `items(kind='expense')`.
- **Permissions:** space members.
- **Data requirements:** expense amount, category, date.
- **Failure cases:** ambiguous amounts → clarification prompt.
- **Acceptance criteria:** parsing correct for AR/EN phrasings; monthly totals accurate.
- **Testing requirements:** parsing fixtures; aggregation tests.

### F-7.7 — Habits · `EXISTING` (client engine `habits.ts`)
- **Behavior:** habit tracking surfaced in-app. *(Open: define product-visible behavior — Q-12.)*
- **Workflows:** TBD per Q-12 resolution.
- **Dependencies:** `habits.ts`.
- **Permissions:** personal (private space).
- **Data requirements:** TBD.
- **Failure cases:** TBD.
- **Acceptance criteria:** per Q-12 decision.
- **Testing requirements:** habit streak/CRUD tests.

---

## F-8.x — Vault + private info

### F-8.1 — Secret vault (tabs, codes, decoy) · `EXISTING` (schema + `vault-master` fn; 0 automated tests)
- **Behavior:** private vault with bcrypt-hashed access codes and decoy vaults (migrations 0026–0029); secret tabs in the app; `vault-master` fn (JWT) handles vault operations. **Paid gate stays OFF** (Decision #4) — vault available as designed until billing AND entitlement enforcement are both ready and owner-approved; the `LAUNCH:` flip in code must not be activated in D0.5 work.
- **Workflows:** set master code → optional decoy → add private content → unlock to view (J-6).
- **Dependencies:** `vaults` tables; `vault-master` fn; private storage.
- **Permissions:** vault contents never readable by other family members; decoy opens a separate plausible vault.
- **Data requirements:** `vaults`, master-code hashes (bcrypt), decoy config; private storage rows.
- **Failure cases:** wrong code (rate-limited attempts); lost code → recovery policy (Q-8).
- **Acceptance criteria:** family members cannot see vault contents via any API path; decoy mode indistinguishable; wrong-code attempts throttled.
- **Testing requirements:** full vault test suite (absent today — required): access control, decoy, brute-force throttling, cross-user isolation.

### F-8.2 — Vault documents · `NEW`
- **Behavior:** file/document storage inside vault (encrypted at rest); counts toward tier storage quotas (Decision #2).
- **Workflows:** unlock vault → attach document → stored encrypted.
- **Dependencies:** vault unlock; storage; quota enforcement.
- **Permissions:** vault owner only (post-unlock).
- **Data requirements:** encrypted file blobs + metadata.
- **Failure cases:** quota exceeded → blocked.
- **Acceptance criteria:** vault files readable only after vault unlock; deletion via trash.
- **Testing requirements:** encryption + access tests.

---

## F-9.x — Tasks / reminders / notifications

### F-9.1 — Tasks & agenda · `EXISTING`
- **Behavior:** assignable tasks ("أحمد: اشتري حليب"); agenda = appointments with date/time; status open/done; timezone-aware (migration 0031).
- **Workflows:** create (voice/text) → assign → due → done (J-5).
- **Dependencies:** `items(kind='task'/'appointment')`.
- **Permissions:** space members; assignee notified.
- **Data requirements:** task title, assignee, due_at (tz-aware), status.
- **Failure cases:** ambiguous due time → confirmation prompt.
- **Acceptance criteria:** assignment notifies; status transitions work; timezone rendering correct.
- **Testing requirements:** assignment, status transitions, timezone rendering.

### F-9.2 — Scheduled reminders (pg_cron 15-min) · `EXISTING`
- **Behavior:** `send_due_reminders()` (migration 0020) every 15 min; each item reminded once (`reminder_sent_at`); re-armed on due-date change; notifications via `notify` fn → device push (`device_tokens`, `src/lib/push.ts`).
- **Workflows:** due time reached → cron → push → user acts.
- **Dependencies:** pg_cron configured in production; push provider credentials.
- **Permissions:** per-user device tokens.
- **Data requirements:** `device_tokens`; `reminder_sent_at` stamps.
- **Failure cases:** cron not scheduled in prod (D0 verification item); push token expired → silent skip + token cleanup.
- **Acceptance criteria:** due reminder delivered ≤15 min after due time; exactly once per due-date.
- **Testing requirements:** reminder scheduler tests (requires prod cron verification).

### F-9.3 — Morning digest · `EXISTING`
- **Behavior:** "شو عندي اليوم؟" → one bubble: today's agenda + due/overdue tasks + open shopping lists + open borrows (`morningDigest.ts`).
- **Workflows:** user asks → digest composed → shown (not saved as note).
- **Dependencies:** `morningDigest.ts`; space data.
- **Permissions:** space-scoped.
- **Data requirements:** read across agenda/tasks/shopping/borrows.
- **Failure cases:** empty day → friendly empty state.
- **Acceptance criteria:** digest reflects current space state; not saved as a note.
- **Testing requirements:** digest composition tests.

### F-9.4 — Admin broadcast · `EXISTING` (`admin-broadcast`)
- **Behavior:** ops-initiated notifications to users (announcements, maintenance windows).
- **Workflows:** admin composes → targets → sends.
- **Dependencies:** `admin-broadcast` fn; `notify` fn.
- **Permissions:** admin only; scoped targeting.
- **Data requirements:** broadcast audience + content + delivery log.
- **Failure cases:** none critical.
- **Acceptance criteria:** targeted users receive; delivery logged.
- **Testing requirements:** targeting tests.

---

## F-10.x — Memory search / retrieval / organization / discovery

### F-10.1 — Search · `EXISTING` / `REMEDIATION` (scale)
- **Behavior:** `%…%` ILIKE search today — works but unscalable. REMEDIATION: pg_trgm index (Decision #8, design/test in D0.5) and/or full-text search; keeps behavior identical, scales reads.
- **Workflows:** user searches → ranked results → navigate to source.
- **Dependencies:** pg_trgm (design/test only per Decision #8).
- **Permissions:** space-scoped results only.
- **Data requirements:** trigram/GIN indexes (not yet in prod).
- **Failure cases:** index build on large tables → online build strategy.
- **Acceptance criteria:** search latency targets in PERFORMANCE doc; results identical-or-better relevance.
- **Testing requirements:** benchmark harness (P1).

### F-10.2 — Organization (tabs, item kinds, statuses) · `EXISTING`
- **Behavior:** space tabs, item kinds, open/done statuses, timeline.
- **Workflows:** browse by tab/kind/status.
- **Dependencies:** F-1.2, F-7.1.
- **Permissions:** space-scoped.
- **Data requirements:** existing tables.
- **Failure cases:** none.
- **Acceptance criteria:** filters compose correctly.
- **Testing requirements:** filter combination tests.

### F-10.3 — Discovery (tab proposals, smart surfacing) · `EXISTING` (proposals) / `NEW` (extended surfacing)
- **Behavior:** tab proposals (F-1.2); future: proactive "you asked about X before" surfacing — non-destructive, user-dismissable.
- **Workflows:** system surfaces → user accepts/dismisses.
- **Dependencies:** proposal engine (non-destructive).
- **Permissions:** space-scoped; dismissable by the user.
- **Data requirements:** surfacing candidates + dismissal state.
- **Failure cases:** noisy surfacing → dismissal learning.
- **Acceptance criteria:** surfacing is dismissable; never auto-creates content.
- **Testing requirements:** surfacing relevance tests.

---

## F-11.x — User profiles + account lifecycle

### F-11.1 — Registration (magic-link, 18+ gate) · `EXISTING` / `REMEDIATION` (age gate)
- **Behavior:** magic-link auth (`AuthScreen.tsx`); profiles row created (migration 0010). REMEDIATION: 18+ eligibility enforcement at registration (Decision #5) — date-of-birth self-attestation (method in Q-6); reflected in Terms/Privacy (F-14.4); no child accounts or child-specific features; architecture keeps extensibility for future parent-managed child accounts without implementing them now.
- **Workflows:** email → magic link → 18+ attestation + Terms/Privacy consent → profile setup (J-1).
- **Dependencies:** Supabase Auth; `profiles` table.
- **Permissions:** 18+ only.
- **Data requirements:** `profiles` (+ DOB attestation fields — NEW, Q-6); `family_slots`; consent timestamps.
- **Failure cases:** invalid/expired magic link; under-18 attempt → blocked with clear message.
- **Acceptance criteria:** under-18 registration is rejected; successful registration creates isolated profile.
- **Testing requirements:** age-gate tests; link-expiry tests.

### F-11.2 — Anonymous trial + upgrade · `EXISTING` (partially dead code)
- **Behavior:** anonymous trial with data preserved on upgrade to permanent account (same id). REMEDIATION: the upgrade banner is dead code (`index.tsx:627`) — restore a working UI entry point.
- **Workflows:** try anonymously → upgrade banner → email → same identity, data preserved (J-1).
- **Dependencies:** Supabase Auth anon → permanent upgrade.
- **Permissions:** n/a.
- **Data requirements:** same user id across upgrade.
- **Failure cases:** upgrade link expired → retry.
- **Acceptance criteria:** trial data intact after upgrade; single identity post-upgrade.
- **Testing requirements:** upgrade journey tests (J-1 covers).

### F-11.3 — Profiles · `EXISTING`
- **Behavior:** display name, language preference, timezone; RLS-verified.
- **Workflows:** edit profile → saved.
- **Dependencies:** `profiles` table.
- **Permissions:** own profile only.
- **Data requirements:** `profiles(display_name, language, timezone)`.
- **Failure cases:** none.
- **Acceptance criteria:** edits persist; RLS blocks cross-profile reads.
- **Testing requirements:** profile CRUD + RLS tests.

### F-11.4 — Email change · `NEW`
- **Behavior:** verified email-change flow (confirm old + verify new); sessions preserved.
- **Workflows:** request change → verify new address → old address notified → changed.
- **Dependencies:** Supabase Auth email update.
- **Permissions:** own account only.
- **Data requirements:** pending-email state + verification tokens.
- **Failure cases:** new address already in use → rejected.
- **Acceptance criteria:** change requires verification of the new address; old address notified.
- **Testing requirements:** full email-change journey.

### F-11.5 — Account deactivation · `NEW`
- **Behavior:** temporary deactivation: sign-in blocked, data retained (durable per Decision #1), family memberships suspended (not deleted); reactivation restores state.
- **Workflows:** deactivate → blocked sign-in → reactivate → restored.
- **Dependencies:** auth + membership suspension flags.
- **Permissions:** own account; admin cannot deactivate without audit.
- **Data requirements:** `deactivated_at` + suspended memberships.
- **Failure cases:** reactivation after long period → data intact check.
- **Acceptance criteria:** deactivated user cannot sign in; data intact on reactivation.
- **Testing requirements:** deactivate/reactivate cycle.

### F-11.6 — Account deletion (cascade) · `EXISTING`
- **Behavior:** `account-delete` fn; full CASCADE wipe via `auth.users` delete (verified safe, user-initiated only).
- **Workflows:** typed confirmation → 30-day trash semantics check (Q-5) → final wipe (J-8).
- **Dependencies:** `account-delete` fn; FK cascades.
- **Permissions:** own account only; explicit confirmation.
- **Data requirements:** cascade paths verified (D0 MEMORY_RETENTION_AUDIT cascade map).
- **Failure cases:** partial delete → reconciliation job.
- **Acceptance criteria:** delete wipes all user data; no orphan rows; family content handled per churn-safe rules (member removal, not content cascade).
- **Testing requirements:** deletion integration tests with row-count assertions. **REMEDIATION:** currently untested — add tests; confirm deletion honors 30-day trash semantics for recoverable content before final wipe (Decision #6 consistency — Q-5).

---

## F-12.x — Subscriptions / billing / entitlements

> **Staging note (WS7 authority):** commercial/billing design items in this section are staged at **Stage D4** of the D1–D8 roadmap.

### F-12.1 — Stripe subscription design · `NEW` (Decision #3) · Stage D4
- **Behavior:** complete billing design — Checkout, webhooks, customer portal, plan changes, proration, dunning, invoices. **Design in D0.5; no activation until owner approves design and explicitly authorizes go-live.**
- **Workflows:** subscribe → webhook → entitlements; change plan → proration; cancel → grace → downgrade (J-7).
- **Dependencies:** entitlement service (F-12.2); plans/promos admin (`admin-subscribe`, `admin-set-limits`, migration 0032).
- **Permissions:** billing actions by account owner.
- **Data requirements:** `user_subscriptions`; Stripe customer/subscription IDs; webhook event log.
- **Failure cases:** webhook delivery failure → idempotent retry; payment failure → dunning (Q-7).
- **Acceptance criteria:** design doc covers full lifecycle incl. failed payments (dunning), plan upgrades/downgrades (durable memories preserved per Decision #1), invoice history, tax handling approach (Q-7).
- **Testing requirements:** webhook handler tests with Stripe fixtures; proration math tests.

### F-12.2 — Entitlement service (fail-closed) · `REMEDIATION` (currently fragmented, fail-open) · Stage D4
- **Behavior:** single source of truth for plan entitlements (AI quotas, storage, family slots, vault access when Decision #4 gate lifts); every gated check fails closed (deny on error/unknown).
- **Workflows:** feature access → entitlement check → allow/deny with reason.
- **Dependencies:** `user_subscriptions`; Stripe webhooks (F-12.1).
- **Permissions:** service-level; checked server-side.
- **Data requirements:** entitlement records per user.
- **Failure cases:** entitlement-store outage → deny (fail closed).
- **Acceptance criteria:** no feature accessible without a granted entitlement; unknown plan state → denied.
- **Testing requirements:** fail-closed tests (simulated entitlement-store outage).

### F-12.3 — Free/Plus quota design (evidence-based options) · `NEW` (Decision #2) · Stage D4
- **Behavior:** explicit creation/storage limits per tier (AI generations, notes/facts, storage bytes, family slots). Numbers are NOT finalized — D0.5 proposes evidence-based *options* (from `ai_events` cost data + storage measurements) for owner approval. Hard rule: exceeding a limit blocks new creation; existing saved memories are never deleted (Decision #1).
- **Workflows:** approaching limit → warning → at limit → "limit reached" state with upgrade path.
- **Dependencies:** `ai_events`; storage metering; entitlement service.
- **Permissions:** tier-based.
- **Data requirements:** usage counters per user per tier.
- **Failure cases:** counter drift → reconciliation.
- **Acceptance criteria:** options doc with cost basis; enforcement UX spec ("limit reached" states, upgrade path).
- **Testing requirements:** quota enforcement tests run against proposed option sets.

### F-12.4 — Subscription UI · `REMEDIATION` · Stage D4
- **Behavior:** replace dead "soon" items (which promise payment that doesn't exist) with real plan management once F-12.1 ships; until then, no payment promises in UI.
- **Workflows:** Plans screen → current plan → upgrade/manage/cancel.
- **Dependencies:** F-12.1, F-12.2.
- **Permissions:** account owner.
- **Data requirements:** plan display data.
- **Failure cases:** none.
- **Acceptance criteria:** no UI text promises unavailable billing.
- **Testing requirements:** UI state tests per entitlement.

---

## F-13.x — Admin / support / ops tools

### F-13.1 — Admin console · `EXISTING`
- **Behavior:** `admin.html` (1,286 lines): user management (`admin-user`), bans, grants, plans, promos (`admin-subscribe`, `admin-set-limits`, migration 0032), stats (`admin-stats`), catalog (`admin-catalog`), broadcast (`admin-broadcast`), AI governance page (`admin-ai-governance`).
- **Workflows:** admin authenticates → manages users/entitlements/content-moderation.
- **Dependencies:** admin edge functions; admin token.
- **Permissions:** admin token (constant-time compare hardening, P1); service_role server-side.
- **Data requirements:** admin audit log (NEW — all mutating actions logged).
- **Failure cases:** token leak → rotation procedure.
- **Acceptance criteria:** all mutating admin actions audit-logged; admin cannot read user memories/vault/exports (privacy boundary).
- **Testing requirements:** admin action audit tests; authz negative tests. **REMEDIATION:** token handling stays transient; add audit logging on all mutating admin actions.

### F-13.2 — Observability (Sentry + uptime + alerts) · `NEW` (P1)
- **Behavior:** crash reporting, uptime checks, alerting on error-rate/SLO breach.
- **Workflows:** error → captured → alerted → triaged.
- **Dependencies:** Sentry (or equivalent); uptime monitor.
- **Permissions:** ops only.
- **Data requirements:** error events (PII-redacted); uptime metrics.
- **Failure cases:** alert fatigue → tuning.
- **Acceptance criteria:** alert fires on defined SLO breach; crashes symbolicated.
- **Testing requirements:** alert-path tests.

### F-13.3 — Support path · `NEW`
- **Behavior:** in-app help/FAQ/contact; ticket intake; status communication channel.
- **Workflows:** user needs help → FAQ → contact → ticket → response (Q-16).
- **Dependencies:** support tooling (Q-16).
- **Permissions:** users submit; support staff view assigned tickets.
- **Data requirements:** tickets + SLA tracking.
- **Failure cases:** none.
- **Acceptance criteria:** user can reach support from the app; SLA documented (Q-8 in WS1 numbering).
- **Testing requirements:** ticket lifecycle tests.

### F-13.4 — Ops telemetry janitor (design/test only) · `REMEDIATION` (Decision #8)
- **Behavior:** retention janitor for `rate_limits`, `ai_events`, `ops_events` — approved for design/testing only, not production execution; absolute rule: never deletes saved memories.
- **Workflows:** dry-run → report → (no prod execution without further approval).
- **Dependencies:** telemetry tables.
- **Permissions:** ops design only.
- **Data requirements:** retention windows per table (design).
- **Failure cases:** janitor touching memory tables → blocked by design.
- **Acceptance criteria:** design asserts zero memory-table touches.
- **Testing requirements:** janitor dry-run tests asserting zero memory-table touches.

### F-13.5 — Database indexes (design/test only) · `REMEDIATION` (Decision #8)
- **Behavior:** pg_trgm + `items.note_id` + `(space_id, kind)` indexes — design/test in D0.5; production execution pending approval.
- **Workflows:** design → benchmark → approval gate → (execution deferred).
- **Dependencies:** migration framework.
- **Permissions:** n/a (design).
- **Data requirements:** query plans before/after.
- **Failure cases:** index build locks → online build plan.
- **Acceptance criteria:** benchmark shows target improvement; zero-downtime build plan.
- **Testing requirements:** query-plan benchmarks before/after.

### F-13.6 — Incident runbook + status page · `NEW`
- **Behavior:** outage runbook for on-call; public status page.
- **Workflows:** incident → runbook steps → status updates.
- **Dependencies:** status-page provider (Q-17).
- **Permissions:** ops.
- **Data requirements:** runbook docs; status history.
- **Failure cases:** none.
- **Acceptance criteria:** runbook covers auth outage, provider outage, data-incident steps.
- **Testing requirements:** game-day exercise.

---

## F-14.x — Privacy / export / deletion / recovery

### F-14.1 — RLS isolation · `EXISTING`
- **Behavior:** 27 RLS-enabled tables; zero `USING(true)` (D-1 verified); behavioral tests.
- **Workflows:** every query → RLS policy evaluation.
- **Dependencies:** migration policies; CI gates.
- **Permissions:** per-policy.
- **Data requirements:** policy definitions.
- **Failure cases:** policy regression → CI catches.
- **Acceptance criteria:** CI RLS audit + behavioral suite green.
- **Testing requirements:** keep CI-enforced RLS audit + behavioral suite green.

### F-14.2 — GDPR-style export · `EXISTING` (`account-export`; untested)
- **Behavior:** full user data export (notes, items, facts, photos, tasks, vault metadata as applicable).
- **Workflows:** request → job builds archive → time-limited download link → notified (J-8).
- **Dependencies:** `account-export` fn.
- **Permissions:** own data only.
- **Data requirements:** export format (Q-10); delivery + link expiry.
- **Failure cases:** large export → chunked/async.
- **Acceptance criteria:** export contains all user-scoped data; machine-readable format.
- **Testing requirements:** export completeness tests. **REMEDIATION:** add tests; define export format + delivery (download link, expiry) — Q-10.

### F-14.3 — Trash + 30-day recovery · `EXISTING` (retention default; Decision #6)
- **Behavior:** soft delete to `trash_bin`; 30-day recovery window (Decision #6 — the `trash_retention_days` 30→0 launch flip is NOT approved). `forget_fact` deletions route through trash (F-2.1).
- **Workflows:** delete → undo bar → trash view → restore or expire → purge (J-9).
- **Dependencies:** `trash_bin` table; purge job (design only).
- **Permissions:** only the owning user may restore/permanently delete their trashed rows.
- **Data requirements:** `trash_bin` with restorable payloads + expiry timestamps.
- **Failure cases:** restore of items whose parent space/tab was deleted → nearest valid parent.
- **Acceptance criteria:** any deleted note/item/fact restorable within 30 days; purge after 30 days deletes only already-trashed rows.
- **Testing requirements:** trash lifecycle tests (delete → restore → expire → purge).

### F-14.4 — Legal docs (Terms / Privacy / consent) · `NEW` (P0)
- **Behavior:** Terms of Service, Privacy Policy, consent capture (18+ attestation, Decision #5); DPA posture for processors.
- **Workflows:** registration → present → accept → consent recorded (J-1).
- **Dependencies:** legal drafting (owner step, not agent-executed).
- **Permissions:** n/a.
- **Data requirements:** consent records per user (timestamp + version).
- **Failure cases:** user declines → cannot register.
- **Acceptance criteria:** legal docs published in-app and on web; consent recorded per user.
- **Testing requirements:** consent-flow tests.

---

## F-15.x — Web / a11y / i18n

### F-15.1 — Web app (Expo export) · `EXISTING` (partial)
- **Behavior:** responsive web build; phone-UI stretch fixed.
- **Workflows:** browse → install PWA → deep-link navigation.
- **Dependencies:** Expo export pipeline.
- **Permissions:** public pages vs authenticated app.
- **Data requirements:** SEO metadata; PWA manifest; route map.
- **Failure cases:** deep link for logged-out user → auth handoff (Q-20).
- **Acceptance criteria:** installable PWA; shareable deep links open the right content for entitled users.
- **Testing requirements:** Lighthouse budgets; PWA installability checks; deep-link routing tests. **REMEDIATION/NEW:** SEO (meta, sitemap, SSR where feasible), PWA (installable, offline read cache per P1), deep-links (note/item/share URLs).

### F-15.2 — Offline read cache + queue-and-sync · `NEW` (P1)
- **Behavior:** offline read of cached memories; writes queued and synced (no silent loss); conflict policy defined (Q-11).
- **Workflows:** offline → read cache → queue writes → reconnect → sync.
- **Dependencies:** client cache; sync engine.
- **Permissions:** cached data limited to entitled content.
- **Data requirements:** cache schema + sync queue.
- **Failure cases:** conflicts → policy (Q-11); queue overflow → user warning.
- **Acceptance criteria:** airplane-mode read of recent memories; queued writes sync on reconnect.
- **Testing requirements:** offline simulation tests.

### F-15.3 — Accessibility · `REMEDIATION`
- **Behavior:** labels, roles, keyboard navigation, focus management, screen-reader support (today ~17 labels in a 6k-line screen; zero `accessibilityRole`).
- **Workflows:** keyboard-only and screen-reader journeys.
- **Dependencies:** component library (design system).
- **Permissions:** n/a.
- **Data requirements:** a11y audit baseline.
- **Failure cases:** none.
- **Acceptance criteria:** a11y audit pass; keyboard-only journey completion; screen-reader smoke tests. Target: WCAG 2.2 AA.
- **Testing requirements:** automated a11y checks + manual audit.

### F-15.4 — i18n (AR/EN) · `EXISTING`
- **Behavior:** compile-enforced AR/EN parity; drawer language toggle persisted; `ui_lang` follows UI language in chat.
- **Workflows:** toggle language → full UI + chat language switch; RTL/LTR layout flip.
- **Dependencies:** i18n framework; parity check in CI.
- **Permissions:** n/a.
- **Data requirements:** string catalogs (AR + EN).
- **Failure cases:** missing string → fallback + CI failure.
- **Acceptance criteria:** every user-facing string exists in both languages; parity check stays CI-enforced.
- **Testing requirements:** parity CI gate; RTL layout tests.

### F-15.5 — Error reporting · `EXISTING` (`report-error` fn)
- **Behavior:** client error reports stored (free-text; JWT). Privacy review: free-text may contain PII — retention/redaction policy required (Q-13).
- **Workflows:** client error → report → stored → triaged.
- **Dependencies:** `report-error` fn; `ops_events`.
- **Permissions:** authenticated users report own errors.
- **Data requirements:** redaction/retention policy (Q-13).
- **Failure cases:** PII in free text → redaction.
- **Acceptance criteria:** reports stored without unbounded PII retention.
- **Testing requirements:** redaction tests.

---

## F-16.x — Public config & remote feature flags

### F-16.1 — Public config & remote feature flags · `EXISTING`
- **Behavior:** `public-config` fn (public by design) serves app config; remote feature flags (`src/lib/remoteConfig.ts`, `scopeGuard.ts`) gate features (e.g., vault flag).
- **Workflows:** app boot → fetch config → evaluate flags → gate features.
- **Dependencies:** `public-config` fn.
- **Permissions:** public config; flag evaluation client-side with server enforcement for gated features.
- **Data requirements:** flag definitions + targeting rules.
- **Failure cases:** config fetch failure → safe defaults.
- **Acceptance criteria:** flags toggle features without deploy; flag evaluation logged.
- **Testing requirements:** flag-matrix tests.

---

## Traceability

**Staging authority note:** Per WS7 (D1–D8 roadmap authority), commercial/billing design items are staged at **Stage D4**. All other stage assignments come from the D1–D8 execution roadmap.

| Owner Decision | Features / Journeys | Roadmap Stage |
|---|---|---|
| #1 Durable memories | F-2.1, F-12.3, J-7, J-8 | per roadmap |
| #2 Quotas as options | F-12.3, Q-1/Q-2/Q-3 | per roadmap |
| #3 Stripe in scope | F-12.1, F-12.2, F-12.4, F-6.4, J-7 | **D4** |
| #4 Vault gate off | F-8.1, roles matrix, J-6, Q-9 | per roadmap |
| #5 18+ only | F-11.1, F-14.4, J-1, Q-6 | per roadmap |
| #6 Trash 30-day | F-14.3, J-8, J-9, Q-5 | per roadmap |
| #7 Non-destructive only | F-2.1, F-2.3 | per roadmap |
| #8 Design/test only | F-10.1, F-13.4, F-13.5 | per roadmap |
| #9 ai-provider-core conditional | F-3.6, Q-18 | per roadmap |

**Open questions** (Q-1…Q-20) are listed in the workstream draft and carried into OPEN_DECISIONS_AND_OWNER_APPROVALS.md. None are owner-approved; none are treated as decisions.
