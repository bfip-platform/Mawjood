# D0.5 — Design System & Accessibility

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-02-ux.md` §§5, 6, 9, 11 (a11y, light/dark, tokens-structural, preserve/redesign)
**Scope:** Structural tokens, accessibility requirements, WCAG 2.2 AA target + remediation plan, light/dark mode structure, component standards. Planning only — no code changes.

**Brand boundary:** Visual token VALUES (hex colors, typefaces, brand personality) belong to the brand workstream — doc 21 (VISUAL_IDENTITY_DIRECTIONS.md). This document owns token STRUCTURE and accessibility REQUIREMENTS. **On any conflict between visual tokens and accessibility, accessibility wins** — contrast ratios and focus visibility are non-negotiable.

---

## 1. Token structure (values live in doc 21)

Components reference semantic tokens only. No hard-coded color/size values in components; a lint rule enforces this.

### 1.1 Color roles (semantic, × light/dark tables)
`bg` · `surface-1` · `surface-2` · `border` · `text-1` · `text-2` · `text-3` · `accent` · `accent-ink` (text on accent) · `success` · `warning` · `danger` · `focus-ring` · `scrim` (media caption legibility).

### 1.2 Type scale (structure)
Steps: **12 / 14 / 16 / 20 / 24 / 32 / 40**. Body line-height 1.5, headings 1.25. Max line length 45–75ch. Font stack: system stack + Arabic-capable fallback (must render Arabic and Latin well in both directions). Exact typefaces chosen by the brand workstream — they must satisfy §5 contrast and legibility rules.

### 1.3 Spacing / radius / elevation / motion (structure)
- **Spacing:** 4px base — scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Radius:** 8 (cards) · 12 (sheets/modals) · full (pills/chips/avatars).
- **Elevation:** levels 0 / 1 / 2 / 3 per mode — dark mode uses lighter overlays, not heavier black.
- **Motion:** 150ms micro · 250ms overlay · 350ms page; `ease-out`; disabled under `prefers-reduced-motion`.

### 1.4 Theme switching
System default + explicit user override (persisted, like the language toggle). `<meta name="color-scheme">` + per-mode `theme-color`.

---

## 2. Light/dark mode structure

- Two token tables (`light`, `dark`); single source of truth in a tokens file (web) mirroring the existing `P` palette object in `index.tsx` for mobile. Today's palette is the seed — every value gets a contrast audit.
- **Every text/background pair must meet §5 contrast in BOTH tables** — verified by tooling, not eyeballed.
- Danger/success colors are re-tuned per mode (dark mode needs lighter variants, not the same value on a dark background).
- The focus-ring token needs 3:1 against both `bg` values — may require a per-mode ring color.
- Photos/media get the `scrim` token for caption legibility in both modes.
- Quota meters and charts use token pairs, never raw colors.

---

## 3. Reusable component standards

Build once, use everywhere. Each component ships with its a11y contract (§5):

1. `Button` — primary/secondary/danger/ghost; loading state; full accessible name.
2. `IconButton` — 44px target; tooltip + accessible name.
3. `TextField` (+ textarea) — labelled; error slots linked via `aria-describedby`.
4. `ChatBubble` — text/voice/photo variants; action-card slot.
5. `ChatInput` — text + voice + photo; RTL-aware send placement (inline-end).
6. `SpaceTabs` — `tablist` semantics; arrow-key navigation.
7. `Card` — one card for note/thing/task/shopping rows.
8. `Modal` / `Sheet` — focus trap, Esc dismiss, return-focus to invoker.
9. `Toast` — `aria-live`; undo action slot (wraps existing `showToast`/`showUndo`).
10. `EmptyState` — illustration + title + CTA.
11. `Skeleton` — reduced-motion-safe (static when `prefers-reduced-motion`).
12. `CountdownChip` — trash days-left; text, never color-alone.
13. `QuotaMeter` — usage vs limit; labelled (not color-alone).
14. `Avatar` — initials; decorative emoji `aria-hidden`.
15. `SegmentedControl` — language, theme, filters.
16. `DataTable` — admin; sortable headers with `aria-sort`.
17. `Keypad` — vault unlock; rate-limit messaging.
18. `OfflineBanner` · `ErrorPanel` (retry slot).

---

## 4. Accessibility — WCAG 2.2 AA target

### 4.1 Baseline and remediation program
**Baseline today:** ~17 `accessibilityLabel`s in a 6,034-line screen, zero `accessibilityRole`s. This is a full remediation program, not a patch. The 17 existing labels become the seed of a complete audit: every interactive element gets a role + name, every screen gets a keyboard pass, every theme gets a contrast pass.

### 4.2 Roles & semantics (per component)
- Chat message list: `role="log"` + `aria-live="polite"` — new assistant messages announced, not the whole list.
- Action cards inside messages: real `<button>`s with names. Borrow "✅ رجع" is a button, not a Pressable div.
- Tabs (space tabs, family tabs): `role="tablist"` / `tab` / `tabpanel` with `aria-selected`; arrow-key navigation.
- Drawer/menu: `role="dialog"` when overlay; focus trap + return focus to trigger.
- Vault keypad: `role="group"` with labelled buttons; wrong-code error via `aria-live="assertive"`.
- Countdowns (trash days-left): text, not color alone.
- Every icon-only button gets an accessible name.

### 4.3 Labels & names
- All form fields labelled (`<label>` or `aria-label`); error text linked via `aria-describedby`; invalid fields get `aria-invalid`.
- Bilingual: accessible names come from the same `t()` parity system (compile-enforced) — extended to cover ARIA labels.
- Decorative emoji (🔒👨‍👩‍👧💼) marked `aria-hidden="true"`; the adjacent text label carries the name — never rely on emoji as the name.

### 4.4 Focus order & keyboard
- Logical order: skip-link ("Skip to chat") → nav → main → complementary.
- Visible focus indicator on all interactive elements: 2px outline, 3:1 against adjacent colors; never `outline: none` without a replacement.
- Chat: Enter sends, Shift+Enter newline; `/` focuses search; Esc closes overlays; arrow keys in tablists and menus.
- Focus trap in modals (tab create/delete, trash confirm, vault unlock, upgrade); Esc dismisses; focus returns to invoker.
- No keyboard traps; every hover action has a keyboard equivalent (card menus, swipe actions → buttons).

### 4.5 Contrast requirements (non-negotiable — override brand tokens on conflict)
- Text: **4.5:1** normal, **3:1** large (≥18pt / 14pt bold).
- UI components & focus indicators: **3:1** against adjacent colors.
- Verified in BOTH themes with automated checks in CI on key screens (tooling choice OPEN — axe vs pa11y; the target is fixed).
- If a brand color cannot meet these ratios, the brand workstream must adjust the value — accessibility is not restyled around the palette.

### 4.6 Screen-reader flows (must-pass scripts)
1. Onboarding end-to-end (welcome → 18+ gate → magic link → first memory) with VoiceOver/TalkBack.
2. Send a voice note, receive transcription, confirm extracted task.
3. Delete a note → find it in trash → restore it (days-left announced).
4. Switch family space, invite a member (code announced, copyable as text).
5. Unlock vault, ask the vault a question.
6. Upgrade prompt announced when quota blocks creation (never silent).

### 4.7 Reduced motion
- `prefers-reduced-motion: reduce` disables: drawer slide animation (instant), message entrance, skeleton shimmer (static), success flourishes.
- Nothing auto-plays. Voice-note waveform is user-initiated only. No parallax.

### 4.8 Touch & pointer (WCAG 2.5.x)
- 44×44px minimum targets; 8px spacing between adjacent targets.
- No drag-only interactions — reorder has up/down button alternatives; long-press actions duplicated in menus.

### 4.9 Mobile a11y notes
- `accessibilityRole` (missing today) is the single biggest mobile a11y gap — added per the §4.2 role table.
- VoiceOver/TalkBack tested on the six §4.6 scripts.

---

## 5. Preserve vs redesign (UX)

### PRESERVE (proven, user-liked, or load-bearing)
1. Chat-first home — the product's core pillar.
2. Bilingual AR/EN with compile-enforced parity — extend, never weaken.
3. Space tabs (🔒 Private / 👨‍👩‍👧 Family / 💼 Work) and their emoji identity (decorative, labelled).
4. Family built-in tabs + custom tabs.
5. Trash mechanics: universal bin, kind filters, origin-space labels, restore/restore-all, two-tap delete-forever, 30-day retention (decision #6).
6. Double-approval for governed structural actions + undo toasts.
7. "Move to suggested space?" teaching bubble; voice-reply toggle; photo attach + fullscreen viewer; audio-delete-after-transcription policy.
8. Borrowing UX: "مين أخذها؟" badge, due date, two-tap "✅ رجع".
9. Admin console feature set (responsive treatment only).
10. Mobile single-pane layout (bottom tabs + drawer) — polish, don't restructure.

### MUST CHANGE (with rationale)
1. Stretched phone UI on web → real responsive layouts (doc 5, §3). Current state is explicitly non-viable for a commercial web product.
2. a11y: ~17 labels, zero roles → WCAG 2.2 AA (§4). Launch-blocking; legal exposure.
3. Dead "soon" subscription UI → real plan/billing screens or removal. It promises payment that doesn't exist.
4. Dead anonymous-upgrade banner → working upgrade entry. Trial conversion depends on it.
5. Missing legal surfaces → Terms/Privacy with 18+ (decision #5) and trash terms. P0.
6. Missing account lifecycle → email change, deactivation, sessions. D0 gap #8.
7. Missing support path → help/FAQ/contact. D0 gap #7.
8. No system-state design → doc 5 §5 state matrix applied per screen. Offline is D0 P1.
9. Hard-coded palette → semantic tokens + dark mode (§§1–2). Contrast can't be verified otherwise; dark mode is table stakes.

---

*End of doc 6 — planning only; no code changes authorized. Visual token values: see doc 21 (brand workstream).*
