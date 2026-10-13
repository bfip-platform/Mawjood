# D4 T-D4-2 — Entitlement service (DESIGN + tested pure core)

> Status: design + a tested, **unwired** pure module (`supabase/functions/_shared/entitlements.ts`). Wiring it into request paths is part of billing activation (owner-gated, STRIPE_ARCHITECTURE.md §8). Decision #4: **the vault paid gate stays OFF until billing is ready** — this design keeps it off, and a unit test proves it.

## 1. Principles

- **Fail-closed.** Unknown plan, unknown feature, missing mirror row, malformed state → NOT entitled. There is no default-allow anywhere.
- **Server-side only.** The client may *display* plan state (from `public-config` / the user's own mirror row) but every paid capability is checked in an edge function via this module. Client claims are never inputs.
- **One source of truth.** Plan state comes only from the billing mirror (written only by the verified webhook, STRIPE_ARCHITECTURE.md §4).

## 2. Model

- Plans: `free`, `family_plus` (names provisional — owner finalizes with pricing).
- Features (provisional keys): `extra_family_slot`, `vault_ai` (the «اسأل خزنتك» paid differentiator), `priority_support`.
- Matrix (design intent; the module encodes it and tests pin it):

| feature | free | family_plus |
|---|---|---|
| extra_family_slot | ✗ | ✓ |
| vault_ai | ✗ (gate off globally — see §3) | ✗ until activation |
| priority_support | ✗ | ✓ |

## 3. The vault gate (Decision #4)

`VAULT_PAID_GATE_ENABLED = false` in the module. While false, `entitled(..., 'vault_ai')` is false for **every** plan — the vault's AI capability is simply not switched on commercially, for anyone, regardless of what the matrix says later. Flipping it is a one-line change that must ride with the billing-activation PR (owner-approved), never alone.

## 4. Wiring design (future, activation PR)

- Edge functions that serve a paid feature call `requireEntitlement(supa, userId, feature)` → resolves the mirror row → `entitled(plan, feature)` → 402/403 with a stable code (`entitlement_required`) when denied.
- Resolution is read-only and cheap (one indexed row); no caching beyond the request (plan changes take effect on the next request after the webhook lands).
- Anonymous trial users resolve to `free`.

## 5. What is proven now

Unit tests pin: deny-by-default for unknown plan/feature/null; the matrix above; and **the vault gate being off for all plans**. The module has no I/O and no callers yet — deliberately.
