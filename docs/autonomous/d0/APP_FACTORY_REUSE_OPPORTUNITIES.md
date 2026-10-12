# D0 — App Factory Reuse Opportunities

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Basis:** D-1.1 `APP_FACTORY_CORE_ASSESSMENT.md` (ADOPT 2 · ADAPT 7 · DEFER 8 · REJECT 1). Spot-checks confirm verdicts. **No integration during D0.**

## Verdicts (confirmed)

| Core | Verdict | Maturity | Mawjood gap it fills |
|---|---|---|---|
| `ai-provider-core` | **ADOPT** | Mature (reviewed) | Replaces `_shared/ai.ts` (67 lines: Groq/OpenAI + GPT-5 quirks) |
| `ops-telemetry-core` | **ADOPT** | Mature (reviewed) | Replaces `_shared/log.ts` (76 lines); fills observability gap |
| `ui-core` | **REJECT** | — | Structural: Expo/RN; React-DOM lib unusable |

## ADAPT candidates (prioritized)

| # | Core | Mawjood-side maturity | Note |
|---|---|---|---|
| 1 | rate-limit | **Production** (`_shared/rate-limit.ts` on 8 fns) | Bidirectional: Mawjood's Supabase store is what the core lacks |
| 2 | notification-delivery | Production (`notify` fn) | Converge |
| 3 | i18n | Production (AR/EN, compile-enforced parity) | Usage = maturity evidence; factory side 0 tests |
| 4 | memory | Production (facts store) | Factory side 0 tests |
| 5 | audit-storage | Experimental | Converge with `ops_events` |
| 6 | data-portability | Experimental | Converge with `account-export` |
| 7 | vault-crypto | **Highest risk** (crypto, 0 tests) | **Test-first gate non-negotiable; ADAPT LAST** |

## DEFER / experimental

`theme-engine`, plus 7 more per D-1.1 assessment. Not launch-relevant.

## Blockers (still apply)

- `node:crypto` in 7 cores → edge-functions-only consumption until injection lands
- 0 tests on 5 cores → test gate before ADAPT
- Registry publication state **UNKNOWN**
- Issue #92 open caveat attaches to Stage D reviews

## Mawjood → factory (upstream candidates)

Mawjood has production code the factory lacks:
1. `rate-limit.ts` — Supabase-backed store
2. `governance.ts` — AI-prompt governance (novel)
3. `edge-auth.ts` — trust-boundary helpers

## Recommended sequence (D0.5+)

1. `ai-provider-core` ADOPT → 2. `ops-telemetry-core` ADOPT → 3. rate-limit/notification/i18n/memory ADAPT → 4. audit/data-portability ADAPT → 5. vault-crypto ADAPT LAST → 6. upstream rate-limit-store/governance/edge-auth

**Prerequisite:** App Factory registry auth before any ADOPT/ADAPT work.
