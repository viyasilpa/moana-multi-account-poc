import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const bucket = supabase.storage.from('poc-attachments')
const types = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain'])
async function digest(blob: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')
}

export function Attachments({ userId }: { userId: string }) {
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const lock = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    void bucket.list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setNotice('โหลดรายชื่อไฟล์ไม่ได้ กรุณาลองใหม่')
        else setFiles((data ?? []).filter(file => file.id).map(file => file.name))
      }).catch(() => { if (active) setNotice('เชื่อมต่อพื้นที่เก็บไฟล์ไม่ได้') })
    return () => { active = false }
  }, [userId, refresh])

  async function upload(file: File) {
    if (lock.current) return
    if (!types.has(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setNotice('เลือก PDF, JPG, PNG หรือ TXT ขนาดไม่เกิน 5 MB และไม่ใช่ไฟล์ว่าง'); return
    }
    lock.current = true; setBusy(true)
    // ASCII path avoids Storage key encoding incompatibilities. Originals remain on the user's device.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file'
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`
    let stored = false
    try {
      const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type })
      if (error) throw error
      stored = true
      setSelected(null)
      if (input.current) input.current.value = ''
      const downloaded = await bucket.download(path)
      if (downloaded.error) throw downloaded.error
      if (await digest(file) !== await digest(downloaded.data)) throw new Error('Integrity mismatch')
      setNotice('อัปโหลดและอ่านกลับสำเร็จ — เนื้อหาไฟล์ตรงกันทุกไบต์')
    } catch {
      setNotice(stored ? 'อัปโหลดแล้ว แต่ยังตรวจการอ่านกลับไม่ได้ กรุณาลองดาวน์โหลด' : 'ยังยืนยันการอัปโหลดไม่ได้ โหลดรายชื่อไฟล์ก่อนลองซ้ำ')
    } finally { setRefresh(n => n + 1); lock.current = false; setBusy(false) }
  }
  async function download(name: string) {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try {
      const { data, error } = await bucket.download(`${userId}/${name}`)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url; link.download = name.slice(37) || 'attachment'
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setNotice('ดาวน์โหลดแล้ว')
    } catch { setNotice('ดาวน์โหลดไม่สำเร็จ ตรวจการเข้าสู่ระบบและลองใหม่') }
    finally { lock.current = false; setBusy(false) }
  }

  return <section className="card" aria-label="ไฟล์ทดสอบส่วนตัว">
    <h2>ไฟล์ทดสอบส่วนตัว</h2>
    <p>ยังไม่ผูกกับรายการบัญชี · ไม่มีการเขียนทับหรือลบไฟล์</p>
    <button disabled={busy} type="button" onClick={() => upload(new File(['Moana private storage POC test\n'], 'poc-test.txt', { type: 'text/plain' }))}>ทดสอบอัปโหลดและอ่านกลับ</button>
    <label>หรือเลือกไฟล์ทดสอบ (ไม่ใช้เอกสารจริง)
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.txt" disabled={busy} onChange={e => setSelected(e.target.files?.[0] ?? null)} />
    </label>
    <div className="actions">
      <button disabled={busy || !selected} onClick={() => selected && upload(selected)}>อัปโหลดไฟล์ที่เลือก</button>
      <button className="secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}>โหลดรายชื่อไฟล์</button>
    </div>
    <p className="notice" role="status">{busy ? 'กำลังรับส่งไฟล์…' : notice}</p>
    <small>PDF / JPG / PNG / TXT สูงสุด 5 MB ผ่านหน้านี้ · แสดง 100 ไฟล์ล่าสุด · ชื่อไฟล์ภาษาไทยจะเปลี่ยนเป็นขีดล่างใน POC</small>
    <ul>{files.map(name => <li key={name}><span>{name.slice(37) || name}</span>
      <button className="secondary" disabled={busy} onClick={() => download(name)}>ดาวน์โหลด</button></li>)}</ul>
  </section>
}
