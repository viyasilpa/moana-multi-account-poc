// Dedicated entrypoint. No auth, Supabase client, live API or opening command.
import {PGlite} from '@electric-sql/pglite'
import {storageStub,restoreIsolated} from './restore-core'
import {digest,packBackup,unpackBackup} from './backup-format'
import type {Snapshot,BackupPayload} from './backup-format'
import core from '../db/accounting/001_core.sql?raw'
import commands from '../db/accounting/002_commands.sql?raw'
import masters from '../db/accounting/003_masters.sql?raw'
import reads from '../db/accounting/004_read_api.sql?raw'
import documents from '../db/accounting/005_documents_backup.sql?raw'
import utc from '../db/accounting/006_backup_utc.sql?raw'
import lossless from '../db/accounting/007_lossless_backup_json.sql?raw'
import commitChecks from '../db/accounting/008_command_constraint_checks.sql?raw'
import './styles.css'

const hosted=new URLSearchParams(location.search).get('suite')==='hosted'
const sql=[core,commands,masters,reads,documents,utc,lossless,commitChecks]
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T
const prepare=element<HTMLButtonElement>('prepare'),status=element('status')
if(hosted){document.querySelector('header p:not(.eyebrow)')!.textContent='ชุดบัญชีและไฟล์แนบสมมติจากพื้นที่ทดสอบออนไลน์ ไม่แตะบัญชีจริง';document.querySelector('section:last-of-type p')!.textContent='ทดสอบออนไลน์ผ่านแล้ว: รับส่งไฟล์ สิทธิ์ ลิงก์หมดอายุ และคำขอแก้ไขพร้อมกัน หน้านี้ตรวจการบันทึกไฟล์สำรองครบชุดบนอุปกรณ์ของคุณ';document.querySelector('h1')!.textContent='ตรวจไฟล์สำรองครบชุด'}
const results=new Map<string,string>(),urls:string[]=[]
let expected:Snapshot|undefined,backupHash='',imageHash='',busy=false
const backupCheck='บันทึกและเปิดไฟล์สำรอง JSON กลับมา',imageCheck='บันทึกและเปิดภาพ PNG กลับมา'
const record=(name:string,value:string)=>{results.set(name,value);render()}
function render() {
 const list=element('results');list.replaceChildren()
 for(const [name,value] of results){const item=document.createElement('li');item.textContent=`${value} · ${name}`;list.append(item)}
 const completed=results.get(backupCheck)==='ผ่าน'&&results.get(imageCheck)==='ผ่าน'
 element('summary').textContent=completed?'ผ่านการบันทึกและเปิดไฟล์สองชนิดในเบราว์เซอร์นี้ ยังไม่ใช่ผ่านขั้น 5 ทั้งหมด':'ยังไม่ครบ — ทำตามขั้นตอนและดูรายการด้านบน'
 element<HTMLButtonElement>('copy').disabled=results.size===0
 element<HTMLTextAreaElement>('report').value=[hosted?'Moana browser acceptance v2 — hosted synthetic backup':'Moana browser acceptance v1',new Date().toISOString(),navigator.userAgent,...Array.from(results,([name,value])=>`${value}: ${name}`),hosted?'ผลนี้ยืนยันเฉพาะอุปกรณ์ที่ทดสอบ ไม่แทนการกดพร้อมกันบนสองอุปกรณ์':'ยังไม่ยืนยัน: hosted Storage / URL expiry / multi-device concurrency'].join('\n')
}
function link(id:string,bytes:Blob) {const url=URL.createObjectURL(bytes);urls.push(url);element<HTMLAnchorElement>(id).href=url}
function assert(value:unknown,message:string):asserts value {if(!value)throw Error(message)}
async function reject(fn:()=>Promise<unknown>,pattern:RegExp){try{await fn()}catch(e){if(pattern.test(String(e)))return;throw e}throw Error('ระบบไม่ปฏิเสธตามที่คาด')}

