# CFP-01 — Comprehensive Fix Pack 01: tracker & findings

Status key: ✅ implemented in the noted PR · ⏳ planned · 🔍 audited

Baseline: main @ c0d4ead (verified 2026-10-15). All work in Draft PRs; no merges,
builds, publishes, or Production changes.

## Design-direction reconciliation (read first)

The mission says "monochrome-first". The standing owner-approved direction is
Warm Archive (confirmed 2026-10-14), and the code's current theme tokens predate
its implementation (UI-02 territory, not yet built). CFP-01 therefore restyles
ONLY with the existing theme tokens (P.*) and introduces no palette change.
If "monochrome-first" was meant as a direction change, that is an owner
decision (OD) — flagged, not assumed.

## Item 6 — Record pagination: HALF-BUILT (audit complete) → CFP-C ⏳

Already real server-side pagination (PostgREST range(), 10/page) via
usePaginatedList for: notes, things, tasks, upcoming — delivered as infinite
scroll (onEndReached), functionally equivalent to repeated "Show More"
(10 more per trigger). DECISION: keep; do not churn working code for a button.
REAL GAPS to fix in CFP-C:
- shopping items: single fetch capped at 100 (index.tsx:903)
- shopping lists: UNBOUNDED nested fetch items(*) (client.ts:952-962)
- borrows: single page of 100
- expenses (500) / watches (100): single fetches
- memory items refresh: silent 100 cap (listItemsCached with no opts)
Preserve ordering/filters exactly per list (status desc + created_at desc for
shopping/tasks; due_at asc for upcoming; tab isolation rules in listNotes).

## Item 7 — Spaces & tabs: substrate EXISTS, product surface MISSING (audit complete) → CFP-D ⏳

Existing: spaces.type includes 'custom' (migration 0034); governed server path
in chat fn (executeCreateSpace/executeDeleteSpace: owner-only, custom-only
delete, refuses non-empty, optional paid gate); rich entitlement substrate —
subscription_plans + user_subscriptions (0032), subscription_grants ledger
(0025), per-profile limit columns (custom_tabs_limit=3, family_slots=1,
secret_vaults_limit=5, …), admin-set-limits fn, pure _shared/entitlements.ts
(deny-by-default, NOT yet wired). Tab limit enforced in client + chat fn only —
NO DB enforcement anywhere (direct PostgREST inserts bypass caps; spaces have
NO count limit at all today; RLS lets owners insert spaces freely).
Missing for CFP-D:
- client create/rename/configure/delete UI for custom spaces
  (engine has renameSpace; deleteSpace defined but never called; no createSpace)
- space-count entitlement: Free = 3 built-in + 2 custom (5 total);
  Plus = 3 + 7 (10 total) — as CONFIGURABLE rules (plans/grants), not
  hardcoded; subscription downgrade preserves data (no auto-delete — matches
  existing deleteSpace-refuses-non-empty semantics)
- server-side enforcement point: edge-function create path (following the
  chat-fn precedent) and/or an additive DB trigger on spaces insert
  (non-destructive; needs care to keep ensureDefaultSpaces working)

## Item 3 — Input limits: SMALL, PRECISE (audit complete) → CFP-B ⏳

- Family name = the rename modal ONLY (no naming at creation). Today:
  UI maxLength=40 (index.tsx:6008), engine renameSpace slice(0,40)
  (client.ts:1569-1574), direct PostgREST write — no edge function.
  CFP-B changes: UI maxLength 20 + char counter; engine enforces 20;
  SERVER boundary = additive BEFORE INSERT/UPDATE trigger on spaces
  (migration 0047) that rejects family-type names > 20 chars ONLY when the
  name is being set/changed (existing rows untouched; AI custom spaces are
  type 'custom' → unaffected; built-in seed names are short). Scratch
  application follows the standing owner-gated rollout, like 0035→0046.
