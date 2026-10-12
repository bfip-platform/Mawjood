# Mawjood — Recovery Checkpoint

> Replace only with verified current state after updating append-only ledger. No reliance on chat/session memory.

- Updated at (UTC): 2026-10-12 (at Stage-0 commit time; SHAs finalized in the PR)
- Repository / main SHA: bfip-platform/Mawjood — main `0a4df1087c178ec0ff05cfc0621dda1676b` (D1 PR #15 merged 2026-10-12T21:13:26Z)
- Active branch / SHA: `fix/notes-deleted-at` (Stage 0) — exact HEAD recorded on its Draft PR
- Open PRs and CI status (exact SHA): PR #15 MERGED. Stage-0 Draft PR — CI + review recorded on the PR itself.
- Last verified completed stage/task: D1 incl. delete-safety correction + confirmation hardening (PR #15, final HEAD `180674cc`, CI 9/9, reviews PASS-WITH-NOTES ×3)
- Current task and acceptance criteria: Stage 0 — remove 6 stale `notes.deleted_at` filters (tabs.ts ×3, chat ×3); guard + behavioral regression tests; scratch before/after repro; review + exact-head CI; Draft PR. NO-GO items: no merge, no production, no migrations.
- Last successful tests and evidence: unit suite 82/82 locally (failing-first verified: 4 new tests fail without the fix); scratch repro 8/8 PASS (4 shapes × before-42703/after-rows)
- Failed tests / unresolved blockers: none for Stage 0. Program blockers: quota numbers unchosen (OD-01/02); D9 Codex gate may need the owner's ChatGPT↔GitHub link; production schema state vs migration chain still unverified since D0 (fix is safe on canonical schema regardless).
- Known safety issues and protected resources: production project `mwjzosfrxwxcrzcsiear` is NEVER a test/deploy target without separate owner approval; scratch `caimavjwasxiegjhxdsr` is the only test DB. Cross-user private-photo isolation defect (HIGH, D0) still open — Stage 1.
- Owner decisions pending: merge Stage-0 PR; D1 production rollout (migrations 0035+0036+0037 to prod + function deploy) as a separate approval; quota option A/B/C; revoke the Oct-12 GitHub PAT + the D1 Supabase vault token; confirm Oct-9 token revoked.
- Next 3 safe actions: (1) open Stage-0 Draft PR + independent review + exact-head CI; (2) Stage 1: photo-isolation scratch E2E repro, then fix on its own branch; (3) Stage 1b: route/classify auth-gating.
- Recovery/rollback anchor: main `0a4df108`; Stage-0 branch reverts cleanly (filter removals only).
- Links to ledger entries: docs/autonomous/EXECUTION_LEDGER.md (Stage 0 entry); history in docs/autonomous/IMPLEMENTATION_LEDGER.md.
