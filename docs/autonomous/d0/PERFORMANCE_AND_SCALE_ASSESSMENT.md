# D0 — Performance & Scale Assessment

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Stance:** No scalability claims without benchmarks. None exist.

## Confirmed bottlenecks (code-evident)

### HIGH
1. **Uncapped AI cost** — 200 chats/hr × 5 ReAct steps = up to 1,000 model calls/user/hr. `_shared/rate-limit.ts` is anti-abuse (20/min, 200/hr), not a plan quota. `admin-set-limits` has no AI-token cap. Fail-open on store errors.
   - Fix: daily per-user AI token budget (accounting already in `ai_events`) + spend alerts.
2. **`%…%` ILIKE search, no trigram/FTS index** — `packages/voice-engine/src/client.ts:2195-2228`, `chat/index.ts:140-145`. Every search scans all rows of a space.
   - Fix: `pg_trgm` + GIN indexes (or tsvector FTS).
3. **Unindexed `items.note_id`** — `0002_items.sql:6-7`; hot queries at `client.ts:655,1058,1108,1139,1191,777`. No `(space_id, kind)` composite index.
   - Fix: two indexes (EXPLAIN ANALYZE on seeded fixture first).

### MEDIUM
4. **Chat turn = 10–14 DB round-trips + ≤5 sequential model calls**, no AI-result caching (only in-memory remoteConfig/signedUrlCache).
5. **Telemetry tables grow unbounded** (`rate_limits`, `ai_events`, `ops_events`) — no janitor.
6. **`memory-consolidate` "nightly" but no schedule/callers** — quality decay if never runs; unbudgeted AI cost if scheduled.
7. **Realtime fan-out refetches whole lists per change.**
8. **pg_cron reminder scans re-scan growing candidate set.**
9. **Idempotency gaps** — duplicate notes on retry; unguarded extract.

## Explicitly NOT benchmarked

No perf tests exist. `ENGINEERING_STANDARDS.md` §7 budgets are review-enforced guidelines ("benchmark harness tracked gap"). No p50/p95 ever measured.

## Performance targets (proposed)

| Metric | Target |
|---|---|
| Chat fast-path p95 | < 1.5s |
| AI chat p95 | < 8s |
| DB hot-query p95 | < 100ms |
| AI cost | < $0.50 / MAU / mo |
| Connection errors | zero |

## Benchmark plan (D0.5)

1. DB seed + EXPLAIN ANALYZE at 1k / 10k / 100k rows per space
2. k6 load on `chat` / `extract` at 50–100 VUs
3. AI cost accounting from `ai_events` → size per-user caps
4. Connection soak (Supabase pooler limits)
5. Realtime fan-out test (N subscribers, M changes)
6. Client bundle + boot budgets (web + native)

## Readiness statement

Current architecture serves hundreds of active users comfortably (Supabase managed, RLS-indexed hot paths mostly covered). **Millions of users is not demonstrated** — the gaps above (AI cost, search, indexes, telemetry growth, no benchmarks) must close first. Do not claim web-scale readiness.
