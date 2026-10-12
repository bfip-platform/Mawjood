# D0.5 — Billing, Entitlements & Quotas

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Sources:** `docs/autonomous/d05/workstream-05-commercial.md` + `docs/autonomous/d05/workstream-03-memory-ai.md` §4.4 (quota options merged — task M1)
**Mission scope:** design-only. No app code changes, no billing activation, no pricing decisions.

**Owner decisions enforced:** #1 (durable memories — quotas block creation, never delete), #2 (**ALL numeric values are PROPOSED options — nothing is finalized; owner picks on evidence**), #3 (Stripe in commercial scope), #4 (vault paid-gate OFF until billing+entitlements ready), #5 (18+ only), #6 (trash 30-day).

Related: `SECURITY_PRIVACY_AND_RETENTION_SPEC.md` §4 (AI token-budget mechanism — this doc owns the commercial/policy layer), `MEMORY_AND_AI_PRODUCT_SPEC.md` §4 (fact-cap block-on-overflow behavior).

---

## 1. Free vs Plus entitlement matrix

### 1.1 Tier definition
Two tiers at launch: **Free** (default on signup) and **Plus** (paid subscription). Tiers are data, not code branches: a `subscription_tier` value (`free | plus`) plus an optional `manual` override row for staff grants/promos (§7). No other tiers at launch; the schema reserves room for future tiers without a data migration.

Current state (D0): no subscription tier field. `profiles` carries limit columns (`family_slots`, `secret_vaults_limit`, `chat_retention_days`, `trash_retention_days`, `custom_tabs_limit`); `admin-set-limits` mutates them with a manual audit log in `subscription_grants`. Subscription UI has dead "soon" items that promise payment which does not exist.

### 1.2 Proposed entitlement matrix

