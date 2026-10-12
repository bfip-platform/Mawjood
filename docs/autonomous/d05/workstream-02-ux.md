# D0.5 Workstream 02 — UX/UI Product Spec

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Scope:** Web UX/UI for the commercial product. READ-ONLY on code; this doc is planning-only.
**Inputs:** `docs/autonomous/d0/D0_TO_D05_HANDOFF.md` (9 approved decisions), `FEATURE_STATUS_MATRIX.md`, `COMMERCIAL_READINESS_GAP_ANALYSIS.md`, `apps/mobile/src/app/index.tsx` (6,034 lines, structure skimmed).
**Stance:** Complete product-grade UX. Not an MVP.

---

## 1. Sitemap (complete IA tree)

Routes are listed as logical destinations; exact URL patterns are implementation detail (web PWA must support deep-links per D0 gap #5, so every node needs a stable route).

### 1.1 Public

```
/                        Marketing landing (AR/EN toggle, 18+ notice, pricing anchor)
/features                 Product tour (chat, spaces, vault, family, borrowing)
/pricing                  Free vs Plus tiers (ties to D0.5 quota design — workstream: billing)
/download                 iOS (TestFlight) / Android links
/terms                    Terms of Service (includes 18+ eligibility, decision #5)
/privacy                  Privacy Policy (retention, trash 30-day, photos kept, audio deleted)
/help                     Help center landing
/help/faq                 FAQ
/contact                  Support contact (ties to gap #7)
```

### 1.2 Authenticated app

```
/app                      Chat-first home (default landing; preserved)
/app/chat/:chatId         Individual chat session (deep-linkable)
/app/space/private        Private space (tabs: notes, things, custom)
/app/space/family/:id     Family space (members, shopping, tasks, agenda, things, notes, custom)
/app/space/work           Work space (tabs mirror private)
/app/trash                Universal trash (per-space + account view; 30-day recovery UX)
/app/settings             Account settings (profile, language, email change, deactivation)
/app/settings/plan        Plan & billing (Free/Plus, Stripe customer portal)
/app/settings/export      Data export (GDPR)
/app/settings/notifications  Notification preferences (morning digest etc.)
/app/vault                 Secret vault (gate per decision #4 — currently available, not paywalled)
/app/help                  In-app help (contextual FAQ)
```

### 1.3 Admin

```
/admin                    Admin console home (x-admin-token auth; existing 1,286-line console)
/admin/users              Bans, grants, limits
/admin/plans              Plan/promo management
/admin/governance         AI governance page (live since D-1)
```

### 1.4 Account lifecycle (modal overlays on /app where noted)

- Onboarding: `/onboarding` (welcome → 18+ gate → auth → space setup → first memory)
- Auth: `/login` (magic link), magic-link callback `/auth/callback`, anonymous trial upgrade prompt (existing banner, needs UI entry point per matrix row)
- Deactivation/reactivation, delete (existing cascade), email change (MISSING — new screens)

---

## 2. Screen inventory

Numbered S-1…S-18. States listed per screen: **L** loading · **E** empty · **O** offline · **X** error · **R** recovery (trash/undo).

### S-1 Public landing
- **Purpose:** First impression, conversion, legal footing.
- **Layout:** Hero (product name, one-line value prop "اسأل ذاكرتك" / "ask your memory"), 18+ badge, language toggle, feature cards (chat, spaces, vault, family), pricing anchor, download CTA, footer (Terms/Privacy/Help/Contact).
- **Key components:** Navbar (logo, Features/Pricing/Download/Help, AR/EN switch, Log in / Get started), hero, social-proof-free trust strip (privacy bullets), CTA sections.
- **States:** L (skeleton), X (asset failure fallback).

### S-2 Features tour
- Purpose: explain pillars (item memory, family coordination, secret vault, borrowing). Layout: section-per-pillar, bilingual copy, screenshots/mockups. States: standard.

### S-3 Pricing
- Purpose: Free vs Plus comparison; ties to quota design (workstream billing).
- Layout: tier cards, feature matrix, quota rows ("N memories/mo", "N GB storage" — values TBD owner), Stripe CTA buttons, footnote that existing saved memories are never deleted when quotas are exceeded (decision #2).
- States: L (price load), X (billing service down → retry).

### S-4 Terms / S-5 Privacy (legal)
- Purpose: decision #5 age eligibility, #6 trash retention, photo/audio policy, GDPR rights.
- Layout: readable long-form, section TOC (sticky on desktop), version date.
- States: static; must exist before launch (P0 item 5).

### S-6 Help/FAQ/Contact
- Purpose: close gap #7 (support path). Layout: searchable FAQ, contact form, response-time note. States: L, X (submit failure → retry + draft preserved).

### S-7 Onboarding (see §7 for flow detail)
- Screens inside flow: welcome → 18+ eligibility gate → auth (magic link or anonymous trial) → space setup → first-memory capture → home.

### S-8 Auth — magic link
- Purpose: existing `AuthScreen.tsx` flow, responsive redesign.
- Layout: email field, send-link CTA, "what's next" explainer, resend with cooldown timer.
- States: L (sending), X (invalid email / send failed / link expired → resend), success (check-inbox).

### S-9 Chat home (PRIMARY — preserved pillar)
- Purpose: chat-first home; fastest path to memory capture and recall.
- Layout (REDESIGN for web, §3): desktop = three-pane (conversation list rail left, active chat center, assistant panel/context right); tablet = two-pane; mobile = single-pane with nav.
- Key components: space tabs (🔒 Private / 👨‍👩‍👧 Family / 💼 Work — preserved), message bubbles with action cards (task confirm, tab proposal, borrow badge), chat input (text + voice note + photo attach + fullscreen photo viewer — preserved), "move to suggested space?" bubble (preserved), suggestion chips.
- States: L (message skeleton), E (new chat — preserved "good onboarding" prompt), O (queued send, banner), X (send failure → retry per message), R (undo on structural actions — preserved double-approval).

### S-10 Space view — Private / Work
- Purpose: browse organized memories. Layout: tab bar (notes / things / custom tabs — preserved), content grid (cards) on desktop, list on mobile.
- Components: tab create/rename/delete (delete → move-or-trash modal — preserved), search, filters.
- States: L, E (per-tab empty illustration + CTA), O (read from cache, write queued), X, R (restore from trash).

### S-11 Family space
- Purpose: family coordination pillar. Layout: family switcher (multi-family preserved), tabs: members / shopping / tasks / agenda / things / notes / custom (FAMILY_BUILTIN_KEYS preserved).
- Components: member list + invite (code, 7d, 10 uses — preserved), role badges (manager/member), shopping list with bought states, task assignment "name: task", agenda timeline, borrowing "مين أخذها؟" badge + due date + two-tap "✅ رجع" (preserved).
- States: L, E (per tab), O, X (invite failure, conflict), R.

### S-12 Trash
- Purpose: 30-day recovery UX (decision #6).
- Layout: filter by kind (note/task/appointment/thing/shopping_list/chat/tab — preserved TRASH_KINDS), rows with origin space, **days-left countdown** (must be prominent), restore / restore-all / delete-forever (two-tap confirm — preserved).
- States: L, E (illustration + "nothing here — deleted items stay 30 days"), X, O.
- Requirement: permanent-delete confirmation states the exact irreversible consequence.

### S-13 Secret vault
- Purpose: private notes/photos with bcrypt codes + decoy vaults (existing). Gate status: available, NOT paywalled (decision #4).
- Layout: unlock keypad/code entry, vault tabs, "اسأل خزنتك" vault-aware AI entry point.
- States: L, X (wrong code — rate-limited message, decoy behavior), O (vault locked offline unless cached with explicit user opt-in — OPEN DESIGN CHOICE, flag for security review).

### S-14 Settings — account
- Purpose: profile (display name, avatar), language (AR/EN persisted — preserved), email change (NEW — gap #8), password-less session management (device list, sign out all).
- States: L, X per field with inline validation.

### S-15 Settings — plan & billing
- Purpose: current tier, usage meters vs quotas (ties to workstream billing), upgrade/downgrade, Stripe customer portal link, invoices, cancel + retention flow.
- NEW for commercial. States: L, X (portal load failure).

### S-16 Settings — privacy & data
- Purpose: export (existing `account-export` fn → UI), trash settings (retention display, read-only 30 days), deactivation (NEW — gap #8), delete account (existing cascade → two-step confirm + 30-day? OPEN: does delete get 30-day recovery — flag), notification prefs, voice-reply toggle (existing `mawjood.voice-reply`).

### S-17 Admin console
- Purpose: preserved as-is (bans, grants, plans, promos, AI governance). Responsive: keep dense table layout on desktop; read-only summaries on smaller screens.
- Constraint: no user-facing a11y relaxations here, but WCAG AA still applies to shipped web.

### S-18 Global overlays
- Toast system (existing `showToast`/`showUndo` — preserved, must be ARIA live), error boundary (existing root — extend per screen type), offline banner, quota-limit modal (block new creation with upgrade path; NEVER silent delete — decision #2), upgrade prompt (replaces dead "soon" promises — matrix billing row).

---

## 3. Responsive strategy

**Redesign required:** current web is an Expo export rendering a stretched phone UI. This is explicitly called out in the task and in the gap analysis. Breakpoints:

### Desktop ≥1280px
- Chat home: **three-pane** — (1) left rail 280px: spaces switcher + conversation history; (2) center: active chat, max-width 760px centered; (3) right rail 320px: assistant context (extracted items preview, suggestions, space tabs).
- Space views: left tab rail (vertical), content **card grid** (min 3 columns), right detail drawer when an item is selected.
- Family: members column + content grid.
- Settings/admin: left nav rail + content panel.
- Marketing: full-width sections, max-width 1200px container.

### Tablet 768–1279px
- Chat: **two-pane** — left rail collapsible (overlay when open), center chat full-bleed.
- Space views: horizontal tab bar, **2-column** grid.
- Detail drawers become slide-over overlays.
- Trash: table → stacked cards.

### Mobile <768px
- **Preserved current structure** (single-column, bottom space tabs 🔒/👨‍👩‍👧/💼, drawer menu) — this is the proven, user-liked mobile UX; keep it, polish spacing/touch targets.
- Minimum touch target 44×44 (WCAG 2.5.8).

### What changes at each breakpoint (rules)
- **Navigation:** bottom tabs (mobile) → side rail (tablet/desktop). Drawer menu merges into the left rail on desktop.
- **Content density:** 1 col → 2 col → 3 col grids; chat max-width clamps so line length stays readable (45–75 chars).
- **Never:** stretch the phone layout wider (current defect); never show all three panes below 1280px; never collapse the 18+ gate or legal links at any size.
- **Safe areas / notch:** respect on mobile; desktop uses full viewport with sticky rails.

---

## 4. Bilingual behavior (AR RTL / EN LTR)

**Preserved:** compile-enforced translation parity (every `t()` key exists in both languages). That mechanism is a product asset — keep it, extend to web strings and ARIA labels.

### Mirroring rules
- **Full mirror:** layout direction, navigation rails (left rail ↔ right rail in AR), drawer slide direction, tab order progression, back/forward chevrons, progress steps, timelines, chat bubble tails, countdown chips.
- **Never mirror:** media (photos), code/UPC/barcode, numerals in prices (keep LTR runs with `dir="ltr"` isolates), brand logos, the vault keypad, map pins.
- **Mixed text:** user-generated Arabic inside English UI (and vice versa) uses `unicode-bidi: isolate` so punctuation doesn't jump.
- **Icons:** directional icons (arrows, send, reply, undo/redo) get RTL-flipped variants; non-directional icons (trash, plus, camera) stay.

### Per-component notes
- Chat input: send button at the **end** side (right in EN, left in AR); voice-note button mirrors with it.
- Toasts: slide from the inline-end corner.
- Tab bars: first tab starts at inline-start.
- Trash countdown: number stays LTR-isolated ("٢٩ يوم" vs "29 days" per locale numerals — OPEN: Eastern Arabic vs Western numerals per-user preference; flag, default = Western in EN, Eastern optional in AR).
- Admin console: English-only is acceptable (internal tool) but RTL toggle must not break it.
- Dates/times: `Intl.DateTimeFormat` with the active locale; never hand-format.

---

## 5. Accessibility spec — WCAG 2.2 AA target

**Baseline today:** ~17 `accessibilityLabel`s in a 6,034-line screen, zero `accessibilityRole`s. This is a full remediation program, not a patch.

### Roles & semantics (per component)
- Chat message list: `role="log"` with `aria-live="polite"`; new assistant messages announced, not the whole list.
- Action cards inside messages: real `<button>`s with names; borrow "✅ رجع" is a button, not a Pressable div.
- Tabs (space tabs, family tabs): `role="tablist"` / `tab` / `tabpanel` with `aria-selected`, arrow-key navigation.
- Drawer/menu: `role="dialog"` when overlay, focus trap + return focus to trigger.
- Vault keypad: `role="group"` with labelled buttons; wrong-code error via `aria-live="assertive"`.
- Countdowns (trash days-left): text, not color alone (see contrast).
- Every icon-only button gets an accessible name (the 17 existing labels become the seed of a complete audit).

### Labels & names
- All form fields labelled (`<label>` or `aria-label`); error text linked via `aria-describedby`; invalid fields get `aria-invalid`.
- Bilingual: accessible names come from the same `t()` parity system (compile-enforced).
- Decorative emoji (🔒👨‍👩‍👧💼) marked `aria-hidden="true"` with the adjacent text label carrying the name — never rely on emoji as the name.

### Focus order & keyboard
- Logical order: skip-link ("Skip to chat") → nav → main → complementary.
- Visible focus indicator on all interactive elements (2px outline, 3:1 against adjacent colors, never `outline: none` without replacement).
- Chat: Enter sends, Shift+Enter newline; `/` focuses search; Esc closes overlays; arrow keys in tablists and menus.
- Focus trap in modals (tab create/delete, trash confirm, vault unlock, upgrade); Esc dismisses; focus returns to invoker.
- No keyboard traps; all hover actions have keyboard equivalents (card menus, swipe actions → buttons).

### Contrast ratios
- Text: 4.5:1 normal, 3:1 large (≥18pt/14pt bold).
- UI components & focus indicators: 3:1 against adjacent colors.
- Both themes (see §6) verified with automated checks in CI (axe/pa11y on key screens) — OPEN: tooling choice, not the target.

### Screen-reader flows (must-pass scripts)
1. Onboarding end-to-end (welcome → 18+ gate → magic link → first memory) with VoiceOver/TalkBack.
2. Send a voice note, receive transcription, confirm extracted task.
3. Delete a note → find it in trash → restore it (days-left announced).
4. Switch family space, invite a member (code announced, copyable as text).
5. Unlock vault, ask the vault a question.
6. Upgrade prompt announced when quota blocks creation (not silent).

### Reduced motion
- `prefers-reduced-motion: reduce` disables: drawer slide animation (instant), message entrance, skeleton shimmer (static), confetti/success flourishes.
- Auto-playing anything: none. Voice-note waveform is user-initiated only.
- Parallax: none.

### Touch & pointer (2.5.x)
- 44×44px minimum targets; 8px spacing between adjacent targets.
- No drag-only interactions (reorder has up/down button alternative); long-press actions duplicated in menus.

---

## 6. Light/dark mode

### Token strategy
- Semantic tokens only in components: `bg/surface/border/text-primary/text-secondary/accent/success/warning/danger/focus-ring`.
- Two token tables: `light` and `dark`; single source of truth in a tokens file (web) that mirrors the existing `P` palette object in `index.tsx` for mobile (today's palette is the seed — audit each value for dark-mode contrast).
- No hard-coded hex in components; lint rule to enforce.
- Theme switch: system default + explicit user override (persisted, like the language toggle); `<meta name="color-scheme">` + `theme-color` per mode.

### Contrast in both
- Every text/background pair ≥ 4.5:1 in **both** tables (verified, not eyeballed).
- Danger/destructive red and success green re-tuned per mode (dark mode needs lighter variants, not the same hex on dark bg).
- Focus ring token has 3:1 against both `bg` values — may need per-mode ring color.
- Photos/media get a scrim token for caption legibility in both modes.
- Charts/meters (quota usage) use token pairs, never raw colors.

---

## 7. Onboarding flow + account settings screens

### Onboarding: welcome → 18+ gate → auth → space setup → first memory
1. **Welcome** (S-7a): value prop in active language, language switcher prominent, "18+ only" badge (links Terms). CTA: Get started.
2. **18+ eligibility gate** (S-7b) — APPROVED decision #5, must enforce:
   - Explicit checkbox or date-of-birth entry: "I confirm I am 18 or older." No pre-checked box; no dark patterns; declining exits to a polite dead-end screen (not a loop).
   - DOB entry (if chosen over checkbox) validates ≥18 years; invalid → clear error, retry.
   - Logged as consent event (ties to legal P0 item 5). OPEN: checkbox vs DOB — flag for legal review; recommend checkbox + Terms acceptance to minimize PII.
3. **Auth** (S-7c): magic-link email (existing flow, responsive) OR "Try anonymously" (existing trial). Anonymous path shows the upgrade banner **with a working UI entry** (matrix: currently dead code) and explains trial limits.
4. **Space setup** (S-7d): shows the three spaces (Private/Family/Work) with one-line descriptions; Family offers "create" or "join with invite code" (existing join-family); skippable — default lands in Private.
5. **First memory** (S-7e): guided capture — "Tell me something to remember" with text/voice/photo options; on save, assistant confirms extraction and shows where it landed (space + tab) with the "move to suggested space?" teaching moment (preserved pattern).
6. **Done → chat home.** Progress indicator throughout (steps 1–5), back navigation, resume-if-abandoned via local state.

### Account settings screens
- **Profile** (S-14): display name, avatar, language (AR/EN persisted toggle — preserved).
- **Email change** (NEW): current email → new email → verify via magic link to the NEW address → old address notified. States: pending-verification badge.
- **Sessions** (NEW): device/session list, "sign out all others."
- **Plan & billing** (S-15): tier card, usage meters vs quotas, manage via Stripe portal, invoices list, cancel flow with retention copy that restates: saved memories are never deleted (decision #2).
- **Privacy & data** (S-16): export download (existing fn), trash info (30 days, read-only display), deactivation (NEW: reversible, data retained, sessions revoked), delete account (existing cascade: two-step confirm, explicit consequence list; OPEN: whether a 30-day recovery window applies to full-account delete — flag for legal).
- **Notifications**: morning digest toggle, reminder channels, per-family-space mute.

---

## 8. System states (per screen type)

| Screen type | Loading | Empty | Offline | Error | Recovery |
|---|---|---|---|---|---|
| Chat home | message skeletons, shimmer (static if reduced motion) | preserved good-onboarding prompt + suggestion chips | queued-send banner; input stays usable | per-message retry; toast on send failure | undo toast on structural actions; double-approval modal |
| Lists (notes/things/tasks/shopping/agenda) | card skeletons | illustration + CTA per tab ("No things yet — add your first") | cached read + "offline" badge; writes queued | inline error row + retry | trash restore; two-tap delete-forever |
| Detail (note/thing/vault item) | skeleton | n/a | cached copy with staleness note | full-screen error + retry | version/undo where applicable |
| Trash | skeleton rows | illustration + "deleted items stay 30 days" | list cached; restore queued | row-level retry | restore / restore-all; days-left countdown |
| Auth/onboarding | button spinner | n/a | "you're offline" blocking with retry | inline field errors; expired-link resend | n/a (magic link re-issue) |
| Billing | skeleton tiers | n/a (always a tier) | read-only cached tier; no plan changes | portal load failure → retry + support link | dunning: clear "payment failed — update card" with grace copy |
| Admin | skeleton tables | "no rows" states | admin requires online (explicit) | per-action error toast | ban/grant reversible actions with confirm |

**Global rules:** every destructive action is two-step; every queued offline write is visible and cancellable; no dead buttons — if a feature isn't live, it isn't shown (kill the dead "soon" subscription items from the matrix billing row); error copy is human, bilingual, and always offers a next step.

---

## 9. Design tokens + component library

### Tokens
- **Color:** semantic roles (bg, surface-1/2, border, text-1/2/3, accent, accent-ink, success, warning, danger, focus-ring) × light/dark tables (§6). Brand accent derived from current palette `P` after contrast audit.
- **Type:** scale 12/14/16/20/24/32/40; system stack + Arabic-capable fallback (e.g., `-apple-system, "Segoe UI", Tahoma, "Noto Kufi Arabic", sans-serif`); line-height 1.5 body, 1.25 headings; max line length 45–75ch.
- **Spacing:** 4px base, scale 4/8/12/16/24/32/48/64.
- **Radius:** 8 (cards), 12 (sheets/modals), full (pills/chips/avatars).
- **Elevation:** 0/1/2/3 shadow tokens per mode (dark mode uses lighter overlays, not heavier black).
- **Motion:** 150ms micro / 250ms overlay / 350ms page; `ease-out`; disabled under reduced motion.

### Reusable component library (build once, use everywhere)
1. `Button` (primary/secondary/danger/ghost, loading state, full a11y name)
2. `IconButton` (44px target, tooltip + accessible name)
3. `TextField` (+ textarea, labelled, error slots)
4. `ChatBubble` (text/voice/photo variants, action-card slot)
5. `ChatInput` (text + voice + photo, RTL-aware send placement)
6. `SpaceTabs` (tablist semantics, arrow-key nav)
7. `Card` (note/thing/task/shopping rows share one card)
8. `Modal`/`Sheet` (focus trap, Esc, return-focus)
9. `Toast` (aria-live, undo action slot — wraps existing showToast/showUndo)
10. `EmptyState` (illustration + title + CTA)
11. `Skeleton` (reduced-motion-safe)
12. `CountdownChip` (trash days-left; text, not color-only)
13. `QuotaMeter` (usage vs limit; labelled)
14. `Avatar` (initials, aria-hidden emoji rule)
15. `SegmentedControl` (language, theme, filters)
16. `DataTable` (admin; sortable headers with aria-sort)
17. `Keypad` (vault unlock; rate-limit messaging)
18. `OfflineBanner`, `ErrorPanel` (retry slot)

---

## 10. Future mobile reuse strategy (web → iOS/Android)

- **Spec-first reuse:** this document is the source of truth for IA, copy, states, and a11y semantics; mobile implements the same screen inventory (S-1…S-18) with native navigation (stack + bottom tabs) instead of URL routes.
- **What transfers directly:** token tables (§9) map to the existing `P` palette + a new dark table; the component library maps 1:1 to React Native primitives (Button, ChatBubble, Toast already exist in `index.tsx` — refactor targets, not rewrites); bilingual parity system and mirroring rules are platform-agnostic; the 18+ gate, trash, vault, and settings flows are identical logic.
- **Expo/RN notes:** keep Expo Router for deep-links (`/app/chat/:chatId` ↔ mobile route parity); `accessibilityRole` (missing today — the single biggest mobile a11y gap) gets added per §5 role table; test with VoiceOver/TalkBack on the six screen-reader scripts; web three-pane becomes native master-detail (UISplitViewController / SlidingPaneLayout); offline queue-and-sync (D0 P1 item 9) is designed once in the engine (`@mawjood/voice-engine`) and consumed by both.
- **What does NOT transfer:** CSS breakpoints (native uses size classes + orientation), hover states (use press states), the marketing site (mobile gets App Store/Play listings instead).
- **Guardrail:** no mobile redesign of the chat-first home without owner approval — it is the proven pillar (§11 preserve list).

---

## 11. Redesign vs preserve list

### PRESERVE as-is (proven, user-liked, or load-bearing)
1. **Chat-first home** — the product's core pillar; keep IA position and fast-path behavior.
2. **Bilingual AR/EN with compile-enforced parity** — extend, never weaken.
3. **Space tabs** (🔒 Private / 👨‍👩‍👧 Family / 💼 Work) and their emoji identity (decorative, labelled).
4. **Family built-in tabs** (members/shopping/tasks/agenda/things/notes) + custom tabs.
5. **Trash mechanics:** universal bin, kind filters, origin-space labels, restore/restore-all, two-tap delete-forever, 30-day retention (decision #6).
6. **Double-approval for governed structural actions** + undo toasts.
7. **"Move to suggested space?"** teaching bubble; voice-reply toggle; photo attach + fullscreen viewer; audio-delete-after-transcription policy.
8. **Borrowing UX:** "مين أخذها؟" badge, due date, two-tap "✅ رجع".
9. **Admin console** feature set (responsive treatment only).
10. **Mobile single-pane layout** (bottom tabs + drawer) — polish, don't restructure.

### MUST CHANGE (with rationale)
1. **Stretched phone UI on web → real responsive layouts** (§3). Rationale: commercial web product; current state is explicitly non-viable (gap analysis "Web (Expo export): stretched phone UI").
2. **a11y: ~17 labels, zero roles → WCAG 2.2 AA** (§5). Rationale: gap #9, launch-blocking for public/commercial product; legal exposure.
3. **Dead "soon" subscription UI → real plan/billing screens or removal** (§2 S-15, §8). Rationale: promises payment that doesn't exist (matrix billing row).
4. **Dead anonymous-upgrade banner → working upgrade entry** (§7). Rationale: matrix flags it as dead code; trial conversion depends on it.
5. **Missing legal surfaces → Terms/Privacy with 18+ and trash terms** (S-4/S-5). Rationale: P0 item 5, decision #5.
6. **Missing account lifecycle → email change, deactivation, sessions** (§7). Rationale: gap #8.
7. **Missing support path → help/FAQ/contact** (S-6). Rationale: gap #7.
8. **No system-state design → §8 state matrix applied per screen.** Rationale: reliability gap; offline is P1 item 9.
9. **Hard-coded palette → semantic tokens + dark mode** (§6, §9). Rationale: contrast can't be verified otherwise; dark mode is table stakes.

### OPEN DESIGN CHOICES (no owner approval invented — flagged for decisions)
- O-1: Checkbox vs DOB for the 18+ gate (recommend checkbox + Terms; legal review).
- O-2: Eastern vs Western Arabic numerals in AR UI (default Western EN / optional Eastern AR).
- O-3: Vault offline behavior (locked offline vs cached with explicit opt-in; security review).
- O-4: Whether full account delete gets a 30-day recovery window (legal review).
- O-5: a11y CI tooling choice (axe vs pa11y; target WCAG 2.2 AA is fixed).
- O-6: Quota numerics (Free/Plus limits) — owned by workstream billing; UX consumes the values.
- O-7: Exact marketing-site information architecture and copy (owner is the voice of the brand).

---

*End of workstream-02-ux.md — planning only; no code changes authorized.*
