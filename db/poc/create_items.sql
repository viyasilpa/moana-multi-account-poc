-- Isolated technical POC only; not the accounting schema.
create table public.poc_items (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 description text not null check (length(btrim(description)) between 1 and 200),
 amount numeric not null check (amount > 0 and amount < 10000000000000000 and amount = round(amount,2)),
 created_at timestamptz not null default now()
);
alter table public.poc_items enable row level security;
alter table public.poc_items force row level security;
revoke all on public.poc_items from public, anon, authenticated;
grant select, insert, update, delete on public.poc_items to authenticated;
create index poc_items_owner_idx on public.poc_items(owner_id);
create policy poc_items_select on public.poc_items for select to authenticated using (owner_id = (select auth.uid()));
create policy poc_items_insert on public.poc_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy poc_items_update on public.poc_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy poc_items_delete on public.poc_items for delete to authenticated using (owner_id = (select auth.uid()));
comment on table public.poc_items is 'Technical POC only. No real financial data. Owner UUIDs for SQL role tests are synthetic; this does not prove Auth login.';
