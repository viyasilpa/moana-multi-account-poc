-- Only remove this POC table if empty. Never cascade.
do $$ begin
 if exists (select 1 from public.poc_items) then
  raise exception 'POC table is not empty: export/review before removal';
 end if;
end $$;
drop table public.poc_items;
