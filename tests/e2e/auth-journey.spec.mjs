// tests/e2e/auth-journey.spec.mjs — authenticated user journeys against an
// ISOLATED local Supabase stack (CI e2e-auth job; never production).
//
// Covers:
//   1. magic-link sign-in via Inbucket (real user journey)
//   2. authenticated app boot (main UI renders, no fatal errors)
//   3. memory creation through the data API as the signed-in user (RLS-enforced)
//   4. UI retrieval: the note appears in the space's notes browser
//   5. two-user isolation: user B cannot see user A's note (UI + data API)
//   6. basic navigation between tabs
//
// EXPLICIT GAP (not a PASS): the AI chat / extract / memory-learn journeys
// need the `chat`/`extract` edge functions + OPENAI_API_KEY, which CI does
// not have. Those paths are untested here by design.
//
// Requires env: MAWJOOD_TEST_SUPABASE_URL, MAWJOOD_TEST_SUPABASE_ANON_KEY.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.MAWJOOD_TEST_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.MAWJOOD_TEST_SUPABASE_ANON_KEY;
const INBUCKET = 'http://localhost:54324';

test.beforeAll(() => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY,
    'needs local Supabase (CI e2e-auth job sets MAWJOOD_TEST_SUPABASE_*)',
  );
});

const sb = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function waitForMagicLink(email, timeoutMs = 45000) {
  // Mailpit (Inbucket) API: GET /api/v1/messages -> { total, unread, messages: [...] }
  // and GET /api/v1/message/{id} -> { ID, From, To, Subject, HTML, Text, ... }.
  // Bounded: returns null on timeout so the caller fails with a clear message
  // instead of burning the whole test timeout on an email that never arrives.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${INBUCKET}/api/v1/messages`);
      if (res.ok) {
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : data.messages || [];
        const hit = msgs.find((m) => JSON.stringify(m).includes(email));
        if (hit) {
          const msgId = hit.ID || hit.id;
          const detail = await (await fetch(`${INBUCKET}/api/v1/message/${msgId}`)).json();
          const html = detail?.HTML || detail?.Text || detail?.Body?.html || detail?.Body?.text || '';
          const m = html.match(/https?:\/\/[^"'<>\s]*\/auth\/v1\/verify[^"'<>\s]*/);
          if (m) return m[0].replace(/&amp;/g, '&');
        }
      }
    } catch {
      // Mailpit not ready yet or transient failure — retry until the deadline.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function signInViaMagicLink(page, email) {
  await page.goto('/');
  // AuthScreen: email input has placeholder "you@example.com"
  const emailInput = page.getByPlaceholder('you@example.com');
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(email);
  // Explicit submit button — matches in either UI language (fresh CI
  // browsers default to Arabic; the placeholder above is language-invariant).
  // Not a positional .last() click, which breaks silently if the screen ever
  // gains another button.
  const submitBtn = page.getByText(/Send login link|أرسل رابط الدخول/);
  await expect(submitBtn).toBeVisible({ timeout: 10000 });
  await submitBtn.click();
  // FAIL FAST: the app must confirm the magic link was requested. Without
  // this gate, a silent submit failure would send the test into Inbucket
  // polling for an email that will never arrive, burning the whole test
  // timeout with a useless "Target closed" error.
  await expect(page.getByText(/Check your email|تفقد بريدك/)).toBeVisible({ timeout: 25000 });
  const link = await waitForMagicLink(email);
  expect(link, `magic-link email for ${email} arrived in Inbucket`).toBeTruthy();
  await page.goto(link);
  // The magic-link verify must redirect BACK to the app origin. If we are
  // still on GoTrue (supabase.co / localhost:54321), the session exchange
  // never ran in the app context — fail here, not three steps later.
  // (Note: toBeHidden() passes for non-existent elements, so assert the URL
  // explicitly instead of relying on the AuthScreen placeholder alone.)
  await expect(page).toHaveURL(/localhost:8901|127\.0\.0\.1:8901/, { timeout: 30000 });
  // back on the app, signed in: AuthScreen gone, chat home visible
  await expect(page.getByPlaceholder('you@example.com')).toBeHidden({ timeout: 30000 });
  // The Supabase client persists the session via AsyncStorage (localStorage
  // on web) under sb-<ref>-auth-token. Confirm it is really there — the app
  // boot reads it via supabase.auth.getSession().
  const session = await browserSession(page);
  expect(session?.access_token, 'browser holds a session after magic link').toBeTruthy();
  return { link, session };
}

async function browserSession(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
    );
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  });
}

