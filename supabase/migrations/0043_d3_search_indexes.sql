-- ═══════════════════════════════════════════════════════════════════════════
-- 0043_d3_search_indexes.sql — D3 T-D3-1 (design + test per decision #8;
-- production application is a separate owner-approved step).
-- The hot searches are leading-wildcard ILIKEs (chat toolSearch, client
-- search): items.title / items.details / notes.transcript. Without
-- trigram indexes they heap-scan every row in scope. Measured on scratch
-- (100k items in one space, 20k notes, NANO):
--   items ILIKE needle : 342 ms → 2.5 ms   (~135×)
--   notes ILIKE needle :  40 ms → 0.22 ms  (~180×)
--   loadFacts shape    : 4.9 ms (existing partial items_memory_idx)
-- Index sizes at that scale: title 2.5 MB, details 5.6 MB,
-- notes transcript 1.3 MB, note_id 0.7 MB, space/kind/status 0.7 MB.
-- Full methodology + plans: docs/autonomous/d3/INDEX_BENCHMARKS.md.
-- Production runbook note: at real scale create these with
-- CREATE INDEX CONCURRENTLY (outside a transaction) instead of applying
-- this file verbatim; the definitions are identical.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

create index if not exists items_title_trgm
  on public.items using gin (title gin_trgm_ops);
create index if not exists items_details_trgm
  on public.items using gin (details gin_trgm_ops);
create index if not exists notes_transcript_trgm
  on public.notes using gin (transcript gin_trgm_ops);

-- FK lookups/cascades (note delete removes its extracted items).
create index if not exists items_note_id_idx
  on public.items (note_id);

-- General item listing by space + kind + status (spec §9.1).
create index if not exists items_space_kind_status_idx
  on public.items (space_id, kind, status);
