# Mawjood — Recovery Checkpoint

> Replace only with verified current state after updating append-only ledger. No reliance on chat/session memory.

- Updated at (UTC): 2026-10-13T03:15Z (post-merge launch-readiness program)
- Repository / main SHA: bfip-platform/Mawjood — main `0cd7546e7bb847887e0b8db72b57b1bbf60a0779` (PR #36 merged by owner 2026-10-12; integration of PRs #16–#35 + owner audit corrections, final integration head f9647f85)
- Open Draft PRs (post-merge launch readiness, each independently reviewed + exact-head CI): #37 LOW findings closure `f9971aac`; #38 18+ enforcement `88da938b` (after e2e + deadlock fix round); #39 offline wiring `1f1c5bbd`; #40 a11y completion `ac51d688`; #41 launch docs (this update).
- Last verified completed stage/task: Mawjood autonomous program D0–D9 packages + owner audit integration (PR #36, merged). Scratch battery 2026-10-12: all checks green (docs/autonomous/launch/SCRATCH_VERIFICATION_BATTERY.md).
- Current task: none active — the launch-readiness program is delivered as Draft PRs #37–#41 awaiting owner merges/decisions.
- Production state: UNTOUCHED by the whole program. Deployed functions are the pre-program set; migrations 0035→0045 NOT applied to production; production schema state vs the chain still unverified (probes prepared in the rollout runbook).
- Failed tests / unresolved blockers: PR #38's first CI run failed e2e-auth because fixture users had no birth date (the new gate working) — fixed in the spec at 88da938b. Live-model E2E cannot run: no RC deployment exists and deployment is owner-gated (protocol prepared). Codex gate: RC fixed (0cd7546e, or post-#41 main HEAD) but the owner's ChatGPT↔GitHub OAuth link is still pending.
- Known safety issues and protected resources: production project `mwjzosfrxwxcrzcsiear` is NEVER a test/deploy target without separate owner approval; scratch `caimavjwasxiegjhxdsr` is the only test DB (holds ~100k bench rows + 0045 applied).
- Owner decisions pending: merge #37–#41 (any order); production rollout (runbook ready); quota A/B/C + prices (OD-01/02); $2/day cap confirmation; Stripe activation; legal counsel review; revoke the Oct-12 GitHub PAT + d1-scratch Supabase token, confirm Oct-9 token revoked; set Supabase Auth Site/Redirect URLs; OD-39 brand finalization; D7 publishes + vault-crypto sign-off; device screen-reader walkthrough; staging live-model run; ChatGPT↔GitHub link.
- Next 3 safe actions: (1) owner merges #37–#41; (2) owner runs the rollout runbook pre-flight probes (or authorizes the agent to read them) and decides on production rollout; (3) owner stages an RC deployment + keys for the live-model protocol, and completes the ChatGPT↔GitHub link for the Codex gate at the final main HEAD.
- Recovery/rollback anchor: main `0cd7546e`; every launch PR reverts independently; per-migration rollback table in docs/autonomous/launch/PROD_ROLLOUT_RUNBOOK.md.
- Links to ledger entries: docs/autonomous/EXECUTION_LEDGER.md (post-merge entry); register: docs/autonomous/audit/INTEGRATION_FINDINGS_REGISTER.md.

- **Final integration (2026-10-13):** PRs #37–#41 combined on `integration/launch-readiness-37-41` — suite 174/174 (assertion union rebuilt verbatim), migrate-check/ledger/rls/authz/auth-gates ALL GREEN locally, app tsc + lint + web export green. One combination-only defect found and fixed in-branch: stray conflict markers in the index.tsx hooks block (age-gate state + offline indicator unioned). F-LAUNCH-01 investigated in `docs/autonomous/launch/F_LAUNCH_01_ANALYSIS.md` (Option B recommended; owner approval required).

- **F-LAUNCH-01 Option B (2026-10-13):** Draft PR #43 on `security/f-launch-01-option-b` from main `843c8734` — migration 0046 + RPC + client reroute; see the ledger entry of the same date. Awaiting owner merge; production unchanged.

- **Staging prep (2026-10-13):** staging deployment + test plans prepared (launch/ STAGING_*), D9 RC re-fixed at `7f4bad04`. Execution blocked on owner approval + scratch access route + owner-set secrets (plan §7, B1–B5). Nothing deployed; no spend.
