-- Logical POC restore rehearsal only. Does not create a durable backup.
-- No writes to public tables or storage; transaction rolls back all temporary data.
begin isolation level repeatable read;
create temporary table restore_source (like public.poc_items including all) on commit drop;
insert into restore_source select * from public.poc_items;
-- Exercise precision, Unicode, escaping and empty notes independent of current user data.
insert into restore_source(id,owner_id,description,amount,created_at,note)
values(gen_random_uuid(),gen_random_uuid(),E'ทดสอบ "quote"\nขึ้นบรรทัดใหม่',9999999999999999.99,'2026-09-20T00:00:00Z',''),
(gen_random_uuid(),gen_random_uuid(),'zero fractions',0.01,'2026-09-19T23:59:59Z','note');
create temporary table restore_envelope(payload jsonb) on commit drop;
insert into restore_envelope
select jsonb_build_object(
 'format','moana-poc-items','version',1,'created_at',now(),
 'items',coalesce((select jsonb_agg(jsonb_build_object(
 'id',id,'owner_id',owner_id,'description',description,
 'amount',amount::text,'created_at',created_at,'note',note) order by id) from restore_source),'[]'::jsonb)
);
create temporary table restore_target (like public.poc_items including all) on commit drop;
do $$
declare doc jsonb;
begin
 select payload into strict doc from restore_envelope;
 if doc->>'format'<>'moana-poc-items' or (doc->>'version')::int<>1
 then raise exception 'Unsupported backup'; end if;
 if jsonb_typeof(doc->'items')<>'array' then raise exception 'Invalid items'; end if;
 insert into restore_target(id,owner_id,description,amount,created_at,note)
 select id::uuid,owner_id::uuid,description,amount::numeric,created_at::timestamptz,note
 from jsonb_to_recordset(doc->'items')
 as x(id text,owner_id text,description text,amount text,created_at text,note text);
 if exists(
 (select * from restore_source except all select * from restore_target)
 union all
 (select * from restore_target except all select * from restore_source))
 then raise exception 'Restore mismatch'; end if;
 begin
  insert into restore_target select * from restore_target limit 1;
  raise exception 'Duplicate accepted';
 exception when unique_violation then null;
 end;
 begin
  insert into restore_target(id,owner_id,description,amount,note)
  values(gen_random_uuid(),gen_random_uuid(),'invalid precision',1.001,'');
  raise exception 'Invalid precision accepted';
 exception when check_violation then null;
 end;
end $$;
select 'PASS' as result,
 (select count(*) from public.poc_items) as untouched_source_rows,
 (select count(*) from restore_target) as restored_rows_including_two_fixtures,
 'exact numeric, Unicode, timestamps, IDs, notes, duplicates and precision verified' as checks;
rollback;
