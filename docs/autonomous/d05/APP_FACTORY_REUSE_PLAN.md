# D0.5 — App Factory Reuse Plan

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPECIFICATION ONLY — planning document. No integration during D0.5. Registry auth prerequisite unresolved.
**Inputs:** `workstream-06-technical.md` §5.2, §13 · D0 `APP_FACTORY_REUSE_OPPORTUNITIES.md` · decision #9

---

## 1. Prerequisite: registry auth (BLOCKER)

**App Factory registry publication state is UNKNOWN; registry auth is unresolved.** No ADOPT or ADAPT work starts until: (a) the registry is reachable with authenticated access, (b) the exact published versions of each core are pinned, (c) Issue #92's open caveat is reviewed against the cores to be consumed. This is a hard prerequisite, not a nice-to-have — unversioned or unauthenticated core consumption is forbidden.

## 2. ADOPT sequence (gated)

### 2.1 ai-provider-core ADOPT (first — decision #9, three gates)

Replaces `supabase/functions/_shared/ai.ts` (67 lines). All three gates must pass with evidence:

- **Gate A — Compatibility:** reproduce both provider paths exactly — Groq free (gpt-oss-120b, whisper-large-v3-turbo, temperature supported, `max_tokens`) AND OpenAI (gpt-5-mini, temperature omitted, `max_completion_tokens`, `gpt-4o-mini` vision, `gpt-4o-mini-transcribe` fallback). Compatibility matrix test runs every current `_shared/ai.ts` behavior against the core; any divergence = gate failed.
- **Gate B — Security review:** fresh dependency audit of the core; secret handling (keys via env only, never logged — must satisfy the `log.ts` hard rule: no message content/transcripts/secrets in any log path); retry/backoff review for amplification abuse.
- **Gate C — Regression verification:** the 5 AI-path edge functions (chat, extract, memory-learn, ask, transcribe) run integration tests against BOTH `_shared/ai.ts` and the core with a mock provider; outputs byte-equivalent on the contract surface.

**Constraint:** edge-functions-only consumption (the `node:crypto`-in-7-cores blocker) until the factory lands the injection.

### 2.2 ops-telemetry-core ADOPT (second)

Replaces `_shared/log.ts` (76 lines) with a thin adapter. The core owns the `ops_events` schema, retention interface, and the no-content invariant as a tested property. Gate: the existing log behavior (fire-and-forget writes, hard rule) reproduced + the `kind` taxonomy supported.

## 3. ADAPT sequence

### 3.1 Bidirectional convergence (Mawjood side is production)

| Core | Mawjood side | Factory side | Gate |
|---|---|---|---|
| rate-limit | Production (`_shared/rate-limit.ts` on 8 fns) | 0 tests on 5 cores | Factory-side test gate before ADAPT |
| notification-delivery | Production (`notify` fn) | experimental | Convergence design review |
| i18n | Production (AR/EN compile-enforced parity) | 0 tests | Factory-side test gate |
| memory | Production (facts store) | 0 tests | Factory-side test gate |

### 3.2 Later ADAPT

- audit-storage ⇄ `ops_events`; data-portability ⇄ `account-export`.
- **vault-crypto ADAPT LAST** — test-first gate non-negotiable (crypto, 0 factory tests); vault data-flow diagram required before integration.

## 4. Integration boundaries

- Factory cores are consumed as **versioned dependencies behind the `_shared` adapter layer** — never vendored by copy-paste.
- If a core fails its gate, Mawjood keeps the in-repo implementation; the adapter interface stays stable so a later retry is cheap.
- `ui-core` stays **REJECTED** (Expo/RN vs React-DOM structural mismatch — confirmed in D0).
- DEFER cores (theme-engine + 7 more): not launch-relevant; revisit post-launch.

## 5. Mawjood → factory (upstream candidates)

Mawjood contributes production code the factory lacks — proposed as factory PRs after the ADOPT sequence, with Mawjood's behavioral tests as the acceptance bar:

1. **`rate-limit.ts` Supabase-backed store** — the core's missing piece (factory rate-limit has no Supabase store).
2. **`governance.ts` AI-prompt governance** — novel; no factory equivalent.
3. **`edge-auth.ts` trust-boundary helpers** — JWT/service_role/admin-token patterns.

## 6. Sequencing summary

```
Registry auth resolved (BLOCKER)
  → ai-provider-core ADOPT (Gates A/B/C)      [D7]
  → ops-telemetry-core ADOPT                  [D7]
  → rate-limit / notification / i18n / memory ADAPT (bidirectional, factory tests first)
  → audit-storage / data-portability ADAPT
  → vault-crypto ADAPT LAST (test-first, data-flow diagram)
  → upstream Mawjood's rate-limit-store / governance / edge-auth
```

## 7. Traceability

| Requirement | Stage | Acceptance test |
|---|---|---|
| Registry auth prerequisite (§1) | Pre-D7 | Authenticated registry access verified |
| ai-provider-core gates (§2.1) | D7 | Gates A/B/C evidenced per gate |
| ops-telemetry ADOPT (§2.2) | D7 | Behavior reproduction tests |
| ADAPT convergence (§3) | D7+ | Factory-side tests green first |
| vault-crypto last (§3.2) | post-D7 | Test-first gate + data-flow diagram |
| Upstream PRs (§5) | post-D7 | Mawjood behavioral tests as bar |

## 8. Open decisions

Registry publication state · `node:crypto` injection timeline (edge-only vs wait) · exact core version pins · Issue #92 caveat review scope.
