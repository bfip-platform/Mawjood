# D0.5 Workstream 06 — Technical Architecture

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPEC ONLY — planning document. No app code changes, no production migration execution, no deploys. Read-only on code.
**Inputs:** `docs/autonomous/d0/D0_TO_D05_HANDOFF.md` (9 approved decisions) · `ARCHITECTURE_AND_DATA_FLOW.md` · `PERFORMANCE_AND_SCALE_ASSESSMENT.md` · `APP_FACTORY_REUSE_OPPORTUNITIES.md` · `CODEBASE_INVENTORY.md`

## 1. Monorepo structure + module boundaries

### 1.1 Current state

```
mawjood/
├─ apps/mobile/              # Expo (RN + web) app — src/app/index.tsx (6,034 lines), admin.html, screens, hooks, lib
├─ packages/voice-engine/    # Edge-function caller / shared client — src/client.ts (2,420 lines), family.ts, suggest.ts, types.ts
├─ supabase/
│  ├─ functions/             # 22 edge functions + _shared/ (12 modules)
│  ├─ migrations/            # 34 migrations (0001–0034)
│  └─ tests/                 # RLS audit, behavioral authz, auth-gates (CI-enforced)
├─ tests/e2e/                # Playwright smoke + authenticated journeys
├─ .github/workflows/        # 9 CI jobs
└─ docs/                     # Product + autonomous docs
```

### 1.2 Dependency rules (target)

The current layout is sound but boundaries are informal: `apps/mobile` imports `packages/voice-engine`, edge functions live in a flat `supabase/functions/` dir with a shared `_shared/` (12 modules), and `_shared` modules are the de-facto contracts between server paths. Target rules — enforceable by lint + CI, not convention:

| Rule | Rationale |
|---|---|
| `apps/mobile` MAY import `packages/voice-engine` and `packages/*`. MAY NOT import from `supabase/functions/_shared` or any function `index.ts`. | Edge code is server-only (secrets, service_role). The accidental `packages/* → _shared` bridge would leak server logic into the client bundle. |
| `supabase/functions/<fn>` MAY import only from `../_shared/`. Cross-function imports forbidden. | Each function is an independently deployable unit; cross-imports create hidden coupling and deployment drift. |
| `packages/voice-engine` MAY NOT hold secrets or AI-model knowledge. It is a typed transport layer. | Current `client.ts` already embeds `pg_trgm`-relevant search patterns and model-agnostic calls; keep it that way. |
| `_shared/` modules are versioned contracts: `edge-auth.ts` (trust boundary), `ai.ts` (provider config), `rate-limit.ts`, `log.ts`, `governance.ts`, `memory.ts`, `routing.ts`, `shopping.ts`, `tabs.ts`, `time.ts`, `app-brain.ts`. | Any signature change to a `_shared` module must be a minor-version bump in its header + a CI contract test (see §11). |

### 1.3 Planned moves (spec only — no code moved in D0.5)

1. **Split `apps/mobile/src/app/index.tsx`** (6,034 lines — biggest single-file risk in the repo). Target: per-screen modules under `src/screens/` + a thin router. This is a maintainability requirement before the commercial UI work (PWA, SEO, a11y pass in workstream scope) touches that file again.
2. **Split `packages/voice-engine/src/client.ts`** (2,420 lines). Target: `notes.ts`, `items.ts`, `chat.ts`, `media.ts`, `spaces.ts` behind a facade `client.ts` that re-exports the stable public surface. The facade keeps current call sites compiling during a phased split.
3. **Promote `supabase/functions/_shared/` into a real internal package** (`packages/edge-shared/`) with its own typecheck + unit tests, imported by Deno via path mapping. Rationale: `_shared` is currently only tested incidentally; `edge-auth.ts`, `governance.ts`, and `rate-limit.ts` are upstream candidates for the App Factory (see §13) and need a publishable boundary.
4. **`_shared/log.ts` → `ops-telemetry-core` ADOPT** (§13): `log.ts` (76 lines) becomes a thin re-export over the factory core once the ADOPT gate passes. No new direct `ai_events`/`ops_events` inserts outside the telemetry module.

No directory is deleted; every move keeps a compatibility re-export until the next major D1 phase.

## 2. Supabase DB architecture

### 2.1 Table inventory by domain (34 migrations, ~27 RLS-enabled tables)

