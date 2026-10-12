# D3 T-D3-1 — Search index design + benchmarks

**Status:** design + measured on scratch (decision #8: design and test only — production application is a separate owner-approved step; see runbook note in migration 0043).
**Date:** 2026-10-12. **Environment:** scratch project `mawjood-d1-scratch` (Supabase NANO, us-east-2), canonical migrations 0001–0042 applied.

## Why these indexes

The product's hot searches are leading-wildcard substring matches, which btree indexes cannot serve:

| Query site | Shape |
|---|---|
| chat `toolSearch` (`chat/index.ts`) | `items.title/details ILIKE %q%`, `notes.transcript ILIKE %q%`, per turn |
| client search (`voice-engine/client.ts`) | `items.title/details ILIKE %q%` (`.or(...)`) |
| memory `loadFacts` | `items WHERE space_id + kind='memory' + status='open' ORDER BY updated_at` |
| note deletion cascades | `items WHERE note_id IN (...)` |

Existing coverage before this stage: `items(space_id)`, partial `items_memory_idx (space_id) WHERE kind='memory' AND status='open'` (0023), assorted kind-specific partials. Missing: any trigram index, `items.note_id`, a general `(space_id, kind, status)` composite.

## Design (migration 0043)

- `pg_trgm` extension.
- GIN trigram: `items.title`, `items.details`, `notes.transcript`.
- Btree: `items(note_id)`, `items(space_id, kind, status)`.

## Method

Seeded one private space with **100,001 items** (2,001 memory facts among tasks/things; one needle row titled «حليب الأطفال») and **20,000 notes**, via `generate_series`. `EXPLAIN (ANALYZE, BUFFERS)` on the three hot shapes, before and after creating the indexes (followed by `ANALYZE`). A single space with 100k rows is deliberately harsher than expected per-user reality; it is the shape that makes sequential/bitmap heap scans hurt.

## Results

| Query | Before | After | Notes |
|---|---|---|---|
| items ILIKE needle (space-scoped) | **342 ms** (bitmap over `items_space_idx`, 100,001 heap fetches) | **2.5 ms** (bitmap over both trgm indexes) | ~135× |
| items ILIKE needle (no space filter) | full scan (not separately timed) | **0.26 ms** | trgm serves it directly |
| notes ILIKE needle | **40 ms** | **0.22 ms** | ~180× |
| `loadFacts` shape | 42703 before migration 0042 (PR #22); after 0042 uses `items_memory_idx` | **4.9 ms** for a 2,001-fact space (300-row page) | existing partial index already optimal; composite added for non-memory listings |

Index sizes at seed scale: `items_details_trgm` 5,648 kB · `items_title_trgm` 2,560 kB · `notes_transcript_trgm` 1,336 kB · `items_note_id_idx` 696 kB · `items_space_kind_status_idx` 712 kB. Total ≈ 11 MB per 100k items + 20k notes — acceptable write/storage cost for the read win.

## Caveats

- NANO-tier timings are indicative, not production guarantees; the *plan shape* change (heap scan of the whole space → targeted bitmap) is the durable result and scales with table size.
- Arabic trigram quality: pg_trgm operates on characters; the needle tests used Arabic terms and matched correctly. Recall quality of substring search itself is unchanged (this stage is speed, not semantics — semantic search remains an open spec §9.2 question).
- Production application: create with `CREATE INDEX CONCURRENTLY` outside a transaction (runbook in migration 0043's header); on today's table sizes plain application is also fine, but the decision is the owner's at deploy time.
