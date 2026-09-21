import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {Opening,Detail,Reports} from './AccountingApp'
import type {Catalog,Row,Api} from './accounting'
vi.mock('./supabase',()=>({supabase:{rpc:vi.fn()}}))
afterEach(cleanup)
const c:Catalog={settings:{start_date:'2026-01-01'},entities:[{id:'a',code:'A',name:'A',active:true},{id:'b',code:'B',name:'B',active:true}],parties:[{id:'pa',name:'A',kind:'related',related_entity_id:'a',active:true},{id:'pb',name:'B',kind:'related',related_entity_id:'b',active:true}],accounts:[{id:'ab',entity_id:'a',name:'A to B',kind:'party',party_id:'pb',active:true},{id:'ba',entity_id:'b',name:'B to A',kind:'party',party_id:'pa',active:true},{id:'old',entity_id:'b',name:'Disabled party',kind:'party',party_id:null,active:false}]}
it('shows reciprocal opening at both entities while submitting the pair once',async()=>{
 const send=vi.fn(async()=>true)
 const editing={id:'tx',current_revision:2,kind:'opening',input:{kind:'opening',date:'2026-01-01',balances:[{account_id:'ab',signed_amount:'12.34'}]}} as Row
 const {container}=render(<Opening catalog={c} send={send} editing={editing}/>)
 expect((screen.getByLabelText(/B to A/) as HTMLInputElement).value).toBe('-12.34')
 expect((screen.getByLabelText(/B to A/) as HTMLInputElement).readOnly).toBe(true)
 expect(screen.queryByLabelText('Disabled party')).toBeNull()
 fireEvent.change(screen.getByLabelText('A to B'),{target:{value:'-7.01'}})
 expect((screen.getByLabelText(/B to A/) as HTMLInputElement).value).toBe('7.01')
 fireEvent.change(screen.getByLabelText('เหตุผลที่แก้ไข'),{target:{value:'synthetic correction'}})
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.submit(container.querySelector('form')!)
 expect(send).toHaveBeenCalledWith(expect.objectContaining({entry:{kind:'opening',date:'2026-01-01',balances:[{account_id:'ab',signed_amount:'-7.01'}]}}))
})
it('keeps the original entered side editable when editing a reverse-side opening',()=>{
 const editing={id:'tx',current_revision:1,kind:'opening',input:{kind:'opening',date:'2026-01-01',balances:[{account_id:'ba',signed_amount:'5'}]}} as Row
 render(<Opening catalog={c} send={vi.fn()} editing={editing}/>)
 expect((screen.getByLabelText('B to A') as HTMLInputElement).readOnly).toBe(false)
 expect((screen.getByLabelText(/A to B/) as HTMLInputElement).value).toBe('-5.00')
})

it('defaults to latest effective lines and exposes immutable history only on request',async()=>{
 const data={revisions:[{revision:1,date:'2026-01-01',reason:'',input:{description:'old draft'}},{revision:2,date:'2026-01-01',reason:'corrected',input:{description:'current'}}],lines:[{revision:1,role:'opening',date:'2026-01-01',entity_id:'b',account_id:'old',debit:'8',credit:'0'},{revision:2,role:'reversal',date:'2026-01-01',entity_id:'b',account_id:'old',debit:'0',credit:'8'},{revision:2,role:'replacement',date:'2026-01-01',entity_id:'a',account_id:'ab',debit:'8',credit:'0'}]}
 const api:Api=async<T,>(name:string)=> (name==='accounting_detail'?data:[]) as T
 render(<Detail id="test" catalog={c} api={api}/>)
 await screen.findByText('A to B')
 expect(screen.queryByText('Disabled party')).toBeNull()
 fireEvent.click(screen.getByRole('checkbox',{name:'แสดงประวัติทุกฉบับและรายการกลับ'}))
 expect(screen.getAllByText('Disabled party')).toHaveLength(2)
 fireEvent.click(screen.getByRole('checkbox',{name:'แสดงประวัติทุกฉบับและรายการกลับ'}))
 expect(screen.queryByText('Disabled party')).toBeNull()
})
it('zero option does not bring archived zero accounts back into the status report',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
 const data={accounts:[{account_id:'old',entity_id:'b',kind:'party',opening:'0',debit:'0',credit:'0',closing:'0'},{account_id:'ab',entity_id:'a',kind:'party',opening:'0',debit:'0',credit:'0',closing:'0'}],pnl:[],consolidated:{income:'0',expense:'0',net:'0'}}
 const api:Api=async<T,>()=>data as T
 render(<Reports catalog={c} api={api} status/>)
 fireEvent.click(await screen.findByRole('checkbox',{name:'แสดงบัญชียอดศูนย์'}))
 expect(screen.getByText('A to B')).toBeTruthy()
 expect(screen.queryByText('Disabled party')).toBeNull()
 vi.restoreAllMocks()
})
it('shows PP receivables/payables from the opposite side and keeps ledger direction consistent',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
 const ppCatalog:Catalog={...c,parties:[...c.parties,{id:'pp',name:'PP',kind:'pp',related_entity_id:null,active:true}],accounts:[...c.accounts,{id:'app',entity_id:'a',name:'PP in A',kind:'party',party_id:'pp',active:true},{id:'bpp',entity_id:'b',name:'PP in B',kind:'party',party_id:'pp',active:true}]}
 const data={accounts:[{account_id:'app',entity_id:'a',kind:'party',opening:'-8',debit:'0',credit:'2',closing:'-10'},{account_id:'bpp',entity_id:'b',kind:'party',opening:'0',debit:'20',credit:'0',closing:'20'},{account_id:'ab',entity_id:'a',kind:'party',opening:'99',debit:'0',credit:'0',closing:'99'}],pnl:[],consolidated:{income:'0',expense:'0',net:'0'}}
 const api:Api=async<T,>(name:string)=> (name==='accounting_gl'?{opening:'-8',closing:'-10',lines:[{id:'l',date:'2026-01-02',transaction_id:'t',revision:1,role:'original',debit:'0',credit:'2',balance:'-10'}]}:data) as T
 render(<Reports catalog={ppCatalog} api={api} status/>)
 await screen.findByRole('checkbox',{name:'แสดงบัญชียอดศูนย์'})
 fireEvent.change(screen.getByRole('combobox',{name:'กิจการ'}),{target:{value:'__pp__'}})
 expect(screen.queryByText('A to B')).toBeNull()
 expect(screen.getByText('ค้าง PP')).toBeTruthy()
 expect(screen.getByText('PP ค้างกิจการนี้')).toBeTruthy()
 expect(screen.getByText('-20.00')).toBeTruthy()
 expect(screen.getByText('ลูกหนี้ของ PP รวม').parentElement?.textContent).toContain('10.00')
 expect(screen.getByText('เจ้าหนี้ของ PP รวม').parentElement?.textContent).toContain('20.00')
 fireEvent.click(screen.getAllByRole('button',{name:'ดูบัญชี'})[0])
 await screen.findByText('ยกมา 8.00 · คงเหลือ 10.00')
 expect(screen.getByText('PP ↔ A · บัญชีแยกประเภท')).toBeTruthy()
 fireEvent.change(screen.getByRole('combobox',{name:'กิจการ'}),{target:{value:'a'}})
 expect(screen.getByText('-10.00')).toBeTruthy()
 expect(screen.queryByText('ลูกหนี้ของ PP รวม')).toBeNull()
 vi.restoreAllMocks()
})
