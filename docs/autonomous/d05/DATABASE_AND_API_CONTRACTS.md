# D0.5 — Database & API Contracts

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPECIFICATION ONLY — planning document. Migration designs are design-only; NO production migration execution (decision #8).
**Inputs:** `workstream-06-technical.md` §2–§4 · D0 `MEMORY_RETENTION_AUDIT.md` · `SECURITY_AND_PRIVACY_FINDINGS.md` · 9 approved owner decisions

---

## 1. Supabase DB architecture

### 1.1 Table inventory by domain (34 migrations, ~27 RLS-enabled tables)

| Domain | Tables |
|---|---|
| Identity & access | `profiles`, `space_members`, `space_invites`, `spaces`, `space_tabs`, `tab_proposals`, `feature_flags` |
| Memory core | `notes`, `items`, `trash_bin`, `ai_governance`, `ai_governance_audit`, `ai_evals`, `pending_actions`, `memory_feedback` (0023) |
| Family workflows | `shopping_lists`, `borrows`, `watch` (0022), `space_invites`, `family_slots` (0024) |
| Chat | `chat_sessions` (7-day retention — ephemeral conversation state, NOT a saved memory) |
| Vault | `vault_master`, `vault_master_decoy` (0027), secret-vault schema objects |
| Commercial | `user_subscriptions`, `subscription_plans`, `subscription_grants`, `promotions` |
| Telemetry | `ai_events`, `ops_events`, `rate_limits` |
| Push | `device_tokens`, `broadcasts` |
| Reminders | columns on `items` (`due_at`, `reminder_sent_at`), `send_due_reminders()` / `send_watch_reminders()` plpgsql |
| Legacy/kind tables | `tasks`, `agenda`, `shopping_archive` (migrated supersets of `items` kinds) |

### 1.2 RLS strategy per table

Baseline (verified D-1): all 27 public tables RLS-enabled; zero `USING(true)` policies; behavioral authz suite passes (37 policies).

- **User-owned rows** (`profiles`, `notes`, `items`, `chat_sessions`, `device_tokens`, `trash_bin`, `vault_master`): `auth.uid() = owner_id` / `user_id` on SELECT/INSERT/UPDATE/DELETE.
- **Space-scoped rows** (`space_members`, `notes`, `items`, `space_tabs`, `shopping_lists`, `borrows`): membership predicate via a single `is_space_member(space_id)` SECURITY DEFINER helper — no ad-hoc subqueries, keeping policy plans index-friendly and auditable.
- **Service-role-locked tables** (`rate_limits`, `ai_events`, `ops_events`): NO direct policies for `authenticated`; access via SECURITY DEFINER RPC (`bump_rate_limit()`) or the edge telemetry module only. The rate limiter must survive a broken telemetry table (fail-open); telemetry writes must never be user-injectable.
- **Invite flow** (`space_invites`): manager-only SELECT/INSERT; `join-family` validates code server-side (service_role); client never sees full invite rows. Race fixed with `SELECT FOR UPDATE` on the invite row during redemption.
- **Admin tables** (`broadcasts`, `subscription_plans`, `promotions`, `feature_flags` writes, `ai_governance` writes): service_role only; `admin-*` edge functions authenticate via `x-admin-token` with constant-time compare.

### 1.3 Closing the 8 untested-semantics tables

`borrows`, `shopping_lists`, `space_tabs`, `profiles` (peers path), `chat_sessions`, `device_tokens`, `trash_bin`, vault tables — currently static-audit only. Closure: extend `supabase/tests/authz-behavioral.mjs` with per-table scenario matrices (owner read/write, member read/denied-write, non-member denied, second-tenant denied, service_role allowed). Priority: `vault_*` → `trash_bin` → `device_tokens` → `chat_sessions` → rest. Success criterion: all 8 move to behavioral-verified; RLS static audit stays CI-enforced.

### 1.4 Migration strategy (design only — NO production execution)

- **Additive-only:** `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE POLICY` with `DROP POLICY IF EXISTS` first (idempotent, re-runnable). No `DROP TABLE`, no `ALTER COLUMN TYPE` on populated tables, no destructive data rewrites.
- **Backfill pattern:** new non-nullable columns land nullable → edge code writes both → backfill in batches (`WHERE id > last_id LIMIT 1000`, throttled) → constraint added in a later migration. Never one-shot `UPDATE` on a full table.
- **Zero-downtime:** `CREATE INDEX CONCURRENTLY` (no table lock); policy changes are atomic DDL. All migrations verified against a staging clone with production-scale row counts before any owner-approved execution.
- **`chat_sessions` 7-day retention** is explicitly NOT saved-memory deletion: chat history is ephemeral; saved memories live in `items`/`notes` under decision #1 (durable, never auto-deleted). Any janitor touching `chat_sessions` filters by table, never by "old rows" generically.
- **Decision #7 guard:** `memory-consolidate`'s 90-day decay is retired from scheduling; the replacement maintenance job may UPDATE importance, never DELETE.

---

## 2. Full API contract list (22 edge functions)

### 2.1 Contract standard

- **Inputs:** JSON, validated at handler top; unknown fields ignored (forward-compat). Required-field violations → `400 {error: 'invalid_input', fields: [...]}`.
- **Outputs:** JSON; `{ok: true, data: {...}}` envelope for new/changed contracts. Existing shapes preserved (client compatibility); envelope convergence at D1 behind versioning.
- **Auth:** JWT via `edge-auth.ts`; `service_role` server-side only; admin fns `x-admin-token` (constant-time); cron `x-cron-secret`. Public: `classify`, `route` (JWT-or-anon + rate limit), `public-config`.
- **Errors:** `{error: <snake_case>, message?: <human-safe>, request_id: <uuid>}`. Stable codes: `invalid_input`, `unauthorized`, `forbidden`, `rate_limited`, `quota_exceeded`, `not_found`, `conflict`, `upstream_error`, `internal`. Never leak provider messages, SQL, or stacks.
- **Idempotency:** `Idempotency-Key` header on `extract`, `notify`, billing webhooks; server stores key → response hash (24h TTL), replays on retry.

### 2.2 Per-function contracts

| # | Function | Method inputs | Outputs | Auth | Idempotent |
|---|---|---|---|---|---|
| 1 | `chat` | `{space_id, message, session_id?, eval_mode?}` | `{answer, actions[], request_id}` | JWT | — |
| 2 | `ask` | `{space_id, question}` | `{answer, citations[]}` | JWT | — |
| 3 | `extract` | `{transcript, space_id, idempotency_key}` | `{items[], tasks[], memories[]}` | JWT | **key required** |
| 4 | `transcribe` | `{audio_ref \| multipart}` | `{transcript, language}` | JWT | key recommended |
| 5 | `memory-learn` | `{space_id, facts[]}` | `{saved: n}` | JWT | key per batch |
| 6 | `memory-consolidate` | POST empty | `{rescored: n, surfaced: n}` (non-destructive) | cron secret | single-flight lock |
| 7 | `classify` | `{text}` | `{intent, route}` | JWT-or-anon + rate limit | — |
| 8 | `route` | `{text}` | `{intent, route}` | JWT-or-anon + rate limit | — |
| 9 | `notify` | `{user_ids[], title, body, data?}` | `{sent: n}` | JWT (sender ∈ space) | **key required** |
| 10 | `join-family` | `{code}` | `{space_id}` | JWT | single-use code + row lock |
| 11 | `family-members` | `{space_id, action, user_id?}` | `{members[]}` | JWT (manager) | — |
| 12 | `account-export` | `{}` | `{export_url (signed, 1h)}` | JWT | — (rate-limited 5/min) |
| 13 | `account-delete` | `{confirm: true}` | `{ok}` | JWT + double confirm | single-flight |
| 14–20 | `admin-*` (7: broadcast, catalog, limits, stats, subscribe, user, ai-governance) | per-fn | per-fn | admin token | per-fn |
| 21 | `public-config` | — | `{flags, limits}` (no secrets) | public | cacheable |
| 22 | `report-error` | `{message, stack?, context}` | `{ok}` | JWT (PII-scrubbed) | — |
| 23 | `vault-master` | `{action, code?}` | per-action | JWT | — |

### 2.3 Versioning

URL-path versioning: breaking contract → new function suffix (`chat-v2`) or `v` field; old function stays deployed until minimum supported app version passes. `public-config` advertises `min_supported_build` + deprecation dates. No silent breaking changes.

---

## 3. Cascade map (decision #1 enforcement)

| Trigger | Effect | Verdict |
|---|---|---|
| `auth.users` delete | Full CASCADE wipe | Allowed ONLY via user-requested `account-delete` (double-confirmed) |
| `spaces` delete | Cascades notes/items | App-guarded: custom non-empty spaces blocked |
| `space_members` removal | **No cascade** | Churn-safe (behavioral-verified) |
| Billing tables → user data | **No cascades** | Downgrade/cancel never deletes memories |
| Trash purge | Only already-trashed, expired (>30d) rows | Safe; 30-day window per decision #6 |
| `chat_sessions` 7-day sweep | Deletes only `chat_sessions` rows | Ephemeral state; never touches `items`/`notes` |

**Hard rule (decision #1):** no migration, janitor, or edge function may introduce a new cascade or delete path that removes saved memories (`items`/`notes` with user content) without explicit user action. Static tripwire asserts this in CI.

---

## 4. Traceability

| Requirement | Stage | Acceptance test |
|---|---|---|
| RLS per-table posture (§1.2) | D1–D2 | Behavioral matrix per table (CI) |
| 8 untested tables closed (§1.3) | D2 | Authz-behavioral suite extended |
| Additive-only migrations (§1.4) | D1+ | Migration linter in CI |
| API contracts (§2) | D1–D2 | Contract tests per function (CI) |
| Cascade map (§3) | D1 | Tripwire: no new memory-delete paths |

## 5. Open decisions

Quota numerics (decision #2) · `is_space_member()` helper introduction timing · contract envelope convergence schedule · `chat_sessions` retention exact days (7 confirmed as ephemeral — reaffirm).
