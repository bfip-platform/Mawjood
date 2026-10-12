# Benchmark harness (D3 T-D3-5)

Repeatable before/after measurement for the hot database query shapes, so index and query changes are judged on numbers, not vibes.

## Files

- `seed.sql` — one synthetic user + private space, 100,001 items (2,001 memory facts, one «حليب الأطفال» needle), 20,000 notes.
- `queries.sql` — the four hot shapes (items substring search space-scoped + global, `loadFacts`, notes substring) under `EXPLAIN (ANALYZE, BUFFERS)`.
- `teardown.sql` — removes the fixtures (FK order).

## Run

Against a **scratch** database only — never production:

```bash
psql "$SCRATCH_DB_URL" -v user_id="'<uuid>'" -v space_id="'<uuid>'" -f seed.sql
psql "$SCRATCH_DB_URL" -v space_id="'<uuid>'" -f queries.sql   # baseline
# apply the change under test (e.g. migration 0043), then:
psql "$SCRATCH_DB_URL" -v space_id="'<uuid>'" -f queries.sql   # after
psql "$SCRATCH_DB_URL" -v user_id="'<uuid>'" -v space_id="'<uuid>'" -f teardown.sql
```

## Recorded baseline (2026-10-12, scratch NANO, migrations ≤0043)

| Query | Before 0043 | After 0043 |
|---|---|---|
| Q1 items ILIKE (space) | 342 ms | 2.5 ms |
| Q2 items ILIKE (global) | full scan | 0.26 ms |
| Q3 loadFacts | 42703 pre-0042; 4.9 ms after | 4.9 ms (partial index) |
| Q4 notes ILIKE | 40 ms | 0.22 ms |

Full methodology and caveats: `../INDEX_BENCHMARKS.md`. Targets from the roadmap: DB p95 < 100 ms for these shapes — all four are inside budget after 0043 at 100k-row scale on the smallest tier.
