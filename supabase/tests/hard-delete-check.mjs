// F-LAUNCH-01 Option B — behavioral proof on REAL PostgreSQL.
// Run AFTER migrate-check has built the mawjood_migtest database
// (DATABASE_URL points at any database on the same server).
//
// The migtest harness stubs auth.uid() to NULL; this script replaces it
// (test fixture only) with the claims-based definition real Supabase uses,
// and grants the platform-default table privileges to anon/authenticated
// so that ROW LEVEL SECURITY — not table grants — is what is exercised.
//
// Contract under test (migration 0046):
//   1. Direct DELETE by space owner and by space member affects 0 rows.
//   2. hard_delete_items by owner and by member deletes (member semantics
//      preserved — the app's trash/delete-forever flows keep working).
//   3. Outsider call raises 42501; a mixed batch raises and deletes
//      NOTHING (all-or-nothing atomicity).
//   4. anon cannot execute the RPC at all (no grant).
//   5. Member INSERT/UPDATE still work (policy-split regression check).
//   6. Concurrency: parallel RPC calls over the same ids delete each row
//      exactly once, no errors.
//   7. Rollback SQL restores the pre-0046 posture (direct delete works),
//      and re-applying 0046 closes it again.
//   8. service_role direct delete (engine purge / account erasure) is
//      unaffected throughout.
// Exit code 0 only if every assertion holds.
import pg from 'pg';
import { readFileSync } from 'node:fs';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) { console.error('DATABASE_URL required'); process.exit(1); }
const url = baseUrl.replace(/\/[^/]*$/, '/mawjood_migtest');

