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

/** Plan resolution from a billing-mirror row (or anything else). */
export function planFromMirror(row: { plan_id?: unknown; status?: unknown } | null | undefined): Plan {
  if (!row) return 'free';
  if (row.status !== 'active' && row.status !== 'trialing') return 'free';
  return (PLANS as readonly string[]).includes(row.plan_id as string) ? (row.plan_id as Plan) : 'free';
}
