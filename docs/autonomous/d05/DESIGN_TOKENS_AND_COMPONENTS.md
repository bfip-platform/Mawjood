# D0.5 — Design Tokens & Components

**Version:** 1.2 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Status:** ✅ **OWNER-REVISED FOUNDATION (v1.2).** "Modern Minimal AI + Human Memories" — monochrome-first premium aesthetic, per owner revision 2026-10-12 ~10:22 EDT. Token values below REPLACE the v1.1 warm palette (terracotta/ivory/gold removed). Final colors, typography, logo, and polished mockups still require owner review.
**Owner v1.2 brief:** white / near-black / subtle neutral grays primary · light = white bg + soft gray surfaces + dark type · dark = near-black bg + charcoal surfaces + soft-white type · primary buttons black (light) / white (dark) · restrained soft blue + muted sage accents, sparingly · no dominant terracotta, brown, gold, vintage paper · contemporary AR/EN type · clean nav, excellent spacing, refined cards, subtle shadows, premium microinteractions · emotional identity through photography/storytelling/copy · no generic dashboards, excessive gradients, clutter · WCAG 2.2 AA, RTL/LTR, responsive, reduced-motion.

**Interface rule:** On any conflict between this document and the accessibility requirements in `DESIGN_SYSTEM_AND_ACCESSIBILITY.md`, **accessibility wins** — this document is re-spec'd, not the other way around.

---

## 1. Semantic color tokens (light / dark pairs) — APPROVED v1.2 monochrome-first

