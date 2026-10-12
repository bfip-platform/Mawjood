# D4 T-D4-1 — Stripe architecture (DESIGN ONLY — no activation)

> Status: design for owner approval. **No live keys, no Stripe account changes, no charge path exists.** Activation is a separate owner decision with its own checklist (§8). Decision #3: Stripe is in scope for D4/D5 (roadmap) as **build only — activation banned without approval**.

## 1. Shape

- **Checkout** (hosted) for new subscriptions — the app never touches card data; no PCI surface in our code.
- **Customer Portal** (hosted) for plan changes, payment-method updates, invoices, and cancellation — we build no billing UI of our own beyond links.
- **Products/Prices** live in Stripe (mirrored read-only into `subscription_plans`, which `public-config` already serves: id, names AR/EN, price_cents, currency, duration_days, features). Prices are owner-set in the Stripe dashboard; code never invents them (Decision #2 posture).
- **One plan axis at launch:** family slots (the existing paywall concept: first family free, extra families need a slot). Everything else (memory quotas etc.) is quota mechanics, not separate SKUs, until the owner decides otherwise (see QUOTA_PRICE_OPTIONS.md).

## 2. Data model (future migration — NOT in this PR)

- `billing_customers (user_id pk → stripe_customer_id unique)`.
- `billing_subscriptions (id pk = stripe subscription id, user_id, plan_id, status, current_period_end, cancel_at_period_end, updated_at)` — a **mirror** written only by the webhook handler (service role); the client never writes billing state.
- `billing_events (event_id pk, type, received_at, processed_at, outcome)` — the webhook idempotency ledger (§4).
- RLS: users read their own mirror rows; all writes service-role only.

## 3. Checkout flow

1. Client asks the `billing-checkout` edge function (user JWT) for a Checkout Session for a chosen plan.
2. The function resolves/creates the Stripe customer — with a Stripe **idempotency key** derived from (user_id, plan_id, hour) so a double-submit can never create duplicate customers or sessions — then creates the session with `client_reference_id = user_id` and metadata `{user_id, plan_id}`, success/cancel URLs back into the app (deep links per the D5 rules — no object paths or tokens in URLs).
3. **The client learns nothing authoritative from the return URL.** Entitlement changes only when the webhook lands (§4). The app polls its own subscription mirror.

## 4. Webhooks — the only writer of billing truth

Endpoint: `billing-webhook` edge function (public by necessity; authenticated by signature).

- **Signature verification** on the raw body against `STRIPE_WEBHOOK_SECRET` (per-environment). Any failure → 400, no processing, ops-logged. (Constant-time compare is performed by Stripe's `constructEvent` HMAC verification.)
- **Idempotency (tested in this PR's harness):** insert `event_id` into `billing_events` FIRST; a unique-conflict means a redelivery → acknowledge 200 and skip. Processing then runs in a transaction-shaped sequence: apply mirror update → mark `processed_at`. A crash between apply and mark reprocesses the event — every handler is therefore written to be **replay-safe** (upserts keyed by Stripe ids; status transitions monotonic by the last-applied event-`created` watermark guard: a stale event never regresses a newer state).
- **The other crash window — claim without apply (review note):** a crash between the claim insert and the apply leaves the event claimed-but-unprocessed, and redeliveries would skip it as a duplicate. Two safeguards close this: (a) duplicate-skip applies only when the ledger row has `processed_at IS NOT NULL` — a claimed-but-unprocessed event is REPROCESSED on redelivery (safe: handlers are replay-safe); (b) a periodic reconciliation sweep (janitor-class job) lists `billing_events` rows with `processed_at IS NULL` older than 15 minutes and re-drives them, alerting via `ops_events` — a lost webhook can delay an entitlement change, never silently erase it.
- **Respond fast:** the handler verifies the signature, claims the event, and returns 2xx immediately; application work happens behind the claim (async within the function or via the sweeper) so slow handlers never trigger Stripe-side timeout retries.
- **API version pinning:** the Stripe API version is pinned in code/config (never "latest"), and bumps are deliberate reviewed changes.
- Events handled: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Everything else: recorded, ignored, 200.
- **Ordering:** Stripe does not guarantee order. Each handler compares the event's `created` against the mirror's **last-applied event-created watermark** for that subscription and ignores state older than what it has.

## 5. Proration & dunning (policy design — values are owner's)

- Upgrades: prorate immediately (Stripe `create_prorations`) — recommended default.
- Downgrades: take effect at period end (no mid-period refunds) — recommended default.
- Failed payment: Stripe Smart Retries + portal link surfaced in-app; entitlement grace = **the paid period already bought** — access continues until `current_period_end`, then the plan resolves to free (never a mid-period cutoff for a payment failure).
- Cancellation: `cancel_at_period_end` semantics; mirror keeps the entitlement until period end.

## 6. Entitlement coupling

The webhook mirror is the ONLY input to the entitlement service (ENTITLEMENTS.md). No Stripe API calls on the request path; no client-supplied plan claims are ever trusted.

## 7. Environments & secrets

- Test mode only during development; test keys via Supabase secrets (`STRIPE_SECRET_KEY_TEST` etc.), never in the repo or the client. The publishable key is the only client-visible value and ships via `public-config` when billing activates.
- Webhook secrets are per-endpoint; rotating = update the secret + Stripe dashboard, no deploy.

## 8. Activation checklist (owner-gated, NOT done)

1. Owner creates/approves the Stripe account + products/prices.
2. Owner approves final plan/price decisions (QUOTA_PRICE_OPTIONS.md stays options-only until then).
3. Migration for §2 applied to prod (separate approval, like every prod migration).
4. Functions deployed with TEST keys; end-to-end test-mode purchase + webhook replay drill on staging.
5. Owner flips live keys + the entitlement wiring (ENTITLEMENTS.md §4) in one reviewed change.

## 9. Failure posture

Billing down ≠ app down: with no mirror row, a user resolves to the free plan (fail-closed for paid features, fail-open for the free product). Webhook outages delay entitlement changes but never corrupt them (idempotent replay on recovery).
