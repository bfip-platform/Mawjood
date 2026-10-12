# D0.5 Workstream 08 — Brand Identity & Premium Frontend Design

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Scope:** Visual identity and frontend design specification for the commercial product. READ-ONLY on code; planning-only — no application code changes, no implementation authorized.
**Inputs:** `docs/autonomous/d0/D0_TO_D05_HANDOFF.md` (9 approved owner decisions), `docs/autonomous/d05/workstream-02-ux.md` (screen architecture — interface defined in §6), product name **Mawjood (موجود)** ("found it" angle; bilingual AR/EN from day one).
**Stance:** Proposal-grade. Every visual direction below is a **proposal awaiting owner approval** — no direction, palette, or typeface is chosen until the owner approves (§7).

**Emotional positioning (mandatory):** *"A beautiful, trusted place for your personal and family memories."*

---

## 1. Brand strategy & personality

### 1.1 Positioning

Mawjood is not a productivity app, not a chatbot, and not a dashboard. It is a **living archive** — the one beautiful place where a person's and a family's memories (stories, photos, voices, borrowed things, promises) are kept, found, and resurfaced. The brand promise has two halves that must always travel together:

1. **Beautiful** — craft, warmth, and delight in every surface. Opening the app should feel like opening a well-kept keepsake box, not a control panel.
2. **Trusted** — the user's memories are durable and never silently deleted (owner decisions #1, #2, #7), private by default (secret vault, decision #4), and recoverable (30-day trash, decision #6). Trust is expressed visually through calm, honest, legible design — never through dark patterns.

**Category contrast:** competitors and lookalikes in this space default to one of two visual clichés — the cold AI-assistant aesthetic (dark mode, neon/violet gradients, "AI-generated" glow) or the generic SaaS dashboard (blue accents, dense data grids). Mawjood's identity must read as **neither**. Warmth + editorial craft is the differentiator.

### 1.2 Audience

