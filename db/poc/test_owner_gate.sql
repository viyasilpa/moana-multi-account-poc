begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_owner where singleton),true);
set local role authenticated;
do $$
declare item uuid; n integer;
begin
 if (select count(*) from public.app_owner) <> 1 then raise exception 'Owner lookup failed'; end if;
 insert into public.poc_items(owner_id,description,amount) values(auth.uid(),'owner gate test',1.25) returning id into item;
 if not exists(select 1 from public.poc_items where id=item) then raise exception 'Read failed'; end if;
 update public.poc_items set amount=2.50 where id=item;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Update failed'; end if;
 begin
  update public.poc_items set owner_id='22222222-2222-4222-8222-222222222222' where id=item;
  raise exception 'Ownership reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.app_owner set user_id='22222222-2222-4222-8222-222222222222';
  raise exception 'Client owner mutation allowed';
 exception when insufficient_privilege then null; end;
 delete from public.poc_items where id=item;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Delete failed'; end if;
 insert into public.poc_items(owner_id,description,amount) values(auth.uid(),'isolation test',3);
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare n integer;
begin
 if exists(select 1 from public.app_owner) or exists(select 1 from public.poc_items) then raise exception 'Nonowner read allowed'; end if;
 update public.poc_items set amount=4;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Nonowner update allowed'; end if;
 delete from public.poc_items;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Nonowner delete allowed'; end if;
 begin
  insert into public.poc_items(owner_id,description,amount) values(auth.uid(),'denied',1);
  raise exception 'Nonowner insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.app_owner(singleton,user_id) values(true,auth.uid());
  raise exception 'Self-enrollment allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.poc_items; raise exception 'Anon read allowed';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.app_owner; raise exception 'Anon owner lookup allowed';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: owner CRUD; nonowner isolation; no self-enrollment; anon denied; all test data rolled back' as result;
