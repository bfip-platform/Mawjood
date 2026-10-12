// authz-behavioral.mjs — BEHAVIORAL authorization tests for Mawjood RLS.
//
// This is NOT a static audit (see rls-audit.mjs). It creates real users,
// spaces, notes, items and storage objects in the scratch database, then
// issues queries AS those users (simulated JWTs + role) and asserts what
// each user can actually see and change.
//
// HOW USERS ARE SIMULATED (honest scope):
//   The scratch DB has no Supabase Auth (GoTrue). We replace the harness's
//   `auth.uid()` stub with the realistic JWT-claims version
//   (nullif(current_setting('request.jwt.claims',true)::json->>'sub','')::uuid)
//   and set `request.jwt.claims` + `role` per scenario inside a transaction
//   (SET LOCAL). This exercises the REAL Postgres RLS policies with REAL
//   row visibility — the same policies production enforces.
//   What it does NOT test: GoTrue token issuance/validation, PostgREST,
//   Storage API, or edge-function logic. The trust assumption is that only
//   GoTrue can mint JWTs with a given `sub` (standard Supabase model).
//
// RUNS IN CI inside the rls-audit job, AFTER migrate-check builds the
// scratch database `mawjood_migtest`.
//
// Usage:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node supabase/tests/authz-behavioral.mjs
import pg from 'pg';

const TEST_DB = 'mawjood_migtest';
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail) => {
  failures++;
  console.error(`  ✗ ${name}${detail ? `\n    ${detail}` : ''}`);
};
const step = (msg) => console.log(`\n── ${msg}`);

// Run fn() inside a transaction as a given user (or anon when userId=null).
async function asUser(db, { userId = null, role = 'authenticated' } = {}, fn) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    if (userId) {
      await c.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
    }
    const out = await fn(c);
    await c.query('rollback');
    return out;
  } finally {
    c.release();
  }
}

