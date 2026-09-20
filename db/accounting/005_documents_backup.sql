-- Additive stage 5. No financial history, POC objects or opening balances changed.
create table accounting.attachments (
 id uuid primary key default gen_random_uuid(),
 revision_id uuid not null references accounting.revisions(id),
 path text not null unique,
 filename text not null check(length(filename) between 1 and 200 and filename !~ '[[:cntrl:]/\\]'),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 size integer not null check(size between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready','archived')),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 archived_at timestamptz
);
create index attachments_revision_idx on accounting.attachments(revision_id);
alter table accounting.attachments enable row level security;
alter table accounting.attachments force row level security;
create policy owner_read on accounting.attachments for select to authenticated
 using (exists(select 1 from public.app_owner where user_id=(select auth.uid())));
revoke all on accounting.attachments from public,anon,authenticated;

create function accounting.attachment_access(p_path text,p_upload boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from accounting.attachments a
  join accounting.settings s on s.owner_id=(select auth.uid())
  join public.app_owner o on o.user_id=s.owner_id
  where a.path=p_path and (not p_upload or a.state='pending'))
$$;

create function accounting.attachment_list(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform accounting.assert_owner();
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('revision',r.revision) order by a.created_at,a.id),'[]'::jsonb)
 from accounting.attachments a join accounting.revisions r on r.id=a.revision_id where r.transaction_id=p_id);
end $$;

create function accounting.attachment_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; k uuid; req accounting.requests%rowtype; a accounting.attachments%rowtype;
 r accounting.revisions%rowtype; result jsonb; meta jsonb; tx accounting.transactions%rowtype;
begin
 u:=accounting.assert_owner();
 perform 1 from accounting.settings where singleton for update;
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>4096
  or exists(select 1 from jsonb_object_keys(p_request) x where x not in ('key','action','transaction_id','expected_revision','filename','mime','size','sha256','id','reason')) then
  raise exception 'invalid_attachment_request'; end if;
 k:=(p_request->>'key')::uuid;
 if k is null then raise exception 'idempotency_key_required'; end if;
 select * into req from accounting.requests where key=k;
 if found then
  if req.payload<>p_request then raise exception 'idempotency_conflict' using errcode='23505'; end if;
  return req.response;
 end if;
 if p_request->>'action'='reserve' then
  select * into tx from accounting.transactions where id=(p_request->>'transaction_id')::uuid;
  if not found or tx.status<>'posted' then raise exception 'posted_transaction_required'; end if;
  if tx.current_revision is distinct from (p_request->>'expected_revision')::integer then raise exception 'stale_revision' using errcode='40001'; end if;
  select * into strict r from accounting.revisions where transaction_id=tx.id and revision=tx.current_revision;
  a.id:=gen_random_uuid();
  insert into accounting.attachments(id,revision_id,path,filename,mime,size,sha256,actor_id)
   values(a.id,r.id,tx.id||'/'||r.id||'/'||a.id,p_request->>'filename',p_request->>'mime',
    (p_request->>'size')::integer,p_request->>'sha256',u) returning * into a;
 elsif p_request->>'action' in ('finish','archive') then
  select * into a from accounting.attachments where id=(p_request->>'id')::uuid for update;
  if not found then raise exception 'attachment_not_found'; end if;
  if p_request->>'action'='finish' then
   if a.state='pending' then
    select metadata into meta from storage.objects where bucket_id='accounting-attachments' and name=a.path;
    if meta is null then raise exception 'upload_missing'; end if;
    if (meta->>'size')::bigint is distinct from a.size::bigint or meta->>'mimetype' is distinct from a.mime then raise exception 'upload_metadata_mismatch'; end if;
    update accounting.attachments set state='ready',uploaded_at=now() where id=a.id returning * into a;
   end if;
  else
   if a.state='pending' then raise exception 'finish_upload_first'; end if;
   if length(btrim(coalesce(p_request->>'reason',''))) not between 1 and 500 then raise exception 'archive_reason_required'; end if;
   update accounting.attachments set state='archived',archived_at=coalesce(archived_at,now()) where id=a.id returning * into a;
  end if;
 else raise exception 'invalid_attachment_action'; end if;
 select * into strict r from accounting.revisions where id=a.revision_id;
 insert into accounting.audit_events(transaction_id,actor_id,action,details)
  values(r.transaction_id,u,'attachment_'||(p_request->>'action'),jsonb_build_object('attachment_id',a.id,'revision',r.revision,'reason',p_request->>'reason'));
 result:=to_jsonb(a);
 insert into accounting.requests(key,request_hash,payload,response) values(k,md5(p_request::text),p_request,result);
 return result;
end $$;

-- STABLE ensures every table is read from the calling statement's MVCC snapshot.
-- Money and bigint sequences are strings: JS must never round a backup value.
create function accounting.backup() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tables jsonb:='{}'; counts jsonb:='{}'; t text; rows jsonb;
begin
 perform accounting.assert_owner();
 foreach t in array array['settings','entities','parties','accounts','transactions','revisions','batches','lines','audit_events','requests','attachments'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) %s order by %s),''[]''::jsonb) from accounting.%I x',
   case t when 'revisions' then '||jsonb_build_object(''amount'',x.amount::text)'
    when 'lines' then '||jsonb_build_object(''debit'',x.debit::text,''credit'',x.credit::text)'
    when 'batches' then '||jsonb_build_object(''sequence'',x.sequence::text)' else '' end,
   case t when 'settings' then 'singleton' when 'requests' then 'key' else 'id' end,t) into rows;
  tables:=tables||jsonb_build_object(t,rows); counts:=counts||jsonb_build_object(t,jsonb_array_length(rows));
 end loop;
 return jsonb_build_object('format','moana-ledger','version',1,'exported_at',statement_timestamp(),'tables',tables,'counts',counts);
end $$;

create function public.accounting_attachment_list(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select accounting.attachment_list(p_id)$$;
create function public.accounting_attachment(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select accounting.attachment_command(p_request)$$;
create function public.accounting_backup() returns jsonb language sql security invoker set search_path='' as $$select accounting.backup()$$;
revoke all on function accounting.attachment_access(text,boolean),accounting.attachment_list(uuid),accounting.attachment_command(jsonb),accounting.backup(),public.accounting_attachment_list(uuid),public.accounting_attachment(jsonb),public.accounting_backup() from public,anon,authenticated;
grant execute on function accounting.attachment_access(text,boolean),accounting.attachment_list(uuid),accounting.attachment_command(jsonb),accounting.backup(),public.accounting_attachment_list(uuid),public.accounting_attachment(jsonb),public.accounting_backup() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('accounting-attachments','accounting-attachments',false,5242880,array['application/pdf','image/jpeg','image/png']);
create policy accounting_attachment_insert on storage.objects for insert to authenticated
 with check(bucket_id='accounting-attachments' and accounting.attachment_access(name,true));
create policy accounting_attachment_read on storage.objects for select to authenticated
 using(bucket_id='accounting-attachments' and accounting.attachment_access(name,false));
-- Intentionally no UPDATE/DELETE policies: no replacing or silently deleting evidence.
