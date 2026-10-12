# D0.5 — UX Architecture Correction: Chat-First Baseline Preserved

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d05/ux-architecture-correction` (against `main` @ `9e2e407`)
**Status:** ✅ **OWNER DECISION #12 (2026-10-12)** — binding correction to the D0.5 UX presentation layer.
**Scope:** Documentation/design only. No production application code changed.

---

## 1. Owner decision record — Decision #12 (2026-10-12 ~12:52 EDT)

> **Preserve Mawjood's existing application structure and interaction model.
> Modernize its visual styling, but do not replace its fundamental navigation architecture.**

Binding requirements:
1. The default home screen MUST remain the **AI Agent chat interface**, as it currently exists.
2. Preserve the existing **sidebar/drawer navigation concept** and its established destinations.
3. Memory management, family spaces, vault, settings, and other modules remain accessible **through navigation** — the chat homepage is NOT replaced with a dashboard.
4. Apply the approved **v1.2 Modern Minimal AI** visual language (white, near-black, neutral gray, restrained blue/sage).
5. Desktop/tablet: refined sidebar + spacious AI conversation area.
6. Mobile: chat-first with a **collapsible navigation drawer**, appropriate touch targets, safe-area support.
7. Preserve existing chat workflows, voice input, memory interactions, and user capabilities.
8. Do not invent, remove, or rename existing navigation destinations without documenting the change and receiving approval.
9. The D0.5 dashboard-style homepage mockups are **visual exploration only** — NOT authorization to replace the chat-first architecture.

## 2. Current behavior — verified from the repository (2026-10-12)

Source: `apps/mobile/src/app/index.tsx` (~6,034 lines, single-route Expo app), `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/screens/home/constants.ts`, `apps/mobile/src/lib/theme.ts`.

### 2.1 App shell
- **Single route** — Expo Router `Stack` with one screen (`src/app/index.tsx`); view switching is in-app state, not routes.
- **Default view is chat:** `const [view, setView] = useState<AppView>('chat')` (index.tsx:159). `AppView = 'chat' | SpaceType`.
- **Safe areas:** `SafeAreaView` with `edges={['top','bottom']}`.
- **Header:** ☰ hamburger (opens drawer) · app title "Mawjood" + tagline "Lost it? Mawjood." · demo toggle (🧪).
- **View tabs row** (directly under header): **Home (chat)** tab (`testID="tab-home"`) + one tab per space type — 🔒 Private / 👨‍👩‍👧 Family / 💼 Work (`SPACE_SHORT`, constants.ts:34).

### 2.2 Drawer (side menu) — established destinations (DO NOT rename/remove)
Opened via ☰; slides from inline-start (Animated `translateX`, 320px panel). Contents, in order:
1. **Profile header** — avatar initial, display name / email, trial vs permanent badge.
2. 👤 **Profile** (modal: identity, account info, display-name edit, secret-vault code entry).
3. ✉️ **Invite** (family managers only).
4. 👨‍👩‍👧 **Families** — multi-family switcher (shows current family title).
5. 💳 **Subscription** — marked "soon" (no billing yet, consistent with D0.5 commercial gating).
6. 🌐 **Language** — AR ⇄ EN toggle.
7. ☀️/🌙 **Theme** — light / dark / auto cycle.
8. 🔊 **Voice reply** — on/off toggle.
9. ℹ️ **About**.
10. 📥 **Export my data** (privacy).
11. 🗑️ **Delete account** (privacy, danger).
12. **Chat history section** (ChatGPT-style): **+ New chat** button, session list (title + retention TTL, delete per session, show-more pagination).
13. 🗑️ **Trash** (shown when retention > 0).
14. 🚪 **Logout** (signed-in, non-anonymous only).

### 2.3 Space views
- Tapping a space tab opens that space (`openSpace(type)`) with its own tab bar.
- Built-in space tabs: **notes / things / papers** + user-created **custom tabs** (free-tier cap 3/space, flag `custom_tabs`).
- Family space built-ins: **members / shopping / tasks / agenda / things / notes** (constants.ts:25 `FAMILY_BUILTIN_KEYS`).
- Shopping lists, tasks/agenda, borrows ("مين أخذها؟") live inside these space tabs.

### 2.4 Chat interface (the home)
- Message list (`FlatList`, auto-scroll to end), user/assistant bubbles, photo bubbles, action cards.
- **WhatsApp-style composer:** camera inside the composer box, auto-growing text input (36–120px), mic button (voice recording with waveform), send button.
- Assistant behaviors: extraction confirmations, "move to suggested space?" prompt, voice replies (TTS) when the input was voice, suggestion chips.
- **Vault:** the secret vault is reached discreetly via a code entered in the Profile modal (by design — its existence is not advertised in navigation).

### 2.5 Current styling (to be modernized — styling only)
`theme.ts` palette today: warm paper `#FAF7F2`, ink `#2B2118`, brand-orange accent `#B3541E`. v1.2 replaces these **values** (monochrome-first tokens, `DESIGN_TOKENS_AND_COMPONENTS.md` v1.2) — it does not change any structure above.

