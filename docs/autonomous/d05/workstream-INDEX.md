# D0.5 Workstream Index — Draft → Final Document Mapping

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Source drafts:** `docs/autonomous/d05/workstream-01-product.md` … `workstream-08-brand.md` (8 files, ~293KB, 3,452 lines)
**Purpose:** Maps every draft section to its target final document (1–18 + brand docs 19–23), flags cross-workstream contradictions and merge tasks for the parent synthesizing the final package.

---

## Draft → final document map

| Draft | Sections | → Final doc(s) |
|---|---|---|
| workstream-01-product.md | §1 vision | → 1. PRODUCT_VISION_AND_SCOPE.md (§1) + 17 (vision paragraph) |
| workstream-01-product.md | §2 feature catalog (F-1.x–F-16.x) | → 2. COMPLETE_FEATURE_CATALOG.md (full) |
| workstream-01-product.md | §3 roles & permissions matrix | → 3. USER_ROLES_AND_PERMISSIONS.md (full) |
| workstream-01-product.md | §4 journeys (J-1–J-9) | → 4. USER_JOURNEYS_AND_WORKFLOWS.md (full) |
| workstream-01-product.md | §5 open questions Q-1–Q-20 | → 16. OPEN_DECISIONS_AND_OWNER_APPROVALS.md (product section) |
| workstream-02-ux.md | §1 sitemap, §2 screens S-1–S-18 | → 5. SCREEN_MAP_AND_UX_SPEC.md (§§1–2) |
| workstream-02-ux.md | §3 responsive, §4 bilingual, §8 system states | → 5. SCREEN_MAP_AND_UX_SPEC.md (§§3–5) |
| workstream-02-ux.md | §5 a11y, §6 light/dark, §9 tokens (structural), §11 preserve/redesign | → 6. DESIGN_SYSTEM_AND_ACCESSIBILITY.md |
| workstream-02-ux.md | §7 onboarding/settings, §10 mobile reuse | → 5 (§6) + 6 (appendix) |
| workstream-02-ux.md | O-1–O-7 open design choices | → 16 (UX section) |
| workstream-03-memory-ai.md | §§1–11 (durable contract, redesigns, quotas, gardener, chat, voice, search, tests) | → 7. MEMORY_AND_AI_PRODUCT_SPEC.md (full) |
| workstream-03-memory-ai.md | §4.4 quota options A/B/C | → 9. BILLING_ENTITLEMENTS_AND_QUOTAS.md (§ quota options — merge with WS5, see M1) |
| workstream-03-memory-ai.md | open decisions + traceability | → 16 (memory/AI section) |
| workstream-04-security.md | §§1–9 (remediations + verification/rollback matrix) | → 8. SECURITY_PRIVACY_AND_RETENTION_SPEC.md (full) |
| workstream-04-security.md | 6 open owner questions | → 16 (security section) |
| workstream-05-commercial.md | §§1–10 (entitlements, quotas, Stripe, grace, 18+, support) | → 9. BILLING_ENTITLEMENTS_AND_QUOTAS.md (full) |
| workstream-05-commercial.md | 12-item owner-approval list | → 16 (commercial section) |
| workstream-06-technical.md | §§1–2, 4–6 (monorepo, DB, APIs, AI abstraction, jobs) | → 10. TECHNICAL_ARCHITECTURE.md + 11. DATABASE_AND_API_CONTRACTS.md |
| workstream-06-technical.md | §§3, 7–10, 14 (indexes, storage, janitor, observability, caching, targets) | → 12. PERFORMANCE_RELIABILITY_AND_OPERATIONS.md |
| workstream-06-technical.md | §13 factory reuse | → 13. APP_FACTORY_REUSE_PLAN.md (full) |
| workstream-06-technical.md | §11 testing/CI | → 14. TESTING_AND_ACCEPTANCE_STRATEGY.md (tech half) |
| workstream-06-technical.md | §15 open technical decisions | → 16 (technical section) |
| workstream-07-roadmap.md | §§1–5 (principles, D1–D8, traceability, rules, dependencies) | → 15. D1_TO_D8_EXECUTION_ROADMAP.md (full) |
| workstream-07-roadmap.md | §8 risk register | → 15 (appendix) + 17 (risks paragraph) |
| workstream-07-roadmap.md | §6 open decisions O-1–O-20, §7 D1 prerequisites | → 16 (roadmap section) + 18. D05_TO_D1_HANDOFF.md |
| workstream-07-roadmap.md | §2 per-stage test gates | → 14. TESTING_AND_ACCEPTANCE_STRATEGY.md (gates half) |
| workstream-08-brand.md | §1 brand strategy | → 19. BRAND_STRATEGY_AND_POSITIONING.md |
| workstream-08-brand.md | §2 three directions + recommendation | → 20. VISUAL_IDENTITY_DIRECTIONS.md |
| workstream-08-brand.md | §3 tokens & components (Direction A values) | → 21. DESIGN_TOKENS_AND_COMPONENTS.md — see interface note I1 |
| workstream-08-brand.md | §§4–5 experience blueprint + Figma specs | → 22. FRONTEND_EXPERIENCE_AND_FIGMA_SPECS.md |
| workstream-08-brand.md | §§6–7 interface + approval gate | → 23. BRAND_APPROVAL_GATE.md |