prepare.addEventListener('click',async()=>{
 if(busy)return;busy=true;prepare.disabled=true;status.textContent='กำลังตรวจ…'
 let db:PGlite|undefined
 try {
  assert(window.isSecureContext&&crypto.subtle,'ต้องเปิดผ่านลิงก์ HTTPS')
  let source:BackupPayload
  if(hosted){
   const response=await fetch('/stage5-hosted-backup.json');assert(response.ok,'โหลดชุดทดสอบไม่สำเร็จ')
   source=await unpackBackup(await response.text());expected=source.snapshot
   assert(expected.tables.entities.every(e=>String(e.name).startsWith('STAGE5 SYNTHETIC ')),'ต้องเป็นข้อมูลสมมติเท่านั้น')
   record('ชุดสมมติจากออนไลน์ พร้อมไฟล์แนบ '+source.files.length+' ไฟล์','ผ่าน')
  }else{
  db=new PGlite();const owner='00000000-0000-4000-8000-000000000001'
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table public.app_owner(user_id uuid references auth.users(id));
   insert into auth.users values('${owner}');insert into public.app_owner select id from auth.users;
   grant usage on schema auth to authenticated;grant select on public.app_owner to authenticated;`+storageStub)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  for(const migration of sql)await db.exec(migration)
  const manifest={entities:Array.from({length:6},(_,i)=>({code:`T${i+1}`,name:`กิจการสมมติ ${i+1}`,accounts:[{code:'bank',name:'ธนาคารสมมติ',kind:'bank'},{code:'expense',name:'ค่าใช้จ่ายสมมติ',kind:'expense'}]}))}
  await db.query('select accounting.configure($1::jsonb)',[JSON.stringify(manifest)])
  await db.exec('set role authenticated')
  expected=(await db.query<{data:Snapshot}>('select public.accounting_backup() data')).rows[0].data
  assert(expected.tables.settings[0].start_date===null&&expected.tables.settings[0].opening_finalized_at===null,'พบยอดเปิดที่ไม่ควรมี')
  assert(expected.counts.transactions===0&&expected.counts.lines===0,'พบรายการที่ไม่ควรมี')
  record('ฐานข้อมูลสมมติ ไม่มีรายการและไม่มีการตั้งยอดเปิด','ผ่าน')
  source={snapshot:expected,files:[]}
  }
  const text=await packBackup(source)
  const roundtrip=await unpackBackup(text);assert(JSON.stringify(roundtrip.snapshot)===JSON.stringify(expected),'ข้อมูลสำรองไม่ตรง')
  const restored=await restoreIsolated(roundtrip.snapshot,sql)
  assert(hosted?restored.report!==null:restored.report===null,'สถานะบัญชีหลังคืนข้อมูลผิด');record('กู้คืนในฐานข้อมูลแยกและเทียบข้อมูลครบทุกตาราง','ผ่าน')
  const corrupt=JSON.parse(text);corrupt.data+=' '
  await reject(()=>unpackBackup(JSON.stringify(corrupt)),/backup_integrity_failed/);record('ปฏิเสธไฟล์สำรองถูกแก้ไข','ผ่าน')
  backupHash=await digest(new TextEncoder().encode(text));link('backup-link',new Blob([text],{type:'application/json'}))
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGOUy3JgoCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAAgTAQiyAjIcAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0))
  imageHash=await digest(png);link('image-link',new Blob([png],{type:'image/png'}))
  record(backupCheck,'รอเลือกไฟล์');record(imageCheck,'รอเลือกไฟล์')
  element('files').hidden=false;status.textContent='พร้อมแล้ว ทำขั้นตอน 2 ได้เลยค่ะ'
 }catch(e){status.textContent='เตรียมไม่สำเร็จ: '+String(e);record('เตรียมการทดสอบ','ไม่ผ่าน: '+String(e))}
 finally {await db?.close();busy=false}
})

for(const [id,name] of [['backup-input',backupCheck],['image-input',imageCheck]]) {
 const input=element<HTMLInputElement>(id)
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file||!expected)return
  input.disabled=true;record(name,'กำลังตรวจ')
  try {
   assert(file.size<=1024*1024,'เลือกเฉพาะไฟล์สมมติจากหน้านี้ ขนาดไม่เกิน 1 MB')
   const bytes=new Uint8Array(await file.arrayBuffer())
   assert(await digest(bytes)===(id==='backup-input'?backupHash:imageHash),'ไฟล์ไม่ตรงกับไฟล์ทดสอบที่ดาวน์โหลดจากหน้านี้')
   if(id==='backup-input') {const payload=await unpackBackup(new TextDecoder().decode(bytes));await restoreIsolated(payload.snapshot,sql)}
   record(name,'ผ่าน')
  }catch(e){record(name,'ไม่ผ่าน: '+String(e))}finally{input.disabled=false;input.value=''}
 })
}
element('copy').addEventListener('click',async()=>{
 const report=element<HTMLTextAreaElement>('report');report.hidden=false
 try {await navigator.clipboard.writeText(report.value);element('copy').textContent='คัดลอกแล้ว — วางในแชทถั่วได้เลย'}
 catch {report.focus();report.select();element('copy').textContent='เลือกข้อความด้านล่างเพื่อคัดลอก'}
})
window.addEventListener('pagehide',event=>{if(!event.persisted)urls.forEach(url=>URL.revokeObjectURL(url))})
