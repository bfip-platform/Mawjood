# D0.5 — Technical Architecture

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPECIFICATION ONLY — planning document. No application code changes, no production migrations, no deploys.
**Inputs:** `workstream-06-technical.md` · D0 audit docs · 9 approved owner decisions (mandatory constraints)

---

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

### 1.2 Dependency rules (target — enforced by lint + CI, not convention)

| Rule | Rationale |
|---|---|
| `apps/mobile` MAY import `packages/voice-engine` and `packages/*`. MAY NOT import from `supabase/functions/_shared` or any function `index.ts`. | Edge code is server-only (secrets, service_role). An accidental `packages/* → _shared` bridge would leak server logic into the client bundle. |
| `supabase/functions/<fn>` MAY import only from `../_shared/`. Cross-function imports forbidden. | Each function is an independently deployable unit; cross-imports create hidden coupling and deployment drift. |
| `packages/voice-engine` MAY NOT hold secrets or AI-model knowledge. It is a typed transport layer. | Keep it model-agnostic; it already is. |
| `_shared/` modules are versioned contracts: `edge-auth.ts` (trust boundary), `ai.ts` (provider config), `rate-limit.ts`, `log.ts`, `governance.ts`, `memory.ts`, `routing.ts`, `shopping.ts`, `tabs.ts`, `time.ts`, `app-brain.ts`. | Any signature change to a `_shared` module must be a minor-version bump in its header + a CI contract test. |

### 1.3 Planned moves (spec only — no code moved in D0.5)

1. **Split `apps/mobile/src/app/index.tsx`** (6,034 lines — biggest single-file risk). Target: per-screen modules under `src/screens/` + a thin router. Required before commercial UI work (PWA, SEO, a11y) touches that file again.
2. **Split `packages/voice-engine/src/client.ts`** (2,420 lines). Target: `notes.ts`, `items.ts`, `chat.ts`, `media.ts`, `spaces.ts` behind a facade `client.ts` re-exporting the stable public surface.
3. **Promote `supabase/functions/_shared/` into `packages/edge-shared/`** with its own typecheck + unit tests, imported by Deno via path mapping. `edge-auth.ts`, `governance.ts`, `rate-limit.ts` are App Factory upstream candidates and need a publishable boundary.
4. **`_shared/log.ts` → `ops-telemetry-core` ADOPT**: `log.ts` (76 lines) becomes a thin re-export over the factory core once the ADOPT gate passes. No new direct `ai_events`/`ops_events` inserts outside the telemetry module.

No directory is deleted; every move keeps a compatibility re-export until the next major phase.

---

## 2. Edge functions + API contracts

### 2.1 Contract standard (all 22 functions)

- **Inputs:** JSON body, validated at handler top. Unknown fields ignored (forward-compat). Required-field violations → `400 {error: 'invalid_input', fields: [...]}`.
- **Outputs:** JSON; success envelope `{ok: true, data: {...}}` for new/changed contracts. Existing functions keep response shapes (client compatibility) — envelope convergence at D1 behind versioning.
- **Auth:** Supabase JWT (`edge-auth.ts`); `service_role` confined to server-side system ops; admin fns use `x-admin-token` with constant-time compare; cron entry uses `x-cron-secret`. Public surface limited to `classify`, `route` (gated with JWT-or-anonymous-token + rate limit), `public-config`.
- **Errors:** `{error: <snake_case code>, message?: <human-safe>, request_id: <uuid>}`. Stable codes: `invalid_input`, `unauthorized`, `forbidden`, `rate_limited`, `quota_exceeded`, `not_found`, `conflict`, `upstream_error`, `internal`. Never leak provider messages, SQL, or stack traces. `request_id` joins client reports to `ops_events`.
- **Idempotency:** `extract`, `notify`, and billing webhooks accept `Idempotency-Key`; server stores key → response hash (TTL 24h), replays stored response on retry. Note-creating paths require the key (closes duplicate-notes-on-retry).

### 2.2 Per-function contract summary

