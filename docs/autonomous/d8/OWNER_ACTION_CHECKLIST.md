# Owner-action checklist (D8 T-D8-4) — tracked, NOT executed by the agent

Consolidated from every stage of the program. One pass through this list unblocks everything the agent cannot do itself.

## 1. Merge the Draft PR queue — ✅ DONE 2026-10-12 (via PR #36)

The queue was integrated in dependency order into PR #36 (with the owner's audit corrections) and the owner merged it: `main` = `0cd7546e7bb847887e0b8db72b57b1bbf60a0779`. Remaining merges are the post-merge launch-readiness PRs: **#37** (LOW closures) → **#38** (18+, migration 0045) → **#39** (offline wiring) → **#40** (a11y) → **#41** (launch docs). Each is independently reviewed + CI-green at its exact head; merge in any order (no shared files except test/ledger appends).

## 2. Production rollout (separate approval)

- [ ] Verify production's current migration state (the open D0 question) — including whether `items.updated_at` already exists out of band.
- [ ] Apply migrations **0035 → 0045** in order; deploy the corresponding edge functions. Full procedure + per-migration rollback: `docs/autonomous/launch/PROD_ROLLOUT_RUNBOOK.md`.
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
- [x] 18+ gate: approach confirmed and BUILT in PR #38 (self-declared DOB: app declaration screen + chat AI-surface refusal, migration 0045). Owner merges #38; rollout adds 0045.

## 5. App Factory (D7 unblock, optional for launch)

- [ ] Publish `@bfip-platform/ai-provider-core` and `@bfip-platform/ops-telemetry-core` via the factory release workflow (type AUTHORIZED, mode PUBLISH).
- [ ] Provision a `read:packages` token for Mawjood-side registry consumption.
- [ ] Sign off (or reject) the vault-crypto deferral (PR #33 §5).

## 6. Verification passes only the owner can do

- [ ] Screen-reader walkthrough (VoiceOver/TalkBack) of the primary flows (PR #29 scoped the code pass; device sign-off is yours).
- [ ] Lighthouse on a deployed web build (PR #27 foundations are export-verified; the deployed check is post-deploy).
- [ ] Run the D6 live-model protocol against a staging deployment of the RC with real keys (prepared + blocked analysis: `docs/autonomous/launch/LIVE_MODEL_E2E_PROTOCOL.md` — needs a staging deploy + keys + DOB-seeded test users).
- [ ] ChatGPT ↔ GitHub OAuth link (your standing plan) — D9's gate package depends on it.
