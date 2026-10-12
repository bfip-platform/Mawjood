# D0 — Codebase Inventory

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Method:** Read-only source audit. Every entry cites exact paths. No inference from names/comments alone.

## Repository layout

| Path | What | Size signal |
|---|---|---|
| `apps/mobile/` | Expo (React Native) app — iOS, Android, web | `src/app/index.tsx` 6,034 lines; `admin.html` 1,286 lines |
| `packages/voice-engine/` | Edge-function caller / shared client | `src/client.ts` 2,420 lines |
| `supabase/functions/` | 22 edge functions + `_shared/` (12 modules) | See table below |
| `supabase/migrations/` | 34 migrations (0001–0034) | Waves verified per SQL_MIGRATIONS_ASSESSMENT.md |
| `supabase/tests/` | RLS audit, behavioral authz, auth-gates | CI-enforced |
| `tests/e2e/` | Playwright: smoke + authenticated journeys | CI-enforced (9/9 green) |
| `.github/workflows/` | 9 CI jobs | ci, secret-scan, vuln-scan, rls-audit, auth-gates, e2e-smoke, e2e-auth, standards, provenance |
| `scripts/` | `audit-gate.mjs`, `standards-check.mjs` | CI-enforced |
| `docs/` | Product docs, ROADMAP | — |
| `docs/autonomous/` | Governance, ADRs, assessments, ledger | D-1/D-1.1 output |

## Edge functions (22)

| Function | Purpose | Auth |
|---|---|---|
| `chat` | AI chat (ReAct agent, 5 steps) | JWT |
| `ask` | Q&A over memories | JWT |
| `extract` | Transcript → tasks/items/memories | JWT |
| `transcribe` | Groq Whisper transcription | JWT |
| `memory-learn` | Fact extraction to memory store | JWT |
| `memory-consolidate` | Nightly decay + prune (90d / 200-cap) | Cron secret |
| `classify` | Fast-path intent classification | **PUBLIC** (finding) |
| `route` | Regex + AI routing | **PUBLIC** (finding) |
| `notify` | Push notifications | JWT |
| `join-family` | Invite code redemption | JWT |
| `family-members` | Membership management | JWT |
| `account-export` | GDPR export | JWT |
| `account-delete` | Account deletion (cascade) | JWT |
| `admin-*` (7) | Broadcast, catalog, limits, stats, subscribe, user, ai-governance | Admin token |
| `public-config` | Public app config | Public (by design) |
| `report-error` | Client error reports | JWT (stores free-text) |
| `vault-master` | Vault operations | JWT |

## Database (34 migrations, 27 RLS-enabled tables)

Core tables: `spaces`, `space_members`, `space_invites`, `notes`, `items`, `profiles`, `chat_sessions`, `user_subscriptions`, `vaults`, `tasks`, `shopping_lists`, `agenda`, `borrows`, `trash_bin`, `ai_events`, `ops_events`, `rate_limits`, `device_tokens`, plus 9 more. RLS enabled on all 27 public tables; zero `USING(true)` policies (D-1 verified).

## Test coverage

| Suite | Status |
|---|---|
| `supabase/tests/authz-behavioral.mjs` | ✅ 37 policies, all scenarios (D-1.1) |
| RLS static audit | ✅ CI-enforced |
| `tests/e2e/auth-journey.spec.mjs` | ✅ 4/4 journeys (D-1.1) |
| Unit tests | ✅ 33/33 |
| Edge-function handler logic | ❌ **No tests** |
| Vault / export / delete flows | ❌ **No tests** |
| UI rendering | ❌ **No tests** |
| Performance benchmarks | ❌ **None exist** |

## Classification summary

- **Implemented + verified:** 7 (auth, RLS, chat, extract, transcribe, family, admin console)
- **Implemented, insufficiently tested:** 8 (vault, export/delete, notifications, reminders, borrows, shopping, agenda, AI governance)
- **Partially implemented:** 3 (subscriptions — manual only; PWA — absent; offline — absent)
- **Planned/documented only:** 12 (Stripe, SEO, analytics, Sentry, FTS, quotas, support, etc.)
- **Missing:** 6 (Terms/Privacy, age-gate, email-change, deactivation, deep-links, status page)
- **Broken/unsafe:** 1 active (memory-consolidate decay) + 3 D-1.1 carry-overs (documented in findings)

See `FEATURE_STATUS_MATRIX.md` for per-feature detail.
