#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateOtaEnv, SCRATCH_URL } from './ota-env-guard.mjs';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const checks = [
  ['beta channel', eas.build?.production?.channel === 'beta'],
  ['EAS production environment', eas.build?.production?.environment === 'production'],
  ['Scratch URL in build profile', eas.build?.production?.env?.EXPO_PUBLIC_SUPABASE_URL === SCRATCH_URL],
  ['fingerprint runtime', app.runtimeVersion?.policy === 'fingerprint'],
  ['Expo updates project', app.updates?.url === 'https://u.expo.dev/8e464152-4348-424b-8632-9ebb5028837e'],
];
const resolved = validateOtaEnv(process.env);
checks.push(['Scratch runtime environment', resolved.ok]);
for (const [name, ok] of checks) console.log('[ota-preflight] ' + (ok ? 'PASS ' : 'FAIL ') + name);
for (const line of resolved.lines) console.log('[ota-preflight] ' + line);
if (checks.some(([,ok]) => !ok)) process.exitCode = 1;