try {
  const db = new pg.Pool({ connectionString: baseUrl.replace(/\/[^/]*$/, `/${TEST_DB}`) });

  step('installing realistic auth.uid() (JWT-claims based)');
  await db.query(`
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      -- nullif(..., '') guards a Postgres quirk: rolling back a SET LOCAL on a
      -- previously-unset custom GUC leaves the session value as '' (not NULL),
      -- and ''::json would raise. Real Supabase never emits '', but the pooled
      -- harness can observe it after a prior simulated user; treat as absent.
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
    $$;`);
  console.log('  auth.uid() now reads request.jwt.claims ->> sub (empty-claim safe)');

  step('mirroring Supabase default grants (RLS remains the enforcement boundary)');
  // A real Supabase project grants table access to anon/authenticated and lets
  // RLS policies decide row visibility. The scratch DB has no such grants, so
  // without this every simulated-user query fails with "permission denied"
  // before RLS is even evaluated. These grants replicate production; they do
  // not weaken any policy under test.
  await db.query(`
    grant usage on schema public to anon, authenticated;
    grant usage on schema storage to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all tables in schema storage to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
    grant all on all sequences in schema storage to anon, authenticated;`);
  console.log('  grants mirrored: anon/authenticated can reach tables; RLS decides rows');

  step('seeding users, spaces, notes, items, storage objects');
  // users
  const mk = async () => (await db.query(`insert into auth.users default values returning id`)).rows[0].id;
  const A = await mk(), B = await mk(), C = await mk();
  // A's private space + note + item
  const SA = (await db.query(`insert into public.spaces (owner_id, type, name) values ('${A}','private','A private') returning id`)).rows[0].id;
  const NA = (await db.query(`insert into public.notes (space_id, transcript, created_by) values ('${SA}','A secret note','${A}') returning id`)).rows[0].id;
  const IA = (await db.query(`insert into public.items (space_id, kind, title) values ('${SA}','task','A secret item') returning id`)).rows[0].id;
  // B's private space + note
  const SB = (await db.query(`insert into public.spaces (owner_id, type, name) values ('${B}','private','B private') returning id`)).rows[0].id;
  const NB = (await db.query(`insert into public.notes (space_id, transcript, created_by) values ('${SB}','B secret note','${B}') returning id`)).rows[0].id;
  // Family FA: owner A, member B. Family FB: owner B, member C.
  const FA = (await db.query(`insert into public.spaces (owner_id, type, name) values ('${A}','family','Fam A') returning id`)).rows[0].id;
  await db.query(`insert into public.space_members (space_id, user_id, role) values ('${FA}','${B}','member')`);
  const NFA = (await db.query(`insert into public.notes (space_id, transcript, created_by) values ('${FA}','Fam A note','${A}') returning id`)).rows[0].id;
  const FB = (await db.query(`insert into public.spaces (owner_id, type, name) values ('${B}','family','Fam B') returning id`)).rows[0].id;
  await db.query(`insert into public.space_members (space_id, user_id, role) values ('${FB}','${C}','member')`);
  const NFB = (await db.query(`insert into public.notes (space_id, transcript, created_by) values ('${FB}','Fam B note','${B}') returning id`)).rows[0].id;
  // storage objects: A's audio, B's photo (owner-folder convention)
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('voice-notes','${A}/audio1.m4a','${A}')`);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('item-photos','${B}/photo1.jpg','${B}')`);
  console.log('  seeded: 3 users, 4 spaces, 4 notes, 1 item, 2 storage objects');

  const count = async (c, sql, params = []) => Number((await c.query(sql, params)).rows[0].count);

  step('1. User A cannot read or modify User B’s private memories');
  {
    const n = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NB]));
    n === 0 ? ok('A sees 0 rows of B’s private note') : bad('A sees B’s private note', `rows=${n}`);
    const upd = await asUser(db, { userId: A }, (c) => c.query(`update public.notes set transcript='hacked' where id = $1`, [NB]));
    upd.rowCount === 0 ? ok('A’s UPDATE of B’s note affects 0 rows') : bad('A modified B’s note', `rowCount=${upd.rowCount}`);
    const del = await asUser(db, { userId: A }, (c) => c.query(`delete from public.notes where id = $1`, [NB]));
    del.rowCount === 0 ? ok('A’s DELETE of B’s note affects 0 rows') : bad('A deleted B’s note', `rowCount=${del.rowCount}`);
    const sp = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.spaces where id = $1`, [SB]));
    sp === 0 ? ok('A cannot even see B’s private space row') : bad('A sees B’s private space', `rows=${sp}`);
  }

  step('2. Family A cannot access Family B’s data (and vice versa)');
  {
    const n1 = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NFB]));
    n1 === 0 ? ok('A (not in Fam B) sees 0 rows of Fam B note') : bad('cross-family read', `rows=${n1}`);
    const n2 = await asUser(db, { userId: C }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NFA]));
    n2 === 0 ? ok('C (not in Fam A) sees 0 rows of Fam A note') : bad('cross-family read', `rows=${n2}`);
    // positive control: members CAN read their own family’s notes
    const p1 = await asUser(db, { userId: B }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NFA]));
    p1 === 1 ? ok('B (member of Fam A) reads Fam A note') : bad('member cannot read own family note', `rows=${p1}`);
  }

  step('3. Removed family members lose access');
  {
    await db.query(`delete from public.space_members where space_id = '${FA}' and user_id = '${B}'`);
    const n = await asUser(db, { userId: B }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NFA]));
    n === 0 ? ok('removed B sees 0 rows of Fam A note') : bad('removed member retains access', `rows=${n}`);
    const w = await asUser(db, { userId: B }, (c) => c.query(`insert into public.notes (space_id, transcript, created_by) values ('${FA}','smuggled','${B}')` ).then(() => 1).catch(() => 0));
    w === 0 ? ok('removed B cannot INSERT into Fam A') : bad('removed member can write', `inserted=${w}`);
    // B’s own private data still intact
    const p = await asUser(db, { userId: B }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NB]));
    p === 1 ? ok('B still reads own private note after removal') : bad('removal broke own access', `rows=${p}`);
  }

  step('4. Unauthorized users cannot access private files or audio');
  {
    const f1 = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from storage.objects where name = $1`, [`${B}/photo1.jpg`]));
    f1 === 0 ? ok('A cannot read B’s photo object') : bad('cross-user file read', `rows=${f1}`);
    const f2 = await asUser(db, { userId: null, role: 'anon' }, (c) => count(c, `select count(*) from storage.objects where bucket_id='voice-notes'`));
    f2 === 0 ? ok('anon sees 0 voice-note objects') : bad('anon file access', `rows=${f2}`);
    const f3 = await asUser(db, { userId: null, role: 'anon' }, (c) => count(c, `select count(*) from public.notes`));
    f3 === 0 ? ok('anon sees 0 notes') : bad('anon note access', `rows=${f3}`);
    // positive control: owner reads own file
    const p = await asUser(db, { userId: B }, (c) => count(c, `select count(*) from storage.objects where name = $1`, [`${B}/photo1.jpg`]));
    p === 1 ? ok('B reads own photo object') : bad('owner cannot read own file', `rows=${p}`);
  }

  step('5. Service-role cannot accidentally expose private data to lesser roles');
  {
    // service_role bypasses RLS by design (documented). The invariant under
    // test: NOTHING the service role does grants anon/authenticated new
    // access — i.e. no policy depends on anything except auth.uid().
    const { rows } = await db.query(`
      select schemaname, tablename, policyname, qual, with_check
      from pg_policies where schemaname in ('public','storage')`);
    const suspicious = rows.filter((r) => {
      const q = `${r.qual || ''} ${r.with_check || ''}`;
      // every user-data policy must be gated on auth.uid() (or a helper that uses it).
      // can_read_photo (0029) is allowlisted by name: verified SECURITY DEFINER with
      // search_path=public, body gates on auth.uid()+can_access_space, EXECUTE granted
      // only to authenticated (revoked from public/anon). Narrow, not a broad exception.
      return !/auth\.uid\(\)|is_space_owner|is_space_member|can_access_space|can_read_photo/.test(q);
    });
    suspicious.length === 0
      ? ok(`all ${rows.length} policies gate on auth.uid() or space-membership helpers`)
      : bad('policies not gated on auth.uid()', suspicious.map((r) => `${r.schemaname}.${r.tablename}.${r.policyname}`).join(', '));
    // no-JWT authenticated user sees nothing
    const z = await asUser(db, { userId: null, role: 'authenticated' }, (c) => count(c, `select count(*) from public.notes`));
    z === 0 ? ok('authenticated with no JWT sees 0 notes') : bad('null-uid access', `rows=${z}`);
  }

  step('6. Free/Plus transitions never delete saved memories');
  {
    // structural: no FK from user-data tables to billing tables with CASCADE
    const { rows } = await db.query(`
      select ccu.table_name as billing_table, tc.table_name as user_table
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and rc.delete_rule = 'CASCADE'
        and ccu.table_name in ('subscription_plans','subscription_grants','user_subscriptions','promotions')
        and tc.table_name not in ('subscription_plans','subscription_grants','user_subscriptions','promotions')`);
    rows.length === 0
      ? ok('no CASCADE from user-data tables into billing tables')
      : bad('dangerous cascade', JSON.stringify(rows));
    // behavioral: churn the billing rows, memories must survive + stay readable
    await db.query(`insert into public.subscription_grants (user_id, kind, value) values ('${A}','family_slots',5)`);
    await db.query(`delete from public.subscription_grants where user_id = '${A}'`);
    const n = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NA]));
    const i = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.items where id = $1`, [IA]));
    n === 1 && i === 1
      ? ok('A’s note + item survive grant deletion and stay readable')
      : bad('memories lost on billing change', `note=${n} item=${i}`);
  }

  step('positive controls — owners/members can use their own data');
  {
    const a1 = await asUser(db, { userId: A }, (c) => count(c, `select count(*) from public.notes where id = $1`, [NA]));
    a1 === 1 ? ok('A reads own private note') : bad('owner cannot read own note', `rows=${a1}`);
    const ins = await asUser(db, { userId: A }, (c) => c.query(`insert into public.notes (space_id, transcript, created_by) values ('${SA}','another','${A}') returning id`).then((r) => r.rows.length).catch(() => 0));
    ins === 1 ? ok('A inserts into own private space') : bad('owner cannot insert', `rows=${ins}`);
  }

  await db.end();
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  process.exit(2);
}

console.log(failures === 0 ? '\n✅ authz-behavioral: ALL GREEN' : `\n❌ authz-behavioral: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