## 3. Comparison: current behavior vs D0.5 specifications

| Area | Current app (verified) | D0.5 spec text | D0.5 review mockups | Verdict |
|---|---|---|---|---|
| Default home | **Chat** (`view='chat'`) | ✅ Chat home S-9 "preserved pillar" (SCREEN_MAP §S-9, guardrail line 257) | ❌ **Dashboard** (hero + search + space cards + memory grid) | **Mockups diverged** — corrected by this PR |
| Primary navigation | Header ☰ + tabs row (Home + 3 spaces) | Mostly ✅ (mobile: "bottom space tabs + drawer") | ❌ Top nav rail + dashboard sections | Mockups corrected; spec mobile note aligned to actual tabs-row placement |
| Drawer destinations | 14 items (§2.2) | Partially enumerated | Not shown | **This doc is now the canonical inventory**; no renames/removals permitted (§1.8) |
| Desktop layout | Web renders the same single-pane app | ⚠️ Figma spec proposed 3-pane (rail + chat + context rail) | ❌ Dashboard grid | 3-pane is **re-scoped**: permitted evolution = drawer destinations as a persistent **sidebar** + spacious chat; the right context rail is OPTIONAL/future, not baseline |
| Space views | Tabs inside space (notes/things/papers, family built-ins, custom tabs) | ✅ S-10/S-11 space views | ✅ Timeline/detail/family screens shown | Aligned — retained in revised mockups |
| Vault access | Discreet code via Profile modal | ✅ "Ask your vault" | ⚠️ Shown as a nav button | Mockups corrected: vault stays discreet (Profile), per current behavior + opsec design |
| Visual styling | Warm palette (orange/paper) | v1.2 monochrome-first tokens | v1.2 tokens ✅ | Styling modernization proceeds on the preserved architecture |

## 4. What changes in this PR (traceability)

| # | Change | Files |
|---|---|---|
| C1 | This correction/baseline document (decision #12, inventory §2, comparison §3) | `docs/autonomous/d05/UX_ARCHITECTURE_CORRECTION.md` (new) |
| C2 | Figma spec Screen 1 rewritten: chat-first home matching §2 (mobile: header + tabs row + drawer; desktop: sidebar = drawer destinations + chat), v1.2 tokens (paper/serif/terracotta references removed) | `FRONTEND_EXPERIENCE_AND_FIGMA_SPECS.md` |
| C3 | Review package rebuilt chat-first: Chat home (desktop sidebar / mobile + drawer-open state), Space view, Memory detail, Family space, Brand sheet — v1.2 styling on the REAL architecture | `docs/autonomous/d05/review-package/index.html` |
| C4 | Screen map: pointer note — mockup divergence recorded; S-9 text already correct | `SCREEN_MAP_AND_UX_SPEC.md` |
| C5 | Decision #12 recorded | `IMPLEMENTATION_LEDGER.md`, `OPEN_DECISIONS_AND_OWNER_APPROVALS.md` (OD-41) |

**Explicitly NOT changed:** any application code; navigation destinations (none invented, removed, or renamed); the v1.2 token baseline; commercial decisions (still open); final logo artwork (still open).

## 5. Acceptance for any future implementation (D1+, separate authorization)
- Home lands on chat; ☰/sidebar exposes exactly the §2.2 destinations; space tabs row preserved.
- Visual restyle maps 1:1 onto v1.2 tokens; no structural replacement.
- Any destination change requires a documented proposal + owner approval first.
