// manage-space — CFP-01 item 7: user-facing create / rename / delete for
// CUSTOM spaces, with the entitlement limit enforced SERVER-SIDE.
//
// Why an edge function: direct PostgREST inserts into `spaces` are
// RLS-allowed for any owner with no count cap, so the limit can only be
// enforced on a server path (same reasoning as the governed chat-fn
// create-space executor, whose semantics this mirrors: owner-only,
// custom-only deletes, non-empty spaces refuse deletion).
//
// POST { action: 'create', name } | { action: 'rename', space_id, name }
//      | { action: 'delete', space_id }
// Responses: { ok: true, space } | { ok: false, code } where code is one of
//   name_required | name_too_long | duplicate_name | limit_reached |
//   not_found | not_owner | not_custom | not_empty
// The client maps codes to localized copy; no user content is echoed back.
//
// Entitlement resolution (configurable rules — data, not code):
//   effective limit = MAX of the applicable sources:
//     1. profiles.custom_spaces_limit          (free default 2, migration 0048)
//     2. the caller's ACTIVE subscription plan's features entry
//        "custom_spaces_limit:N"              (premium plans carry 7)
//     3. an unexpired subscription_grants row of kind 'custom_spaces_limit'
//   A lapsed subscription simply drops source 2 — existing spaces are
//   NEVER deleted or hidden by entitlement changes; the limit gates
//   creation only. Built-in spaces (private/family/work) can never be
//   created, renamed, or deleted through this function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitMessage } from '../_shared/rate-limit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NAME_MAX = 40;
const DEFAULT_LIMIT = 2;

// deno-lint-ignore no-explicit-any
type Admin = any;

function parseFeatureLimit(features: unknown): number | null {
  if (!Array.isArray(features)) return null;
  for (const f of features) {
    const m = /^custom_spaces_limit:(\d+)$/.exec(String(f));
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

async function effectiveLimit(admin: Admin, userId: string): Promise<number> {
  const now = new Date().toISOString();
  let limit = DEFAULT_LIMIT;

  const { data: profile } = await admin
    .from('profiles')
    .select('custom_spaces_limit')
    .eq('id', userId)
    .maybeSingle();
  if (typeof profile?.custom_spaces_limit === 'number') {
    limit = Math.max(limit, profile.custom_spaces_limit);
  }

  const { data: subs } = await admin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`ends_at.is.null,ends_at.gt.${now}`);
  for (const sub of subs ?? []) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('features')
      .eq('id', sub.plan_id)
      .maybeSingle();
    const planLimit = parseFeatureLimit(plan?.features);
    if (planLimit !== null) limit = Math.max(limit, planLimit);
  }

  const { data: grants } = await admin
    .from('subscription_grants')
    .select('value')
    .eq('user_id', userId)
    .eq('kind', 'custom_spaces_limit')
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  for (const g of grants ?? []) {
    if (typeof g.value === 'number') limit = Math.max(limit, g.value);
  }

  return limit;
}

function cleanName(raw: unknown): { name?: string; code?: string } {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { code: 'name_required' };
  if (Array.from(name).length > NAME_MAX) return { code: 'name_too_long' };
  return { name };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  const reply = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  const fail = (code: string, status = 400) => reply({ ok: false, code }, status);

  try {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return fail('not_authenticated', 401);
    if (user.is_anonymous) return fail('not_authenticated', 401);

    const admin = createClient(url, serviceKey);
    const rl = await checkRateLimit(admin, user.id, 'manage-space');
    if (!rl.allowed) return reply({ ok: false, code: 'rate_limited', error: rateLimitMessage(true) }, 429);

    const b = await req.json().catch(() => ({}));
    const action = String(b?.action ?? '');

    if (action === 'create') {
      const { name, code } = cleanName(b?.name);
      if (code) return fail(code);
      const limit = await effectiveLimit(admin, user.id);
      const { count } = await admin
        .from('spaces')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('type', 'custom');
      if ((count ?? 0) >= limit) return fail('limit_reached', 403);
      const { data: dup } = await admin
        .from('spaces')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', name!)
        .limit(1);
      if ((dup ?? []).length > 0) return fail('duplicate_name');
      const { data: space, error } = await admin
        .from('spaces')
        .insert({ owner_id: user.id, type: 'custom', name: name! })
        .select()
        .single();
      if (error) throw error;
      return reply({ ok: true, space });
    }

    if (action === 'rename' || action === 'delete') {
      const spaceId = String(b?.space_id ?? '');
      const { data: space } = await admin
        .from('spaces')
        .select('id, owner_id, type, name')
        .eq('id', spaceId)
        .maybeSingle();
      if (!space) return fail('not_found', 404);
      if (space.owner_id !== user.id) return fail('not_owner', 403);
      // Built-in spaces are protected: only custom spaces are manageable here.
      if (space.type !== 'custom') return fail('not_custom', 403);

      if (action === 'rename') {
        const { name, code } = cleanName(b?.name);
        if (code) return fail(code);
        const { data: dup } = await admin
          .from('spaces')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', name!)
          .neq('id', spaceId)
          .limit(1);
        if ((dup ?? []).length > 0) return fail('duplicate_name');
        const { data: updated, error } = await admin
          .from('spaces')
          .update({ name: name! })
          .eq('id', spaceId)
          .select()
          .single();
        if (error) throw error;
        return reply({ ok: true, space: updated });
      }

      // delete: refuse non-empty spaces (contents must be moved/deleted
      // first) — data preservation beats convenience, per the 0034
      // governance precedent. space_tabs cascade with the space.
      const [{ count: noteCount }, { count: itemCount }] = await Promise.all([
        admin.from('notes').select('id', { count: 'exact', head: true }).eq('space_id', spaceId),
        admin.from('items').select('id', { count: 'exact', head: true }).eq('space_id', spaceId),
      ]);
      if ((noteCount ?? 0) > 0 || (itemCount ?? 0) > 0) return fail('not_empty', 409);
      const { error } = await admin.from('spaces').delete().eq('id', spaceId);
      if (error) throw error;
      return reply({ ok: true, space: { id: spaceId } });
    }

    return fail('bad_action');
  } catch (e) {
    console.error('manage-space failed:', e instanceof Error ? e.message : e);
    return fail('server_error', 500);
  }
});
