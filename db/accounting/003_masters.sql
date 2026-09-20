create function accounting.master(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; k uuid; req accounting.requests%rowtype; p uuid; before_data jsonb; after_data jsonb;
  v_name text:=btrim(p_request->>'name'); v_kind text:=p_request->>'target'; response jsonb; v_active boolean;
begin
  u:=accounting.assert_owner();
  perform 1 from accounting.settings where singleton for update;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>4096
    or exists(select 1 from jsonb_object_keys(p_request) x where x not in ('key','action','target','id','name','active')) then raise exception 'invalid_master_request'; end if;
  k:=(p_request->>'key')::uuid;
  if k is null then raise exception 'idempotency_key_required'; end if;
  select * into req from accounting.requests where key=k;
  if found then
    if req.payload<>p_request then raise exception 'idempotency_conflict' using errcode='23505'; end if;
    return req.response;
  end if;
  if v_name is null or length(v_name) not between 1 and 100 then raise exception 'invalid_name'; end if;
  if p_request->>'action'='add_party' then
    if v_kind is distinct from 'party' or p_request ? 'id' or p_request ? 'active' then raise exception 'invalid_add_party'; end if;
    if exists(select 1 from accounting.parties where lower(btrim(parties.name))=lower(v_name)) then raise exception 'party_name_exists'; end if;
    insert into accounting.parties(name,kind) values(v_name,'other') returning id into p;
    insert into accounting.accounts(entity_id,code,name,kind,party_id)
      select id,'party-'||p,'AR(AP)-'||v_name,'party',p from accounting.entities;
    select to_jsonb(x) into after_data from accounting.parties x where id=p;
  elsif p_request->>'action'='update' then
    p:=(p_request->>'id')::uuid;
    if jsonb_typeof(p_request->'active') is distinct from 'boolean' then raise exception 'active_boolean_required'; end if;
    v_active:=(p_request->>'active')::boolean;
    if v_kind='account' then
      select to_jsonb(a) into before_data from accounting.accounts a where id=p;
      if before_data is null or before_data->>'kind' in ('opening_equity','party') then raise exception 'system_account_not_editable'; end if;
      update accounting.accounts a set name=v_name,active=v_active where id=p;
      select to_jsonb(a) into after_data from accounting.accounts a where id=p;
    elsif v_kind='party' then
      select to_jsonb(x) into before_data from accounting.parties x where id=p;
      if before_data is null or before_data->>'kind'='related' then raise exception 'related_party_managed_by_entity'; end if;
      if exists(select 1 from accounting.parties x where x.id<>p and lower(btrim(x.name))=lower(v_name)) then raise exception 'party_name_exists'; end if;
      update accounting.parties x set name=v_name,active=v_active where id=p;
      update accounting.accounts a set name='AR(AP)-'||v_name,active=v_active where party_id=p;
      select to_jsonb(x) into after_data from accounting.parties x where id=p;
    else raise exception 'invalid_master_target'; end if;
  else raise exception 'invalid_master_action'; end if;
  insert into accounting.audit_events(actor_id,action,details) values(u,'master_'||(p_request->>'action'),jsonb_build_object('before',before_data,'after',after_data));
  response:=jsonb_build_object('id',p,'saved',true);
  insert into accounting.requests(key,request_hash,payload,response) values(k,md5(p_request::text),p_request,response);
  return response;
end $$;
create function public.accounting_master(p_request jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select accounting.master(p_request) $$;
revoke all on function accounting.master(jsonb),public.accounting_master(jsonb) from public,anon,authenticated;
grant execute on function accounting.master(jsonb),public.accounting_master(jsonb) to authenticated;
