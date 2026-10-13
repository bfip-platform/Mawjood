# D7 — App Factory integration: gate evidence & blocker resolution

Stage outcome: **the ADOPTs are blocked at their publication prerequisite — an owner/infra action — and this package is the evidence.** Per the roadmap's own recovery rule, the in-tree `_shared` implementations remain the live code (fallback sanctioned: "old `_shared` kept one stage as fallback"). Nothing in this stage modified Mawjood code.

## 1. F-AF-05 RESOLVED — registry publication state (T-D7-1)

Was: UNKNOWN (BLOCKER). Now established from primary evidence (2026-10-12):

- All 15 factory cores are *configured* for GitHub Packages (`publishConfig.registry = https://npm.pkg.github.com`, access restricted), version 1.0.0.
- Publication happens ONLY via the factory's manual `release.yml` workflow (dispatch inputs require typing `AUTHORIZED` + explicit `PUBLISH`; "Merge/push never publishes").
- **25 release runs exist; 13 packages have successful runs whose `Publish selected package` job succeeded:** std, identity-core, ui-core, entitlements-core, permissions-core, notifications-core, messaging-core, files-media-core, settings-core, workflow-task-core, audit-core, organization-core, user-management-core.
- **The two D7 ADOPT targets have NO release runs at all and are therefore NOT published:** `@bfip-platform/ai-provider-core`, `@bfip-platform/ops-telemetry-core`.
- The Mawjood connector token cannot even list org packages (403 — no `read:packages` scope): registry *read* auth for Mawjood-side consumption is also an owner/infra provisioning item.

**Blocker (owner/infra, roadmap §276 "registry-auth is owner/infra"):** publish the two target cores (factory release workflow, owner-dispatched) + provision a read token if edge-side consumption will pull from the registry. Until then, T-D7-3/T-D7-4 cannot start — consuming an unpublished package would require vendoring/forking, which the factory governance model forbids (consumption is from the registry, not source imports; the roadmap’s review model likewise assumes no fork).

## 2. ai-provider-core — Decision #9 gates, pre-evaluated from source (T-D7-2)

Evaluated against the factory source (`packages/ai-provider-core`, local tree) and Mawjood's `_shared/ai.ts`:

- **Gate A — Compatibility: LIKELY PASS, formal run pending the artifact.** The core models exactly the required surface: capability configs for chat/vision/transcription (`src/types.ts`, `src/config.ts` MODELS + `resolveAiProviderConfig`), and body normalization with the production quirks as TESTED behavior (`src/normalization.test.ts`: GPT-5-class → `max_completion_tokens` + temperature omitted; Groq → `max_tokens` + temperature). Mawjood's current surface (gpt-5-mini chat, gpt-4o-mini vision, whisper-large-v3-turbo / gpt-4o-mini-transcribe fallback, Groq `openai/gpt-oss-120b`) maps onto those capabilities. The formal compatibility matrix (every `_shared/ai.ts` behavior replayed against the core) must run against the published package, not a local tree, to count as gate evidence.
- **Gate B — Security review: NOT RUN.** Requires the published artifact's dependency tree; the core's own `guard.ts` (provider allowlist, token-budget assertions) and `security.test.ts` are promising inputs, not a review.
- **Gate C — Regression verification: NOT RUN.** Requires both implementations importable side-by-side in the edge test harness — blocked by the same prerequisite.

**Verdict:** gates cannot be *evidenced* (roadmap exit 1) until publication. No ADOPT PR was opened; opening one now would be theater.

## 3. ops-telemetry-core ADOPT (T-D7-4)

Same blocker (unpublished). Mawjood-side readiness is good: D3 already aligned the in-tree telemetry (`_shared/log.ts` hard rule, the D3 janitor allowlist and Sentry scrubber (on the D3 stage branches, PR #23)), so the eventual ADOPT is an adapter swap, not a redesign.

## 4. Rate-limit convergence (T-D7-5) — assessment, no code change needed

Bidirectional by design and already partially converged: Mawjood's `_shared/rate-limit.ts` (Supabase-backed store) is the piece the factory's rate-limit core lacks (D0 finding) — the convergence direction is Mawjood → factory (an upstream proposal owned by the factory program), while factory-side semantics (window shapes) already match Mawjood's usage on 8 functions. No Mawjood change is required or made; the proposal travels with the factory program, not this repo.

## 5. vault-crypto ADAPT (T-D7-6) — DEFER recommended (owner sign-off requested)

Roadmap exit (3) allows "test-first OR deferred with owner sign-off." Deferral case: (a) the factory vault-crypto core has 0 tests (D0 finding) and crypto is the highest-risk adoption class — test-first would mean writing the factory's test suite from Mawjood's stage, which belongs to the factory program; (b) 7 factory cores import `node:crypto`, restricting consumption to edge functions until the factory's injection work lands, while Mawjood's vault crypto needs are client-side today; (c) Mawjood's current vault surface has no production crypto dependency awaiting this core. **Recommendation: DEFER to a later stage, revisited when the factory core has tests and a published artifact.**

## 6. What unblocks D7 (owner actions)

1. Dispatch factory `release.yml` publishes for `ai-provider-core` and `ops-telemetry-core` @1.0.0 (or say the word and accept standing deferral).
2. Provision registry read access for Mawjood-side consumption (token with `read:packages`) if ADOPTs will pull from GitHub Packages.
3. Sign off the vault-crypto deferral (§5).

On (1)+(2), the ADOPTs proceed as two revertible Draft PRs with the D6 harness green before/after, per the roadmap.
