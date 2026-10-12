# D0 — Commercial Readiness Gap Analysis

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Stance:** Assesses a complete production-grade web product. Not an MVP.

## Area verdicts

| Area | Verdict | Notes |
|---|---|---|
| Billing | ❌ MISSING | Zero Stripe; manual grants only |
| Entitlements | 🔶 PARTIAL | Fragmented, fail-open; no AI/storage quotas |
| Account lifecycle | 🔶 PARTIAL | Delete/export present; email-change + deactivation missing |
| Privacy | ❌ MISSING | No policy; GDPR backend exists with no policy to point to |
| Reliability | 🔶 PARTIAL | Root error boundary only; no offline |
| Monitoring | ❌ MISSING | No Sentry/analytics/uptime/alerts |
| Accessibility | 🔶 PARTIAL | ~17 labels; zero accessibilityRole |
| i18n | ✅ PRESENT | AR/EN with compile-enforced parity |
| Support | 🔶 PARTIAL | Good onboarding; no help/FAQ/contact |
| Admin | ✅ PRESENT | Best-in-repo: bans, grants, plans, promos, governance |
| Legal | ❌ MISSING | No Terms/Privacy/DPA/consent/age-gate |
| Web-specific | ❌ MISSING | No SEO/PWA/deep-links |

## Top-10 gaps (priority order)

1. **No billing rails** — cannot charge anyone; plan changes/proration/dunning/invoices absent
2. **No Terms/Privacy/consent** — public launch and app-store listing legally non-viable
3. **No AI cost caps** — uncapped cost center (see PERFORMANCE)
4. **No observability** — blind to crashes, funnel, downtime
5. **No SEO/PWA/deep-links** — undiscoverable, uninstallable, unshareable web product
6. **No offline support** — memory app that needs signal to recall anything
7. **No support path** — no in-app help/FAQ/contact
8. **No email-change/deactivation** — account lifecycle incomplete
9. **a11y ~17 labels** — screen-reader users effectively locked out
10. **No incident runbook/status page** — existing doc governs AI agents, not outages

## What IS ready

- Auth + RLS isolation (behavioral tests)
- AI chat + extraction pipeline (e2e-covered)
- Family spaces + invites (churn-safe)
- Admin console (unusually complete)
- Bilingual UI (AR/EN)
- Export/delete backends (untested)

## Launch-readiness statement

**Not launch-ready as a commercial web product.** The product core (memory, chat, family) is functionally strong; the commercial shell (billing, legal, observability, support, web presence) is absent. Estimated D0.5 scope: P0 (data-loss/breach/launch-blocking) → P1 (reliability) → P2 (commercial) per D0_TO_D05_HANDOFF.md.
