-- Additive read APIs. No master or ledger data changes.
create function accounting.activity(p_from date,p_to date,p_entity uuid,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform accounting.assert_owner();
  if p_from is null or p_to is null or p_to<p_from or p_offset is null or p_offset<0 then
    raise exception 'invalid_activity_filter' using errcode='23514';
  end if;
  with matched as (
    select t.id,t.kind,t.status,t.current_revision,v.effective_date,v.amount::text amount,v.input,t.created_at
    from accounting.transactions t join accounting.revisions v on v.transaction_id=t.id and v.revision=t.current_revision
    where v.effective_date between p_from and p_to and (p_entity is null or exists(
      select 1 from accounting.revisions r join accounting.batches b on b.revision_id=r.id
      join accounting.lines l on l.batch_id=b.id where r.transaction_id=t.id and l.entity_id=p_entity))
  ), page as (select * from matched order by effective_date desc,created_at desc,id desc limit 25 offset p_offset)
  select jsonb_build_object('total',(select count(*) from matched),'items',
    coalesce((select jsonb_agg(to_jsonb(p) order by effective_date desc,created_at desc,id desc) from page p),'[]')) into result;
  return result;
end $$;

create function accounting.detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform accounting.assert_owner();
  if not exists(select 1 from accounting.transactions where id=p_id) then raise exception 'transaction_not_found' using errcode='P0002'; end if;
  select jsonb_build_object('revisions',coalesce((select jsonb_agg(jsonb_build_object(
    'revision',v.revision,'date',v.effective_date,'amount',v.amount::text,'input',v.input,'reason',v.reason,'created_at',v.created_at
    ) order by v.revision desc) from accounting.revisions v where v.transaction_id=p_id),'[]'),
    'lines',coalesce((select jsonb_agg(jsonb_build_object('revision',v.revision,'date',b.effective_date,'role',b.role,
    'entity_id',l.entity_id,'account_id',l.account_id,'debit',l.debit::text,'credit',l.credit::text)
    order by b.sequence,l.line_number) from accounting.revisions v join accounting.batches b on b.revision_id=v.id
    join accounting.lines l on l.batch_id=b.id where v.transaction_id=p_id),'[]')) into result;
  return result;
end $$;
create function public.accounting_activity(p_from date,p_to date,p_entity uuid,p_offset integer) returns jsonb
language sql stable security invoker set search_path='' as $$ select accounting.activity(p_from,p_to,p_entity,p_offset) $$;
create function public.accounting_detail(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select accounting.detail(p_id) $$;
revoke all on function accounting.activity(date,date,uuid,integer),accounting.detail(uuid),
 public.accounting_activity(date,date,uuid,integer),public.accounting_detail(uuid) from public,anon,authenticated;
grant execute on function accounting.activity(date,date,uuid,integer),accounting.detail(uuid),
 public.accounting_activity(date,date,uuid,integer),public.accounting_detail(uuid) to authenticated;