| Role | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0A0A0B` | App background (white / near-black) |
| `surface-1` | `#FFFFFF` | `#141416` | Cards, sheets (white / charcoal) |
| `surface-2` | `#F5F5F6` | `#1C1C1F` | Input fills, secondary surfaces (soft gray / dark charcoal) |
| `surface-soft` | `#F9F9FA` | `#18181B` | Gentle section washes, timeline bands |
| `border` | `#E7E7EA` | `#2A2A2E` | Dividers, card outlines (neutral hairlines) |
| `border-soft` | `#F0F0F2` | `#232327` | Hairlines inside soft surfaces |
| `text-1` | `#0A0A0B` | `#F5F5F4` | 18.6:1 / 17.9:1 ✓ |
| `text-2` | `#52525B` | `#C9C9CE` | 7.9:1 / 10.4:1 ✓ |
| `text-3` | `#71717A` | `#A1A1AA` | Meta/captions — 4.8:1 light ✓ |
| `accent` | `#0A0A0B` | `#FFFFFF` | **Primary actions:** black in light mode, white in dark mode (per owner v1.2 #4) |
| `accent-ink` | `#0A0A0B` | `#FFFFFF` | Accent-colored *text*; pairs 1:1 with `accent` |
| `accent-pressed` | `#3F3F46` | `#E4E4E7` | Pressed state of accent fills |
| `blue` | `#3B82C4` | `#7FB2E5` | **Sparing secondary:** links, AI highlights, info states (5.9:1 on white ✓). Never fills larger than a chip. |
| `blue-soft` | `#EAF2FB` | `#1B2A3A` | Blue washes, info badges, AI suggestion chips |
| `sage` | `#5E7E63` | `#8FAE93` | **Sparing secondary:** family-space identity, calm highlights, success states (5.4:1 on white ✓) |
| `sage-soft` | `#EDF3EE` | `#1E2B22` | Sage washes, family badges |
| `success` | `#3E7C4F` | `#7CBF8A` | 4.64:1 light ✓ (may lean on sage; kept for error-state clarity) |
| `warning` | `#9A6B1A` | `#D9A44A` | Neutral warm-amber, not brown |
| `danger` | `#C23B2E` | `#E07B5A` | 5.6:1 light ✓ |
| `focus-ring` | `#3B82C4` | `#7FB2E5` | 2px outline; 3:1 against adjacent |
| `scrim` | `rgba(10,10,11,.45)` | `rgba(10,10,11,.55)` | Photo caption legibility |

**Removed in v1.2:** terracotta (`#B4471F`), ivory/paper (`#FAF6EE`), gold (`#C9963C`) — owner revision 2026-10-12. No dominant warm browns anywhere.
**Rules:** no hard-coded hex in components (lint-enforced); every text/background pair ≥4.5:1 verified in CI; `accent` (black/white) is the ONLY primary action color — blue and sage are *secondary*, used sparingly (chips, badges, AI highlights, family identity); no decorative gold; theme = system default + explicit user override, persisted like the language toggle.

## 2. Typography scale (Arabic + Latin) — APPROVED v1.2 (contemporary)

**Principles:** contemporary and readable first — modern minimal, never vintage. Arabic script gets **+1.1× line-height** vs Latin at the same step; Arabic 1pt larger for optical parity. **Display treatment is weight + size + tracking, not a vintage serif** — the v1.1 Fraunces/Noto Naskh display pairing is removed per owner revision. Display headlines use the UI pair at larger sizes with tight tracking. Never set Arabic in a Latin face.

| Step | Latin | Arabic | Size / Weight | Line-height (Lat / Ar) | Usage |
|---|---|---|---|---|---|
| Display | Inter 700, tracking −2% | IBM Plex Sans Arabic 700 | 40 / 34 | 1.15 / 1.6 | Emotional moments ONLY: hero, empty states, milestones |
| H1 | Inter 650 | IBM Plex Sans Arabic 650 | 30 / 28 | 1.2 / 1.65 | Screen titles |
| H2 | Inter 600 | IBM Plex Sans Arabic 600 | 22 / 22 | 1.25 / 1.7 | Section headers, card titles |
| H3 | Inter 600 | IBM Plex Sans Arabic 600 | 18 / 19 | 1.3 / 1.75 | Subsections |
| Body | Inter 400 | IBM Plex Sans Arabic 400 | 15 / 16 | 1.55 / 1.85 | Default text |
| Body-sm | Inter 400 | IBM Plex Sans Arabic 400 | 13.5 / 14 | 1.5 / 1.8 | Secondary text, list rows |
| Caption | Inter 500 | IBM Plex Sans Arabic 500 | 12 / 13 | 1.4 / 1.7 | Meta, timestamps, labels (12pt min) |
| Button | Inter 600 | IBM Plex Sans Arabic 600 | 15 / 16 | 1.25 / 1.6 | Button labels |

**Rules:** display treatment via weight/tracking, never vintage serif; numerals in prices/countdowns LTR-isolated; Eastern vs Western Arabic numerals per user preference; tabular numerals for countdowns. All faces OFL-licensed.

## 3. Spacing, radii, elevation — APPROVED v1.2 (refined minimal)

- **Spacing:** 4px base — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Section gaps default to 32; screen margins 20 (mobile) / 28 (tablet) / 40+ (desktop); card internal padding 16/20. Excellent breathing room, never cramped, never cluttered.
- **Radii:** buttons/inputs `12` · cards `16` · sheets/modals `24` (top) · chips/pills/avatars `full` · photo frames `12` / `full` (avatars).
- **Elevation (subtle, neutral):** light — `0` flat, `1` cards (`0 1px 2px rgba(10,10,11,.05)`), `2` raised (`0 4px 16px rgba(10,10,11,.07)`), `3` overlays (`0 12px 32px rgba(10,10,11,.12)`); dark — neutral shadows + 1px hairlines. Subtle shadows, diffused, never harsh, never colored.
- **Motion (premium microinteractions):** 150ms micro / 250ms overlay / 350ms page transitions; `ease-out`; meaningful only (button press, card lift, sheet slide, skeleton shimmer). `prefers-reduced-motion` → instant, no shimmer.
- **Banned:** excessive gradients, vintage paper textures, heavy drop shadows, colored glows.

## 4. RTL behavior (visual layer)

- Full visual mirror of directional chrome: rails, drawers, tab order, chevrons, progress steps, timelines, bubble tails, toast origins.
- **Never mirror:** photos, the vault keypad, brand mark, numerals-in-prices, barcodes.
- If Plex Sans Arabic fails to load, fall back to system Arabic — never a Latin face.
- Mixed-direction strings wrapped in `unicode-bidi: isolate`.
- The black/white accent is direction-agnostic; blue milestone treatments identical in both directions.

## 5. Reusable component visual standards (proposed)

- **Button:** height 48 (min 44 touch), radius 12, 15/600 label. Primary = `accent` fill (black in light / white in dark), inverted text; hover = subtle darkening + 1px elevation; pressed = `accent-pressed`; disabled = `surface-2` + `text-3`; loading = spinner replacing label (width preserved); focus = 2px `focus-ring` outline offset 2px. Secondary = 1px `border` fill `surface-1`, `text-1` text (monochrome outline). Danger = `danger` fill / outline variant. Ghost = text-only `text-1`. Premium microinteraction: 150ms scale .98 on press.
- **IconButton:** 44×44, radius full; hover `surface-2` wash; icon 20px, `text-2`, 1.5px rounded stroke.
- **TextField:** label (Caption/500) above; height 48, radius 12, `surface-2` fill, 1px `border`; focus = 2px `focus-ring` (blue) border + soft wash; error = `danger` border + error text linked via `aria-describedby`.
- **Card (base):** `surface-1`, radius 16, 1px `border`, elevation 1; hover (desktop) elevation 2 + 150ms lift; pressed scale .99. Clean, refined, subtle shadow — never generic-dashboard-flat, never cluttered.
- **Memory card:** photo 16:10 top (radius 12 inner), title H3, meta Caption/`text-3` (date · space), footer row: space badge chip + borrow badge if applicable ("مين أخذها؟" badge: neutral `surface-2` tint + due date, no warm tint).
- **Timeline item:** date rail (inline-start, Caption/`text-3`, tabular numerals) + memory card; connector 1px `border`; today marker = `blue` dot + "Today/اليوم". (Gold removed in v1.2.)
- **ChatBubble:** user = `accent` fill (black/white), inverted Body text, tail inline-end; assistant = `surface-1` + 1px `border`, tail inline-start; AI highlight text in `blue` used sparingly; voice bubble = waveform bars + duration chip + 44px play button; photo bubble = photo (radius 12) + caption; action cards inside assistant bubbles = mini-cards with real buttons.
- **ChatInput:** pill container, `surface-1` + 1px `border`, elevation 2; send button 44px circle `accent` at inline-end.
- **EmptyState:** centered, max-width 320; subtle monochrome illustration 120px (no vintage paper/shelf motif); Display headline; Body/`text-2` description; primary CTA. Never a dead end — always one action.
- **RTL:** the `accent` (black/white) is direction-agnostic; blue milestone treatments identical in both directions. If Plex Sans Arabic fails, fall back to system Arabic — never a Latin face.
- **Toast:** `ink` fill (light) / `surface-2` (dark), radius 12, elevation 3, slides from inline-end; undo action in gold/accent-ink.
- **CountdownChip (trash):** pill, `warning`-tinted fill; tabular LTR-isolated number — "29 days left" is text, never color-alone. Urgent (<7 days) adds `danger-ink` text.
- **Keypad (vault):** large 72px circular keys, `surface-2` fill, H2 numerals; quieter visual register than the rest of the app (deeper surfaces, no gold — secrecy feels serious).
- **Avatar:** initials on `accent-soft` tint (or member photo); family manager avatars 48px with `gold`-tinted role badge.

---

*All values PROPOSED pending brand direction approval. On approval of a different direction, this document is re-issued with that direction's tables. Accessibility requirements always take precedence over visual choices.*
