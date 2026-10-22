/** Shared user-facing name limits. Count Unicode code points, like PostgreSQL char_length. */
export const NAME_LIMITS = {
  profileDisplay: 60,
  familySpace: 20,
  customSpace: 40,
  customTab: 40,
  shoppingList: 80,
} as const;

export function nameCharacterCount(value: string): number {
  return Array.from(value).length;
}

export function assertNameLength(value: string, max: number, label = 'Name'): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} cannot be empty`);
  if (nameCharacterCount(clean) > max) throw new RangeError(`${label} cannot exceed ${max} characters`);
  return clean;
}

export function clampNameLength(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('');
}
