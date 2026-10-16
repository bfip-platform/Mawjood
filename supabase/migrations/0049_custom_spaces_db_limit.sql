-- 0049 — CFP-01 item 7 hardening: enforce the custom-spaces entitlement at
-- the DATABASE boundary, closing every bypass around the manage-space fn.
--
-- Audit (CFP-01 final hardening): custom spaces could be created through
-- four paths, only one of which respected the limit —
--   1. direct PostgREST insert (RLS spaces_owner_all, 0001): NO CAP — the
--      owner JWT alone could insert unlimited type='custom' rows;
--   2. the AI executor in the chat fn (service role): paid-flag gate only,
--      NO COUNT CAP;
--   3. manage-space edge fn (0048's companion): capped, but count-then-
--      insert is racy and it is not a boundary;
--   4. ensureDefaultSpaces: built-in types only, not a custom path.
-- A BEFORE INSERT trigger is the one boundary ALL paths cross (triggers
-- are not RLS and fire for owner, service_role, and SQL callers alike).
--
-- Semantics (unchanged from 0048, now shared): the effective limit is the
-- MAX of profiles.custom_spaces_limit (default 2), the caller's ACTIVE
-- subscription plan feature "custom_spaces_limit:N" (premium = 7), and any
-- unexpired subscription_grants value of kind 'custom_spaces_limit'.
-- Free = 3 built-in + 2 custom; Plus = 3 + 7. INSERT-only: downgrades and
-- plan changes never delete or hide existing spaces; creation is what the
-- limit gates. Built-in types are never checked.
--
-- Concurrency: the trigger takes a per-owner advisory TRANSACTION lock
-- before counting, so parallel inserts for the same owner serialize and
-- the count each one sees includes every previously committed row —
-- the limit cannot be exceeded by racing requests on any path.
--
-- Additive and non-destructive. Depends on 0048 (the profiles column).
-- Rollback: drop the trigger + both functions; no data changes to undo.

create or replace function public.custom_spaces_effective_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select p.custom_spaces_limit from public.profiles p where p.id = p_user_id), 2),
    coalesce((
      select max((regexp_match(f, '^custom_spaces_limit:(\d+)$'))[1]::integer)
      from public.user_subscriptions us
      join public.subscription_plans sp on sp.id = us.plan_id
      cross join lateral jsonb_array_elements_text(sp.features) as f
      where us.user_id = p_user_id
        and us.status = 'active'
        and (us.ends_at is null or us.ends_at > now())
    ), 0),
    coalesce((
      select max(g.value)
      from public.subscription_grants g
      where g.user_id = p_user_id
        and g.kind = 'custom_spaces_limit'
        and (g.expires_at is null or g.expires_at > now())
    ), 0)
  );
$$;

create or replace function public.enforce_custom_spaces_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- Serialize concurrent creators of THIS owner for the rest of the
  -- transaction; different owners never block each other.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  v_limit := public.custom_spaces_effective_limit(new.owner_id);
  select count(*) into v_count
  from public.spaces s
  where s.owner_id = new.owner_id and s.type = 'custom';

  if v_count >= v_limit then
    raise exception 'custom_spaces_limit_reached'
      using errcode = '42501',
            detail = 'owner already has ' || v_count || ' custom spaces (limit ' || v_limit || ')';
  end if;
  return new;
end;
$$;

drop trigger if exists spaces_custom_limit_guard on public.spaces;
create trigger spaces_custom_limit_guard
  before insert on public.spaces
  for each row
  when (new.type = 'custom')
  execute function public.enforce_custom_spaces_limit();
