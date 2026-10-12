# D0.5 — Screen Map & UX Spec

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-02-ux.md` (UX/UI product spec)
**Scope:** Complete web sitemap, screen inventory S-1–S-18, responsive behavior, bilingual layout rules, system states, onboarding, account settings, mobile reuse. Planning only — no code changes.

**Owner decisions applied:** #5 (18+ gate in onboarding — checkbox-vs-DOB is OPEN, noted below) · #6 (30-day trash recovery UX) · #2 (quota modals block creation, never silent-delete) · #4 (vault gate stays off).

---

## 1. Sitemap

Every node needs a stable route — the web PWA must support deep-links (D0 gap #5: no SEO/PWA/deep-links).

### 1.1 Public

| Route | Screen | Purpose |
|---|---|---|
| `/` | S-1 Landing | First impression, conversion, legal footing (18+ notice, pricing anchor) |
| `/features` | S-2 Features tour | Pillar explainer: chat, spaces, vault, family, borrowing |
| `/pricing` | S-3 Pricing | Free vs Plus comparison, quota rows (values TBD — owner), Stripe CTAs |
| `/download` | — | iOS (TestFlight) / Android links |
| `/terms` | S-4 Terms | Terms of Service (18+ eligibility per decision #5) |
| `/privacy` | S-5 Privacy | Privacy Policy (retention, trash 30-day, photos kept, audio deleted) |
| `/help` | S-6 Help | Help center landing |
| `/help/faq` | S-6 FAQ | Searchable FAQ |
| `/contact` | S-6 Contact | Support contact form (closes D0 gap #7) |

### 1.2 Authenticated app

| Route | Screen | Purpose |
|---|---|---|
| `/app` | S-9 Chat home | Chat-first home (default landing; preserved pillar) |
| `/app/chat/:chatId` | S-9 | Individual chat session (deep-linkable) |
| `/app/space/private` | S-10 | Private space (tabs: notes, things, custom) |
| `/app/space/family/:id` | S-11 | Family space (members, shopping, tasks, agenda, things, notes, custom) |
| `/app/space/work` | S-10 | Work space (tabs mirror private) |
| `/app/trash` | S-12 | Universal trash — per-space + account view, 30-day recovery |
| `/app/vault` | S-13 | Secret vault (available, NOT paywalled — decision #4) |
| `/app/settings` | S-14 | Account settings (profile, language, email change, sessions) |
| `/app/settings/plan` | S-15 | Plan & billing (tier, usage meters, Stripe portal, invoices) |
| `/app/settings/privacy` | S-16 | Privacy & data (export, trash info, deactivation, delete) |
| `/app/settings/notifications` | S-16 | Notification preferences (morning digest, per-space mute) |
| `/app/help` | S-6 | In-app contextual help |

### 1.3 Admin

| Route | Screen | Purpose |
|---|---|---|
| `/admin` | S-17 | Console home (`x-admin-token` auth; existing 1,286-line console) |
| `/admin/users` | S-17 | Bans, grants, limits |
| `/admin/plans` | S-17 | Plan/promo management |
| `/admin/governance` | S-17 | AI governance page (live since D-1) |

### 1.4 Account lifecycle (modal overlays on `/app` where noted)

| Route | Screen | Purpose |
|---|---|---|
| `/onboarding` | S-7 | Welcome → 18+ gate → auth → space setup → first memory |
| `/login` | S-8 | Magic-link auth |
| `/auth/callback` | — | Magic-link callback |
| (overlay) | — | Anonymous trial upgrade prompt (existing banner needs a working UI entry — currently dead code) |
| (overlay) | — | Deactivation / reactivation |
| (overlay) | — | Account delete (existing cascade, two-step confirm) |
| (overlay) | — | Email change (NEW — D0 gap #8) |

---

## 2. Screen inventory (S-1–S-18)

States key: **L** loading · **E** empty · **O** offline · **X** error · **R** recovery (trash/undo).

### S-1 — Public landing
- **Purpose:** First impression, conversion, legal footing.
- **Layout:** Navbar (logo, Features/Pricing/Download/Help, AR/EN switch, Log in / Get started) → hero (product name, one-line value prop "اسأل ذاكرتك" / "ask your memory") → 18+ badge → feature cards (chat, spaces, vault, family) → trust strip (privacy bullets, no social proof invented) → pricing anchor → download CTA → footer (Terms/Privacy/Help/Contact).
- **Key components:** Navbar, hero, feature cards, CTA sections, footer.
- **States:** L (skeleton), X (asset failure → fallback).

### S-2 — Features tour
- **Purpose:** Explain the pillars: item memory, family coordination, secret vault, borrowing.
- **Layout:** One section per pillar, bilingual copy, screenshots/mockups.
- **States:** Standard.

### S-3 — Pricing
- **Purpose:** Free vs Plus comparison; ties to quota design (workstream: billing).
- **Layout:** Tier cards, feature matrix, quota rows ("N memories/mo", "N GB storage" — values TBD by owner, never invented), Stripe CTA buttons, footnote: existing saved memories are never deleted when quotas are exceeded (decision #2).
- **States:** L (price load), X (billing service down → retry).

### S-4 — Terms of Service · S-5 — Privacy Policy
- **Purpose:** Legal surfaces — decision #5 age eligibility, decision #6 trash retention, photo/audio policy, GDPR rights.
- **Layout:** Readable long-form, section TOC (sticky on desktop), version date.
- **States:** Static. **Must exist before launch** (D0 P0 item 5).

### S-6 — Help / FAQ / Contact
- **Purpose:** Close D0 gap #7 (support path).
- **Layout:** Searchable FAQ, contact form, response-time note.
- **States:** L, X (submit failure → retry + draft preserved).

### S-7 — Onboarding
- **Purpose:** First-run experience ending in chat home. Full flow in §6 below.
- **Sub-screens:** welcome → 18+ eligibility gate → auth (magic link or anonymous trial) → space setup → first-memory capture → home.

### S-8 — Auth (magic link)
- **Purpose:** Existing `AuthScreen.tsx` flow, responsive redesign.
- **Layout:** Email field, send-link CTA, "what's next" explainer, resend with cooldown timer.
- **States:** L (sending), X (invalid email / send failed / link expired → resend), success (check-inbox).

### S-9 — Chat home (PRIMARY — preserved pillar)
- **Purpose:** Chat-first home; fastest path to memory capture and recall.
- **⚠️ Correction (owner Decision #12, 2026-10-12):** the "desktop three-pane" line below was a redesign proposal, NOT the baseline. The baseline is the CURRENT app (see `UX_ARCHITECTURE_CORRECTION.md` §2): chat home + header + space-tabs row + drawer. On desktop the drawer destinations become a persistent sidebar; the assistant-context third pane is optional/future. The D0.5 dashboard-style mockups were exploration only.
- **Layout (baseline):** mobile single-pane chat (header ☰ + space-tabs row + composer; drawer navigation); desktop/tablet = sidebar (drawer destinations) + spacious centered chat column.
- **Key components:** Space tabs (🔒 Private / 👨‍👩‍👧 Family / 💼 Work — preserved), message bubbles with action cards (task confirm, tab proposal, borrow badge), chat input (text + voice note + photo attach + fullscreen photo viewer — preserved), "move to suggested space?" bubble (preserved), suggestion chips.
- **States:** L (message skeleton), E (new chat — preserved good-onboarding prompt), O (queued send + banner), X (send failure → retry per message), R (undo on structural actions — preserved double-approval).

### S-10 — Space view (Private / Work)
- **Purpose:** Browse organized memories.
- **Layout:** Tab bar (notes / things / custom tabs — preserved); content grid (cards) on desktop, list on mobile.
- **Key components:** Tab create/rename/delete (delete → move-or-trash modal — preserved), search, filters.
- **States:** L, E (per-tab empty illustration + CTA), O (read from cache, writes queued), X, R (restore from trash).

### S-11 — Family space
- **Purpose:** Family coordination pillar.
- **Layout:** Family switcher (multi-family preserved); tabs: members / shopping / tasks / agenda / things / notes / custom (FAMILY_BUILTIN_KEYS preserved).
- **Key components:** Member list + invite (code, 7d, 10 uses — preserved), role badges (manager/member), shopping list with bought states, task assignment "name: task", agenda timeline, borrowing "مين أخذها؟" badge + due date + two-tap "✅ رجع" (preserved).
- **States:** L, E (per tab), O, X (invite failure, conflict), R.

### S-12 — Trash
- **Purpose:** 30-day recovery UX (decision #6).
- **Layout:** Filter by kind (note/task/appointment/thing/shopping_list/chat/tab — preserved TRASH_KINDS), rows with origin space, **days-left countdown (must be prominent)**, restore / restore-all / delete-forever (two-tap confirm — preserved).
- **States:** L, E (illustration + "nothing here — deleted items stay 30 days"), X, O.
- **Requirement:** Permanent-delete confirmation states the exact irreversible consequence.

### S-13 — Secret vault
- **Purpose:** Private notes/photos with bcrypt codes + decoy vaults (existing). Gate status: available, NOT paywalled (decision #4).
- **Layout:** Unlock keypad/code entry, vault tabs, "اسأل خزنتك" vault-aware AI entry point.
- **States:** L, X (wrong code — rate-limited message, decoy behavior), O (vault locked offline unless cached with explicit user opt-in — OPEN design choice, security review required).

### S-14 — Settings: account
- **Purpose:** Profile (display name, avatar), language (AR/EN persisted — preserved), email change (NEW — D0 gap #8), password-less session management (device list, sign out all).
- **States:** L, X per field with inline validation.

### S-15 — Settings: plan & billing
- **Purpose:** Current tier, usage meters vs quotas (ties to billing workstream), upgrade/downgrade, Stripe customer portal link, invoices, cancel + retention flow with copy restating: saved memories are never deleted (decision #2).
- **NEW** for commercial. **States:** L, X (portal load failure).

### S-16 — Settings: privacy & data
- **Purpose:** Export (existing `account-export` fn → UI), trash settings (retention display, read-only 30 days), deactivation (NEW — D0 gap #8: reversible, data retained, sessions revoked), delete account (existing cascade → two-step confirm + explicit consequence list; OPEN: whether full-account delete gets a 30-day recovery window — legal review), notification prefs, voice-reply toggle (existing `mawjood.voice-reply`).

### S-17 — Admin console
- **Purpose:** Preserved as-is (bans, grants, plans, promos, AI governance). Responsive: dense table layout on desktop; read-only summaries on smaller screens.
- **Constraint:** WCAG 2.2 AA still applies to shipped web, including admin.

### S-18 — Global overlays
- **Toast system** (existing `showToast`/`showUndo` — preserved, must be ARIA live), **error boundary** (existing root — extend per screen type), offline banner, **quota-limit modal** (blocks new creation with upgrade path — NEVER silent delete, decision #2), upgrade prompt (replaces dead "soon" promises).

---

## 3. Responsive strategy

**The stretched-phone web UI is killed.** Current web is an Expo export rendering a stretched phone layout — explicitly non-viable for a commercial web product. Real responsive layouts below.

### Breakpoints

| Breakpoint | Chat home (S-9) | Space views (S-10/S-11) | Settings/Admin |
|---|---|---|---|
| **Desktop ≥1280px** | Three-pane: left rail 280px (spaces + history) · center chat max-width 760px · right rail 320px (assistant context) | Left vertical tab rail · 3-column card grid · right detail drawer on selection | Left nav rail + content panel |
| **Tablet 768–1279px** | Two-pane: collapsible left rail (overlay) · full-bleed center chat | Horizontal tab bar · 2-column grid · detail as slide-over overlay | Stacked nav + content |
| **Mobile <768px** | Single-pane (preserved current structure: bottom space tabs 🔒/👨‍👩‍👧/💼, drawer menu) | Single-column list · horizontal tabs | Single column |

### Breakpoint rules
- **Navigation:** bottom tabs (mobile) → side rail (tablet/desktop). Drawer merges into the left rail on desktop.
- **Content density:** 1 col → 2 col → 3 col grids; chat max-width clamps so line length stays 45–75 characters.
- **Never:** stretch the phone layout wider; show all three panes below 1280px; collapse the 18+ gate or legal links at any size.
- **Safe areas:** respect notch/safe-area on mobile; desktop uses full viewport with sticky rails.
- **Trash (S-12):** table → stacked cards on tablet/mobile.
- **Marketing:** full-width sections, max-width 1200px container.

---

## 4. Bilingual behavior (AR RTL / EN LTR)

**Preserved asset:** compile-enforced translation parity (every `t()` key exists in both languages). Keep it; extend to web strings and ARIA labels.

### Mirroring rules
- **Full mirror:** layout direction, navigation rails (left rail ↔ right rail in AR), drawer slide direction, tab order progression, back/forward chevrons, progress steps, timelines, chat bubble tails, countdown chips.
- **Never mirror:** media (photos), code/UPC/barcode, numerals in prices (LTR isolates via `dir="ltr"`), brand logos, the vault keypad, map pins.
- **Mixed text:** user-generated Arabic inside English UI (and vice versa) uses `unicode-bidi: isolate` so punctuation doesn't jump.
- **Icons:** directional icons (arrows, send, reply, undo/redo) get RTL-flipped variants; non-directional icons (trash, plus, camera) stay.

### Per-component notes
- **Chat input:** send button at the inline-end side (right in EN, left in AR); voice-note button mirrors with it.
- **Toasts:** slide from the inline-end corner.
- **Tab bars:** first tab starts at inline-start.
- **Trash countdown:** number stays LTR-isolated. Numeral system ("٢٩ يوم" vs "29 days") follows locale — OPEN: Eastern vs Western Arabic numerals as per-user preference; default Western in EN, Eastern optional in AR.
- **Admin console:** English-only acceptable (internal tool), but the RTL toggle must not break it.
- **Dates/times:** `Intl.DateTimeFormat` with the active locale; never hand-format.

---

## 5. System states

### State matrix (per screen type)

| Screen type | Loading | Empty | Offline | Error | Recovery |
|---|---|---|---|---|---|
| Chat home | Message skeletons (shimmer; static if reduced motion) | Preserved good-onboarding prompt + suggestion chips | Queued-send banner; input stays usable | Per-message retry; toast on send failure | Undo toast on structural actions; double-approval modal |
| Lists (notes/things/tasks/shopping/agenda) | Card skeletons | Illustration + CTA per tab ("No things yet — add your first") | Cached read + "offline" badge; writes queued | Inline error row + retry | Trash restore; two-tap delete-forever |
| Detail (note/thing/vault item) | Skeleton | n/a | Cached copy with staleness note | Full-screen error + retry | Version/undo where applicable |
| Trash | Skeleton rows | Illustration + "deleted items stay 30 days" | List cached; restore queued | Row-level retry | Restore / restore-all; days-left countdown |
| Auth/onboarding | Button spinner | n/a | Blocking "you're offline" + retry | Inline field errors; expired-link resend | Magic-link re-issue |
| Billing | Skeleton tiers | n/a (always a tier) | Read-only cached tier; no plan changes | Portal load failure → retry + support link | Dunning: "payment failed — update card" + grace copy |
| Admin | Skeleton tables | "No rows" states | Admin requires online (explicit) | Per-action error toast | Ban/grant reversible with confirm |

### Global rules
- Every destructive action is two-step.
- Every queued offline write is visible and cancellable.
- **No dead buttons** — if a feature isn't live, it isn't shown (kill the dead "soon" subscription items).
- Error copy is human, bilingual, and always offers a next step.

---

## 6. Onboarding flow & account settings

### Onboarding: welcome → 18+ gate → auth → space setup → first memory

**Step 1 — Welcome (S-7a):** Value prop in the active language, prominent language switcher, "18+ only" badge (links Terms). CTA: Get started.

**Step 2 — 18+ eligibility gate (S-7b)** — decision #5, must enforce:
- Explicit confirmation: "I confirm I am 18 or older." No pre-checked box; no dark patterns.
- **Method is OPEN** (O-1): checkbox vs date-of-birth entry. Checkbox recommended (+ Terms acceptance) to minimize PII; DOB validates ≥18 years with clear error + retry if chosen. Flagged for legal review — no owner approval invented.
- Declining exits to a polite dead-end screen (not a loop).
- Logged as a consent event (ties to legal P0 item 5).

**Step 3 — Auth (S-7c):** Magic-link email (existing flow, responsive) OR "Try anonymously" (existing trial). Anonymous path shows the upgrade banner **with a working UI entry** (currently dead code) and explains trial limits.

**Step 4 — Space setup (S-7d):** Shows the three spaces (Private/Family/Work) with one-line descriptions; Family offers "create" or "join with invite code" (existing join-family); skippable — default lands in Private.

**Step 5 — First memory (S-7e):** Guided capture — "Tell me something to remember" with text/voice/photo options; on save, the assistant confirms extraction and shows where it landed (space + tab) with the "move to suggested space?" teaching moment (preserved pattern).

**Step 6 — Done → chat home.** Progress indicator throughout (steps 1–6), back navigation, resume-if-abandoned via local state.

### Account settings screens
- **Profile (S-14):** display name, avatar, language toggle (AR/EN persisted — preserved).
- **Email change (NEW):** current → new → verify via magic link to the NEW address → old address notified. Pending-verification badge state.
- **Sessions (NEW):** device/session list, "sign out all others."
- **Plan & billing (S-15):** tier card, usage meters vs quotas, Stripe portal, invoices, cancel flow with retention copy restating decision #2.
- **Privacy & data (S-16):** export download (existing fn), trash info (30-day, read-only display), deactivation (NEW: reversible, data retained, sessions revoked), delete account (existing cascade: two-step confirm, explicit consequence list; OPEN O-4: 30-day recovery window for full-account delete — legal review).
- **Notifications:** morning digest toggle, reminder channels, per-family-space mute.

---

## 7. Mobile reuse notes (web → iOS/Android)

- **Spec-first reuse:** this document is the source of truth for IA, copy, states, and a11y semantics; mobile implements the same screen inventory (S-1…S-18) with native navigation (stack + bottom tabs) instead of URL routes.
- **What transfers directly:** token tables map to the existing `P` palette + a new dark table; the component library maps 1:1 to React Native primitives (Button, ChatBubble, Toast already exist in `index.tsx` — refactor targets, not rewrites); bilingual parity and mirroring rules are platform-agnostic; the 18+ gate, trash, vault, and settings flows are identical logic.
- **Expo/RN notes:** keep Expo Router for deep-links (`/app/chat/:chatId` ↔ mobile route parity); `accessibilityRole` (missing today — the single biggest mobile a11y gap) added per the role table in doc 6; test with VoiceOver/TalkBack on the six screen-reader scripts; web three-pane becomes native master-detail (UISplitViewController / SlidingPaneLayout); offline queue-and-sync designed once in the engine (`@mawjood/voice-engine`), consumed by both.
- **What does NOT transfer:** CSS breakpoints (native uses size classes + orientation), hover states (use press states), the marketing site (mobile gets App Store/Play listings instead).
- **Guardrail:** no mobile redesign of the chat-first home without owner approval — it is the proven pillar.

---

## 8. Open design choices (no owner approval invented)

| ID | Choice | Recommendation | Needs |
|---|---|---|---|
| O-1 | 18+ gate: checkbox vs DOB | Checkbox + Terms acceptance (minimizes PII) | Legal review |
| O-2 | Eastern vs Western Arabic numerals in AR UI | Western in EN; Eastern optional in AR | Owner preference |
| O-3 | Vault offline behavior | Locked offline unless cached with explicit opt-in | Security review |
| O-4 | 30-day recovery for full-account delete | — | Legal review |
| O-5 | a11y CI tooling (axe vs pa11y) | — | Eng choice (target WCAG 2.2 AA fixed) |
| O-6 | Quota numerics (Free/Plus limits) | — | Billing workstream; owner approval |
| O-7 | Marketing-site IA and copy | — | Owner is the voice of the brand |

---

*End of doc 5 — planning only; no code changes authorized.*
