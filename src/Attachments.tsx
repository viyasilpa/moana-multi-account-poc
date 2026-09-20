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
  const [backup, setBackup] = useState<File | null>(null)
  const [backupUrl, setBackupUrl] = useState('')
  useEffect(() => () => { if (backupUrl) URL.revokeObjectURL(backupUrl) }, [backupUrl])

  async function exportFiles() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try {
      const list = await bucket.list(userId, { limit: 101 })
      if (list.error) throw list.error
      if (list.data.length > 100 || list.data.some(f => !f.id)) throw new Error('Unsupported scope')
      const entries = []
      let total = 0
      for (const file of list.data) {
        const result = await bucket.download(`${userId}/${file.name}`)
        if (result.error) throw result.error
        total += result.data.size
        if (total > 10 * 1024 * 1024) throw new Error('POC backup size limit')
        const bytes = new Uint8Array(await result.data.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const mime = result.data.type.split(';')[0].trim().toLowerCase()
        if (!types.has(mime)) throw new Error('Unsupported file type')
        entries.push({ name: file.name, type: mime, sha256: await digest(result.data), base64: btoa(binary) })
      }
      const blob = new Blob([JSON.stringify({ format: 'moana-poc-files', version: 1, files: entries })], { type: 'application/json' })
      setBackupUrl(URL.createObjectURL(blob))
      setNotice(`เตรียมไฟล์สำรอง ${entries.length} ไฟล์แล้ว กดดาวน์โหลดไฟล์สำรองด้านล่าง`)
    } catch { setNotice('สำรองไม่สำเร็จ: POC รองรับไฟล์ชั้นเดียวไม่เกิน 100 ไฟล์ รวม 10 MB หรือลองตรวจการเชื่อมต่อ') }
    finally { lock.current = false; setBusy(false) }
  }

  async function restoreFiles() {
    if (!backup || lock.current) return
    lock.current = true; setBusy(true)
    let restored = 0
    try {
      if (backup.size > 15 * 1024 * 1024) throw new Error('Backup too large')
      const doc = JSON.parse(await backup.text())
      if (doc.format !== 'moana-poc-files' || doc.version !== 1 || !Array.isArray(doc.files) || doc.files.length > 100) throw new Error('Unsupported backup')
      const verified: { blob: Blob; hash: string; name: string }[] = []
      let total = 0
      // Validate every entry before writing anything. Never trust paths from an imported backup.
      for (const file of doc.files) {
        if (typeof file.name !== 'string' || !/^[a-zA-Z0-9._-]{1,180}$/.test(file.name) || typeof file.base64 !== 'string' || !types.has(file.type) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid entry')
        const binary = atob(file.base64)
        total += binary.length
        if (!binary.length || binary.length > 5 * 1024 * 1024 || total > 10 * 1024 * 1024) throw new Error('Invalid size')
        const blob = new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: file.type })
        if (await digest(blob) !== file.sha256) throw new Error('Invalid checksum')
        verified.push({ blob, hash: file.sha256, name: file.name.slice(-100) })
      }
      for (const file of verified) {
        const path = `${userId}/${crypto.randomUUID()}-restored-${file.name}`
        const result = await bucket.upload(path, file.blob, { upsert: false, contentType: file.blob.type })
        if (result.error) throw result.error
        restored++
        const read = await bucket.download(path)
        if (read.error || await digest(read.data) !== file.hash) throw new Error('Readback failed')
      }
      setNotice(`กู้คืนเป็นสำเนาใหม่และตรวจเนื้อหาผ่าน ${restored} ไฟล์ — ต้นฉบับไม่ถูกแก้ไข`)
    } catch { setNotice(`กู้คืนยังไม่ครบ มีสำเนาใหม่ที่อัปโหลดแล้ว ${restored} ไฟล์ ตรวจไฟล์สำรองและการเชื่อมต่อก่อนลองซ้ำ`) }
    finally { setRefresh(n => n + 1); lock.current = false; setBusy(false) }
  }
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
    <details><summary>ทดสอบสำรองและกู้คืนไฟล์แนบ</summary>
      <p>สำรองเฉพาะไฟล์ ไม่รวมรายการบัญชี · ไฟล์สำรองไม่เข้ารหัส ควรเก็บไว้ส่วนตัว</p>
      <button disabled={busy} onClick={exportFiles}>เตรียมไฟล์สำรอง</button>
      {backupUrl && <p><a href={backupUrl} download="moana-poc-files.json">ดาวน์โหลดไฟล์สำรอง</a></p>}
      <label>เลือกไฟล์สำรอง JSON ที่ดาวน์โหลด<input type="file" accept=".json" disabled={busy} onChange={e => setBackup(e.target.files?.[0] ?? null)} /></label>
      <p>กู้คืนจะเพิ่มสำเนาใหม่ ไม่เขียนทับต้นฉบับ หากขาดการเชื่อมต่ออาจกู้คืนได้บางส่วน</p>
      <button disabled={busy || !backup} onClick={restoreFiles}>กู้คืนเป็นสำเนาใหม่และตรวจเนื้อหา</button>
    </details>
    <small>PDF / JPG / PNG / TXT สูงสุด 5 MB ผ่านหน้านี้ · แสดง 100 ไฟล์ล่าสุด · ชื่อไฟล์ภาษาไทยจะเปลี่ยนเป็นขีดล่างใน POC</small>
    <ul>{files.map(name => <li key={name}><span>{name.slice(37) || name}</span>
      <button className="secondary" disabled={busy} onClick={() => download(name)}>ดาวน์โหลด</button></li>)}</ul>
  </section>
}
