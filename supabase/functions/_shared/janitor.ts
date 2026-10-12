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
    const { count } = await supa
      .from(target.table)
      .select('id', { count: 'exact', head: true })
      .lt(target.column, cutoff);
    const would = typeof count === 'number' ? count : 0;
    let deleted = 0;
    if (opts.execute && would > 0) {
      if (target.table === 'rate_limits') {
        // Composite PK, no id column: the window range itself is small.
        const { error } = await supa.from(target.table).delete().lt(target.column, cutoff);
        if (!error) deleted = would;
      } else {
        for (;;) {
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