| Function | Inputs | Outputs | Auth | Idempotency |
|---|---|---|---|---|
| `chat` | `{space_id, message, session_id?, eval_mode?}` | `{answer, actions[], request_id}` | JWT | no (conversational) |
| `ask` | `{space_id, question}` | `{answer, citations[]}` | JWT | no |
| `extract` | `{transcript, space_id, idempotency_key}` | `{items[], tasks[], memories[]}` | JWT | **key required** |
| `transcribe` | `{audio_ref \| multipart}` | `{transcript, language}` | JWT | key recommended |
| `memory-learn` | `{space_id, facts[]}` | `{saved: n}` | JWT | key per batch |
| `memory-consolidate` | POST empty | `{rescored: n, surfaced: n}` (redesigned, non-destructive per decision #7) | cron secret | single-flight lock |
| `classify` / `route` | `{text}` | `{intent, route}` | JWT-or-anon + rate limit | no |
| `notify` | `{user_ids[], title, body, data?}` | `{sent: n}` | JWT (sender ∈ space) | **key required** |
| `join-family` | `{code}` | `{space_id}` | JWT | single-use code + row lock |
| `family-members` | `{space_id, action, user_id?}` | `{members[]}` | JWT (manager) | no |
| `account-export` | `{}` | `{export_url (signed, 1h)}` | JWT | no (rate-limited 5/min) |
| `account-delete` | `{confirm: true}` | `{ok}` | JWT + double confirm | single-flight |
| `admin-*` (7) | per-fn | per-fn | admin token | per-fn |
| `public-config` | — | `{flags, limits}` (no secrets) | public | cacheable |
| `report-error` | `{message, stack?, context}` | `{ok}` | JWT (PII-scrubbed server-side) | no |
| `vault-master` | `{action, code?}` | per-action | JWT | no |

### 2.3 Versioning strategy

URL-path versioning at edge-function level: breaking contract → new function suffix (`chat-v2`) or `v` field; old function stays deployed until minimum supported app version passes. `public-config` advertises `min_supported_build` + per-endpoint deprecation dates. No silent breaking changes.

---

## 3. AI provider abstraction + model routing

### 3.1 Current state

`supabase/functions/_shared/ai.ts` (67 lines): selects provider from env — OpenAI (GPT-5-mini chat, GPT-5 quirks: no temperature, `max_completion_tokens`) when `OPENAI_API_KEY` set, else Groq free (`openai/gpt-oss-120b` chat, whisper-large-v3-turbo transcription; `qwen3.8-27b` vision). Transcription stays on Groq whisper while `GROQ_API_KEY` exists; falls back to `gpt-4o-mini-transcribe`.

### 3.2 ai-provider-core ADOPT (decision #9) — three gates

Adoption approved **only after** all three gates pass:

- **Gate A — Compatibility:** the core must reproduce both provider paths exactly: Groq free path (gpt-oss-120b, whisper-large-v3-turbo, temperature supported, `max_tokens`) AND OpenAI path (gpt-5-mini, temperature omitted, `max_completion_tokens`, `gpt-4o-mini` vision, `gpt-4o-mini-transcribe` fallback). A compatibility matrix test runs every current `_shared/ai.ts` behavior against the core; any divergence = gate failed.
- **Gate B — Security review:** dependency audit of the core; secret handling (keys via env only, never logged — the core must satisfy the `log.ts` hard rule: no message content/transcripts/secrets in any log path); review of retry/backoff code for amplification abuse.
- **Gate C — Regression verification:** the 5 AI-path edge functions (chat, extract, memory-learn, ask, transcribe) run integration tests against BOTH `_shared/ai.ts` and the core with a mock provider; outputs must be byte-equivalent on the contract surface. `node:crypto` constraint: edge-functions-only consumption until the factory lands the injection.

### 3.3 Model routing table (target)

| Task | Primary | Fallback | Notes |
|---|---|---|---|
| Transcription | Groq whisper-large-v3-turbo (free) | OpenAI gpt-4o-mini-transcribe | Audio deleted post-transcription (user policy) |
| Chat / ReAct | OpenAI gpt-5-mini | Groq openai/gpt-oss-120b | ≤5 steps; per-user daily token budget |
| Extract | gpt-5-mini | gpt-oss-120b | Idempotency key required |
| Memory-learn | gpt-5-mini | gpt-oss-120b | Facts only; no auto-delete paths |
| Vision (note photos) | gpt-4o-mini | Groq qwen3.8-27b | Photo escalation fixed separately |
| Fast-path classify | regex/local first, AI only on miss | — | Keeps p95 < 1.5s without model calls |

### 3.4 Failover policy

Per-request (not per-user): on provider 429/5xx/timeout, one failover attempt to the fallback model with jittered backoff. Failover logged to `ai_events` with `error: 'failover'`. If both providers fail → `upstream_error` with `retry_after_hint` — never a fabricated answer. Cost guard: failover to a paid model counts against the user's daily AI budget; budget exhaustion returns `quota_exceeded`, never silent degradation mid-conversation.

---

## 4. Background jobs / queues / retries / idempotency

### 4.1 pg_cron inventory

| Job | Schedule | Notes |
|---|---|---|
| `mawjood-due-reminders` | every 15 min | idempotent via `reminder_sent_at`; re-arm on due-date change |
| `mawjood-watch-reminders` | every 15 min | same pattern |
| `memory-consolidate` | **none** (documented "nightly", no schedule — D0 gap) | RETIRED as destructive; replaced by §4.2 |

Reminder scans re-scan a growing candidate set: mitigate with the partial index `items_reminder_idx` (already in 0020) and a `checked` watermark table if scan cost exceeds budget at 100k items — measured, not assumed.

### 4.2 Non-destructive maintenance job (decision #7)

New job `mawjood-memory-maintenance` (weekly, cron-secret, single-flight advisory lock): (a) re-scores `items.importance` from recency/usage signals (UPDATE only), (b) detects near-duplicate memories via pg_trgm similarity and writes candidates to per-user `pending_actions` ("these look like duplicates — merge?") for EXPLICIT user action, (c) emits `ops_events` metrics. **Never DELETEs, never decays by age, never touches `trash_bin`.** The 90-day decay and 200-fact `pruneFacts` cap are redesigned per decision #1: quota overflow blocks new saves with a user-facing choice — never silent deletion.

### 4.3 Retry policy

Current: Groq 429 "backoff" is a single fixed 1.5s retry — not exponential. Specified fix: exponential backoff with jitter — 1s → 2s → 4s → 8s (max 4 attempts), full jitter, only on retryable classes (429, 502/503/504, timeout). 4xx (except 429) never retried. pg_net push calls: same schedule; per-message failure recorded without aborting batch. Client (`voice-engine`): network retry only for idempotent GETs; mutating retries MUST carry `Idempotency-Key`.

### 4.4 Idempotency keys

`extract`, `notify`, billing webhooks require `Idempotency-Key`. Server table `idempotency_keys(key pk, fn, user_id, response jsonb, created_at)`; replay returns stored response with `replayed: true`; 24h TTL; janitor-eligible (telemetry-adjacent, NOT user memories). `account-delete` and `join-family` use single-flight locks instead of keys.

---

## 5. Traceability

| Requirement | Stage | Acceptance test |
|---|---|---|
| Module boundary rules (§1.2) | D1 (lint rules) | CI lint job fails on `_shared` import from client |
| API contract standard (§2.1) | D1–D2 | Contract tests per function (CI) |
| ai-provider-core ADOPT (§3.2) | D7 | Gates A/B/C evidenced |
| Non-destructive maintenance (§4.2) | D1 | Static tripwire: zero DELETE in maintenance fn |
| Retry/idempotency (§4.3–4.4) | D2–D3 | Mock-provider retry + replay tests |

## 6. Open decisions

Quotas numerics (decision #2 — evidence-based options only) · fail-closed vs fail-open rate limiting · `classify`/`route` gating shape (P0-3) · `index.tsx`/`client.ts` split strategy · edge runtime for factory cores (`node:crypto` blocker).
