# D0.5 — Frontend Experience & Figma Specs

**Version:** 1.1 · **Date:** 2026-10-12 · **Branch:** `d05/ux-architecture-correction`
**Status:** Proposal-grade. Visual treatments follow the **accepted v1.2 baseline "Modern Minimal AI + Human Memories"** (owner, 2026-10-12) — monochrome-first tokens per `DESIGN_TOKENS_AND_COMPONENTS.md` v1.2. **Architecture corrected per owner Decision #12:** the existing chat-first structure (chat home, header + space-tabs row, drawer destinations) is PRESERVED — see `UX_ARCHITECTURE_CORRECTION.md` for the verified current-behavior inventory. **No implementation authorized.**
**Inputs:** `BRAND_STRATEGY_AND_POSITIONING.md` · `VISUAL_IDENTITY_DIRECTIONS.md` · `DESIGN_TOKENS_AND_COMPONENTS.md` · workstream 02 screen architecture (§6 of the brand workstream).

---

## PART 1 — Frontend experience blueprint

### 1. Screen hierarchy (visual weight)

1. **Chat home** — the default landing (current app: `view='chat'`). The conversation IS the home; chrome recedes. Assistant presence, suggestion chips, voice-first composer.
2. **Memory timeline** — the shelf. Editorial, browsable, photo-forward.
3. **Family space** — the kitchen board. Human-dense: faces, lists, tasks, borrow badges.
4. **Memory detail** — the keepsake. One memory, full attention, generous whitespace.
5. **Vault** — the locked drawer. Visually quieter, more serious, deliberately un-delightful.
6. **Settings/billing/admin** — the utility drawer. Clean, honest, minimal brand expression; trust through clarity.

### 2. Mobile-first and desktop experiences

- **Mobile (<768px):** single-pane, bottom space tabs (🔒/👨‍👩‍👧/💼 — preserved), thumb-reach primaries, 48px targets, full-width memory cards, bottom sheets (radius 20 top) for detail/compose. Emotional register: *intimate* — the phone is a keepsake box in the hand.
- **Tablet (768–1279px):** two-pane; memory timeline becomes 2-column shelf; detail opens as slide-over (250ms).
- **Desktop (≥1280px):** three-pane chat (280px rail / 760px chat / 320px context); space views 3-column shelf + right detail drawer; marketing full-width editorial. Emotional register: *the study* — a beautiful desk for your memories.

### 3. Navigation (visual)

- Active states: `accent-ink` text + 3px `accent` indicator bar on the inline-start edge (rail) or pill tint (bottom tabs) — never color-alone (label text always present).
- Pane transitions: 350ms slide in the inline direction (mirrored in RTL); cross-fade for detail drawers.
- The 18+ gate, legal links, and trash entry are never collapsed or hidden at any breakpoint.

### 4. Transitions & microinteractions (meaningful motion only)

- **Send message:** bubble grows from the input (150ms) — the thought leaves your hands.
- **Memory saved:** card animates onto the timeline/shelf (350ms) with the assistant's confirmation — *"placed where it belongs."*
- **Move-to-suggested-space:** the card visibly glides between space tabs — the teaching moment made physical.
- **Borrow "✅ رجع":** badge flips to returned with a quiet check — no confetti; it's a chore completed, not a jackpot.
- **Trash restore:** row slides back to its origin space — relief, visualized.
- **Reduced motion:** all become instant state changes.

### 5. Empty states (brand voice + illustration)

Pattern: subtle monochrome illustration (120px) → Display headline → one reassuring line → one CTA. Examples:
- New chat: *"This is where your memories begin."* / «هنا تبدأ ذكرياتك» + suggestion chips.
- Empty timeline tab: *"No things yet — add your first."* + capture CTA.
- Trash empty: *"Nothing here — deleted items stay 30 days."* — the copy itself is the trust feature.
- Family shopping empty: *"The list is clear. Enjoy it while it lasts."*

### 6. Onboarding emotional beats

