-- Enforce app name limits at the database boundary and safely archive a tab's
-- notes into another space as part of one authorized transaction.

create or replace function public.enforce_user_name_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'space_tabs' and char_length(to_jsonb(new)->>'title') > 40 then
    raise exception 'tab name exceeds 40 characters' using errcode = '22001';
  elsif tg_table_name = 'shopping_lists' and char_length(to_jsonb(new)->>'title') > 80 then
    raise exception 'shopping list name exceeds 80 characters' using errcode = '22001';
  elsif tg_table_name = 'profiles' and to_jsonb(new)->>'display_name' is not null and char_length(to_jsonb(new)->>'display_name') > 60 then
    raise exception 'display name exceeds 60 characters' using errcode = '22001';
  elsif tg_table_name = 'spaces' and to_jsonb(new)->>'type' <> 'family' and char_length(to_jsonb(new)->>'name') > 60 then
    raise exception 'space name exceeds 60 characters' using errcode = '22001';
  end if;
  return new;
end;
$$;

drop trigger if exists space_tabs_name_limit on public.space_tabs;
create trigger space_tabs_name_limit before insert or update of title on public.space_tabs
for each row execute function public.enforce_user_name_limits();
drop trigger if exists shopping_lists_name_limit on public.shopping_lists;
create trigger shopping_lists_name_limit before insert or update of title on public.shopping_lists
for each row execute function public.enforce_user_name_limits();
drop trigger if exists profiles_display_name_limit on public.profiles;
create trigger profiles_display_name_limit before insert or update of display_name on public.profiles
for each row execute function public.enforce_user_name_limits();
drop trigger if exists spaces_custom_name_limit on public.spaces;
create trigger spaces_custom_name_limit before insert or update of name on public.spaces
for each row execute function public.enforce_user_name_limits();

create or replace function public.delete_space_tab_to_space(p_tab_id uuid, p_target_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_source_space uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select t.space_id into v_source_space
  from public.space_tabs t
  where t.id = p_tab_id
  for update;
  if v_source_space is null then
    raise exception 'tab not found' using errcode = 'P0002';
  end if;
  if not public.is_space_owner(v_source_space) or not public.is_space_owner(p_target_space_id) then
    raise exception 'source and destination spaces must be owned by caller' using errcode = '42501';
  end if;
  if p_target_space_id = v_source_space then
    raise exception 'destination must be another space' using errcode = '22023';
  end if;

  update public.items i
     set space_id = p_target_space_id
   where i.note_id in (select n.id from public.notes n where n.tab_id = p_tab_id);
  update public.notes n
     set space_id = p_target_space_id, tab_id = null
   where n.tab_id = p_tab_id;
  delete from public.space_tabs t where t.id = p_tab_id;
end;
$$;

revoke all on function public.delete_space_tab_to_space(uuid, uuid) from public;
revoke all on function public.delete_space_tab_to_space(uuid, uuid) from anon;
grant execute on function public.delete_space_tab_to_space(uuid, uuid) to authenticated;
