-- ═══════════════════════════════════════════════════════════════════════════
-- 0042_items_updated_at.sql — bugfix (found during D3 benchmarking,
-- 2026-10-12): the memory engine (supabase/functions/_shared/memory.ts)
-- selects AND orders items by `updated_at` in loadFacts /
-- listTrashedFacts / the review listing, and writes `updated_at` in
-- upsertFacts / mergeFacts update payloads — but no migration ever
-- created the column. On the canonical schema every one of those calls
-- fails with 42703 (verified on scratch): loadFacts returns [], so
-- recall / forget matching / the gardener silently see ZERO facts, and
-- same-mkey updates silently fail. Same failure class as the
-- notes.deleted_at bug (Stage 0, PR #16). Production schema state is a
-- separate open question (D0) — this makes the canonical chain correct
-- either way: additive + idempotent.
--   · add items.updated_at (default now())
--   · backfill existing rows from created_at (best available truth)
--   · BEFORE UPDATE trigger keeps it current for every writer
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.items
  add column if not exists updated_at timestamptz not null default now();

update public.items set updated_at = created_at where updated_at > created_at;

create or replace function public.items_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.items_touch_updated_at();
