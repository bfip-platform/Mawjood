-- D3 T-D3-5 benchmark harness — teardown (removes the bench fixtures).
delete from public.items where space_id = :space_id;
delete from public.notes where space_id = :space_id;
delete from public.spaces where id = :space_id;
delete from auth.users where id = :user_id;
