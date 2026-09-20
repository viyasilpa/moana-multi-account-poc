-- Technical POC: single-owner authorization, separate from authentication.
-- Bind the verified owner privately after applying; no personal identifiers in source.
create table public.app_owner (
 singleton boolean primary key default true check (singleton),
 user_id uuid not null unique references auth.users(id) on delete restrict
);
alter table public.app_owner enable row level security;
alter table public.app_owner force row level security;
revoke all on public.app_owner from public, anon, authenticated;
grant select on public.app_owner to authenticated;
create policy app_owner_self on public.app_owner for select to authenticated
 using (user_id = (select auth.uid()));
create policy poc_items_owner_gate on public.poc_items as restrictive for all to authenticated
 using (exists (select 1 from public.app_owner where user_id = (select auth.uid())))
 with check (exists (select 1 from public.app_owner where user_id = (select auth.uid())));
