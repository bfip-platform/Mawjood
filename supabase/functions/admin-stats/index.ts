// admin-stats: dashboard numbers for the (single) admin.
// Auth: `x-admin-token` header must equal the ADMIN_TOKEN secret.
// Uses service_role (bypasses RLS) — never expose this function without the token check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqual } from '../_shared/edge-auth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAYS = 14;

function dayKeys(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  const err = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  const expected = Deno.env.get('ADMIN_TOKEN') ?? '';
  const got = req.headers.get('x-admin-token') ?? '';
  if (!expected || !timingSafeEqual(got, expected)) return err('غير مصرح', 401);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // ---- users (paginated) ----
    const users: Array<{ id: string; email: string | null; created_at: string; last_sign_in_at: string | null }> = [];
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) {
        users.push({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
      }
      if (data.users.length < 1000 || page >= 20) break;
      page++;
    }

    const days = dayKeys();
    const userByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    for (const u of users) {
      const d = u.created_at.slice(0, 10);
      if (d in userByDay) userByDay[d]++;
    }
    const recent = [...users]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 100);


    // F-INT-05: fetch ALL rows of a light column set via .range()
    // pagination — a bare row limit silently truncates aggregates at
    // scale (the register's LOW finding). Pages of 1,000 until a
    // short page, hard-capped at 200 pages as a runaway guard.
    // deno-lint-ignore no-explicit-any
    const fetchAll = async (table: string, columns: string, apply?: (q: any) => any): Promise<any[]> => {
      const PAGE = 1000;
      // deno-lint-ignore no-explicit-any
      const rows: any[] = [];
      for (let from = 0; from < PAGE * 200; from += PAGE) {
        // deno-lint-ignore no-explicit-any
        let q: any = admin.from(table).select(columns);
        if (apply) q = apply(q);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    };

    // ---- spaces ----
    const { count: spacesTotal } = await admin.from('spaces').select('id', { count: 'exact', head: true });
    const spaceTypes = await fetchAll('spaces', 'type');
    const byType: Record<string, number> = {};
    for (const s of spaceTypes) byType[s.type] = (byType[s.type] ?? 0) + 1;

    const { count: membersTotal } = await admin
      .from('space_members')
      .select('space_id', { count: 'exact', head: true });

    // ---- notes ----
    const { count: notesTotal } = await admin.from('notes').select('id', { count: 'exact', head: true });
    const noteByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    // Only the 14-day window feeds the chart — fetch it fully
    // (paginated), not the 2,000 most recent rows overall.
    const windowStart = new Date(`${days[0]}T00:00:00.000Z`);
    const recentNotes: Array<{ created_at: string }> = [];
    for (let from = 0; from < 200_000; from += 1000) {
      const { data, error } = await admin
        .from('notes')
        .select('created_at')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      recentNotes.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    for (const n of recentNotes) {
      const d = (n.created_at as string).slice(0, 10);
      if (d in noteByDay) noteByDay[d]++;
    }

    // ---- items ----
    const { count: itemsTotal } = await admin.from('items').select('id', { count: 'exact', head: true });
    const itemKinds = await fetchAll('items', 'kind');
    const byKind: Record<string, number> = {};
    for (const k of itemKinds) byKind[k.kind] = (byKind[k.kind] ?? 0) + 1;

    // ---- invites ----
    const { count: invitesCount } = await admin.from('space_invites').select('id', { count: 'exact', head: true });
    const invites = await fetchAll('space_invites', 'used_count');
    const invitesTotal = invitesCount ?? invites.length;
    const invitesUsed = invites.reduce((a, r) => a + (r.used_count ?? 0), 0);

    // ---- limits / subscriptions (manual side until Stripe is wired) ----
    const profs = await fetchAll('profiles', 'id, family_slots, chat_retention_days, trash_retention_days, secret_vaults_limit, custom_tabs_limit');
    const famSpaces = await fetchAll('spaces', 'owner_id', (q) => q.eq('type', 'family'));
    const famCount: Record<string, number> = {};
    for (const s of famSpaces) famCount[s.owner_id] = (famCount[s.owner_id] ?? 0) + 1;
    const emailById: Record<string, string | null> = {};
    const createdById: Record<string, string> = {};
    for (const u of users) {
      emailById[u.id] = u.email;
      createdById[u.id] = u.created_at;
    }
    // "above free" uses LAUNCH free-tier values (testing defaults are higher)
    const isAboveFree = (p: Record<string, number | null>) =>
      (p.family_slots ?? 1) > 1 ||
      (p.secret_vaults_limit ?? 1) > 1 ||
      (p.trash_retention_days ?? 0) > 0 ||
      (p.chat_retention_days ?? 7) > 7 ||
      (p.custom_tabs_limit ?? 3) > 3;
    const limitUsers = profs
      .map((p) => ({
        id: p.id,
        email: emailById[p.id] ?? null,
        created_at: createdById[p.id] ?? null,
        family_spaces: famCount[p.id] ?? 0,
        family_slots: p.family_slots ?? 1,
        chat_retention_days: p.chat_retention_days ?? 7,
        trash_retention_days: p.trash_retention_days ?? 0,
        secret_vaults_limit: p.secret_vaults_limit ?? 1,
        custom_tabs_limit: p.custom_tabs_limit ?? 3,
        above_free: isAboveFree(p as Record<string, number | null>),
      }))
      .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1));

    return ok({
      users: { total: users.length, by_day: days.map((d) => ({ day: d, n: userByDay[d] })), recent },
      spaces: { total: spacesTotal ?? 0, by_type: byType },
      members: membersTotal ?? 0,
      notes: { total: notesTotal ?? 0, by_day: days.map((d) => ({ day: d, n: noteByDay[d] })) },
      items: { total: itemsTotal ?? 0, by_kind: byKind },
      invites: { total: invitesTotal, used: invitesUsed },
      limits: {
        total: limitUsers.length,
        above_free: limitUsers.filter((u) => u.above_free).length,
        users: limitUsers.slice(0, 200),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    console.error('admin-stats failed:', msg);
    return err(msg, 500);
  }
});