**Doc 17 (D05_EXECUTIVE_SUMMARY.md):** synthesized by parent from all drafts (vision §1, findings, decisions, roadmap stages, risks, readiness).

---

## Contradictions (must resolve before final docs)

### C1 — Stripe/billing stage: WS1 says D3, WS7 says D4 ⚠️
- **WS1** (`workstream-01-product.md:286,559`): F-12.1 Stripe design + F-6.4 family-slots billing hook + J-7 upgrade journey grouped under **D3**.
- **WS7** (`workstream-07-roadmap.md:259,285`): D4 = Commercial & Legal Design; T-D4-1 = Stripe architecture design. WS7's rationale (§27): D4 billing requires D2's fail-closed entitlements + D1's quota mechanics as prerequisites.
- **Resolution:** WS7 owns staging (it was briefed as the staging authority). **D4 wins** unless the owner directs otherwise. Parent must update WS1's traceability table (line 559) to D4 before finalizing doc 2/15.

### C2 — None other found
Quota axes (WS3 fact-counts vs WS5 token budgets/storage/minutes) are complementary, not contradictory — see merge task M1. 18+ gate method is consistently open across WS2/WS5/WS8. Consolidation cadence (weekly gardener) agrees WS3↔WS6. Telemetry janitor scope agrees WS4↔WS6. Photo Claim B stays MEDIUM/unverified in WS4 — consistent with the D0 reconciliation.

---

## Merge tasks (not contradictions — parent synthesis work)

### M1 — Single quota table (docs 7 + 9)
WS3 §4.4 proposes fact-count options (A: 500/5,000 · B: 200/2,000 · C: rolling monthly, A recommended); WS5 §2 proposes AI token budgets, storage, voice minutes, vaults, family slots (2–3 options each). Parent must merge into ONE quota table in doc 9 with per-axis options, all marked PROPOSED per decision #2. All honor block-not-delete (decision #1). WS3's grandfathering rule and WS5's at-limit UX both carry over.

### M2 — 18+ gate method (single open decision O-18)
WS2 lists checkbox-vs-DOB as open (O-x); WS5 specifies self-declaration minimum with stronger options open; WS8 includes the gate in onboarding beats. Consolidate to one open decision in doc 16; doc 5/9 reference it.

### M3 — Signed-URL expiry duration
WS4 lists it as an open owner question; WS6 has the expiry/rotation/revocation design. Doc 8 takes WS6's design with the duration marked open.

### M4 — route/classify strategy
WS4 offers JWT+rate-limit (default) vs route-behind-chat; WS7 D2 includes the gating task. Doc 8 takes the default with the alternative noted; not blocking for design.

---

## Interface notes

### I1 — Design tokens: WS2 (doc 6) vs WS8 (doc 21)
- **Doc 6** (from WS2): structural + accessibility tokens — roles, focus, keyboard, contrast *requirements*, spacing scale structure.
- **Doc 21** (from WS8): visual identity token *values* for Direction A (semantic light/dark hex, type pairings) — **pending owner approval of the direction** (doc 23 gate).
- Rule (per WS8 §6): on any conflict, **accessibility wins**; WS8's contrast pairs were script-verified ≥4.5:1.

### I2 — Screen architecture: WS2 (doc 5) vs WS8 (doc 22)
- **WS2 owns:** IA, routes, screen inventory S-1–S-18, responsive behavior, a11y semantics, state matrices.
- **WS8 owns:** visual identity, token values, emotional layer, Figma-ready specs for 5 key screens.
- Handoff: doc 5 defines *what/where*; doc 22 defines *what it looks like*.

### I3 — AI budget mechanism vs commercial quotas
- **WS4 §4** owns the *mechanism* (token budget on `ai_events`, fail-closed, alerts) → doc 8.
- **WS5 §3** owns the *commercial quotas* that consume it (per-tier budgets) → doc 9.
- **WS3 §7** owns the *product behavior* (per-turn cost display, step guards) → doc 7.

---

## Completeness check
- [x] All 8 drafts present and non-empty (3,452 lines total)
- [x] Every D0 P0 finding has a spec home (memory decay→doc 7, photo→doc 8, route/classify→doc 8, AI cost→docs 8+9, Stripe→doc 9, legal→doc 9, search→doc 7/12, indexes→doc 12)
- [x] All 9 owner decisions honored as constraints in every draft (spot-checked)
- [x] No draft invents owner approval (open questions explicitly listed per draft)
- [x] No application code modified (docs-only; branch clean except new files)
- [ ] C1 resolved (parent action)
- [ ] M1–M4 merged (parent synthesis)
- [ ] Final 23 documents written (parent action — next step after this index)
