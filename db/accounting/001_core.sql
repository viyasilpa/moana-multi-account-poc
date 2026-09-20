-- Stage 3: additive isolated accounting engine. No POC tables are changed.
-- Apply through Supabase migration tooling. Private business master data is NOT here.
create schema accounting;
revoke all on schema accounting from public, anon, authenticated;

-- Deliberately unconstrained numeric domain: numeric(18,2) rounds BEFORE CHECK.
-- This preserves the 18/2 range while rejecting, rather than rounding, precision.
create domain accounting.money as numeric
  check (value > -10000000000000000 and value < 10000000000000000
    and value = round(value, 2));

create table accounting.settings (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references auth.users(id),
  start_date date,
  currency text not null default 'THB' check (currency = 'THB'),
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  schema_version integer not null default 1,
  opening_finalized_at timestamptz
);
insert into accounting.settings(owner_id) select user_id from public.app_owner;

create table accounting.entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z][A-Za-z0-9_-]{0,39}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  active boolean not null default true
);
create table accounting.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  kind text not null check (kind in ('related','pp','other')),
  related_entity_id uuid unique references accounting.entities(id),
  active boolean not null default true,
  check ((kind = 'related') = (related_entity_id is not null))
);
create unique index one_pp on accounting.parties(kind) where kind = 'pp';
create table accounting.accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references accounting.entities(id),
  code text not null check (length(code) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('bank','cash','income','expense','party','opening_equity')),
  party_id uuid references accounting.parties(id),
  active boolean not null default true,
  unique(entity_id, code), unique(id, entity_id),
  check ((kind = 'party') = (party_id is not null))
);
create unique index one_party_account on accounting.accounts(entity_id,party_id) where kind = 'party';
create unique index one_opening_equity on accounting.accounts(entity_id) where kind = 'opening_equity';
create index accounts_party_idx on accounting.accounts(party_id);
create table accounting.transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense','income','transfer','party_payment','party_receipt','refund','opening')),
  current_revision integer not null check (current_revision > 0),
  status text not null check (status in ('posted','void')),
  source_transaction_id uuid references accounting.transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'refund') = (source_transaction_id is not null))
);
create index transactions_source_idx on accounting.transactions(source_transaction_id);
create unique index one_opening on accounting.transactions(kind) where kind = 'opening';
create table accounting.revisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references accounting.transactions(id),
  revision integer not null check (revision > 0),
  effective_date date not null,
  amount accounting.money,
  input jsonb not null,
  reason text not null default '',
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(transaction_id,revision)
);
create table accounting.batches (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references accounting.revisions(id),
  effective_date date not null,
  role text not null check (role in ('original','replacement','reversal','opening')),
  is_opening boolean not null default false,
  reverses_id uuid unique references accounting.batches(id),
  sequence bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  check ((role = 'reversal') = (reverses_id is not null))
);
create index batches_revision_idx on accounting.batches(revision_id);
create index batches_date_idx on accounting.batches(effective_date,sequence);
create table accounting.lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references accounting.batches(id),
  line_number integer not null check (line_number > 0),
  entity_id uuid not null references accounting.entities(id),
  account_id uuid not null,
  debit accounting.money not null check (debit >= 0),
  credit accounting.money not null check (credit >= 0),
  unique(batch_id,line_number),
  foreign key(account_id,entity_id) references accounting.accounts(id,entity_id),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index lines_account_idx on accounting.lines(account_id,batch_id);
