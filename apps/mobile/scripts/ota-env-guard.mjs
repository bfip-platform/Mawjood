#!/usr/bin/env node
/**
 * OTA pre-publish environment guard (PR #57 hardening).
 *
 * Run BY the publish workflow as:
 *   eas env:exec --environment production -- node scripts/ota-env-guard.mjs
 * so it validates EXACTLY the environment the publisher will use
 * (`eas update --environment production`) — one source, no drift between
 * "the environment that was checked" and "the environment that ships".
 *
 * What it proves about the resolved Supabase configuration, WITHOUT ever
 * printing or logging the key (booleans only):
 *
 *  1. URL — exact string equality with the approved Scratch project URL.
 *     (Substring checks are forgeable — e.g. a host that merely CONTAINS
 *     the scratch ref — so equality is the only accepted test.)
 *
 *  2. Key provenance — the Supabase anon key is a JWT whose payload claims
 *     are the project's own issuance record. The guard decodes the
 *     payload (base64url, no signature material involved) and requires:
 *       ref  === the Scratch project ref
 *       role === 'anon'          (a service_role key here FAILS — it must
 *                                 never ship inside an app bundle)
 *       exp  in the future
 *       iss  (when URL-form) === the Scratch project URL
 *     This deterministically catches the realistic failure class —
 *     misconfiguration: a key issued for a DIFFERENT project (e.g.
 *     Production), the wrong key type, or an expired key. Cryptographic
 *     signature verification is deliberately NOT attempted: it would
 *     require the project's JWT secret in CI, which must never happen.
 *     A forged payload could only be planted by someone who already
 *     controls the EAS environment store itself.
 *
 *  3. Opaque keys — Supabase's newer `sb_publishable_…` keys are NOT JWTs
 *     and carry no claims to check. For those, this guard FAILS CLOSED
 *     unless the human dispatching the workflow supplies the explicit
 *     attestation CONFIRM_OPAQUE_KEY=KEY-VERIFIED-IN-DASHBOARD, meaning:
 *     "I copied this key from the Scratch project's own API settings
 *     page in the Supabase dashboard" (the dashboard page IS the
 *     provenance — a key shown there belongs to that project).
 *
 * Exit code 0 = publish may proceed; 1 = blocked. Every failure is
 * reported by name; no secret value, prefix, or fragment is ever printed.
 */
import { pathToFileURL } from 'node:url';

export const SCRATCH_URL = 'https://caimavjwasxiegjhxdsr.supabase.co';
export const SCRATCH_REF = 'caimavjwasxiegjhxdsr';
export const OPAQUE_CONFIRMATION = 'KEY-VERIFIED-IN-DASHBOARD';

function decodeJwtPayload(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Pure validation (unit-tested with fabricated keys).
 * @param {Record<string, string | undefined>} env
 * @param {number} [nowMs]
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function validateOtaEnv(env, nowMs = Date.now()) {
  const lines = [];
  let ok = true;
  const fail = (line) => {
    ok = false;
    lines.push(`FAIL ${line}`);
  };
  const pass = (line) => lines.push(`ok   ${line}`);

  // 1 — URL: exact equality with the approved Scratch project URL.
  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (url === SCRATCH_URL) pass('supabase URL: exact match with the approved Scratch project');
  else fail('supabase URL: NOT an exact match with the approved Scratch project');

  // 2/3 — key presence, then provenance by form.
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!key) {
    fail('anon key: MISSING');
    return { ok, lines };
  }
  pass('anon key: populated');

  const payload = decodeJwtPayload(key);
  if (payload) {
    pass('anon key form: JWT (claims checked below)');
    if (payload.ref === SCRATCH_REF) pass('anon key claim ref: matches the Scratch project');
    else fail('anon key claim ref: does NOT match the Scratch project');
    if (payload.role === 'anon') pass("anon key claim role: 'anon'");
    else fail("anon key claim role: NOT 'anon' (a non-anon key must never ship in an app bundle)");
    if (typeof payload.exp === 'number' && payload.exp * 1000 > nowMs) pass('anon key claim exp: in the future');
    else fail('anon key claim exp: missing or expired');
    if (typeof payload.iss === 'string' && payload.iss.startsWith('https://')) {
      if (payload.iss === SCRATCH_URL) pass('anon key claim iss: matches the Scratch project URL');
      else fail('anon key claim iss: URL-form issuer does NOT match the Scratch project');
    }
  } else {
    pass('anon key form: opaque (no JWT claims to verify)');
    if (env.CONFIRM_OPAQUE_KEY === OPAQUE_CONFIRMATION) {
      pass('opaque-key attestation: dispatcher confirmed dashboard provenance');
    } else {
      fail(
        'opaque-key attestation: MISSING — an opaque key cannot be verified automatically; ' +
          `the dispatcher must attest dashboard provenance (${OPAQUE_CONFIRMATION})`,
      );
    }
  }

  return { ok, lines };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ok, lines } = validateOtaEnv(process.env);
  for (const line of lines) console.log(`[ota-env-guard] ${line}`);
  console.log(`[ota-env-guard] ${ok ? 'PASS — publish may proceed' : 'BLOCKED — publish must not proceed'}`);
  process.exit(ok ? 0 : 1);
}
