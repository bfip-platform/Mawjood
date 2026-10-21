/**
 * Due-date classification for agenda/tasks display (Privacy, Localization
 * and Daily Utility wave) — pure helpers, device-local day boundaries.
 *
 * An item's `due_at` is an absolute instant; "overdue" and "today" are
 * judged against the DEVICE's local calendar day (the user's own clock —
 * the same frame the agenda's week strip uses), never UTC, so a 9am
 * appointment is never "overdue" at 8am just because of a timezone offset.
 * Completed items are never overdue. Missing/invalid dates classify null.
 */

export type DueState = 'overdue' | 'today' | 'upcoming';

export interface DueLike {
  due_at?: string | null;
  status?: string | null;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dueState(item: DueLike, now: Date = new Date()): DueState | null {
  if (!item.due_at || item.status === 'done') return null;
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) return null;
  const todayStart = startOfLocalDay(now).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  if (due.getTime() < todayStart) return 'overdue';
  if (due.getTime() < tomorrowStart) return 'today';
  return 'upcoming';
}

export function isOverdue(item: DueLike, now: Date = new Date()): boolean {
  return dueState(item, now) === 'overdue';
}
