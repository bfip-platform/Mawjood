# D0.5 — Brand Approval Gate

**Version:** 1.2 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Status:** ✅ **DIRECTION REVISED 2026-10-12** — see §7 (v1.2 supersedes v1.1). Gate remains ACTIVE for: final logo artwork, polished mockups, remaining brand details, and any frontend implementation.

---

## 7. Owner approval record — visual direction (2026-10-12, revised)

**v1.2 REVISION (2026-10-12 ~10:22 EDT) — "Modern Minimal AI + Human Memories."** After reviewing the v1.1 mockups, the owner directed a significant revision: replace the warm terracotta/cream-heavy palette with a modern, premium, monochrome-first AI product aesthetic. This supersedes the v1.1 A+B approval below (preserved for the record).

**v1.2 binding requirements:**
1. Primary colors: white, near-black, subtle neutral grays.
2. Light mode: white backgrounds, soft gray surfaces, dark typography.
3. Dark mode: near-black backgrounds, charcoal surfaces, soft-white typography.
4. Primary buttons: black in light mode, white in dark mode.
5. Secondary accents: restrained soft blue + muted sage, used sparingly.
6. REMOVE: dominant terracotta, brown, gold, vintage paper styling.
7. Contemporary AR/EN typography (no vintage serif display).
8. Clean navigation, excellent spacing, refined cards, subtle shadows, premium microinteractions.
9. Emotional identity (family, belonging, memories) carried through photography, storytelling, thoughtful copy, human-centered UX.
10. Avoid generic dashboard styling, excessive gradients, visual clutter.
11. WCAG 2.2 AA, RTL/LTR, responsive, reduced-motion support.

**Still requiring owner review:** final logo artwork (wordmark + app icon) · final colors · typography lock-in · polished high-fidelity mockups · remaining brand details. **No frontend application code until these are approved. No merge of PR #13 without owner approval. D1 not started.**

---

### v1.1 approval (SUPERSEDED — preserved for the record)

**Was APPROVED 2026-10-12 ~10:05 EDT:** Direction A — "Warm Archive", enhanced with Direction B's contemporary calmness and softness. Superseded same day ~10:22 EDT by the v1.2 revision above. Must not be used as the working palette.

---

## 1. Explicit gate statement (original — direction choice now resolved)

**Owner approval was REQUIRED before:**

(a) choosing the final visual direction,
(b) finalizing the palette,
(c) committing to typefaces,
(d) designing the brand mark/logo,
(e) locking motion principles,
(f) implementing ANY frontend work from the brand specification.

The brand documents (`BRAND_STRATEGY_AND_POSITIONING.md`, `VISUAL_IDENTITY_DIRECTIONS.md`, `DESIGN_TOKENS_AND_COMPONENTS.md`, `FRONTEND_EXPERIENCE_AND_FIGMA_SPECS.md`) are **planning only**. No owner approval is claimed or implied for any choice in them. The recommended direction (A — "Warm Archive") is a **proposal**, not a decision.

## 2. Exactly what is being asked to approve

| # | Item | Options / proposal on the table |
|---|---|---|
| 1 | **Final visual direction** | A "Warm Archive" (recommended) · B "Soft Sanctuary" (fallback) · C "Bold Contrast" — see `VISUAL_IDENTITY_DIRECTIONS.md` |
| 2 | **Palette finalization** | Light + dark hex tables (`DESIGN_TOKENS_AND_COMPONENTS.md` §1) for the chosen direction, after CI contrast verification |
| 3 | **Typeface selection & licensing** | Proposed: all-OFL stack (Direction A: Fraunces / Inter / Noto Naskh Arabic / IBM Plex Sans Arabic) — $0 licensing. Alternative: commercial Arabic/Latin faces — needs budget approval if the owner prefers |
| 4 | **Brand mark / logo design** | Not yet designed — needs its own design pass after direction approval (wordmark "Mawjood / موجود", app icon, favicon, social avatar). Nothing in the brand docs constitutes a logo |
| 5 | **Motion principles** | Duration catalog (150/250/350ms), easing, and the "meaningful motion only" doctrine — plus confirmation that reduced-motion behavior matches the accessibility spec |
| 6 | **Imagery & illustration style** | Real-photography-only rule, warm grade, empty-state illustration system (paper/shelf motif), photo treatment in dark mode; strictly no AI-generated people |
| 7 | **Brand voice for marketing surfaces** | Tone of hero/empty-state/onboarding copy (specimen lines in the experience doc are drafts, not final copy) |
| 8 | **Any frontend implementation** | Explicitly **not** authorized by the brand documents — a separate build authorization is required, and it must follow the approved direction, tokens, and the UX/screen-architecture spec |

## 3. What happens after approval

1. Owner selects the direction (and approves items 2–7 as applicable).
2. The token tables and Figma specs are re-issued for the chosen direction if it isn't A.
3. Logo/mark design pass (item 4) runs as a follow-up workstream.
4. Figma variables + component library are built from the approved spec; contrast audit runs in CI before any build.
5. A **separate build authorization** is required before any code — this gate does not grant it.

## 4. 8-item approval checklist

The owner (or the owner's designated reviewer) confirms each item explicitly. A direction is not chosen until ALL applicable items are checked.

- [ ] **1. Visual direction chosen** — A, B, or C named explicitly (a "no strong preference" defaults to the recommended A only if the owner says so in writing).
- [ ] **2. Palette approved** — light + dark hex tables for the chosen direction, with CI contrast verification confirmed ≥4.5:1 on all text pairs.
- [ ] **3. Typefaces approved** — the proposed OFL stack, or a named commercial alternative with licensing budget approved.
- [ ] **4. Logo design pass authorized** — scope and timeline for the mark/icon/favicon work agreed.
- [ ] **5. Motion principles approved** — durations, easing, meaningful-motion doctrine, reduced-motion behavior.
- [ ] **6. Imagery rules approved** — real-photography-only, illustration system, dark-mode photo treatment, no AI-generated people.
- [ ] **7. Brand voice approved** — marketing/empty-state/onboarding tone (final copy comes later; this approves the voice).
- [ ] **8. Implementation boundary acknowledged** — no frontend code is authorized by this approval; a separate build authorization follows.

## 5. Non-goals of this gate

This gate does NOT approve: application code changes, the D1 build plan, pricing, the marketing site launch, app-store submission, or any production deployment. Those each carry their own approvals.

---

*Gate status: OPEN — awaiting owner review of the brand package.*
