-- Additive fix for deferred validation at an authenticated HTTP commit.
create or replace function accounting.post(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid; cfg accounting.settings%rowtype; req accounting.requests%rowtype;
  t accounting.transactions%rowtype; oldrev accounting.revisions%rowtype;
  source accounting.transactions%rowtype; source_rev accounting.revisions%rowtype;
  entry jsonb := p_request->'entry'; action text := p_request->>'action';
  k uuid; tid uuid; rid uuid; bid uuid; reversal uuid; rev integer;
  d date; n numeric; refunded numeric; reason text := btrim(coalesce(p_request->>'reason',''));
  response jsonb; warnings jsonb; r record;
begin
  u:=accounting.assert_owner();
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>65536
     or exists(select 1 from jsonb_object_keys(p_request) x where x not in ('key','action','transaction_id','expected_revision','reason','entry')) then raise exception 'invalid_request' using errcode='23514'; end if;
  if action is null or action not in ('create','edit','void') then raise exception 'invalid_action' using errcode='23514'; end if;
  k:=(p_request->>'key')::uuid;
  if k is null then raise exception 'idempotency_key_required' using errcode='23514'; end if;
  -- Single-owner app: one short lock serializes opening, refunds, corrections and retries.
  -- No network call is made while this lock is held.
  select * into cfg from accounting.settings where singleton for update;
  select * into req from accounting.requests where key=k;
  if found then
    if req.payload <> p_request then raise exception 'idempotency_conflict' using errcode='23505'; end if;
    return req.response;
  end if;
  if action='create' then
    if p_request->>'transaction_id' is not null or p_request->>'expected_revision' is not null then raise exception 'unexpected_revision'; end if;
    tid:=gen_random_uuid(); rev:=1;
  else
    tid:=(p_request->>'transaction_id')::uuid;
    select * into t from accounting.transactions where id=tid for update;
    if not found then raise exception 'transaction_not_found' using errcode='P0002'; end if;
    if t.status<>'posted' then raise exception 'already_void' using errcode='23514'; end if;
    if (p_request->>'expected_revision')::integer is distinct from t.current_revision then raise exception 'stale_revision' using errcode='PT409'; end if;
    if length(reason) not between 1 and 500 then raise exception 'change_reason_required' using errcode='23514'; end if;
    select * into oldrev from accounting.revisions where transaction_id=tid and revision=t.current_revision;
    rev:=t.current_revision+1;
    if action='void' then
      if entry is not null or t.kind='opening' then raise exception 'invalid_void' using errcode='23514'; end if;
      entry:=oldrev.input;
    elsif entry->>'kind' is distinct from t.kind then raise exception 'kind_is_immutable' using errcode='23514'; end if;
    if t.kind='refund' and entry->>'source_transaction_id' is distinct from oldrev.input->>'source_transaction_id' then raise exception 'refund_source_is_immutable'; end if;
    select coalesce(sum(v.amount),0) into refunded from accounting.transactions x
      join accounting.revisions v on v.transaction_id=x.id and v.revision=x.current_revision
      where x.source_transaction_id=tid and x.status='posted';
    if refunded>0 and (action='void' or (entry-'amount'-'description') <> (oldrev.input-'amount'-'description')
       or (entry->>'amount')::numeric<refunded) then raise exception 'source_has_active_refunds' using errcode='23514'; end if;
  end if;
  if jsonb_typeof(entry) is distinct from 'object' or exists(select 1 from jsonb_object_keys(entry) x
      where x not in ('kind','date','amount','description','funding','money_account_id','for_entity_id','category_account_id','destination_account_id','party_id','source_transaction_id','balances')) then
    raise exception 'invalid_entry' using errcode='23514';
  end if;
  if entry->>'kind' is null or entry->>'kind' not in ('expense','income','transfer','party_payment','party_receipt','refund','opening') then raise exception 'invalid_kind'; end if;
  if entry->>'kind'='opening' then
    if exists(select 1 from jsonb_each(entry) x where x.key not in ('kind','date','description','balances')) then raise exception 'unexpected_opening_fields'; end if;
  elsif entry->>'kind'='refund' then
    if exists(select 1 from jsonb_each(entry) x where x.key not in ('kind','date','amount','description','source_transaction_id')) then raise exception 'refund_route_must_match_source'; end if;
  elsif entry ? 'source_transaction_id' or entry ? 'balances' then raise exception 'unexpected_fields'; end if;
  d:=(entry->>'date')::date;
  if d is null or d>(now() at time zone 'Asia/Bangkok')::date then raise exception 'invalid_or_future_date' using errcode='23514'; end if;
  if entry->>'kind'='opening' then
    if action='create' and cfg.opening_finalized_at is not null then raise exception 'opening_already_finalized'; end if;
    if action='edit' and d is distinct from cfg.start_date then raise exception 'start_date_is_locked' using errcode='23514'; end if;
  else
    if cfg.opening_finalized_at is null then raise exception 'opening_required' using errcode='23514'; end if;
    if d<cfg.start_date then raise exception 'before_start_date' using errcode='23514'; end if;
    if coalesce(entry->>'amount','') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then raise exception 'invalid_amount' using errcode='23514'; end if;
    n:=(entry->>'amount')::accounting.money;
    if n<=0 then raise exception 'positive_amount_required' using errcode='23514'; end if;
  end if;
  if entry->>'kind'='refund' and action<>'void' then
    select * into source from accounting.transactions where id=(entry->>'source_transaction_id')::uuid and status='posted';
    if not found or source.kind not in ('expense','income') then raise exception 'invalid_refund_source' using errcode='23514'; end if;
    select * into source_rev from accounting.revisions where transaction_id=source.id and revision=source.current_revision;
    select coalesce(sum(v.amount),0) into refunded from accounting.transactions x join accounting.revisions v
      on v.transaction_id=x.id and v.revision=x.current_revision
      where x.source_transaction_id=source.id and x.status='posted' and x.id<>tid;
    if refunded+n>source_rev.amount then raise exception 'refund_exceeds_remaining' using errcode='23514'; end if;
  end if;
  if action='create' then
    insert into accounting.transactions(id,kind,current_revision,status,source_transaction_id)
      values(tid,entry->>'kind',rev,'posted',nullif(entry->>'source_transaction_id','')::uuid);
  end if;
  insert into accounting.revisions(transaction_id,revision,effective_date,amount,input,reason,actor_id)
    values(tid,rev,d,n,entry,reason,u) returning id into rid;
  if action<>'create' then
    for r in select * from accounting.batches where revision_id=oldrev.id and role<>'reversal' loop
      insert into accounting.batches(revision_id,effective_date,role,is_opening,reverses_id)
        values(rid,r.effective_date,'reversal',r.is_opening,r.id) returning id into reversal;
      insert into accounting.lines(batch_id,line_number,entity_id,account_id,debit,credit)
        select reversal,line_number,entity_id,account_id,credit,debit from accounting.lines where batch_id=r.id;
      perform accounting.validate_batch(reversal);
    end loop;
  end if;
  if action<>'void' then
    bid:=accounting.build_batch(rid,entry,case when action='create' then 'original' else 'replacement' end);
  end if;
  update accounting.transactions set current_revision=rev,status=case when action='void' then 'void' else 'posted' end,updated_at=now() where id=tid;
  if entry->>'kind'='opening' then
    update accounting.settings set start_date=d,opening_finalized_at=coalesce(opening_finalized_at,now()) where singleton;
  end if;
  insert into accounting.audit_events(transaction_id,actor_id,action,details)
    values(tid,u,action,jsonb_build_object('from_revision',t.current_revision,'to_revision',rev,'reason',reason));
  select coalesce(jsonb_agg(jsonb_build_object('code','negative_money_balance','account_id',z.id,'balance',z.balance::text)),'[]') into warnings
    from (select a.id,sum(l.debit-l.credit) balance from accounting.accounts a join accounting.lines l on l.account_id=a.id
      join accounting.batches b on b.id=l.batch_id where a.kind in ('bank','cash') and b.effective_date<=d
      group by a.id having sum(l.debit-l.credit)<0) z;
  response:=jsonb_build_object('transaction_id',tid,'revision',rev,'status',case when action='void' then 'void' else 'posted' end,'warnings',warnings);
  insert into accounting.requests(key,request_hash,payload,response) values(k,md5(p_request::text),p_request,response);
  -- Drain deferred checks while the existing owner-checked command still holds
  -- its execution privileges. PostgREST commits after SECURITY DEFINER returns.
  -- Do not grant table/helper access or make validation triggers privileged.
  set constraints accounting.batch_balance, accounting.line_balance immediate;
  set constraints accounting.batch_balance, accounting.line_balance deferred;
  return response;
end $$;

-- Expected stale-client conflicts are HTTP 409, not retryable SQL serialization errors.
create or replace function accounting.attachment_command(p_request jsonb) returns jsonb
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
  if tx.current_revision is distinct from (p_request->>'expected_revision')::integer then raise exception 'stale_revision' using errcode='PT409'; end if;
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
