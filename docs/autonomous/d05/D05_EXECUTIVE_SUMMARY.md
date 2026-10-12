# D0.5 Executive Summary

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Audience:** Owner. Read this first; the 22 companion documents carry the full specification.

## Vision

Mawjood is an AI-powered personal and family memory platform — "a beautiful, trusted place for your personal and family memories." Not a generic SaaS dashboard: memory-first (stories, photos, voices, relationships), premium and warm, bilingual AR/EN from day one, with a reusable architecture supporting future iOS and Android apps. The commercial goal is a complete, production-grade web application — not an MVP.

## D0 findings recap (what this spec responds to)

D0's audit (7 workstreams, ~40 findings, all 9 CI jobs green) found a functionally strong product core on a solid security foundation (RLS on 27 tables, behavioral tests passing) — but with launch-blocking gaps:

- **CRITICAL — memory contract violated:** `memory-consolidate` hard-deletes saved facts (90-day decay + 200-fact cap via `pruneFacts`, no tier distinction), contradicting the durable-memory promise. **Decision #1 resolves this:** D1 redesigns all three destructive paths.
- **HIGH — photo read escalation:** code defect confirmed (unverified `photo_url` + overly-broad `can_read_photo`); end-to-end exploit chain MEDIUM pending scratch repro. D2 closes it.
- **MEDIUM — public AI-spend oracle:** `route`/`classify` callable with the shipped anon key. D2 gates them.
- **HIGH — uncapped AI cost:** up to 1,000 model calls/user/hr, fail-open. D2 caps it.
- **CRITICAL commercial gaps:** zero Stripe, zero legal docs, zero SEO/PWA, zero observability, no offline. D3/D4/D5 close them by design.
- **AI E2E gap:** zero automated coverage of chat/extract/memory-learn (manual-verification-only). D6 builds the harness.

## The 9 owner decisions (hard constraints, 2026-10-12)

1. **Durable memories** — no auto-deletion by age, downgrade, or quota overflow; redesign decay, pruneFacts, forget_fact.
2. **Quotas designed, not invented** — evidence-based options for owner approval; overflow blocks creation, never deletes.
3. **Stripe in scope** — complete billing design; activation needs separate authorization.
4. **Vault gate stays off** until billing + entitlements are ready.
5. **18+ only** at launch; architecture preserves future parent-managed child accounts.
6. **Trash keeps 30-day** recovery; no flip to zero.
7. **No destructive decay** — non-destructive maintenance only.
8. **Indexes/janitors: design + test only** — never delete saved memories via cleanup.
9. **ai-provider-core conditional** on compatibility, security, and regression gates.

These authorize planning only — not prod migrations, deployment, billing activation, or app-code changes.

## Spec package overview (23 documents)

| # | Document | Source |
|---|---|---|
| 1 | PRODUCT_VISION_AND_SCOPE.md | WS1 §1 |
| 2 | COMPLETE_FEATURE_CATALOG.md | WS1 §2 |
| 3 | USER_ROLES_AND_PERMISSIONS.md | WS1 §3 |
| 4 | USER_JOURNEYS_AND_WORKFLOWS.md | WS1 §4 |
| 5 | SCREEN_MAP_AND_UX_SPEC.md | WS2 |
| 6 | DESIGN_SYSTEM_AND_ACCESSIBILITY.md | WS2 |
| 7 | MEMORY_AND_AI_PRODUCT_SPEC.md | WS3 |
| 8 | SECURITY_PRIVACY_AND_RETENTION_SPEC.md | WS4 |
| 9 | BILLING_ENTITLEMENTS_AND_QUOTAS.md | WS5 (+WS3 quota options) |
| 10 | TECHNICAL_ARCHITECTURE.md | WS6 |
| 11 | DATABASE_AND_API_CONTRACTS.md | WS6 |
| 12 | PERFORMANCE_RELIABILITY_AND_OPERATIONS.md | WS6 |
| 13 | APP_FACTORY_REUSE_PLAN.md | WS6 §13 |
| 14 | TESTING_AND_ACCEPTANCE_STRATEGY.md | WS6 §11 + WS7 gates |
| 15 | D1_TO_D8_EXECUTION_ROADMAP.md | WS7 (authoritative) |
| 16 | OPEN_DECISIONS_AND_OWNER_APPROVALS.md | all workstreams (60 items, deduplicated) |
| 17 | D05_EXECUTIVE_SUMMARY.md | this document |
| 18 | D05_TO_D1_HANDOFF.md | WS7 §7 |
| 19 | BRAND_STRATEGY_AND_POSITIONING.md | WS8 §1 |
| 20 | VISUAL_IDENTITY_DIRECTIONS.md | WS8 §2 (3 directions; A recommended, awaiting approval) |
| 21 | DESIGN_TOKENS_AND_COMPONENTS.md | WS8 §3 (Direction A values; pending gate) |
| 22 | FRONTEND_EXPERIENCE_AND_FIGMA_SPECS.md | WS8 §§4–5 |
| 23 | BRAND_APPROVAL_GATE.md | WS8 §§6–7 (explicit owner approval required) |

Every major feature is traceable: product requirement (doc 2) → roadmap stage + task (doc 15, 40 finding IDs) → acceptance test (doc 14).

## D1–D8 at a glance

| Stage | Focus | Key deliverable |
|---|---|---|
| D1 | P0 data protection | Destructive memory paths removed; quota mechanics |
| D2 | P0 security hardening | Photo chain closed; AI oracle gated; spend cap |
| D3 | Reliability & performance | Indexes; janitor; observability; offline; benchmarks |
| D4 | Commercial & legal design | Stripe architecture (T-D4-1); entitlements; Terms/Privacy drafts |
| D5 | UX & web | Responsive; SEO/PWA; a11y; support; brand applied post-gate |
| D6 | AI / memory product | Non-destructive maintenance UX; search; AI-E2E harness |
| D7 | App Factory integration | Conditional ADOPTs (gates); convergence |
| D8 | Launch readiness | Runbook; DR drill; launch-gate sheet |

P0 (data protection + security) before commercial launch work. Legal drafting runs parallel from approval (no code dependency).

## Brand

Three visual identity directions proposed; **Direction A "Warm Archive" recommended — awaiting owner approval** (doc 23 gate). No direction, palette, typeface, or logo is chosen until the owner approves. OFL typeface stack proposed ($0 licensing). Figma-ready specs for 5 key screens included.

## Risks (top 5 of 10)

1. `memory-consolidate` may be actively deleting in prod (unverifiable in D0) — D1's first task + owner cron check.
2. Photo escalation exploited before D2 — repro-first ordering; interim signing rotation.
3. AI-spend abuse via public oracle — D2 PR-A prioritized.
4. Autonomous drift into prod changes — per-stage rules; agent never merges.
5. Launch without signed legal — D8 gate fails closed.

## Open decisions

60 items consolidated in doc 16 (none approved). Highest-leverage: quota numerics (OD-01/02), Stripe prices (OD-04), 18+ method (OD-13), visual direction (OD-38), semantic search (OD-33).

## Readiness statement

This package is **implementation-ready as a plan**: every D0 finding has a spec home and a roadmap stage; all 9 decisions are honored as constraints; nothing invents owner approval; the 60 open decisions are explicitly listed. It is **not** a green light for D1 — D1 begins only when the owner approves this spec and the D1 handoff prerequisites (doc 18) are met. The agent will not self-authorize D1.

---

*End of executive summary. Owner review and approval required before D1.*
