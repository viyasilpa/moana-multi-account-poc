import { useEffect, useRef, useState } from 'react'
import { cents, decimal, errorText, labels, liveApi, money, today } from './accounting'
import { csvText } from './ledger-format'
import type { Api, Catalog, Command, Entry, Receipt, Row } from './accounting'
import {LedgerBackup,MasterSettings,TransactionFiles} from './LedgerSafety'

type Props={userId:string;api?:Api;demo?:boolean}
type Send=(request:Omit<Command,'key'>,method?:string)=>Promise<boolean>
const blank=():Entry=>({kind:'expense',date:today(),amount:'',description:'',funding:'money'})

export function AccountingApp({userId,api=liveApi,demo=false}:Props) {
 const [catalog,setCatalog]=useState<Catalog|null>(null),[tab,setTab]=useState('ลงรายการ'),[notice,setNotice]=useState(''),[version,setVersion]=useState(0)
 const [editing,setEditing]=useState<Row|null>(null),[refund,setRefund]=useState<Row|null>(null),[busy,setBusy]=useState(false)
 const storageKey=`moana-command-v1:${userId}`
 const [pending,setPending]=useState<{request:Command;method:string}|null>(()=>{try{return demo?null:JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{return null}})
 const lock=useRef(false)
 const dirty=useRef(false)
 const [requestedTab,setRequestedTab]=useState<string|null>(null)
 useEffect(()=>{let active=true;api<Catalog>('accounting_catalog').then(c=>{if(active)setCatalog(c)}).catch(e=>{if(active)setNotice(errorText(e))});return()=>{active=false}},[api,version])
 async function execute(p:{request:Command;method:string}):Promise<boolean> {
  if(lock.current)return false
  lock.current=true;setBusy(true);setNotice('กำลังบันทึก…')
  try {
   if(!demo)sessionStorage.setItem(storageKey,JSON.stringify(p))
   setPending(p)
   const receipt=await api<Receipt>(p.method,{p_request:p.request})
   if(!demo)sessionStorage.removeItem(storageKey)
   setPending(null);dirty.current=false;setVersion(v=>v+1)
   setNotice(`บันทึกแล้ว${receipt.transaction_id?' · เลขที่ '+receipt.transaction_id.slice(0,8):''}${receipt.warnings?.length?' · ระวัง: มีบัญชีเงินติดลบ':''}`)
   return true
  } catch(e) {
   // Only explicit SQL failures guarantee rollback. Unknown transport outcomes keep the same key.
   const code=(e as {code?:string}).code
   if(code && (/^(22|23|40|42|P0)/.test(code)||code==='PT409')) {
    if(!demo)sessionStorage.removeItem(storageKey)
    setPending(null);setNotice(errorText(e))
   } else setNotice('ยังยืนยันผลไม่ได้ กดตรวจสอบ/ส่งคำขอเดิมอีกครั้ง ห้ามสร้างรายการซ้ำ · '+errorText(e))
   return false
  } finally {lock.current=false;setBusy(false)}
 }
 const send:Send=async(request,method='accounting_post')=>{
  if(pending||lock.current)return false
  return execute({request:{...request,key:crypto.randomUUID()},method})
 }
 if(!catalog)return <section className="card"><p role="status">{notice||'กำลังโหลดบัญชี…'}</p><button onClick={()=>setVersion(v=>v+1)}>ลองโหลดใหม่</button></section>
 const isSetup=!catalog.settings.start_date
 const finishNavigate=(next:string)=>{dirty.current=false;setRequestedTab(null);setNotice('');setTab(next);setEditing(null);setRefund(null)}
 const navigate=(next:string)=>{if(dirty.current){setRequestedTab(next);return}finishNavigate(next)}
 return <div className="ledger-app">
  {demo&&<p className="demo-banner">โหมดสาธิต · ข้อมูลสมมติในหน้านี้เท่านั้น · รีเฟรชแล้วเริ่มใหม่ · ไม่ส่ง Supabase</p>}
  <div className="toolbar"><span>{catalog.entities.length} กิจการ · THB</span><button className="secondary" disabled={busy} onClick={()=>navigate('ตั้งค่า')}>ตั้งค่า / ยอดยกมา</button></div>
  <p role="status" className="notice">{notice}</p>
  {requestedTab&&<section className="review" role="alert"><p>มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากแบบฟอร์มหรือไม่?</p><div className="toolbar"><button disabled={busy||!!pending} onClick={()=>finishNavigate(requestedTab)}>ออกโดยไม่บันทึก</button><button className="secondary" onClick={()=>setRequestedTab(null)}>กรอกต่อ</button></div></section>}
  {pending&&<section className="card"><strong>มีคำขอรอยืนยันผล</strong><p>ใช้คำขอเดิมเพื่อป้องกันบันทึกซ้ำ แม้ครั้งก่อนบันทึกสำเร็จแต่การเชื่อมต่อขาด</p><button disabled={busy} onClick={()=>void execute(pending)}>ตรวจสอบ / ส่งคำขอเดิม</button></section>}
  <fieldset disabled={busy||!!pending} className="workspace" onInputCapture={e=>{if((e.target as HTMLElement).closest('form')){dirty.current=true;setNotice('')}}}>
   {isSetup ? <Opening catalog={catalog} send={send}/> : <>
    {tab==='ลงรายการ'&&<EntryForm key={editing?.id||refund?.id||`new-${version}`} catalog={catalog} editing={editing} refund={refund} send={send} done={()=>{setEditing(null);setRefund(null)}}/>}
    {tab==='รายการ'&&<Activity key={version} catalog={catalog} api={api} send={send} notice={notice} edit={r=>{setNotice('');setEditing(r);setRefund(null);setTab('ลงรายการ')}} refund={r=>{setNotice('');setRefund(r);setEditing(null);setTab('ลงรายการ')}}/>}
    {(tab==='สถานะ'||tab==='รายงาน')&&<Reports key={`${tab}-${version}`} catalog={catalog} api={api} status={tab==='สถานะ'}/>}
   </>}
   {tab==='ตั้งค่า'&&<><section className="card"><h2>ลูกหนี้–เจ้าหนี้รายคน</h2><p>AR-others แยกชื่อแต่ละคน ไม่รวมเป็นยอดเดียว · เงินบวก = ลูกหนี้ / เงินลบ = เจ้าหนี้</p><ul>{catalog.parties.filter(p=>p.kind==='other'||p.kind==='pp').map(p=><li key={p.id}>{p.name}{!p.active?' (ปิดใช้งาน)':''}</li>)}</ul><AddParty send={send}/><MasterSettings catalog={catalog} send={send}/>{!isSetup&&<p>เริ่มบัญชี {catalog.settings.start_date} · แก้ยอดยกมาได้จากแท็บรายการ โดยเก็บประวัติทุกครั้ง</p>}</section><LedgerBackup api={api} userId={userId}/></>}
  </fieldset>
  <nav className="bottom-tabs" aria-label="เมนูบัญชี">{['ลงรายการ','รายการ','สถานะ','รายงาน'].map(t=><button key={t} aria-current={tab===t?'page':undefined} className={tab===t?'':'secondary'} disabled={busy||!!pending} onClick={()=>navigate(t)}>{t}</button>)}</nav>
 </div>
}

function AddParty({send}:{send:Send}) {
 const [name,setName]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();if(await send({action:'add_party',target:'party',name:name.trim()},'accounting_master'))setName('')}}><label>ชื่อบุคคลใหม่<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><button>เพิ่มบุคคล</button></form>
}

