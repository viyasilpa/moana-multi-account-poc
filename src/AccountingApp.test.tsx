// Component tests only (jsdom), not browser/Safari acceptance. All RPCs are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountingApp } from './AccountingApp'
import type { Api, Catalog, Command } from './accounting'
vi.mock('./supabase',()=>({supabase:{rpc:vi.fn(()=>{throw new Error('Live RPC forbidden in component tests')})}}))

const catalog:Catalog={settings:{start_date:'2026-01-01'},entities:[{id:'e1',code:'D1',name:'Demo 1',active:true},{id:'e2',code:'D2',name:'Demo 2',active:true}],parties:[],accounts:[
 {id:'bank',entity_id:'e1',name:'Demo bank',kind:'bank',party_id:null,active:true},
 {id:'expense',entity_id:'e2',name:'=Unsafe category',kind:'expense',party_id:null,active:true},
 {id:'income',entity_id:'e2',name:'Demo income',kind:'income',party_id:null,active:true},
]}
const report={accounts:[{account_id:'expense',entity_id:'e2',kind:'expense',opening:'900',debit:'123.45',credit:'0',closing:'1023.45'}],pnl:[{entity_id:'e2',income:'0',expense:'123.45',net:'-123.45'}],consolidated:{income:'0',expense:'123.45',net:'-123.45'}}
function fixture(post:(q:Command)=>unknown=()=>({transaction_id:'synthetic',revision:1,warnings:[]})) {
 const calls:Command[]=[]
 const api:Api=async<T,>(name:string,args?:Record<string,unknown>):Promise<T>=>{
  if(name==='accounting_catalog')return structuredClone(catalog) as T
  if(name==='accounting_report')return structuredClone(report) as T
  if(name==='accounting_activity')return {items:[],total:0} as T
  if(name==='accounting_post'){const q=args!.p_request as Command;calls.push(structuredClone(q));return await post(q) as T}
  throw new Error('Unexpected RPC '+name)
 }
 return {api,calls}
}
async function mount(api:Api) {
 const view=render(<AccountingApp userId="synthetic-user" api={api}/>);await screen.findByRole('heading',{name:'ลงรายการ'});return view
}
async function fillExpense(user:ReturnType<typeof userEvent.setup>) {
 await user.selectOptions(screen.getByRole('combobox',{name:'บัญชีที่จ่ายเงิน'}),'bank')
 await user.selectOptions(screen.getByRole('combobox',{name:'รายการนี้เป็นของกิจการไหน'}),'e2')
 await user.selectOptions(screen.getByRole('combobox',{name:'หมวดรายจ่าย'}),'expense')
 await user.type(screen.getByRole('textbox',{name:'จำนวนเงิน (บาท)'}),'123.45')
 await user.click(screen.getByRole('button',{name:'ตรวจรายการ'}))
 await user.click(screen.getByRole('button',{name:'ยืนยันบันทึก'}))
}
beforeEach(()=>{sessionStorage.clear();vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic-export');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('Stage 4 interaction regression',()=>{
 it('keeps the draft on continue and discards only after explicit inline confirmation',async()=>{
  const user=userEvent.setup(),{api,calls}=fixture();await mount(api)
  const nativeConfirm=vi.spyOn(window,'confirm')
  await user.type(screen.getByRole('textbox',{name:'รายละเอียด'}),'draft kept')
  await user.click(screen.getByRole('button',{name:'รายงาน'}))
  expect(screen.getByRole('button',{name:'กรอกต่อ'})).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'กรอกต่อ'}))
  expect((screen.getByRole('textbox',{name:'รายละเอียด'}) as HTMLInputElement).value).toBe('draft kept')
  await user.click(screen.getByRole('button',{name:'รายงาน'}))
  await user.click(screen.getByRole('button',{name:'ออกโดยไม่บันทึก'}))
  await screen.findByRole('heading',{name:'รายงานรายรับ–รายจ่าย'})
  await user.click(screen.getByRole('button',{name:'ลงรายการ'}))
  expect((screen.getByRole('textbox',{name:'รายละเอียด'}) as HTMLInputElement).value).toBe('')
  expect(nativeConfirm).not.toHaveBeenCalled();expect(calls).toHaveLength(0)
 })
 it('posts payer and beneficiary separately and clears the completed form',async()=>{
  const user=userEvent.setup(),{api,calls}=fixture();await mount(api);await fillExpense(user)
  await screen.findByText(/บันทึกแล้ว · เลขที่ syntheti/)
  expect(calls).toHaveLength(1);expect(calls[0].entry).toMatchObject({money_account_id:'bank',for_entity_id:'e2',category_account_id:'expense',amount:'123.45'})
  expect(sessionStorage.getItem('moana-command-v1:synthetic-user')).toBeNull()
  expect((screen.getByRole('textbox',{name:'จำนวนเงิน (บาท)'}) as HTMLInputElement).value).toBe('')
 })
 it('retains unknown-outcome payload across remount and retries the exact same key',async()=>{
  let fail=true;const user=userEvent.setup(),{api,calls}=fixture(()=>{if(fail)throw new TypeError('Network unavailable');return {transaction_id:'synthetic',warnings:[]}})
  const view=await mount(api);await fillExpense(user)
  await screen.findByRole('button',{name:'ตรวจสอบ / ส่งคำขอเดิม'})
  expect(screen.getByRole('button',{name:'ยืนยันบันทึก'}).closest('fieldset')?.disabled).toBe(true)
  const saved=JSON.parse(sessionStorage.getItem('moana-command-v1:synthetic-user')!)
  expect(saved.request).toEqual(calls[0]);view.unmount();await mount(api)
  fail=false;await user.click(screen.getByRole('button',{name:'ตรวจสอบ / ส่งคำขอเดิม'}))
  await screen.findByText(/บันทึกแล้ว · เลขที่ syntheti/)
  expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);expect(sessionStorage.getItem('moana-command-v1:synthetic-user')).toBeNull()
 })
 it('keeps input editable after explicit SQL rollback and does not store a pending retry',async()=>{
  const user=userEvent.setup(),{api}=fixture(()=>{throw {code:'23514',message:'invalid_or_future_date'}})
  await mount(api);await fillExpense(user)
  await screen.findByText('วันที่ไม่ถูกต้อง หรือเป็นวันที่ในอนาคต')
  expect((screen.getByRole('textbox',{name:'จำนวนเงิน (บาท)'}) as HTMLInputElement).value).toBe('123.45')
  expect(screen.queryByRole('button',{name:'ตรวจสอบ / ส่งคำขอเดิม'})).toBeNull()
  expect(sessionStorage.getItem('moana-command-v1:synthetic-user')).toBeNull()
 })
 it('does not send when safe retry persistence is unavailable',async()=>{
  const user=userEvent.setup(),{api,calls}=fixture();await mount(api)
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage unavailable')})
  await fillExpense(user);expect(calls).toHaveLength(0)
 })
 it('synchronizes date input before submission',async()=>{
  const user=userEvent.setup(),{api,calls}=fixture();await mount(api)
  fireEvent.input(screen.getByLabelText('วันที่'),{target:{value:'2026-01-02'}})
  await fillExpense(user);expect(calls[0].entry?.date).toBe('2026-01-02')
 })
 it('exports period amounts, escapes formula names and releases the download URL',async()=>{
  let blob:Blob|undefined
  const create=vi.fn((b:Blob)=>{blob=b;return 'blob:synthetic-export'}),revoke=vi.fn()
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}))
  const user=userEvent.setup(),{api}=fixture();const view=await mount(api)
  await user.click(screen.getByRole('button',{name:'รายงาน'}))
  const link=await screen.findByRole('link',{name:'ดาวน์โหลด CSV'})
  expect(link.getAttribute('href')).toBe('blob:synthetic-export');expect(link.getAttribute('download')).toMatch(/^moana-.*\.csv$/)
  const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob!)})
  expect(text).toContain('"Demo 2","\'=Unsafe category","123.45"');expect(text).not.toContain('1023.45')
  view.unmount();expect(revoke).toHaveBeenCalledWith('blob:synthetic-export')
 })
})
