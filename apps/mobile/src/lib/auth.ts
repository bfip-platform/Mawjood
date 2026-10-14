// Real-account auth: email magic link for new users,
// and anonymous → permanent upgrade (keeps the same user id + all data).

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

function redirectUrl(): string | undefined {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return undefined;
    // land back on the app page itself; the client picks the session from the URL
    return window.location.href.split('#')[0].split('?')[0];
  }
  // Native (P1-1): the magic link must deep-link back into the app via the
  // `mawjood` scheme (app.json). The URL is allow-listed in the Supabase
  // project's Auth redirect URLs (see
  // docs/autonomous/launch/IOS_AUTH_REDIRECT_OWNER_STEPS.md). The session
  // is completed by completeAuthFromUrl() from the deep-link listener in
  // src/app/index.tsx; onAuthStateChange then re-runs boot().
  return Linking.createURL('auth-callback');
}

/** Send a magic-link sign-in email. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectUrl() },
  });
  if (error) throw error;
}

/**
 * Complete a native auth deep link (P1-1). Handles both return shapes:
 *  - PKCE:        mawjood://auth-callback?code=…  → exchangeCodeForSession
 *  - implicit:    mawjood://auth-callback#access_token=…&refresh_token=…
 *                 → setSession
 * Returns true when a session was established. Never throws — a malformed
 * or unrelated URL simply returns false and the caller ignores it.
 */
export async function completeAuthFromUrl(url: string): Promise<boolean> {
  try {
    if (!url) return false;
    const parsed = Linking.parse(url);
    const code = parsed.queryParams?.code;
    if (typeof code === 'string' && code.length > 0) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      return !error && !!data.session;
    }
    // Implicit flow carries the tokens in the fragment, which
    // Linking.parse does not surface — read them from the raw string.
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const fragment = new URLSearchParams(url.slice(hashIdx + 1));
      const access_token = fragment.get('access_token');
      const refresh_token = fragment.get('refresh_token');
      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        return !error && !!data.session;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Verify a 6-digit email OTP code (P1-1 fallback for native, where tapping
 * the magic link may not reach the app). The code is in the same email
 * Supabase sends for the magic link when the project uses OTP templates.
 * On success onAuthStateChange fires and the parent re-runs boot().
 */
export async function verifyEmailCode(
  email: string,
  token: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  return { error: error ?? null };
}

/**
 * Convert the current anonymous user into a permanent account.
 * Same user id → notes, items and spaces are preserved.
 * Supabase emails a confirmation link; the link completes the upgrade.
 */
export async function linkEmailToAnonymous(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: redirectUrl() },
  );
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