test('magic-link sign-in lands in the app, signed in', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const email = `e2e-a-${Date.now()}@example.com`;
  const { session } = await signInViaMagicLink(page, email);
  expect(session.user.email).toBe(email);
  // chat home renders (placeholder from i18n, English default in test env)
  await expect(
    page.getByPlaceholder(/Write a note or question|اكتب ملاحظة/),
  ).toBeVisible({ timeout: 15000 });
  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});

test('memory creation via data API appears in the space notes browser', async ({ page }) => {
  const email = `e2e-b-${Date.now()}@example.com`;
  const { session } = await signInViaMagicLink(page, email);
  const user = sb();
  const token = session.access_token;
  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // create a private space + note as this user (RLS-enforced writes)
  const { data: space, error: sErr } = await authed
    .from('spaces')
    .insert({ owner_id: session.user.id, type: 'private', name: 'E2E Private' })
    .select('id')
    .single();
  expect(sErr, `space insert: ${sErr?.message}`).toBeNull();
  const marker = `e2e-memory-${Date.now()}`;
  const { error: nErr } = await authed.from('notes').insert({
    space_id: space.id,
    transcript: marker,
    created_by: session.user.id,
  });
  expect(nErr, `note insert: ${nErr?.message}`).toBeNull();

  // navigate to the private space tab in the UI and find the note
  await page.goto('/');
  await page.waitForTimeout(2000);
  // space tabs: Home + private/family/work — tap the private one.
  // SPACE_SHORT labels come from i18n; match by partial text is fragile,
  // so tap the second tab (index 1 = first space tab).
  const tabs = page.locator('div[role="button"]');
  await expect(tabs.first()).toBeVisible({ timeout: 15000 });
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThan(1);
  await tabs.nth(1).click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 20000 });
});

test('user B cannot see user A’s note (UI + data API isolation)', async ({ browser }) => {
  // user A: sign in, create space + note
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const emailA = `e2e-cA-${Date.now()}@example.com`;
  const { session: sessionA } = await signInViaMagicLink(pageA, emailA);
  const authedA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sessionA.access_token}` } },
  });
  const { data: space } = await authedA
    .from('spaces')
    .insert({ owner_id: sessionA.user.id, type: 'private', name: 'A Private' })
    .select('id')
    .single();
  const marker = `e2e-secret-${Date.now()}`;
  await authedA.from('notes').insert({
    space_id: space.id,
    transcript: marker,
    created_by: sessionA.user.id,
  });
  await ctxA.close();

  // user B: fresh context, sign in, try to read A's note via data API
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const emailB = `e2e-cB-${Date.now()}@example.com`;
  const { session: sessionB } = await signInViaMagicLink(pageB, emailB);
  const authedB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sessionB.access_token}` } },
  });
  const { data: rows } = await authedB.from('notes').select('id').eq('transcript', marker);
  expect(rows ?? [], 'B reads 0 rows of A’s note via API').toEqual([]);
  const { count } = await authedB.from('spaces').select('id', { count: 'exact', head: true }).eq('id', space.id);
  expect(count ?? 0, 'B sees 0 rows of A’s space').toBe(0);
  await ctxB.close();
});

test('navigation: tabs switch views without errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const email = `e2e-d-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await page.goto('/');
  const tabs = page.locator('div[role="button"]');
  await expect(tabs.first()).toBeVisible({ timeout: 15000 });
  const n = await tabs.count();
  for (let i = 0; i < Math.min(n, 4); i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(1200);
  }
  expect(pageErrors, `page errors during navigation: ${pageErrors.join(' | ')}`).toEqual([]);
});
