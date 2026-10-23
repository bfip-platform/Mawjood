-- 0051 — Shopping audit (docs/SHOPPING_AUDIT_FIXES.md): atomic shopping
-- operations. The client used to create a list and its items in two
-- separate PostgREST calls (a failed second call left an orphan empty
-- list), flip an item's status and its list's status in two calls (a
-- partial failure diverged DB from UI, and two members toggling at once
-- raced on client-computed list state), and restore an archived list in
-- two calls. These SECURITY DEFINER RPCs do each operation in ONE
-- transaction and re-validate space access for every call, in the same
-- style as 0046's hard-delete RPCs. Idempotent (create-or-replace).
--
-- The engine prefers these RPCs and falls back — with compensation — to
-- the legacy multi-call paths when they are absent, so deploying this
-- migration is safe to do before or after the app update. Applying it
-- to production remains a separate owner decision.

-- ── create a list AND its items atomically ──────────────────────────
-- p_items: jsonb array of title strings. Titles are normalized with the
-- same rules as the client parser (cleanShoppingItemTitles): trim +
-- collapse whitespace, 120-char cap, case-insensitive de-dupe (first
-- wins), at most 100 items. Empty titles are skipped. created_by is
-- always auth.uid() — never a caller-supplied value.
create or replace function public.create_shopping_list(
  p_space_id uuid,
  p_title text,
  p_assigned_to uuid,
  p_assigned_name text,
  p_items jsonb
)
returns public.shopping_lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_list public.shopping_lists;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_access_space(p_space_id) then
    raise exception 'not authorized for this space' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'shopping list title cannot be empty' using errcode = '22023';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'shopping list title cannot exceed 80 characters' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_array_length(p_items) > 200 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  insert into public.shopping_lists (space_id, title, assigned_to, assigned_name, status, created_by)
  values (p_space_id, v_title, p_assigned_to, p_assigned_name, 'open', v_uid)
  returning * into v_list;

  if p_items is not null then
    insert into public.items (space_id, kind, title, list_id, assigned_to, created_by)
    select p_space_id, 'shopping', title, v_list.id, p_assigned_name, v_uid
    from (
      -- de-dupe by lower(title); first occurrence wins (its text and its
      -- position), exactly like cleanShoppingItemTitles on the client
      select (array_agg(title order by ord))[1] as title, min(ord) as first_ord
      from (
        select left(regexp_replace(btrim(elem), '\s+', ' ', 'g'), 120) as title,
               ord
        from jsonb_array_elements_text(p_items) with ordinality as t(elem, ord)
      ) cleaned
      where title <> ''
      group by lower(title)
      order by first_ord
      limit 100
    ) deduped;
  end if;

  return v_list;
end;
$$;

comment on function public.create_shopping_list(uuid, text, uuid, text, jsonb) is
  'Shopping audit P2: atomic list+items creation. SECURITY DEFINER; validates auth.uid() + can_access_space; item titles normalized like the client parser.';

