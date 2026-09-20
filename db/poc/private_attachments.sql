-- Private POC attachments: append-only from the client.
-- Recovery: drop only these two named policies in a new migration.
-- This denies client access without deleting files or changing bucket metadata.
do $$ begin
 if not exists(select 1 from storage.buckets where id='poc-attachments' and public=false)
 then raise exception 'Private poc-attachments bucket required'; end if;
end $$;
create policy poc_attachments_owner_read on storage.objects
for select to authenticated using (
 bucket_id='poc-attachments'
 and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.app_owner where user_id=(select auth.uid()))
);
create policy poc_attachments_owner_insert on storage.objects
for insert to authenticated with check (
 bucket_id='poc-attachments'
 and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.app_owner where user_id=(select auth.uid()))
);
-- No UPDATE or DELETE: no overwriting or removing retained attachments.
