# D0.5 — Visual Identity Directions

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** ⚠️ **PROPOSAL ONLY.** These are three directions for owner review. **No direction is chosen.** The recommendation below is the workstream's opinion, not a decision.
**Positioning anchor:** *"A beautiful, trusted place for your personal and family memories."* (see `BRAND_STRATEGY_AND_POSITIONING.md`)

Each direction is a complete, internally consistent system: palette (hex), typography (Arabic + Latin), shapes, imagery, iconography, UI characteristics — plus honest pros/cons.

---

## Direction A — "Warm Archive" (الأرشيف الدافئ)

*The keepsake box. Editorial, paper-and-ink, timeless.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Paper (light bg) | `#FAF6EE` | App background, light mode |
| Card | `#FFFFFF` | Cards, sheets |
| Paper-deep | `#F3EDE1` | Secondary surfaces, input fills |
| Ink (text-1) | `#211A13` | Primary text |
| Ink-soft (text-2) | `#5C5245` | Secondary text |
| Ink-faint (text-3) | `#75664F` | Tertiary/meta text |
| Line | `#E7DECF` | Borders, dividers |
| Accent (terracotta) | `#B4471F` | Primary buttons, key actions (white text: 5.44:1 ✓) |
| Accent-deep | `#8C3415` | Accent text on light (8.02:1 on white ✓), pressed states |
| Gold (decorative) | `#C9963C` | Sparingly: badges, milestones, "resurfaced memory" moments |
| Success | `#3E7C4F` | Confirmations (4.64:1 on paper ✓) |
| Danger | `#B3372C` | Destructive (5.57:1 on paper ✓) |

Dark mode: bg `#16120D` (deep warm charcoal), surface `#221B13`, card `#2A2117`, text-1 `#F4EDE1` (16.02:1 ✓), text-2 `#C4B7A3` (9.45:1 ✓), line `#3A2F22`, accent `#E07B4A` (6.30:1 on bg ✓), gold `#D9A94F` (decorative).

**Typography:** Latin display **Fraunces** (OFL serif, characterful, editorial) · Latin UI/body **Inter** (OFL) · Arabic display **Noto Naskh Arabic** (OFL — calligraphic warmth for headlines) · Arabic UI/body **IBM Plex Sans Arabic** (OFL — clean, highly legible). All four SIL Open Font License: free for commercial use, zero licensing cost.

**Shapes:** generous radii — cards 14px, sheets 20px, buttons 12px; circular photo frames; recurring motif is the **stack/shelf**: memory cards that feel placed, not rendered; timeline as a shelf with date "labels" like archive tabs.

**Imagery:** real photography only, warm film-like grade (no heavy filters); memory photos presented like well-kept prints with soft shadows and captions; empty states use small warm illustrations (paper, boxes, shelves — never robots). Strictly no AI-generated people.

**Iconography:** 1.5px stroke, rounded line caps, slightly hand-warmed geometry (corners never razor-sharp). Existing space emoji identity (🔒 👨‍👩‍👧 💼) kept as the product's familiar face; drawn icons elsewhere.

**UI characteristics:** editorial hierarchy — serif headlines, generous whitespace, captioned photos; chat assistant feels like a knowledgeable archivist: calm, precise, warm.

**Pros:** most differentiated from SaaS/AI clichés; the archive metaphor maps directly onto product pillars (timeline = shelf, rediscovery = finding a keepsake); warmest and most human; photographs beautifully with real user photos; key contrast pairs pre-verified.
**Cons:** highest art-direction risk — executed poorly it can feel "old" or print-bound rather than contemporary; Naskh display Arabic can read formal — needs confident layout to stay fresh; dark mode needs deliberate craft (warm darks, not inverted grays).

---

## Direction B — "Soft Sanctuary" (ملاذ هادئ)

*The calm room. Contemporary minimal, friendly, breathing space.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Mist (light bg) | `#F7F5F0` | App background |
| Card | `#FFFFFF` | Cards |
| Ink (text-1) | `#1C2420` | Primary text (deep green-slate) |
| Text-2 | `#55605A` | Secondary text |
| Line | `#E4E0D6` | Borders |
| Accent (sage) | `#4F7A63` | Primary actions (white-text fill must verify ≥4.5:1 before use) |
| Accent-soft | `#DCE9DF` | Tinted surfaces, selected states |
| Warmth (peach) | `#D99A68` | Secondary accents, highlights — decorative + large elements |
| Success | `#3E7C4F` | · Danger `#B3372C` |

Dark mode: bg `#121815`, surface `#1B241F`, text-1 `#EEF2EC`, accent-light `#9DBFA9`.

**Typography:** **Rubik** (OFL) for *everything* — one family with native Arabic + Latin coverage; bilingual consistency automatic, pairing risk zero. Display weights 600–700 for headlines, 400/500 for UI.

