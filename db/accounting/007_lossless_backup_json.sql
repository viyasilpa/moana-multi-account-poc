-- Nested JSON can contain numeric values from API callers, not just UI strings.
-- Transport JSONB columns as canonical text so JavaScript cannot round history.
create or replace function accounting.backup() returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare tables jsonb:='{}'; counts jsonb:='{}'; t text; rows jsonb;
begin
 perform accounting.assert_owner();
 foreach t in array array['settings','entities','parties','accounts','transactions','revisions','batches','lines','audit_events','requests','attachments'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) %s order by %s),''[]''::jsonb) from accounting.%I x',
   case t when 'revisions' then '||jsonb_build_object(''amount'',x.amount::text,''input'',x.input::text)'
    when 'lines' then '||jsonb_build_object(''debit'',x.debit::text,''credit'',x.credit::text)'
    when 'batches' then '||jsonb_build_object(''sequence'',x.sequence::text)'
    when 'audit_events' then '||jsonb_build_object(''details'',x.details::text)'
    when 'requests' then '||jsonb_build_object(''payload'',x.payload::text,''response'',x.response::text)' else '' end,
   case t when 'settings' then 'singleton' when 'requests' then 'key' else 'id' end,t) into rows;
  tables:=tables||jsonb_build_object(t,rows); counts:=counts||jsonb_build_object(t,jsonb_array_length(rows));
 end loop;
 return jsonb_build_object('format','moana-ledger','version',2,'exported_at',statement_timestamp(),'tables',tables,'counts',counts);
end $$;