1. **Welcome** — warmth. Serif headline, one-line promise ("A beautiful, trusted place for your personal and family memories"), language switcher prominent. *Feeling: "this was made for someone like me."*
2. **18+ gate** — matter-of-fact trust. Plain language, no playfulness, checkbox, Terms link. *Feeling: "they take this seriously."*
3. **Auth** — reassurance. Magic link in one line ("no passwords to remember — fitting, for a memory app"); anonymous trial framed honestly. *Feeling: safe to continue.*
4. **Space setup** — belonging. Three spaces as three rooms with one-line descriptions; family join/create. *Feeling: "there's a room for every part of my life."*
5. **First memory** — delight + competence. Guided capture (text/voice/photo); on save, the assistant confirms extraction and shows exactly where it landed, with the "move to suggested space?" teaching moment. *Feeling: "it understood me, and my memory has a home."*

### 7. Key emotional UX moments (designed, not accidental)

- **First memory saved:** shelf-placement animation + assistant confirmation card showing space + tab. The product's "aha" — a small ceremony, once, then quieter on repeats.
- **Family invite accepted:** new member's avatar joins the family header with a warm welcome card in chat; their first shared list item gets a subtle gold highlight.
- **Memory rediscovered:** "resurfaced" cards are the brand's signature delight — gold-accented, photo-forward, captioned like a gift ("A year ago today…"). Morning digest leads with one resurfaced memory before any tasks. *This is the moment the positioning becomes tangible.*
- **Quota limit reached (decision #2):** the modal's emotional job is reassurance, not upsell: headline "Your memories are safe" — existing memories are never deleted — then the upgrade path. Upsell second, trust first.
- **Trash restore (decision #6):** days-left countdown chip + restore animation; empty-trash confirmation states the exact irreversible consequence in plain words.
- **Vault unlock:** deliberate and quiet — no delight, no gold. Secrecy signaled by restraint.
- **Voice note transcribed:** waveform → text with a quiet "kept as text" note (audio deleted after transcription per policy) — the privacy policy made visible in one line.

---

## PART 2 — Figma-ready screen specifications

*How to build these in Figma: one page per screen; frames at 1440×900 (desktop), 768×1024 (tablet), 390×844 (mobile); auto-layout throughout; styles bound to the `DESIGN_TOKENS_AND_COMPONENTS.md` tables (publish as Figma variables: `light` + `dark` modes); components as variants with `light/dark` × `ltr/rtl` properties. Behavior, states, and a11y semantics come from the UX/screen-architecture spec (doc 6) — this part specifies layout, components, and visual treatment.*

### Screen 1 — Home (chat home) — CORRECTED per Decision #12 (matches current app)

**The home is the AI chat interface. It is NOT a dashboard.** Structure below is the verified current architecture (`UX_ARCHITECTURE_CORRECTION.md` §2), restyled with v1.2 tokens only.

**Mobile 390×844 — single pane (current structure, preserved):**
- **Safe area:** top/bottom insets respected (SafeAreaView).
- **Header (56–64px):** ☰ menu button (44px touch target) · "Mawjood" wordmark + tagline · trailing utility action. Hairline `border` below; `bg` surface.
- **Space-tabs row:** Home (chat) + 🔒 Private / 👨‍👩‍👧 Family / 💼 Work tabs; active tab = `surface-2` pill + `text-1`; inactive = `text-2`. (This is the existing tabs row — not a bottom tab bar.)
- **Conversation:** `role="log"` message list, full-bleed with 16px margins. User bubbles = `accent` (black light / white dark); assistant bubbles = `surface-1` + 1px `border`; AI highlights in `blue` sparingly. Date dividers Caption/`text-3`.
- **Composer (sticky bottom):** WhatsApp-style — camera inside the pill box, auto-growing input, mic button (recording state), send button = `accent` circle. Suggestion chips row above the composer when present.
- **Drawer (from ☰):** slides from inline-start, 320px, `surface-1`, elevation 3. Contents = the canonical inventory (`UX_ARCHITECTURE_CORRECTION.md` §2.2): profile header, Profile, Invite (managers), Families, Subscription (soon), Language, Theme, Voice reply, About, Export data, Delete account, **chat history + New chat**, Trash, Logout. Scrim `scrim` token. No destination may be added/removed/renamed without documented owner approval.

**Desktop/tablet ≥1024px — sidebar evolution of the SAME architecture:**
- The drawer becomes a **persistent refined sidebar (280px)**: profile header at top, the same destination list, chat history below — identical destinations, identical order of importance. Collapsible to icons on tablet.
- **Conversation area:** spacious, centered column max-width 760px on `bg`; composer aligned to the column. Optional assistant-context rail is FUTURE/optional — not baseline.
- No dashboard home, no card-grid landing, at any breakpoint.

**Light/dark:** v1.2 tokens (`DESIGN_TOKENS_AND_COMPONENTS.md` §1). Dark = near-black `bg`, charcoal surfaces, white primary buttons. Never re-tint user photos for theme.

**RTL:** sidebar/drawer on inline-start (right in Arabic); send button at inline-end; bubble tails mirror; tab order follows visual order.

### Screen 2 — Memory timeline (space view)

**Desktop:** left vertical tab rail 200px (`surface-1`: notes / things / custom tabs); content: 3-column card grid (gap 24), max-width 1200; date group headers (H2 + Caption count). Right detail drawer 400px on selection — slide-over.
**Tablet:** horizontal tab bar; 2-column grid.
**Mobile:** horizontal tab chips; single-column cards; search field sticky under header.

**MemoryCard component anatomy:** photo 16:10 (radius 12 inner) → 16px padding → H3 title → Caption meta (`text-3`: date · space) → footer row: space badge chip + borrow badge if applicable. Hover: elevation 1→2, 150ms. Variants: `with-photo` / `text-only` / `voice` (waveform strip) / `borrowed`.

**Empty tab:** EmptyState pattern (illustration 120px, Display H2, CTA button).
**Dark:** v1.2 tokens — cards `surface-1` (#141416), borders `border` (#2A2A2E); never re-tint user photos for theme.

### Screen 3 — Memory detail

**Layout (all breakpoints):** centered column, max-width 680. Hero: photo full-bleed within column (radius 14) or, for text/voice memories, a large Display title block on `surface-2`. Below: title (H1), meta row (Caption: date · space · tab), body (Body, 1.5/1.8 line-height), extracted entities as tappable chips (people, places), action bar (sticky bottom on mobile): Edit / Move / Share / Delete (delete = `danger` secondary, two-step).
**Relationships section:** "Related memories" — 2-col mini cards (the web of memory, visualized).
**Light/dark:** identical structure; v1.2 tokens throughout (dark surfaces `surface-1`/`surface-2`, link/chip accents in `blue` used sparingly).
**Emotional note:** this screen gets the most whitespace in the product — one memory, full attention.

### Screen 4 — AI assistant (chat + action surfaces)

**Assistant message anatomy:** avatar (40px circle, brand mark or warm `accent-soft` initial "م"/"M") → bubble (`surface-1`, `border`, radius 14, tail inline-start) → optional action-card slot (mini-card with real buttons: task confirm, tab proposal, borrow badge).
**"Thinking" state:** three-dot pulse in `text-3` (static under reduced motion) — no shimmer, no sparkle iconography (anti-AI-cliché rule).
**Suggestion chips:** pills with 1.5px `border`, Body-sm; hover `surface-2`.
**Vault ask ("اسأل خزنتك"):** same anatomy in the vault's quieter register — deeper surfaces, no gold, assistant avatar replaced by a small lock glyph; answers fade in 250ms (deliberate, not playful).
**Voice:** voice bubble → transcription appears as a quoted Body block with "kept as text" Caption (policy made visible).

### Screen 5 — Family space

**Desktop:** left members column 240px (avatar stack, role badges — manager gets `gold`-tinted badge, invite button) + content grid with horizontal family tab bar (members / shopping / tasks / agenda / things / notes / custom).
**Mobile:** family switcher (top: avatar + name + chevron) → tab chips → single-column lists.
**Shopping tab:** rows with 24px checkbox (`accent` check), item name Body, bought state = strikethrough + `text-3`; "bought" section collapses below.
**Tasks tab:** "name: task" rows — 32px assignee avatar + task Body + due chip; assignment animation: row slides in (250ms).
**Borrowing:** "مين أخذها؟" badge on thing cards + due-date chip; two-tap "✅ رجع" button (first tap arms: "Sure?", second confirms).
**Invite accepted moment:** welcome card in family chat + avatar join animation.
**Light/dark:** member presence uses `success` dot (never color-alone — name label adjacent); manager badge gold tint both modes.

---

*Visual treatments follow the accepted v1.2 baseline (monochrome-first; DESIGN_TOKENS v1.2). No implementation is authorized by this document.*