| Domain | Tables |
|---|---|
| Identity & access | `profiles`, `space_members`, `space_invites`, `spaces`, `space_tabs`, `tab_proposals`, `feature_flags` |
| Memory core | `notes`, `items`, `trash_bin`, `ai_governance`, `ai_governance_audit`, `ai_evals`, `pending_actions`, `memory_feedback` (0023) |
| Family workflows | `shopping_lists`, `borrows`, `watch` (0022), `space_invites`, `family_slots` (0024) |
| Chat | `chat_sessions` (7-day retention — chat history is ephemeral by design, NOT a saved memory; see §2.4) |
| Vault | `vault_master`, `vault_master_decoy` (0027), secret-vault schema objects |
| Commercial | `user_subscriptions`, `subscription_plans`, `subscription_grants`, `promotions` |
| Telemetry | `ai_events`, `ops_events`, `rate_limits` |
| Push | `device_tokens`, `broadcasts` |
| Reminders | columns on `items` (`due_at`, `reminder_sent_at`), `send_due_reminders()` / `send_watch_reminders()` plpgsql |
| Legacy/kind tables | `tasks`, `agenda`, `shopping_archive` (migrated supersets of `items` kinds) |

### 2.2 RLS strategy per table

Baseline (verified D-1): all 27 public tables RLS-enabled; zero `USING(true)` policies; behavioral authz suite passes (37 policies).

**Per-table policy posture:**

- **User-owned rows** (`profiles`, `notes`, `items`, `chat_sessions`, `device_tokens`, `trash_bin`, `vault_master`): `auth.uid() = owner_id` / `user_id` on SELECT/INSERT/UPDATE/DELETE. `device_tokens` additionally needs a per-row scope so a user cannot read another user's tokens for push targeting — currently `user_id = auth.uid()`; keep.
- **Space-scoped rows** (`space_members`, `notes`, `items`, `space_tabs`, `shopping_lists`, `borrows`): membership predicate `exists (select 1 from space_members where space_id = <row>.space_id and user_id = auth.uid())` OR `spaces.owner_id = auth.uid()`. Every new space-scoped table must reuse a single `is_space_member(space_id)` SECURITY DEFINER helper — no ad-hoc subqueries, to keep policy plans index-friendly and auditable.
- **Service-role-locked tables** (`rate_limits`, `ai_events`, `ops_events`): NO direct policies for `authenticated`; all access via SECURITY DEFINER RPC (`bump_rate_limit()`) or the edge telemetry module. This is intentional: the rate limiter must survive a broken telemetry table (fail-open), and telemetry writes must never be user-injectable.
- **Invite flow** (`space_invites`): manager-only SELECT/INSERT; `join-family` validates code server-side (service_role) — client never sees full invite rows. Fixes race with `SELECT FOR UPDATE` on the invite row during redemption (P0 queue item 10).
- **Admin tables** (`broadcasts`, `subscription_plans`, `promotions`, `feature_flags` writes, `ai_governance` writes): service_role only; `admin-*` edge functions authenticate via `x-admin-token` with constant-time compare (P0 queue item 11).

### 2.3 Closing the 8 untested-semantics tables

`SECURITY_AND_PRIVACY_FINDINGS.md` marks RLS semantics as UNTESTED (static audit only) for: **`borrows`, `shopping_lists`, `space_tabs`, `profiles` (peers path), `chat_sessions`, `device_tokens`, `trash_bin`, vault tables**. Closure plan (design/test only in D0.5; behavioral tests in CI):

1. Extend `supabase/tests/authz-behavioral.mjs` with per-table scenario matrices: owner read/write, space-member read (and denied write where applicable), non-member denied, second-tenant denied, service_role allowed.
2. Priority order: `vault_*` (sensitive) → `trash_bin` (deletion semantics) → `device_tokens` (push targeting) → `chat_sessions` → the rest.
3. Each scenario asserts the exact denial: no rows returned AND no error leakage. Success criterion: the 8 tables move from UNTESTED to behavioral-verified in the D-1.1-style matrix; the RLS static audit stays CI-enforced.

### 2.4 Migration strategy (spec only — NO production migration execution)

- **Additive-only:** every future migration uses `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE POLICY` with `DROP POLICY IF EXISTS` first (idempotent, re-runnable — the pattern in 0020/0029). No `DROP TABLE`, no `ALTER COLUMN TYPE` on populated tables, no destructive data rewrites.
- **Backfill pattern:** new non-nullable columns land nullable → edge code writes both → backfill in batches (`WHERE id > last_id LIMIT 1000` loops, throttled) → constraint added in a later migration. Never one-shot `UPDATE` on a full table.
- **Zero-downtime:** index creation uses `CREATE INDEX CONCURRENTLY` (no table lock); policy changes are atomic DDL. All migrations must be verified against a staging clone with production-scale row counts before the owner approves execution.
- **`chat_sessions` 7-day retention** is explicitly NOT a saved-memory deletion: chat history is ephemeral conversation state; saved memories live in `items`/`notes` and are governed by decision #1 (durable, never auto-deleted). Any janitor touching `chat_sessions` must filter by table, never by "old rows" generically.
- **Decision #7 guard:** `memory-consolidate`'s 90-day decay is retired from scheduling; a replacement non-destructive maintenance job (§6) may re-score importance and surface duplicates — it may UPDATE importance, never DELETE.

