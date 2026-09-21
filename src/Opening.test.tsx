import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {Opening} from './AccountingApp'
import type {Catalog,Row} from './accounting'
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
