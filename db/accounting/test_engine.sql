-- Synthetic-only integration suite. Run BEFORE private master configuration.
-- Entire run rolls back. Owner UUID is resolved privately, never hardcoded.
begin;
set local statement_timeout = '45s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_owner),true) is not null as owner_context_set;
create temporary table test_results(name text primary key);
create function pg_temp.ok(p_name text,p_value boolean) returns void language plpgsql as $$
begin
  if p_value is distinct from true then raise exception 'ASSERT FAILED: %',p_name; end if;
  insert into test_results values(p_name);
end $$;
create function pg_temp.reject(p_name text,p_sql text,p_message text default null) returns void language plpgsql as $$
declare failed boolean:=false;
begin
  begin execute p_sql;
  exception when others then
    if p_message is not null and position(p_message in sqlerrm)=0 then raise exception 'wrong rejection for %: %',p_name,sqlerrm; end if;
    failed:=true;
  end;
  perform pg_temp.ok(p_name,failed);
end $$;
create function pg_temp.e(p_code text) returns uuid language sql as $$ select id from accounting.entities where code=p_code $$;
create function pg_temp.a(p_entity text,p_code text) returns uuid language sql as $$ select id from accounting.accounts where entity_id=pg_temp.e(p_entity) and code=p_code $$;
create function pg_temp.balance(p_id uuid) returns numeric language sql as $$ select coalesce(sum(debit-credit),0) from accounting.lines where account_id=p_id $$;
create function pg_temp.request(p_entry jsonb) returns jsonb language sql as $$
  select jsonb_build_object('key',gen_random_uuid(),'action','create','entry',p_entry)
$$;
create function pg_temp.entry(p_kind text,p_amount text,p_money text default 'E1',p_for text default 'E2') returns jsonb language sql as $$
  select jsonb_build_object('kind',p_kind,'date',(now() at time zone 'Asia/Bangkok')::date-10,
    'amount',p_amount,'funding','money','money_account_id',pg_temp.a(p_money,'bank'),
    'for_entity_id',pg_temp.e(p_for),'category_account_id',pg_temp.a(p_for,p_kind))
$$;

do $$ declare manifest jsonb; begin
  select jsonb_build_object('entities',jsonb_agg(jsonb_build_object('code','E'||i,'name','Synthetic entity '||i,
    'accounts',jsonb_build_array(
      jsonb_build_object('code','bank','name','Test bank','kind','bank'),
      jsonb_build_object('code','cash','name','Test cash','kind','cash'),
      jsonb_build_object('code','expense','name','Test expense','kind','expense'),
      jsonb_build_object('code','income','name','Test income','kind','income'))))) into manifest from generate_series(1,6) i;
  perform accounting.configure(manifest);
  perform pg_temp.ok('six entities and thirty reciprocal accounts',
    (select count(*)=6 from accounting.entities) and
    (select count(*)=30 from accounting.accounts a join accounting.parties p on p.id=a.party_id where p.kind='related'));
  perform pg_temp.ok('six PP accounts, no PP entity',
    (select count(*)=6 from accounting.accounts a join accounting.parties p on p.id=a.party_id where p.kind='pp'));
end $$;

do $$
declare
  opening jsonb; receipt jsonb; q jsonb; retry jsonb; payment jsonb; income jsonb; pp_pay jsonb;
  refund jsonb; partial jsonb; edited jsonb; r jsonb; gl jsonb; pp uuid;
  before_count bigint; before_audit bigint; party uuid; master_req jsonb; big jsonb;
  d date:=(now() at time zone 'Asia/Bangkok')::date-20;
