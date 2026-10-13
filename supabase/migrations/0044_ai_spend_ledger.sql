-- 0044: atomic AI spend ledger (owner audit fix for PR #19 / F-SEC-03).
--
-- The original cap summed ai_events in the edge function with
-- .limit(5000): past 5,000 events/day (and past PostgREST's own row
-- cap) the sum silently UNDERCOUNTS, so the cap stops binding exactly
-- when spend is highest. This migration replaces the gate's source of
-- truth with a per-user/day ledger updated by ONE atomic upsert:
--
--   charge_ai_spend(user, day, amount) -> new total
--     INSERT ... ON CONFLICT DO UPDATE SET spent = spent + amount
--     RETURNING spent — row-locked by the upsert, so concurrent edge
--     invocations serialize on the row and can never lose an increment.
--
-- The edge gate (spend.ts) reads ai_spend_total, denies at/over the
-- cap, and otherwise pre-charges a worst-case estimate for the
-- request. Pre-charging an UPPER bound (never an after-the-fact sum)
-- means the ledger always >= actual provider spend for completed
-- calls; concurrent in-flight requests can push the ledger past the
-- cap by at most their combined charges, while actual spend stays
-- below the ledger. ai_events remains the reporting telemetry.
--
-- Service-role only (edge functions call with the admin client);
-- RLS is enabled with NO client policies, so the ledger is invisible
-- and unwritable from anon/authenticated clients.

create table if not exists public.ai_spend_daily (
  user_id uuid not null,
  day date not null,
  spent_usd numeric(14, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_spend_daily enable row level security;

create or replace function public.charge_ai_spend(p_user uuid, p_day date, p_amount numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  insert into public.ai_spend_daily (user_id, day, spent_usd)
  values (p_user, p_day, greatest(p_amount, 0))
  on conflict (user_id, day) do update
    set spent_usd = public.ai_spend_daily.spent_usd + greatest(p_amount, 0),
        updated_at = now()
  returning spent_usd;
$$;

create or replace function public.ai_spend_total(p_user uuid, p_day date)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select spent_usd from public.ai_spend_daily
                   where user_id = p_user and day = p_day), 0);
$$;

revoke all on function public.charge_ai_spend(uuid, date, numeric) from public, anon, authenticated;
grant execute on function public.charge_ai_spend(uuid, date, numeric) to service_role;
revoke all on function public.ai_spend_total(uuid, date) from public, anon, authenticated;
grant execute on function public.ai_spend_total(uuid, date) to service_role;