## 3. Index design (decision #8: design/test only, NOT production execution)

### 3.1 Approved index set

| # | Index | Purpose |
|---|---|---|
| 1 | `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `CREATE INDEX CONCURRENTLY items_title_trgm ON items USING gin (title gin_trgm_ops);` (+ same on `details`) | Replaces `%…%` ILIKE full-space scans in search (`client.ts:2195-2228`, `chat/index.ts:140-145`) |
| 2 | `CREATE INDEX CONCURRENTLY items_note_id_idx ON items (note_id);` | Hot path `client.ts:655,1058,1108,1139,1191,777` — currently unindexed (`0002_items.sql:6-7`) |
| 3 | `CREATE INDEX CONCURRENTLY items_space_kind_idx ON items (space_id, kind);` | Kind-filtered space listings; composite for RLS+filter selectivity |
| 4 | (candidate, test-gated) `notes (space_id, created_at DESC)` | Note timelines |

### 3.2 Verification plan (EXPLAIN ANALYZE, seeded fixture)

1. Build a deterministic seed fixture generator (D1): N spaces × {1k, 10k, 100k} `items` rows with realistic title distributions (AR/EN mix — trigram selectivity differs by script).
2. For each index, run `EXPLAIN (ANALYZE, BUFFERS)` on the exact hot queries from `client.ts`/`chat/index.ts` before and after; require: index-only or index scan, `Buffers: shared hit` dominated, and measured p95 of the hot query < 100ms at 100k rows/space (target §14).
3. Negative checks: write-amplification measured on insert/update throughput; no index on write-hot paths without measurement; `pg_stat_user_indexes` review after soak.
4. Promotion gate: indexes ship to staging first, measured under the k6 plan (§14); production execution needs a separate owner approval per decision #8.

## 4. Edge functions + API contracts

### 4.1 Contract standard (applies to all 22 functions)

- **Inputs:** JSON body, validated at the top of each handler. Unknown fields ignored (never rejected — forward-compat for older app versions). Required-field violations → `400 {error: 'invalid_input', fields: [...]}`.
- **Outputs:** JSON; success envelope `{ok: true, data: {...}}` for new/changed contracts. Existing functions keep their response shapes (client compatibility) — envelope convergence happens at D1 behind versioning.
- **Auth:** Supabase JWT (`edge-auth.ts`); `service_role` confined to server-side system ops; admin fns use `x-admin-token` (constant-time compare, P0-11); cron entry uses `x-cron-secret`. Public surface limited to `classify`, `route` (P0-3: gated with JWT-or-anonymous-token + rate limit), `public-config`.
- **Errors:** `{error: <snake_case code>, message?: <human-safe>, request_id: <uuid>}`. Codes are stable strings clients can switch on: `invalid_input`, `unauthorized`, `forbidden`, `rate_limited`, `quota_exceeded`, `not_found`, `conflict`, `upstream_error`, `internal`. Never leak provider messages, SQL, or stack traces to clients. `request_id` (from `newRequestId()`) joins client reports to `ops_events`.
- **Idempotency:** `extract`, `notify`, and billing webhooks accept `Idempotency-Key` header; server stores key → response hash (TTL 24h) and replays the stored response on retry. Duplicate notes on client retry (D0 MEDIUM #9) is closed by requiring the key on note-creating paths.

### 4.2 Per-function contracts (summary)

| Function | Inputs | Outputs | Auth | Idempotency |
|---|---|---|---|---|
| `chat` | `{space_id, message, session_id?, eval_mode?}` | `{answer, actions[], request_id}` | JWT | no (conversational) |
| `ask` | `{space_id, question}` | `{answer, citations[]}` | JWT | no |
| `extract` | `{transcript, space_id, idempotency_key}` | `{items[], tasks[], memories[]}` | JWT | **key required** |
| `transcribe` | `{audio_ref \| multipart}` | `{transcript, language}` | JWT | key recommended |
| `memory-learn` | `{space_id, facts[]}` | `{saved: n}` | JWT | key per batch |
| `memory-consolidate` | POST empty | `{rescored: n, surfaced: n}` (redesigned, non-destructive per #7) | cron secret | single-flight lock |
| `classify` / `route` | `{text}` | `{intent, route}` | JWT-or-anon + rate limit (P0-3) | no |
| `notify` | `{user_ids[], title, body, data?}` | `{sent: n}` | JWT (sender ∈ space) | **key required** |
| `join-family` | `{code}` | `{space_id}` | JWT | single-use code + row lock |
| `family-members` | `{space_id, action, user_id?}` | `{members[]}` | JWT (manager) | no |
| `account-export` | `{}` | `{export_url (signed, 1h)}` | JWT | no (rate-limited 5/min) |
| `account-delete` | `{confirm: true}` | `{ok}` | JWT + double confirm | single-flight |
| `admin-*` (7) | per-fn | per-fn | admin token | per-fn |
| `public-config` | — | `{flags, limits}` (no secrets) | public | cacheable |
| `report-error` | `{message, stack?, context}` | `{ok}` | JWT (sanitized server-side; PII scrub — current free-text storage is a finding) | no |
| `vault-master` | `{action, code?}` | per-action | JWT | no |

### 4.3 Versioning strategy

URL-path versioning at the edge-function level: new breaking contract → new function name suffix (`chat-v2`) or a `v` field in the request; old function stays deployed until the minimum supported app version passes. `public-config` advertises `min_supported_build` and per-endpoint deprecation dates. No silent breaking changes — the app must never 500 because the server moved.

## 5. AI provider abstraction + model routing

### 5.1 Current state

`supabase/functions/_shared/ai.ts` (67 lines): selects provider from env — OpenAI (GPT-5-mini chat, GPT-5 quirks: no temperature, `max_completion_tokens`) when `OPENAI_API_KEY` set, else Groq free (`openai/gpt-oss-120b` chat, whisper-large-v3-turbo transcription; `qwen3.8-27b` vision). Transcription stays on Groq whisper while `GROQ_API_KEY` exists; falls back to `gpt-4o-mini-transcribe`.

### 5.2 ai-provider-core ADOPT (decision #9) — the three gates spelled out

Adoption is approved **only after** all three gates pass; assessment in D0.5, integration after:

- **Gate A — Compatibility:** the core must reproduce both provider paths exactly: Groq free path (gpt-oss-120b, whisper-large-v3-turbo, temperature supported, `max_tokens`) AND OpenAI path (gpt-5-mini, temperature omitted, `max_completion_tokens`, `gpt-4o-mini` vision, `gpt-4o-mini-transcribe` fallback). A compatibility matrix test runs every current `_shared/ai.ts` behavior against the core; any divergence = gate failed.
- **Gate B — Security review:** dependency audit of the core (fresh `npm audit` — sandbox-blocked in D0, must run), secret handling (keys via env only, never logged — the core must satisfy the `log.ts` hard rule: no message content/transcripts/secrets in any log path), and review of its retry/backoff code for amplification abuse.
- **Gate C — Regression verification:** the 5 AI-path edge functions (chat, extract, memory-learn, ask, transcribe) run their new integration tests (§11) against BOTH `_shared/ai.ts` and the core with a mock provider; outputs must be byte-equivalent on the contract surface. `node:crypto` constraint: edge-functions-only consumption until the factory lands the injection (blocker from D0 reuse doc).

### 5.3 Model routing table (target)

| Task | Primary | Fallback | Notes |
|---|---|---|---|
| Transcription | Groq whisper-large-v3-turbo (free) | OpenAI gpt-4o-mini-transcribe | Audio deleted post-transcription (user policy) |
| Chat / ReAct | OpenAI gpt-5-mini | Groq openai/gpt-oss-120b | ≤5 steps; per-user daily token budget (P0-4) |
| Extract | gpt-5-mini | gpt-oss-120b | Idempotency key required |
| Memory-learn | gpt-5-mini | gpt-oss-120b | Facts only; no auto-delete paths |
| Vision (note photos) | gpt-4o-mini | Groq qwen3.8-27b | Photo escalation finding fixed separately (P0-2) |
| Fast-path classify | regex/local first, AI only on miss | — | Keeps p95 < 1.5s without model calls |

### 5.4 Failover policy

Failover is per-request, not per-user: on provider HTTP 429/5xx/timeout, one failover attempt to the fallback model with jittered backoff (§6). Failover events are logged to `ai_events` with `error: 'failover'`. If BOTH providers fail, the function returns `upstream_error` with `retry_after_hint` — never a fabricated answer. Cost guard: failover to a paid model counts against the user's daily AI budget (P0-4); budget exhaustion returns `quota_exceeded`, never silent degradation to a weaker model mid-conversation.

## 6. Background jobs / queues / retries / idempotency

### 6.1 pg_cron inventory (current)

| Job | Schedule | Function | Notes |
|---|---|---|---|
| `mawjood-due-reminders` | every 15 min | `public.send_due_reminders()` | idempotent via `reminder_sent_at`; re-arm trigger on due-date change |
| `mawjood-watch-reminders` | every 15 min | `public.send_watch_reminders()` | same pattern |
| `memory-consolidate` | **none** (documented "nightly", no schedule/callers — D0 gap) | edge fn via `x-cron-secret` | RETIRED as destructive; see 6.2 |

Reminder scans re-scan a growing candidate set (D0 MEDIUM #8): mitigate with the partial index `items_reminder_idx` (already in 0020) and a `checked` watermark table if scan cost exceeds budget at 100k items — measured in the benchmark plan, not assumed.

### 6.2 Non-destructive maintenance job (replaces consolidate — decision #7)

New job `mawjood-memory-maintenance` (weekly, cron-secret, single-flight advisory lock): for each space, (a) re-scores `items.importance` from recency/usage signals (UPDATE only), (b) detects near-duplicate memories via pg_trgm similarity and writes candidates to a per-user `pending_actions` row ("these look like duplicates — merge?") for EXPLICIT user action, (c) emits `ops_events` metrics. **It never DELETEs, never decays by age, never touches `trash_bin`.** The 90-day decay and 200-fact `pruneFacts` cap are redesigned per decision #1: quota overflow blocks new saves with a user-facing choice (upgrade / archive-to-trash / explicit delete) — never silent deletion.

### 6.3 Retry policy

Current state (D0 CONFIRMED): Groq 429 "backoff" is a single fixed 1.5s retry — not exponential. Specified fix:

- Provider calls: exponential backoff with jitter — 1s → 2s → 4s → 8s (max 4 attempts), full jitter, only on retryable classes (429, 502/503/504, timeout). 4xx (except 429) never retried.
- pg_net push calls in `send_due_reminders()`: same schedule; per-message failure recorded (`error_count`) without aborting the batch.
- Client (`voice-engine`): network retry only for idempotent GETs; all mutating retries MUST carry the `Idempotency-Key` (§4.1).

### 6.4 Idempotency keys

`extract`, `notify`, and billing webhooks (Stripe — workstream commercial design) require `Idempotency-Key`. Server table `idempotency_keys(key pk, fn, user_id, response jsonb, created_at)`; replay returns the stored response with `replayed: true`; 24h TTL; janitor-eligible (telemetry-adjacent, NOT user memories). `account-delete` and `join-family` use single-flight locks (advisory lock / `SELECT FOR UPDATE`) instead of keys.

## 7. Storage / file security / signed URLs

### 7.1 Current posture (0029_private_storage)

Buckets `voice-notes` and `item-photos` are private. `voice-notes`: owner-prefix SELECT (`storage.foldername(name)[1] = auth.uid()`). `item-photos`: owner-prefix OR space-member-via-note read (SECURITY DEFINER policy joining `notes.photo_url`). Client displays via signed URLs (`engine.signedPhotoUrl`); public URLs no longer work.

### 7.2 Path conventions

`${userId}/<uuid>.<ext>` at the bucket root — the first path segment is ALWAYS the owner's `auth.uid()`, enforced by policy. No user-controlled path segments below the uuid; content-addressed filenames (`<sha256>.<ext>`) optional for dedup. Voice audio objects are deleted after transcription (user policy "بنمسح الصوت") — the delete path is part of the transcribe contract, with a reconciliation sweep (see 7.4) for orphans.

### 7.3 Signed URL design

- **Expiry:** photos 60 min; export bundles 60 min; any URL embedded in a push/email 24h max. Rotation: client-side `signedUrlCache` (in-memory, existing) refreshes on 401/expiry; cache is bounded (LRU, 200 entries) — current cache is unbounded (D0 MEDIUM caveat).
- **Revocation:** on `account-delete` and vault-lock events, revoke by deleting the underlying objects (signed URLs die with the object) AND rotating the bucket's service key only as a last resort (invalidates ALL URLs — runbooked, owner-approved).
- **Ties to workstream 4 (security):** the photo-URL validation + `can_read_photo` hardening (P0-2) sits on this path; signed-URL issuance must re-check space membership at issue time, not just at upload.

### 7.4 Orphan sweep (non-destructive)

A weekly job lists `storage.objects` with no referencing `notes.photo_url`/`items` attachment older than 7 days and moves them to a `quarantine/` prefix for 30 days before deletion — orphan cleanup NEVER deletes user-referenced objects, and the quarantine window mirrors the 30-day trash rule (decision #6).

## 8. Telemetry retention janitor design (decision #8: design/test only)

### 8.1 Scope and hard boundary

Tables: `rate_limits`, `ai_events`, `ops_events`, `idempotency_keys`. **The janitor NEVER touches `notes`, `items`, `trash_bin`, `chat_sessions`, vault tables, or any user-content table.** This is enforced structurally: the janitor function takes an allowlist of table names as a constant; any other table = hard error. Per decision #8, production execution needs separate owner approval; D0.5 covers design + staging tests only.

### 8.2 Growth bounds

| Table | Retention | Bound rationale |
|---|---|---|
| `rate_limits` | 7 days | Windows are minute/hour; >2h rows are dead weight (opportunistic cleanup already in `checkRateLimit`) |
| `ai_events` | 90 days | Cost accounting for quota sizing (decision #2 evidence); aggregate to monthly rollups before purge |
| `ops_events` | 90 days | Incident forensics window |
| `idempotency_keys` | 24 hours | Replay window only |

### 8.3 Design

Weekly pg_cron job `mawjood-telemetry-janitor`: `DELETE FROM <table> WHERE created_at < now() - <retention>` in batches of 5,000 with `LIMIT`, committing per batch (no long transactions), emitting `ops_events{kind:'janitor', ok, deleted: n, table}` per table. Dry-run mode (`dry_run=true`) reports counts without deleting — the staging test asserts dry-run counts match expectations before any real run. Pre-delete: `ai_events` monthly aggregates (`sum(tokens) by user_id, model`) are materialized into a rollup table so quota sizing (decision #2) survives the purge.

## 9. Observability / logging / analytics / alerts

### 9.1 Current state and target

Current: `_shared/log.ts` (76 lines) writes `ai_events`/`ops_events` via service_role; fire-and-forget; hard rule "never log message content, transcripts, note text, or secrets". Gaps (D0): no Sentry, no uptime checks, no alerts, no analytics, `ops_events` has no owner.

### 9.2 Design

- **Sentry:** client (Expo) + edge functions. Edge: wrap each handler; send only `request_id`, error class, and sanitized context — the `log.ts` hard rule extends to Sentry (PII scrub on `report-error` payloads; the current free-text storage is a finding to fix). Release tracking keyed to deployed function version.
- **`ops-telemetry-core` ADOPT:** replaces `_shared/log.ts` with a thin adapter; owns the `ops_events` schema, retention interface (§8), and the "never user content" invariant as a tested property. Sequenced right after `ai-provider-core` (§13).
- **Privacy-respecting analytics:** event-based, no content: `chat_turn`, `note_created`, `photo_attached`, `invite_redeemed` with counts only. No third-party tracker SDKs in the app until the Privacy Policy (decision #5, P0-5) covers them. Funnel metrics derive from `ops_events`, not from client-side surveillance.
- **Uptime checks:** synthetic probes every 5 min against `public-config` (edge reachable), `chat` fast-path (p95 budget), and a DB liveness RPC. Alert routing: page (SMS/push) on edge 5xx > 1% over 10 min or DB unreachable; ticket-level on p95 breaches.
- **`ops_events` ownership:** the telemetry module owns the table; a documented `kind` taxonomy (`janitor`, `failover`, `quota`, `auth`, `deploy`, `cron`) with per-kind retention (inherits the 90-day bound). Dashboard: daily digest of error classes by function from `ai_events`/`ops_events` — this is the "digest" the coordinator's task list referenced: a reporting view, not a new data pipeline.

## 10. Caching / offline-read / sync

### 10.1 Current caches

In-memory only: `remoteConfig` (public-config) and `signedUrlCache` (photos). Both unbounded and process-local — lost on restart, no cross-tab coherence. No offline support (D0: "offline — absent").

### 10.2 Target design

- **Bounded caches:** LRU with explicit caps (config 500 entries / signed URLs 200 entries), TTLs (config 15 min, signed URLs until 10 min before expiry), and stampede protection (single-flight fetch per key). Cache keys namespaced by `user_id` — never cross-user.
- **Offline read cache:** SQLite (Expo) mirror of the user's spaces/notes/items metadata (titles, kinds, timestamps — full bodies on demand). Read path serves cache when network is unavailable; a visible "offline" banner marks staleness. Explicitly NOT a second source of truth: server wins on conflict.
- **Queue-and-sync:** mutations made offline go to an outbox table (op id = client UUID, `Idempotency-Key` derived from it) and sync in order on reconnect. Server applies idempotently (§6.4); client reconciles by op id.
- **Conflict resolution:** last-writer-wins with vector `updated_at` + client op id; on conflict the server keeps both versions and surfaces a `pending_actions` merge candidate (consistent with the non-destructive maintenance philosophy, decision #7) — never silent overwrite of user data.
- **Realtime:** keep Supabase Realtime for invalidation signals (row changed → refetch), not as the data transport; the current whole-list refetch per change (D0 MEDIUM #7) is replaced by targeted invalidation by `space_id` + `kind`.

## 11. Testing architecture + CI/CD

### 11.1 Closing the AI-E2E gap (D0 headline)

Current: zero automated coverage on AI paths (chat ReAct, extract, memory-learn, ask, transcribe) — "implemented" rests on code inspection + manual verification. Closure plan:

1. **Edge-function integration tests** (new suite, Deno): each AI-path handler runs against a **mock AI provider** implementing the same interface as `_shared/ai.ts` (deterministic scripted responses: fixed transcripts, fixed extract JSON, scripted ReAct tool calls). Tests assert contract shapes (§4), DB writes, idempotency replay, rate-limit and quota behavior, and the no-content-in-logs invariant.
2. **Compatibility harness for Gate C:** the same tests run twice — once against `_shared/ai.ts`, once against `ai-provider-core` — with output equivalence asserted.
3. **Contract tests per API:** every function in §4.2 gets a contract test (inputs → outputs → error codes) run in CI against the deployed preview functions.
4. **E2E AI journeys:** Playwright suite extended with a sandboxed AI key (or mock edge) covering: voice note → transcript → extract → items visible; chat turn → answer + saved fact; family invite → join → shared item visible. These run on preview deploys, not on every PR (cost/time), but block release.

### 11.2 CI/CD (keep the 9 jobs)

Keep: `ci`, `secret-scan`, `vuln-scan`, `rls-audit`, `auth-gates`, `e2e-smoke`, `e2e-auth`, `standards`, `provenance`. Add: `edge-integration` (mock-provider suite), `contract-tests` (preview), `benchmark-smoke` (seeded EXPLAIN ANALYZE assertions). The `standards` gate (ENGINEERING_STANDARDS.md) stays review-enforced; benchmark budgets graduate from guideline to CI assertion once the harness exists (D1).

### 11.3 Deployment pipeline

`preview → staging → prod`. Every PR gets a preview Supabase project (migrations applied, seeded fixture). `staging` mirrors prod config (RLS, cron jobs active, AI keys sandboxed). Prod deploys are owner-approved, migration-gated (additive-only checklist §2.4), with automatic rollback on uptime-probe failure. Edge functions deploy with version tags; `public-config` advertises the live version for client compatibility checks.

## 12. Backup / restore / DR / deployment

- **Backup:** Supabase Point-In-Time Recovery (PITR) enabled on prod; daily logical backup to owner-controlled storage (encrypted at rest) with 30-day retention. Backup scope includes `storage.objects` metadata + bucket contents (voice notes already deleted post-transcription; photos and exports are the payload).
- **Verification:** monthly automated restore to an ephemeral project; assert row counts per domain table, RLS policies present, and a login + note-read smoke test. A backup that has never been restored is not a backup — the restore drill is a recurring ops task with an `ops_events` record.
- **Restore runbook:** (1) declare incident, freeze writes (maintenance flag in `public-config`); (2) restore to PITR target; (3) verify RLS + auth; (4) replay `idempotency_keys`-era writes from client outboxes where applicable; (5) lift freeze; (6) post-incident `ops_events` + user notice if data loss window > 0. RTO target 4h, RPO target 15 min — **proposed, to be validated against the first restore drill**, not claimed.
- **DR:** Supabase managed failover is the primary story; the runbook additionally covers provider outage (Groq/OpenAI down → failover policy §5.4 degrades to the surviving provider; both down → `upstream_error` with user messaging, no fabricated answers).

## 13. App Factory reuse + integration boundaries

### 13.1 ADOPT sequence (gated)

1. **`ai-provider-core` ADOPT** — Gates A/B/C in §5.2. Replaces `_shared/ai.ts`. Edge-functions-only consumption (the `node:crypto` blocker) until the factory lands the injection.
2. **`ops-telemetry-core` ADOPT** — after #1. Replaces `_shared/log.ts`; owns `ops_events` taxonomy and the no-content invariant as a tested property.

Prerequisite for both: **App Factory registry auth** (D0 blocker — still UNKNOWN publication state; no ADOPT work starts until resolved). Issue #92 open caveat attaches to any Stage-D review of factory code.

### 13.2 ADAPT sequence

3. rate-limit ⇄ notification-delivery ⇄ i18n ⇄ memory — bidirectional convergence; Mawjood's side is production (rate-limit.ts on 8 fns, notify fn, AR/EN compile-enforced parity, facts store) while the factory side has 0 tests on 5 cores — the test gate applies to the factory side before any ADAPT.
4. audit-storage ⇄ `ops_events`; data-portability ⇄ `account-export`.
5. **vault-crypto ADAPT LAST** — test-first gate non-negotiable (crypto, 0 factory tests); vault data-flow diagram required before integration (§1 of ARCHITECTURE gaps).

### 13.3 Mawjood → factory (upstream candidates)

Mawjood contributes production code the factory lacks: (1) `rate-limit.ts` Supabase-backed store (the core's missing piece), (2) `governance.ts` AI-prompt governance (novel), (3) `edge-auth.ts` trust-boundary helpers. Upstreaming is proposed as factory PRs after the ADOPT sequence, with Mawjood's behavioral tests as the acceptance bar.

### 13.4 Integration boundaries

Factory cores are consumed as versioned dependencies behind the `_shared` adapter layer (§1.3) — never vendored by copy-paste. If a core fails its gate, Mawjood keeps the in-repo implementation; the adapter interface stays stable so a later retry is cheap. `ui-core` stays REJECTED (Expo/RN vs React-DOM structural mismatch).

## 14. Performance / reliability targets

| Metric | Target | Evidence status |
|---|---|---|
| Chat fast-path p95 | < 1.5s | **unmeasured** — benchmark plan D1 |
| AI chat p95 | < 8s | **unmeasured** |
| DB hot-query p95 | < 100ms | **unmeasured** — EXPLAIN ANALYZE plan §3.2 |
| AI cost | < $0.50 / MAU / mo | **unmeasured** — needs `ai_events` aggregation (§8.3 rollup) + per-user caps (P0-4) |
| Connection errors | zero | **unmeasured** — soak test in plan |

Readiness statement (carried from D0, unchanged): the architecture plausibly serves hundreds of active users (managed Supabase, RLS-indexed hot paths mostly covered after §3). **Millions of users is not demonstrated** — do not claim it. Benchmark plan (D1): seeded EXPLAIN ANALYZE at 1k/10k/100k rows per space → k6 on chat/extract at 50–100 VUs → cost accounting from `ai_events` → connection soak → realtime fan-out test → client bundle/boot budgets. The `ENGINEERING_STANDARDS.md` §7 budgets graduate from review guidelines to CI assertions only after the harness lands.

## 15. Open technical decisions

1. **Quota numerics (decision #2):** D0.5 proposes evidence-based Free/Plus creation + storage limits from `ai_events` cost data and storage measurements — owner approves the numbers. This workstream does not invent them.
2. **Fail-closed vs fail-open for rate limiting:** current `checkRateLimit` fails open (broken telemetry never takes chat offline). Confirm this stays for availability, with alerting on the failure — owner/architect call.
3. **Realtime vs polling for sync invalidation** (§10): Realtime fan-out cost at scale is unmeasured; the fan-out test decides.
4. **`classify`/`route` public gating (P0-3):** anonymous-token vs JWT-only — product call with abuse-modeling input.
5. **PITR RTO/RPO targets** (§12): proposed 4h/15min — validate against the first restore drill.
6. **Edge runtime for factory cores:** `node:crypto`-in-7-cores blocker — accept edge-only consumption, or wait for the factory injection? Blocks the ADOPT timeline.
7. **Registry auth + publication state** (§13.1): UNKNOWN — prerequisite for all ADOPT/ADAPT work.
8. **`index.tsx` / `client.ts` split strategy** (§1.3): big-bang split vs phased facade — affects every concurrent workstream touching those files.
9. **Chat history vs saved memory boundary** (§2.4): `chat_sessions` 7-day retention confirmed as ephemeral state; confirm no product surface treats it as durable memory.
10. **Analytics vendor choice** (§9.2): no third-party SDKs until the Privacy Policy (P0-5) covers them — policy first, then vendor.