begin
  perform pg_temp.reject('posting blocked before opening',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10'))),'opening_required');
  -- Roll back just this probe, leaving the real suite's opening unfinalized.
  begin
    perform accounting.post(pg_temp.request(jsonb_build_object('kind','opening','date',d,'balances','[]'::jsonb)));
    if not (select opening_finalized_at is not null from accounting.settings) or exists(select 1 from accounting.batches) then
      raise exception 'zero opening failed';
    end if;
    raise exception 'rollback_zero_probe' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null; end;
  perform pg_temp.ok('zero opening finalizes without empty journal',not exists(select 1 from accounting.transactions));
  opening:=pg_temp.request(jsonb_build_object('kind','opening','date',d,'balances',jsonb_build_array(
    jsonb_build_object('account_id',pg_temp.a('E1','bank'),'signed_amount','10000'),
    jsonb_build_object('account_id',accounting.related_account(pg_temp.e('E1'),pg_temp.e('E2')),'signed_amount','300'))));
  receipt:=accounting.post(opening);
  perform pg_temp.ok('opening mirrors generated once',pg_temp.balance(accounting.related_account(pg_temp.e('E2'),pg_temp.e('E1')))=-300);
  gl:=accounting.gl(pg_temp.a('E1','bank'),d,d);
  perform pg_temp.ok('opening included once at start boundary',(gl->>'opening')::numeric=10000 and (gl->>'closing')::numeric=10000 and jsonb_array_length(gl->'lines')=0);
  perform pg_temp.reject('duplicate opening blocked',format('select accounting.post(%L::jsonb)',opening||jsonb_build_object('key',gen_random_uuid())),'opening_already_finalized');
  q:=jsonb_build_object('key',gen_random_uuid(),'action','edit','transaction_id',receipt->>'transaction_id','expected_revision',1,'reason','test opening correction',
    'entry',jsonb_build_object('kind','opening','date',d,'balances',jsonb_build_array(
    jsonb_build_object('account_id',pg_temp.a('E1','bank'),'signed_amount','20000'),
    jsonb_build_object('account_id',accounting.related_account(pg_temp.e('E1'),pg_temp.e('E2')),'signed_amount','500'))));
  perform accounting.post(q);
  gl:=accounting.gl(pg_temp.a('E1','bank'),d,d);
  perform pg_temp.ok('opening correction reverses original boundary',(gl->>'opening')::numeric=20000 and (gl->>'closing')::numeric=20000);
  perform pg_temp.reject('conflicting pair opening rejected',format('select accounting.post(%L::jsonb)',
    q||jsonb_build_object('key',gen_random_uuid(),'expected_revision',2,'entry',jsonb_build_object('kind','opening','date',d,'balances',jsonb_build_array(
      jsonb_build_object('account_id',accounting.related_account(pg_temp.e('E1'),pg_temp.e('E2')),'signed_amount','1'),
      jsonb_build_object('account_id',accounting.related_account(pg_temp.e('E2'),pg_temp.e('E1')),'signed_amount','-1'))))),'duplicate_opening_pair');
  perform pg_temp.reject('start date cannot change',format('select accounting.post(%L::jsonb)',q||jsonb_build_object('key',gen_random_uuid(),'expected_revision',2,'entry',(q->'entry')||jsonb_build_object('date',d-1))),'start_date_is_locked');

  q:=pg_temp.request(pg_temp.entry('expense','1500'));
  payment:=accounting.post(q); retry:=accounting.post(q);
  perform pg_temp.ok('identical retry returns same receipt',payment=retry);
  perform pg_temp.reject('same key changed amount rejected',format('select accounting.post(%L::jsonb)',jsonb_set(q,'{entry,amount}','"1501"')),'idempotency_conflict');
  income:=accounting.post(pg_temp.request(pg_temp.entry('income','8000')));
  perform pg_temp.ok('hub income and expense known answer',pg_temp.balance(pg_temp.a('E1','bank'))=26500
    and pg_temp.balance(accounting.related_account(pg_temp.e('E1'),pg_temp.e('E2')))=-6000
    and pg_temp.balance(accounting.related_account(pg_temp.e('E2'),pg_temp.e('E1')))=6000);
  r:=accounting.report(d,d+15);
  perform pg_temp.ok('P&L excludes opening and mirrors',(r#>>'{consolidated,income}')::numeric=8000 and (r#>>'{consolidated,expense}')::numeric=1500 and (r#>>'{consolidated,net}')::numeric=6500);

  select id into pp from accounting.parties where kind='pp';
  pp_pay:=accounting.post(pg_temp.request(pg_temp.entry('expense','1500')-'money_account_id'||jsonb_build_object('funding','pp')));
  perform pg_temp.ok('PP expense touches no money',pg_temp.balance(pg_temp.a('E1','bank'))=26500 and pg_temp.balance(accounting.party_account(pg_temp.e('E2'),pp))=-1500);
  perform accounting.post(pg_temp.request(pg_temp.entry('party_payment','1500')-'category_account_id'||jsonb_build_object('party_id',pp)));
  perform pg_temp.ok('hub reimburses PP without second expense',pg_temp.balance(accounting.party_account(pg_temp.e('E2'),pp))=0 and pg_temp.balance(pg_temp.a('E2','expense'))=3000 and pg_temp.balance(pg_temp.a('E1','bank'))=25000);
  refund:=accounting.post(pg_temp.request(jsonb_build_object('kind','refund','date',d+12,'source_transaction_id',pp_pay->>'transaction_id','amount','500')));
  perform pg_temp.ok('PP refund returns to PP not hub',pg_temp.balance(pg_temp.a('E1','bank'))=25000 and pg_temp.balance(accounting.party_account(pg_temp.e('E2'),pp))=500 and pg_temp.balance(pg_temp.a('E2','expense'))=2500);
  perform pg_temp.reject('refund over remaining blocked',format('select accounting.post(%L::jsonb)',pg_temp.request(jsonb_build_object('kind','refund','date',d+12,'source_transaction_id',pp_pay->>'transaction_id','amount','1000.01'))),'refund_exceeds_remaining');
  perform pg_temp.reject('source void protected by refund',format('select accounting.post(%L::jsonb)',jsonb_build_object('key',gen_random_uuid(),'action','void','transaction_id',pp_pay->>'transaction_id','expected_revision',1,'reason','test')),'source_has_active_refunds');
  perform accounting.post(jsonb_build_object('key',gen_random_uuid(),'action','void','transaction_id',refund->>'transaction_id','expected_revision',1,'reason','undo test refund'));
  perform pg_temp.ok('refund void restores PP liability effect',pg_temp.balance(accounting.party_account(pg_temp.e('E2'),pp))=0 and pg_temp.balance(pg_temp.a('E2','expense'))=3000);

  q:=pg_temp.request(jsonb_build_object('kind','transfer','date',d+10,'amount','123','funding','money','money_account_id',pg_temp.a('E3','bank'),'destination_account_id',pg_temp.a('E4','bank')));
  receipt:=accounting.post(q);
  perform pg_temp.ok('non-hub cross transfer generic mirrors',pg_temp.balance(accounting.related_account(pg_temp.e('E3'),pg_temp.e('E4')))=123 and pg_temp.balance(accounting.related_account(pg_temp.e('E4'),pg_temp.e('E3')))=-123);
  perform pg_temp.ok('negative money allowed with warning',jsonb_array_length(receipt->'warnings')>0);
  perform accounting.post(pg_temp.request(jsonb_build_object('kind','transfer','date',d+10,'amount','20','funding','money','money_account_id',pg_temp.a('E4','bank'),'destination_account_id',pg_temp.a('E4','cash'))));
  perform pg_temp.ok('own cash transfer no party or P&L',pg_temp.balance(pg_temp.a('E4','cash'))=20 and pg_temp.balance(pg_temp.a('E4','bank'))=103 and pg_temp.balance(pg_temp.a('E4','expense'))=0);
  perform pg_temp.reject('same transfer account rejected',format('select accounting.post(%L::jsonb)',jsonb_set(q||jsonb_build_object('key',gen_random_uuid()),'{entry,destination_account_id}',to_jsonb(pg_temp.a('E3','bank')))),'invalid_transfer_destination');

  q:=jsonb_build_object('key',gen_random_uuid(),'action','edit','transaction_id',payment->>'transaction_id','expected_revision',1,'reason','correct amount and date',
    'entry',pg_temp.entry('expense','1000')||jsonb_build_object('date',d+5));
  edited:=accounting.post(q);
  perform pg_temp.ok('edit revision increments',(edited->>'revision')::integer=2);
  perform pg_temp.ok('edit restates old date not edit date',
    (select count(*)=1 from accounting.batches b join accounting.revisions v on v.id=b.revision_id where v.transaction_id=(payment->>'transaction_id')::uuid and b.role='reversal' and b.effective_date=d+10));
  perform pg_temp.reject('stale revision blocked',format('select accounting.post(%L::jsonb)',q||jsonb_build_object('key',gen_random_uuid())),'stale_revision');
  perform accounting.post(jsonb_build_object('key',gen_random_uuid(),'action','void','transaction_id',payment->>'transaction_id','expected_revision',2,'reason','void test'));
  perform pg_temp.ok('void retains history and removes all current effect',
    (select count(*)=3 from accounting.revisions where transaction_id=(payment->>'transaction_id')::uuid) and
    (select sum(l.debit-l.credit)=0 from accounting.lines l join accounting.batches b on b.id=l.batch_id join accounting.revisions v on v.id=b.revision_id
     where v.transaction_id=(payment->>'transaction_id')::uuid and l.account_id=pg_temp.a('E1','bank')));

  select count(*) into before_count from accounting.transactions;
  select count(*) into before_audit from accounting.audit_events;
  perform pg_temp.reject('wrong entity category rolls back whole action',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10')||jsonb_build_object('category_account_id',pg_temp.a('E3','expense')))),'invalid_category');
  perform pg_temp.ok('failed posting leaves no transaction or audit',before_count=(select count(*) from accounting.transactions) and before_audit=(select count(*) from accounting.audit_events));
  foreach q in array array['"0"'::jsonb,'"-1"'::jsonb,'"NaN"'::jsonb,'"1.001"'::jsonb,'"10000000000000000"'::jsonb] loop
    perform pg_temp.reject('reject amount '||q::text,format('select accounting.post(%L::jsonb)',jsonb_set(pg_temp.request(pg_temp.entry('expense','10')),'{entry,amount}',q)));
  end loop;
  perform pg_temp.reject('PP income explicitly deferred',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('income','100')-'money_account_id'||jsonb_build_object('funding','pp'))),'pp_only_pays_expense');
  perform pg_temp.reject('future posting rejected',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10')||jsonb_build_object('date',(now() at time zone 'Asia/Bangkok')::date+1))),'invalid_or_future_date');
  perform pg_temp.reject('pre-start posting rejected',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10')||jsonb_build_object('date',d-1))),'before_start_date');
  perform pg_temp.reject('unknown fields rejected',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10')||'{"arbitrary_journal":[]}'::jsonb)),'invalid_entry');
  perform pg_temp.reject('history update rejected','update accounting.lines set debit=1','immutable_accounting_history');
  perform pg_temp.reject('history delete rejected','delete from accounting.revisions','immutable_accounting_history');
  perform pg_temp.reject('reports before start unavailable',format('select accounting.report(%L,%L)',d-1,d),'invalid_report_range');
  perform pg_temp.ok('all entity batches balance',not exists(select 1 from accounting.lines group by batch_id,entity_id having sum(debit-credit)<>0));
  perform pg_temp.ok('all related mirrors balance',not exists(select 1 from accounting.lines l join accounting.accounts a on a.id=l.account_id join accounting.parties p on p.id=a.party_id
    where p.kind='related' group by least(l.entity_id,p.related_entity_id),greatest(l.entity_id,p.related_entity_id) having sum(l.debit-l.credit)<>0));
  gl:=accounting.gl(pg_temp.a('E1','bank'),d,d+15);
  r:=accounting.report(d,d+15);
  perform pg_temp.ok('GL closing reconciles to report and ledger',(gl->>'closing')::numeric=pg_temp.balance(pg_temp.a('E1','bank'))
    and (select (value->>'closing')::numeric from jsonb_array_elements(r->'accounts') where value->>'account_id'=pg_temp.a('E1','bank')::text)=(gl->>'closing')::numeric);

  -- Own flows, maximum exact decimals, refunds, named external parties and archives.
  receipt:=accounting.post(pg_temp.request(pg_temp.entry('income','9999999999999999.99','E5','E5')));
  perform pg_temp.ok('maximum amount retains every decimal digit',pg_temp.balance(pg_temp.a('E5','bank'))=9999999999999999.99);
  perform accounting.post(jsonb_build_object('key',gen_random_uuid(),'action','void','transaction_id',receipt->>'transaction_id','expected_revision',1,'reason','max value test'));
  receipt:=accounting.post(pg_temp.request(pg_temp.entry('expense','0.01','E5','E5')));
  perform pg_temp.ok('own expense has two lines',
    (select count(*)=2 from accounting.lines l join accounting.batches b on b.id=l.batch_id join accounting.revisions v on v.id=b.revision_id where v.transaction_id=(receipt->>'transaction_id')::uuid));
  perform accounting.post(pg_temp.request(jsonb_build_object('kind','refund','date',d+12,'amount','0.01','source_transaction_id',receipt->>'transaction_id')));
  perform pg_temp.ok('own refund restores original money route',pg_temp.balance(pg_temp.a('E5','bank'))=0 and pg_temp.balance(pg_temp.a('E5','expense'))=0);
  master_req:=jsonb_build_object('key',gen_random_uuid(),'action','add_party','target','party','name','Synthetic lender');
  r:=accounting.master(master_req); party:=(r->>'id')::uuid;
  perform pg_temp.ok('named party creation idempotent',accounting.master(master_req)=r);
  perform accounting.post(pg_temp.request(pg_temp.entry('party_receipt','500')-'category_account_id'||jsonb_build_object('party_id',party)));
  perform accounting.post(pg_temp.request(pg_temp.entry('party_payment','600')-'category_account_id'||jsonb_build_object('party_id',party)));
  perform pg_temp.ok('external settlement crosses zero without P&L',pg_temp.balance(accounting.party_account(pg_temp.e('E2'),party))=100);
  perform accounting.master(jsonb_build_object('key',gen_random_uuid(),'action','update','target','party','id',party,'name','Renamed lender','active',false));
  perform pg_temp.reject('archived named party unavailable for new settlement',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('party_payment','10')-'category_account_id'||jsonb_build_object('party_id',party))),'invalid_settlement_party');
  perform pg_temp.ok('archived party history retained',pg_temp.balance(accounting.party_account(pg_temp.e('E2'),party))=100);
  perform accounting.master(jsonb_build_object('key',gen_random_uuid(),'action','update','target','account','id',pg_temp.a('E5','expense'),'name','Archived expense','active',false));
  perform pg_temp.reject('archived category unavailable for new posting',format('select accounting.post(%L::jsonb)',pg_temp.request(pg_temp.entry('expense','10','E5','E5'))),'invalid_category');
  perform pg_temp.ok('master edits recorded in audit',(select count(*)>=3 from accounting.audit_events where action like 'master_%'));
  gl:=accounting.gl(pg_temp.a('E1','bank'),d+1,d+15);
  perform pg_temp.ok('mid-period GL includes opening once',(gl->>'opening')::numeric=20000 and (gl->>'closing')::numeric=pg_temp.balance(pg_temp.a('E1','bank')));
  perform pg_temp.reject('refund cannot choose alternate bank',format('select accounting.post(%L::jsonb)',pg_temp.request(jsonb_build_object('kind','refund','date',d+12,'source_transaction_id',income->>'transaction_id','amount','1','money_account_id',pg_temp.a('E6','bank')))),'refund_route_must_match_source');
  perform pg_temp.reject('refund cannot predate source',format('select accounting.post(%L::jsonb)',pg_temp.request(jsonb_build_object('kind','refund','date',d+1,'source_transaction_id',income->>'transaction_id','amount','1'))),'refund_before_source');
  refund:=accounting.post(pg_temp.request(jsonb_build_object('kind','refund','date',d+12,'source_transaction_id',income->>'transaction_id','amount','2000')));
  perform pg_temp.reject('refunded source cannot shrink below refund',format('select accounting.post(%L::jsonb)',jsonb_build_object('key',gen_random_uuid(),'action','edit','transaction_id',income->>'transaction_id','expected_revision',1,'reason','test','entry',pg_temp.entry('income','1999'))),'source_has_active_refunds');
  perform accounting.post(jsonb_build_object('key',gen_random_uuid(),'action','edit','transaction_id',income->>'transaction_id','expected_revision',1,'reason','valid source adjustment','entry',pg_temp.entry('income','7000')));
  perform pg_temp.ok('source edit above refund preserves net income',pg_temp.balance(pg_temp.a('E2','income'))=-5000);
  perform accounting.post(jsonb_build_object('key',gen_random_uuid(),'action','edit','transaction_id',refund->>'transaction_id','expected_revision',1,'reason','adjust partial refund',
    'entry',jsonb_build_object('kind','refund','date',d+13,'source_transaction_id',income->>'transaction_id','amount','3000')));
  perform pg_temp.ok('refund edit replaces prior effect once',pg_temp.balance(pg_temp.a('E2','income'))=-4000);
  perform pg_temp.reject('account cannot be reassigned',format('update accounting.accounts set entity_id=%L where id=%L',pg_temp.e('E6'),pg_temp.a('E5','expense')),'account_identity_immutable');
end $$;

-- Deliberately malformed admin inserts prove deferred controls are real.
do $$ declare v uuid; b uuid; before_lines bigint; failed boolean:=false; begin
  select id into v from accounting.revisions limit 1;
  select count(*) into before_lines from accounting.lines;
  begin
    insert into accounting.batches(revision_id,effective_date,role) values(v,current_date,'original') returning id into b;
    perform accounting.line(b,pg_temp.a('E1','bank'),1);
    set constraints all immediate;
  exception when check_violation then failed:=true; end;
  perform pg_temp.ok('deferred entity imbalance rejected and rolled back',failed and before_lines=(select count(*) from accounting.lines));
  failed:=false;
  begin
    insert into accounting.batches(revision_id,effective_date,role) values(v,current_date,'original') returning id into b;
    perform accounting.line(b,pg_temp.a('E1','bank'),-1);
    perform accounting.line(b,accounting.related_account(pg_temp.e('E1'),pg_temp.e('E2')),1);
    set constraints all immediate;
  exception when check_violation then failed:=true; end;
  perform pg_temp.ok('balanced entity with missing mirror rejected',failed and before_lines=(select count(*) from accounting.lines));
end $$;

-- Flush deferred constraints before rollback so bad journals cannot hide in tests.
do $$ declare result jsonb; tid uuid; begin
  result:=public.accounting_activity(current_date-100,current_date,null,0);
  perform pg_temp.ok('activity returns at most 25 rows',jsonb_array_length(result->'items')<=25 and (result->>'total')::int>0);
  select id into tid from accounting.transactions where kind='expense' limit 1;
  result:=public.accounting_detail(tid);
  perform pg_temp.ok('detail returns immutable revisions and exact money strings',jsonb_array_length(result->'revisions')>0 and jsonb_array_length(result->'lines')>0 and jsonb_typeof(result->'lines'->0->'debit')='string');
  perform pg_temp.reject('negative activity offset rejected','select public.accounting_activity(current_date-100,current_date,null,-1)','invalid_activity_filter');
  perform pg_temp.ok('activity past last page is empty',jsonb_array_length(public.accounting_activity(current_date-100,current_date,null,10000)->'items')=0);
end $$;
set constraints all immediate;
grant insert,select on test_results to authenticated,anon;
set local role authenticated;
select pg_temp.ok('owner RPC reads allowed',public.accounting_catalog()->'entities' is not null);
select pg_temp.ok('owner activity RPC allowed',public.accounting_activity(current_date-100,current_date,null,0)->'items' is not null);
select pg_temp.reject('owner direct journal writes denied','insert into accounting.lines default values','permission denied');
select pg_temp.reject('owner internal helper denied','select accounting.line(null,null,1)','permission denied');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true) is not null as nonowner_context_set;
select pg_temp.reject('other authenticated owner check denies catalog','select public.accounting_catalog()','owner_required');
select pg_temp.reject('other authenticated owner check denies posting','select public.accounting_post(''{}'')','owner_required');
select pg_temp.reject('other authenticated activity denied','select public.accounting_activity(current_date-100,current_date,null,0)','owner_required');
select pg_temp.reject('other authenticated detail denied','select public.accounting_detail(gen_random_uuid())','owner_required');
reset role;
set local role anon;
select pg_temp.reject('anonymous catalog RPC denied','select public.accounting_catalog()','permission denied');
select pg_temp.reject('anonymous posting RPC denied','select public.accounting_post(''{}'')','permission denied');
select pg_temp.reject('anonymous activity denied','select public.accounting_activity(current_date-100,current_date,null,0)','permission denied');
select pg_temp.reject('anonymous detail denied','select public.accounting_detail(gen_random_uuid())','permission denied');
reset role;
select count(*) as passed_checks,jsonb_agg(name order by name) as checks from test_results;
rollback;