export function Opening({catalog,send,editing,done}:{catalog:Catalog;send:Send;editing?:Row;done?:()=>void}) {
 const [date,setDate]=useState(editing?.input.date||''),[balances,setBalances]=useState<Record<string,string>>(()=>Object.fromEntries((editing?.input.balances||[]).map(b=>[b.account_id,b.signed_amount])))
 const [reason,setReason]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false)
 const accounts=catalog.accounts.filter(a=>{
  if(!a.active)return false
  if(['bank','cash'].includes(a.kind))return true
  if(a.kind!=='party')return false
  const p=catalog.parties.find(p=>p.id===a.party_id)
  if(p?.kind!=='related')return true
  const mirror=catalog.accounts.find(x=>x.entity_id===p.related_entity_id&&catalog.parties.find(q=>q.id===x.party_id)?.related_entity_id===a.entity_id)
  if(editing?.input.balances?.some(b=>b.account_id===a.id))return true
  if(editing?.input.balances?.some(b=>b.account_id===mirror?.id))return false
  return catalog.entities.findIndex(e=>e.id===a.entity_id)<catalog.entities.findIndex(e=>e.id===p.related_entity_id)
 })
 const mirrors=catalog.accounts.filter(a=>a.active&&a.kind==='party'&&!accounts.some(x=>x.id===a.id)).flatMap(a=>{
  const p=catalog.parties.find(p=>p.id===a.party_id)
  if(p?.kind!=='related')return []
  const source=accounts.find(x=>x.entity_id===p.related_entity_id&&catalog.parties.find(q=>q.id===x.party_id)?.related_entity_id===a.entity_id)
  return source?[{account:a,source}]:[]
 })
 function mirroredValue(id:string) {try{return decimal(-cents(balances[id]?.trim()||'0'))}catch{return 'รอยอดที่ถูกต้อง'}}
 async function save(e:React.FormEvent) {
  e.preventDefault();setNotice('')
  try {
   const rows=Object.entries(balances).filter(([,v])=>v.trim()&&cents(v.trim())!==0n).map(([account_id,v])=>({account_id,signed_amount:v.trim()}))
   if(!confirmed)throw new Error('กรุณาตรวจและยืนยันยอดยกมา')
   const entry:Entry={kind:'opening',date,balances:rows}
   if(await send(editing?{action:'edit',transaction_id:editing.id,expected_revision:editing.current_revision,reason,entry}:{action:'create',entry}))done?.()
  } catch(error){setNotice(errorText(error))}
 }
 return <form className="card" onSubmit={save}><h2>{editing?'แก้ไขยอดยกมา':'เริ่มต้นบัญชี — ตั้งยอดยกมา'}</h2><p>กรอกยอดก่อนเริ่มวันบัญชี ช่องว่างถือเป็นศูนย์ · ยังไม่ทราบยอด ให้เว้นการบันทึกไว้ก่อน</p>
  <label>วันเริ่มบัญชี<input type="date" required max={today()} readOnly={!!editing} value={date} onInput={e=>setDate(e.currentTarget.value)} onChange={e=>setDate(e.target.value)}/></label>
  <p>ยอดบุคคล: บวก = เขาค้างเรา / ลบ = เราค้างเขา คู่ระหว่างกิจการกรอกครั้งเดียว ระบบลงฝั่งตรงข้ามให้อัตโนมัติ</p>
  {catalog.entities.map(entity=><details key={entity.id}><summary>{entity.name}</summary><div className="field-grid">{accounts.filter(a=>a.entity_id===entity.id).map(a=><label key={a.id}>{a.name}<input inputMode="decimal" placeholder="0.00" value={balances[a.id]||''} onChange={e=>setBalances(b=>({...b,[a.id]:e.target.value}))}/></label>)}{mirrors.filter(m=>m.account.entity_id===entity.id).map(({account,source})=><label key={account.id}>{account.name}<input readOnly value={mirroredValue(source.id)}/><small>คำนวณจาก {catalog.entities.find(e=>e.id===source.entity_id)?.name} · {source.name} แก้ยอดที่ฝั่งนั้นเพียงครั้งเดียว</small></label>)}</div></details>)}
  {editing&&<label>เหตุผลที่แก้ไข<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
  <label className="check"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>ตรวจสอบวันที่และยอดทุกกิจการแล้ว รวมถึงช่องที่เป็นศูนย์</label>
  <p role="alert">{notice}</p><button>{editing?'บันทึกการแก้ยอดยกมา':'ยืนยันยอดยกมาและเริ่มบัญชี'}</button>
 </form>
}

