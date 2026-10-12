# D0.5 — Design Tokens & Components

**Version:** 1.1 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Status:** ✅ **OWNER-APPROVED FOUNDATION.** Direction A ("Warm Archive") fused with Direction B's calmness/softness, per owner decision 2026-10-12. Token values below are the approved A+B fusion. Final logo artwork and polished mockups still require owner review.
**Owner fusion brief:** retain A's warm ivory, ink, terracotta, editorial photography, memory-first identity · borrow B's clean layouts, subtle softness, comfortable spacing, restrained sage accents · contemporary readable AR/EN type, expressive display only where appropriate · polished light/dark · WCAG 2.2 AA.

**Interface rule:** On any conflict between this document and the accessibility requirements in `DESIGN_SYSTEM_AND_ACCESSIBILITY.md`, **accessibility wins** — this document is re-spec'd, not the other way around.

---

## 1. Semantic color tokens (light / dark pairs) — APPROVED A+B fusion

| Role | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FAF6EE` | `#16120D` | App background (warm paper / warm charcoal) |
| `surface-1` | `#FFFFFF` | `#221B13` | Cards, sheets |
| `surface-2` | `#F3EDE1` | `#2A2117` | Input fills, secondary surfaces |
| `surface-soft` | `#F7F1E5` | `#262017` | **B-softness:** gentle section washes, timeline bands |
| `border` | `#E7DECF` | `#3A2F22` | Dividers, card outlines |
| `border-soft` | `#EFE7D6` | `#33291D` | **B-softness:** hairlines inside soft surfaces |
| `text-1` | `#211A13` | `#F4EDE1` | 15.94:1 / 16.02:1 ✓ |
| `text-2` | `#5C5245` | `#C4B7A3` | 7.09:1 / 9.45:1 ✓ |
| `text-3` | `#75664F` | `#A89A83` | Meta/captions — 5.17:1 light ✓ |
| `accent` | `#B4471F` | `#E07B4A` | Primary actions (terracotta); white text on light = 5.44:1 ✓ |
| `accent-ink` | `#8C3415` | `#E07B4A` | Accent-colored *text*; 8.02:1 on white ✓ |
| `accent-pressed` | `#8C3415` | `#C96A38` | Pressed state of accent fills |
| `sage` | `#5F7A5E` | `#8FAE8D` | **B-fusion:** restrained sage accents — secondary actions, family-space identity, calm highlights (5.02:1 on paper ✓) |
| `sage-soft` | `#E4EADF` | `#2C362B` | **B-fusion:** sage washes, family badges, gentle success states |
| `gold` | `#C9963C` | `#D9A94F` | Decorative/milestone only — never for text <18pt |
| `success` | `#3E7C4F` | `#7CBF8A` | 4.64:1 light ✓ |
| `warning` | `#A96A12` | `#D9A44A` | Amber-brown |
| `danger` | `#B3372C` | `#E07B5A` | 5.57:1 light ✓ |
| `focus-ring` | `#8C3415` | `#E07B4A` | 2px outline; 3:1 against adjacent |
| `scrim` | `rgba(33,26,19,.45)` | `rgba(10,8,5,.55)` | Photo caption legibility |

**Rules:** no hard-coded hex in components (lint-enforced); every text/background pair ≥4.5:1 verified in CI; sage is the *secondary* accent — terracotta remains the primary action color; theme = system default + explicit user override, persisted like the language toggle.

## 2. Typography scale (Arabic + Latin) — APPROVED

**Principles:** contemporary and readable first. Arabic script gets **+1.1× line-height** vs Latin at the same step; Arabic 1pt larger for optical parity. **Expressive display faces (Fraunces / Noto Naskh Arabic) are reserved for emotional moments** — hero headlines, empty-state titles, memory milestones, brand surfaces. Everything functional (body, buttons, forms, lists, captions) uses the readable UI pair. Never set Arabic in a Latin display face.

| Step | Latin | Arabic | Size / Weight | Line-height (Lat / Ar) | Usage |
|---|---|---|---|---|---|
| Display | Fraunces 600 | Noto Naskh Arabic 600 | 40 / 32 | 1.15 / 1.6 | Emotional moments ONLY: hero, empty states, milestones |
| H1 | Inter 600 | IBM Plex Sans Arabic 600 | 32 / 28 | 1.2 / 1.65 | Screen titles (readable, not display) |
| H2 | Inter 600 | IBM Plex Sans Arabic 600 | 24 / 22 | 1.25 / 1.7 | Section headers, card titles |
| H3 | Inter 600 | IBM Plex Sans Arabic 600 | 20 / 20 | 1.3 / 1.75 | Subsections |
| Body | Inter 400 | IBM Plex Sans Arabic 400 | 16 / 17 | 1.5 / 1.8 | Default text |
| Body-sm | Inter 400 | IBM Plex Sans Arabic 400 | 14 / 15 | 1.5 / 1.8 | Secondary text, list rows |
| Caption | Inter 500 | IBM Plex Sans Arabic 500 | 12 / 13 | 1.4 / 1.7 | Meta, timestamps, labels (12pt min) |
| Button | Inter 600 | IBM Plex Sans Arabic 600 | 16 / 17 | 1.25 / 1.6 | Button labels |

