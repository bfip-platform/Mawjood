// migrate-lib.mjs — shared by migrate-check.mjs (pg, CI) and any local
// PGlite-based runner. One source of truth for stubs + assertions.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// MIGRATIONS_DIR override lets us verify a modified copy (e.g. proving the
// harness catches a known-bad migration).
export const MIGRATIONS = process.env.MIGRATIONS_DIR || join(ROOT, 'supabase', 'migrations');

export function neutralize(sql) {
  // pg_cron / pg_net / pgcrypto are Supabase-provided extensions.
  // pg_cron and pg_net cannot be installed on vanilla Postgres and neither
  // is exercised at migrate time, so their lines become no-ops.
  // pgcrypto IS installed by the harness itself (real when the server has
  // it, stubbed otherwise), so the per-file line is dropped to avoid a
  // double-install failing on servers without contrib.
  return sql
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_cron\s*;/gi, '-- [stubbed] pg_cron extension (Supabase platform)')
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_net\s*;/gi, '-- [stubbed] pg_net extension (Supabase platform)')
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/gi, '-- [harness] pgcrypto installed by migrate harness');
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
}

export function readMigration(f) {
  return neutralize(readFileSync(join(MIGRATIONS, f), 'utf8'));
}

export const STUBS = `
-- Supabase platform roles (exist on every Supabase project)
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- auth schema (Supabase Auth)
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;

-- storage schema (Supabase Storage) — column subset our migrations touch
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false not null
);
insert into storage.buckets (id, name, public)
  values ('voice-notes','voice-notes',true), ('item-photos','item-photos',true)
  on conflict (id) do nothing;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);
create or replace function storage.foldername(name text)
  returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;

-- realtime publication (Supabase platform; 0004 adds tables to it)
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- cron schema (pg_cron stub) — records jobs so we can assert they exist
create schema if not exists cron;
create table if not exists cron._jobs (jobname text primary key, schedule text, command text);
create or replace function cron.schedule(p_jobname text, p_schedule text, p_command text)
  returns bigint language plpgsql as $$
  begin
    insert into cron._jobs(jobname, schedule, command) values (p_jobname, p_schedule, p_command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
    return 1;
  end $$;
create or replace function cron.unschedule(p_jobname text)
  returns boolean language plpgsql as $$
  begin
    delete from cron._jobs where jobname = p_jobname;
    return true;
  end $$;
`;

export const PGCRYPTO_FALLBACK = `
  create or replace function gen_salt(t text, i int default 6) returns text
    language sql immutable as $$ select '$2b$10$' || md5(random()::text) $$;
  create or replace function crypt(p text, s text) returns text
    language sql immutable as $$ select '$2b$10$stub$' || md5(p || s) $$;`;

