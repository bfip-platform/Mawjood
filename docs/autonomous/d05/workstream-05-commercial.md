# D0.5 Workstream 05 — Commercial Readiness: Free/Plus, Quotas, Billing, Legal Gates

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** Design spec — planning only. No app code changes, no billing activation, no pricing decisions.
**Owner decisions in force:** #1 (durable memories — never delete), #2 (quotas designed not invented — numbers are PROPOSED options, owner finalizes), #3 (Stripe in commercial scope), #4 (vault paid-gate OFF until billing+entitlements ready), #5 (18+ only at launch), #6 (trash 30-day recovery), #7 (no destructive consolidation), #8 (indexes/janitors design+test only, never delete memories).

**ALL numeric values in this document are PROPOSED options.** Nothing here sets a price, a quota, or a limit. The owner finalizes every number. Each option carries rationale so the owner can pick on evidence, not on my authority.

Related: workstream 04 (AI usage limits, §4 of that spec — this doc's §3 is the commercial/policy layer on top of its technical budget design), workstream 01 (entitlement enforcement in code), D0 gap analysis `COMMERCIAL_READINESS_GAP_ANALYSIS.md`.

---

## 1. Free vs Plus entitlement matrix

### 1.1 Tier definition

Two tiers only at launch: **Free** (default on signup) and **Plus** (paid subscription). Tiers are data, not code branches: a `subscription_tier` value on the user (profile or dedicated `subscriptions` table — workstream 01 designs the schema) with values `free | plus`, plus an optional `manual` override row for staff grants/promos (§7). No other tiers at launch; the schema reserves room for future tiers without a data migration.

Current state (D0): there is no subscription tier field. `profiles` carries limit columns (`family_slots`, `secret_vaults_limit`, `chat_retention_days`, `trash_retention_days`, `custom_tabs_limit`); `admin-set-limits` mutates them with a manual audit log in `subscription_grants`; Free-tier values live in the app (client defaults). `0018_secret_multi_vault.sql` defaults `secret_vaults_limit` to 5 with a comment marking 1 at launch. Subscription UI has dead "soon" items that promise payment which does not exist.

### 1.2 Proposed entitlement matrix

| Feature | Free | Plus | Gating point |
|---|---|---|---|
| Spaces (Private / Family / Work) | 1 personal space; no family sharing | All 3 spaces + family sharing | `join-family` fn rejects non-plus host creation |
| Family slots (invited members) | 0 (family space unavailable) | Up to 5 (PROPOSED — see §2.4) | `space_invites` insert check |
| Secret vaults | 1 (per `0018` launch intent) | 5 (PROPOSED) | `vault-master` create check |
| AI chat (daily token budget) | Budget A (PROPOSED — see §3) | Budget B = ~4× Free | `chat` fn pre-check |
| AI chat per-hour ReAct cap | 200 calls/hr (existing anti-abuse; keep as hard ceiling for both) | 200 calls/hr | existing `_shared/rate-limit.ts` |
| AI extract / ask / transcribe | Same daily AI budget pool | Same, larger pool | shared budget accounting |
| Voice transcription minutes/month | Option in §2 | 4× Free | `transcribe` fn pre-check |
| Storage (notes + photos) | Option in §2 | Option in §2 | storage insert pre-check |
| Saved memories | Unlimited count within storage quota (decision #1 — never deleted for quota) | Same | N/A — see §2.5 |
| Chat history retention | 7 days (existing `chat_retention_days` default) | 90 days (PROPOSED) | retention janitor parameter |
| Trash recovery window | 30 days (decision #6 — both tiers) | 30 days | `trash_retention_days` |
| Custom tabs | 3 (existing default) | 10 (PROPOSED) | `custom_tabs_limit` |
| Export (GDPR data export) | Yes — export is a right, not a feature | Yes | no gate |
| Admin features | Not user-facing; staff only | Not user-facing | admin-token gate unchanged |

**What degrades vs what persists on downgrade** is §6. **What happens when a limit is hit** is §2.5.

### 1.3 Fail-closed entitlement checks — the fix

Current state (D0, code-evident): entitlement and rate checks are **fail-open**. `supabase/functions/_shared/rate-limit.ts:7` — "if the counter store errors, the request is allowed". Entitlement checks are fragmented across functions with no single service (gap analysis: "Fragmented, fail-open; no AI/storage quotas").

Proposed design (implementation is workstream 01; this is the contract it must satisfy):

1. **Single entitlement service** (`_shared/entitlements.ts`): one function `checkEntitlement(userId, feature)` returning `{ allowed, tier, reason, upgradeHint }`. Every AI and creation-path edge function calls it before doing work.
2. **Fail-CLOSED semantics:** if the entitlement lookup errors (store down, row missing, schema mismatch), the default answer is `allowed=false` with `reason='entitlement_unavailable'`, EXCEPT the client shows a specific "service temporarily unavailable — your data is safe" state (never a silent block, never a silent allow). Anti-abuse rate limiting keeps its existing fail-open behavior for pure availability (a broken counter must not take chat offline); **entitlement is the opposite direction — money and quotas must fail closed, or abuse is free.**
3. **Missing row policy:** a user with no tier row is treated as Free (deterministic default), logged to `ops_events`, and the row is backfilled lazily. This prevents "no row → unlimited" leaks.
4. **Tier cache:** functions may cache tier for ≤60s per request lifecycle only (request-scoped memo), never across requests — a downgrade mid-session must take effect on the next request.
5. **Audit:** every denied entitlement writes to `ops_events` (fn, user_id, feature, reason). Deny reasons are user-safe strings mapped in both locales (i18n parity enforced at compile, per existing convention).
6. **Manual grants override:** `admin-set-limits` / `admin-subscribe` write `subscription_grants` rows (existing table) that the entitlement service reads as `manual` tier — staff grants keep working after the tier system lands.

Acceptance bar for workstream 01: a test matrix covering {Free, Plus, manual, missing row, store error} × {chat, extract, transcribe, vault create, family invite} — all store-error cases deny; all missing-row cases behave as Free.

---

## 2. Memory + storage quota OPTIONS

Grounding constraints: decision #1 (no deletion by quota — a full quota **blocks new creation** and shows an upgrade nudge; existing saved memories are never deleted or degraded), decision #2 (options proposed, never invented — rationale tied to evidence), D0 perf target **<$0.50 / MAU / mo AI cost**, and the costing pipeline: `ai_events` (0030) already records `provider, model, prompt_tokens, completion_tokens` per call — the D0.5 benchmark plan uses it to size per-user caps (workstream 04 §4 owns the token-budget mechanism; this section owns the commercial quotas that consume it).

### 2.1 What is quota'd (and what is not)

- **Quota'd:** AI daily token budget (see §3), voice transcription minutes/month, total stored bytes (notes+photos), vault count, family slots, custom tabs, chat-history retention window.
- **NOT quota'd:** number of saved memories / facts (unbounded count within the storage byte cap — deleting to satisfy a count quota would violate decision #1; byte caps block *new* saves instead), trash contents during the 30-day window, exported data.

### 2.2 AI daily token budget options (per user, rolling 24h)

Rationale method (to be run before owner picks): aggregate `ai_events` over a pilot cohort → p50/p95 daily tokens per active user → set Free budget between p50 and p95 of *casual* use, Plus at 3–5× Free, both sized so that blended AI spend stays under $0.50/MAU/mo at GPT-5-mini pricing. Until that measurement exists, these are placeholders:

| Option | Free | Plus | Rationale |
|---|---|---|---|
| **A — Conservative** | 150k tokens/day | 600k tokens/day | Keeps worst-case Free cost ≈ $0.03/day at mini-tier pricing; generous enough for ~50 long chat turns |
| **B — Balanced (recommended pending data)** | 300k tokens/day | 1.2M tokens/day | ~100 long turns Free; matches observed "heavy but human" usage before rate-limit ceiling bites |
| **C — Generous** | 600k tokens/day | 2.4M tokens/day | Competitive with free-tier AI apps; relies on per-hour ReAct cap (200 calls/hr) as the real abuse brake |

All three keep the existing per-hour caps (200/hr chat) as an anti-abuse ceiling above the daily budget. PROPOSED — owner picks after `ai_events` analysis.

### 2.3 Storage options (total account bytes: notes text + photos)

Photos dominate. Rationale method: measure median photo size after client compression + median notes bytes per user from a pilot; size Free to cover ~1 year of typical use.

| Option | Free | Plus | Rationale |
|---|---|---|---|
| **A — Lean** | 500 MB | 5 GB | ~1,000 compressed photos Free; Supabase storage cost per GB is the binding constraint |
| **B — Balanced (recommended pending data)** | 1 GB | 10 GB | ~2,500 photos Free; Plus comfortably holds years of family vault photos |
| **C — Generous** | 2 GB | 20 GB | Marketing-simple "2 GB free"; watch storage unit economics at scale |

At-limit behavior (§2.5): new photo/note saves are **blocked with an upgrade nudge**; existing data fully readable and exportable. Voice transcription audio is already deleted post-transcription (audio policy) so it never counts against storage.

### 2.4 Other creation-limit options

| Limit | Free options | Plus options | Notes |
|---|---|---|---|
| Secret vaults | 1 (matches `0018` launch intent) | 5 / 10 / 20 | Vault = the Plus selling feature once gated (decision #4); don't starve Free to zero |
| Family slots | 0 | 3 / 5 / 10 | Family sharing is the headline Plus feature |
| Custom tabs | 3 (existing default) | 10 / 25 / 100 | Cheap to grant; generosity here costs nothing |
| Chat retention | 7 days (existing default) | 30 / 90 / 365 days | Retention janitor must be per-tier parameterized |
| Transcription min/mo | 30 / 60 / 120 | 120 / 300 / 600 | Groq Whisper free-tier is the upstream constraint — watch its limits |

### 2.5 At-limit behavior (binding rule)

When any quota is exceeded:
1. **Block the creation** — the write does not happen.
2. **Show an upgrade nudge** — specific, localizable: which limit, current usage, what Plus raises it to. No generic "limit reached".
3. **NEVER delete, degrade, or hide existing content.** Saved memories stay intact and searchable (decision #1). A user at 100% storage can still read, export, and delete their own data — they just can't add more until they're under quota or upgrade.
4. **Grace on the read path:** over-quota users are never locked out of their account or their data. Login, read, search, export always work.

---

## 3. AI usage limits + cost controls

This is the commercial/policy layer. The technical mechanism (token accounting from `ai_events`, budget enforcement in the `chat`/`extract`/`ask`/`transcribe`/`memory-learn` fns, spend telemetry) is designed in **workstream 04 §4** — that spec owns implementation; this section owns the policy this mechanism enforces.

### 3.1 Daily per-user token budget design

- **One budget pool per user per rolling 24h**, denominated in tokens, shared across `chat`, `ask`, `extract`, `memory-learn`, and `transcribe` (transcription tokens converted at a documented ratio or tracked as a separate minute-based budget — workstream 04 decides the accounting unit; the policy treats both as one "AI usage" concept in user-facing copy).
- **Pre-check before every model call:** sum of today's tokens + estimated cost of this call ≤ budget → proceed; else deny with `ai_budget_exhausted` + reset time + upgrade nudge. The ReAct loop's step budget must be reserved up front (5 steps × estimated tokens) so a turn never dies mid-loop.
- **Per-tier values:** Free = Budget A/B/C from §2.2 (owner picks); Plus = 3–5× Free (multiplier is itself an owner decision — propose 4× as default).
- **No rollover:** unused budget does not accumulate. Resets on a rolling 24h window (simpler to explain than calendar-day: "renews in X hours").
- **Abuse shutoff (separate from budget):** the existing per-minute/per-hour rate limits (`_shared/rate-limit.ts`: 20/min, 200/hr) stay as the abuse ceiling for BOTH tiers. A separate anomaly tripwire: sustained max-rate usage across N consecutive windows → temporary AI suspension + admin alert + user notice. Thresholds are owner-approved; design only.

### 3.2 Per-tier differentiation hooks

The budget service exposes `tier` so future differentiation needs no refactor: per-model routing (e.g., Plus gets longer context or newer model — explicitly NOT decided here), priority during provider congestion, higher ReAct step cap. Hooks only; no behavior change at launch.

### 3.3 Spend alerts (owner/operator-facing)

- Daily job aggregates `ai_events` → cost per user, per tier, per fn.
- Alerts at: single user > 3× their tier's expected daily cost (possible abuse/bug); tier-blended cost trending above $0.40/MAU/mo (early warning before the $0.50 target breaks); provider error-rate spike (costless retries burning budget).
- Alert destinations and thresholds are owner decisions; the design requires the pipeline to exist before billing goes live — **you cannot sell what you cannot meter.**

### 3.4 Cost-control ordering (defense in depth)

1. Per-call pre-check against daily budget (hard block).
2. ReAct step reservation (no mid-turn death).
3. Per-minute/per-hour anti-abuse caps (existing).
4. Anomaly tripwire → temporary suspension (owner-approved thresholds).
5. Spend alerts → human review → manual grant adjustment or ban via existing admin tooling.

---

## 4. Stripe architecture design (design-only — NO activation)

Decision #3 puts complete subscription/billing design in scope. Nothing here activates billing; activation needs owner approval of this design + explicit go-live authorization.

### 4.1 Product/price modeling

- Stripe **Products**: `Mawjood Plus` (one product).
- Stripe **Prices**: monthly and annual (annual = owner-decided discount; structure supports it, value TBD). Price *values* are owner decisions — this spec proposes structure only: `plus_monthly`, `plus_annual`, currency USD at launch (multi-currency later).
- **No per-seat pricing at launch.** Family slots are included in Plus (see §2.4), not billed per member — keeps the family story simple.
- **Trial:** no free trial of Plus at launch (the Free tier IS the trial). Trial support is designed in (see §4.3) so the owner can enable it later without code changes.

### 4.2 Checkout flow

1. User taps "Upgrade to Plus" → client calls backend `billing-checkout` fn (new; authenticated) with `{ price_id, success_url, cancel_url }`.
2. Fn verifies entitlement state (no duplicate active subscription), creates/reuses the Stripe **Customer** (keyed by `stripe_customer_id` on the user record), creates a **Checkout Session** (`mode=subscription`), returns the session URL.
3. Client redirects to Stripe-hosted Checkout (no card data touches our code — PCI scope stays with Stripe).
4. On success → return to app → app polls/receives webhook → tier flips to `plus` (see §4.3/§5).
5. **Idempotency:** Checkout Session creation uses an idempotency key `checkout:{user_id}:{price_id}:{day}` — double-taps create one session.

### 4.3 Webhook endpoint design

- New edge fn `billing-webhook`: raw body preserved (no JSON pre-parse), **signature verification** with the Stripe webhook secret on every request — unverified requests are rejected with 400 before any processing.
- **Idempotency keys:** every handled event recorded in a `stripe_events` table by `event.id` (unique constraint); duplicates are acknowledged without re-processing. Processing is transactional: apply tier change + record event atomically.
- **Events handled (minimum):** `checkout.session.completed` (→ tier=plus, store subscription id), `customer.subscription.updated` (→ tier/status sync, plan changes), `customer.subscription.deleted` (→ start grace/downgrade flow, §5), `invoice.payment_failed` (→ dunning entry, §5), `invoice.payment_succeeded` (→ clear dunning state), `customer.subscription.trial_will_end` (if trials enabled later).
- **Replay safety:** handler logic is written so re-delivery of any event converges to the same tier state (upsert semantics, never blind increments).
- Webhook secret rotation: support two active secrets during rotation (primary + previous, 48h overlap) — owner/ops procedure.

### 4.4 Subscription lifecycle

- **Upgrade (Free→Plus):** immediate tier flip on `checkout.session.completed`. Proration: n/a on first purchase (full period starts now).
- **Plan change (monthly↔annual):** Stripe subscription update with `proration_behavior=create_prorations` (owner confirms proration policy — see §10). Tier stays `plus` throughout; only the price id changes.
- **Renewal:** automatic via Stripe; `invoice.payment_succeeded` keeps tier. Failed renewal → dunning (§5).
- **Cancel:** user cancels via Customer Portal (see §4.5) or support. `cancel_at_period_end=true` — **Plus stays active until the paid period ends** (no mid-period cutoff; this is the refund policy's companion). At period end → `customer.subscription.deleted` → grace → downgrade (§5).
- **Reactivation:** resubscribe before period end clears the cancel flag; after downgrade it's a fresh Checkout.

### 4.5 Customer portal

Stripe **Billing Customer Portal**: payment-method update, plan switch (monthly↔annual), cancel, invoice history download. Linked from app Settings → "Manage subscription". Configuration (which portal features are enabled) is an owner decision; the design routes ALL subscription self-service through the portal — no custom card forms, ever.

### 4.6 Payment failures + dunning

Dunning policy needs owner approval (see §10); the design supports either choice:
- **Proposed default:** on `invoice.payment_failed`: day 0 — email + in-app notice ("payment failed, update your card"); Plus stays fully active through a **7-day grace period** (PROPOSED); day 7 — second notice; day 14 (PROPOSED) — if still unpaid, subscription cancelled → §5 grace/downgrade flow. Smart retries left to Stripe's default retry schedule.
- No service degradation *during* dunning until the final downgrade — a failed card must not silently eat memories or features mid-dispute.

### 4.7 Refunds

Refund *policy* is an owner decision (see §10). The design supports: full/partial refunds via Stripe Dashboard or a staff admin action (logged, never user self-service); on refund of the current period, tier handling follows the chosen policy (options: keep Plus to period end [recommended — simplest and fairest], or immediate downgrade). Refund events (`charge.refunded`) are logged to `ops_events` and surfaced in admin.

### 4.8 Invoices

Stripe-hosted invoices (PDF + hosted URL) via the Customer Portal; invoice history is the source of truth — no parallel invoice store. `invoice.payment_succeeded` / `invoice.finalized` events archived for tax records.

### 4.9 Tax considerations (design surface, not advice)

- Stripe Tax **or** manual tax behavior per jurisdiction — owner + tax advisor decide; the design must not hard-code "no tax".
- Required business inputs before activation: legal entity name/address, tax IDs, which jurisdictions have nexus (owner provides; this is the §10 tax-nexus decision).
- Invoices must carry whatever tax lines Stripe computes; the app never computes tax itself.

---

## 5. Grace periods + entitlement reconciliation

### 5.1 Failed payment → grace UX → downgrade

| Phase | Trigger | User experience | Entitlement state |
|---|---|---|---|
| Active | — | Full Plus | `plus` |
| Dunning | `invoice.payment_failed` | Banner + email: "card failed — update to keep Plus"; everything still works | `plus` (unchanged) |
| Grace | 7 days past due (PROPOSED) | Stronger banner; portal link; countdown | `plus` (unchanged) |
| Downgrade pending | 14 days past due (PROPOSED) or subscription deleted | "Plus ends in 48h — update payment or your limits return to Free" | `plus` |
| Downgraded | Period end / cancel effective | "You're on Free now" summary: what changed (see §6); data intact | `free` |

Durations (7/14/48h) are PROPOSED — owner sets dunning policy (§10).

### 5.2 Reconciliation job design

A scheduled job (pg_cron or edge fn on schedule — workstream 01/02 picks the mechanism) runs at least daily:

1. Pulls active Stripe subscriptions for customers with `stripe_customer_id`.
2. Compares Stripe truth vs local `subscription_tier`.
3. **Stripe is the source of truth for paid status; local DB is the enforcement cache.** On mismatch: if Stripe says active → set `plus` (+ clear dunning flags); if Stripe says cancelled/past_due-beyond-grace → run the downgrade flow.
4. Every change writes an audit row (who/what/when/why) — the exemption audit trail (§7) uses the same table.
5. **The job NEVER deletes memories, photos, notes, vaults, or spaces.** Downgrade only flips the tier and re-applies Free creation limits going forward. Content created while Plus stays readable forever (decision #1). The job's blast radius is limited to tier flags and limit columns — code review must verify no DELETE touches user content tables.

---

## 6. Data preservation after cancellation (Plus → Free)

Binding rule from decision #1: **cancellation never deletes anything.** The D0 verification noted "memories intact per D0 verification" on downgrade — this section makes it a contractual matrix.

| What | After downgrade to Free | Why |
|---|---|---|
| All saved memories, notes, photos, tasks, items | Fully intact, readable, searchable, exportable | Decision #1 |
| Trash contents | 30-day window continues (decision #6) | Same |
| Extra vaults (beyond Free limit of 1) | **Kept and readable**; cannot create new vaults until at/below Free limit | Deleting vaults would violate #1; locking read access would be a hostage pattern |
| Family space + members | **Kept and readable**; inviting new members blocked; if member count > Free allowance, no one is removed | Churn-safe removal precedent (behavioral test 6) extends to downgrade |
| Chat history beyond 7 days | **Kept and readable**; retention janitor only trims history created *after* downgrade below the Free window | Retention applies prospectively, never retroactively deletes paid-era history |
| Custom tabs beyond 3 | Kept visible; cannot add more until ≤ Free limit | Same principle |
| AI daily budget | Drops to Free budget at next reset | Forward-looking only |
| Storage over Free cap | Fully readable; new uploads blocked until under cap or re-upgrade | §2.5 |

**Downgrade UX requirement:** a single "What changed" screen at downgrade listing exactly which limits now apply, with per-item state ("kept", "paused", "blocked until…"). No surprise degradation. Re-upgrade restores full Plus behavior immediately with zero data migration.

---

## 7. Admin exemptions + promotions

The admin console already has bans, grants, plans, promos (D0: "Best-in-repo"). This section specifies the commercial controls on top.

- **Manual grants:** `admin-subscribe` / `admin-set-limits` remain the staff path for comp accounts, support recovery, and beta grants. Every grant writes to `subscription_grants` (existing table: kind, when granted, when expires) — expiry is mandatory for comp/promo grants (no permanent manual Plus except staff accounts, which are flagged).
- **Promo codes:** Stripe Promotion Codes for discounts (percent/amount, expiry, max redemptions) — created in Stripe Dashboard, applied at Checkout. No custom promo-code engine. Redemption events logged.
- **Exemption audit trail:** one table (extend `subscription_grants` or new `entitlement_audit`) recording: admin identity, target user, action (grant/revoke/extend), tier/limits changed, reason (free text, required), expiry, timestamp. Readable in admin console. This is a compliance surface — support disputes and refund decisions depend on it.
- **Abuse guard:** grants above a threshold (e.g., > 90 days or > N users — owner sets) require a second admin's note; the audit trail makes this reviewable even without hard enforcement at launch.

---

## 8. 18+ enforcement

Decision #5: 18+ only at launch. No child accounts, no child-specific features.

### 8.1 Registration gate design

- **Minimum (launch):** self-declaration at signup — a required checkbox "I confirm I am 18 or older" on the registration/auth screen, in both locales (i18n parity). Declining blocks account creation. The declaration + timestamp is stored on the profile (evidence of the gate, not proof of age).
- **Documented stronger options (open, not decided):** (a) credit-card ownership check at Plus purchase (weak signal, not IDV); (b) third-party age-verification vendor at signup (adds friction + cost + privacy surface); (c) ID document verification for flagged accounts. The owner picks if/when; the schema reserves an `age_verified` tri-state (`unverified | self_declared | verified`) so a stronger check can land without migration.
- **No age-gating inside the app beyond signup:** once the gate passes, no per-feature age checks at launch. If future features need it, the tri-state field supports it.

### 8.2 Terms + Privacy Policy requirements list

The legal documents themselves are **owner/legal drafting** — this spec lists required contents so nothing is missed:

**Terms of Service must cover:** 18+ eligibility and the self-declaration; Free vs Plus description and that Plus features/prices can change with notice; subscription, renewal, cancellation, and refund terms (mirror §4); acceptable use (no illegal content, no abuse of AI features, no scraping/sharing of other users' vault content); AI-specific disclosures (outputs may be inaccurate; not professional advice — medical, legal, financial); account termination for abuse with data-retention-on-termination terms (30-day trash window + export right survive termination notice); limitation of liability; governing law and dispute resolution; change-of-terms notice procedure.

**Privacy Policy must cover:** what is collected (account data, notes/photos/voice, AI telemetry without message content per `ai_events` design, payment data handled by Stripe); voice-audio deletion policy (transcribe-then-delete, per existing audio policy); photo handling; how AI providers process data (Groq, OpenAI — no training on user data claims must be verified against current provider terms at drafting time); data retention (durable memories, 30-day trash, telemetry janitor windows); user rights (export, delete — backends exist); no sale of personal data; 18+ and no knowing collection from children; contact for privacy requests; DPA availability for any B2B/family-admin processing.

**Consent capture:** ToS + Privacy acceptance timestamped at signup (versioned — re-accept on material change). Without this, the backends have no policy to point to (D0 gap #2).

---

## 9. Support path design

D0 gap: "Good onboarding; no help/FAQ/contact."

- **In-app help:** Settings → Help: searchable FAQ (bilingual, same i18n parity rule), covering: Free vs Plus limits, what happens at quota, downgrade/data-preservation answers (link §6 matrix in plain language), payment/portal how-tos, 18+ and privacy basics, "how to export/delete my data".
- **Contact:** in-app contact form → creates a support ticket (email-backed at launch; owner picks the helpdesk later). The form pre-fills app version + tier (never message content) to cut triage time.
- **Status/incident:** a status page or pinned notice channel for outages (D0 gap #10) — design the slot now even if the page ships later.
- **Support SLAs:** OPEN DECISION for the owner (§10) — propose: Plus < 24h first response, Free < 72h; no phone support at launch. Staffing a support queue is an operational commitment, not just a page.

---

## 10. Acceptance criteria + what needs owner approval

### Acceptance criteria for this workstream (spec completeness)

- [ ] Entitlement matrix (§1) covers every user-facing feature with a gating point named.
- [ ] Fail-closed contract (§1.3) is testable: deny-on-error, Free-on-missing-row, audit on deny.
- [ ] Every quota number in §2 is marked PROPOSED with a stated evidence method (`ai_events` analysis, storage measurement, $0.50/MAU/mo target).
- [ ] At-limit and downgrade behavior (§2.5, §6) provably deletes nothing — reviewable against decision #1.
- [ ] Stripe design (§4) covers checkout, webhooks (signature + idempotency), lifecycle, proration, dunning, refunds, invoices, tax surface — with zero activation.
- [ ] Reconciliation job (§5.2) has a bounded blast radius (tier flags only).
- [ ] 18+ gate (§8) has a launch-minimum design + stronger options documented + legal contents list.
- [ ] Support path (§9) has FAQ/contact/status slots with SLAs flagged open.

### Explicit owner-approval list (nothing below is decided here)

1. **Prices:** Plus monthly and annual price points (currency USD at launch proposed).
2. **Final quota numbers:** pick one option per row in §2.2–§2.4 (or supply alternates) AFTER the `ai_events`/storage measurement runs.
3. **AI budget multiplier:** Plus = 4× Free proposed (§3.1).
4. **Dunning policy:** grace durations (7d grace / 14d downgrade proposed), retry behavior, final-downgrade timing.
5. **Refund policy:** window and tier-handling on refund (§4.7).
6. **Proration policy:** `create_prorations` on plan change proposed (§4.4).
7. **Tax nexus:** jurisdictions, Stripe Tax on/off, legal entity details (§4.9) — with tax advisor.
8. **Trial of Plus:** enable or not, length (§4.1/§4.3).
9. **Support SLAs:** response targets per tier (§9).
10. **Age-verification strength:** self-declaration at launch vs a stronger check (§8.1).
11. **Anomaly-tripwire thresholds** for AI abuse shutoff (§3.1).
12. **Billing go-live:** separate explicit authorization AFTER this design is approved — design approval ≠ activation.

---

*End of workstream 05 spec. Cross-refs: workstream 04 §4 (AI budget mechanism), workstream 01 (entitlement implementation), D0 decisions #1–#9.*