- Primary: adults 18+ (decision #5 — 18+ only at launch), bilingual Arabic/English speakers, many of them family coordinators (parents managing shopping, tasks, agendas, borrowed items).
- Secondary: extended family members invited into a family space (multi-generational; type must stay legible at larger sizes, touch targets generous).
- The brand must feel equally at home in Arabic and English — never "translated as an afterthought." Arabic is a first-class visual citizen, not a mirrored fallback.

### 1.3 Brand values (design-translated)

| Value | What it means visually |
|---|---|
| **Warmth** | Warm neutrals, human photography, rounded shapes, conversational microcopy |
| **Trust** | High legibility, honest states (nothing hidden), calm destructive-action patterns, visible-but-quiet security cues (vault) |
| **Memory-first** | Photos, voices, and stories get the biggest canvases; chrome recedes |
| **Craft** | Considered typography (real serif/sans pairings, not system-default), consistent spacing rhythm, polished microinteractions |
| **Bilingual dignity** | Arabic typography with proper line-heights and display faces — never squeezed Latin layouts |
| **Restraint** | Minimal without feeling empty: one accent, one idea per screen, generous whitespace |

### 1.4 Emotional direction

The product should evoke, in order: **calm → belonging → delight → confidence.**

- *Calm* on arrival (home/chat): nothing shouts; the assistant greets you like a thoughtful keeper of your things.
- *Belonging* in family spaces: avatars, shared lists, the feeling of a household bulletin board kept beautifully.
- *Delight* in rediscovery: a resurfaced memory ("on this day", morning digest) is a small gift — designed like one.
- *Confidence* in trust moments: trash restore, quota limits, vault unlock — every one says "your memories are safe here."

### 1.5 Visual personality (five adjectives, with teeth)

**Warm, editorial, assured, intimate, timeless.** Concretely: warm like paper and late-afternoon light (not "startup playful"); editorial like a well-designed magazine (hierarchy, serif headlines, captioned photos); assured like a bank vault's quieter cousin (no anxiety-inducing reds, no urgency); intimate like a family album (faces are large, names are prominent); timeless like something that will still look right in ten years (no trendy gradients, no meme iconography).

### 1.6 What the brand is NOT (guardrails)

- Not a generic SaaS dashboard (no dense data grids as the hero, no blue-on-white admin aesthetic in user surfaces).
- Not an "AI product" cliché (no violet/cyan gradients, no sparkle-bot iconography, no glowing orbs).
- Not childish or toy-like (18+ audience; warmth must read as mature).
- Not culturally flat: Arabic surfaces get genuine typographic attention (display faces, correct line-heights, Eastern/Western numeral policy per 02 O-2), and imagery includes Arab family life naturally — not as stock-photo tokenism.

---

## 2. Three visual identity directions

Each direction is a complete, internally consistent system: palette (hex), typography (Arabic + Latin), shapes, imagery, iconography, UI characteristics — plus honest pros/cons. **The recommendation at the end is a proposal; the owner chooses.**

---

### Direction A — "Warm Archive" (الأرشيف الدافئ)

*The keepsake box. Editorial, paper-and-ink, timeless.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Paper (light bg) | `#FAF6EE` | App background, light mode |
| Card | `#FFFFFF` | Cards, sheets |
| Paper-deep | `#F3EDE1` | Secondary surfaces, input fills |
| Ink (text-1) | `#211A13` | Primary text |
| Ink-soft (text-2) | `#5C5245` | Secondary text |
| Ink-faint (text-3) | `#75664F` | Tertiary/meta text (≥4.5:1 verified) |
| Line | `#E7DECF` | Borders, dividers |
| Accent (terracotta) | `#B4471F` | Primary buttons, key actions (white text: 5.44:1 ✓) |
| Accent-deep | `#8C3415` | Accent text on light (8.02:1 on white ✓), pressed states |
| Gold (decorative) | `#C9963C` | Sparingly: badges, milestones, "resurfaced memory" moments |
| Success | `#3E7C4F` | Confirmations (4.64:1 on paper ✓) |
| Danger | `#B3372C` | Destructive (5.57:1 on paper ✓) |

Dark mode: bg `#16120D` (deep warm charcoal), surface `#221B13`, card `#2A2117`, text-1 `#F4EDE1` (16.02:1 ✓), text-2 `#C4B7A3` (9.45:1 ✓), line `#3A2F22`, accent `#E07B4A` (6.30:1 on bg ✓ — used for both fills and text), gold `#D9A94F` (decorative).

**Typography:** Latin display **Fraunces** (OFL serif, characterful, editorial) · Latin UI/body **Inter** (OFL) · Arabic display **Noto Naskh Arabic** (OFL — calligraphic warmth for headlines) · Arabic UI/body **IBM Plex Sans Arabic** (OFL — clean, highly legible). All four are SIL Open Font License: free for commercial use, no licensing cost.

**Shapes:** generous radii — cards 14px, sheets 20px, buttons 12px; circular photo frames; the recurring motif is the **stack/shelf**: memory cards that feel placed, not rendered; timeline as a shelf with date "labels" like archive tabs.

**Imagery style:** real photography only, warm film-like grade (no heavy filters); memory photos presented like well-kept prints with soft shadows and captions; empty states use small warm illustrations (paper, boxes, shelves — never robots). Strictly no AI-generated people.

**Iconography:** 1.5px stroke, rounded line caps, slightly hand-warmed geometry (corners never razor-sharp). Space icons keep their existing emoji identity (🔒 👨‍👩‍👧 💼) as the product's familiar face, drawn icons everywhere else.

**UI characteristics:** editorial hierarchy — serif headlines, generous whitespace, captioned photos; chat assistant feels like a knowledgeable archivist: calm, precise, warm. Marketing site reads like a beautiful magazine feature.

**Pros:** most differentiated from SaaS/AI clichés; the memory/archive metaphor maps directly onto the product pillars (timeline = shelf, rediscovery = finding a keepsake); warmest and most human; photographs beautifully with real user photos; verified contrast pairs already computed.
**Cons:** highest art-direction risk — executed poorly it can feel "old" or print-bound rather than contemporary; Naskh display Arabic can read formal — needs confident layout to stay fresh; dark mode needs deliberate craft (warm darks, not inverted grays).

---

### Direction B — "Soft Sanctuary" (ملاذ هادئ)

*The calm room. Contemporary minimal, friendly, breathing space.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Mist (light bg) | `#F7F5F0` | App background |
| Card | `#FFFFFF` | Cards |
| Ink (text-1) | `#1C2420` | Primary text (deep green-slate) |
| Text-2 | `#55605A` | Secondary text |
| Line | `#E4E0D6` | Borders |
| Accent (sage) | `#4F7A63` | Primary actions (white text must verify ≥4.5:1 before use as fill) |
| Accent-soft | `#DCE9DF` | Tinted surfaces, selected states |
| Warmth (peach) | `#D99A68` | Secondary accents, highlights — decorative + large elements |
| Success | `#3E7C4F` | · Danger `#B3372C` |

Dark mode: bg `#121815`, surface `#1B241F`, text-1 `#EEF2EC`, accent-light `#9DBFA9`.

**Typography:** **Rubik** (OFL) for *everything* — one family with native Arabic + Latin coverage, so bilingual consistency is automatic and pairing risk is zero. Display weights (600–700) for headlines, 400/500 for UI. Fallback: Tajawal + Sora if Rubik's Arabic color feels too geometric in display sizes.

**Shapes:** softest of the three — pills and 16–24px radii, fully rounded avatars and chips, gentle 0/1/2 elevation (soft shadows, never harsh).

**Imagery style:** gentle duotone illustrations for empty states and onboarding (abstract home/family shapes, sunrise motifs); photos in soft, deeply rounded frames; no harsh crops.

**Iconography:** rounded filled/line hybrid icons, friendly proportions, slightly larger optical sizes.

**UI characteristics:** the calmest chat-first experience; whitespace does the emotional work; family spaces feel like a sunny kitchen noticeboard. Safest, most "app-like" of the three.

**Pros:** friendliest and most approachable; single type family eliminates bilingual pairing risk and licensing questions; lowest execution risk — hard to make look bad; excellent for the chat-first home (calm assistant, breathing room).
**Cons:** the most crowded aesthetic territory — sage/peach calm-minimal is adjacent to wellness/meditation apps and risks feeling generic ("another calm app"); least memorable of the three; differentiation from competitors relies almost entirely on copy and photography rather than the system itself.

---

### Direction C — "Bold Contrast" (تباين جريء)

*The confident statement. Dark-forward, geometric, app-store standout.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Ink-night (dark-first bg) | `#10151C` | Primary app background (dark is the signature) |
| Surface | `#182030` | Cards on dark |
| Paper (light mode bg) | `#F5F2EA` | Light mode background |
| Text on dark | `#F2EFE6` | Primary text, dark mode |
| Accent (amber) | `#E8A33D` | Primary actions, brand moments (verify ≥4.5:1 per usage; decorative at large sizes) |
| Signal (coral) | `#E15E4E` | Alerts, borrow due-dates, destructive (large/bold usage; text usage needs dark variant) |
| Line on dark | `#2A3444` | Borders, dark mode |

**Typography:** Latin **Space Grotesk** (OFL, geometric, confident) · Arabic **Readex Pro** (OFL, contemporary, pairs well with geometric Latins). Strong, modern, slightly technical voice.

**Shapes:** geometric — 6–8px radii, 1px hairline borders, grid-forward layouts, sharp section dividers. The motif is the **frame**: everything crisply contained.

**Imagery style:** high-contrast photo collages, bold crops, duotone treatments in amber/ink for marketing; in-app photos full-bleed with scrims.

**Iconography:** 2px geometric stroke icons, precise, engineered feel.

**UI characteristics:** night-mode-first identity; confident and striking; the vault feels like a high-security instrument; marketing is bold and poster-like.

**Pros:** strongest shelf-appeal in app stores; dark-mode lovers get a signature experience; most "designed" feeling — reads as premium-tech.
**Cons:** fights the brief's core adjectives — closest to the "AI product" cliché the positioning explicitly rejects (dark + amber is AI-brand territory); risks feeling cold and impersonal, which undermines "warm, human" and family belonging; amber/coral text usage needs careful per-mode tuning for AA; light mode feels like an afterthought unless both are designed with equal weight.

---

### ★ RECOMMENDED direction (PROPOSAL — awaiting owner approval)

**Direction A — "Warm Archive."**

**Rationale:**
1. **It is the only direction that satisfies the whole brief at once.** "Warm, human, memorable" *and* "not a generic SaaS dashboard, template, or AI-generated interface" — B risks generic-calm, C risks AI-cliché. A is the differentiated one.
2. **The metaphor is the product.** An archive is where memories are *kept, found, and resurfaced* — the shelf/timeline, the keepsake-card, the "memory resurfaced" gift moment all fall out of the identity naturally instead of being decorated on afterward.
3. **Trust reads as craft.** For a product asking users to entrust it with family memories (and a secret vault), the editorial, paper-and-ink register signals care and permanence — "this place will still be here in ten years" — better than tech-gloss.
4. **Bilingual dignity.** A display serif + Naskh pairing gives Arabic headline typography genuine presence rather than mirrored-Latin leftovers, which directly serves the "sophisticated Arabic + English typography" principle.
5. **Practical:** all four typefaces are OFL (zero licensing cost, §7 licensing question becomes trivially answerable), and the key contrast pairs are already verified ≥4.5:1 in both modes (see tables above).

**Honest caveats (built into the proposal):** A needs the most disciplined art direction — the line between "timeless editorial" and "dated print" is execution. Mitigations proposed: (a) reserve serif/Naskh for display headlines only; all UI body text stays in clean sans (Inter / IBM Plex Sans Arabic) for app-like readability; (b) borrow B's calm spacing and soft elevation for in-app surfaces so the chat home feels contemporary, not antiquarian; (c) gold is rationed to milestone moments (resurfaced memories, anniversaries) so it never becomes decoration.

**Fallback:** if the owner prefers a safer contemporary feel, Direction B is the recommended fallback — lowest risk, friendliest, single-family bilingual simplicity.

> **Status: PROPOSAL.** No visual direction is chosen. The owner approves the direction before any palette finalization, typeface commitment, or implementation (§7).

---

## 3. Design tokens & component system

*All token values below are specified for the recommended Direction A ("Warm Archive"). If the owner selects B or C, this section is re-issued with that direction's tables. Workstream 02 (§6, §9) defines the token strategy (semantic roles, no hard-coded hex, CI contrast verification); this section supplies the concrete values and visual rules — the interface is detailed in §6.*

### 3.1 Semantic color tokens (light / dark pairs)

| Role | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FAF6EE` | `#16120D` | App background |
| `surface-1` | `#FFFFFF` | `#221B13` | Cards, sheets |
| `surface-2` | `#F3EDE1` | `#2A2117` | Input fills, secondary surfaces |
| `border` | `#E7DECF` | `#3A2F22` | Dividers, card outlines |
| `text-1` | `#211A13` | `#F4EDE1` | 15.94:1 / 16.02:1 ✓ |
| `text-2` | `#5C5245` | `#C4B7A3` | 7.09:1 / 9.45:1 ✓ |
| `text-3` | `#75664F` | `#A89A83` | Meta/captions — 5.17:1 light ✓ (dark value to be verified in CI) |
| `accent` | `#B4471F` | `#E07B4A` | Primary actions; white text on light = 5.44:1 ✓ |
| `accent-ink` | `#8C3415` | `#E07B4A` | Accent-colored *text* on light/dark |
| `accent-pressed` | `#8C3415` | `#C96A38` | Pressed state of accent fills |
| `gold` | `#C9963C` | `#D9A94F` | Decorative/milestone only — never for text <18pt |
| `success` | `#3E7C4F` | `#7CBF8A` | 4.64:1 light ✓ |
| `warning` | `#A96A12` | `#D9A44A` | Amber-brown; verify dark in CI |
| `danger` | `#B3372C` | `#E07B5A` | 5.57:1 light ✓ |
| `focus-ring` | `#8C3415` | `#E07B4A` | 2px outline; 3:1 against adjacent per 02 §5 |
| `scrim` | `rgba(33,26,19,.45)` | `rgba(10,8,5,.55)` | Photo caption legibility |

**Rules:** no hard-coded hex in components (lint-enforced, per 02 §6); every text/background pair ≥4.5:1 verified in CI (axe/pa11y on key screens); danger/success/warning re-tuned per mode (lighter variants on dark, never the same hex); theme = system default + explicit user override, persisted like the language toggle.

### 3.2 Typography scale (Arabic + Latin)

**Principles:** Arabic script carries diacritics and taller glyph anatomy — Arabic text sizes get **+1.1× line-height** vs the Latin value at the same step, and Arabic display uses Naskh (calligraphic) while Arabic UI uses Plex Sans Arabic (neutral). Line length 45–75ch; never set Arabic in a Latin display face.

| Step | Latin | Arabic | Size / Weight | Line-height (Lat / Ar) | Usage |
|---|---|---|---|---|---|
| Display | Fraunces 600 | Noto Naskh Arabic 600 | 40 / 32 | 1.15 / 1.6 | Marketing hero, empty-state titles |
| H1 | Fraunces 600 | Noto Naskh Arabic 600 | 32 / 28 | 1.2 / 1.65 | Screen titles |
| H2 | Fraunces 600 | Noto Naskh Arabic 600 | 24 / 22 | 1.25 / 1.7 | Section headers, card titles |
| H3 | Inter 600 | IBM Plex Sans Arabic 600 | 20 / 20 | 1.3 / 1.75 | Subsections |
| Body | Inter 400 | IBM Plex Sans Arabic 400 | 16 / 17 | 1.5 / 1.8 | Default text (Arabic runs 1pt larger for optical parity) |
| Body-sm | Inter 400 | IBM Plex Sans Arabic 400 | 14 / 15 | 1.5 / 1.8 | Secondary text, list rows |
| Caption | Inter 500 | IBM Plex Sans Arabic 500 | 12 / 13 | 1.4 / 1.7 | Meta, timestamps, labels (12pt min — never smaller) |
| Button | Inter 600 | IBM Plex Sans Arabic 600 | 16 / 17 | 1.25 / 1.6 | Button labels |

**Rules:** display faces (Fraunces/Naskh) for headlines and emotional moments only — never for body, buttons, or form labels; numerals in prices/countdowns stay LTR-isolated (`dir="ltr"`, per 02 §4); Eastern vs Western Arabic numerals per user preference (02 O-2); tabular numerals for countdowns/timers.

### 3.3 Spacing, radii, elevation

- **Spacing:** 4px base — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Component internal padding in 8/12/16; section gaps 24/32; screen margins 16 (mobile) / 24 (tablet) / 32+ (desktop, within max-width containers).
- **Radii:** buttons/inputs `12` · cards `14` · sheets/modals `20` (top) · chips/pills/avatars `full` · photo frames `12` (memory cards) / `full` (avatars).
- **Elevation (per mode):** light — `0` flat surfaces, `1` cards (`0 1px 2px rgba(33,26,19,.06)`), `2` raised (`0 4px 16px rgba(33,26,19,.08)`), `3` overlays (`0 12px 32px rgba(33,26,19,.14)`); dark — same geometry with warm-tinted shadows (`rgba(0,0,0,.35/.45/.55)`) plus 1px `border` hairlines (dark elevation reads through borders, not heavier black).
- **Motion:** 150ms micro (press, toggle) / 250ms overlay (sheet, drawer, toast) / 350ms page & large transitions; `ease-out` default, `ease-in-out` for reversible pairs; **meaningful only** — motion marks placement (a memory landing on the shelf), acknowledgement (send), or orientation (pane transitions). `prefers-reduced-motion` → instant, no shimmer (per 02 §5).

### 3.4 RTL behavior rules (visual layer; structural mirroring owned by 02 §4)

- Full visual mirror of directional chrome: rails, drawers, tab order, chevrons, progress steps, timelines, bubble tails, toast origins.
- **Never mirror:** photos, the vault keypad, brand mark, numerals-in-prices, barcodes.
- Arabic headlines may use Naskh at display sizes; Latin headlines never substitute for Arabic (no "Arabic text in Fraunces" fallback — if Naskh fails to load, fall back to Plex Sans Arabic, not a Latin serif).
- Mixed-direction strings (Arabic name inside English sentence) wrapped in `unicode-bidi: isolate`.
- The terracotta accent is direction-agnostic; gold milestone treatments identical in both directions.

### 3.5 Reusable component visual standards

*(Workstream 02 §9 owns the component inventory, behavior, and a11y semantics. This section owns how they look. Names match 02's library.)*

- **Button:** height 48 (min 44 touch), radius 12, 16/600 label. Primary = `accent` fill, white text; hover = slight darken + 1px elevation; pressed = `accent-pressed`; disabled = `surface-2` fill + `text-3`; loading = spinner replacing label (width preserved); focus = 2px `focus-ring` outline offset 2px. Secondary = transparent fill, 1.5px `accent-ink` border, `accent-ink` text. Danger = `danger` fill / secondary-danger outline variant. Ghost = text-only `accent-ink`.
- **IconButton:** 44×44, radius full, hover = `surface-2` wash, pressed = `border` wash; icon 20px, `text-2`, 1.5px rounded stroke.
- **TextField:** label (Caption/500) above; field height 48, radius 12, `surface-2` fill, 1px `border`; focus = 2px `accent` border + soft accent wash; error = `danger` border + error text (Body-sm, `danger`) linked via `aria-describedby`; Arabic placeholder in Plex Sans Arabic.
- **Card (base):** `surface-1`, radius 14, 1px `border`, elevation 1; hover (desktop) elevation 2 + 150ms lift; pressed scale .99.
- **Memory card:** photo 16:10 top (radius 12 inner), title H3, meta Caption/`text-3` (date · space), space badge chip (tinted `accent-soft` with `accent-ink` text); borrowed items carry the "مين أخذها؟" badge (warm `warning` tint, due date, per 02 S-11).
- **Timeline item:** date rail (inline-start side, Caption/`text-3`, tabular numerals, "archive tab" styling) + memory card; connector 1px `border`; today marker = `gold` dot + "Today/اليوم" label.
- **ChatBubble:** user = `accent` fill, white Body text, tail on inline-end; assistant = `surface-1` fill, 1px `border`, `text-1` text, tail on inline-start; voice bubble = waveform bars in `text-2` + duration chip + play button (44px); photo bubble = photo (radius 12) + caption; action cards inside assistant bubbles = mini-cards with real buttons (per 02 §5).
- **ChatInput:** pill container (radius full on mobile, 16 on desktop), `surface-1` + 1px `border`, elevation 2; send button 44px circle `accent` at inline-end; voice/photo buttons mirror with it (02 §4); focus = `accent` border.
- **EmptyState:** centered, max-width 320; small warm illustration (paper/shelf motif, 120px); H2 title (serif/Naskh); Body/`text-2` description; primary Button CTA. Never a dead end — always one action.
- **Toast:** `ink` fill (light) / `surface-2` (dark), paper text, radius 12, elevation 3, slides from inline-end; undo action in `gold`/accent-ink.
- **CountdownChip (trash):** pill, `warning`-tinted fill (`#F6E7C8` light), `text-1` text with tabular LTR-isolated number — "29 days left" is text, never color-alone (02 §5). Urgent (<7 days) adds `danger-ink` text, not just redder fill.
- **Keypad (vault):** calm and deliberate — large 72px circular keys, `surface-2` fill, H2 numerals; wrong-code = gentle shake (disabled under reduced motion) + assertive-live message; the vault's visual register is quieter than the rest of the app (deeper surfaces, no gold, no delight flourishes — secrecy feels serious).
- **Avatar:** initials on `accent-soft` tint (or member photo); family member avatars slightly larger (48px) with presence ring for managers.

---

## 4. Frontend experience blueprint

*Workstream 02 owns IA, routes (S-1–S-18), breakpoints, and per-screen states. This section owns the emotional and visual experience layered on top.*

### 4.1 Screen hierarchy (visual weight)

1. **Chat home (02 S-9)** — the hearth. Warmest surface, assistant presence, suggestion chips like handwritten prompts. Chrome recedes; the conversation is the room.
2. **Memory timeline (02 S-10)** — the shelf. Editorial, browsable, photo-forward.
3. **Family space (02 S-11)** — the kitchen board. Human-dense: faces, lists, tasks, borrow badges.
4. **Memory detail** — the keepsake. One memory, full attention, generous whitespace.
5. **Vault (02 S-13)** — the locked drawer. Visually quieter, more serious, deliberately un-delightful.
6. **Settings/billing/admin** — the utility drawer. Clean, honest, minimal brand expression; trust through clarity.

### 4.2 Mobile-first and desktop experiences

- **Mobile (<768px):** single-pane, bottom space tabs (🔒/👨‍👩‍👧/💼 — preserved), thumb-reach primaries, 48px targets, full-width memory cards, bottom sheets (radius 20 top) for detail/compose. The emotional register is *intimate* — the phone is a keepsake box in the hand.
- **Tablet (768–1279px):** two-pane; memory timeline becomes 2-column shelf; detail opens as slide-over (visual: paper sliding over paper, 250ms).
- **Desktop (≥1280px):** three-pane chat (02 §3: 280px rail / 760px chat / 320px context); space views 3-column shelf + right detail drawer; marketing full-width editorial. The emotional register is *the study* — a beautiful desk for your memories.

### 4.3 Navigation patterns (visual)

- Active states: `accent-ink` text + 3px `accent` indicator bar on the inline-start edge (rail) or pill tint (bottom tabs) — never color-alone (label text always present).
- Pane transitions: 350ms slide in the inline direction (mirrored in RTL); cross-fade for detail drawers.
- The 18+ gate, legal links, and trash entry are never collapsed or hidden at any breakpoint (02 §3).

### 4.4 Transitions & microinteractions (meaningful motion only)

- **Send message:** bubble grows from the input (150ms) — the thought leaves your hands.
- **Memory saved:** card animates onto the timeline/shelf (350ms) with the assistant's confirmation — *"placed where it belongs."*
- **Move-to-suggested-space:** the card visibly glides between space tabs — the teaching moment (02 §11.7) made physical.
- **Borrow "✅ رجع":** badge flips to returned with a quiet check — no confetti; it's a chore completed, not a jackpot.
- **Trash restore:** row slides back to its origin space — relief, visualized.
- **Reduced motion:** all of the above become instant state changes (02 §5).

### 4.5 Empty states (brand voice + illustration)

Every empty state follows: warm illustration (paper/shelf motif) → serif headline → one reassuring line → one CTA. Examples:
- New chat: *"This is where your memories begin."* / «هنا تبدأ ذكرياتك» + suggestion chips.
- Empty timeline tab: *"No things yet — add your first."* (02 §8) + photo/text/voice capture CTA.
- Trash empty: *"Nothing here — deleted items stay 30 days."* (02 S-12) — the copy itself is the trust feature.
- Family shopping empty: *"The list is clear. Enjoy it while it lasts."*

### 4.6 Onboarding emotional beats (02 S-7 flow, emotional layer)

1. **Welcome** — warmth. Serif headline, one-line promise ("A beautiful, trusted place for your personal and family memories"), language switcher prominent. *Feeling: "this was made for someone like me."*
2. **18+ gate** — matter-of-fact trust. Plain language, no playfulness, checkbox (02 O-1 recommendation), Terms link. *Feeling: "they take this seriously."*
3. **Auth** — reassurance. Magic link explained in one line ("no passwords to remember — fitting, for a memory app"); anonymous trial framed honestly with limits. *Feeling: safe to continue.*
4. **Space setup** — belonging. Three spaces as three rooms with one-line descriptions; family join/create. *Feeling: "there's a room for every part of my life."*
5. **First memory** — delight + competence. Guided capture (text/voice/photo); on save, the assistant confirms extraction and shows exactly where it landed, with the "move to suggested space?" teaching moment. *Feeling: "it understood me, and my memory has a home."*

### 4.7 Key emotional UX moments (designed, not accidental)

- **First memory saved:** the shelf-placement animation (§4.4) + assistant confirmation card showing space + tab. This is the product's "aha" — designed like a small ceremony, once, then quieter on repeats.
- **Family invite accepted:** the new member's avatar joins the family header with a warm welcome card in the chat ("X joined the family space 🎉" — emoji restrained, one max); their first shared list item gets a subtle gold highlight.
- **Memory rediscovered:** "resurfaced" cards are the brand's signature delight — gold-accented, photo-forward, captioned like a gift ("A year ago today…"). Morning digest (02 §7 notifications) leads with one resurfaced memory before any tasks. *This is the moment the positioning becomes tangible.*
- **Quota limit reached (decision #2):** the modal's emotional job is reassurance, not upsell: headline "Your memories are safe" — existing memories are never deleted — then the upgrade path. Upsell second, trust first.
- **Trash restore (decision #6):** the days-left countdown chip (§3.5) + restore animation (§4.4); the empty-trash confirmation states the exact irreversible consequence in plain words (02 S-12).
- **Vault unlock:** deliberate and quiet — no delight, no gold. Secrecy is signaled by restraint: deeper surfaces, slower-feeling (but not actually slower) interaction, immediate content.
- **Voice note transcribed:** waveform → text with a quiet "kept as text" note (audio deleted after transcription per policy, 02 §11.7) — the privacy policy made visible in one line.

---

## 5. Figma-ready screen specifications

*How to build these in Figma: one page per screen; frames at 1440×900 (desktop), 768×1024 (tablet), 390×844 (mobile); auto-layout throughout; styles bound to the §3 token tables (publish as Figma variables: `light` + `dark` modes); components as variants with `light/dark` × `ltr/rtl` properties. Spacing values reference §3.3. Behavior, states, and a11y semantics come from workstream 02 (cited per screen) — this section specifies layout, components, and visual treatment.*

### 5.1 Home screen — chat home (02 S-9)

**Desktop 1440×900 — three panes:**
- **Left rail 280px:** `surface-1`, right hairline `border`. Top: brand mark + space switcher (🔒 Private / 👨‍👩‍👧 Family / 💼 Work as segmented rows, active = `accent-soft` tint + 3px inline-start `accent` bar). Below: "Conversations" list (rows: 16px avatar/icon, Body-sm title, Caption timestamp; active row `surface-2`). Bottom: user avatar + plan badge.
- **Center 760px max, centered:** conversation `role="log"`. Date dividers (Caption, centered, `text-3`). Bubbles per §3.5 (max-width 65ch). Suggestion chips row above input (pills, `surface-2`, Body-sm). ChatInput (§3.5) sticky bottom, 16px margins.
- **Right rail 320px:** "Assistant context" — extracted items preview cards (mini memory cards), suggestion list, space tabs. Collapsible; hidden <1280px.
- **Background:** `bg` paper; subtle top area wash of `surface-1` behind the chat column on very wide screens (the "desk" feeling).

**Mobile 390×844 — single pane:** top bar (menu, space title in serif H3, actions); messages full-bleed with 16px margins; bottom: ChatInput pill + space tab bar (bottom tabs, 64px height, active pill tint). Drawer (02 §5 dialog semantics) slides from inline-start.

**Light/dark:** dark mode keeps the paper metaphor as warm charcoal (`#16120D`); assistant bubbles `#221B13`; user bubbles `#E07B4A` with `#16120D` text (6.30:1 ✓).

**RTL:** rails swap sides; send button moves to inline-end (left in AR); bubble tails mirror; drawer slides from the right in AR.

### 5.2 Memory timeline (02 S-10 — space view)

**Desktop:** left vertical tab rail (notes / things / custom tabs — 200px, `surface-1`); content: 3-column card grid (gap 24), max-width 1200; date "archive tab" group headers (H2 serif + Caption count). Right detail drawer (400px) on selection — paper-over-paper slide.
**Tablet:** horizontal tab bar; 2-column grid.
**Mobile:** horizontal tab chips; single-column cards; search field sticky under header.

**Memory card anatomy (Figma component `MemoryCard`):** photo 16:10 (radius 12) → 16px padding → H3 title → Caption meta (`text-3`: date · space) → footer row: space badge chip + borrow badge if applicable. Hover: elevation 1→2, 150ms. Variants: `with-photo` / `text-only` / `voice` (waveform strip) / `borrowed`.

**Empty tab:** `EmptyState` per §4.5 (illustration 120px, serif H2, CTA button).
**Dark:** cards `#221B13`, borders `#3A2F22`; photos get no grade change (never re-tint user photos for theme).

### 5.3 Memory detail

**Layout (all breakpoints):** centered column, max-width 680. Hero: photo full-bleed within column (radius 14) or, for text/voice memories, a large serif title block on `surface-2`. Below: title (H1 serif/Naskh), meta row (Caption: date · space · tab), body (Body, 1.5/1.8 line-height), extracted entities as chips (people, places — tappable), action bar (sticky bottom on mobile): Edit / Move / Share / Delete (delete = `danger` secondary, two-step per 02 §8).
**Relationships section:** "Related memories" — 2-col mini cards (the web of memory, visualized).
**Light/dark:** identical structure; dark uses `#221B13` surfaces and `#E07B4A` link/chip accents.
**Emotional note:** this screen gets the most whitespace in the product — one memory, full attention (§4.1).

### 5.4 AI assistant (chat + action surfaces; 02 S-9 bubbles, S-13 "اسأل خزنتك")

**Assistant message anatomy:** avatar (40px circle, brand mark or warm `accent-soft` initial "م"/"M") → bubble (`surface-1`, `border`, radius 14, tail inline-start) → optional action-card slot (mini-card with real buttons: task confirm, tab proposal, borrow badge — per 02 §5 these are true `<button>`s).
**"Thinking" state:** three-dot pulse in `text-3` (static under reduced motion) — no shimmer, no sparkle iconography (anti-AI-cliché rule, §1.6).
**Suggestion chips:** pills with 1.5px `border`, Body-sm; hover `surface-2`.
**Vault ask ("اسأل خزنتك"):** same anatomy in the vault's quieter register — deeper surfaces (`#1B140E` light / `#100C08` dark), no gold, assistant avatar replaced by a small lock glyph; answers appear with a 250ms fade (deliberate, not playful).
**Voice:** voice bubble (§3.5) → transcription appears as a quoted Body block with "kept as text" Caption (policy made visible, §4.7).

### 5.5 Family space (02 S-11)

**Desktop:** left members column (240px: avatar stack, role badges — manager gets `gold`-tinted badge, invite button) + content grid with horizontal family tab bar (members / shopping / tasks / agenda / things / notes / custom).
**Mobile:** family switcher (top, avatar + name + chevron) → tab chips → single-column lists.
**Shopping tab:** rows with checkbox (24px, `accent` check), item name Body, bought state = strikethrough + `text-3`; "bought" section collapses below.
**Tasks tab:** "name: task" rows — assignee avatar 32px + task Body + due chip; assignment animation: row slides in (250ms).
**Borrowing:** "مين أخذها؟" badge (§3.5) on thing cards + due-date chip; two-tap "✅ رجع" button (first tap arms: "Sure?", second confirms — per 02 §11.8).
**Invite accepted moment:** welcome card in family chat + avatar join animation (§4.7).
**Light/dark:** member presence uses `success` dot (never color-alone — name label adjacent); manager badge gold tint both modes.

---

## 6. Interface with workstream 02 (screen architecture)

*This section states the interface explicitly, as required. Workstream 02 owns screen architecture; workstream 08 owns visual identity. Neither duplicates the other.*

### 6.1 Ownership matrix

| Area | Owner | Notes |
|---|---|---|
| Sitemap, routes, deep-links (S-1–S-18) | **02** | 08 styles every screen but changes no IA |
| Responsive breakpoints & pane structures (≥1280 / 768–1279 / <768) | **02** | 08 specifies visual treatment within each (§5) |
| Bilingual structural mirroring rules | **02** (§4) | 08 owns visual RTL rules: typeface fallbacks, numeral policy visuals (§3.4) |
| WCAG 2.2 AA semantics: roles, focus, keyboard, ARIA, screen-reader scripts | **02** (§5) | 08 supplies contrast-verified token values + visible focus-ring design (§3.1, §3.5) |
| Light/dark **strategy** (semantic tokens, no hard-coded hex, CI checks) | **02** (§6) | 08 supplies the concrete light/dark **hex tables** (§3.1) |
| Onboarding flow steps & account lifecycle logic | **02** (§7) | 08 owns the emotional beats + visual design of each step (§4.6) |
| System-state matrix (loading/empty/offline/error/recovery per screen) | **02** (§8) | 08 owns empty-state illustration style + brand voice copy (§4.5) |
| Component **inventory, behavior, a11y** (18 components) | **02** (§9) | 08 owns component **visual standards** — anatomy, color, type, spacing, states (§3.5) |
| Token **roles & type scale structure** | **02** (§9) | 08 owns token **values**, Arabic line-height adjustments, radii, elevation, motion (§3) |
| Motion **policy** (reduced-motion, durations) | **02** (§5, §9) | 08 owns motion **meaning**: which moments animate and why (§4.4) |
| Marketing-site IA & copy | **02** (O-7) | 08 owns marketing visual language (editorial, §2 direction A) |
| Open choices O-1…O-7 (18+ method, numerals, vault offline, delete recovery, a11y tooling, quotas, marketing copy) | **02** flags | 08 consumes the outcomes; O-2 (numerals) and O-7 (marketing voice) have visual impact — 08 will re-issue affected specs when decided |

### 6.2 Handoff points (02 → 08 → build)

1. **02 delivers:** finalized screen inventory + responsive structures + state matrix + component behavior specs.
2. **08 delivers (this doc):** brand strategy, chosen direction's token values, type scale, component visuals, emotional blueprint, Figma-ready specs.
3. **Joint checkpoint:** Figma variables (`light`/`dark` modes) generated from §3.1; component variants (`light/dark` × `ltr/rtl`) per §3.5; contrast audit re-run in CI per 02 §6 before any build.
4. **Open-choice watch:** when 02's O-1 (18+ method), O-2 (numerals), O-3 (vault offline), O-4 (delete recovery) are decided, 08 updates §§4.6, 3.4, 5.4, 4.7 respectively — flagged here so nothing is silently dropped.

### 6.3 Conflict rule

If a visual choice in this doc ever conflicts with 02's architecture or a11y requirements (e.g., a decorative treatment that harms contrast or focus visibility), **02's a11y/architecture requirement wins** and 08 re-specs the visual. Accessibility and structure are constraints; identity is expressed within them.

---

## 7. Brand approval gate

### 7.1 Explicit statement

**Owner approval is required before:** (a) choosing the final visual direction, (b) finalizing the palette, (c) committing to typefaces, (d) designing the brand mark/logo, (e) locking motion principles, or (f) implementing any frontend work from this specification. This document is planning-only. **No owner approval is claimed or implied for any choice in it** — the §2 recommendation is a proposal, and Direction A is not selected until the owner says so.

### 7.2 Exactly what needs approval

| # | Item | Options / proposal on the table |
|---|---|---|
| 1 | **Final visual direction** | A "Warm Archive" (recommended, §2) · B "Soft Sanctuary" (fallback) · C "Bold Contrast" |
| 2 | **Palette finalization** | Light + dark hex tables (§3.1) for the chosen direction, after CI contrast verification per 02 §6 |
| 3 | **Typeface selection & licensing** | Proposed: all-OFL stack (Fraunces / Inter / Noto Naskh Arabic / IBM Plex Sans Arabic for A) — $0 licensing. Alternative: commercial Arabic/Latin faces (e.g., premium foundry licenses) — needs budget approval if the owner prefers |
| 4 | **Brand mark / logo design** | Not yet designed — needs its own design pass after direction approval (wordmark "Mawjood / موجود", app icon, favicon, social avatar). Nothing in this doc constitutes a logo |
| 5 | **Motion principles** | Duration catalog (150/250/350ms), easing, and the "meaningful motion only" doctrine (§4.4) — plus confirmation that reduced-motion behavior matches 02 §5 |
| 6 | **Imagery & illustration style** | Real-photography-only rule, warm grade, empty-state illustration system (paper/shelf motif), photo treatment in dark mode |
| 7 | **Brand voice for marketing surfaces** | Tone of hero/empty-state/onboarding copy (specimen lines in §§4.5–4.6 are drafts, not final copy) |
| 8 | **Any frontend implementation** | Explicitly **not** authorized by this document — a separate build authorization is required, and it must follow the approved direction, tokens, and 02's architecture |

### 7.3 What happens after approval

1. Owner selects direction (and approves items 2–7 as applicable).
2. 08 re-issues §3 token tables + §5 Figma specs for the chosen direction if it isn't A.
3. Logo/mark design pass (item 4) as a follow-up workstream.
4. Figma variables + component library built from this spec; contrast audit in CI (02 §6).
5. Separate build authorization before any code.

---

*End of workstream-08-brand.md — planning only; no code changes authorized; no owner approval claimed.*