**Shapes:** softest of the three — pills and 16–24px radii, fully rounded avatars and chips, gentle elevation (soft shadows, never harsh).

**Imagery:** gentle duotone illustrations for empty states and onboarding (abstract home/family shapes, sunrise motifs); photos in soft, deeply rounded frames; no harsh crops.

**Iconography:** rounded filled/line hybrid icons, friendly proportions, slightly larger optical sizes.

**UI characteristics:** the calmest chat-first experience; whitespace does the emotional work; family spaces feel like a sunny kitchen noticeboard. Safest, most "app-like."

**Pros:** friendliest and most approachable; single type family eliminates bilingual pairing risk and licensing questions; lowest execution risk — hard to make look bad; excellent for the chat-first home.
**Cons:** most crowded aesthetic territory — sage/peach calm-minimal is adjacent to wellness/meditation apps and risks feeling generic ("another calm app"); least memorable; differentiation relies almost entirely on copy and photography rather than the system itself.

---

## Direction C — "Bold Contrast" (تباين جريء)

*The confident statement. Dark-forward, geometric, app-store standout.*

**Color palette**

| Token | Hex | Usage |
|---|---|---|
| Ink-night (dark-first bg) | `#10151C` | Primary app background (dark is the signature) |
| Surface | `#182030` | Cards on dark |
| Paper (light mode bg) | `#F5F2EA` | Light mode background |
| Text on dark | `#F2EFE6` | Primary text, dark mode |
| Accent (amber) | `#E8A33D` | Primary actions, brand moments (verify ≥4.5:1 per usage) |
| Signal (coral) | `#E15E4E` | Alerts, borrow due-dates, destructive (large/bold usage) |
| Line on dark | `#2A3444` | Borders, dark mode |

**Typography:** Latin **Space Grotesk** (OFL, geometric, confident) · Arabic **Readex Pro** (OFL, contemporary, pairs well with geometric Latins).

**Shapes:** geometric — 6–8px radii, 1px hairline borders, grid-forward layouts, sharp section dividers. The motif is the **frame**: everything crisply contained.

**Imagery:** high-contrast photo collages, bold crops, duotone treatments in amber/ink for marketing; in-app photos full-bleed with scrims.

**Iconography:** 2px geometric stroke icons, precise, engineered feel.

**UI characteristics:** night-mode-first identity; confident and striking; the vault feels like a high-security instrument; marketing is bold and poster-like.

**Pros:** strongest shelf-appeal in app stores; dark-mode lovers get a signature experience; most "designed" feeling — reads as premium-tech.
**Cons:** fights the brief's core adjectives — closest to the "AI product" cliché the positioning explicitly rejects (dark + amber is AI-brand territory); risks feeling cold and impersonal, undermining "warm, human" and family belonging; amber/coral text needs careful per-mode AA tuning; light mode risks feeling like an afterthought.

---

## ★ Recommended direction (PROPOSAL — NOT a decision)

**Direction A — "Warm Archive."**

**Rationale:**
1. **It is the only direction that satisfies the whole brief at once.** "Warm, human, memorable" *and* "not a generic SaaS dashboard, template, or AI-generated interface" — B risks generic-calm, C risks AI-cliché. A is the differentiated one.
2. **The metaphor is the product.** An archive is where memories are *kept, found, and resurfaced* — the shelf/timeline, the keepsake-card, the "memory resurfaced" gift moment all fall out of the identity naturally instead of being decorated on afterward.
3. **Trust reads as craft.** For a product asking users to entrust it with family memories (and a secret vault), the editorial, paper-and-ink register signals care and permanence — "this place will still be here in ten years" — better than tech-gloss.
4. **Bilingual dignity.** A display serif + Naskh pairing gives Arabic headline typography genuine presence rather than mirrored-Latin leftovers, directly serving the "sophisticated Arabic + English typography" principle.
5. **Practical:** all four typefaces are OFL (zero licensing cost), and the key contrast pairs are pre-verified ≥4.5:1 in both modes.

**Honest caveats (built into the proposal):** A needs the most disciplined art direction — the line between "timeless editorial" and "dated print" is execution. Mitigations: (a) reserve serif/Naskh for display headlines only; all UI body text stays in clean sans (Inter / IBM Plex Sans Arabic); (b) borrow B's calm spacing and soft elevation for in-app surfaces so the chat home feels contemporary; (c) gold is rationed to milestone moments so it never becomes decoration.

**Fallback:** if the owner prefers a safer contemporary feel, Direction B is the recommended fallback — lowest risk, friendliest, single-family bilingual simplicity.

> **Status: PROPOSAL.** No visual direction is chosen. See `BRAND_APPROVAL_GATE.md` — the owner approves the direction before any palette finalization, typeface commitment, or implementation.
