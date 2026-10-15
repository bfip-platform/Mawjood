# UI v1.2 — consolidated design batch / owner review

Status: PROPOSED, not brand-approved. This batch deliberately keeps implementation gated by `docs/autonomous/d05/BRAND_APPROVAL_GATE.md` §7. No public release or OTA publication is authorized here.

## Binding direction
Modern Minimal AI + Human Memories; monochrome-first, premium contemporary styling; no terracotta, brown, gold, vintage-paper motif. Soft blue and muted sage only as subtle accents. WCAG 2.2 AA, EN/AR RTL, reduced motion, and light/dark modes.

## One cohesive implementation batch (after owner approves visual package)
1. **Foundations:** semantic light/dark tokens, Inter + IBM Plex Sans Arabic licensing and fallback verification, contrast checks, spacing, radii, elevation, icon scale, typography.
2. **Reusable components:** buttons, inputs, cards, bottom navigation, top bar, chips, sheet/dialog, toast, skeleton, empty/error/loading states, accessibility labels.
3. **Home and AI chat:** modern home hero, search/ask composer, voice entry, memory highlights, recent activity, AI responses, keyboard and RTL behavior.
4. **Memories and spaces:** family/household, personal vault, items, locations, lists, detail cards and add/edit flows.
5. **Navigation and archive:** sidebar, history, search, settings, profile, notifications, trash and recovery.
6. **Polish:** light/dark consistency, long AR/EN strings, touch targets, contrast, reduced motion, iPhone device review and regression tests.

## Visual proposal for approval (not final tokens)
- Light: background #FFFFFF; surface #F6F7F8; text #111318; secondary text #5B6470; primary action #111318 with white text.
- Dark: background #0D0F12; surface #191C21; text #F7F8FA; secondary text #ADB5C0; primary action #F7F8FA with dark text.
- Accent blue #668CC6; muted sage #779887; use sparingly, and verify contrast in context.
- Type: Inter (Latin), IBM Plex Sans Arabic (Arabic), subject to font/license verification and owner approval.
- Motion: short meaningful transitions, disabled/reduced under accessibility preferences.
- Logo, exact palette, fonts and polished screens require explicit owner sign-off before implementation.

## Acceptance gates
- Owner reviews high-fidelity screen set (home/chat, memory detail, family, lists, navigation, dark mode, RTL) and logo direction.
- Brand approval record updated with explicit owner decisions, not assumed from general implementation request.
- Then implement in one coherent PR series/batch; test unit/typecheck/lint, iOS visual regression and OTA compatibility. No auto-merge, build, OTA publish or production Supabase modification.
- Remove the verified `OTA TEST 01` subtitle as a separate cleanup change in this preparation PR.
