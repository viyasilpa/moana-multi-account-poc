import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Attachments } from './Attachments'
import { SystemCheck } from './SystemCheck'
import './styles.css'

type Item = { id: string; description: string; amount: number }
const columns = 'id,description,amount'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [recovery, setRecovery] = useState(() => new URLSearchParams(location.search).get('recovery') === '1')
  const [forgot, setForgot] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setReady(true); setPassword('')
      if (_event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  async function requestReset(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://moana-multi-account-poc.vercel.app/?recovery=1',
      })
      setNotice(error ? 'ส่งคำขอไม่ได้ กรุณารอสักครู่แล้วลองใหม่' : 'หากอีเมลนี้มีบัญชี จะได้รับลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและสแปม')
    } catch { setNotice('เชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง') }
    finally { setBusy(false) }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (password.length < 12 || password !== confirmation) {
      setNotice('ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และกรอกทั้งสองช่องให้ตรงกัน'); return
    }
    setBusy(true)
    let changed = false
    try {
      const result = await supabase.auth.updateUser({ password })
      if (result.error) throw result.error
      changed = true
      const signedOut = await supabase.auth.signOut({ scope: 'global' })
      if (signedOut.error) throw signedOut.error
      setSession(null); setRecovery(false); setForgot(false)
      history.replaceState(null, '', location.pathname)
      setNotice('ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสใหม่')
    } catch {
      setNotice(changed ? 'เปลี่ยนรหัสผ่านแล้ว แต่ออกจากระบบไม่สำเร็จ กรุณากดออกจากระบบ' : 'เปลี่ยนรหัสผ่านไม่ได้ ลิงก์อาจหมดอายุ หรือรหัสไม่ผ่านเงื่อนไข กรุณาขอลิงก์ใหม่')
    } finally { setPassword(''); setConfirmation(''); setBusy(false) }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setNotice('เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมล รหัสผ่าน และการเชื่อมต่อ')
    } catch { setNotice('เชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง') }
    finally { setPassword(''); setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) setNotice('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง')
      else { setSession(null); setNotice('ออกจากระบบแล้ว') }
    } catch { setNotice('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง') }
    finally { setBusy(false) }
  }
  return <main>
    <header><p className="eyebrow">Moana · Technical POC · Not production</p>
      <h1>{recovery ? 'ตั้งรหัสผ่านใหม่' : forgot ? 'ลืมรหัสผ่าน' : session ? 'รายการทดสอบ' : 'เข้าสู่ระบบ'}</h1>
      <p>พื้นที่ทดสอบการบันทึกออนไลน์ — ยังไม่ใช้ข้อมูลบัญชีจริง</p>
    </header>
    {!ready ? <p role="status">กำลังตรวจการเข้าสู่ระบบ…</p> : recovery && session ? <form className="card" onSubmit={changePassword}>
      <label>รหัสผ่านใหม่<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>ยืนยันรหัสผ่านใหม่<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <button disabled={busy}>บันทึกรหัสผ่านใหม่</button>
      <button type="button" className="secondary" disabled={busy} onClick={logout}>ออกจากระบบ</button>
    </form> : session ? <>
      <button className="secondary" disabled={busy} onClick={logout}>ออกจากระบบ</button>
      <Items key={session.user.id} userId={session.user.id} />
    </> : forgot || recovery ? <form className="card" onSubmit={requestReset}>
      {recovery && <p>ลิงก์ไม่พร้อมใช้งานหรือหมดอายุ กรุณาขอลิงก์ใหม่</p>}
      <label>อีเมล<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy}>ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setForgot(false); setRecovery(false); setNotice(''); history.replaceState(null, '', location.pathname) }}>กลับเข้าสู่ระบบ</button>
    </form> : <form className="card" onSubmit={login}>
      <label>อีเมล<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setForgot(true); setPassword(''); setNotice('') }}>ลืมรหัสผ่าน</button>
      <small>เฉพาะบัญชีเจ้าของที่ตั้งไว้ ไม่มีการเปิดรับสมัคร</small>
    </form>}
    <p role="status" className="notice">{notice}</p>
  </main>
}

