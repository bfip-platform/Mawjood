-- D3 T-D3-5 benchmark harness — the hot query shapes (EXPLAIN ANALYZE).
-- Run AFTER seed.sql, once WITHOUT migration 0043's indexes and once
-- with them, and compare Execution Time + plan shape. Record results
-- next to the baseline in ../INDEX_BENCHMARKS.md.

-- Q1: chat toolSearch / client search — items substring (space-scoped)
explain (analyze, buffers)
select id, kind, title, details, due_at, status, bought_at, space_id, meta
from public.items
where space_id = :space_id
  and (title ilike '%حليب%' or details ilike '%حليب%')
order by created_at desc
limit 8;

-- Q2: the same search without a space filter (worst case)
explain (analyze, buffers)
select id, kind, title
from public.items
where (title ilike '%حليب%' or details ilike '%حليب%')
limit 8;

-- Q3: memory loadFacts — a user's full open fact set, newest first
explain (analyze, buffers)
select id, title, details, meta, created_at, updated_at
from public.items
where space_id = :space_id and kind = 'memory' and status = 'open'
order by updated_at desc
limit 300;

-- Q4: notes substring search
explain (analyze, buffers)
select id, transcript, created_at, space_id
from public.notes
where space_id = :space_id and transcript ilike '%حليب%'
order by created_at desc
limit 6;
