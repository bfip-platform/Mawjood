# D9 — Codex gate package & final program report

Charter D9: hand the exact release-candidate SHA to an independent Codex reviewer under `docs/autonomous/MAWJOOD_CODEX_SECURITY_ARCHITECTURE_SCALE_GATE.md`; address findings via repair + re-review until gates pass; produce the final report. **Final production launch requires explicit owner approval** — nothing here grants it.

## 1. Release-candidate SHA — FIXED (amended 2026-10-13, final)

**The RC is `7f4bad04cbc208adc06b80d643f190ae515e30c6`** — current `main`: PR #36's merge (`0cd7546e`, 2026-10-12) plus the launch-readiness integration **PR #42** (PRs #37–#41 combined, owner-merged) plus **PR #43** (F-LAUNCH-01 Option B remediation, migration 0046, owner-approved and merged). **Run the gate at this exact SHA.** The findings format and protocol in §3 are unchanged.

## 2. Final program report

**Completed (code, each with independent review + exact-head CI 9/9):**

- **Stage 0 / PR #16** — stale `notes.deleted_at` filters fixed (schema-drift class).
- **Roadmap D2 security (P0) / PRs #17–#20** — photo cross-user isolation (0038+0039, behaviorally proven), route/classify auth, fail-closed AI spend cap, hardening set (constant-time secrets, atomic invite claim 0040, telemetry sanitizer, backoff).
- **Charter D2 durable memory / PR #21** — auditable dedup + preview-only merge rail (0041), consolidate dry-run + run reports, client trash-not-delete.
- **Bugfix / PR #22** — `items.updated_at` schema drift (0042), scratch-proven.
- **D3 reliability / PRs #23–#24** — trigram indexes (0043; items search 342ms→2.5ms @100k scratch), telemetry janitor (allowlist, double-gated), idempotent createItem, offline outbox layer, benchmark harness.
- **D4 commercial design / PRs #25–#26** — Stripe architecture (owner-gated activation), fail-closed entitlements (vault gate OFF, tested), quota options paper, legal drafts (not legal advice), account lifecycle; demo UI gated to dev builds.
- **D5 UX & web / PRs #27–#29** — PWA/SEO foundations (export-verified), fail-closed deep links, wide-web responsive column, a11y pass, in-app support.
- **D6 AI/memory product / PRs #30–#32** — AI-E2E harness + 25-payload injection regression pack (caught and fixed a real confirmation-parser hole), trigram relevance ranking, maintenance surfacing (read-only scan → chat rails).
- **D7 gate evidence / PR #33** — F-AF-05 resolved (registry state proven); ADOPTs blocked on owner publication (see Deferred).
- **D8 launch readiness / PR #34** — incident runbook, DR drill EXECUTED on scratch (checksum-identical restore), launch-gate evidence sheet, owner-action checklist.
- **Launch-readiness delta / PRs #37–#41 (integrated as PR #42)** — LOW findings closure, 18+ enforcement (0045), offline wiring, a11y completion (156-control audit), launch docs; each independently reviewed + CI 9/9; the integration itself was reviewed (one combination-only hooks-marker defect found and fixed in-branch).
- **F-LAUNCH-01 remediation / PR #43** — migration 0046: items + shopping_lists policy splits (no client DELETE), `hard_delete_items`/`hard_delete_shopping_list` SECURITY DEFINER RPCs as the only client deletion paths; behavioral proof 20/20 on real PostgreSQL incl. rollback; security review FAIL→fix→delta PASS (the lists SELECT-policy catch).

**Tests & load evidence:** unit suites 79–83 tests per branch (combining on merge), every PR's CI 9/9 at its exact head; scratch benchmarks (100,001 items / 20,001 notes) for indexes; DR drill timings; the D6 deterministic harness runs in CI permanently. Load evidence beyond scratch benchmarks (sustained ramps, p95/p99) is Codex-gate scope — not claimed here.

**Architecture & cloud ownership (summary for the gate):** Expo/React-Native client (single-route chat-first app) + voice-engine package; Supabase (Postgres + RLS, storage, 20+ edge functions in Deno) — production project `mwjzosfrxwxcrzcsiear` (us-east-2), owner-held; AI providers OpenAI (gpt-5-mini chat, gpt-4o-mini vision/transcribe fallback) + Groq (whisper, gpt-oss-120b) with keys in Supabase secrets (owner-held); GitHub (bfip-platform org) for code/CI/Pages trial.

**AI costs (corrected by the owner audit, PR #36):** PR #19's original events-sum cap was found defective (5,000-event truncation) and replaced by an atomic per-user daily ledger (migration 0044, `try_charge_ai_spend`): authorize+charge is one DB operation, every model seam charges per attempt measured in UTF-8 bytes plus the call's enforced max_tokens, priced at a fallback rate DERIVED as the component-wise maximum of the provider rate table (gpt-5-mini 0.25/2.00, gpt-4o-mini 0.15/0.60, gpt-oss-120b 0.15/0.75, qwen3.8-27b 0.80/4.00 per 1M). The ledger total can never exceed the cap (provisional $2/day default, `AI_SPEND_CAP_OFF=1` kill switch); containment of actual provider billing is conditional on provider formulas/rates holding, with a daily reconciliation control specified in the findings register. Plan-level cost modeling awaits OD-01/02.

**Deferred (explicitly, with owners):** App Factory ADOPTs (owner: publish 2 cores + registry read — PR #33); Stripe activation + quota/pricing + legal sign-off (owner/counsel — PR #25); retrieval pinning §6.2 (later stage, telemetry-gated) — offline screen wiring itself was completed post-merge in PR #39; vault-crypto ADAPT (deferral sign-off requested — PR #33); production rollout of migrations 0035→0046 (owner approval — runbook in docs/autonomous/launch/PROD_ROLLOUT_RUNBOOK.md).

**Outstanding decisions:** OD-01/02 (quota/prices), OD-39 (final brand), production schema state, spend-cap default confirmation — all in PR #34's LAUNCH_GATE.md, which is the launch checklist of record. **Program verdict vs the charter's completion criteria: NOT READY for launch** — by design: every code criterion is evidenced, but merges, deployment, production verification, and the decisions above are the owner's, and the Codex gate itself has not run.

## 3. Codex handoff protocol (owner executes)

1. The queue is fully merged — the RC is the `main` SHA fixed in §1 (`7f4bad04…`). If further repair PRs merge before the gate runs, re-fix the RC to the new HEAD and say so in the gate prompt.
2. In ChatGPT (Codex), with the owner's GitHub OAuth link scoped to `bfip-platform/Mawjood` (the standing plan — the link step is the owner's and is still pending), open the gate: *"Review commit `<RC SHA>` under docs/autonomous/MAWJOOD_CODEX_SECURITY_ARCHITECTURE_SCALE_GATE.md. Produce findings in the gate's format."*
3. Findings come back to this program chat → repairs land as new Draft PRs (never direct edits to the RC) → re-review at the new exact SHA → repeat until the gate passes.
4. The Codex verdict at the exact SHA + this report + PR #34's launch gate together form the launch decision package. Launch itself needs the owner's explicit approval.
