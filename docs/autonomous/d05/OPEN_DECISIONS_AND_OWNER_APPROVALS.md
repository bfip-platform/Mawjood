# Open Decisions & Owner Approvals

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** Consolidated + deduplicated from all 8 workstreams (WS1 Q-1–Q-20 · WS2 O-1–O-7 · WS3 §open · WS4 6Qs · WS5 12-item · WS6 §15 · WS7 O-1–O-20 · WS8 brand gate).
**Rule:** Nothing here is decided. Each entry: what is open, options, recommendation, decider. Do not invent owner approval.

## How to use this document

- **Owner:** work top-down by category; P0-adjacent items are marked.
- **Agent:** never treat an entry as approved until the owner says so in chat; record approvals as amendments to this file.
- Duplicates merged: the 18+ gate method (WS1/WS2/WS5/WS7/WS8) → OD-18; quota numerics (WS1/WS2/WS3/WS5/WS6/WS7) → OD-01/OD-02; semantic search (WS3/WS7) → OD-24.

---

## A. Quotas, pricing, billing (decisions #2, #3 apply)

### OD-01 — Free tier numeric creation limits [P0-adjacent]
- **Open:** notes/day, facts total, AI calls/day, storage GB, family slots for Free.
- **Options:** evidence-based options from `ai_events` cost data + storage measurements (WS3 §4.4 options A/B/C; WS5 §2.2–§2.4). Owner picks after measurement runs.
- **Recommendation:** propose 2–3 options per axis with cost rationale; overflow = block-new (never delete, per decision #1).
- **Decider:** Owner.

### OD-02 — Plus tier numeric limits
- **Open:** storage/AI limits for Plus; Plus = 4× Free AI budget proposed (WS5 §3.1).
- **Options:** same evidence basis as OD-01.
- **Recommendation:** 4× multiplier as starting proposal; validate against measured p99.
- **Decider:** Owner.

### OD-03 — Per-user daily AI spend cap default
- **Open:** conservative default vs measured p99; fail-closed on accounting outage.
- **Options:** start conservative (e.g., 2× measured p99 of current usage), tune after 30 days of capped data.
- **Recommendation:** conservative + spend alerts; kill-switch env var for false positives.
- **Decider:** Owner (agent proposes numbers).

### OD-04 — Stripe prices
- **Open:** Plus monthly/annual price points; currency USD at launch proposed; regional pricing (MENA vs US).
- **Options:** pricing paper in T-D4-3.
- **Recommendation:** USD-only at launch; single monthly + annual (2 months free convention) as starting proposal.
- **Decider:** Owner.

### OD-05 — Dunning policy
- **Open:** grace length, retry behavior, suspension timing.
- **Options:** lenient (7d grace / 14d downgrade) vs strict (3d).
- **Recommendation:** lenient at launch (trust positioning); 7d grace / 14d downgrade proposed.
- **Decider:** Owner.

### OD-06 — Refund / chargeback policy
- **Open:** window and tier-handling on refund; must match Terms draft.
- **Options:** no-refund vs 14-day.
- **Recommendation:** 14-day for annual, pro-rated monthly — confirm with counsel.
- **Decider:** Owner (+ counsel).

### OD-07 — Proration policy
- **Open:** `create_prorations` behavior on plan change.
- **Options:** always prorate (proposed) vs charge full period.
- **Recommendation:** prorate on upgrade immediately; downgrade at period end.
- **Decider:** Owner.

### OD-08 — Tax nexus
- **Open:** jurisdictions, Stripe Tax on/off, legal entity details.
- **Recommendation:** engage tax advisor before launch; Stripe Tax on if multi-state nexus.
- **Decider:** Owner (+ tax advisor).

### OD-09 — Plus trial
- **Open:** enable or not; length.
- **Options:** no trial vs 14-day trial.
- **Recommendation:** 14-day trial, no card upfront (low friction, matches trust brand).
- **Decider:** Owner.

### OD-10 — Vault tier placement
- **Open:** when decision #4's gate lifts — Plus-only or free with limits?
- **Options:** Plus-only vs free-with-limits (e.g., 1 vault free).
- **Recommendation:** decide at billing go-live, not before; default proposal: free with 1 vault, unlimited on Plus.
- **Decider:** Owner.

### OD-11 — Billing go-live authorization
- **Open:** separate explicit authorization after design approval.
- **Rule:** design approval ≠ activation. This is a distinct owner action in D8.
- **Decider:** Owner.

---

## B. Legal, privacy, age gating (decision #5 applies)

### OD-12 — Terms / Privacy / DPA final text
- **Open:** agent drafts; drafts must match actual data flows (voice deleted post-transcription, photos kept, 7-day chat sweep).
- **Recommendation:** counsel review mandatory; agent review is insufficient for legal text.
- **Decider:** Counsel + Owner.

### OD-13 — 18+ enforcement method (dedup: WS1 Q-6, WS2 O-1, WS5, WS7 O-14, WS8)
- **Open:** self-attestation checkbox vs DOB entry vs third-party verification; what data is stored (privacy minimization).
- **Options:** checkbox + Terms (lowest friction) vs DOB entry (auditable) vs ID verification (highest assurance, highest friction/cost).
- **Recommendation:** checkbox + Terms at launch with legal review; DOB entry if counsel requires.
- **Decider:** Owner (+ counsel).

### OD-14 — Account deletion: 30-day recovery or immediate wipe? (dedup: WS1 Q-5, WS2 O-4)
- **Open:** deletion applies the 30-day trash window (delayed wipe) or immediate cascade?
- **Options:** delayed wipe (consistent with decision #6) vs immediate (GDPR "without undue delay" reading).
- **Recommendation:** 30-day delayed wipe for recoverable content, immediate for auth/identity — confirm with counsel.
- **Decider:** Owner (+ counsel).

### OD-15 — `report-error` free-text retention / redaction
- **Open:** PII risk in client free-text; retention and redaction policy.
- **Recommendation:** redact before storage + 30-day retention; never include voice/photo payloads.
- **Decider:** Owner.

### OD-16 — Launch markets
- **Open:** US-only vs broader (affects legal/tax).
- **Recommendation:** US-only at launch; revisit post-launch.
- **Decider:** Owner.

### OD-17 — Data-retention policy beyond trash (telemetry, logs)
- **Open:** 30/90/365d per table class for `rate_limits`/`ai_events`/`ops_events`.
- **Recommendation:** 90d telemetry / 30d debug logs as starting proposal; janitor implements.
- **Decider:** Owner.

---

## C. Security (P0-adjacent)

### OD-18 — Signed-URL expiry duration (dedup: WS4 Q1, WS6)
- **Open:** proposed 15 min; bound ≤1 h.
- **Recommendation:** 15 min default; rotation + revocation design per WS6.
- **Decider:** Owner.

### OD-19 — `route`/`classify` strategy (dedup: WS4 Q2, WS6 #4)
- **Open:** JWT + rate-limit (recommended) vs route-behind-chat.
- **Recommendation:** JWT + rate-limit; simpler, preserves fast-path latency.
- **Decider:** Owner (with abuse-modeling input).

### OD-20 — Trash visibility: space admins vs deleting-user-only
- **Open:** who can see/restore trashed items in shared spaces.
- **Recommendation:** deleting-user-only + space manager; never all members.
- **Decider:** Owner.

### OD-21 — Alert channel + on-call ownership
- **Open:** Sentry/uptime alert routing; who is on-call.
- **Recommendation:** owner defines rotation in D8; agent proposes channel (e.g., email + push).
- **Decider:** Owner.

### OD-22 — Vault KEK storage
- **Open:** Supabase Vault vs external KMS for key-encryption keys.
- **Recommendation:** Supabase Vault at launch (operational simplicity); external KMS when threat model demands.
- **Decider:** Owner.

### OD-23 — Rate-limit fail-closed vs fail-open
- **Open:** current `checkRateLimit` fails open (broken telemetry never takes chat offline).
- **Recommendation:** keep fail-open for availability with alerting on failure — architect/owner call.
- **Decider:** Owner.

### OD-24 — AI anomaly-tripwire thresholds
- **Open:** thresholds for automatic AI-abuse shutoff.
- **Recommendation:** propose from 30 days of capped `ai_events` data; start permissive.
- **Decider:** Owner.

---

## D. Product behavior

### OD-25 — Quota hit mid-flow UX (WS1 Q-3)
- **Open:** block-before-start vs block-at-save when a quota is hit mid voice-note.
- **Recommendation:** block-before-start with clear messaging; never lose a user's in-progress recording — offer save-as-draft.
- **Decider:** Owner.

### OD-26 — Magic-link expiry + resend throttling (WS1 Q-4)
- **Open:** values (e.g., 15-min expiry proposed).
- **Recommendation:** 15-min expiry; resend throttled 60s / 5 per hour.
- **Decider:** Owner.

### OD-27 — Vault code recovery policy (WS1 Q-8)
- **Open:** any recovery (loses privacy) vs strict "lost code = lost vault".
- **Options:** strict (recommended for a privacy product) with prominent warning at setup.
- **Recommendation:** strict; master-code strength rules + auto-lock timeout + brute-force lockout (thresholds need owner-set values).
- **Decider:** Owner.

### OD-28 — Export format + delivery (WS1 Q-10)
- **Open:** JSON + media archive? delivery method, link expiry, large-export handling.
- **Recommendation:** JSON + original media in ZIP; time-limited link (24h); async job with notification.
- **Decider:** Owner.

### OD-29 — Offline conflict policy (WS1 Q-11)
- **Open:** last-write-wins vs field merge vs user-pick; missed-reminder catch-up.
- **Recommendation:** last-write-wins for simple fields, user-pick for conflicts on the same note; missed reminders labeled on reconnect.
- **Decider:** Owner.

### OD-30 — Habits product behavior (WS1 Q-12)
- **Open:** `habits.ts` exists — full habit tracker or lightweight streaks?
- **Recommendation:** lightweight streaks at launch; full tracker is scope creep.
- **Decider:** Owner.

### OD-31 — Work spaces billing (WS1 Q-14)
- **Open:** same billing as family slots, or separate? Max spaces per user?
- **Recommendation:** workspaces count against the same space/slot quota; cap TBD with OD-01.
- **Decider:** Owner.

### OD-32 — Space-owner transfer (WS1 Q-15)
- **Open:** can a family manager hand off ownership? Last manager leaves/deactivates?
- **Recommendation:** explicit transfer flow; last-manager-leaving requires appointing a successor or dissolving the space (with member notice).
- **Decider:** Owner.

### OD-33 — Semantic search: pilot or defer (dedup: WS3, WS7 O-7)
- **Open:** pg_trgm (free, in-DB) vs pgvector vs external API.
- **Recommendation:** pg_trgm now (free, measured in D3); pgvector pilot only if relevance testing demands.
- **Decider:** Owner (agent recommends).

### OD-34 — Review-queue cadence + "on this day" (WS3)
- **Open:** surfacing cadence for memory review candidates; "on this day" default on/off.
- **Recommendation:** weekly digest default on; "on this day" on with opt-out.
- **Decider:** Owner.

### OD-35 — Governed-action proposal TTL (WS3)
- **Open:** proposed 24h.
- **Recommendation:** 24h; expired proposals need re-confirmation.
- **Decider:** Owner.

### OD-36 — Per-turn token ceiling for ReAct loop (WS3)
- **Open:** proposed numbers for per-turn ceiling + chat top-k.
- **Recommendation:** propose from measured p99 after D2 cap data; owner confirms.
- **Decider:** Owner.

### OD-37 — PWA offline scope (WS1 Q-20)
- **Open:** full read cache vs recent-N; deep-link auth for logged-out recipients.
- **Recommendation:** recent-N (30 days) read cache; logged-out deep links → magic-link handoff.
- **Decider:** Owner.

---

## E. UX / brand (brand gate: doc 23)

### OD-38 — Final visual direction ✅ RESOLVED
- **Resolved (owner, 2026-10-12):** v1.2 **"Modern Minimal AI + Human Memories"** — monochrome-first premium aesthetic — accepted as the design baseline. (v1.1 "Warm Archive" A+B was approved then superseded the same day; A/B/C proposals preserved in `VISUAL_IDENTITY_DIRECTIONS.md`.)
- **Rule:** baseline locked; refinements through the brand gate, never silently.
- **Decider:** Owner.

### OD-39 — Palette, typefaces, logo, motion, imagery, marketing voice — PARTIALLY OPEN
- **Baseline set by v1.2:** palette family (white/near-black/neutral grays + restrained blue/sage), typefaces (Inter + IBM Plex Sans Arabic, OFL).
- **Still OPEN (owner review):** final logo artwork (wordmark + app icon), final hex lock-in, polished screens, motion catalog, illustration style, copy tone.
- **Rule:** accessibility wins on any conflict.
- **Decider:** Owner.

### OD-40 — Arabic numerals: Eastern vs Western (WS2 O-2)
- **Open:** default Western EN / optional Eastern AR.
- **Recommendation:** Western default; Eastern as user setting.
- **Decider:** Owner.

### OD-41 — Marketing-site IA + copy (WS2 O-7)
- **Open:** owner is the voice of the brand.
- **Decider:** Owner.

### OD-42 — a11y CI tooling (WS2 O-5)
- **Open:** axe vs pa11y (target WCAG 2.2 AA fixed).
- **Recommendation:** axe (broader rule coverage).
- **Decider:** Owner (or delegated to agent — low stakes).

### OD-43 — Vault offline behavior (WS2 O-3)
- **Open:** locked offline vs cached with explicit opt-in.
- **Recommendation:** locked offline by default; opt-in cache with explicit warning (security review).
- **Decider:** Owner.

---

## F. Technical

### OD-44 — Realtime vs polling for sync invalidation (WS6 #3)
- **Open:** Realtime fan-out cost at scale unmeasured; fan-out test decides.
- **Recommendation:** Realtime now; revisit if D3 fan-out test shows cost blowup.
- **Decider:** Owner (agent recommends from test data).

### OD-45 — `index.tsx` / `client.ts` split strategy (WS6 #8)
- **Open:** big-bang split vs phased facade.
- **Recommendation:** phased facade (lower risk with concurrent workstreams).
- **Decider:** Owner.

### OD-46 — Chat-history vs saved-memory boundary (WS6 #9)
- **Open:** confirm no product surface treats `chat_sessions` (7-day) as durable memory.
- **Recommendation:** confirm as stated; add tripwire test.
- **Decider:** Owner.

### OD-47 — Edge runtime for factory cores (WS6 #6)
- **Open:** accept edge-only consumption of node:crypto cores vs wait for factory injection.
- **Recommendation:** edge-only now; injection is factory-side work outside Mawjood scope.
- **Decider:** Owner.

### OD-48 — Registry auth + publication state (WS6 #7)
- **Open:** UNKNOWN — prerequisite for all ADOPT/ADAPT.
- **Recommendation:** owner/infra resolves before D7.
- **Decider:** Owner.

### OD-49 — ai-provider-core gate ownership (WS1 Q-18)
- **Open:** who runs the three gates (compatibility, security, regression) and pass thresholds.
- **Recommendation:** agent runs gates; independent reviewer verifies; owner signs off on thresholds.
- **Decider:** Owner.

### OD-50 — PITR RTO/RPO targets (WS6 #5)
- **Open:** proposed 4h/15min — validate against first restore drill.
- **Recommendation:** adopt proposal pending drill validation.
- **Decider:** Owner.

### OD-51 — Analytics vendor (dedup: WS6 #10, WS7 O-8)
- **Open:** privacy-respecting minimal (self-hosted Plausible/PostHog) vs none; no SDKs until Privacy Policy covers them.
- **Recommendation:** PostHog self-hosted, policy first.
- **Decider:** Owner.

### OD-52 — Push provider (WS7 O-9)
- **Open:** Expo Push vs FCM/APNs direct; chunking at scale.
- **Recommendation:** Expo Push (already integrated); revisit on scale evidence.
- **Decider:** Owner.

### OD-53 — Sentry plan / error-tracking vendor (WS7 O-11)
- **Open:** free tier vs paid; data-scrubbing config.
- **Recommendation:** Sentry free tier at launch with PII scrubbing.
- **Decider:** Owner.

### OD-54 — Uptime monitoring vendor (WS7 O-12)
- **Open:** e.g., Better Stack / Checkly; alert routing.
- **Recommendation:** Better Stack (status page included — covers F-COM-08).
- **Decider:** Owner.

### OD-55 — Non-destructive maintenance cron schedule (WS7 O-17)
- **Open:** nightly vs weekly vs on-write-only (decision #7 forbids destructive).
- **Recommendation:** weekly gardener run; on-write for lightweight re-scoring.
- **Decider:** Owner.

### OD-56 — Support SLAs + channel (dedup: WS1 Q-16, WS5, WS7 O-10)
- **Open:** email-only vs in-app chat; response-time tiers; who answers.
- **Recommendation:** in-app contact → email at launch; 48h response SLA; staffing is owner's call.
- **Decider:** Owner.

### OD-57 — Status-page provider + incident language (WS1 Q-17)
- **Open:** provider; AR/EN both?
- **Recommendation:** same vendor as OD-54; bilingual incident posts.
- **Decider:** Owner.

### OD-58 — Prompt-injection residual risk posture (WS1 Q-19)
- **Open:** single-user self-injection — accept, mitigate further, or disclose?
- **Recommendation:** accept + disclose in security posture; destructive ops already multi-approved.
- **Decider:** Owner.

### OD-59 — Redirect-URL allowlist values (WS7 O-16)
- **Open:** production web origin(s) — dashboard action.
- **Decider:** Owner.

### OD-60 — Token/PAT revocation confirmation (WS7 O-20)
- **Open:** outstanding from D-1.1 — verify revocation of transient GitHub PAT + Oct-9 Supabase token, then close.
- **Decider:** Owner.

---

## Appendix — already decided (not open; listed to prevent re-litigation)

The 9 owner decisions (2026-10-12): durable memories; quotas designed-not-invented; Stripe in scope; vault gate off; 18+ only; trash 30-day; no destructive decay; indexes/janitors design+test only; ai-provider-core conditional. Full text: `docs/autonomous/d0/D0_TO_D05_HANDOFF.md`.

---

*End of open decisions. 60 items. None are approved. The agent must not invent approval for any of them.*
