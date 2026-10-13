-- D3 T-D3-5 benchmark harness — seed.
-- Run against a SCRATCH database only (creates one synthetic user and
-- one space; teardown.sql removes them). Sizes mirror the PR-A baseline
-- (docs/autonomous/d3/INDEX_BENCHMARKS.md): 100k items / 20k notes in a
-- single private space — deliberately harsher than per-user reality.
--
-- psql usage:
--   psql "$SCRATCH_DB_URL" -v user_id="'<a uuid>'" -v space_id="'<a uuid>'" -f seed.sql
-- (or paste into the Supabase SQL editor after replacing the variables)

insert into auth.users (id, email) values (:user_id, 'bench@scratch.local')
on conflict (id) do nothing;

insert into public.spaces (id, name, type, owner_id)
values (:space_id, 'bench', 'private', :user_id)
on conflict (id) do nothing;

insert into public.items (space_id, kind, title, details, status, created_by, meta)
select :space_id,
       case when g % 50 = 0 then 'memory' else 'task' end,
       'صنف رقم ' || g,
       'تفاصيل عادية للعنصر رقم ' || g || ' في القائمة',
       'open', :user_id,
       jsonb_build_object('mkey', 'k' || g, 'importance', 3)
from generate_series(1, 100000) g;

insert into public.items (space_id, kind, title, details, status, created_by, meta)
values (:space_id, 'memory', 'حليب الأطفال', 'حليب مجفف للرضع في الخزانة', 'open', :user_id, '{"mkey": "needle"}');

insert into public.notes (space_id, created_by, transcript)
select :space_id, :user_id, 'ملاحظة صوتية عادية رقم ' || g || ' عن يومي'
from generate_series(1, 20000) g;