create index lines_entity_idx on accounting.lines(entity_id,batch_id);
create table accounting.audit_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references accounting.transactions(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
create index audit_transaction_idx on accounting.audit_events(transaction_id);
create table accounting.requests (
  key uuid primary key,
  request_hash text not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create function accounting.assert_owner() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists(select 1 from public.app_owner where user_id = u)
     or not exists(select 1 from accounting.settings where owner_id = u) then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  return u;
end $$;

-- Fail closed, even if someone later adds schema exposure or a table grant.
do $$ declare t text; begin
  foreach t in array array['settings','entities','parties','accounts','transactions','revisions','batches','lines','audit_events','requests'] loop
    execute format('alter table accounting.%I enable row level security',t);
    execute format('alter table accounting.%I force row level security',t);
    execute format('create policy owner_read on accounting.%I for select to authenticated using (exists(select 1 from public.app_owner where user_id = (select auth.uid())))',t);
  end loop;
end $$;

create function accounting.immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'immutable_accounting_history' using errcode = '23514'; end $$;
do $$ declare t text; begin
  foreach t in array array['revisions','batches','lines','audit_events','requests'] loop
    execute format('create trigger immutable_history before update or delete on accounting.%I for each row execute function accounting.immutable()',t);
  end loop;
end $$;

create function accounting.validate_batch(p_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from accounting.lines where batch_id=p_id) then
    raise exception 'empty_journal' using errcode='23514';
  end if;
  if exists(select 1 from accounting.lines where batch_id=p_id group by entity_id having sum(debit-credit) <> 0) then
    raise exception 'unbalanced_entity' using errcode='23514';
  end if;
  if exists(
    select 1 from accounting.lines l join accounting.accounts a on a.id=l.account_id
      join accounting.parties p on p.id=a.party_id
    where l.batch_id=p_id and p.kind='related'
    group by least(l.entity_id,p.related_entity_id),greatest(l.entity_id,p.related_entity_id)
    having sum(l.debit-l.credit) <> 0
  ) then raise exception 'unbalanced_mirror' using errcode='23514'; end if;
end $$;
create function accounting.check_batch_trigger() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name='batches' then
    perform accounting.validate_batch(new.id);
  else
    perform accounting.validate_batch(new.batch_id);
  end if;
  return null;
end $$;
create constraint trigger batch_balance after insert on accounting.batches deferrable initially deferred for each row execute function accounting.check_batch_trigger();
create constraint trigger line_balance after insert on accounting.lines deferrable initially deferred for each row execute function accounting.check_batch_trigger();

create function accounting.master_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then raise exception 'archive_master_instead' using errcode='23514'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.entity_id<>old.entity_id or new.kind<>old.kind or new.party_id is distinct from old.party_id or new.code<>old.code) then
    raise exception 'account_identity_immutable' using errcode='23514';
  end if;
  if exists(select 1 from accounting.parties p where p.id=new.party_id and p.related_entity_id=new.entity_id) then
    raise exception 'self_party_forbidden' using errcode='23514';
  end if;
  return new;
end $$;
create trigger account_guard before insert or update or delete on accounting.accounts for each row execute function accounting.master_guard();

create function accounting.line(p_batch uuid,p_account uuid,p_signed numeric) returns void
language plpgsql set search_path = '' as $$
begin
  insert into accounting.lines(batch_id,line_number,entity_id,account_id,debit,credit)
    select p_batch,coalesce((select max(line_number) from accounting.lines where batch_id=p_batch),0)+1,
      a.entity_id,a.id,greatest(p_signed,0),greatest(-p_signed,0)
    from accounting.accounts a where a.id=p_account;
  if not found then raise exception 'account_not_found' using errcode='23514'; end if;
end $$;
create function accounting.party_account(p_entity uuid,p_party uuid) returns uuid
language plpgsql set search_path = '' as $$
declare r uuid;
begin
  select a.id into r from accounting.accounts a where a.entity_id=p_entity and a.party_id=p_party;
  if r is null then raise exception 'party_account_not_found' using errcode='23514'; end if;
  return r;
end $$;
create function accounting.related_account(p_entity uuid,p_related uuid) returns uuid
language sql set search_path = '' as $$
  select accounting.party_account(p_entity,p.id) from accounting.parties p where p.related_entity_id=p_related
$$;

-- All privilege-bearing entry points are private and independently owner-checked.
-- Public RPC wrappers below are SECURITY INVOKER only.
create function accounting.configure(p_manifest jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; e jsonb; a jsonb; eid uuid; p uuid; pp uuid;
begin
  u := accounting.assert_owner();
  perform 1 from accounting.settings where singleton for update;
  if exists(select 1 from accounting.entities) then raise exception 'already_configured'; end if;
  if jsonb_typeof(p_manifest->'entities') is distinct from 'array' or jsonb_array_length(p_manifest->'entities') <> 6 then
    raise exception 'six_entities_required' using errcode='23514';
  end if;
  for e in select value from jsonb_array_elements(p_manifest->'entities') loop
    insert into accounting.entities(code,name) values(e->>'code',e->>'name') returning id into eid;
    insert into accounting.parties(name,kind,related_entity_id) values(e->>'name','related',eid);
    insert into accounting.accounts(entity_id,code,name,kind) values(eid,'opening-equity','ทุน/ยอดสะสมเริ่มต้น','opening_equity');
    for a in select value from jsonb_array_elements(e->'accounts') loop
      if a->>'kind' not in ('bank','cash','income','expense') then raise exception 'invalid_master_kind'; end if;
      insert into accounting.accounts(entity_id,code,name,kind) values(eid,a->>'code',a->>'name',a->>'kind');
    end loop;
  end loop;
  insert into accounting.parties(name,kind) values('PP','pp') returning id into pp;
  insert into accounting.accounts(entity_id,code,name,kind,party_id)
    select e.id,'party-'||p.id,'AR(AP)-'||p.name,'party',p.id
    from accounting.entities e cross join accounting.parties p where p.related_entity_id is distinct from e.id;
  insert into accounting.audit_events(actor_id,action,details) values(u,'configure',jsonb_build_object('entity_count',6));
  return jsonb_build_object('configured',true);
end $$;

create function accounting.build_batch(p_revision uuid,p_entry jsonb,p_role text) returns uuid
language plpgsql set search_path = '' as $$
declare
  b uuid; v_kind text := p_entry->>'kind'; d date := (p_entry->>'date')::date;
  n numeric; sign integer; e uuid; m uuid; c uuid; dest uuid; party uuid; target uuid;
  money accounting.accounts%rowtype; cat accounting.accounts%rowtype;
  src accounting.transactions%rowtype; src_input jsonb; row jsonb; acc accounting.accounts%rowtype;
  seen uuid[] := '{}'; seen_pairs text[] := '{}'; pair_key text; r record;
begin
  if d is null or d > (now() at time zone 'Asia/Bangkok')::date then raise exception 'invalid_or_future_date' using errcode='23514'; end if;
  if length(coalesce(p_entry->>'description',''))>500 then raise exception 'description_too_long' using errcode='23514'; end if;
  if v_kind='opening' then
    if jsonb_typeof(p_entry->'balances') is distinct from 'array' or jsonb_array_length(p_entry->'balances')>500 then raise exception 'invalid_opening'; end if;
  else
    if coalesce(p_entry->>'amount','') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then raise exception 'invalid_amount' using errcode='23514'; end if;
    n := (p_entry->>'amount')::accounting.money;
    if n<=0 then raise exception 'positive_amount_required' using errcode='23514'; end if;
    if d < (select start_date from accounting.settings) then raise exception 'before_start_date' using errcode='23514'; end if;
  end if;
  if v_kind<>'opening' then
    insert into accounting.batches(revision_id,effective_date,role,is_opening)
      values(p_revision,d,p_role,false) returning id into b;
  end if;
  if v_kind='opening' then
    for row in select value from jsonb_array_elements(p_entry->'balances') loop
      if coalesce(row->>'signed_amount','') !~ '^-?[0-9]{1,16}(\.[0-9]{1,2})?$' then raise exception 'invalid_opening_amount' using errcode='23514'; end if;
      n := (row->>'signed_amount')::accounting.money;
      select * into acc from accounting.accounts where id=(row->>'account_id')::uuid and active;
      if not found or acc.kind not in ('bank','cash','party') then raise exception 'invalid_opening_account' using errcode='23514'; end if;
      if acc.id=any(seen) then raise exception 'duplicate_opening_account' using errcode='23514'; end if;
      seen:=array_append(seen,acc.id);
      select related_entity_id into target from accounting.parties where id=acc.party_id;
      if target is not null then
        pair_key:=least(acc.entity_id,target)::text||':'||greatest(acc.entity_id,target)::text;
        if pair_key=any(seen_pairs) then raise exception 'duplicate_opening_pair' using errcode='23514'; end if;
        seen_pairs:=array_append(seen_pairs,pair_key);
      end if;
      if n<>0 then
        if b is null then
          insert into accounting.batches(revision_id,effective_date,role,is_opening)
            values(p_revision,d,case when p_role='original' then 'opening' else p_role end,true) returning id into b;
        end if;
        perform accounting.line(b,acc.id,n);
        if target is not null then perform accounting.line(b,accounting.related_account(target,acc.entity_id),-n); end if;
      end if;
    end loop;
    for r in select entity_id,sum(debit-credit) total from accounting.lines where batch_id=b group by entity_id having sum(debit-credit)<>0 loop
      select id into c from accounting.accounts where entity_id=r.entity_id and kind='opening_equity';
      perform accounting.line(b,c,-r.total);
    end loop;
    -- A zero opening is a revision/audit event, not an empty journal batch.
    if b is null then return null; end if;
  elsif v_kind='refund' then
    select * into src from accounting.transactions where id=(p_entry->>'source_transaction_id')::uuid and status='posted';
    if not found or src.kind not in ('expense','income') then raise exception 'invalid_refund_source' using errcode='23514'; end if;
    select input into src_input from accounting.revisions where transaction_id=src.id and revision=src.current_revision;
    if d < (src_input->>'date')::date then raise exception 'refund_before_source' using errcode='23514'; end if;
    -- Reconstruct the exact original economic routes, scaled to the refund amount.
    -- There are two or four equal-magnitude source lines, so no prorating/rounding.
    for r in select l.account_id,l.debit,l.credit from accounting.lines l join accounting.batches x on x.id=l.batch_id
      join accounting.revisions v on v.id=x.revision_id
      where v.transaction_id=src.id and v.revision=src.current_revision and x.role<>'reversal' loop
      perform accounting.line(b,r.account_id,case when r.debit>0 then -n else n end);
    end loop;
  else
    e := nullif(p_entry->>'for_entity_id','')::uuid;
    c := nullif(p_entry->>'category_account_id','')::uuid;
    party := nullif(p_entry->>'party_id','')::uuid;
    dest := nullif(p_entry->>'destination_account_id','')::uuid;
    if p_entry->>'funding' = 'pp' then
      if v_kind<>'expense' or p_entry->>'money_account_id' is not null or party is not null or dest is not null then raise exception 'pp_only_pays_expense' using errcode='23514'; end if;
      select id into party from accounting.parties where kind='pp' and active;
      if party is null then raise exception 'pp_inactive'; end if;
      m:=e;
    elsif p_entry->>'funding' = 'money' then
      select * into money from accounting.accounts where id=(p_entry->>'money_account_id')::uuid and active and kind in ('bank','cash');
      if not found then raise exception 'invalid_money_account' using errcode='23514'; end if;
      m:=money.entity_id;
    else raise exception 'funding_required' using errcode='23514'; end if;
    if not exists(select 1 from accounting.entities where id=m and active) then raise exception 'inactive_money_entity'; end if;
    if v_kind='transfer' then
      if e is not null or c is not null or party is not null then raise exception 'transfer_has_no_category_or_party' using errcode='23514'; end if;
      select * into acc from accounting.accounts where id=dest and active and kind in ('bank','cash');
      if not found or dest=money.id then raise exception 'invalid_transfer_destination' using errcode='23514'; end if;
      e:=acc.entity_id;
      if not exists(select 1 from accounting.entities where id=e and active) then raise exception 'inactive_entity'; end if;
      perform accounting.line(b,money.id,-n);
      perform accounting.line(b,dest,n);
      if m<>e then
        perform accounting.line(b,accounting.related_account(m,e),n);
        perform accounting.line(b,accounting.related_account(e,m),-n);
      end if;
    else
      if not exists(select 1 from accounting.entities where id=e and active) or dest is not null then raise exception 'invalid_for_entity' using errcode='23514'; end if;
      sign:=case when v_kind in ('expense','party_payment') then 1 else -1 end;
      if v_kind in ('expense','income') then
        select * into cat from accounting.accounts where id=c and entity_id=e and kind=v_kind and active;
        if not found then raise exception 'invalid_category' using errcode='23514'; end if;
        if p_entry->>'funding'='money' and party is not null then raise exception 'unexpected_party'; end if;
        target:=c;
      elsif v_kind in ('party_payment','party_receipt') then
        if c is not null or not exists(select 1 from accounting.parties where id=party and active and kind in ('pp','other')) then raise exception 'invalid_settlement_party' using errcode='23514'; end if;
        target:=accounting.party_account(e,party);
      else raise exception 'unsupported_kind' using errcode='23514'; end if;
      perform accounting.line(b,target,sign*n);
      if p_entry->>'funding'='pp' then
        perform accounting.line(b,accounting.party_account(e,party),-n);
      else
        perform accounting.line(b,money.id,-sign*n);
        if m<>e then
          perform accounting.line(b,accounting.related_account(m,e),sign*n);
          perform accounting.line(b,accounting.related_account(e,m),-sign*n);
        end if;
      end if;
    end if;
  end if;
  perform accounting.validate_batch(b);
  return b;
end $$;

-- Restrict every function now; later migration explicitly exposes only safe entries.
revoke all on all tables in schema accounting from public,anon,authenticated;
revoke all on all sequences in schema accounting from public,anon,authenticated;
revoke all on all functions in schema accounting from public,anon,authenticated;
