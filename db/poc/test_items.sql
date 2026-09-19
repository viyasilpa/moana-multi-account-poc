begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare n integer; begin
 insert into public.poc_items(owner_id,description,amount) values (auth.uid(),'synthetic POC',100);
 select count(*) into n from public.poc_items where description='synthetic POC';
 if n<>1 then raise exception 'insert/select failed'; end if;
 update public.poc_items set amount=125 where description='synthetic POC';
 if not exists(select 1 from public.poc_items where amount=125) then raise exception 'update failed'; end if;
 begin
  update public.poc_items set owner_id='22222222-2222-4222-8222-222222222222';
  raise exception 'ownership reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.poc_items(owner_id,description,amount) values(auth.uid(),'precision',1.001);
  raise exception 'invalid precision allowed';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare n integer; begin
 select count(*) into n from public.poc_items;
 if n<>0 then raise exception 'other user read leaked'; end if;
 update public.poc_items set amount=999; get diagnostics n = row_count;
 if n<>0 then raise exception 'other user updated'; end if;
 delete from public.poc_items; get diagnostics n = row_count;
 if n<>0 then raise exception 'other user deleted'; end if;
 begin
  insert into public.poc_items(owner_id,description,amount) values('11111111-1111-4111-8111-111111111111','forged',1);
  raise exception 'forged insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform count(*) from public.poc_items; raise exception 'anon read allowed';
 exception when insufficient_privilege then null; end;
 begin insert into public.poc_items(owner_id,description,amount) values('11111111-1111-4111-8111-111111111111','anon',1); raise exception 'anon insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare n integer; begin
 delete from public.poc_items where description='synthetic POC';
 get diagnostics n = row_count;
 if n<>1 then raise exception 'owner delete failed'; end if;
end $$;
select 'PASS: SQL-role CRUD, cross-user isolation, owner-change denial, precision validation, anon denial. NOT an Auth/API test.' as test_result;
rollback;