revoke all on function public.create_shopping_list(uuid, text, uuid, text, jsonb) from public;
revoke all on function public.create_shopping_list(uuid, text, uuid, text, jsonb) from anon;
grant execute on function public.create_shopping_list(uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_shopping_list(uuid, text, uuid, text, jsonb) to service_role;

-- ── set one list item's status AND recompute its list atomically ────
-- Mirrors the client's setItemStatus bought_at rule (stamped iff done)
-- and the archive rule (list is done iff it has items and none is open;
-- the original completed_at is preserved when re-resolving an already
-- archived list). Returns the list's authoritative status so the client
-- can sync its state from the database instead of its own computation.
create or replace function public.set_shop_item_status(
  p_item_id uuid,
  p_status text
)
returns table (list_id uuid, list_status text, list_completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_list uuid;
  v_locked_list uuid;
  v_locked_space uuid;
  v_has_open boolean;
  v_existing_completed timestamptz;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'done', 'not_found') then
    raise exception 'invalid item status' using errcode = '22023';
  end if;
  select i.space_id, i.list_id into v_space, v_list
  from public.items i where i.id = p_item_id;
  if v_space is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if not public.can_access_space(v_space) then
    raise exception 'not authorized for this item' using errcode = '42501';
  end if;

  -- Serialize every mutation for a list before touching its item. Locking
  -- only the item is insufficient: two members can update different items
  -- simultaneously, both observe the other as open, and both leave the
  -- list open after the final two items are resolved. Keep one lock order
  -- (list, then item) shared with restore_shopping_list to avoid deadlocks.
  if v_list is not null then
    select l.id, l.space_id into v_locked_list, v_locked_space
    from public.shopping_lists l
    where l.id = v_list
    for update;
    if v_locked_list is null then
      raise exception 'shopping list not found' using errcode = 'P0002';
    end if;
    if v_locked_space <> v_space then
      raise exception 'shopping item changed lists during update' using errcode = '40001';
    end if;
  end if;

  -- Lock the item after its parent list. This also makes the loose-item
  -- path safe, where there is no parent row to serialize on.
  perform 1 from public.items i
  where i.id = p_item_id and i.space_id = v_space and i.list_id is not distinct from v_list
  for update;
  if not found then
    raise exception 'shopping item changed during update' using errcode = '40001';
  end if;

  update public.items
  set status = p_status,
      bought_at = case when p_status = 'done' then now() else null end
  where id = p_item_id;

  if v_list is null then
    return query select null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select exists (
    select 1 from public.items i where i.list_id = v_list and i.status = 'open'
  ) into v_has_open;
  select l.completed_at into v_existing_completed
  from public.shopping_lists l where l.id = v_list;

  if v_has_open then
    update public.shopping_lists
    set status = 'open', completed_at = null
    where id = v_list;
    return query select v_list, 'open'::text, null::timestamptz;
  else
    update public.shopping_lists
    set status = 'done', completed_at = coalesce(v_existing_completed, now())
    where id = v_list
    returning shopping_lists.completed_at into v_existing_completed;
    return query select v_list, 'done'::text, v_existing_completed;
  end if;
end;
$$;

comment on function public.set_shop_item_status(uuid, text) is
  'Shopping audit P4: atomic item-status change + list archive recompute (serialized in the DB, so concurrent toggles cannot race). SECURITY DEFINER; validates auth.uid() + can_access_space.';

revoke all on function public.set_shop_item_status(uuid, text) from public;
revoke all on function public.set_shop_item_status(uuid, text) from anon;
grant execute on function public.set_shop_item_status(uuid, text) to authenticated;
grant execute on function public.set_shop_item_status(uuid, text) to service_role;

-- ── restore an archived list atomically ─────────────────────────────
-- List → open with completed_at cleared; not_found items reopen; bought
-- items stay bought (purchase history preserved) — the exact semantics
-- the client implemented in two calls.
create or replace function public.restore_shopping_list(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select l.space_id into v_space from public.shopping_lists l where l.id = p_list_id for update;
  if v_space is null then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  if not public.can_access_space(v_space) then
    raise exception 'not authorized for this list' using errcode = '42501';
  end if;
  update public.shopping_lists
  set status = 'open', completed_at = null
  where id = p_list_id;
  update public.items
  set status = 'open'
  where list_id = p_list_id and status = 'not_found';
end;
$$;

comment on function public.restore_shopping_list(uuid) is
  'Shopping audit P7: atomic archived-list restore (list reopen + not_found items reopen). SECURITY DEFINER; validates auth.uid() + can_access_space.';

revoke all on function public.restore_shopping_list(uuid) from public;
revoke all on function public.restore_shopping_list(uuid) from anon;
grant execute on function public.restore_shopping_list(uuid) to authenticated;
grant execute on function public.restore_shopping_list(uuid) to service_role;
