# D0 — Feature Status Matrix

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`

**Status key:** ✅ Implemented+verified · ⚠️ Insufficiently tested · 🔶 Partial · 📋 Planned only · ❌ Missing · 🔴 Broken/unsafe

## Authentication & accounts

| Feature | Status | Evidence |
|---|---|---|
| Magic-link auth | ✅ | `AuthScreen.tsx`, e2e test 1 passes |
| Anonymous trial + upgrade | ⚠️ | `index.tsx:627`, upgrade banner is dead code (no UI entry) |
| Profiles | ✅ | `0010_profiles.sql`, RLS verified |
| Email change | ❌ | No handler found |
| Account deactivation | ❌ | Only full delete exists |
| Account delete (cascade) | ⚠️ | `account-delete` fn; no tests |

## Memories & notes

| Feature | Status | Evidence |
|---|---|---|
| Voice notes + transcription | ✅ | `transcribe` fn (Groq Whisper); audio deleted post-transcription per policy |
| Text notes | ✅ | `notes` table, RLS verified |
| AI extraction (tasks/items) | ✅ | `extract` fn; e2e-covered |
| Memory facts store | 🔴 | `memory-consolidate` deletes (see MEMORY_RETENTION_AUDIT.md) |
| Search | ⚠️ | `%…%` ILIKE, no index; works but unscalable |
| Photos | ⚠️ | Stored; photo_url validation gap (see SECURITY) |
| Export (GDPR) | ⚠️ | `account-export` fn; no tests |
| Trash + retention tiers | ⚠️ | Implemented; `trash_retention_days` default flip pending |

## Family

| Feature | Status | Evidence |
|---|---|---|
| Family spaces | ✅ | RLS verified, behavioral tests pass |
| Invites (code, 7d, 10 uses) | ⚠️ | `join-family`; used_count race (MEDIUM) |
| Member removal (churn-safe) | ✅ | No cascade; behavioral test 6 |
| Permissions (manager/member) | ✅ | `space_members` RLS |

## AI

| Feature | Status | Evidence |
|---|---|---|
| Chat (ReAct, 5 steps) | ⚠️ | `chat` fn; code + manual verification only — **zero automated E2E** (see CODEBASE_INVENTORY reconciliation) |
| Governed structural actions | ⚠️ | Double approval; `admin-ai-governance`; no automated tests of the approval flow |
| Memory retrieval | ⚠️ | `memory-learn`, `ask` fns; no automated tests |
| Prompt-injection mitigation | ⚠️ | Single-user self-injection residual; destructive ops have multi-approval |
| AI cost quotas | ❌ | No per-tier quotas (HIGH finding) |

## Tasks, reminders, belongings

| Feature | Status | Evidence |
|---|---|---|
| Tasks / reminders | ⚠️ | pg_cron 15-min; no tests |
| Shopping lists | ⚠️ | Works; RLS static-only |
| Agenda | ⚠️ | Works; no tests |
| Borrowing tracking | ⚠️ | Works; RLS static-only |
| Expenses | ⚠️ | Implemented; no tests |
| Morning digest | ⚠️ | Implemented; no tests |

## Privacy & data

| Feature | Status | Evidence |
|---|---|---|
| RLS isolation | ✅ | 27 tables, 0 `USING(true)`, behavioral tests |
| Vault (secret tabs) | ⚠️ | bcrypt codes, decoy vaults; 0 tests; paid-gate is code comment |
| Export / delete | ⚠️ | Fns exist; no tests |
| Terms / Privacy / consent | ❌ | Zero legal docs in repo |

## Billing & entitlements

| Feature | Status | Evidence |
|---|---|---|
| Stripe | ❌ | Zero integration; parked comments only |
| Manual grants | ✅ | `admin-subscribe`, `admin-set-limits` |
| Entitlement checks | 🔶 | Fragmented, fail-open; no AI/storage quotas |
| Subscription UI | 🔶 | Dead "soon" items; promises payment that doesn't exist |

## Admin & ops

| Feature | Status | Evidence |
|---|---|---|
| Admin console | ✅ | `admin.html` 1,286 lines; bans, grants, plans, promos, governance |
| AI governance page | ✅ | `admin-ai-governance` fn (D-1) |
| Monitoring / alerts | ❌ | No Sentry, analytics, uptime |
| Support channel | ❌ | No in-app help/FAQ/contact |

## Platform

| Feature | Status | Evidence |
|---|---|---|
| i18n (AR/EN) | ✅ | Compile-enforced parity |
| Web (Expo export) | 🔶 | Works; no SEO/PWA/deep-links; stretched phone UI |
| iOS / Android | ✅ | Expo; TestFlight path exists |
| Offline | ❌ | No NetInfo; every write assumes live Supabase |
| Accessibility | 🔶 | ~17 labels in 6k-line screen; zero accessibilityRole |
