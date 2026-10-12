# D0.5 — Performance, Reliability & Operations

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Status:** SPECIFICATION ONLY — planning document. Index and janitor designs are design/test only per decision #8; NO production execution.
**Inputs:** `workstream-06-technical.md` §3, §7–§10, §12, §14 · D0 `PERFORMANCE_AND_SCALE_ASSESSMENT.md` · 9 approved owner decisions

---

## 1. Index designs (decision #8: design/test only)

### 1.1 Approved index set

| # | Index | Purpose |
|---|---|---|
| 1 | `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `CREATE INDEX CONCURRENTLY items_title_trgm ON items USING gin (title gin_trgm_ops);` (+ same on `details`) | Replaces `%…%` ILIKE full-space scans in search |
| 2 | `CREATE INDEX CONCURRENTLY items_note_id_idx ON items (note_id);` | Hot path — currently unindexed (`0002_items.sql:6-7`) |
| 3 | `CREATE INDEX CONCURRENTLY items_space_kind_idx ON items (space_id, kind);` | Kind-filtered space listings; RLS+filter selectivity |
| 4 | (candidate, test-gated) `notes (space_id, created_at DESC)` | Note timelines |

### 1.2 Verification plan (EXPLAIN ANALYZE, seeded fixture)

1. Deterministic seed fixture: N spaces × {1k, 10k, 100k} `items` rows with realistic AR/EN title distributions (trigram selectivity differs by script).
2. `EXPLAIN (ANALYZE, BUFFERS)` on the exact hot queries before/after; require index scans, `Buffers: shared hit` dominated, hot-query p95 < 100ms at 100k rows/space.
3. Negative checks: write-amplification on insert/update throughput; `pg_stat_user_indexes` review after soak.
4. Promotion gate: staging first under k6 load; **production execution needs separate owner approval** (decision #8).

---

## 2. Telemetry retention janitor (decision #8: design/test only)

### 2.1 Scope and hard boundary

Tables: `rate_limits`, `ai_events`, `ops_events`, `idempotency_keys`. **The janitor NEVER touches `notes`, `items`, `trash_bin`, `chat_sessions`, vault tables, or any user-content table** — enforced structurally via an allowlist constant; any other table = hard error. Production execution needs separate owner approval.

### 2.2 Retention bounds

| Table | Retention | Rationale |
|---|---|---|
| `rate_limits` | 7 days | Windows are minute/hour; older rows are dead weight |
| `ai_events` | 90 days | Cost accounting for quota sizing (decision #2 evidence); monthly rollups materialized before purge |
| `ops_events` | 90 days | Incident forensics window |
| `idempotency_keys` | 24 hours | Replay window only |

### 2.3 Design

Weekly pg_cron `mawjood-telemetry-janitor`: batched `DELETE ... WHERE created_at < now() - <retention> LIMIT 5000`, committing per batch (no long transactions), emitting `ops_events{kind:'janitor', ok, deleted: n, table}` per table. Dry-run mode reports counts without deleting — staging asserts dry-run counts match before any real run. `ai_events` monthly aggregates (`sum(tokens) by user_id, model`) materialized to a rollup table so quota sizing survives the purge.

---

## 3. Storage / file security + signed-URL lifecycle

### 3.1 Posture (0029_private_storage)

Buckets `voice-notes` and `item-photos` are private. `voice-notes`: owner-prefix SELECT. `item-photos`: owner-prefix OR space-member-via-note read (SECURITY DEFINER policy). Client displays via signed URLs; public URLs no longer work.

### 3.2 Path conventions

`${userId}/<uuid>.<ext>` at bucket root — first segment is ALWAYS the owner's `auth.uid()`, enforced by policy. No user-controlled path segments below the uuid. Voice audio deleted after transcription (user policy); the delete path is part of the transcribe contract, with a reconciliation sweep for orphans.

### 3.3 Signed-URL lifecycle

- **Expiry:** photos 60 min; export bundles 60 min; URLs embedded in push/email 24h max.
- **Rotation:** client `signedUrlCache` refreshes on 401/expiry; cache bounded (LRU, 200 entries) — current cache is unbounded (fix).
- **Revocation:** on `account-delete` and vault-lock events, revoke by deleting underlying objects (signed URLs die with the object). Bucket service-key rotation only as last resort (invalidates ALL URLs — runbooked, owner-approved).
- **Membership re-check:** signed-URL issuance re-checks space membership at issue time, not just at upload (ties to photo-escalation hardening).

### 3.4 Orphan sweep (non-destructive)

Weekly job lists `storage.objects` with no referencing `notes.photo_url`/`items` attachment older than 7 days → moves to `quarantine/` prefix for 30 days before deletion. **Never deletes user-referenced objects**; the quarantine window mirrors the 30-day trash rule (decision #6).

---

## 4. Observability / logging / analytics / alerts

### 4.1 Current gaps (D0)

No Sentry, no uptime checks, no alerts, no analytics; `ops_events` has no owner; `_shared/log.ts` hard rule: never log message content, transcripts, note text, or secrets.

### 4.2 Design

- **Sentry:** client (Expo) + edge functions. Edge: wrap each handler; send only `request_id`, error class, sanitized context — the `log.ts` hard rule extends to Sentry (PII scrub on `report-error` payloads).
- **`ops-telemetry-core` ADOPT:** replaces `_shared/log.ts`; owns the `ops_events` schema, retention interface, and the no-content invariant as a tested property. Sequenced after `ai-provider-core`.
- **Privacy-respecting analytics:** event-based, no content — `chat_turn`, `note_created`, `photo_attached`, `invite_redeemed` (counts only). No third-party tracker SDKs until the Privacy Policy covers them. Funnel metrics derive from `ops_events`, not client-side surveillance.
- **Uptime checks:** synthetic probes every 5 min against `public-config` (edge reachable), `chat` fast-path (p95 budget), DB liveness RPC. Alert routing: page on edge 5xx > 1% over 10 min or DB unreachable; ticket-level on p95 breaches.
- **`ops_events` ownership:** telemetry module owns the table; documented `kind` taxonomy (`janitor`, `failover`, `quota`, `auth`, `deploy`, `cron`) with per-kind retention. Daily digest of error classes by function.

---

## 5. Caching / offline-read / sync strategy

### 5.1 Bounded caches

LRU with explicit caps (config 500 entries / signed URLs 200), TTLs (config 15 min, URLs until 10 min before expiry), stampede protection (single-flight per key). Cache keys namespaced by `user_id` — never cross-user.

### 5.2 Offline read cache

SQLite (Expo) mirror of the user's spaces/notes/items metadata (titles, kinds, timestamps — full bodies on demand). Read path serves cache when offline; visible "offline" banner marks staleness. Explicitly NOT a second source of truth: server wins on conflict.

### 5.3 Queue-and-sync

Offline mutations → outbox table (op id = client UUID, `Idempotency-Key` derived); sync in order on reconnect; server applies idempotently; client reconciles by op id.

### 5.4 Conflict resolution

Last-writer-wins with `updated_at` + client op id; on conflict the server keeps both versions and surfaces a `pending_actions` merge candidate (consistent with the non-destructive philosophy, decision #7) — never silent overwrite.

### 5.5 Realtime

Keep Supabase Realtime for invalidation signals (row changed → refetch), not as data transport; replace whole-list refetch per change with targeted invalidation by `space_id` + `kind`.

---

## 6. Backup / restore / PITR / disaster recovery / deployment

- **Backup:** Supabase Point-In-Time Recovery (PITR) on prod; daily logical backup to owner-controlled encrypted storage, 30-day retention. Scope includes `storage.objects` metadata + bucket contents.
- **Verification:** monthly automated restore to an ephemeral project; assert row counts per domain, RLS policies present, login + note-read smoke test. A backup never restored is not a backup — the drill is a recurring ops task with an `ops_events` record.
- **Restore runbook:** (1) declare incident, freeze writes (maintenance flag in `public-config`); (2) restore to PITR target; (3) verify RLS + auth; (4) replay `idempotency_keys`-era writes from client outboxes where applicable; (5) lift freeze; (6) post-incident `ops_events` + user notice if data-loss window > 0.
- **RTO/RPO:** 4h / 15min — **proposed, to be validated against the first restore drill**, not claimed.
- **DR:** Supabase managed failover primary; provider outage (Groq/OpenAI down → failover policy degrades to surviving provider; both down → `upstream_error` with user messaging, no fabricated answers).
- **Deployment pipeline:** `preview → staging → prod`. Every PR gets a preview Supabase project (migrations applied, seeded fixture). Staging mirrors prod config (RLS, crons active, sandboxed AI keys). Prod deploys owner-approved, migration-gated (additive-only), automatic rollback on uptime-probe failure. Edge functions deploy with version tags; `public-config` advertises the live version.

---

## 7. Measurable performance & reliability targets

| Metric | Target | Evidence status |
|---|---|---|
| Chat fast-path p95 | < 1.5s | **unmeasured** — benchmark plan D1 |
| AI chat p95 | < 8s | **unmeasured** |
| DB hot-query p95 | < 100ms | **unmeasured** — EXPLAIN ANALYZE plan §1.2 |
| AI cost | < $0.50 / MAU / mo | **unmeasured** — needs `ai_events` aggregation + per-user caps |
| Connection errors | zero | **unmeasured** — soak test in plan |

**Readiness statement (unchanged from D0):** the architecture plausibly serves hundreds of active users (managed Supabase, RLS-indexed hot paths mostly covered after §1). **Millions of users is not demonstrated — do not claim it.** Benchmark plan (D1): seeded EXPLAIN ANALYZE at 1k/10k/100k rows/space → k6 on chat/extract at 50–100 VUs → cost accounting from `ai_events` → connection soak → realtime fan-out test → client bundle/boot budgets. `ENGINEERING_STANDARDS.md` §7 budgets graduate from review guidelines to CI assertions only after the harness lands.

---

## 8. Traceability

| Requirement | Stage | Acceptance test |
|---|---|---|
| Index designs (§1) | D3 | EXPLAIN ANALYZE assertions (CI benchmark-smoke) |
| Telemetry janitor (§2) | D3 | Dry-run counts match; never touches user tables (tripwire) |
| Signed-URL lifecycle (§3) | D2 | Membership re-check at issuance; revocation on delete |
| Observability (§4) | D3 | Sentry + uptime + alerts live; digest runs |
| Offline/sync (§5) | D3–D5 | Outbox sync tests; conflict merge candidates |
| Backup/DR (§6) | D8 | Restore drill executed; RTO/RPO recorded |

## 9. Open decisions

PITR RTO/RPO validation · Realtime vs polling for sync invalidation (fan-out test decides) · analytics vendor (policy first) · fail-closed vs fail-open rate limiting.
