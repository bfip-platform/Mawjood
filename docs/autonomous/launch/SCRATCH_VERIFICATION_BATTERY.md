# Scratch verification battery — 2026-10-12 (post-merge)

Executed against the SCRATCH project (`mawjood-d1-scratch`,
`caimavjwasxiegjhxdsr`) via the Management API after PR #36 merged.
Production was not touched. All battery rows were cleaned up
(verified: 0 remaining).

## Results

| # | Check | Result |
|---|---|---|
| 1 | Migration 0045 (PR-A) applies over the scratch chain; `profiles.birth_date` is `date` | ✅ |
| 2 | **Durability — basis stated precisely (corrected after independent review):** `items` RLS is enabled with two policies: `items_member_read` (SELECT) and `items_member_write` (**FOR ALL**, migration 0002, `polcmd='*'` — verified on scratch). So the policy layer does NOT bar a space member's client from deleting items rows, and this battery does **not** claim it does. Saved-memory durability rests where the program actually built it: (a) the **AI/engine layer** — no AI path hard-deletes; the codebase's only engine `items` delete is `purgeExpiredTrashedFacts` (trashed + past-retention only), pinned by the trashFact census guard; (b) the **confirmation rails** — the AI can only trash through a user-confirmed preview (0036/0037/0041). Client-side hard deletes exist ONLY behind explicit user actions in the app (delete-forever in trash, note/list deletion in `voice-engine/src/client.ts`) — the owner's own authority over their data. A future hardening option (narrowing the FOR ALL policy and routing permanent deletes through a governed server path) is recorded as finding **F-LAUNCH-01** in the register — an owner decision, since it changes user-facing delete flows. | ✅ (as corrected) |
| 3 | **Trash/restore round trip:** synthetic memory item → trashed (status + `trash_reason: user_forget_confirmed` in meta) → restored; title, details, and `meta.mkey` byte-identical after restore | ✅ |
| 4 | **Purge selection excludes restored/live rows:** the engine's purge rule (status `trashed` AND `trashed_at` older than the 30-day floor) selects 0 for the restored row | ✅ |
| 5 | **`items.updated_at` live:** column exists (0042) and the touch trigger maintains it (non-null after updates) | ✅ |
| 6 | **Spend ledger live on scratch:** `try_charge_ai_spend(0.10 @ cap 2.00)` → 0.100000; separate-statement `ai_spend_total` reads back 0.100000. (A same-statement read showed 0 — statement-snapshot semantics, re-verified separately; not a ledger defect.) | ✅ |
| 7 | **Confirmation-safety primitives present:** `pending_actions` status CHECK includes `executing` (0037 atomic claim states); `can_read_photo` (0038), `claim_invite_use` (0040) present | ✅ |
| 8 | Cleanup: battery item + spend rows deleted; counts verified 0 | ✅ |

## Evidence map for the remaining program checks

- **Quota preservation** (upsertFacts cap: same-`mkey` updates never
  blocked; blocked inserts counted, never silent): engine-level —
  pinned by the unit suite (D1 tests) at every PR's CI; no SQL surface
  exists to re-probe.
- **Account isolation:** CI's `authz-behavioral` job exercises real
  RLS as simulated users on every PR; photo isolation was additionally
  proven behaviorally on scratch in PR #17 (0038/0039).
- **Confirmation safety under concurrency:** the atomic claim was
  proven on scratch in D1 (4 parallel claims → exactly 1 winner) and
  re-verified during the integration audit; the forget/merge executors'
  only entry is the claimed preview (trashFact census guard in CI).
- **Spend-cap concurrency:** `spend-ledger-check.mjs` (50-way race →
  exactly 20 succeed at a $2.05 cap) — local + reviewer-reproduced;
  CI wiring is the owner-applied step in
  `docs/autonomous/audit/CI_SPEND_LEDGER_STEP.md`.
