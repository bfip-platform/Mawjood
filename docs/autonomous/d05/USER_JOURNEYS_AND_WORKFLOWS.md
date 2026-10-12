# D0.5 — User Journeys and Workflows

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** Workstream 01 §4 · **Status:** Planning only — does not authorize implementation, production migration, billing activation, or owner approval.

Each journey carries a `J-<n>` ID, lists the features it covers, and ends with acceptance criteria. Failure paths are specified inline.

---

## J-1 — Signup → onboarding
**Covers:** F-11.1, F-11.2, F-11.3, F-14.4

1. User opens web app → sees landing (SEO page, F-15.1) with Sign in / Try anonymously.
2. Chooses email sign-in → enters email → magic link sent (expiry stated, e.g. 15 min — Q-4).
3. Clicks link → account created; 18+ attestation presented (Decision #5) with Terms/Privacy acceptance; consent recorded.
4. Profile setup: display name, language (AR/EN), timezone (auto-detected, editable).
5. Onboarding tour: Private space explained; one sample voice-note prompt; family invite entry point.
6. Anonymous path: "Try first" → trial space created locally; upgrade banner (restored, F-11.2) → enters email → same identity, trial data preserved.

**Acceptance criteria:** under-18 attestation blocks registration; trial upgrade preserves 100% of trial content; consent timestamp stored.

**Failure paths:** invalid/expired magic link → resend with throttling; under-18 attempt → blocked with clear message (no account created).

---

## J-2 — Voice note → memory
**Covers:** F-4.1, F-4.2, F-5.1, F-5.2

1. User taps mic in a space → records ("اشتريت حليب من كارفور") → stops.
2. Transcription runs (Groq Whisper); transcript shown for confirmation/edit.
3. AI extraction creates: note (transcript), shopping/thing/task items as parsed; photo attached if taken.
4. Audio deleted post-transcription per policy; `audio_url` nulled.
5. Memory facts learned (`memory-learn`) for durable recall.

**Acceptance criteria:** end-to-end voice→structured items within target latency (see PERFORMANCE_RELIABILITY_AND_OPERATIONS.md); audio never persists after success; user can correct transcript before extraction commits.

**Failure paths:** transcription fails → note saved as "voice note (transcription pending)" with retry; audio retained only until success; extraction mis-parse → user corrects items manually.

---

## J-3 — Ask the AI
**Covers:** F-3.1, F-3.2, F-4.3, F-10.1

1. User asks "وين المفتاح الاحتياطي؟" → fast-path lookup if confident; else chat/ask.
2. Assistant retrieves from memory facts + notes + items (space-scoped) → answers with sources.
3. Structural action proposed ("أحفظ هاي كملاحظة؟") → user confirms → governed action executes (double approval for destructive).
4. "شو عندي اليوم؟" → morning digest bubble (no agent round-trip, not saved as note).

**Acceptance criteria:** answers cite the memory they came from where feasible; destructive actions never run unconfirmed; injection-prompted destructive action is refused and logged.

**Failure paths:** provider outage → graceful fallback message with retrieval-only answers; 5-step budget exhausted → summarize-so-far; AI spend cap reached (F-3.5) → non-AI retrieval answers with clear status.

---

## J-4 — Family invite → join
**Covers:** F-6.1, F-6.2, F-6.3

1. Family manager creates invite → code shown (7-day expiry, 10 uses stated).
2. Invitee (signed in) enters code → `join-family` validates (expiry, uses, slot availability) → joins as member.
3. Member sees family space content; manager permissions remain with manager.
4. Member removal by manager → access revoked, content preserved (churn-safe).

**Acceptance criteria:** 11th concurrent redemption fails; expired code rejected with clear message; removed member's contributions remain.

**Failure paths:** expired code → "expired, ask for a new invite"; exhausted uses → same; no family slot (F-6.4) → upgrade path shown; race on final use → exactly 10 redemptions, never 11.

---

## J-5 — Create task / reminder
**Covers:** F-9.1, F-9.2

1. Voice or text: "ذكّرني أدفع الفاتورة بكرا الساعة ٥" → task + reminder created with timezone-aware due time; user confirms parsed time.
2. pg_cron fires at due time → push notification delivered (≤15 min granularity).
3. User marks done from notification or app; reminder_sent stamped (once per due-date).

**Acceptance criteria:** reminder fires exactly once per due-date; timezone changes re-render correctly; missed (offline) reminders deliver on reconnect with "missed" labeling (Q-11).

**Failure paths:** ambiguous time → confirmation prompt before saving; push token expired → silent skip + token cleanup; cron not scheduled in prod → ops verification item.

---

## J-6 — Vault setup
**Covers:** F-8.1, F-8.2 (Decision #4 — gate stays off)

1. User opens secret vault tab → sets master code (strength requirements, Q-8) → optional decoy vault with separate code.
2. Adds private notes/photos/documents (F-8.2); contents never appear in family spaces, search, digests, or AI answers to other members.
3. Unlock via code (rate-limited attempts); lock on background/timeout (Q-8).
4. "اسأل خزنتك" (vault-aware AI) answers only after unlock, only to the owner.

**Acceptance criteria:** no API path leaks vault content to family members; wrong-code lockout after N attempts; decoy indistinguishable.

**Failure paths:** wrong code → throttled retry; lost code → per Q-8 recovery policy (open); vault paid-gate NOT activated (Decision #4).

---

## J-7 — Upgrade to Plus
**Covers:** F-12.1, F-12.2, F-12.3, F-12.4 · **Roadmap stage: D4** (WS7 staging authority)

1. User hits a quota ("limit reached" state, F-12.3) or opens Plans → sees Free vs Plus (evidence-based limits; prices set only after Decision #2 numbers are owner-approved).
2. Stripe Checkout → payment → webhook → entitlements updated (family slots, AI quota, storage).
3. Customer portal: change plan, cancel, invoices; downgrade preserves all saved memories (Decision #1) and blocks only new over-quota creation.
4. Dunning: failed payment → grace + retry + clear status; service continues during grace (Q-7).

**Acceptance criteria:** upgrade/downgrade round-trip preserves every saved memory; failed webhook retried idempotently; no billing activation until owner explicitly authorizes go-live (Decision #3 — design only in D0.5).

**Failure paths:** payment fails → dunning flow; webhook delayed → entitlements reconcile on next sync; user cancels mid-trial → downgrade path.

---

## J-8 — Export / delete account
**Covers:** F-14.2, F-11.6, F-14.3

1. Export: user requests export → job builds machine-readable archive (format per Q-10) → time-limited download link; notified on completion.
2. Delete: user confirms (typed confirmation + consequences listed, incl. family spaces left as member) → 30-day trash window applies to recoverable content (Q-5) → final cascade wipe; confirmation email.

**Acceptance criteria:** export contains all user-scoped data; post-delete, zero user rows remain (verified by count query); family spaces survive member deletion.

**Failure paths:** export job fails → retry with notification; delete confirmation abandoned → no state change.

---

## J-9 — Trash recovery
**Covers:** F-14.3 (Decision #6 — 30-day window retained)

1. User deletes a note/item/fact → moved to trash with "Undo" bar (client `UndoBar.tsx`).
2. Trash view lists trashed items with days-remaining; restore returns item to original space/tab (or nearest valid parent if parent gone).
3. After 30 days, purge deletes only already-trashed rows.

**Acceptance criteria:** restore within 30 days is lossless; post-30-day purge touches only trash rows (never live memories).

**Failure paths:** parent space/tab deleted → restore to nearest valid parent with user notice; purge job must never touch live tables (design assertion).

---

## Journey ↔ feature traceability

| Journey | Features covered |
|---|---|
| J-1 | F-11.1, F-11.2, F-11.3, F-14.4 |
| J-2 | F-4.1, F-4.2, F-5.1, F-5.2 |
| J-3 | F-3.1, F-3.2, F-4.3, F-10.1 |
| J-4 | F-6.1, F-6.2, F-6.3 |
| J-5 | F-9.1, F-9.2 |
| J-6 | F-8.1, F-8.2 |
| J-7 | F-12.1, F-12.2, F-12.3, F-12.4 (Stage D4) |
| J-8 | F-14.2, F-11.6, F-14.3 |
| J-9 | F-14.3 |
