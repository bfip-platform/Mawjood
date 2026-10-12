/**
 * Telemetry janitor (D3 T-D3-2) — retention for OPERATIONAL tables only.
 *
 * The allowlist below is the entire universe of what the janitor may
 * ever delete from: rate-limit windows, AI telemetry, ops events. User
 * data tables (items, notes, spaces, chat_sessions, trash, …) are
 * structurally unreachable — the runner iterates THIS constant and
 * nothing else, and a name outside it is refused even if passed in.
 * Retention choices: rate-limit windows are minute/hour scoped (2 days
 * is generous); ai_events/ops_events feed cost + reliability analysis
 * (90 days).
 */
export interface JanitorTarget {
  table: string;
  column: string;
  days: number;
}

export const JANITOR_ALLOWLIST: readonly JanitorTarget[] = [
  { table: 'rate_limits', column: 'window_start', days: 2 },
  { table: 'ai_events', column: 'created_at', days: 90 },
  { table: 'ops_events', column: 'created_at', days: 90 },
] as const;

/** User-data tables that must NEVER be janitor targets (test-pinned). */
export const JANITOR_NEVER: readonly string[] = [
  'items', 'notes', 'spaces', 'space_members', 'space_tabs', 'space_invites',
  'chat_sessions', 'chat_messages', 'trash_bin', 'borrows', 'profiles',
  'pending_actions', 'vault_master', 'secret_vault', 'ai_governance',
];

export function isJanitorTarget(table: string): boolean {
  return JANITOR_ALLOWLIST.some((t) => t.table === table);
}

/** PURE: the cutoff instant for a target at `now`. */
export function janitorCutoff(target: JanitorTarget, now: Date): string {
  return new Date(now.getTime() - target.days * 86400000).toISOString();
}

type Supa = {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
};

/**
 * Run the janitor. Default is DRY-RUN (counts only). Execution requires
 * `execute: true` from the caller, and the edge function additionally
 * requires the JANITOR_ENABLED env kill-switch — two independent gates.
 * Deletes are batched by primary-key ranges for the bigint-id tables so
 * a first run against a bloated table cannot lock it for minutes.
 */
export async function runJanitor(
  supa: Supa,
  opts: { execute: boolean; now?: Date; batchSize?: number },
): Promise<{ table: string; would_delete: number; deleted: number }[]> {
  const now = opts.now ?? new Date();
  const batch = opts.batchSize ?? 1000;
  const out: { table: string; would_delete: number; deleted: number }[] = [];
  for (const target of JANITOR_ALLOWLIST) {
    const cutoff = janitorCutoff(target, now);
    // Count via the target's OWN timestamp column: rate_limits has no
    // `id` column, and a count query naming a missing column errors in
    // PostgREST — which would silently read as "0 rows" and skip the
    // leg forever (review N1).
    const { count } = await supa
      .from(target.table)
      .select(target.column, { count: 'exact', head: true })
      .lt(target.column, cutoff);
    const would = typeof count === 'number' ? count : 0;
    let deleted = 0;
    if (opts.execute && would > 0) {
      if (target.table === 'rate_limits') {
        // Composite PK, no id column: delete in 1-day window slices
        // (oldest first) so a first run against months of accumulated
        // minute-windows is never one giant statement against a hot
        // auth-path table (review N4c). Iteration-capped as a backstop.
        for (let i = 0; i < 400; i++) {
          const { data: oldest } = await supa
            .from(target.table)
            .select(target.column)
            .lt(target.column, cutoff)
            .order(target.column, { ascending: true })
            .limit(1);
          const first = (oldest ?? [])[0]?.[target.column];
          if (!first) break;
          const dayEnd = new Date(new Date(first).getTime() + 86400000).toISOString();
          const sliceEnd = dayEnd < cutoff ? dayEnd : cutoff;
          const { error } = await supa
            .from(target.table)
            .delete()
            .gte(target.column, first)
            .lt(target.column, sliceEnd);
          if (error) break;
          const { count: left } = await supa
            .from(target.table)
            .select(target.column, { count: 'exact', head: true })
            .lt(target.column, cutoff);
          const remaining = typeof left === 'number' ? left : 0;
          deleted = would - remaining;
          if (remaining === 0) break;
        }
      } else {
        // Batched by id ranges; iteration-capped as a backstop so a
        // delete that reports success without removing rows can never
        // spin forever (review N4a).
        for (let i = 0; i < 100; i++) {
          const { data: rows } = await supa
            .from(target.table)
            .select('id')
            .lt(target.column, cutoff)
            .order('id', { ascending: true })
            .limit(batch);
          const ids = (rows ?? []).map((r: { id: number }) => r.id);
          if (ids.length === 0) break;
          const { error } = await supa.from(target.table).delete().in('id', ids);
          if (error) break;
          deleted += ids.length;
          if (ids.length < batch) break;
        }
      }
    }
    out.push({ table: target.table, would_delete: would, deleted });
  }
  return out;
}
