-- ═══════════════════════════════════════════════════════════════════════════
-- 0040_invite_atomic_claim.sql — PR-B / F-SEC-05 (2026-10-12)
-- join-family redeemed invites check-then-increment: it read used_count,
-- compared in code, inserted the member, then wrote used_count+1 from the
-- STALE read — two concurrent redemptions could both pass the check and
-- exceed max_uses. claim_invite_use performs the increment as ONE
-- conditional UPDATE: the row is claimed only while a use remains and the
-- invite is unexpired, so concurrent claims serialize on the row and
-- exactly max_uses of them can ever succeed.
-- Service-role only (join-family validates everything else beforehand).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.claim_invite_use(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.space_invites
     set used_count = used_count + 1
   where id = p_invite_id
     and used_count < max_uses
     and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.claim_invite_use(uuid) from public, anon, authenticated;
grant execute on function public.claim_invite_use(uuid) to service_role;
