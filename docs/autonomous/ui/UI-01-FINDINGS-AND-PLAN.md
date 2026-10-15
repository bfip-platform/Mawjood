# UI-01 — iPhone Beta UI Recovery: findings & remediation (Build 23 device review)

Scope: the six issues from the first real-device review of TestFlight Build 23.
Method: read-first audit of `apps/mobile/src/app/index.tsx` (6,385 lines),
`src/lib/SwipeRow.tsx`, `src/lib/SearchBar.tsx`, `src/components/AuthScreen.tsx`,
`src/screens/home/styles.ts`, `src/lib/theme.ts`, `src/lib/i18n.ts`.
No data, auth, permission, or Supabase behavior is touched. No visual redesign
(Warm Archive restyle is UI-02→UI-05; design authority:
`docs/autonomous/d05/BRAND_APPROVAL_GATE.md`, `DESIGN_SYSTEM_AND_ACCESSIBILITY.md`).

## Cross-cutting root cause

The app had exactly **one** `KeyboardAvoidingView` (AuthScreen) and **zero**
keyboard handling on the main screen and in every modal. `SafeAreaView`
insets do not include the keyboard, so on iOS nothing ever moved out of the
keyboard's way. Direction handling exists as a pattern (`ta()` in i18n.ts,
`codeAlign()` for code fields, SearchBar applies `ta()`) — several inputs
simply never adopted it.

## Screen-by-screen findings

### 1. Chat (home) — composer obscured by keyboard · Issue 1
- **Root cause:** the chat branch (`view === 'chat'`) rendered
  `FlatList + chatFooter` inside the root `SafeAreaView` with no
  keyboard avoidance. Keyboard opened → composer stayed at the physical
  bottom, covered.
- **Fix:** the branch is now wrapped in
  `KeyboardAvoidingView behavior="padding"` (iOS), `style={flex:1}` — the
  footer rides above the keyboard and the list shrinks. Same pattern
  AuthScreen already used.

### 2. Modals with text inputs — inputs/buttons hidden behind keyboard · Issue 2
- **Root cause:** all fade modals render a statically centered card
  (`modalBg`: flex-centered, padding 24). The keyboard covers the lower
  half; cards never move.
- **Fix:** the modal background container of every input-bearing fade
  modal is now a `KeyboardAvoidingView` (same iOS padding behavior),
  centering the card in the space above the keyboard: **profile, tab
  create/rename, join-family, rename-family, new-shopping-list**.
  Modals that never open a keyboard (about, limits, delete confirm,
  paywall, invite-code display, move-to-tab, photo viewer) are unchanged.

### 3. Arabic placeholders / RTL in inputs · Issue 3
- **Root causes (three):**
  a. Several free-text inputs never set `textAlign`, so in Arabic mode
     text and placeholders anchored LTR-left while the app is
     Arabic-first. Affected: main composer, vault secret composer,
     assignee input, rename-family input.
  b. Three free-text fields reused the **code-entry style** (`inviteInput`:
     24px, weight 800, `letterSpacing: 4`) — designed for short Latin
     codes — for Arabic prose: tab name, new-list title, new-list items.
     Letterspacing Arabic script disconnects letterforms and inflates
     sizing: the reported "broken spacing/sizing".
  c. AuthScreen passed `placeholderTextColor` as the **string literal**
     `"P.faint"` (invalid color) on both inputs — placeholders rendered
     in a fallback color.
- **Fixes:** (a) `textAlign: ta()` on the four inputs (SearchBar and the
  vault/code fields already did this — pattern-consistent); (b) the three
  prose fields now use the app's designated filled-input style
  (`fieldInput`, 16px, no letterspacing) + `ta()`; the actual code inputs
  (join code, OTP, vault codes) keep their code styling and
  center/`codeAlign()` behavior; (c) `placeholderTextColor={P.faint}`.