export const ASSERTIONS = [
  {
    name: 'secret_code plaintext column is gone (0028)',
    sql: `select count(*)::int = 0 as ok from information_schema.columns
          where table_schema='public' and table_name='secret_vault' and column_name='secret_code'`,
  },
  {
    name: 'secret_code_hash exists (0028)',
    sql: `select count(*)::int = 1 as ok from information_schema.columns
          where table_schema='public' and table_name='secret_vault' and column_name='secret_code_hash'`,
  },
  {
    name: 'voice-notes + item-photos buckets are private (0029)',
    sql: `select bool_and(public = false) as ok from storage.buckets
          where id in ('voice-notes','item-photos')`,
  },
  {
    name: 'item-photos read policy exists (0029)',
    sql: `select count(*)::int = 1 as ok from pg_policies
          where schemaname='storage' and tablename='objects' and policyname='item_photos_owner_read'`,
  },
  {
    name: 'storage.objects has RLS enabled',
    sql: `select relrowsecurity as ok from pg_class
          join pg_namespace n on n.oid = relnamespace
          where n.nspname='storage' and relname='objects'`,
  },
  {
    name: 'reminder cron jobs scheduled',
    sql: `select count(*)::int >= 1 as ok from cron._jobs
          where jobname in ('mawjood-due-reminders','mawjood-watch-reminders')`,
  },
  {
    name: 'items status allows trashed (0035)',
    sql: `select pg_get_constraintdef(oid) like '%trashed%' as ok from pg_constraint
          where conname = 'items_status_check'`,
  },
  {
    name: 'trash retention floor trigger exists (0035)',
    sql: `select count(*)::int = 1 as ok from pg_trigger
          where tgname = 'profiles_trash_floor' and not tgisinternal`,
  },
  {
    name: 'pending_actions accepts forget_memory + superseded (0036)',
    sql: `select (pg_get_constraintdef(oid) like '%forget_memory%') as ok from pg_constraint
          where conname = 'pending_actions_action_type_check'`,
  },
  {
    name: 'pending_actions status accepts executing — atomic claim state (0037)',
    sql: `select (pg_get_constraintdef(oid) like '%executing%') as ok from pg_constraint
          where conname = 'pending_actions_status_check'`,
  },
  {
    name: 'pending_actions.expires_at defaults to ~30 minutes (0034)',
    sql: `select (column_default like '%00:30:00%' or column_default like '%30 minutes%') as ok
          from information_schema.columns
          where table_schema = 'public' and table_name = 'pending_actions' and column_name = 'expires_at'`,
  },
  {
    name: 'can_read_photo binds sponsoring note to its author (0038)',
    sql: `select (pg_get_functiondef('public.can_read_photo(text,text)'::regprocedure) like '%created_by%') as ok`,
  },
  {
    name: 'notes authorship immutability trigger exists (0039)',
    sql: `select count(*)::int = 1 as ok from pg_trigger
          where tgname = 'notes_preserve_authorship' and not tgisinternal
            and tgrelid = 'public.notes'::regclass and tgenabled = 'O'`,
  },
  {
    name: 'claim_invite_use exists and is service-role only (0040)',
    sql: `select (has_function_privilege('service_role', 'public.claim_invite_use(uuid)', 'execute')
                 and not has_function_privilege('authenticated', 'public.claim_invite_use(uuid)', 'execute')) as ok`,
  },
  {
    name: 'pending_actions accepts merge_memory (0041)',
    sql: `select (pg_get_constraintdef(oid) like '%merge_memory%') as ok from pg_constraint
          where conname = 'pending_actions_action_type_check'`,
  },
  {
    name: 'items has updated_at + touch trigger (0042)',
    sql: `select (
            exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'items' and column_name = 'updated_at')
            and exists (select 1 from pg_trigger
                        where tgname = 'items_touch_updated_at' and tgrelid = 'public.items'::regclass and tgenabled = 'O')
          ) as ok`,
  },
  {
    name: 'D3 search indexes exist (0043)',
    sql: `select (
            (select count(*) from pg_indexes where schemaname = 'public'
             and indexname in ('items_title_trgm','items_details_trgm','notes_transcript_trgm','items_note_id_idx','items_space_kind_status_idx')) = 5
            and exists (select 1 from pg_extension where extname = 'pg_trgm')
          ) as ok`,
  },
  {
    name: 'ai spend ledger is atomic + service-role only (0044)',
    sql: `select (has_function_privilege('service_role', 'public.try_charge_ai_spend(uuid,date,numeric,numeric)', 'execute')
                 and not has_function_privilege('authenticated', 'public.try_charge_ai_spend(uuid,date,numeric,numeric)', 'execute')
                 and not has_function_privilege('anon', 'public.try_charge_ai_spend(uuid,date,numeric,numeric)', 'execute')
                 and (select relrowsecurity from pg_class where oid = 'public.ai_spend_daily'::regclass)) as ok`,
  },
  {
    name: 'profiles has birth_date for the 18+ gate (0045)',
    sql: `select exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'profiles'
                          and column_name = 'birth_date' and data_type = 'date') as ok`,
  },
  {
    name: 'items: no client policy covers DELETE (0046, F-LAUNCH-01)',
    sql: `select not exists (select 1 from pg_policies
                             where schemaname = 'public' and tablename = 'items'
                               and cmd in ('ALL', 'DELETE')) as ok`,
  },
  {
    name: 'hard_delete_items is definer + authenticated/service only (0046)',
    sql: `select (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'hard_delete_items' and p.prosecdef)
                  and has_function_privilege('authenticated', 'public.hard_delete_items(uuid[])', 'execute')
                  and has_function_privilege('service_role', 'public.hard_delete_items(uuid[])', 'execute')
                  and not has_function_privilege('anon', 'public.hard_delete_items(uuid[])', 'execute')) as ok`,
  },
  {
    name: 'shopping_lists: no client DELETE policy + list RPC grants (0046)',
    sql: `select (not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'shopping_lists'
                                and cmd in ('ALL', 'DELETE'))
                  and exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'shopping_lists'
                                and cmd = 'SELECT')
                  and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'hard_delete_shopping_list' and p.prosecdef)
                  and has_function_privilege('authenticated', 'public.hard_delete_shopping_list(uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.hard_delete_shopping_list(uuid)', 'execute')) as ok`,
  }
];