- Support message EXISTS (Profile → report-error fn): UI maxLength 300,
  client slice 300, but SERVER sanitizer caps at 200 (report-error:47).
  CFP-B: UI 1000 + counter, client slice 1000, report-error raises the cap
  to 1000 ONLY for context='support' (telemetry contexts stay 200; the
  sanitizer's redaction still applies). Contract change flagged in the PR.

## Item 4 — Conversation history: CONSTANTS ONLY (audit complete) → CFP-B ⏳

Already implemented as Show More windowing at 10/+10 (histVisible state,
showMoreBtn + i18n + styles exist; fetch is client-side ≤50 rows).
CFP-B: 10→5 at index.tsx:254 (initial), :1367 (drawer-open reset),
:4531 (+5 increment). No server change.

## Item 5 — Space labels: TAB BAR + LOCALIZATION ✅ CFP-A

Tab bar (index.tsx:4271-4284): Home tab has a text label; the 3 space tabs
render SPACE_SHORT (icons only). SPACE_LABELS (constants.ts:18-22) is
hardcoded ENGLISH, not i18n — Arabic users see "🔒 Private" today.
CFP-A: add i18n keys spacePrivate/spaceFamily/spaceWork (ar/en) (+ a
localized label helper), render icon + name in the tab bar reusing
tabText/tabTextActive (theme-aware already), and switch SPACE_LABELS
consumers to the localized helper. "Home" = the chat tab (already labeled).

## Item 1 — New-list modal shake: ROOT CAUSES FOUND ✅ CFP-A

index.tsx:6179-6250 + styles.ts modalBg/modalCard. Four mechanisms combine:
(1) the KeyboardAvoidingView IS the centering container (justifyContent:
center) — keyboard padding re-centers the card on every height change;
(2) the items input height is JS-state (listItemsH, onContentSizeChange
with a +24 fudge, non-monotonic steps) → the content-sized card "breathes"
symmetrically around center per keystroke; (3) NO ScrollView — overflow
past maxHeight 88% is unreachable; (4) listItemsH is never reset between
opens. Buttons sit in flow after the input and get pushed out.
CFP-A fix: restructure this modal — card becomes a column with a ScrollView
form region and a PINNED footer button row; the items input drops the JS
height state and auto-grows natively within min/maxHeight (90/180,
scrollEnabled at cap); card anchored so keyboard appearance does not
re-center it (top-anchored within the KAV with a fixed margin, keeping
maxHeight). Behavior (create/cancel/disabled logic) unchanged.

## Item 2 — Tap-outside: CENSUS DONE ✅ CFP-A (11 eligible modals)

18 modals; NO backdrop onPress anywhere except the photo viewer (Pressable
root — the in-app precedent) and the drawer backdrop. 13 transparent card
modals are candidates. CFP-A design (mission: confirm before discarding,
preserve input on Stay, never bypass security flows):
- GUARDED (backdrop tap → Alert confirm [Stay / Confirm closing] when the
  form is DIRTY; closes directly when clean): profile (#1 — has support
  text + fields), tab create/rename (#3), rename family (#13),
  new shopping list (#15).
- PLAIN-CLOSE backdrop (= their existing Close/Cancel buttons, no input
  at risk): about (#2), tab-limit notice (#4), move-file picker (#8),
  invite view (#9 — view-only; its Close behaves identically), paywall
  (#11), families switcher (#12 — inner armed confirms unaffected),
  shopping list detail (#14).
- EXCLUDED (no backdrop handler): delete-tab confirm (#5 — it IS a
  confirmation flow), join-by-code (#10 — code entry), full-page modals
  (vault #6, vault mgmt #7, trash #17), WelcomeScreen, photo viewer
  (already tap-to-close).
Mechanism: for View-bg modals the backdrop becomes a Pressable; for
KAV-bg modals an absolute-fill Pressable sits behind the card inside the
KAV (the photo-viewer pattern). No new components; Alert.alert is the
app's existing confirm idiom.

## Item 8 — Composer: ALREADY WHATSAPP-STYLE; POLISH + PARITY (audit complete) → CFP-E ⏳

Main composer (index.tsx:4914-4966): composerBox (radius 22, P.surface)
with camera INSIDE, ONE combined mic/send circle (48px, P.accent; swaps
➤/🎙️/⏹ by state), JS auto-grow 44-120, recording row below with
VoiceWave + timer. All colors already P.* tokens. The VAULT composer
(5631-5669) shares the styles but LACKS auto-grow and the wave row.
CFP-E: visual polish via the SHARED styles (both composers improve at
once), auto-grow parity for the vault instance, glyph/icon consistency
pass within the current emoji-glyph system (no new dependencies), zero
handler/behavior changes.

## PR grouping (provisional)

- CFP-A: items 1+2+5 (index.tsx modal/labels) — pending audit A
- CFP-B: items 3+4 — pending audit B
- CFP-C: item 6 gaps (shopping/borrows/expenses/watches/memory-items paging)
- CFP-D: item 7 (migration 0047 additive + engine + UI) — largest; may split
  server (D1) and UI (D2)
- CFP-E: item 8 (composer restyle in existing tokens)

## Standing constraints

Draft PRs only; exact-head CI 9/9 per PR; failing-first/census guards in the
unit suite; no destructive migrations; RLS preserved; no paid AI; iPhone
acceptance is an owner checklist (no device claims by the agent).


## FINAL HARDENING + INTEGRATION (owner-directed, 2026-10-15 late)

- **Item 7 entitlement bypass — CLOSED (PR #72 @ 0d6e11ed).** Creation-path audit:
  direct PostgREST had NO cap (the bypass); the AI executor had a paid-flag gate
  but no count cap; manage-space was capped but racy. Migration **0049** moves
  enforcement to a BEFORE INSERT trigger on spaces (custom only) with a
  per-owner advisory transaction lock (races serialize) and a shared SQL
  resolver `custom_spaces_effective_limit` (MAX of profile column / plan
  feature / unexpired grant — the 0048 semantics). The chat executor now
  pre-checks via the resolver. Behavioral proofs live in
  `supabase/tests/authz-behavioral.mjs` §7 (run by CI's rls-audit job on a
  migrated PG15): PostgREST-path cap, built-ins exempt, grant raise +
  downgrade preservation, plan 7, profile-column limit, 6-way race → exactly 2.
- **Item 7 navigation — DONE (PR #72).** Custom spaces open in the generic
  (Private-style) browse UI parameterized by space id (`openCustomSpace`);
  no new navigation destination; tabs + records + owner tab management work.
- **Integration branch `cfp/cfp-01-integration`** merges #68→#69→#70→#71→#72 in
  the recommended order. Conflicts were confined to append regions
  (unit.test.mjs ×4, i18n key blocks, constants AppView/spaceLabel adjacency,
  one state-declaration hunk in index.tsx). The merged test file was rebuilt
  deterministically (base + each PR's appended block verbatim) after a naive
  marker-based resolution dropped lines — final integrated suite **235/235**,
  tsc clean, lint 0 errors, export passes.
- **Migration chain note:** rollout range is now 0035→0049. 0047 depends on
  spaces (0001); 0048 on profiles + subscription_plans (0032) + grants (0025);
  0049 on 0048's column. Rollbacks: 0049 = drop trigger + 2 functions;
  0048 = drop column (plan-feature UPDATE is data, revert by removing the
  appended element); 0047 = drop trigger + function. All additive; no data
  migration to undo.
