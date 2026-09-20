import {useEffect,useRef,useState} from 'react'
import {supabase} from './supabase'
import {errorText,liveApi} from './accounting'
import type {Api,Catalog,Command} from './accounting'
import {backupLimit,digest,encode,packBackup,unpackBackup} from './backup-format'
import type {FileCopy,Snapshot} from './backup-format'

type Send=(request:Omit<Command,'key'>,method?:string)=>Promise<boolean>
export function MasterSettings({catalog,send}:{catalog:Catalog;send:Send}) {
 const [selected,setSelected]=useState(''),[name,setName]=useState(''),[active,setActive]=useState(true)
 const options=[...catalog.accounts.filter(a=>!['party','opening_equity'].includes(a.kind)).map(a=>({...a,target:'account',label:`${catalog.entities.find(e=>e.id===a.entity_id)?.name} · ${a.name}`})),...catalog.parties.filter(p=>p.kind!=='related').map(p=>({...p,target:'party',label:p.name}))]
 const item=options.find(x=>x.id===selected)
 return <details><summary>เปลี่ยนชื่อ / ปิดใช้งานบัญชีและบุคคล</summary><p>ปิดใช้งานเพื่อซ่อนจากรายการใหม่ ไม่ลบยอดหรือประวัติ · เปลี่ยนชื่อยังใช้รหัสบัญชีเดิมและมีบันทึกตรวจสอบ</p>
  <form onSubmit={async e=>{e.preventDefault();if(item&&await send({action:'update',target:item.target,id:item.id,name:name.trim(),active},'accounting_master'))setSelected('')}}>
   <label>บัญชีหรือบุคคล<select required value={selected} onChange={e=>{const x=options.find(x=>x.id===e.target.value);setSelected(e.target.value);setName(x?.name||'');setActive(x?.active??true)}}><option value="">เลือก</option>{options.map(x=><option key={x.id} value={x.id}>{x.label}{x.active?'':' (ปิดใช้งาน)'}</option>)}</select></label>
   {item&&<><label>ชื่อที่แสดง<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label className="check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>เปิดให้เลือกในรายการใหม่</label><button>บันทึกชื่อ / สถานะ</button></>}
  </form>
 </details>
}

const bucket='accounting-attachments'
type Attachment={id:string;path:string;filename:string;mime:string;size:number;sha256:string;state:'pending'|'ready'|'archived';revision:number;created_at:string}
export function TransactionFiles({id,revision,api}:{id:string;revision:number;api:Api}) {
 const [rows,setRows]=useState<Attachment[]>([]),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[link,setLink]=useState<{url:string;name:string}|null>(null)
 const [archive,setArchive]=useState(''),[reason,setReason]=useState('')
 const lock=useRef(false),pending=useRef<{request:Record<string,unknown>;file:File;attachment?:Attachment}|null>(null)
 useEffect(()=>{let current=true;api<Attachment[]>('accounting_attachment_list',{p_id:id}).then(r=>{if(current)setRows(r)}).catch(e=>{if(current)setMessage(errorText(e))});return()=>{current=false}},[api,id,version])
 useEffect(()=>{if(!link)return;const timer=setTimeout(()=>setLink(null),55000);return()=>clearTimeout(timer)},[link])
 async function run(action:()=>Promise<void>) {
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('กำลังทำงาน…');setLink(null)
  try{await action();setVersion(v=>v+1)}catch(e){setMessage(errorText(e))}finally{lock.current=false;setBusy(false)}
 }
 async function finish(a:Attachment) {
  await api('accounting_attachment',{p_request:{key:crypto.randomUUID(),action:'finish',id:a.id}})
 }
 async function upload() {
  const f=pending.current?.file||file;if(!f)throw new Error('เลือกไฟล์ก่อน')
  if(f.size<1||f.size>5242880||!['application/pdf','image/png','image/jpeg'].includes(f.type))throw new Error('รองรับ PDF / JPG / PNG ไม่เกิน 5 MB')
  if(!pending.current)pending.current={file:f,request:{key:crypto.randomUUID(),action:'reserve',transaction_id:id,expected_revision:revision,filename:f.name,mime:f.type,size:f.size,sha256:await digest(new Uint8Array(await f.arrayBuffer()))}}
  const p=pending.current
  p.attachment??=await api<Attachment>('accounting_attachment',{p_request:p.request})
  // Recover an ambiguous upload without overwriting: finalization succeeds if bytes arrived.
  try {await finish(p.attachment)} catch(e) {
   if((e as {message?:string}).message!=='upload_missing')throw e
   const {error}=await supabase.storage.from(bucket).upload(p.attachment.path,p.file,{upsert:false,contentType:p.file.type})
   if(error)throw error
   await finish(p.attachment)
  }
  pending.current=null;setFile(null);setMessage('แนบไฟล์แล้ว ผูกกับฉบับที่ '+revision)
 }
 if(api!==liveApi)return <p>ไฟล์แนบจริงเปิดใช้เฉพาะแอปหลัก · โหมดสาธิตไม่ส่งไฟล์ออกจากหน้านี้</p>
 return <section><h3>ไฟล์แนบส่วนตัว</h3><p>PDF / JPG / PNG สูงสุด 5 MB ต่อไฟล์ · คงไฟล์ไว้เมื่อแก้ไขหรือยกเลิกรายการ</p>
  <fieldset disabled={busy}><label>เลือกเอกสาร<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={!!pending.current} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button type="button" disabled={!file&&!pending.current} onClick={()=>void run(upload)}>{pending.current?'ลองแนบไฟล์เดิมอีกครั้ง':'แนบกับฉบับปัจจุบัน'}</button>{pending.current&&<button type="button" className="secondary" onClick={()=>{pending.current=null;setFile(null);setVersion(v=>v+1);setMessage('เลือกไฟล์ใหม่ได้ · การจองหรือไฟล์เดิมยังอยู่ในประวัติ ไม่ได้ลบทิ้ง')}}>เลือกไฟล์ใหม่</button>}
  {rows.map(a=><div className="transaction" key={a.id}><p>{a.filename} · ฉบับ {a.revision} · {a.state==='pending'?'รออัปโหลด':a.state==='archived'?'เก็บเข้าประวัติ':'พร้อมเปิด'}<small>{new Date(a.created_at).toLocaleString('th-TH')} · {a.size.toLocaleString()} bytes</small></p>
   {a.state==='pending'?<button type="button" onClick={()=>void run(async()=>{await finish(a);setMessage('ตรวจพบไฟล์และยืนยันแล้ว')})}>ตรวจไฟล์ที่อัปโหลดค้าง</button>:<><button type="button" onClick={()=>void run(async()=>{const {data,error}=await supabase.storage.from(bucket).createSignedUrl(a.path,60,{download:a.filename});if(error)throw error;setLink({url:data.signedUrl,name:a.filename});setMessage('ลิงก์ส่วนตัวใช้ได้ 60 วินาที')})}>เตรียมเปิดไฟล์</button>{a.state==='ready'&&<button type="button" className="secondary" onClick={()=>{setArchive(a.id);setReason('')}}>เก็บเข้าประวัติ</button>}</>}
  </div>)}
  {archive&&<div className="review"><label>เหตุผลเก็บไฟล์เข้าประวัติ<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="button" disabled={!reason.trim()} onClick={()=>void run(async()=>{await api('accounting_attachment',{p_request:{key:crypto.randomUUID(),action:'archive',id:archive,reason}});setArchive('');setMessage('เก็บเข้าประวัติแล้ว ไม่ได้ลบไฟล์')})}>ยืนยันเก็บเข้าประวัติ</button><button type="button" className="secondary" onClick={()=>setArchive('')}>กลับ</button></div>}
  </fieldset><p role="status">{message}</p>{link&&<a href={link.url} rel="noreferrer" target="_blank">เปิด / ดาวน์โหลด {link.name}</a>}
 </section>
}

export function LedgerBackup({api,userId}:{api:Api;userId:string}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[url,setUrl]=useState(''),[filename,setFilename]=useState(''),[last,setLast]=useState(()=>{try{return localStorage.getItem(`moana-backup-v1:${userId}`)||''}catch{return ''}})
 const lock=useRef(false)
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url])
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('กำลังทำงาน…');try{await action()}catch(e){setMessage(errorText(e))}finally{lock.current=false;setBusy(false)}}
 async function prepare() {
  setUrl('')
  const snapshot=await api<Snapshot>('accounting_backup'),files:FileCopy[]=[]
  let size=new TextEncoder().encode(JSON.stringify(snapshot)).length
  for(const a of snapshot.tables.attachments.filter(a=>a.state!=='pending')) {
   if(api!==liveApi)throw new Error('demo_files_not_available')
   size+=Number(a.size)*4/3;if(size>backupLimit)throw new Error('ชุดสำรองเกิน 50 MB กรุณาติดต่อผู้ดูแล ไม่ได้สร้างไฟล์สำรองบางส่วน')
   const {data,error}=await supabase.storage.from(bucket).download(String(a.path));if(error)throw error
   const bytes=new Uint8Array(await data.arrayBuffer()),sha256=await digest(bytes)
   if(bytes.length!==a.size||sha256!==a.sha256)throw new Error('ไฟล์แนบไม่ตรงกับข้อมูลที่บันทึก หยุดสำรองไว้ก่อน')
   files.push({path:String(a.path),mime:String(a.mime),size:bytes.length,sha256,base64:encode(bytes)})
  }
  const text=await packBackup({snapshot,files});await unpackBackup(text)
  setFilename(`moana-backup-${snapshot.exported_at.replace(/[^0-9T]/g,'').slice(0,15)}.json`)
  setUrl(URL.createObjectURL(new Blob([text],{type:'application/json'})))
  const waiting=snapshot.tables.attachments.filter(a=>a.state==='pending').length
  setMessage(`เตรียมแล้ว: ${snapshot.counts.transactions} รายการ · ${files.length} ไฟล์แนบ · กดดาวน์โหลดและเก็บไว้ส่วนตัว${waiting?` · มี ${waiting} ไฟล์รออัปโหลด/ยืนยัน สำรองเฉพาะข้อมูลการจองของไฟล์เหล่านี้`:''}`)
 }
 return <section className="card"><h2>สำรองและตรวจการกู้คืน</h2><p>JSON รวมบัญชี ประวัติ รายการตรวจสอบ และเนื้อไฟล์แนบ · ไม่เข้ารหัส เก็บไว้ส่วนตัวนอกแอป · แนะนำสำรองหลังใช้งาน</p><p>กดดาวน์โหลดล่าสุดบนเครื่องนี้: {last?new Date(last).toLocaleString('th-TH'):'ยังไม่มี'} (ไม่ใช่การยืนยันว่าเครื่องบันทึกไฟล์สำเร็จ)</p>
  <button type="button" disabled={busy} onClick={()=>void run(prepare)}>เตรียมสำรองครบชุด</button>
  {url&&<p><a href={url} download={filename} onClick={()=>{const now=new Date().toISOString();setLast(now);try{localStorage.setItem(`moana-backup-v1:${userId}`,now)}catch{/* download remains available */}}}>ดาวน์โหลด JSON สำรอง</a></p>}
  <details><summary>ทดสอบไฟล์สำรองโดยไม่ทับข้อมูลจริง</summary><p>กู้คืนในฐานข้อมูลชั่วคราวบนเครื่อง ตรวจจำนวน ประวัติ และสมดุลบัญชี แล้วทิ้งฐานทดสอบ · ไม่ส่งไฟล์ที่เลือกไปเซิร์ฟเวอร์</p><label>เลือก JSON สำรอง<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{if(file.size>backupLimit*1.1)throw new Error('ไฟล์ใหญ่เกินขอบเขตทดสอบ 55 MB');const {checkBackup}=await import('./restore-check');const result=await checkBackup(await file.text());setMessage(`กู้คืนทดสอบผ่าน: ${result.counts.transactions} รายการ · ${result.counts.lines} บรรทัดบัญชี · ${result.files} ไฟล์แนบ · ข้อมูลจริงไม่เปลี่ยน`)})}}/></label></details>
  <p role="status">{message}</p><small>การกู้คืนระบบจริงต้องทำในฐานใหม่ที่ว่างและตรวจสอบก่อนสลับระบบ ไม่มีปุ่มเขียนทับบัญชีปัจจุบัน</small>
 </section>
}
