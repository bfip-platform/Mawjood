# Owner-action checklist (D8 T-D8-4) — tracked, NOT executed by the agent

Consolidated from every stage of the program. One pass through this list unblocks everything the agent cannot do itself.

## 1. Merge the Draft PR queue (in order)

#16 → #17 → #18 → #19 → #20 → #21 → #22 → #23 → #24 → #25 → #26 → #27 → #28 → #29 → #30 → #31 → #32 → #33 (then the D8 PR). Expect small EOF-append adjacencies in `unit.test.mjs` and minor `_layout.tsx`/`index.tsx` region overlaps; #21 (migration 0041) must precede #22 (0042).

## 2. Production rollout (separate approval)

- [ ] Verify production's current migration state (the open D0 question) — including whether `items.updated_at` already exists out of band.
- [ ] Apply migrations **0035 → 0043** in order; deploy the corresponding edge functions.
- [ ] Use `CREATE INDEX CONCURRENTLY` for 0043 per its header runbook if prod tables are large.
- [ ] Confirm production backup posture (daily backups / PITR) in the dashboard.

## 3. Revocations & hygiene

- [ ] Revoke the GitHub PAT pasted in chat on 2026-10-12 (verified still valid that day; never stored/used by the agent).
- [ ] Revoke the `d1-scratch-migrations` Supabase token; disconnect `custom.supabase` if desired. Confirm the Oct-9 Supabase token is revoked.
- [ ] Set Supabase Auth **Site URL / Redirect URLs** to the production web URL (open since Sep 23, 2026).

## 4. Product decisions

- [ ] Quota & pricing: choose option A/B/C and prices (OD-01/02, PR #25 paper).
- [ ] Confirm or adjust the provisional **$2/day** AI spend-cap default (PR #19).
- [ ] Stripe: complete the activation checklist in PR #25 when ready (no keys touched yet).
- [ ] Legal: send the Terms/Privacy/DPA drafts (PR #25) to counsel; if any of PRs #17/#19/#20/#23 is declined, the drafts' §1 inventory must be amended first.
- [ ] 18+ gate: confirm the launch age-gate approach (Decision #5 stands: 18+ only).

## 5. App Factory (D7 unblock, optional for launch)

- [ ] Publish `@bfip-platform/ai-provider-core` and `@bfip-platform/ops-telemetry-core` via the factory release workflow (type AUTHORIZED, mode PUBLISH).
- [ ] Provision a `read:packages` token for Mawjood-side registry consumption.
- [ ] Sign off (or reject) the vault-crypto deferral (PR #33 §5).

## 6. Verification passes only the owner can do

- [ ] Screen-reader walkthrough (VoiceOver/TalkBack) of the primary flows (PR #29 scoped the code pass; device sign-off is yours).
- [ ] Lighthouse on a deployed web build (PR #27 foundations are export-verified; the deployed check is post-deploy).
- [ ] Run the D6 live-model protocol (PR #30 doc) against staging with real keys before the release candidate.
- [ ] ChatGPT ↔ GitHub OAuth link (your standing plan) — D9's gate package depends on it.
