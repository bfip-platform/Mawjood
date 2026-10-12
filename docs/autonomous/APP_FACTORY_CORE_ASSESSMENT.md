# App Factory Reusable-Core Assessment for Mawjood

**Date:** 2026-10-11 · **Mission:** MAWJOOD D-1.1 Workstream 5
**Method:** Read-only. Snapshot = app-factory `main` @ `d5ab9fb426128d7ea76b523fe341acf7e254614b`
(verified via API; tarball pulled 2026-10-11). No code copied, integrated, or modified.
**Status:** ASSESSMENT ONLY — no integration performed or authorized in D-1.1.

## Cross-cutting compatibility

- Mawjood = Expo SDK 57 (React Native + React Native Web) + Supabase
  (Postgres + Deno Edge Functions). All cores except `ui-core` are pure
  TypeScript with zero or one internal runtime dep — no React Native, no DOM,
  no Supabase coupling.
- **7 cores have `node:crypto` in shipped src** (`permissions-core`,
  `files-media-core`, `notifications-core` ×3, `audit-core`,
  `audit-storage-core` ×2, `entitlements-core`). This **breaks in the Expo
  client (Hermes) and Expo Web (Metro)** but is **fine in Supabase Edge
  Functions (Deno supports `node:` specifiers)**. Only `audit-storage-core` /
  `vault-crypto-core` make hashing injectable; the rest hardcode it.
- Consumption would be via private GitHub Packages (`npm.pkg.github.com`).
  Registry publication state could **not** be verified (Packages API → 403);
  where the factory status matrix says SHARED but the package README says
  "publication not yet authorized," publication is flagged UNKNOWN.
- "0 tests" on five cores is a maturity flag even where the factory ledger
  claims integration coverage.

## Recommendations

| Core | Maturity | Expo/RN | Recommendation |
|---|---|---|---|
| identity-core `@bfip-platform/identity-core@1.0.0` | HIGH (published, 2nd consumer BFIP) | ✅ | **DEFER** — Supabase Auth suffices |
| user-management-core `@bfip-platform/user-management-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ✅ | **DEFER** — architectural mismatch |
| permissions-core `@bfip-platform/permissions-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ⚠️ node:crypto | **DEFER** — RLS suffices today |
| memory-core `@bfip-platform/memory-core@1.0.0` | MED (from Mawjood's own code) | ✅ | **ADAPT** — wire MemoryStore to Supabase |
| ai-provider-core `@bfip-platform/ai-provider-core@1.0.0` | HIGH (reviewed, allowlisted) | ✅ | **ADOPT** (edge functions) |
| files-media-core `@bfip-platform/files-media-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ⚠️ node:crypto | **DEFER** |
| notifications-core `@bfip-platform/notifications-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ⚠️ node:crypto | **DEFER** |
| notification-delivery-core `@bfip-platform/notification-delivery-core@1.0.0` | MED-LOW (0 tests; from Mawjood's notify) | ✅ | **ADAPT** — add tests first |
| rate-limit-core `@bfip-platform/rate-limit-core@1.0.0` | MED-LOW (0 tests) | ✅ | **ADAPT** — needs Supabase store |
| audit-core `@bfip-platform/audit-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ⚠️ node:crypto | **ADAPT** — crypto injection needed |
| audit-storage-core `@bfip-platform/audit-storage-core@1.0.0` | LOW (0 tests, merged 2026-10-10) | ⚠️ partial | **DEFER** — immature |
| ops-telemetry-core `@bfip-platform/ops-telemetry-core@1.0.0` | HIGH (reviewed, 4 tests) | ✅ | **ADOPT** (edge functions) |
| entitlements-core `@bfip-platform/entitlements-core@1.0.0` | MED (reviewed; publ. UNKNOWN) | ⚠️ node:crypto | **DEFER** — until Stripe billing |
| i18n-core `@bfip-platform/i18n-core@1.0.0` | MED-LOW (0 tests; from Mawjood's i18n) | ✅ | **ADAPT** — keep hook, add tests |
| ui-core `@bfip-platform/ui-core@1.0.0` | HIGH (published, reviewed) | ❌ React DOM only | **REJECT** — RN incompatible |
| theme-engine-core `@bfip-platform/theme-engine-core@1.0.0` | LOW-MED (review unconfirmed) | ✅ | **DEFER** |
| data-portability-core `@bfip-platform/data-portability-core@1.0.0` | LOW-MED (review unconfirmed) | ✅ | **ADAPT** — wire into account-export/delete |
| vault-crypto-core `@bfip-platform/vault-crypto-core@1.0.0` | MED-LOW (0 tests; from Mawjood's vault-master) | ✅ injectable | **ADAPT** — tests first (crypto core) |

**Tally:** ADOPT 2 · ADAPT 7 · DEFER 8 · REJECT 1.

## Key findings

1. **Four cores are Mawjood's own code, extracted and hardened**
   (memory-core, vault-crypto-core, i18n-core, notification-delivery-core)
   — adoption is convergence, not foreign integration.
2. **The `node:crypto` pattern is the main technical blocker** for
   Expo-client use (7 cores); non-issue in Edge Functions (Deno). Adopt in
   edge functions first; client use needs injectable-hash ADAPT.
3. **Do not adopt 0-test cores without adding tests** (notification-delivery,
   rate-limit, audit-storage, i18n, vault-crypto — crypto = highest concern).
4. **Publication state murky:** matrix claims SHARED, most READMEs say "not
   yet authorized," Packages API 403 — registry UNKNOWN except identity-core
   and ui-core. Private-registry CI auth needed regardless.
5. **Issue #92 (factory security follow-up) remains OPEN** — Stage D reviews
   carry that caveat.
6. **No core replaces Supabase Auth/RLS** — permissions/entitlements/identity
   are vocabulary-independent decision layers needing Mawjood adapters.
7. **Approval implication:** nothing here blocks D-1/D-1.1 approval;
   assessment-only, no integration. The two ADOPT candidates are proposed
   for a future mission, not D-1.1.
