import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {supabase} from './supabase'
import {AccountingApp} from './AccountingApp'
import {liveApi} from './accounting'
import type {Catalog} from './accounting'
import './styles.css'

function DeviceTest(){
 const [password,setPassword]=useState(''),[user,setUser]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[prepared,setPrepared]=useState(false)
 async function login(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setNotice('กำลังเข้าสู่พื้นที่สมมติ…')
  try{
   const {data,error}=await supabase.auth.signInWithPassword({email:'stage5-owner@example.invalid',password});if(error)throw error
   const c=await liveApi<Catalog>('accounting_catalog')
   if(c.entities.length!==6||!c.entities.every(x=>x.name.startsWith('STAGE5 SYNTHETIC '))||!c.settings.start_date)throw Error('ชุดข้อมูลไม่ใช่พื้นที่ทดสอบที่เตรียมไว้')
   setUser(data.user!.id);setNotice('เข้าสู่พื้นที่สมมติแล้ว')
  }catch{await supabase.auth.signOut({scope:'local'});setNotice('เข้าสู่ระบบไม่ได้ ตรวจรหัสทดสอบหรือแจ้งถั่ว')}
  finally{setPassword('');setBusy(false)}
 }
 async function prepare(){
  if(busy)return;setBusy(true)
  try{
   // Fixed request and key: both devices resolve to the same test transaction.
   await liveApi('accounting_post',{p_request:{key:'e70e7524-0d32-4a83-a875-cdd8ac969d58',action:'create',entry:{kind:'expense',date:'2026-09-20',amount:'1.25',description:'ทดสอบสองเครื่อง — ข้อมูลสมมติ',funding:'money',for_entity_id:'685a7643-f24e-4727-a237-7869b02a6365',money_account_id:'d7bbeab0-c268-4a01-937f-52e48ab98390',category_account_id:'2ccf5b16-879b-4a18-bad6-f3c47dd30a19'}}})
   setPrepared(true);setNotice('พร้อมแล้ว เปิดแท็บรายการด้านล่าง')
  }catch{setNotice('ยังยืนยันผลไม่ได้ กดปุ่มเตรียมเดิมอีกครั้งได้โดยไม่สร้างซ้ำ')}
  finally{setBusy(false)}
 }
 return <main><header><p className="eyebrow">Moana · พื้นที่สมมติแยกจากแอปหลัก</p><h1>ทดสอบ Mac กับ Android</h1><p>ใช้บัญชีทดสอบเท่านั้น ไม่กรอกรหัสบัญชีจริง</p></header>
 <p role="status">{notice}</p>
 {!user?<form className="card" onSubmit={login}><label>รหัสผ่านทดสอบจากถั่ว<input type="password" required autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>เข้าพื้นที่ทดสอบ</button></form>:<>
 <section className="card"><h2>ทำตามนี้บนสองเครื่อง</h2><ol>
 <li>กดเตรียมรายการด้านล่างทั้งสองเครื่อง แล้วเปิดแท็บ “รายการ”</li>
 <li>กด “แก้ไข” ที่ “ทดสอบสองเครื่อง — ข้อมูลสมมติ” ทั้งสองเครื่องก่อนบันทึก</li>
 <li>Mac ใส่จำนวน 2.25 เหตุผล “ทดสอบ Mac”; Android ใส่ 3.25 เหตุผล “ทดสอบ Android” แล้วกด “ตรวจรายการ” ทั้งคู่</li>
 <li>กด “ยืนยันบันทึก” บน Mac แล้วกดบน Android โดยไม่โหลดหน้าใหม่ ควรสำเร็จหนึ่งเครื่อง และอีกเครื่องแจ้งให้โหลดรายการใหม่</li>
 <li>เครื่องที่ถูกปฏิเสธ: เปิดแท็บรายการ เลือกออกโดยไม่บันทึก แล้วตรวจว่ายอดเป็น 2.25 ตาม Mac ส่งภาพผลทั้งสองเครื่องให้ถั่ว</li>
 </ol><p>ขั้นตอนนี้ตรวจการแก้ข้อมูลจากฉบับเดิมบนสองเครื่อง ส่วนคำขอที่ถึงพร้อมกันทดสอบผ่านระบบหลังบ้านแล้ว</p>
 {!prepared&&<button disabled={busy} onClick={()=>void prepare()}>เตรียมรายการสมมติเดียวกัน</button>}</section>
 {prepared&&<AccountingApp userId={user}/>}</>}
 </main>
}
if(location.pathname!=='/device.html')throw Error('Wrong test entrypoint')
createRoot(document.getElementById('root')!).render(<DeviceTest/> )
