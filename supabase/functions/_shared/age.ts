// 18+ age-gate math (owner Decision #5: launch is 18+ only).
// Canonical implementation — packages/voice-engine/src/age.ts carries
// the identical logic for the app, and the unit suite pins BOTH
// against the same boundary cases so they cannot drift apart.
//
// Rules: strict YYYY-MM-DD parsing (anything else is undeclared);
// age is full years on the given date; a Feb-29 birthday turns a
// year older on Mar 1 in non-leap years (the (month, day) tuple
// comparison gives this naturally).

export function parseBirthDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Full years of age on `on` (UTC), or null when undeclared/invalid. */
export function ageOn(birthDate: unknown, on: Date = new Date()): number | null {
  const iso = parseBirthDate(birthDate);
  if (!iso) return null;
  const [by, bm, bd] = iso.split('-').map(Number);
  const oy = on.getUTCFullYear(), om = on.getUTCMonth() + 1, od = on.getUTCDate();
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age;
}

/** True only for a declared birth date that is 18+ on `on`. */
export function isAdult(birthDate: unknown, on: Date = new Date()): boolean {
  const a = ageOn(birthDate, on);
  return a !== null && a >= 18;
}

export function ageGateMessage(uiAr: boolean): string {
  return uiAr
    ? 'موجود مخصص للبالغين (18+). أكّد تاريخ ميلادك من شاشة البداية حتى تكمل.'
    : 'Mawjood is for adults (18+). Please confirm your date of birth on the start screen to continue.';
}