- **Not in UI-01:** the brand fonts named in `theme.ts` (`BRAND.fontLatin/
  fontArabic` — Inter / IBM Plex Sans Arabic) are **not loaded anywhere**
  (no `useFonts`); all text renders in the iOS system face, whose Arabic
  metrics differ from the Latin ones. Loading the approved typefaces is a
  design-system change — scheduled for UI-02, deliberately not smuggled
  into this recovery pass.

### 4. Shopping-list rows — overlapping swipe/action backgrounds · Issue 4
### 5. Archived shopping rows — oversized red background, displaced cards · Issue 5
- **Root cause (shared, in `src/lib/SwipeRow.tsx`):** the revealed action
  layer was styled `flex: 1` with no width bound, so the green/red
  background spanned the **entire row width** behind the card, bled past
  the card's rounded corners (nothing clipped it), and extended into the
  card's own `marginBottom` zone — reading as overlap on active rows and
  as an oversized red slab behind displaced archived cards.
- **Fix:** action tiles are now a fixed 84px width, icon centered; the
  `Swipeable` container clips the action layer to the card's corner
  radius (`containerStyle` + new `radius` prop — 14 for shopping cards,
  12 default matching `famRow`); `shopListCard`'s `marginBottom` was
  removed because the list's `gap: 10` already owns that spacing (the
  double spacing also contributed to the displaced look). Behavior is
  unchanged: same swipe directions, same actions, same
  one-row-open-at-a-time rule.
- **Tradeoff (explicit):** clipping the container also clips the row
  cards' soft drop shadows at the swipe container's edge (shadowOpacity
  0.05 — barely perceptible). Accepted for UI-01; UI-02's card restyle
  can revisit shadow treatment holistically.

### 6. Modal content / bottom actions clipped · Issue 6
- **Root cause:** base `modalCard` had **no height bound** (only the
  profile and shopping-mode cards capped themselves at 86%/85%). On
  smaller screens — and with the keyboard open — tall cards (new-list:
  title + assignee chips + multiline items + buttons) overflowed the
  centered overlay with actions pushed off-screen.
- **Fix:** `modalCard` gains `maxHeight: '88%'` (profile 86% /
  shopping-mode 85% keep their tighter caps via style order), combined
  with the Issue-2 keyboard avoidance that restores the space the
  keyboard took. The two page modals (vault, vault management) also get
  the keyboard wrap — their bottom fields/save actions had the same
  coverage defect as the chat composer.

### Screens audited, no change needed
- **AuthScreen:** already keyboard-avoiding (the pattern source); only
  the placeholder-color literal (3c) was fixed.
- **Vault code fields / profile security fields:** already use
  `codeAlign()`/`ta()` correctly.
- **SearchBar:** already direction-aware.
- **Trash page, shopping-mode modal:** no text inputs; the shopping-mode
  card was already height-capped with a capped inner list.
- **Tasks / things / notes / secrets rows:** same `SwipeRow` fix applies
  (12px/14px radii match their cards).

## Regression tests (in `supabase/tests/unit.test.mjs`, +5 guards)
Keyboard-avoidance coverage count + iOS behavior; composer/modal inputs
carry `ta()`/field styles (anchor-window checks); SwipeRow action is a
fixed width and never `flex: 1`, container clips with radius; modalCard
is height-bounded; shopListCard carries no margin; AuthScreen has no
`"P.faint"` literal. Suite: **205/205**. Battery: tsc clean, expo lint
0 errors, expo-doctor 20/21 (sole failure = external SDK patch-wave
drift, identical on main; not a CI gate), env-absent web export passes.

## Deliberately deferred to UI-02→UI-05
Warm Archive restyle (ivory/terracotta palette is NOT yet in `theme.ts` —
current palettes are the v1.2 baseline), brand font loading, icon system
unification (rows still use emoji glyphs), motion/reduced-motion, dark
palette polish. UI-01 changes no colors, no copy, no navigation, and no
layout structure beyond the fixes above.
