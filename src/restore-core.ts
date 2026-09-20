import { PGlite } from '@electric-sql/pglite'
import type { Snapshot } from './backup-format'

// Shared only by isolated rehearsal/demo/tests. Never a live Supabase connection.
export const storageStub=`create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert on storage.objects to authenticated;`
export async function restoreIsolated(snapshot:Snapshot,sql:string[]) {
 const db=new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table public.app_owner(user_id uuid references auth.users(id));
   grant usage on schema auth to authenticated; grant select on public.app_owner to authenticated;`+storageStub)
  const owner=snapshot.tables.settings[0].owner_id
  await db.query('insert into auth.users values($1::uuid)',[owner])
  await db.query('insert into public.app_owner values($1::uuid)',[owner])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  for(const s of sql)await db.exec(s)
  await db.transaction(async tx=>{
   // Only these fixed identifiers can become SQL. Data is always bound JSON.
   for(const t of ['entities','parties','accounts','transactions','revisions','batches','lines','audit_events','requests','attachments'] as const) {
    await tx.query(`insert into accounting.${t} ${t==='batches'?'overriding system value':''} select * from jsonb_populate_recordset(null::accounting.${t},$1::jsonb)`,[JSON.stringify(snapshot.tables[t])])
   }
   await tx.query(`update accounting.settings set (start_date,currency,timezone,schema_version,opening_finalized_at)=(select start_date,currency,timezone,schema_version,opening_finalized_at from jsonb_populate_record(null::accounting.settings,$1::jsonb))`,[JSON.stringify(snapshot.tables.settings[0])])
   await tx.exec(`select setval(pg_get_serial_sequence('accounting.batches','sequence'),coalesce((select max(sequence) from accounting.batches),1),exists(select 1 from accounting.batches));
    set constraints all immediate;`)
   const invalid=await tx.query<{bad:boolean}>(`select exists(select 1 from accounting.transactions t where not exists(select 1 from accounting.revisions r where r.transaction_id=t.id and r.revision=t.current_revision)) as bad`)
   if(invalid.rows[0].bad)throw new Error('restore_revision_missing')
  })
  await db.exec('set role authenticated')
  const exported=await db.query<{data:Snapshot}>('select public.accounting_backup() data')
  const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)
  if(canonical(exported.rows[0].data.tables)!==canonical(snapshot.tables))throw new Error('restore_roundtrip_mismatch')
  const start=snapshot.tables.settings[0].start_date
  const report=start?(await db.query<{data:unknown}>('select public.accounting_report($1::date,$2::date) data',[start,snapshot.exported_at.slice(0,10)<String(start)?start:snapshot.exported_at.slice(0,10)])).rows[0].data:null
  return {counts:exported.rows[0].data.counts,report}
 } finally {await db.close()}
}
