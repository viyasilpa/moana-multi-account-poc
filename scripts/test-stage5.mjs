import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {storageStub,restoreIsolated} from '../src/restore-core.ts'
import {packBackup,unpackBackup,digest,encode} from '../src/backup-format.ts'

const sql=await Promise.all(['001_core.sql','002_commands.sql','003_masters.sql','004_read_api.sql','005_documents_backup.sql','006_backup_utc.sql','007_lossless_backup_json.sql'].map(f=>readFile(new URL('../db/accounting/'+f,import.meta.url),'utf8')))
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001'
let passed=0
const ok=(value,message)=>{assert.ok(value,message);passed++}
async function rejected(fn,pattern){await assert.rejects(fn,pattern);passed++}
const rpc=async(name,args)=>{const r=await db.query(`select public.${name}(${args===undefined?'':'$1::jsonb'}) data`,args===undefined?[]:[JSON.stringify(args)]);return r.rows[0].data}
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create table public.app_owner(user_id uuid references auth.users(id));
 insert into auth.users values('${owner}');insert into public.app_owner select id from auth.users;
 grant usage on schema auth to authenticated;grant select on public.app_owner to authenticated;`+storageStub)
 for(const s of sql)await db.exec(s)
 // Keep the synthetic regression fixture in this disposable DB, never on Supabase.
 await db.exec((await readFile(new URL('../db/accounting/test_engine.sql',import.meta.url),'utf8')).replace(/rollback;\s*$/,'commit;'))
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
 const tx=(await db.query("select id,current_revision from accounting.transactions where kind='expense' and status='posted' limit 1")).rows[0]
 await db.exec('set role authenticated')
 const bytes=new TextEncoder().encode('%PDF-1.4\n% synthetic attachment test\n%%EOF'),sha256=await digest(bytes)
 const q={key:crypto.randomUUID(),action:'reserve',transaction_id:tx.id,expected_revision:tx.current_revision,filename:'เอกสารทดสอบ.pdf',mime:'application/pdf',size:bytes.length,sha256}
 const a=await rpc('accounting_attachment',q)
 ok(a.path.startsWith(tx.id+'/')&&!a.path.includes(q.filename),'server path is transaction-scoped and does not trust filename')
 assert.deepEqual(await rpc('accounting_attachment',q),a);passed++
 await rejected(()=>rpc('accounting_attachment',{...q,filename:'different.pdf'}),/idempotency_conflict/)
 await rejected(()=>rpc('accounting_attachment',{...q,key:crypto.randomUUID(),expected_revision:0}),/stale_revision/)
 await rejected(()=>rpc('accounting_attachment',{...q,key:crypto.randomUUID(),mime:'text/html'}),/check constraint/)
 await rejected(()=>rpc('accounting_attachment',{...q,key:crypto.randomUUID(),filename:'../file.pdf'}),/check constraint/)
 await rejected(()=>rpc('accounting_attachment',{...q,key:crypto.randomUUID(),size:5242881}),/check constraint/)
 await rejected(()=>rpc('accounting_attachment',{key:crypto.randomUUID(),action:'finish',id:a.id}),/upload_missing/)
 await rejected(()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('accounting-attachments','invented','{}')"),/row-level security/)
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('accounting-attachments',$1,$2::jsonb)",[a.path,JSON.stringify({size:1,mimetype:q.mime})])
 await rejected(()=>rpc('accounting_attachment',{key:crypto.randomUUID(),action:'finish',id:a.id}),/upload_metadata_mismatch/)
 // Stub metadata only: this is a DB/policy test, NOT a hosted Storage upload.
 await db.exec('reset role')
 await db.query('update storage.objects set metadata=$1::jsonb where name=$2',[JSON.stringify({size:q.size,mimetype:q.mime}),a.path])
 await db.exec('set role authenticated')
 const ready=await rpc('accounting_attachment',{key:crypto.randomUUID(),action:'finish',id:a.id})
 ok(ready.state==='ready'&&ready.uploaded_at,'finalized metadata verified')
 await rejected(()=>db.query('update storage.objects set name=$1 where name=$2',['replace',a.path]),/permission denied/)
 await rejected(()=>db.query('delete from storage.objects where name=$1',[a.path]),/permission denied/)
 await rejected(()=>db.query('update accounting.attachments set filename=$1 where id=$2',['overwrite',a.id]),/permission denied/)
 const access=await db.query('select accounting.attachment_access($1,true) upload,accounting.attachment_access($1,false) read',[a.path])
 ok(!access.rows[0].upload&&access.rows[0].read,'ready files readable but no further uploads')
 const archived=await rpc('accounting_attachment',{key:crypto.randomUUID(),action:'archive',id:a.id,reason:'Synthetic retention test'})
 ok(archived.state==='archived','archive preserves file')
 await db.exec("set timezone='Asia/Bangkok'")
 await db.exec('reset role')
 await db.query("insert into accounting.audit_events(actor_id,action,details) values($1,'synthetic_precision_probe','{\"exact\":9999999999999999.99}')",[owner])
 await db.exec('set role authenticated')
 let snapshot=await rpc('accounting_backup')
 ok(snapshot.tables.requests.every(r=>r.created_at.endsWith('+00:00')),'backup timestamps canonical UTC despite source session timezone')
 ok(snapshot.version===2&&snapshot.tables.audit_events.some(r=>r.details.includes('9999999999999999.99')),'nested JSON numeric history survives without JS number conversion')
 ok(snapshot.counts.transactions>10&&snapshot.counts.revisions>snapshot.counts.transactions,'snapshot includes corrections')
 ok(snapshot.tables.lines.every(l=>typeof l.debit==='string'&&typeof l.credit==='string'),'backup money exact strings')
 ok(snapshot.tables.batches.every(b=>typeof b.sequence==='string'),'backup bigint exact strings')
 const files=[{path:a.path,mime:a.mime,size:a.size,sha256,base64:encode(bytes)}]
 const packed=await packBackup({snapshot,files}),payload=await unpackBackup(packed)
 assert.deepEqual(payload.snapshot,snapshot);passed++
 await rejected(()=>unpackBackup(packed.replace('moana-ledger','broken-ledger')),/integrity/)
 await rejected(async()=>unpackBackup(await packBackup({snapshot,files:[]})),/files_incomplete/)
 await rejected(async()=>unpackBackup(await packBackup({snapshot,files:[{...files[0],base64:encode(new Uint8Array([1,2,3]))}]})),/integrity/)
 const badCount=structuredClone(snapshot);badCount.counts.lines++
 await rejected(async()=>unpackBackup(await packBackup({snapshot:badCount,files})),/count_mismatch/)
 const start=snapshot.tables.settings[0].start_date,to=snapshot.exported_at.slice(0,10)
 const original=(await db.query('select public.accounting_report($1::date,$2::date) data',[start,to])).rows[0].data
 const restored=await restoreIsolated(snapshot,sql)
 assert.deepEqual(restored.counts,snapshot.counts);passed++
 assert.deepEqual(restored.report,original);passed++
 const broken=structuredClone(snapshot);broken.tables.lines[0].debit='9999999999999999.99';broken.tables.lines[0].credit='0'
 await rejected(()=>restoreIsolated(broken,sql),/unbalanced|mirror|ASSERT|balance/)
 const missing=structuredClone(snapshot);missing.tables.transactions[0].current_revision=9999
 await rejected(()=>restoreIsolated(missing,sql),/restore_revision_missing/)
 await db.query("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false)")
 await rejected(()=>rpc('accounting_backup'),/owner_required/)
 await rejected(()=>rpc('accounting_attachment',q),/owner_required/)
 await rejected(()=>db.query('select public.accounting_attachment_list($1)',[tx.id]),/owner_required/)
 ok((await db.query('select * from storage.objects')).rows.length===0,'other user cannot read private object metadata')
 await rejected(()=>db.query("insert into storage.objects(bucket_id,name) values('accounting-attachments',$1)",[a.path]),/row-level security/)
 await db.exec('reset role;set role anon')
 await rejected(()=>rpc('accounting_backup'),/permission denied/)
 await rejected(()=>rpc('accounting_attachment',q),/permission denied/)
 console.log(`PASS: ${passed} stage-5 checks: owner/private policies, retention, exact complete backup, tamper rejection and isolated restore/report equality`)
}finally{await db.close()}
