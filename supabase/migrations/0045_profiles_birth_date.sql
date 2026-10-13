-- 0045: profiles.birth_date — the 18+ launch gate (owner Decision #5:
-- launch is 18+ only). Nullable: NULL means "not yet declared". The
-- app collects the declaration at first sign-in and blocks the main
-- UI until an adult birth date is stored; the chat edge function
-- refuses the AI surface for missing/under-18 declarations. The
-- value is self-declared (the launch-appropriate proportionate
-- control the owner approved); it is writable only by the profile
-- owner under the existing "profiles update own" RLS policy.

alter table public.profiles
  add column if not exists birth_date date;