function EntryForm({catalog,editing,refund,send,done}:{catalog:Catalog;editing:Row|null;refund:Row|null;send:Send;done:()=>void}) {
 const [entry,setEntry]=useState<Entry>(()=>editing?{...editing.input}:refund?{kind:'refund',date:today(),amount:'',description:'',source_transaction_id:refund.id}:blank())
 const [reason,setReason]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState(false)
 if(editing?.kind==='opening')return <Opening catalog={catalog} send={send} editing={editing} done={done}/>
 const set=(key:keyof Entry,value:string)=>{setEntry(e=>({...e,[key]:value}));setConfirm(false)}
 const accountName=(id?:string)=>{const a=catalog.accounts.find(a=>a.id===id);return a?`${catalog.entities.find(e=>e.id===a.entity_id)?.name} · ${a.name}`:'ยังไม่เลือก'}
 const incomeExpense=['income','expense'].includes(entry.kind),party=['party_payment','party_receipt'].includes(entry.kind),isRefund=entry.kind==='refund'
 async function submit(e:React.FormEvent) {
  e.preventDefault();setError('')
  try {
   if(cents(entry.amount||'')<=0n)throw new Error('จำนวนเงินต้องมากกว่าศูนย์')
   if(!confirm){setConfirm(true);return}
   if(await send(editing?{action:'edit',transaction_id:editing.id,expected_revision:editing.current_revision,reason,entry}:{action:'create',entry})) {setEntry(blank());setConfirm(false);done()}
  }catch(error){setError(errorText(error))}
 }
 return <form className="card" onSubmit={submit}><h2>{editing?'แก้ไขรายการ':refund?'คืนเงินรายการเดิม':'ลงรายการ'}</h2>
  <div className="field-grid"><label>ประเภทรายการ<select disabled={!!editing||!!refund} value={entry.kind} onChange={e=>{setEntry({...blank(),kind:e.target.value});setConfirm(false)}}>{Object.entries(labels).filter(([k])=>k!=='opening'&&(k!=='refund'||isRefund)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <label>วันที่<input type="date" required min={catalog.settings.start_date||undefined} max={today()} value={entry.date} onInput={e=>set('date',e.currentTarget.value)} onChange={e=>set('date',e.target.value)}/></label></div>
  {!isRefund&&<>
   {entry.kind==='expense'&&<label>จ่ายจาก<select aria-label="จ่ายจาก" required value={entry.funding==='pp'?'pp':entry.money_account_id||''} onChange={e=>{const value=e.target.value;setEntry(v=>{const n={...v,funding:value==='pp'?'pp':'money'};if(value==='pp')delete n.money_account_id;else n.money_account_id=value;return n});setConfirm(false)}}><option value="">เลือกบัญชีธนาคาร / เงินสด หรือ PP</option>{catalog.accounts.filter(a=>['bank','cash'].includes(a.kind)&&a.active).map(a=><option key={a.id} value={a.id}>{accountName(a.id)}</option>)}{catalog.parties.some(p=>p.kind==='pp'&&p.active)&&<option value="pp">PP จ่ายแทนกิจการ</option>}</select>{entry.funding==='pp'&&<small>PP ออกเงินให้ก่อน ระบบบันทึกยอดกับ PP ให้กิจการที่เลือก ไม่ต้องเลือกบัญชีธนาคาร</small>}</label>}
   {entry.kind!=='expense'&&entry.funding!=='pp'&&<label>บัญชีที่{['income','party_receipt'].includes(entry.kind)?'รับเงิน':'จ่ายเงิน'}<select required value={entry.money_account_id||''} onChange={e=>set('money_account_id',e.target.value)}><option value="">เลือกบัญชีและเจ้าของเงิน</option>{catalog.accounts.filter(a=>['bank','cash'].includes(a.kind)&&a.active).map(a=><option key={a.id} value={a.id}>{accountName(a.id)}</option>)}</select></label>}
   {(incomeExpense||party)&&<label>รายการนี้เป็นของกิจการไหน<select required value={entry.for_entity_id||''} onChange={e=>{setEntry(v=>{const n={...v,for_entity_id:e.target.value};delete n.category_account_id;delete n.party_id;return n});setConfirm(false)}}><option value="">เลือกกิจการเจ้าของรายการ</option>{catalog.entities.filter(e=>e.active).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
   {incomeExpense&&<label>หมวด{labels[entry.kind]}<select required value={entry.category_account_id||''} onChange={e=>set('category_account_id',e.target.value)}><option value="">เลือกหมวด</option>{catalog.accounts.filter(a=>a.entity_id===entry.for_entity_id&&a.kind===entry.kind&&a.active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
   {party&&<label>บุคคล / ลูกหนี้–เจ้าหนี้<select required value={entry.party_id||''} onChange={e=>set('party_id',e.target.value)}><option value="">เลือกชื่อบุคคล</option>{catalog.parties.filter(p=>p.kind!=='related'&&p.active&&catalog.accounts.some(a=>a.entity_id===entry.for_entity_id&&a.party_id===p.id&&a.active)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>{entry.kind==='party_payment'?'ให้ยืม = ลูกหนี้เพิ่ม · ชำระเจ้าหนี้ = หนี้ลด · หากจ่ายค่าใช้จ่ายแทนกิจการ ให้เลือกประเภทรายจ่าย':'รับคืน = ลูกหนี้ลด · รับเงินยืม = หนี้เพิ่ม · ไม่ใช่รายรับจากกิจการ'}</small></label>}
   {entry.kind==='transfer'&&<label>บัญชีปลายทาง<select required value={entry.destination_account_id||''} onChange={e=>set('destination_account_id',e.target.value)}><option value="">เลือกบัญชีรับโอน</option>{catalog.accounts.filter(a=>['bank','cash'].includes(a.kind)&&a.active&&a.id!==entry.money_account_id).map(a=><option key={a.id} value={a.id}>{accountName(a.id)}</option>)}</select></label>}
  </>}
  {isRefund&&<p>อ้างอิง {entry.source_transaction_id?.slice(0,8)} · คืนผ่านเส้นทางเงินและกิจการเดิม ระบบตรวจยอดคืนสะสม</p>}
  <label>จำนวนเงิน (บาท)<input required inputMode="decimal" placeholder="0.00" value={entry.amount||''} onChange={e=>set('amount',e.target.value)}/></label>
  <label>รายละเอียด<input maxLength={500} value={entry.description||''} onChange={e=>set('description',e.target.value)}/></label>
  {editing&&<label>เหตุผลที่แก้ไข<input required maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirm(false)}}/></label>}
  {confirm&&<div className="review"><strong>ตรวจรายการก่อนบันทึก</strong><p>{labels[entry.kind]} · {entry.date} · {money(entry.amount!)} บาท</p>{!isRefund&&<p>{entry.funding==='pp'?'PP':accountName(entry.money_account_id)} → {entry.kind==='transfer'?accountName(entry.destination_account_id):catalog.entities.find(e=>e.id===entry.for_entity_id)?.name}{entry.party_id?' · '+catalog.parties.find(p=>p.id===entry.party_id)?.name:''}</p>}</div>}
  <p role="alert">{error}</p><button>{confirm?'ยืนยันบันทึก':'ตรวจรายการ'}</button>
 </form>
}

function Activity({catalog,api,send,notice,edit,refund}:{catalog:Catalog;api:Api;send:Send;notice:string;edit:(r:Row)=>void;refund:(r:Row)=>void}) {
 const [from,setFrom]=useState(catalog.settings.start_date!),[to,setTo]=useState(today()),[entity,setEntity]=useState(''),[offset,setOffset]=useState(0)
 const [data,setData]=useState<{total:number;items:Row[]}|null>(null),[error,setError]=useState(''),[detail,setDetail]=useState<string|null>(null),[voidRow,setVoidRow]=useState<Row|null>(null),[reason,setReason]=useState('')
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{let active=true;setData(null);setError('');api<{total:number;items:Row[]}>('accounting_activity',{p_from:from,p_to:to,p_entity:entity||null,p_offset:offset}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[api,from,to,entity,offset])
 useEffect(()=>{if(voidRow)dialog.current?.showModal();else dialog.current?.close()},[voidRow])
 return <section className="card"><h2>รายการ</h2><Filters catalog={catalog} from={from} to={to} entity={entity} change={(f,t,e)=>{setFrom(f);setTo(t);setEntity(e);setOffset(0)}}/>
  <p role="status">{error||(!data?'กำลังโหลด…':`${data.total} รายการ`)}</p>
  {data?.items.map(r=><article className="transaction" key={r.id}><div><strong>{r.input.description||labels[r.kind]}</strong><p>{r.effective_date} · {labels[r.kind]} · {r.amount===null?'—':money(r.amount)} บาท · {r.status==='void'?'ยกเลิกแล้ว':`ฉบับ ${r.current_revision}`}</p><small>{catalog.entities.find(e=>e.id===r.input.for_entity_id)?.name} · เลขที่ {r.id.slice(0,8)}</small></div><div className="toolbar"><button className="secondary" onClick={()=>setDetail(detail===r.id?null:r.id)}>ดูประวัติ</button>{r.status==='posted'&&<><button className="secondary" onClick={()=>edit(r)}>แก้ไข</button>{['expense','income'].includes(r.kind)&&<button className="secondary" onClick={()=>refund(r)}>คืนเงิน</button>}{r.kind!=='opening'&&<button className="danger" onClick={()=>{setVoidRow(r);setReason('')}}>ยกเลิกรายการ</button>}</>}</div>{detail===r.id&&<Detail id={r.id} catalog={catalog} api={api}/>}</article>)}
  {data&&<div className="toolbar"><button className="secondary" disabled={offset===0} onClick={()=>setOffset(o=>Math.max(0,o-25))}>ก่อนหน้า</button><span>หน้า {Math.floor(offset/25)+1}</span><button className="secondary" disabled={offset+25>=data.total} onClick={()=>setOffset(o=>o+25)}>ถัดไป</button></div>}
  <dialog ref={dialog} onCancel={()=>setVoidRow(null)}><form onSubmit={async e=>{e.preventDefault();if(voidRow)await send({action:'void',transaction_id:voidRow.id,expected_revision:voidRow.current_revision,reason});setVoidRow(null)}}><h2>ยืนยันยกเลิกรายการ?</h2><p>ระบบลงรายการกลับและเก็บประวัติ ไม่ลบข้อมูลเดิม</p><label>เหตุผล<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><p role="alert">{notice}</p><button className="danger">ยืนยันยกเลิกรายการ</button><button type="button" className="secondary" onClick={()=>setVoidRow(null)}>กลับ</button></form></dialog>
 </section>
}

type DetailData={revisions:{revision:number;date:string;reason:string;input:Entry}[];lines:{revision:number;date:string;role:string;entity_id:string;account_id:string;debit:string;credit:string}[]}
export function Detail({id,catalog,api}:{id:string;catalog:Catalog;api:Api}) {
 const [data,setData]=useState<DetailData|null>(null),[error,setError]=useState(''),[history,setHistory]=useState(false)
 useEffect(()=>{let active=true;setData(null);api<DetailData>('accounting_detail',{p_id:id}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[id,api])
 const latest=data?Math.max(...data.revisions.map(r=>r.revision)):0
 const visibleLines=data?.lines.filter(l=>history||(l.revision===latest&&l.role!=='reversal'))||[]
 return <div className="review"><h3>รายละเอียดรายการ</h3>{!data?<p>{error||'กำลังโหลด…'}</p>:<><p>ฉบับล่าสุด {latest} · ตารางนี้เป็นบรรทัดบัญชีของรายการเดียว ไม่ใช่รายการรับจ่ายหลายรายการ</p><label className="check"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>แสดงประวัติทุกฉบับและรายการกลับ</label>{data.revisions.filter(r=>history||r.revision===latest).map(r=><p key={r.revision}>ฉบับ {r.revision} · {r.date} · {r.input.description} {r.reason&&` · เหตุผล: ${r.reason}`}</p>)}<div className="table-scroll"><table><thead><tr><th>ฉบับ / วันที่</th><th>กิจการ / บัญชี</th><th>Dr</th><th>Cr</th></tr></thead><tbody>{visibleLines.map((l,i)=><tr key={i}><td>{l.revision} · {l.date}<small>{l.role}</small></td><td>{catalog.entities.find(e=>e.id===l.entity_id)?.name}<small>{catalog.accounts.find(a=>a.id===l.account_id)?.name}</small></td><td>{money(l.debit)}</td><td>{money(l.credit)}</td></tr>)}</tbody></table></div>{!history&&!visibleLines.length&&<p>ไม่มีบรรทัดบัญชีที่มีผลในฉบับล่าสุด เปิดประวัติเพื่อดูรายการกลับ</p>}<TransactionFiles id={id} revision={Math.max(...data.revisions.map(r=>r.revision))} api={api}/></>}</div>
}

function Filters({catalog,from,to,entity,change}:{catalog:Catalog;from:string;to:string;entity:string;change:(f:string,t:string,e:string)=>void}) {
 return <div className="field-grid"><label>ตั้งแต่<input type="date" required min={catalog.settings.start_date||undefined} max={to} value={from} onInput={e=>change(e.currentTarget.value,to,entity)} onChange={e=>change(e.target.value,to,entity)}/></label><label>ถึง<input type="date" required min={from} max={today()} value={to} onInput={e=>change(from,e.currentTarget.value,entity)} onChange={e=>change(from,e.target.value,entity)}/></label><label>กิจการ<select value={entity} onChange={e=>change(from,to,e.target.value)}><option value="">ทุกกิจการ</option>{catalog.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
}
type Report={accounts:{account_id:string;entity_id:string;kind:string;opening:string;debit:string;credit:string;closing:string}[];pnl:{entity_id:string;income:string;expense:string;net:string}[];consolidated:{income:string;expense:string;net:string}}
function CsvExport({name,rows,label}:{name:string;rows:string[][];label:string}) {
 const text=csvText(rows),[url,setUrl]=useState('')
 useEffect(()=>{const next=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));setUrl(next);return()=>URL.revokeObjectURL(next)},[text])
 return url?<a className="export-link" href={url} download={name}>{label}</a>:null
}
export function Reports({catalog,api,status}:{catalog:Catalog;api:Api;status:boolean}) {
 const [from,setFrom]=useState(catalog.settings.start_date!),[to,setTo]=useState(today()),[entity,setEntity]=useState(''),[data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[account,setAccount]=useState(''),[zero,setZero]=useState(false)
 useEffect(()=>{let active=true;setData(null);setError('');api<Report>('accounting_report',{p_from:from,p_to:to}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[api,from,to])
 const selected=data?.pnl.find(p=>p.entity_id===entity)||data?.consolidated
 const rows=data?.accounts.filter(a=>(catalog.accounts.find(x=>x.id===a.account_id)?.active!==false||(status?cents(a.closing)!==0n:(cents(a.debit)!==0n||cents(a.credit)!==0n)))&&(!entity||a.entity_id===entity)&&(status?['bank','cash','party']:['income','expense']).includes(a.kind)&&(zero||(status?cents(a.closing)!==0n:(cents(a.debit)!==0n||cents(a.credit)!==0n))))||[]
 const periodValue=(a:Report['accounts'][number])=>decimal(a.kind==='income'?cents(a.credit)-cents(a.debit):cents(a.debit)-cents(a.credit))
 const tableRows=rows.map(a=>[catalog.entities.find(e=>e.id===a.entity_id)?.name||'',catalog.accounts.find(x=>x.id===a.account_id)?.name||'',a.opening,a.debit,a.credit,a.closing])
 return <section className="card"><h2>{status?'สถานะเงิน / ลูกหนี้–เจ้าหนี้':'รายงานรายรับ–รายจ่าย'}</h2><Filters catalog={catalog} from={from} to={to} entity={entity} change={(f,t,e)=>{setFrom(f);setTo(t);setEntity(e);setAccount('')}}/>
  {status&&<p>ยอดคงเหลือถึงวันที่เลือก · ลูกหนี้เป็นบวก เจ้าหนี้เป็นลบ · คู่ระหว่างกิจการเป็นยอดตรงข้ามกัน ไม่ใช่รายได้</p>}
  {!data?<p role="status">{error||'กำลังโหลด…'}</p>:<>
   {!status&&selected&&<div className="summary-grid">{(['income','expense','net'] as const).map((k,i)=><div className="review" key={k}><small>{['รายรับ','รายจ่าย','สุทธิ'][i]}</small><strong>{money(selected[k])}</strong></div>)}</div>}
   <div className="toolbar"><label className="check"><input type="checkbox" checked={zero} onChange={e=>setZero(e.target.checked)}/>แสดงบัญชียอดศูนย์</label><CsvExport name={`moana-${from}-${to}.csv`} label="ดาวน์โหลด CSV" rows={status?[['ช่วงวันที่',from,to],['กิจการ','บัญชี','ยกมา','Dr','Cr','คงเหลือ'],...tableRows]:[['ช่วงวันที่',from,to],['กิจการ','บัญชี','ยอดในช่วงวันที่'],...rows.map(a=>[catalog.entities.find(e=>e.id===a.entity_id)?.name||'',catalog.accounts.find(x=>x.id===a.account_id)?.name||'',periodValue(a)])]}/></div>
   <div className="table-scroll"><table><thead><tr><th>กิจการ / บัญชี</th><th>{status?'คงเหลือ (บาท)':'ยอดในช่วงวันที่ (บาท)'}</th><th>รายละเอียด</th></tr></thead><tbody>{rows.map(a=><tr key={a.account_id}><td>{catalog.entities.find(e=>e.id===a.entity_id)?.name}<small>{catalog.accounts.find(x=>x.id===a.account_id)?.name}</small></td><td className={cents(status?a.closing:periodValue(a))<0n?'negative':''}>{money(status?a.closing:periodValue(a))}</td><td><button className="secondary" onClick={()=>setAccount(a.account_id)}>ดูบัญชี</button></td></tr>)}</tbody></table>{!rows.length&&<p>ไม่มีความเคลื่อนไหวหรือยอดคงเหลือในตัวกรองนี้</p>}</div>
   {account&&<GeneralLedger key={`${account}-${from}-${to}`} account={account} from={from} to={to} api={api} catalog={catalog}/>}
  </>}
 </section>
}
type GL={opening:string;closing:string;lines:{id:string;date:string;transaction_id:string;revision:number;role:string;debit:string;credit:string;balance:string}[]}
function GeneralLedger({account,from,to,api,catalog}:{account:string;from:string;to:string;api:Api;catalog:Catalog}) {
 const [data,setData]=useState<GL|null>(null),[error,setError]=useState(''),[detail,setDetail]=useState('')
 useEffect(()=>{let active=true;api<GL>('accounting_gl',{p_account:account,p_from:from,p_to:to}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[api,account,from,to])
 return <div className="review"><h3>{catalog.accounts.find(a=>a.id===account)?.name} · บัญชีแยกประเภท</h3>{!data?<p>{error||'กำลังโหลด…'}</p>:<><p>ยกมา {money(data.opening)} · คงเหลือ {money(data.closing)}</p><CsvExport name="moana-ledger.csv" label="ดาวน์โหลดบัญชี CSV" rows={[[catalog.accounts.find(a=>a.id===account)?.name||'',from,to],['ยอดยกมา',data.opening],['วันที่','เลขที่','ฉบับ','ประเภท','Dr','Cr','คงเหลือ'],...data.lines.map(l=>[l.date,l.transaction_id,String(l.revision),l.role,l.debit,l.credit,l.balance])]}/><div className="table-scroll"><table><thead><tr><th>วันที่ / รายการ</th><th>Dr</th><th>Cr</th><th>คงเหลือ</th></tr></thead><tbody>{data.lines.map(l=><tr key={l.id}><td><button className="secondary" onClick={()=>setDetail(l.transaction_id)}>{l.date} · {l.transaction_id.slice(0,8)}</button><small>{l.role} · ฉบับ {l.revision}</small></td><td>{money(l.debit)}</td><td>{money(l.credit)}</td><td>{money(l.balance)}</td></tr>)}</tbody></table></div></>}{detail&&<Detail id={detail} catalog={catalog} api={api}/>}</div>
}
