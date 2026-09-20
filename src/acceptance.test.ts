import {it,expect,vi} from 'vitest'
import {waitFor} from '@testing-library/react'
import page from '../acceptance.html?raw'

it('prepares isolated backup and verifies selected files without live services',async()=>{
 document.body.innerHTML=page.match(/<body>([\s\S]*)<script type="module"/)![1]
 Object.defineProperty(window,'isSecureContext',{value:true,configurable:true})
 const blobs:Blob[]=[]
 vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>{blobs.push(blob as Blob);return `blob:test-${blobs.length}`})
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
 await import('./acceptance')
 document.getElementById('prepare')!.click()
 await waitFor(()=>expect(document.getElementById('status')!.textContent).toContain('พร้อมแล้ว'),{timeout:30000})
 expect(blobs).toHaveLength(2)
 const select=async(id:string,blob:Blob)=>{
  const input=document.getElementById(id) as HTMLInputElement
  const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(blob)})
  Object.defineProperty(input,'files',{value:[{size:blob.size,arrayBuffer:async()=>bytes}],configurable:true})
  input.dispatchEvent(new Event('change'))
  await waitFor(()=>expect(input.disabled).toBe(false),{timeout:30000})
 }
 await select('backup-input',blobs[0]);await select('image-input',blobs[1])
 expect(document.getElementById('summary')!.textContent).toContain('ผ่านการบันทึกและเปิดไฟล์สองชนิด')
 await select('backup-input',new Blob(['wrong backup']))
 expect(document.getElementById('results')!.textContent).toContain('ไฟล์ไม่ตรง')
 expect(document.getElementById('summary')!.textContent).toContain('ยังไม่ครบ')
 vi.restoreAllMocks()
},60000)
