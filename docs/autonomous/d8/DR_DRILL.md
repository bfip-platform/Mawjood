# DR drill — backup/restore procedure proof (D8 T-D8-2)

Executed 2026-10-12 on the SCRATCH project (`caimavjwasxiegjhxdsr`) via the Management API. Production was never touched.

## Protocol (logical, table-slice level)

1. **Pre-state:** take a deterministic slice (500 bench items), record count + integrity checksum `md5(string_agg(id || title))`.
2. **Backup:** `CREATE TABLE dr_backup_items AS SELECT …` (in-database logical snapshot).
3. **Simulated loss:** `DELETE` the slice; verify 0 rows remain.
4. **Restore:** `INSERT … SELECT` from the snapshot (conflict-safe); re-verify count + checksum.
5. **Cleanup:** drop the snapshot; verify global counts unchanged.

## Measured results

| Phase | Result | Time |
|---|---|---|
| Pre-state | 500 rows, checksum `330a6f7d503a70c32ca01e442e11b0af` | 1.8s (incl. API) |
| Backup snapshot | 500 rows | 0.8s |
| Simulated loss | 0 rows remain | 0.9s |
| Restore + verify | 500 rows, checksum **identical** | 0.9s |
| Cleanup | snapshot dropped; items total back to 100,001 | 1.2s |

**Procedure RTO** at this scale: the restore itself is seconds; end-to-end (detect → decide → snapshot-restore → verify) is a minutes-scale human procedure using this runbook. **Data integrity: proven** (checksum equality, not row-count-only).

## What this does and does not prove (read before citing)

- PROVES: the logical backup/restore procedure works on the real schema; verification by checksum catches silent corruption; the scratch environment is a faithful rehearsal target.
- DOES NOT prove platform-level recovery: point-in-time recovery (PITR) and automated daily backups are **plan features**. The production project must be checked for its plan/backup posture by the owner (dashboard) — on Free-tier settings there is no PITR, and RPO would be "since the last manual snapshot," which is not a launch-acceptable posture for real user memories. **Launch-gate item:** owner confirms production backup plan (Supabase Pro daily backups or PITR add-on) — see LAUNCH_GATE.md.
- Storage objects (photos) are NOT covered by table snapshots; the photo bucket needs its own export cadence in production operations (owner-infra; noted in the runbook).
