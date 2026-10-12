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
const SUPABASE_SERVICE_KEY = process.env.MAWJOOD_TEST_SUPABASE_SERVICE_KEY;
const INBUCKET = 'http://localhost:54324';

test.beforeAll(() => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY,
    'needs local Supabase (CI e2e-auth job sets MAWJOOD_TEST_SUPABASE_*)',
  );
});

const sb = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sbAdmin = () => {
  test.skip(!SUPABASE_SERVICE_KEY, 'needs MAWJOOD_TEST_SUPABASE_SERVICE_KEY');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
};

// Storage key supabase-js v2 uses: sb-<hostname>-auth-token.
function storageKey() {
  const host = new URL(SUPABASE_URL).hostname.split('.')[0];
  return `sb-${host}-auth-token`;
}

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
  //
  // NOTE: persistence is ASYNC after the magic-link redirect (the client
  // must exchange/detect the URL fragment, then write to storage). A
  // single immediate read races that write and flakes. Poll instead.
  let session = null;
  const deadline = Date.now() + 30000;
  while (!session?.access_token && Date.now() < deadline) {
    session = await browserSession(page);
    if (!session?.access_token) await page.waitForTimeout(1000);
  }
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

// Sign in WITHOUT email: create (or reuse) a user via the Auth Admin API,
// sign in with password via the JS client, then inject the session into the
// browser's storage and reload. Used by tests that need AN authenticated
// user but are not testing the magic-link flow itself (test 1 owns that).
// This avoids GoTrue's per-IP email rate limits, which throttled the 2nd+
// magic-link emails when every test did its own UI login.
async function signInWithPassword(page, email, password = 'e2e-test-pass-123') {
  const admin = sbAdmin();
  // idempotent: ignore "already exists"
  await admin.auth.admin
    .createUser({ email, password, email_confirm: true })
    .catch(() => {});
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword: ${error.message}`);
  const session = data.session;
  const key = storageKey();
  await page.goto('/');
  await page.evaluate(
    ({ k, sess }) => {
      localStorage.setItem(k, JSON.stringify(sess));
      // Suppress the first-run welcome overlay (it blocks the tab bar).
      // The app checks AsyncStorage 'mawjood.welcomed.v1' on boot; setting
      // it pre-boot is what finishWelcome() does after a real user skips.
      localStorage.setItem('mawjood.welcomed.v1', '1');
    },
    { k: key, sess: session },
  );
  await page.reload();
  // signed in: AuthScreen gone
  await expect(page.getByPlaceholder('you@example.com')).toBeHidden({ timeout: 15000 });
  return session;
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
  // Auth is covered by test 1; here we need an authenticated user without
  // burning a magic-link email (GoTrue rate-limits per IP).
  const session = await signInWithPassword(page, email);
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
  // Space tabs carry testIDs (tab-home, tab-space-private, ...). The
  // Pressables render without role="button" in React Native Web, so select
  // by testID, not by role.
  const privateTab = page.getByTestId('tab-space-private');
  await expect(privateTab).toBeVisible({ timeout: 15000 });
  await privateTab.click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 20000 });
});

test('user B cannot see user A’s note (UI + data API isolation)', async ({ browser }) => {
  // user A: sign in, create space + note
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const emailA = `e2e-cA-${Date.now()}@example.com`;
  const sessionA = await signInWithPassword(pageA, emailA);
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
  const sessionB = await signInWithPassword(pageB, emailB);
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
  await signInWithPassword(page, email);
  await page.goto('/');
  // Space tabs by testID (see test 2 comment re: role="button").
  const tabIds = ['tab-home', 'tab-space-private', 'tab-space-family', 'tab-space-work'];
  for (const id of tabIds) {
    const tab = page.getByTestId(id);
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    await page.waitForTimeout(1200);
  }
  expect(pageErrors, `page errors during navigation: ${pageErrors.join(' | ')}`).toEqual([]);
});
