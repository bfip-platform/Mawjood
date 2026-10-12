# D0 — Executive Report

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Audience:** Owner. Read this first; the 9 companion documents carry the evidence.

## What D0 did

Comprehensive read-only audit of the entire Mawjood codebase at the merged D-1/D-1.1 HEAD. 7 parallel workstreams, ~40 findings, every claim cited to exact file paths. Zero application code changed.

## The good news

- **Security foundation is real:** RLS on 27 tables, zero permissive policies, behavioral tests pass, service_role confined, secrets clean.
- **Product core works:** auth, voice→transcript→extract pipeline, AI chat with governed actions, family spaces, admin console — all e2e-verified.
- **i18n is exemplary:** AR/EN with compile-enforced parity.
- **Downgrade is safe:** Plus→Free preserves memories (no FK path).
- **Chat retention is correctly separated** from memory retention.

## The findings that matter

### 🔴 CRITICAL — The memory contract is violated (owner decision required)
`memory-consolidate` hard-deletes saved facts: 90-day decay of importance-1 facts + 200-fact/user cap via `pruneFacts` — **no Free/Plus distinction**. The 200-cap runs on the write path (live even if the cron never fires). This directly contradicts the approved durable-memory promise. **Do not claim durable memory until this is resolved.**

### 🟠 HIGH — Security
1. **Cross-user photo read escalation:** client-supplied `photo_url` (only `https://` check) + `can_read_photo` policy → ex-family member can get indefinite signed-URL reads of a victim's private photo. Defeats the 0029 fix.
2. **`route`/`classify` are public yet client-invoked** — unauthenticated AI-spend oracle on the shipped anon key.
3. **No per-tier AI quotas** — up to 1,000 model calls/user/hour, fail-open.
4. **ILIKE search with no index; unindexed `items.note_id`** — linear scans per search.

### 🟠 HIGH — Commercial blockers
- **Zero Stripe** (manual grants only) · **Zero legal docs** (no Terms/Privacy/consent/age-gate) · **Zero web presence** (no SEO/PWA/deep-links) · **Zero observability** (no Sentry/analytics/uptime) · **No offline support**

## Confidence

- **HIGH:** code-evident findings (inventory, RLS text, retention paths, commercial gaps)
- **MEDIUM:** exploit chains, impact magnitudes, factory-side maturity
- **LOW/unverifiable:** all production state (migrations applied, secrets, crons, table sizes, `verify_jwt`, redirect allowlist)

## Unresolved (need dashboard/runtime — not owner decisions)

Redirect URLs · scheduled crons · secrets present · storage policies applied · `verify_jwt` per function · prod table sizes · `ops_events` monitoring · admin audit-trail immutability · `admin.html` serving path · push credentials · contrast/a11y/browser-compat passes · fresh `npm audit` · scratch-project repro of photo escalation (Claim B) · token/PAT revocation (still outstanding from D-1.1)

**All 9 owner decisions APPROVED 2026-10-12:** (1) durable saved memories — no auto-deletion by age/downgrade/quota; redesign decay, pruneFacts, forget_fact; (2) Free/Plus quotas designed in D0.5, existing memories preserved on overflow (no numeric quotas invented — evidence-based options for owner approval); (3) Stripe in commercial scope; (4) vault paid-gate stays off until billing+entitlements ready; (5) 18+ only at launch; (6) trash keeps 30-day recovery; (7) no scheduled destructive decay; (8) indexes+janitors approved for design/testing only, never delete saved memories; (9) ai-provider-core conditional on compatibility/security/regression gates. These authorize planning only — not prod migrations, deployment, billing activation, or app-code changes.

## Proposed D0.5 priorities

**P0** (data-loss/breach/launch-blocking): memory-consolidate decision; photo_url fix; gate route/classify; AI spend cap; Terms+Privacy.
**P1**: indexes; telemetry janitor; Sentry+uptime; offline cache; race fixes; constant-time admin compare.
**P2**: Stripe design; entitlement service; email-change/deactivation; support; SEO/PWA; a11y.
**P3**: ai-provider + ops-telemetry ADOPT; rate-limit convergence.

Full detail in `D0_TO_D05_HANDOFF.md`.
