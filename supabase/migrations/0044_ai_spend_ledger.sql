-- 0044: atomic AI spend ledger (owner audit fix for PR #19 / F-SEC-03;
-- authorize+charge made a SINGLE atomic operation in the owner's
-- final correction round).
--
-- The original cap summed ai_events in the edge function with
-- .limit(5000): past 5,000 events/day (and past PostgREST's own row
-- cap) the sum silently UNDERCOUNTS, so the cap stops binding exactly
-- when spend is highest. The first fix split the gate into a ledger
-- READ plus a separate charge — still a read-then-act race at the cap
-- boundary. This migration makes authorization and reservation ONE
-- database operation:
--
--   try_charge_ai_spend(user, day, amount, cap) -> new total | NULL
--     A single INSERT ... ON CONFLICT DO UPDATE whose UPDATE carries
--     the cap predicate (spent + amount <= cap) under the row lock the
--     upsert already takes: concurrent invocations serialize on the
--     row, every charge is either fully applied under the cap or
--     rejected (NULL), and the ledger can NEVER exceed the cap.
--     A first-ever charge larger than the cap is rejected by the
--     explicit amount > cap guard (the INSERT branch has no WHERE).
--     Invalid inputs (null/negative amount, null/non-positive cap)
--     are rejected (NULL) — the edge treats NULL as cap-denied and any
--     RPC error as fail-closed check_failed.
--
-- The edge pre-charges each model call with a MEASURED upper bound
-- (payload chars -> token bound at the priciest rate in the table), so
-- the ledger always >= actual provider spend for completed calls.
-- ai_events remains the reporting telemetry.
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

create or replace function public.try_charge_ai_spend(p_user uuid, p_day date, p_amount numeric, p_cap numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total numeric;
begin
  if p_user is null or p_day is null
     or p_amount is null or p_amount < 0
     or p_cap is null or p_cap <= 0
     or p_amount > p_cap then
    return null;
  end if;
  insert into public.ai_spend_daily (user_id, day, spent_usd)
  values (p_user, p_day, p_amount)
  on conflict (user_id, day) do update
    set spent_usd = public.ai_spend_daily.spent_usd + excluded.spent_usd,
        updated_at = now()
    where public.ai_spend_daily.spent_usd + excluded.spent_usd <= p_cap
  returning spent_usd into new_total;
  return new_total; -- NULL when the cap predicate rejected the charge
end;
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

revoke all on function public.try_charge_ai_spend(uuid, date, numeric, numeric) from public, anon, authenticated;
grant execute on function public.try_charge_ai_spend(uuid, date, numeric, numeric) to service_role;
revoke all on function public.ai_spend_total(uuid, date) from public, anon, authenticated;
grant execute on function public.ai_spend_total(uuid, date) to service_role;
