// Mounted production components, synthetic SDK transport. Never calls hosted services.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {TransactionFiles,LedgerBackup} from './LedgerSafety'
import {liveApi} from './accounting'
import {digest,unpackBackup,tableNames} from './backup-format'
import type {Snapshot} from './backup-format'

const sdk=vi.hoisted(()=>({rpc:vi.fn(),upload:vi.fn(),download:vi.fn(),createSignedUrl:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:sdk.rpc,storage:{from:()=>({upload:sdk.upload,download:sdk.download,createSignedUrl:sdk.createSignedUrl})}}}))
const bytes=new TextEncoder().encode('%PDF-1.4 synthetic evidence'),path='transaction/revision/file'
type Request=Record<string,unknown>
let exists:boolean,rows:Record<string,unknown>[],commands:Request[],reservation:Record<string,unknown>
async function rpc(name:string,args?:Record<string,unknown>) {
 if(name==='accounting_attachment_list')return {data:structuredClone(rows),error:null}
 if(name!=='accounting_attachment')throw Error('Unexpected RPC '+name)
 const q=args!.p_request as Request;commands.push(structuredClone(q))
 if(q.action==='reserve'){rows=[reservation];return {data:reservation,error:null}}
 if(q.action==='finish') {
  if(!exists)return {data:null,error:{message:'upload_missing',code:'P0001'}}
  rows=[{...reservation,state:'ready'}];return {data:rows[0],error:null}
 }
 if(q.action==='archive'){rows=[{...reservation,state:'archived'}];return {data:rows[0],error:null}}
 throw Error('Unexpected command')
}
function file() {
 const f=new File([bytes],'synthetic.pdf',{type:'application/pdf'})
 // jsdom does not implement Blob.arrayBuffer; browser API does. Preserve exact bytes.
 Object.defineProperty(f,'arrayBuffer',{value:async()=>bytes.slice().buffer});return f
}
async function mount() {render(<TransactionFiles id="transaction" revision={1} api={liveApi}/>);await waitFor(()=>expect(sdk.rpc).toHaveBeenCalled())}
async function select(user:ReturnType<typeof userEvent.setup>) {await user.upload(screen.getByLabelText('เลือกเอกสาร'),file())}
beforeEach(async()=>{
 vi.resetAllMocks();exists=false;commands=[];rows=[]
 reservation={id:'file',path,filename:'synthetic.pdf',mime:'application/pdf',size:bytes.length,sha256:await digest(bytes),state:'pending',revision:1,created_at:'2026-01-01T00:00:00Z'}
 sdk.rpc.mockImplementation(rpc)
 sdk.upload.mockImplementation(async()=>{exists=true;return {data:{path},error:null}})
 sdk.download.mockResolvedValue({data:{arrayBuffer:async()=>bytes.slice().buffer},error:null})
 sdk.createSignedUrl.mockResolvedValue({data:{signedUrl:'https://example.invalid/private-file'},error:null})
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:backup');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})

describe('Attachment retry and complete backup flow',()=>{
 it('uploads once without overwrite and binds filename/hash to the server revision path',async()=>{
  const user=userEvent.setup();await mount();await select(user)
  await user.click(screen.getByRole('button',{name:'แนบกับฉบับปัจจุบัน'}))
  await screen.findByText('แนบไฟล์แล้ว ผูกกับฉบับที่ 1')
  expect(commands.find(q=>q.action==='reserve')).toMatchObject({transaction_id:'transaction',expected_revision:1,sha256:reservation.sha256})
  expect(sdk.upload).toHaveBeenCalledExactlyOnceWith(path,expect.any(File),{upsert:false,contentType:'application/pdf'})
 })
 it('recovers an upload whose response was lost without uploading a second object',async()=>{
  sdk.upload.mockImplementation(async()=>{exists=true;return {error:new Error('Lost upload response')}})
  const user=userEvent.setup();await mount();await select(user)
  await user.click(screen.getByRole('button',{name:'แนบกับฉบับปัจจุบัน'}));await screen.findByText('Lost upload response')
  await user.click(screen.getByRole('button',{name:'ลองแนบไฟล์เดิมอีกครั้ง'}));await screen.findByText('แนบไฟล์แล้ว ผูกกับฉบับที่ 1')
  expect(sdk.upload).toHaveBeenCalledTimes(1);expect(commands.filter(q=>q.action==='reserve')).toHaveLength(1)
 })
 it('replays the same reservation key after an unknown reserve result',async()=>{
  let first=true;sdk.rpc.mockImplementation(async(name,args)=>{const result=await rpc(name,args);if(name==='accounting_attachment'&&args.p_request.action==='reserve'&&first){first=false;throw Error('Lost reserve response')}return result})
  const user=userEvent.setup();await mount();await select(user)
  await user.click(screen.getByRole('button',{name:'แนบกับฉบับปัจจุบัน'}));await screen.findByText('Lost reserve response')
  await user.click(screen.getByRole('button',{name:'ลองแนบไฟล์เดิมอีกครั้ง'}));await screen.findByText('แนบไฟล์แล้ว ผูกกับฉบับที่ 1')
  const reservations=commands.filter(q=>q.action==='reserve');expect(reservations).toHaveLength(2);expect(reservations[1]).toEqual(reservations[0]);expect(sdk.upload).toHaveBeenCalledTimes(1)
 })
 it('suppresses a double tap while an upload is pending',async()=>{
  let resolve!:(value:unknown)=>void;sdk.upload.mockImplementation(()=>new Promise(r=>{resolve=r}))
  const user=userEvent.setup();await mount();await select(user)
  const button=screen.getByRole('button',{name:'แนบกับฉบับปัจจุบัน'});fireEvent.click(button);fireEvent.click(button)
  await waitFor(()=>expect(sdk.upload).toHaveBeenCalledTimes(1));exists=true;resolve({data:{path},error:null})
  await screen.findByText('แนบไฟล์แล้ว ผูกกับฉบับที่ 1');expect(commands.filter(q=>q.action==='reserve')).toHaveLength(1)
 })
 it('can finalize a previously uploaded pending file after remount without reupload',async()=>{
  exists=true;rows=[reservation];const user=userEvent.setup();await mount()
  await user.click(await screen.findByRole('button',{name:'ตรวจไฟล์ที่อัปโหลดค้าง'}))
  await screen.findByText('ตรวจพบไฟล์และยืนยันแล้ว');expect(sdk.upload).not.toHaveBeenCalled()
 })
 it('requires a reason for archive and obtains a short-lived download link',async()=>{
  rows=[{...reservation,state:'ready'}];const user=userEvent.setup();await mount()
  await user.click(await screen.findByRole('button',{name:'เตรียมเปิดไฟล์'}))
  expect((await screen.findByRole('link',{name:'เปิด / ดาวน์โหลด synthetic.pdf'})).getAttribute('href')).toBe('https://example.invalid/private-file')
  expect(sdk.createSignedUrl).toHaveBeenCalledWith(path,60,{download:'synthetic.pdf'})
  await user.click(screen.getByRole('button',{name:'เก็บเข้าประวัติ'}))
  expect((screen.getByRole('button',{name:'ยืนยันเก็บเข้าประวัติ'}) as HTMLButtonElement).disabled).toBe(true)
  await user.type(screen.getByRole('textbox',{name:'เหตุผลเก็บไฟล์เข้าประวัติ'}),'superseded')
  await user.click(screen.getByRole('button',{name:'ยืนยันเก็บเข้าประวัติ'}));await screen.findByText('เก็บเข้าประวัติแล้ว ไม่ได้ลบไฟล์')
  expect(commands.find(q=>q.action==='archive')).toMatchObject({id:'file',reason:'superseded'})
 })
 it('backs up completed and archived bytes, rejecting a corrupt download',async()=>{
  const tables=Object.fromEntries(tableNames.map(t=>[t,[]])) as unknown as Snapshot['tables']
  tables.settings=[{owner_id:'synthetic'}];tables.entities=Array.from({length:6},(_,i)=>({id:String(i)}));tables.attachments=[{...reservation,state:'archived'}]
  const snapshot:Snapshot={format:'moana-ledger',version:2,exported_at:'2026-01-01T00:00:00Z',tables,counts:Object.fromEntries(tableNames.map(t=>[t,tables[t].length]))}
  sdk.rpc.mockResolvedValue({data:snapshot,error:null});let blob:Blob|undefined
  vi.spyOn(URL,'createObjectURL').mockImplementation(b=>{blob=b as Blob;return 'blob:backup'})
  const user=userEvent.setup();render(<LedgerBackup api={liveApi} userId="synthetic"/>)
  await user.click(screen.getByRole('button',{name:'เตรียมสำรองครบชุด'}));await screen.findByRole('link',{name:'ดาวน์โหลด JSON สำรอง'})
  const text=await new Promise<string>(r=>{const reader=new FileReader();reader.onload=()=>r(String(reader.result));reader.readAsText(blob!)})
  const payload=await unpackBackup(text);expect(payload.files).toHaveLength(1);expect(payload.files[0].sha256).toBe(reservation.sha256)
  sdk.download.mockResolvedValue({data:{arrayBuffer:async()=>new Uint8Array([1,2]).buffer},error:null})
  await user.click(screen.getByRole('button',{name:'เตรียมสำรองครบชุด'}));await screen.findByText('ไฟล์แนบไม่ตรงกับข้อมูลที่บันทึก หยุดสำรองไว้ก่อน')
  expect(screen.queryByRole('link',{name:'ดาวน์โหลด JSON สำรอง'})).toBeNull()
 })
})
