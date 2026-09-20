// Offline acceptance subset: synthetic masters, no opening command, no hosted calls.
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PGlite} from '@electric-sql/pglite'
import {storageStub,restoreIsolated} from '../src/restore-core.ts'
import {packBackup,unpackBackup} from '../src/backup-format.ts'

const owner='00000000-0000-4000-8000-000000000001'
const migrations=['001_core.sql','002_commands.sql','003_masters.sql','004_read_api.sql','005_documents_backup.sql','006_backup_utc.sql','007_lossless_backup_json.sql']
const sql=await Promise.all(migrations.map(f=>readFile(new URL('../db/accounting/'+f,import.meta.url),'utf8')))
const db=new PGlite(),directory=await mkdtemp(join(tmpdir(),'moana-unopened-'))
let passed=0
const check=(name,fn)=>Promise.resolve().then(fn).then(()=>{passed++;console.log('PASS: '+name)})
const rpc=async(name,request)=> (await db.query(`select public.${name}(${request===undefined?'':'$1::jsonb'}) data`,request===undefined?[]:[JSON.stringify(request)])).rows[0].data
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create table public.app_owner(user_id uuid references auth.users(id));
 insert into auth.users values('${owner}');insert into public.app_owner select id from auth.users;
 grant usage on schema auth to authenticated;grant select on public.app_owner to authenticated;`+storageStub)
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
 for(const migration of sql)await db.exec(migration)
 const manifest={entities:Array.from({length:6},(_,i)=>({code:`T${i+1}`,name:`Synthetic entity ${i+1}`,accounts:[{code:'bank',name:'Synthetic bank',kind:'bank'},{code:'expense',name:'Synthetic expense',kind:'expense'}]}))}
 await db.query('select accounting.configure($1::jsonb)',[JSON.stringify(manifest)])
 await db.exec('set role authenticated')
 const before=await rpc('accounting_backup')
 await check('opening remains unset',()=>{
  assert.equal(before.tables.settings[0].start_date,null)
  assert.equal(before.tables.settings[0].opening_finalized_at,null)
  for(const t of ['transactions','revisions','batches','lines','attachments','requests'])assert.equal(before.counts[t],0)
 })
 const entity=before.tables.entities[0],bank=before.tables.accounts.find(a=>a.entity_id===entity.id&&a.code==='bank'),expense=before.tables.accounts.find(a=>a.entity_id===entity.id&&a.code==='expense')
 await check('posting rejected before opening',()=>assert.rejects(()=>rpc('accounting_post',{key:crypto.randomUUID(),action:'create',entry:{kind:'expense',date:'2026-09-20',amount:'1.25',funding:'money',money_account_id:bank.id,for_entity_id:entity.id,category_account_id:expense.id}}),/opening_required/))
 await check('attachment reservation requires an existing posted transaction',()=>assert.rejects(()=>rpc('accounting_attachment',{key:crypto.randomUUID(),action:'reserve',transaction_id:crypto.randomUUID(),expected_revision:1,filename:'synthetic.pdf',mime:'application/pdf',size:1,sha256:'0'.repeat(64)}),/posted_transaction_required/))
 const file=join(directory,'synthetic-unopened.json')
 await writeFile(file,await packBackup({snapshot:before,files:[]}),'utf8')
 const reopened=await readFile(file,'utf8'),payload=await unpackBackup(reopened)
 await check('backup saved to disk and reopened with all tables identical',()=>assert.deepEqual(payload,{snapshot:before,files:[]}))
 await check('fresh isolated restore preserves unopened state and counts',async()=>{
  const restored=await restoreIsolated(payload.snapshot,sql)
  assert.deepEqual(restored.counts,before.counts);assert.equal(restored.report,null)
 })
 await check('modified backup on disk is rejected',async()=>{
  const envelope=JSON.parse(reopened);envelope.data=envelope.data.replace('Synthetic entity','Modified entity')
  await writeFile(file,JSON.stringify(envelope),'utf8')
  await assert.rejects(()=>readFile(file,'utf8').then(unpackBackup),/backup_integrity_failed/)
 })
 await check('nonowner cannot export',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[crypto.randomUUID()])
  await assert.rejects(()=>rpc('accounting_backup'),/owner_required/)
 })
 await check('anonymous cannot export',async()=>{
  await db.exec('reset role;set role anon')
  await assert.rejects(()=>rpc('accounting_backup'),/permission denied/)
 })
 await db.exec('reset role;set role authenticated')
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
 await check('source tables unchanged after failed writes and restore',async()=>assert.deepEqual((await rpc('accounting_backup')).tables,before.tables))
 console.log(`PASS: ${passed} offline checks; no opening posted. Browser downloads, hosted Storage and concurrent sessions NOT verified.`)
} finally {
 await db.close()
 await rm(directory,{recursive:true,force:true})
}