**Rules:** display faces never for body/buttons/forms; numerals in prices/countdowns LTR-isolated; Eastern vs Western Arabic numerals per user preference; tabular numerals for countdowns.

## 3. Spacing, radii, elevation — APPROVED (B-softness applied)

- **Spacing:** 4px base — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. **B-fusion: comfortable breathing room** — section gaps default to 32 (not 24); screen margins 20 (mobile) / 28 (tablet) / 40+ (desktop); card internal padding 16/20 (not tight 12). Airy, never cramped.
- **Radii:** buttons/inputs `12` · cards `16` (softened from 14) · sheets/modals `24` (top, softened from 20) · chips/pills/avatars `full` · photo frames `12` / `full` (avatars).
- **Elevation:** light — `0` flat, `1` cards (`0 1px 2px rgba(33,26,19,.06)`), `2` raised (`0 4px 16px rgba(33,26,19,.08)`), `3` overlays (`0 12px 32px rgba(33,26,19,.14)`); dark — warm-tinted shadows + 1px hairlines. **B-softness:** shadows are soft and diffused, never harsh.
- **Motion:** 150ms micro / 250ms overlay / 350ms page transitions; `ease-out`; meaningful only. `prefers-reduced-motion` → instant, no shimmer. (Owner requirement #7.)

## 4. RTL behavior (visual layer)

- Full visual mirror of directional chrome: rails, drawers, tab order, chevrons, progress steps, timelines, bubble tails, toast origins.
- **Never mirror:** photos, the vault keypad, brand mark, numerals-in-prices, barcodes.
- If Naskh fails to load, fall back to Plex Sans Arabic — never a Latin serif.
- Mixed-direction strings wrapped in `unicode-bidi: isolate`.
- The terracotta accent is direction-agnostic; gold milestone treatments identical in both directions.

## 5. Reusable component visual standards (proposed)

- **Button:** height 48 (min 44 touch), radius 12, 16/600 label. Primary = `accent` fill, white text; hover = darken + 1px elevation; pressed = `accent-pressed`; disabled = `surface-2` + `text-3`; loading = spinner replacing label (width preserved); focus = 2px `focus-ring` outline offset 2px. Secondary = 1.5px `accent-ink` border, `accent-ink` text. Danger = `danger` fill / outline variant. Ghost = text-only `accent-ink`.
- **IconButton:** 44×44, radius full; hover `surface-2` wash; icon 20px, `text-2`, 1.5px rounded stroke.
- **TextField:** label (Caption/500) above; height 48, radius 12, `surface-2` fill, 1px `border`; focus = 2px `accent` border + soft wash; error = `danger` border + error text linked via `aria-describedby`.
- **Card (base):** `surface-1`, radius 14, 1px `border`, elevation 1; hover (desktop) elevation 2 + 150ms lift; pressed scale .99.
- **Memory card:** photo 16:10 top (radius 12 inner), title H3, meta Caption/`text-3` (date · space), footer row: space badge chip + borrow badge if applicable ("مين أخذها؟" badge: warm `warning` tint + due date).
- **Timeline item:** date rail (inline-start, Caption/`text-3`, tabular numerals, "archive tab" styling) + memory card; connector 1px `border`; today marker = `gold` dot + "Today/اليوم".
- **ChatBubble:** user = `accent` fill, white Body text, tail inline-end; assistant = `surface-1` + 1px `border`, tail inline-start; voice bubble = waveform bars + duration chip + 44px play button; photo bubble = photo (radius 12) + caption; action cards inside assistant bubbles = mini-cards with real buttons.
- **ChatInput:** pill container, `surface-1` + 1px `border`, elevation 2; send button 44px circle `accent` at inline-end.
- **EmptyState:** centered, max-width 320; warm illustration 120px (paper/shelf motif); H2 serif title; Body/`text-2` description; primary CTA. Never a dead end — always one action.
- **Toast:** `ink` fill (light) / `surface-2` (dark), radius 12, elevation 3, slides from inline-end; undo action in gold/accent-ink.
- **CountdownChip (trash):** pill, `warning`-tinted fill; tabular LTR-isolated number — "29 days left" is text, never color-alone. Urgent (<7 days) adds `danger-ink` text.
- **Keypad (vault):** large 72px circular keys, `surface-2` fill, H2 numerals; quieter visual register than the rest of the app (deeper surfaces, no gold — secrecy feels serious).
- **Avatar:** initials on `accent-soft` tint (or member photo); family manager avatars 48px with `gold`-tinted role badge.

---

*All values PROPOSED pending brand direction approval. On approval of a different direction, this document is re-issued with that direction's tables. Accessibility requirements always take precedence over visual choices.*
