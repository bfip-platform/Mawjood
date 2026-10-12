// Entitlement core (D4 T-D4-2) — PURE, deny-by-default, NOT wired into
// any request path yet. Wiring rides with billing activation
// (docs/autonomous/d4/STRIPE_ARCHITECTURE.md §8, owner-gated).
//
// FAIL-CLOSED CONTRACT: unknown plan, unknown feature, missing or
// malformed state ⇒ NOT entitled. There is no default-allow.

export const PLANS = ['free', 'family_plus'] as const;
export type Plan = (typeof PLANS)[number];

export const FEATURES = ['extra_family_slot', 'vault_ai', 'priority_support'] as const;
export type Feature = (typeof FEATURES)[number];

// Decision #4: the vault paid gate stays OFF until billing is ready.
// While false, vault_ai is denied for EVERY plan, whatever the matrix
// says. Flipping this must ride with the activation change — never alone.
export const VAULT_PAID_GATE_ENABLED = false;

const MATRIX: Record<Plan, ReadonlySet<Feature>> = {
  free: new Set<Feature>([]),
  family_plus: new Set<Feature>(['extra_family_slot', 'priority_support']),
};

export function entitled(plan: unknown, feature: unknown): boolean {
  if (typeof plan !== 'string' || !(PLANS as readonly string[]).includes(plan)) return false;
  if (typeof feature !== 'string' || !(FEATURES as readonly string[]).includes(feature)) return false;
  if (feature === 'vault_ai' && !VAULT_PAID_GATE_ENABLED) return false;
  return MATRIX[plan as Plan].has(feature as Feature);
}

/**
 * Plan resolution from a billing-mirror row (or anything else).
 * Dunning grace (STRIPE_ARCHITECTURE.md §5, review N4): a `past_due`
 * subscription keeps its plan until the END of the period already
 * paid for — never a mid-period cutoff for a payment failure.
 * `nowIso` is injectable for tests; defaults to now.
 */
export function planFromMirror(
  row: { plan_id?: unknown; status?: unknown; current_period_end?: unknown } | null | undefined,
  nowIso?: string,
): Plan {
  if (!row) return 'free';
  const known = (PLANS as readonly string[]).includes(row.plan_id as string) ? (row.plan_id as Plan) : 'free';
  if (known === 'free') return 'free';
  if (row.status === 'active' || row.status === 'trialing') return known;
  if (row.status === 'past_due') {
    const end = typeof row.current_period_end === 'string' ? Date.parse(row.current_period_end) : NaN;
    const now = Date.parse(nowIso ?? new Date().toISOString());
    if (Number.isFinite(end) && Number.isFinite(now) && now < end) return known;
  }
  return 'free';
}
