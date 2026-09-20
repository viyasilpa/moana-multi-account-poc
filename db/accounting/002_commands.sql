create function accounting.post(p_request jsonb) returns jsonb
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
    if (p_request->>'expected_revision')::integer is distinct from t.current_revision then raise exception 'stale_revision' using errcode='40001'; end if;
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
  return response;
end $$;

create function accounting.catalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform accounting.assert_owner();
  select jsonb_build_object(
    'settings',(select to_jsonb(s)-'owner_id' from accounting.settings s),
    'entities',coalesce((select jsonb_agg(to_jsonb(e) order by code) from accounting.entities e),'[]'),
    'parties',coalesce((select jsonb_agg(to_jsonb(p) order by name) from accounting.parties p),'[]'),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by entity_id,kind,code) from accounting.accounts a),'[]')
  ) into result;
  return result;
end $$;

-- Stable read function: all report sections share one SQL statement snapshot.
-- Monetary values are returned as strings, never unsafe JavaScript floating point.
create function accounting.report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare start_date date; result jsonb;
begin
  perform accounting.assert_owner();
  select s.start_date into start_date from accounting.settings s;
  if start_date is null or p_from is null or p_to is null or p_from<start_date or p_to<p_from then raise exception 'invalid_report_range' using errcode='23514'; end if;
  with totals as (
    select a.id,a.entity_id,a.kind,a.party_id,
      coalesce(sum(l.debit-l.credit) filter(where b.effective_date<p_from or (b.is_opening and b.effective_date=p_from)),0) opening,
      coalesce(sum(l.debit) filter(where b.effective_date between p_from and p_to and not (b.is_opening and b.effective_date=p_from)),0) debit,
      coalesce(sum(l.credit) filter(where b.effective_date between p_from and p_to and not (b.is_opening and b.effective_date=p_from)),0) credit,
      coalesce(sum(l.debit-l.credit) filter(where b.effective_date<=p_to),0) closing
    from accounting.accounts a left join accounting.lines l on l.account_id=a.id left join accounting.batches b on b.id=l.batch_id
    group by a.id
  )
  select jsonb_build_object('from',p_from,'to',p_to,'currency','THB',
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('account_id',id,'entity_id',entity_id,'kind',kind,'party_id',party_id,
       'opening',opening::text,'debit',debit::text,'credit',credit::text,'closing',closing::text) order by entity_id,id) from totals),'[]'),
    'pnl',coalesce((select jsonb_agg(jsonb_build_object('entity_id',entity_id,'income',income::text,'expense',expense::text,'net',(income-expense)::text))
      from (select entity_id,coalesce(sum(credit-debit) filter(where kind='income'),0) income,
        coalesce(sum(debit-credit) filter(where kind='expense'),0) expense from totals group by entity_id) p),'[]'),
    'consolidated', (select jsonb_build_object('income',coalesce(sum(credit-debit) filter(where kind='income'),0)::text,
      'expense',coalesce(sum(debit-credit) filter(where kind='expense'),0)::text,
      'net',coalesce(sum(credit-debit) filter(where kind in ('income','expense')),0)::text) from totals)
  ) into result;
  return result;
end $$;

create function accounting.gl(p_account uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; start_date date;
begin
  perform accounting.assert_owner();
  select s.start_date into start_date from accounting.settings s;
  if start_date is null or p_from is null or p_to is null or p_from<start_date or p_to<p_from
    or not exists(select 1 from accounting.accounts where id=p_account) then raise exception 'invalid_gl_range_or_account' using errcode='23514'; end if;
  with opening as (select coalesce(sum(l.debit-l.credit),0) value from accounting.lines l join accounting.batches b on b.id=l.batch_id
    where l.account_id=p_account and (b.effective_date<p_from or (b.is_opening and b.effective_date=p_from))),
  activity as (select l.id,l.debit,l.credit,l.line_number,b.effective_date,b.sequence,b.role,v.transaction_id,v.revision,
    (select value from opening)+sum(l.debit-l.credit) over(order by b.effective_date,b.sequence,l.line_number) balance
    from accounting.lines l join accounting.batches b on b.id=l.batch_id join accounting.revisions v on v.id=b.revision_id
    where l.account_id=p_account and b.effective_date between p_from and p_to and not (b.is_opening and b.effective_date=p_from))
  select jsonb_build_object('account_id',p_account,'from',p_from,'to',p_to,'opening',(select value::text from opening),
    'lines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',effective_date,'transaction_id',transaction_id,'revision',revision,'role',role,
      'debit',debit::text,'credit',credit::text,'balance',balance::text) order by effective_date,sequence,line_number) from activity),'[]'),
    'closing',((select value from opening)+coalesce((select sum(debit-credit) from activity),0))::text) into result;
  return result;
end $$;

create function public.accounting_post(p_request jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select accounting.post(p_request) $$;
create function public.accounting_catalog() returns jsonb language sql stable security invoker set search_path = '' as $$ select accounting.catalog() $$;
create function public.accounting_report(p_from date,p_to date) returns jsonb language sql stable security invoker set search_path = '' as $$ select accounting.report(p_from,p_to) $$;
create function public.accounting_gl(p_account uuid,p_from date,p_to date) returns jsonb language sql stable security invoker set search_path = '' as $$ select accounting.gl(p_account,p_from,p_to) $$;

revoke all on all functions in schema accounting from public,anon,authenticated;
revoke all on function public.accounting_post(jsonb),public.accounting_catalog(),public.accounting_report(date,date),public.accounting_gl(uuid,date,date) from public,anon,authenticated;
grant usage on schema accounting to authenticated;
grant execute on function accounting.post(jsonb),accounting.catalog(),accounting.report(date,date),accounting.gl(uuid,date,date) to authenticated;
grant execute on function public.accounting_post(jsonb),public.accounting_catalog(),public.accounting_report(date,date),public.accounting_gl(uuid,date,date) to authenticated;
-- configure is intentionally admin-only (still requires owner auth context).
