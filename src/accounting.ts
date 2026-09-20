import { supabase } from './supabase'
export type Entry = { kind: string; date: string; amount?: string; description?: string; funding?: string; money_account_id?: string; for_entity_id?: string; category_account_id?: string; destination_account_id?: string; party_id?: string; source_transaction_id?: string; balances?: {account_id:string;signed_amount:string}[] }
export type Account = {id:string;entity_id:string;name:string;kind:string;party_id:string|null;active:boolean}
export type Catalog = {settings:{start_date:string|null};entities:{id:string;code:string;name:string;active:boolean}[];accounts:Account[];parties:{id:string;name:string;kind:string;related_entity_id:string|null;active:boolean}[]}
export type Row = {id:string;kind:string;status:string;current_revision:number;effective_date:string;amount:string|null;input:Entry}
export type Receipt = {transaction_id?:string;revision?:number;status?:string;warnings?:{account_id:string;balance:string}[]}
export type Command = {key:string;action:string;entry?:Entry;transaction_id?:string;expected_revision?:number;reason?:string;target?:string;name?:string}
export type Api = <T>(name:string,args?:Record<string,unknown>)=>Promise<T>
export const liveApi:Api = async <T,>(name:string,args?:Record<string,unknown>):Promise<T> => {
  const {data,error}=await supabase.rpc(name,args); if(error) throw error; return data as T
}
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export function cents(value:string):bigint {
  if(!/^-?\d{1,16}(\.\d{1,2})?$/.test(value)) throw new Error('จำนวนเงินต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง และไม่ใส่ comma')
  const neg=value.startsWith('-'), [whole,decimal='']=value.replace('-','').split('.')
  return (BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0')))*(neg?-1n:1n)
}
export function money(value:string) {
  const n=cents(value), a=n<0n?-n:n
  return `${n<0n?'-':''}${(a/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(a%100n).toString().padStart(2,'0')}`
}
export const labels:Record<string,string>={expense:'รายจ่าย',income:'รายรับ',transfer:'โอนเงิน',party_payment:'จ่ายแทน / ให้ยืม / ชำระเจ้าหนี้',party_receipt:'รับคืน / รับเงินยืม',refund:'คืนเงินอ้างอิงรายการเดิม',opening:'ยอดยกมา'}
export function errorText(error:unknown) {
 const e=error as {message?:string}; const m=e?.message||'เชื่อมต่อไม่สำเร็จ'
 const translated:Record<string,string>={stale_revision:'รายการเปลี่ยนจากอีกหน้าหนึ่ง กรุณาโหลดรายการใหม่ก่อนแก้ไข',opening_required:'กรุณาตั้งยอดยกมาก่อนลงรายการ',source_has_active_refunds:'รายการนี้มีการคืนเงินแล้ว ต้องแก้รายการคืนเงินก่อน',invalid_or_future_date:'วันที่ไม่ถูกต้อง หรือเป็นวันที่ในอนาคต',refund_exceeds_remaining:'ยอดคืนเกินยอดคงเหลือ'}
 return translated[m]||m
}
export function downloadCsv(name:string,rows:string[][]) {
 const cell=(s:string)=>`"${(/^[\s]*[=+@-]/.test(s)?"'":'')+s.replaceAll('"','""')}"`
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}))
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