const A = 'aaaaaaaa-0000-4000-8000-000000000001'; // space owner
const B = 'bbbbbbbb-0000-4000-8000-000000000002'; // space member
const C = 'cccccccc-0000-4000-8000-000000000003'; // outsider (own space)
const S = 'dddddddd-0000-4000-8000-00000000000s'.replace('s', '1'); // A's space
const SC = 'dddddddd-0000-4000-8000-000000000002'; // C's space
const item = (n) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} ${detail}`); }
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();

async function asUser(uid, role = 'authenticated') {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`set role ${role}`);
  if (uid) await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid })]);
  return c;
}
const exists = async (id) => (await admin.query('select 1 from public.items where id = $1', [id])).rowCount > 0;

try {
  // ── fixture: claims-based auth.uid() + platform-default privileges ──────
  await admin.query(`create or replace function auth.uid() returns uuid language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$`);
  await admin.query('grant usage on schema public to anon, authenticated');
  await admin.query('grant select, insert, update, delete on all tables in schema public to anon, authenticated');
  await admin.query('alter role service_role bypassrls');
  await admin.query('grant all on all tables in schema public to service_role');

  // ── seed ────────────────────────────────────────────────────────────────
  await admin.query('delete from public.spaces where id in ($1, $2)', [S, SC]);
  await admin.query('delete from auth.users where id in ($1, $2, $3)', [A, B, C]);
  await admin.query('insert into auth.users (id) values ($1), ($2), ($3)', [A, B, C]);
  await admin.query('insert into public.profiles (id) values ($1), ($2), ($3) on conflict (id) do nothing', [A, B, C]);
  await admin.query('insert into public.spaces (id, owner_id, name, type) values ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [S, A, 'A space', 'private', SC, C, 'C space', 'private']);
  await admin.query('insert into public.space_members (space_id, user_id, role) values ($1, $2, $3)', [S, B, 'member']);
  const seed = async (id, space) => admin.query(
    'insert into public.items (id, space_id, kind, title, created_by) values ($1, $2, $3, $4, $5)',
    [id, space, 'task', 'proof item', A]);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) await seed(item(n), S);
  await seed(item(9), SC);

  // ── 1. direct deletes are dead for owner + member ──────────────────────
  let c = await asUser(A);
  let r = await c.query('delete from public.items where id = $1', [item(1)]);
  check('owner direct DELETE affects 0 rows', r.rowCount === 0 && (await exists(item(1))));
  await c.end();
  c = await asUser(B);
  r = await c.query('delete from public.items where id = $1', [item(1)]);
  check('member direct DELETE affects 0 rows', r.rowCount === 0 && (await exists(item(1))));
  // ── 5a. member writes still work ────────────────────────────────────────
  r = await c.query("update public.items set title = 'renamed' where id = $1", [item(1)]);
  check('member UPDATE still works (policy split)', r.rowCount === 1);
  r = await c.query('insert into public.items (space_id, kind, title, created_by) values ($1, $2, $3, $4) returning id', [S, 'task', 'member-added', B]);
  check('member INSERT still works (policy split)', r.rowCount === 1);
  const memberItem = r.rows[0].id;
  // ── 2a. member RPC delete (trash/delete-forever semantics preserved) ───
  r = await c.query('select public.hard_delete_items($1::uuid[]) as n', [[memberItem]]);
  check('member RPC deletes own-space item', r.rows[0].n === 1 && !(await exists(memberItem)));
  await c.end();

  // ── 2b. owner RPC batch ─────────────────────────────────────────────────
  c = await asUser(A);
  r = await c.query('select public.hard_delete_items($1::uuid[]) as n', [[item(1), item(2)]]);
  check('owner RPC batch deletes 2', r.rows[0].n === 2 && !(await exists(item(1))) && !(await exists(item(2))));
  await c.end();

  // ── 3. outsider + mixed-batch atomicity ─────────────────────────────────
  c = await asUser(C);
  let err = null;
  try { await c.query('select public.hard_delete_items($1::uuid[])', [[item(3)]]); } catch (e) { err = e; }
  check('outsider RPC raises 42501', err?.code === '42501' && (await exists(item(3))), err?.message);
  err = null;
  try { await c.query('select public.hard_delete_items($1::uuid[])', [[item(9), item(3)]]); } catch (e) { err = e; }
  check('mixed batch (own + foreign) raises and deletes NOTHING', err?.code === '42501' && (await exists(item(9))) && (await exists(item(3))));
  await c.end();

  // ── 4. anon: no RPC grant, no direct delete ─────────────────────────────
  c = await asUser(null, 'anon');
  err = null;
  try { await c.query('select public.hard_delete_items($1::uuid[])', [[item(3)]]); } catch (e) { err = e; }
  check('anon RPC call is denied (no EXECUTE grant)', !!err && (await exists(item(3))), err?.message);
  r = await c.query('delete from public.items where id = $1', [item(3)]);
  check('anon direct DELETE affects 0 rows', r.rowCount === 0 && (await exists(item(3))));
  await c.end();

  // ── 6. concurrency: 10 racers over the same 3 ids ───────────────────────
  const racers = await Promise.all(Array.from({ length: 10 }, async () => {
    const rc = await asUser(A);
    try {
      const rr = await rc.query('select public.hard_delete_items($1::uuid[]) as n', [[item(4), item(5), item(6)]]);
      return rr.rows[0].n;
    } finally { await rc.end(); }
  }));
  check('10 parallel RPC calls delete 3 rows exactly once, no errors',
    racers.reduce((a, b) => a + b, 0) === 3 && !(await exists(item(4))), JSON.stringify(racers));

  // ── 8. service_role unaffected ──────────────────────────────────────────
  c = await asUser(null, 'service_role');
  r = await c.query('delete from public.items where id = $1', [item(7)]);
  check('service_role direct delete still works (purge/erasure paths)', r.rowCount === 1);
  await c.end();

  // ── 7. rollback restores, re-apply closes ───────────────────────────────
  await admin.query(`drop function if exists public.hard_delete_items(uuid[]);
    drop policy if exists "items_member_insert" on public.items;
    drop policy if exists "items_member_update" on public.items;
    drop policy if exists "items_member_write" on public.items;
    create policy "items_member_write" on public.items for all
      using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));`);
  c = await asUser(A);
  r = await c.query('delete from public.items where id = $1', [item(8)]);
  check('after rollback, owner direct DELETE works again (pre-0046 posture)', r.rowCount === 1);
  await c.end();
  const mig46 = readFileSync(new URL('../migrations/0046_items_delete_rpc.sql', import.meta.url), 'utf8');
  await admin.query(mig46);
  await seed(item(8), S);
  c = await asUser(A);
  r = await c.query('delete from public.items where id = $1', [item(8)]);
  check('after re-applying 0046, direct DELETE is closed again', r.rowCount === 0 && (await exists(item(8))));
  await c.end();
} finally {
  await admin.query('delete from public.spaces where id in ($1, $2)', [S, SC]).catch(() => {});
  await admin.query('delete from auth.users where id in ($1, $2, $3)', [A, B, C]).catch(() => {});
  await admin.end();
}

console.log(failures === 0 ? '\n✅ hard-delete-check: ALL GREEN' : `\n❌ hard-delete-check: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
