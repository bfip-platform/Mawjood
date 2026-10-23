// Shopping-list status concurrency proof — REAL PostgreSQL, scratch DB only.
// Runs after migrate-check creates mawjood_migtest. A test-only BEFORE UPDATE
// trigger holds both transactions at the item write long enough to reproduce
// the exact stale-aggregate race this check guards against.
//
// Usage:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node supabase/tests/shopping-concurrency-check.mjs
import pg from 'pg';

const TEST_DB = 'mawjood_migtest';
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const db = new pg.Pool({ connectionString: baseUrl.replace(/\/[^/]*$/, `/${TEST_DB}`) });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
};

let userId;
let spaceId;
try {
  // The migration harness auth.uid() is intentionally a no-op. Replace it
  // with the same JWT-claims shim used by authz-behavioral.mjs.
  await db.query(`
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
    $$;`);

  userId = (await db.query('insert into auth.users default values returning id')).rows[0].id;
  spaceId = (await db.query(
    `insert into public.spaces (owner_id, type, name) values ($1, 'family', 'shopping concurrency check') returning id`,
    [userId],
  )).rows[0].id;

  // Test-only synchronization point. Without the parent-list row lock, both
  // item updates pause together, then both status calculations can see the
  // other transaction's item as still open. This trigger is dropped in the
  // finally block and exists only in the disposable migration-check DB.
  await db.query(`
    create or replace function public.test_shopping_concurrency_delay()
    returns trigger language plpgsql as $$
    begin
      if old.list_id is not null
         and new.title like 'shopping-concurrency-check:%'
         and old.status is distinct from new.status then
        perform pg_sleep(0.1);
      end if;
      return new;
    end;
    $$;
    create trigger test_shopping_concurrency_delay
      before update on public.items
      for each row execute function public.test_shopping_concurrency_delay();`);

  console.log('\n── concurrent item status updates on the same list');
  const rounds = 12;
  for (let round = 0; round < rounds; round += 1) {
    const listId = (await db.query(
      `insert into public.shopping_lists (space_id, title, created_by) values ($1, $2, $3) returning id`,
      [spaceId, `concurrency ${round}`, userId],
    )).rows[0].id;
    const itemIds = (await db.query(
      `insert into public.items (space_id, kind, title, list_id, created_by)
       values ($1, 'shopping', 'shopping-concurrency-check:a', $2, $3),
              ($1, 'shopping', 'shopping-concurrency-check:b', $2, $3)
       returning id`,
      [spaceId, listId, userId],
    )).rows.map((row) => row.id);

    const setStatusAsOwner = async (itemId) => {
      const c = await db.connect();
      try {
        await c.query('begin');
        await c.query('set local role authenticated');
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
        await c.query(`select * from public.set_shop_item_status($1, 'done')`, [itemId]);
        await c.query('commit');
      } catch (error) {
        await c.query('rollback').catch(() => {});
        throw error;
      } finally {
        c.release();
      }
    };

    // Separate connections ensure real server-side concurrency.
    await Promise.all(itemIds.map(setStatusAsOwner));
    const { rows } = await db.query(
      `select l.status as list_status,
              count(*) filter (where i.status = 'open')::int as open_items
       from public.shopping_lists l
       join public.items i on i.list_id = l.id
       where l.id = $1
       group by l.id`,
      [listId],
    );
    check(rows[0]?.list_status === 'done' && rows[0]?.open_items === 0,
      `round ${round + 1}/${rounds}: final list state matches both resolved items`);
  }
} finally {
  await db.query('drop trigger if exists test_shopping_concurrency_delay on public.items').catch(() => {});
  await db.query('drop function if exists public.test_shopping_concurrency_delay()').catch(() => {});
  if (spaceId) await db.query('delete from public.spaces where id = $1', [spaceId]).catch(() => {});
  if (userId) await db.query('delete from auth.users where id = $1', [userId]).catch(() => {});
  await db.end();
}

console.log('\n✅ shopping-concurrency-check: ALL GREEN');
