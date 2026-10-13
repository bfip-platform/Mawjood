// Spend-ledger concurrency proof — REAL PostgreSQL (owner audit, final
// correction). Designed for the rls-audit CI job against the same
// scratch database migrate-check builds (mawjood_migtest); the ci.yml
// step is pending the connector token's Workflows permission (see the
// audit register's CI-wiring caveat) — until it lands, this script is
// run manually against a migrated local/scratch database, so the
// atomic authorize+charge contract of migration 0044 is exercised
// against a real server, not just asserted from the SQL text.
//
// Contract under test (try_charge_ai_spend):
//   1. 50 PARALLEL charges of $0.10 against a $2.05 cap: exactly 20
//      succeed, 30 are rejected (NULL), and the final ledger total is
//      EXACTLY $2.00 — the cap is never crossed and no increment is
//      lost or duplicated under concurrency.
//   2. A single charge larger than the cap is rejected on an empty
//      ledger (the INSERT branch carries no WHERE — the function's
//      explicit guard must catch it).
//   3. Invalid inputs (negative amount, null cap, zero cap) reject.
//   4. Charges for different users/days are independent.
// Exit code 0 only if every assertion holds.
import pg from 'pg';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
const TEST_DB = 'mawjood_migtest';
const url = baseUrl.replace(/\/[^/]*$/, `/${TEST_DB}`);

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const DAY = '2026-10-12';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} ${detail}`); }
};

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`delete from public.ai_spend_daily where user_id in ($1, $2)`, [U1, U2]);

  // 1. Concurrency at the threshold: 50 racers, one shared pool client
  //    per racer (separate connections = true parallelism).
  const racers = await Promise.all(Array.from({ length: 50 }, async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const r = await c.query(`select public.try_charge_ai_spend($1::uuid, $2::date, 0.10, 2.05) as total`, [U1, DAY]);
      return r.rows[0].total;
    } finally {
      await c.end();
    }
  }));
  const succeeded = racers.filter((t) => t !== null).length;
  const rejected = racers.filter((t) => t === null).length;
  check('exactly 20 of 50 parallel charges succeed under a $2.05 cap', succeeded === 20, `got ${succeeded}`);
  check('the other 30 are rejected (NULL)', rejected === 30, `got ${rejected}`);
  const total = await client.query(`select public.ai_spend_total($1::uuid, $2::date) as t`, [U1, DAY]);
  check('final ledger total is EXACTLY 2.000000 (never past the cap, no lost increments)',
    String(total.rows[0].t) === '2.000000', `got ${total.rows[0].t}`);
  const rows = await client.query(`select count(*)::int as n from public.ai_spend_daily where user_id = $1`, [U1]);
  check('one ledger row per (user, day)', rows.rows[0].n === 1, `got ${rows.rows[0].n}`);

  // 2. Oversized first charge on a fresh user is rejected.
  const big = await client.query(`select public.try_charge_ai_spend($1::uuid, $2::date, 3.00, 2.05) as t`, [U2, DAY]);
  check('single charge > cap rejected on an empty ledger', big.rows[0].t === null);
  const bigTotal = await client.query(`select public.ai_spend_total($1::uuid, $2::date) as t`, [U2, DAY]);
  check('rejected oversized charge leaves no residue', String(bigTotal.rows[0].t) === '0.000000' || String(bigTotal.rows[0].t) === '0', `got ${bigTotal.rows[0].t}`);

  // 3. Invalid inputs reject.
  for (const [amt, cap] of [[-0.5, 2.05], [0.1, null], [0.1, 0]]) {
    const r = await client.query(`select public.try_charge_ai_spend($1::uuid, $2::date, $3, $4) as t`, [U2, DAY, amt, cap]);
    check(`invalid input (amount=${amt}, cap=${cap}) rejected`, r.rows[0].t === null);
  }

  // 4. Independence: another day for the capped user charges fine.
  const other = await client.query(`select public.try_charge_ai_spend($1::uuid, '2026-10-13'::date, 0.10, 2.05) as t`, [U1]);
  check('a new day resets the budget (per-day ledger)', other.rows[0].t !== null);

  await client.query(`delete from public.ai_spend_daily where user_id in ($1, $2)`, [U1, U2]);
} finally {
  await client.end();
}

if (failures > 0) {
  console.error(`\n❌ spend-ledger-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\n✅ spend-ledger-check: ALL GREEN');
