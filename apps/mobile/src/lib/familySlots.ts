/** Count only invited family spaces; every account already owns a starter Family space. */
export function countJoinedFamilies(
  spaces: { type: string; owner_id: string }[],
  userId: string | null,
): number {
  if (!userId) return 0;
  return spaces.filter((space) => space.type === 'family' && space.owner_id !== userId).length;
}
