// Stripe webhook core (D4 T-D4-1) — the pure decision logic of the
// future billing-webhook handler, tested NOW so the handler itself is
// a thin shell when activation is approved. Design:
// docs/autonomous/d4/STRIPE_ARCHITECTURE.md §4.
//
// Two guarantees this core exists to protect:
//  1. IDEMPOTENCY — a redelivered event never applies twice: the
//     handler claims the event id first; only the claim winner acts.
//  2. NO REGRESSION — Stripe does not guarantee ordering: a stale
//     event never moves a subscription mirror backwards.

export type WebhookDecision =
  | { action: 'process' }
  | { action: 'skip_duplicate' }
  | { action: 'skip_stale' }
  | { action: 'ignore_type' };

export const HANDLED_TYPES: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/**
 * Decide what to do with an incoming event.
 * @param eventType the event's `type`
 * @param eventCreated the event's `created` (unix seconds)
 * @param alreadyClaimed true when the event id is already in the
 *   billing_events ledger (a redelivery)
 * @param mirrorWatermark the mirror row's last-applied event `created`
 *   for this subscription (0 when no mirror row exists)
 */
export function decideWebhookEvent(args: {
  eventType: string;
  eventCreated: number;
  alreadyClaimed: boolean;
  mirrorWatermark: number;
}): WebhookDecision {
  if (!HANDLED_TYPES.has(args.eventType)) return { action: 'ignore_type' };
  if (args.alreadyClaimed) return { action: 'skip_duplicate' };
  // Fail-closed (review N3): a malformed `created` must never bypass
  // the no-regression guard by falling through to 'process'.
  if (!Number.isFinite(args.eventCreated)) return { action: 'skip_stale' };
  if (Number.isFinite(args.mirrorWatermark) && args.eventCreated < args.mirrorWatermark) {
    return { action: 'skip_stale' };
  }
  return { action: 'process' };
}
