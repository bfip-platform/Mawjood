# D4 T-D4-4 — Legal drafts + 18+ design

> ⚠️ **DRAFTS — NOT LEGAL ADVICE.** These drafts exist so the owner and their counsel start from an accurate, code-derived data inventory instead of a blank page. **Nothing here is final, published, or a substitute for counsel's review** (roadmap: "legal drafts require owner/counsel — agent review insufficient"). No draft is wired into the app by this PR.
>
> **Verification basis (review note, 2026-10-12):** §1 describes the product as designed across **main + Draft PRs #17 (photo binding), #19 (spend cap), #20 (telemetry sanitization), #23 (telemetry janitor)** — each such row carries its PR attribution inline. If any of those PRs is declined or deferred, the corresponding §1 rows must be amended before counsel relies on them: on main alone, photos bind more loosely, error reports store raw text, and no telemetry retention windows are enforced yet.

## 1. Data-flow inventory (verified against the code, 2026-10-12)

| Data | Where it lives | Retention / notes |
|---|---|---|
| Account email, auth sessions | Supabase Auth | Magic-link + anonymous trial; user id is the data root |
| Voice audio | In transit only | Transcribed by the `transcribe` function, then **deleted** (audio file removed, `audio_url` nulled) — the product keeps transcripts, not recordings |
| Transcripts / notes | `notes` (Postgres) | Until user deletes (row-move deletion semantics) |
| Items & memory facts | `items` | Durable by design (Decision #1); forget → 30-day trash → purge (D1) |
| Photos | `item-photos` storage bucket + `notes.photo_url` | Access bound to note authorship/space membership (PR #17) |
| Chat transcripts | `chat_sessions` | 7-day expiry sweep on the client (§10, Charter D2) |
| Vault contents | `secret_vault` (encrypted at rest by design) | Owner-only; vault AI gate OFF (Decision #4) |
| AI processing | OpenAI (chat/extract/vision), Groq (transcription) | Subprocessors; prompts include the user's own note/fact content needed for the request |
| Telemetry | `ai_events`, `ops_events`, `rate_limits` | Operational only; janitor-retained 90/90/2 days (D3); error reports are sanitized before storage (PR #20) |
| Push tokens | `push_tokens` | For due-reminders |
| Billing (future) | Stripe | No billing data exists today; card data never touches our servers (STRIPE_ARCHITECTURE.md) |

Family spaces: content a user places in a family space is visible to that family's members — the privacy draft must say this plainly; private spaces are visible to no one else.

## 2. Terms of Service — draft skeleton (for counsel)

Parties & service description ("voice memory assistant") · eligibility **18+** (§4) · accounts & family spaces (member visibility) · acceptable use · user content ownership & the license needed to process it (store, transcribe, extract, answer) · AI output disclaimer (may be wrong; not professional advice) · subscriptions/billing terms (placeholder until activation) · termination & data export/deletion rights (ACCOUNT_LIFECYCLE.md) · liability/indemnity placeholders for counsel · governing law placeholder (owner/counsel).

## 3. Privacy Policy — draft skeleton (for counsel)

What we collect (the §1 table, in plain language) · why (operate the memory) · **what we never do**: sell personal data; keep voice recordings after transcription; train models on user content (subject to subprocessor terms — counsel to verify OpenAI/Groq API data terms at signing) · subprocessors list (Supabase, OpenAI, Groq, Stripe-future, Expo/push providers) · family-space visibility · retention (trash 30 days; chat transcripts 7 days; telemetry windows) · user rights (access/export via `account-export`, deletion via `account-delete`, correction in-app) · children's policy (**18+ only**, §4) · contact.

## 4. 18+ enforcement design (Decision #5 — 18+ only at launch)

- **Gate at registration:** a date-of-birth step before account creation completes (including anonymous-trial upgrade). Client collects DOB; the **server** computes age and refuses < 18 — never trust a client-computed flag. Store only the derived `is_adult` boolean + the year, not the full DOB, unless counsel requires otherwise (data minimization).
- **Fail-closed:** missing/malformed DOB = not registered. Existing-account migration: existing users confirm at next sign-in (design for counsel/owner to approve before any enforcement ships).
- **No age-gated content tiers:** the product is simply not offered to minors; family spaces are for adult members (owner's product call, recorded here as design input for counsel).
- Enforcement code is NOT in this PR — it ships with the registration change after counsel reviews the draft language.

## 5. DPA

A Data Processing Addendum skeleton for (a) subprocessors (their DPAs govern: Supabase/OpenAI/Groq/Stripe) and (b) future B2B/family-admin contexts — counsel to draft from the §1 inventory; no B2B offering exists today, so this is a placeholder section, not a document.
