# Launch-gate evidence sheet (D8 T-D8-3)

Finding → closing evidence → status. **The agent does not sign the launch gate** (roadmap: "launch gate never self-signed") — this sheet assembles the evidence for the owner's sign-off. Items marked ⛔ are launch-blocking until the owner closes them.

## Security & data protection (D0/D0.5 findings)

| Finding | Closing evidence | Status |
|---|---|---|
| memory-consolidate hard-delete (CRITICAL) | D1 PR #15 + Charter D2 PR #21 (gardener = rescore/flag only; §6.1 exception auditable) | ✅ code-complete, ⛔ not deployed |
| Private-photo cross-user read (HIGH) | PR #17 (migrations 0038+0039; behaviorally proven both directions on scratch) | ✅ code-complete, ⛔ not deployed |
| route/classify public (MEDIUM) | PR #18 (JWT gate + rate limits) | ✅ code-complete, ⛔ not deployed |
| Delete-safety (AI must never delete on assertion) | D1 PR #15 (preview-only rail) + PR #21 (merge on the same rail) + PR #30 (injection corpus; tree-wide trash census) | ✅ code-complete, ⛔ not deployed |
| AI spend abuse (HIGH) | PR #19 (fail-closed daily cap) | ✅ code-complete, ⛔ not deployed; $2/day default is PROVISIONAL (owner to confirm) |
| Hardening set (F-SEC-04..08) | PR #20 (constant-time compares, atomic invite claim 0040, audit logs, telemetry sanitizer, backoff) | ✅ code-complete, ⛔ not deployed |
| `items.updated_at` schema drift (found in D3) | PR #22 (migration 0042, scratch-proven) | ✅ code-complete; ⛔ **prod impact unknown — does prod already have the column out of band? (owner/dashboard check)** |

## Product & reliability

| Item | Evidence | Status |
|---|---|---|
| Search performance | PR #23 (0043 indexes; 342ms→2.5ms @100k on scratch) + PR #31 (relevance ranking) | ✅ code-complete, ⛔ indexes not applied to prod |
| Telemetry hygiene | PR #23 janitor (allowlist, double-gated, dry-run default) | ✅ ready, disabled by design |
| Idempotent writes / offline | PR #24 (client-assigned IDs, 23505-resolve, offline outbox layer) | ✅ engine-ready; screen wiring is a later UX step |
| UX & web | PRs #27/#28/#29 (PWA/SEO/deep-links, responsive, a11y, support) | ✅ code-complete; ⛔ Lighthouse on a deployed build + screen-reader device pass are owner-side |
| AI/memory quality | PR #30 harness (deterministic layer in CI) + live-model protocol | ⚠️ live protocol must be RUN on staging pre-launch (owner-gated keys) |

## Commercial & legal

| Item | Evidence | Status |
|---|---|---|
| Stripe | PR #25 architecture (owner-gated activation checklist) | ⛔ activation = separate owner decision; no keys exist yet |
| Quotas/pricing | PR #25 options A/B/C | ⛔ **OD-01/02 OPEN — owner decision required** |
| Legal (Terms/Privacy/DPA) | PR #25 drafts | ⛔ **counsel review required — drafts are NOT legal advice** |
| 18+ launch | Decision #5 | ⛔ age-gate implementation/verification is a launch task, not yet built |
| Vault paid gate | PR #25 entitlements (`VAULT_PAID_GATE_ENABLED=false`, test-proven) | ✅ correctly OFF until billing |
| Brand finalization (OD-39) | Brand v1.2 baseline is the design floor (PR #27 tokens) | ⚠️ final logo / final hex lock-in / polished screens still open — an owner decision; not code-blocking, but a public launch usually wants it closed |

## Infrastructure & owner-held items

| Item | Status |
|---|---|
| Production migration state (which of 0001–0043 are applied?) | ⛔ UNKNOWN since D0 — owner/dashboard verification; rollout of 0035→0043 needs separate approval |
| Production backup posture (PITR/daily backups) | ⛔ owner confirms plan (see DR_DRILL.md) |
| Supabase Auth redirect URLs allowlist | ⛔ owner sets Site URL (open since Sep 23) |
| App Factory ADOPTs | ⛔ blocked on owner publication (PR #33) — NOT launch-blocking for Mawjood itself (in-tree code is live) |
| Token hygiene | ⛔ revoke the pasted GitHub PAT + the d1-scratch Supabase token (verify Oct-9 token too) |

**Sheet verdict:** engineering evidence is assembled for every code-level item; the launch gate cannot pass until the ⛔ owner items close — above all: merge + deploy the PR queue, resolve the production schema question, decide quotas/pricing, and counsel-sign the legal set.