| Feature | Free | Plus | Gating point |
|---|---|---|---|
| Spaces (Private / Family / Work) | 1 personal space; no family sharing | All 3 spaces + family sharing | `join-family` fn rejects non-plus host creation |
| Family slots (invited members) | 0 | Up to 5 (PROPOSED — §2) | `space_invites` insert check |
| Secret vaults | 1 (per `0018` launch intent) | 5 (PROPOSED — §2) | `vault-master` create check |
| AI chat (daily token budget) | Budget A/B/C (PROPOSED — §2) | ~4× Free (multiplier PROPOSED) | `chat` fn pre-check |
| AI chat per-hour ReAct cap | 200 calls/hr (existing anti-abuse; both tiers) | 200 calls/hr | `_shared/rate-limit.ts` |
| AI extract / ask / transcribe | Same daily AI budget pool | Same, larger pool | shared budget accounting |
| Voice transcription | Minutes/month per §2 | 4× Free | `transcribe` fn pre-check |
| Storage (notes + photos) | Per §2 | Per §2 | storage insert pre-check |
| Saved memories | Unlimited count within storage quota (decision #1) | Same | N/A — §2.5 |
| Chat history retention | 7 days (existing default) | 90 days (PROPOSED) | retention janitor parameter |
| Trash recovery window | 30 days (decision #6 — both tiers) | 30 days | `trash_retention_days` |
| Custom tabs | 3 (existing default) | 10 (PROPOSED) | `custom_tabs_limit` |
| Export (GDPR data export) | Yes — a right, not a feature | Yes | no gate |
| Admin features | Staff only | Staff only | admin-token gate unchanged |

### 1.3 Fail-closed entitlement checks
Current state (D0, code-evident): entitlement and rate checks are **fail-open** (`rate-limit.ts:7` — counter-store errors allow the request); entitlement checks are fragmented with no single service.

Contract for the implementation (workstream: technical architecture):
1. **Single entitlement service** (`_shared/entitlements.ts`): `checkEntitlement(userId, feature) → { allowed, tier, reason, upgradeHint }`. Every AI and creation-path edge function calls it before work.
2. **Fail-CLOSED:** entitlement lookup errors (store down, row missing, schema mismatch) → `allowed=false`, `reason='entitlement_unavailable'`, with a specific "service temporarily unavailable — your data is safe" client state (never silent block, never silent allow). Anti-abuse rate limiting keeps fail-open for availability; **entitlement is the opposite direction — money and quotas fail closed, or abuse is free.**
3. **Missing row:** treated as Free (deterministic default), logged to `ops_events`, backfilled lazily. Prevents "no row → unlimited" leaks.
4. **Tier cache:** request-scoped memo only (≤60s); never across requests — mid-session downgrade takes effect on the next request.
5. **Audit:** every denial writes to `ops_events` (fn, user_id, feature, reason); deny reasons user-safe and localized with i18n parity.
6. **Manual grants:** `admin-set-limits` / `admin-subscribe` write `subscription_grants` rows read as `manual` tier — staff grants keep working.

Acceptance bar: test matrix {Free, Plus, manual, missing row, store error} × {chat, extract, transcribe, vault create, family invite} — all store-error cases deny; all missing-row cases behave as Free.

---

## 2. Unified quota table — MERGE M1 (ALL VALUES PROPOSED)

**Binding rules (decisions #1, #2):** quotas **block new creation** — they never delete, degrade, or hide existing content. Every number below is a PROPOSED option with rationale; the owner finalizes after evidence runs (`ai_events` analysis, storage measurement). Grandfathering: users already over a new cap keep everything; only *new* saves block.

**What is quota'd:** AI daily token budget, voice transcription minutes/month, total stored bytes (notes+photos), vault count, family slots, custom tabs, chat-history retention window, memory fact count (WS3 axis — block-not-delete).
**NOT quota'd:** trash contents during the 30-day window, exported data.

### 2.1 AI daily token budget (per user, rolling 24h)

Rationale method: aggregate `ai_events` over a pilot cohort → p50/p95 daily tokens per active user → Free budget between p50–p95 of casual use, Plus 3–5× Free, blended spend under the D0 target **$0.50/MAU/mo** at GPT-5-mini pricing. Placeholders until measured:

| Option | Free | Plus | Rationale |
|---|---|---|---|
| **A — Conservative** | 150k tokens/day | 600k tokens/day | Worst-case Free ≈ $0.03/day; ~50 long chat turns |
| **B — Balanced** | 300k tokens/day | 1.2M tokens/day | ~100 long turns Free; matches observed heavy-but-human use before the 200/hr ceiling bites |
| **C — Generous** | 600k tokens/day | 2.4M tokens/day | Competitive with free-tier AI apps; per-hour ReAct cap remains the abuse brake |

All three keep the existing per-hour caps (200/hr) as the anti-abuse ceiling above the daily budget.

### 2.2 Storage (total account bytes: notes text + photos)

Photos dominate. Rationale method: median photo size after client compression + median notes bytes per user from a pilot; Free sized to ~1 year of typical use.

| Option | Free | Plus | Rationale |
|---|---|---|---|
| **A — Lean** | 500 MB | 5 GB | ~1,000 compressed photos Free; storage unit economics bind first |
| **B — Balanced** | 1 GB | 10 GB | ~2,500 photos Free; Plus holds years of family vault photos |
| **C — Generous** | 2 GB | 20 GB | Marketing-simple "2 GB free"; watch costs at scale |

At-limit: new photo/note saves **blocked with an upgrade nudge**; existing data fully readable and exportable. Transcription audio never counts (deleted post-transcription per audio policy).

### 2.3 Memory fact count (WS3 axis — block-not-delete)

Rationale basis: a fact row is ~1 KB including indexes; 10,000 facts ≈ ~10 MB/user — negligible storage. The binding constraint is **AI cost** (extraction calls scale with write volume). Quotas gate *creation velocity and store size* as a proxy for AI spend, not disk.

| Option | Free cap | Plus cap | Rationale |
|---|---|---|---|
| **A — generous free** | 500 facts | 5,000 facts | ~2 years of heavy use; Plus effectively unlimited for a family |
| **B — tight free, roomy plus** | 200 facts | 2,000 facts | Meaningful paid differentiation on the core value prop; free ≈ 6 months of active use; lowest AI-cost exposure |
| **C — usage-based** | 100 new facts/month (rolling), store uncapped | 1,000 new facts/month (rolling), store uncapped | Quota tracks the actual cost driver (creation/extraction calls); the store itself never has a ceiling. More complex to communicate. |

### 2.4 Other creation limits

| Limit | Free options | Plus options | Notes |
|---|---|---|---|
| Secret vaults | 1 (matches `0018` launch intent) | 5 / 10 / 20 | Vault = the Plus selling feature once gated (decision #4); don't starve Free to zero |
| Family slots | 0 | 3 / 5 / 10 | Family sharing is the headline Plus feature |
| Custom tabs | 3 (existing default) | 10 / 25 / 100 | Cheap to grant; generosity costs nothing |
| Chat retention | 7 days (existing default) | 30 / 90 / 365 days | Retention janitor per-tier parameterized |
| Transcription min/mo | 30 / 60 / 120 | 120 / 300 / 600 | Groq Whisper free-tier is the upstream constraint |

### 2.5 At-limit behavior (binding rule)
1. **Block the creation** — the write does not happen.
2. **Show an upgrade nudge** — specific and localizable: which limit, current usage, what Plus raises it to. No generic "limit reached".
3. **NEVER delete, degrade, or hide existing content.** Saved memories stay intact and searchable (decision #1). A user at 100% storage can still read, export, and delete their own data — just not add more until under quota or upgraded.
4. **Grace on the read path:** over-quota users are never locked out of their account or data. Login, read, search, export always work.

---

## 3. AI usage limits + cost controls (commercial/policy layer)

The technical mechanism (token accounting from `ai_events`, budget enforcement, spend telemetry) is in `SECURITY_PRIVACY_AND_RETENTION_SPEC.md` §4 — this section owns the policy it enforces.

### 3.1 Daily per-user token budget
- **One budget pool per user per rolling 24h** (tokens), shared across `chat`, `ask`, `extract`, `memory-learn`, `transcribe` (transcription tracked as minutes or token-equivalent — mechanism decides; user-facing copy treats both as "AI usage").
- **Pre-check before every model call:** today's tokens + estimated call cost ≤ budget → proceed; else deny with `ai_budget_exhausted` + reset time + upgrade nudge. The ReAct loop reserves its step budget up front (5 steps × estimated tokens) so a turn never dies mid-loop.
- **Per-tier values:** §2.1 (owner picks); Plus = 3–5× Free (multiplier PROPOSED 4× — owner decides).
- **No rollover.** Rolling 24h window ("renews in X hours" — simpler than calendar-day).
- **Abuse shutoff (separate from budget):** existing per-minute/per-hour caps (20/min, 200/hr) stay as the abuse ceiling for BOTH tiers. Anomaly tripwire: sustained max-rate usage across N consecutive windows → temporary AI suspension + admin alert + user notice. Thresholds owner-approved; design only.

### 3.2 Per-tier differentiation hooks
The budget service exposes `tier` so future differentiation needs no refactor: per-model routing, priority during provider congestion, higher ReAct step cap. Hooks only; no behavior change at launch.

### 3.3 Spend alerts (owner/operator-facing)
- Daily aggregation of `ai_events` → cost per user, per tier, per fn.
- Alerts: single user > 3× their tier's expected daily cost (abuse/bug); tier-blended cost trending above $0.40/MAU/mo (early warning before the $0.50 target breaks); provider error-rate spike.
- Alert destinations and thresholds are owner decisions; the pipeline must exist before billing goes live — **you cannot sell what you cannot meter.**

### 3.4 Cost-control ordering (defense in depth)
1. Per-call pre-check against daily budget (hard block). 2. ReAct step reservation. 3. Per-minute/per-hour anti-abuse caps. 4. Anomaly tripwire → temporary suspension (owner-approved thresholds). 5. Spend alerts → human review → manual grant adjustment or ban via admin tooling.

---

## 4. Stripe architecture design (design-only — NO activation)

Decision #3 puts complete subscription/billing design in scope. Activation needs owner approval of this design + explicit go-live authorization.

### 4.1 Product/price modeling
- Stripe **Products**: `Mawjood Plus` (one product). **Prices**: monthly and annual (annual discount value TBD — owner decides; structure supports it). Currency USD at launch (multi-currency later). **Price values are owner decisions — structure only here.**
- **No per-seat pricing at launch.** Family slots included in Plus (§2.4), not billed per member.
- **No Plus free trial at launch** (Free IS the trial). Trial support designed in so the owner can enable it later without code changes.

### 4.2 Checkout flow
1. User taps "Upgrade to Plus" → backend `billing-checkout` fn (new; authenticated) with `{ price_id, success_url, cancel_url }`.
2. Fn verifies entitlement state (no duplicate active subscription), creates/reuses the Stripe **Customer** (keyed by `stripe_customer_id`), creates a **Checkout Session** (`mode=subscription`), returns the session URL.
3. Client redirects to Stripe-hosted Checkout (no card data touches our code — PCI scope stays with Stripe).
4. On success → app polls/receives webhook → tier flips to `plus` (§4.3/§5).
5. **Idempotency:** key `checkout:{user_id}:{price_id}:{day}` — double-taps create one session.

### 4.3 Webhook endpoint design
- New edge fn `billing-webhook`: raw body preserved, **signature verification** with the webhook secret on every request — unverified → 400 before any processing.
- **Idempotency:** `stripe_events` table keyed by `event.id` (unique); duplicates acknowledged without re-processing. Tier change + event record applied atomically.
- **Events handled (minimum):** `checkout.session.completed` (→ tier=plus, store subscription id), `customer.subscription.updated` (tier/status sync, plan changes), `customer.subscription.deleted` (→ grace/downgrade, §5), `invoice.payment_failed` (→ dunning, §5), `invoice.payment_succeeded` (clear dunning), `customer.subscription.trial_will_end` (if trials later).
- **Replay safety:** upsert semantics — re-delivery converges to the same tier state.
- Webhook secret rotation: two active secrets during rotation (primary + previous, 48h overlap).

### 4.4 Subscription lifecycle
- **Upgrade (Free→Plus):** immediate tier flip on `checkout.session.completed`. No proration on first purchase.
- **Plan change (monthly↔annual):** subscription update with `proration_behavior=create_prorations` (PROPOSED — owner confirms proration policy). Tier stays `plus`; only price id changes.
- **Renewal:** automatic; `invoice.payment_succeeded` keeps tier. Failed renewal → dunning (§5).
- **Cancel:** via Customer Portal (§4.5) or support. `cancel_at_period_end=true` — **Plus stays active until the paid period ends** (no mid-period cutoff). At period end → `customer.subscription.deleted` → grace → downgrade (§5).
- **Reactivation:** resubscribe before period end clears the cancel flag; after downgrade it's a fresh Checkout.

### 4.5 Customer portal
Stripe **Billing Customer Portal** for ALL subscription self-service: payment-method update, plan switch, cancel, invoice history. Linked from Settings → "Manage subscription". Enabled portal features are an owner decision. No custom card forms, ever.

### 4.6 Payment failures + dunning
Dunning policy needs owner approval; design supports either choice. **Proposed default:** `invoice.payment_failed` → day 0 email + in-app notice; Plus stays fully active through a **7-day grace period** (PROPOSED); day 7 second notice; day 14 (PROPOSED) — if still unpaid, subscription cancelled → §5 downgrade flow. Stripe's default retry schedule for smart retries. No service degradation *during* dunning until the final downgrade.

### 4.7 Refunds
Refund *policy* is an owner decision. Design supports: full/partial refunds via Stripe Dashboard or staff admin action (logged, never user self-service); on current-period refund, tier handling follows the chosen policy (PROPOSED: keep Plus to period end — simplest and fairest). `charge.refunded` logged to `ops_events`, surfaced in admin.

### 4.8 Invoices
Stripe-hosted invoices (PDF + hosted URL) via the Customer Portal; invoice history is the source of truth — no parallel invoice store. `invoice.payment_succeeded` / `invoice.finalized` archived for tax records.

### 4.9 Tax considerations (design surface, not advice)
Stripe Tax **or** manual tax behavior per jurisdiction — owner + tax advisor decide; the design must not hard-code "no tax". Required inputs before activation: legal entity name/address, tax IDs, nexus jurisdictions (owner provides). The app never computes tax itself.

---

## 5. Grace periods + entitlement reconciliation

### 5.1 Failed payment → grace → downgrade

| Phase | Trigger | User experience | Entitlement state |
|---|---|---|---|
| Active | — | Full Plus | `plus` |
| Dunning | `invoice.payment_failed` | Banner + email: "card failed — update to keep Plus"; everything works | `plus` |
| Grace | 7 days past due (PROPOSED) | Stronger banner; portal link; countdown | `plus` |
| Downgrade pending | 14 days past due (PROPOSED) or subscription deleted | "Plus ends in 48h — update payment or limits return to Free" | `plus` |
| Downgraded | Period end / cancel effective | "You're on Free now" summary of what changed (§6); data intact | `free` |

Durations (7/14/48h) PROPOSED — owner sets dunning policy.

### 5.2 Reconciliation job design
Scheduled job (pg_cron or edge fn — mechanism picked in technical architecture), at least daily:
1. Pulls active Stripe subscriptions for customers with `stripe_customer_id`.
2. Compares Stripe truth vs local `subscription_tier`. **Stripe is the source of truth for paid status; local DB is the enforcement cache.**
3. Mismatch: Stripe active → set `plus` (+ clear dunning flags); Stripe cancelled/past-due-beyond-grace → downgrade flow.
4. Every change writes an audit row (who/what/when/why) — shared with the exemption audit trail (§7).
5. **Blast radius bounded to tier flags and limit columns.** The job NEVER deletes memories, photos, notes, vaults, or spaces. Code review must verify no DELETE touches user content tables.

---

## 6. Data preservation after cancellation (Plus → Free)

Binding rule (decision #1): **cancellation never deletes anything.**

| What | After downgrade to Free | Why |
|---|---|---|
| All saved memories, notes, photos, tasks, items | Fully intact, readable, searchable, exportable | Decision #1 |
| Trash contents | 30-day window continues (decision #6) | Same |
| Extra vaults (beyond Free limit of 1) | **Kept and readable**; new vault creation blocked until at/below Free limit | Deleting vaults would violate #1; locking read access would be a hostage pattern |
| Family space + members | **Kept and readable**; new invites blocked; no member removed for exceeding allowance | Churn-safe precedent extends to downgrade |
| Chat history beyond 7 days | **Kept and readable**; janitor only trims history created *after* downgrade below the Free window | Retention applies prospectively, never retroactively |
| Custom tabs beyond 3 | Kept visible; cannot add more until ≤ Free limit | Same principle |
| AI daily budget | Drops to Free budget at next reset | Forward-looking only |
| Storage over Free cap | Fully readable; new uploads blocked until under cap or re-upgrade | §2.5 |

**Downgrade UX:** a single "What changed" screen listing exactly which limits now apply, per-item state ("kept", "paused", "blocked until…"). No surprise degradation. Re-upgrade restores full Plus immediately with zero data migration.

---

## 7. Admin exemptions + promotions

The admin console already has bans, grants, plans, promos (D0: "best-in-repo"). Commercial controls on top:
- **Manual grants:** `admin-subscribe` / `admin-set-limits` for comp accounts, support recovery, beta grants. Every grant writes to `subscription_grants` (kind, granted-at, expires-at) — expiry mandatory for comp/promo grants (no permanent manual Plus except flagged staff accounts).
- **Promo codes:** Stripe Promotion Codes (percent/amount, expiry, max redemptions) — created in Stripe Dashboard, applied at Checkout. No custom promo engine. Redemption events logged.
- **Exemption audit trail:** `subscription_grants` (extended) or new `entitlement_audit`: admin identity, target user, action, tier/limits changed, reason (required free text), expiry, timestamp. Readable in admin console. Compliance surface for support disputes and refunds.
- **Abuse guard:** grants above a threshold (PROPOSED: >90 days or >N users — owner sets) require a second admin's note; the audit trail makes this reviewable even without hard enforcement at launch.

---

## 8. 18+ enforcement (decision #5)

18+ only at launch. No child accounts, no child-specific features.

### 8.1 Registration gate design
- **Launch minimum:** self-declaration at signup — required checkbox "I confirm I am 18 or older", both locales (i18n parity). Declining blocks account creation. Declaration + timestamp stored on the profile (evidence of the gate, not proof of age).
- **Stronger options (OPEN, not decided):** (a) credit-card ownership check at Plus purchase (weak signal); (b) third-party age-verification vendor at signup (friction + cost + privacy surface); (c) ID document verification for flagged accounts. **Method is OPEN — owner picks if/when.** Schema reserves an `age_verified` tri-state (`unverified | self_declared | verified`) so a stronger check lands without migration.
- **No in-app age-gating beyond signup** at launch. The tri-state field supports per-feature checks if future features need them.
- **Architectural extensibility:** the schema and entitlement service must not preclude future parent-managed child accounts (separate product/legal/security/owner approval required — not designed here).

### 8.2 Terms + Privacy Policy requirements list
The documents themselves are **owner/legal drafting** — required contents so nothing is missed:

**Terms of Service:** 18+ eligibility and self-declaration; Free vs Plus description and that Plus features/prices can change with notice; subscription, renewal, cancellation, refund terms (mirror §4); acceptable use (no illegal content, no AI-feature abuse, no scraping/sharing others' vault content); AI disclosures (outputs may be inaccurate; not professional medical/legal/financial advice); account termination for abuse with data-retention terms (30-day trash + export right survive termination notice); limitation of liability; governing law and dispute resolution; change-of-terms notice procedure.

**Privacy Policy:** what is collected (account data, notes/photos/voice, AI telemetry without message content, payment data via Stripe); voice-audio deletion policy (transcribe-then-delete); photo handling; AI provider data processing (Groq, OpenAI — verify no-training claims against current provider terms at drafting time); retention (durable memories, 30-day trash, telemetry janitor windows); user rights (export, delete — backends exist); no sale of personal data; 18+ and no knowing collection from children; privacy-request contact; DPA availability.

**Consent capture:** ToS + Privacy acceptance timestamped at signup (versioned — re-accept on material change). Without this, the backends have no policy to point to (D0 gap).

---

## 9. Support path design

D0 gap: "Good onboarding; no help/FAQ/contact."
- **In-app help:** Settings → Help — searchable bilingual FAQ (i18n parity): Free vs Plus limits, at-quota behavior, downgrade/data-preservation (§6 in plain language), payment/portal how-tos, 18+ and privacy basics, export/delete how-tos.
- **Contact:** in-app form → support ticket (email-backed at launch; helpdesk picked later). Pre-fills app version + tier (never message content).
- **Status/incident:** status page or pinned notice channel for outages (D0 gap) — design the slot now even if the page ships later.
- **Support SLAs:** OPEN owner decision — PROPOSED: Plus < 24h first response, Free < 72h; no phone support at launch. Staffing is an operational commitment, not just a page.

---

## 10. Acceptance criteria + explicit owner-approval list

### Spec completeness
- [ ] Entitlement matrix (§1) covers every user-facing feature with a named gating point.
- [ ] Fail-closed contract (§1.3) testable: deny-on-error, Free-on-missing-row, audit on deny.
- [ ] Every quota number in §2 marked PROPOSED with a stated evidence method.
- [ ] At-limit and downgrade behavior (§2.5, §6) provably deletes nothing — reviewable against decision #1.
- [ ] Stripe design (§4) covers checkout, webhooks (signature + idempotency), lifecycle, proration, dunning, refunds, invoices, tax surface — zero activation.
- [ ] Reconciliation job (§5.2) blast radius bounded to tier flags.
- [ ] 18+ gate (§8) has launch-minimum design + stronger options + legal contents list; method flagged OPEN.
- [ ] Support path (§9) has FAQ/contact/status slots with SLAs flagged open.

### Owner approvals required (nothing below is decided here)
1. **Prices:** Plus monthly and annual price points (USD at launch proposed).
2. **Final quota numbers:** pick one option per row in §2.1–§2.4 (or alternates) AFTER `ai_events`/storage measurement.
3. **AI budget multiplier:** Plus = 4× Free proposed (§3.1).
4. **Dunning policy:** grace durations (7d/14d proposed), retry behavior, final-downgrade timing.
5. **Refund policy:** window and tier-handling on refund (§4.7).
6. **Proration policy:** `create_prorations` on plan change proposed (§4.4).
7. **Tax nexus:** jurisdictions, Stripe Tax on/off, legal entity details (§4.9) — with tax advisor.
8. **Trial of Plus:** enable or not, length (§4.1/§4.3).
9. **Support SLAs:** response targets per tier (§9).
10. **Age-verification strength:** self-declaration at launch vs stronger check (§8.1).
11. **Anomaly-tripwire thresholds** for AI abuse shutoff (§3.1).
12. **Billing go-live:** separate explicit authorization AFTER this design is approved — design approval ≠ activation.
