import { useRef, useState } from 'react'
import { supabase } from './supabase'

export function SystemCheck({ userId }: { userId: string }) {
  const [report, setReport] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function run() {
    if (lock.current) return
    lock.current = true; setBusy(true); setReport([])
    const id = crypto.randomUUID()
    let inserted = false
    const passed: string[] = []
    const note = (text: string) => { passed.push(text); setReport([...passed]) }
    try {
      const insert = await supabase.from('poc_items').insert({ id, owner_id: userId, description: 'POC automated check', amount: '12.34' }).select('id,amount').single()
      if (insert.error || insert.data?.id !== id || insert.data.amount !== 12.34) throw new Error('เพิ่มรายการไม่ผ่าน')
      inserted = true; note('ผ่าน: เพิ่มรายการผ่าน API จริง')
      const read = await supabase.from('poc_items').select('id,amount').eq('id', id).single()
      if (read.error || read.data?.amount !== 12.34) throw new Error('อ่านกลับไม่ผ่าน')
      note('ผ่าน: อ่านกลับจากฐานข้อมูล')
      const update = await supabase.from('poc_items').update({ amount: '56.78' }).eq('id', id).select('amount').single()
      if (update.error || update.data?.amount !== 56.78) throw new Error('แก้ไขไม่ผ่าน')
      note('ผ่าน: แก้ไขผ่าน API จริง')
      const invalid = await supabase.from('poc_items').update({ amount: '1.001' }).eq('id', id)
      if (invalid.error?.code !== '23514') throw new Error('การปฏิเสธทศนิยมเกินยังไม่ยืนยัน')
      note('ผ่าน: ฐานข้อมูลปฏิเสธทศนิยมเกิน 2 ตำแหน่ง')
      const url = import.meta.env.VITE_SUPABASE_URL || 'https://gekgfbiduzntenvgcwxv.supabase.co'
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_H1K8h84bzTti827qODcZ2w_cOFIPRwt'
      const anon = await fetch(`${url}/rest/v1/poc_items?select=id&id=eq.${id}`, { headers: { apikey: key }, credentials: 'omit' })
      if (![401, 403].includes(anon.status)) throw new Error('การปฏิเสธผู้ไม่ล็อกอินยังไม่ยืนยัน')
      note('ผ่าน: ผู้ไม่ล็อกอินถูกปฏิเสธการอ่านข้อมูล')
      const removed = await supabase.from('poc_items').delete().eq('id', id).select('id').single()
      if (removed.error || removed.data?.id !== id) throw new Error('ลบรายการทดสอบไม่ผ่าน')
      inserted = false
      const absent = await supabase.from('poc_items').select('id').eq('id', id)
      if (absent.error || absent.data.length) throw new Error('ตรวจผลหลังลบไม่ผ่าน')
      note('ผ่าน: ลบเฉพาะรายการทดสอบและตรวจว่าไม่เหลือแล้ว')
      note('ชุดทดสอบ API ผ่านครบ — ไม่ใช่การรับรองระบบบัญชีทั้งหมด')
    } catch (error) {
      note(error instanceof Error ? error.message : 'การเชื่อมต่อผิดพลาด')
    } finally {
      // Also attempt exact-ID cleanup if the insert response was lost after server commit.
      try {
        const cleanup = await supabase.from('poc_items').delete().eq('id', id)
        if (cleanup.error) throw cleanup.error
        if (inserted) note('ล้างรายการทดสอบแล้วหลังหยุดทดสอบ')
      } catch { note(`ตรวจล้างข้อมูลไม่สำเร็จ แจ้งถั่วพร้อมรหัสรายการ ${id}`) }
      finally { lock.current = false; setBusy(false) }
    }
  }
  return <section className="card">
    <h2>ตรวจระบบบันทึกข้อมูล</h2>
    <p>สร้างรายการทดสอบใหม่ 1 รายการ แก้ไข อ่านกลับ แล้วลบทิ้ง ไม่แตะข้อมูลเดิม</p>
    <button disabled={busy} onClick={run}>{busy ? 'กำลังตรวจระบบ…' : 'เริ่มตรวจระบบอัตโนมัติ'}</button>
    <div role="status">{report.map((line, index) => <p key={index}>{line}</p>)}</div>
  </section>
}