function Items({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [notice, setNotice] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null)
  const [reload, setReload] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setAllowed(false); setItems([])
    async function load() {
      try {
        const owner = await supabase.from('app_owner').select('user_id').eq('user_id', userId).maybeSingle()
        if (owner.error) throw owner.error
        if (!owner.data) { if (active) setNotice('บัญชีนี้ไม่มีสิทธิ์ใช้งาน'); return }
        const result = await supabase.from('poc_items').select(columns).order('created_at', { ascending: false }).limit(200)
        if (result.error) throw result.error
        if (active) { setItems(result.data); setAllowed(true); setNotice('') }
      } catch { if (active) setNotice('โหลดข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [userId, reload])
  useEffect(() => {
    if (pendingDelete) dialog.current?.showModal()
    else dialog.current?.close()
  }, [pendingDelete])
  function reset() { setDescription(''); setAmount(''); setEditing(null); setNotice('') }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current || !allowed) return
    const clean = description.trim(), value = amount.trim()
    // POC cap avoids unsafe large decimal numbers. Full ledger needs decimal transport.
    if (!clean || clean.length > 200 || !/^\d{1,9}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      setNotice('กรอกรายละเอียด และจำนวนเงินมากกว่า 0 สูงสุด 999,999,999.99 ทศนิยมไม่เกิน 2 ตำแหน่ง (ไม่ใส่ comma)'); return
    }
    lock.current = true; setBusy(true)
    try {
      const query = editing
        ? supabase.from('poc_items').update({ description: clean, amount: value }).eq('id', editing.id).eq('description', editing.description).eq('amount', editing.amount)
        : supabase.from('poc_items').insert({ id: crypto.randomUUID(), owner_id: userId, description: clean, amount: value })
      const { data, error } = await query.select(columns).single()
      if (error) throw error
      setItems(current => editing ? current.map(row => row.id === data.id ? data : row) : [data, ...current])
      reset(); setNotice('บันทึกลงฐานข้อมูลแล้ว')
    } catch { setNotice('ยังยืนยันการบันทึกไม่ได้ อาจมีการแก้ไขจากอีกหน้า กรุณาโหลดข้อมูลใหม่ก่อนลองซ้ำ') }
    finally { lock.current = false; setBusy(false) }
  }
  async function remove() {
    if (!pendingDelete || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const { data, error } = await supabase.from('poc_items').delete().eq('id', pendingDelete.id).eq('description', pendingDelete.description).eq('amount', pendingDelete.amount).select('id').single()
      if (error) throw error
      setItems(current => current.filter(row => row.id !== data.id))
      if (editing?.id === data.id) reset()
      setNotice('ลบรายการทดสอบแล้ว'); setPendingDelete(null)
    } catch { setNotice('ยังยืนยันการลบไม่ได้ กรุณาโหลดข้อมูลใหม่เพื่อตรวจสอบ'); setPendingDelete(null) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>
    <p role="status" className="notice">{loading ? 'กำลังโหลดข้อมูล…' : notice}</p>
    <button className="secondary" disabled={loading || busy} onClick={() => { reset(); setReload(n => n + 1) }}>โหลดข้อมูลใหม่</button>
    {allowed && <>
      <form className="card" onSubmit={save}><fieldset disabled={busy}>
        <legend>{editing ? 'แก้ไขรายการทดสอบ' : 'เพิ่มรายการทดสอบ'}</legend>
        <label>รายละเอียด<input required maxLength={200} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label>จำนวนเงิน<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="เช่น 125.50" /></label>
        <div className="actions"><button>{busy ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}</button>
          {editing && <button type="button" className="secondary" onClick={reset}>ยกเลิกแก้ไข</button>}</div>
      </fieldset></form>
      <Attachments userId={userId} />
      <SystemCheck userId={userId} />
      <section className="card" aria-label="รายการที่บันทึก"><h2>รายการที่บันทึก ({items.length})</h2>
        <small>แสดงสูงสุด 200 รายการล่าสุด · รีเฟรชหน้าแล้วข้อมูลยังอยู่</small>
        {!items.length ? <p className="empty">ยังไม่มีรายการทดสอบ</p> : <ul>{items.map(item => <li key={item.id}>
          <span><strong>{item.description}</strong><small>{item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</small></span>
          <span className="row-actions"><button disabled={busy} className="secondary" onClick={() => { setNotice(''); setEditing(item); setDescription(item.description); setAmount(String(item.amount)) }}>แก้ไข</button>
            <button disabled={busy} className="danger" onClick={() => setPendingDelete(item)}>ลบ</button></span>
        </li>)}</ul>}
      </section>
    </>}
    <dialog ref={dialog} className="dialog" aria-labelledby="delete-title" onCancel={e => { if (busy) e.preventDefault(); else setPendingDelete(null) }}>
      <h2 id="delete-title">ลบรายการทดสอบนี้?</h2><p>{pendingDelete?.description}</p><p>รายการนี้จะถูกลบจากฐานข้อมูล POC</p>
      <div className="actions"><button autoFocus className="secondary" disabled={busy} onClick={() => setPendingDelete(null)}>ยกเลิก</button>
        <button className="danger" disabled={busy} onClick={remove}>{busy ? 'กำลังลบ…' : 'ยืนยันลบ'}</button></div>
    </dialog>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
