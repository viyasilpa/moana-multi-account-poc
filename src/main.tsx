import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type MockTransaction = {
  id: string
  description: string
  amount: string
}

function App() {
  const [items, setItems] = useState<MockTransaction[]>([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  function resetForm() {
    setDescription('')
    setAmount('')
    setEditingId(null)
  }

  function save() {
    const cleanDescription = description.trim()
    const cleanAmount = amount.trim()
    if (!cleanDescription || !cleanAmount) {
      setNotice('กรอกรายละเอียดและจำนวนเงินก่อนบันทึก')
      return
    }

    if (editingId) {
      setItems((current) => current.map((item) => item.id === editingId ? { ...item, description: cleanDescription, amount: cleanAmount } : item))
      setNotice('แก้ไขรายการจำลองแล้ว')
    } else {
      setItems((current) => [...current, { id: crypto.randomUUID(), description: cleanDescription, amount: cleanAmount }])
      setNotice('เพิ่มรายการจำลองแล้ว')
    }
    resetForm()
  }

  function edit(item: MockTransaction) {
    setDescription(item.description)
    setAmount(item.amount)
    setEditingId(item.id)
    setNotice('กำลังแก้ไขรายการ')
  }

  function confirmDelete() {
    if (!pendingDelete) return
    setItems((current) => current.filter((item) => item.id !== pendingDelete))
    setPendingDelete(null)
    setNotice('ลบรายการจำลองแล้ว')
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Technical POC · Not production</p>
        <h1>รายการจำลอง</h1>
        <p>พิสูจน์วงจร Add → Edit → Delete พร้อมยืนยันการลบ</p>
      </header>

      <section className="card" aria-label="แบบฟอร์มรายการจำลอง">
        <label>
          รายละเอียด
          <input aria-label="รายละเอียด" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น ค่าแม่บ้าน" />
        </label>
        <label>
          จำนวนเงิน
          <input aria-label="จำนวนเงิน" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1,500" />
        </label>
        <div className="actions">
          <button type="button" onClick={save}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}</button>
          {editingId && <button type="button" className="secondary" onClick={resetForm}>ยกเลิกแก้ไข</button>}
        </div>
        <p aria-live="polite" className="notice">{notice}</p>
      </section>

      <section className="card" aria-label="รายการที่บันทึก">
        <h2>รายการที่บันทึก ({items.length})</h2>
        {items.length === 0 ? <p className="empty">ยังไม่มีรายการจำลอง</p> : (
          <ul>
            {items.map((item) => <li key={item.id}>
              <span><strong>{item.description}</strong><small>{item.amount} บาท</small></span>
              <span className="row-actions">
                <button type="button" className="secondary" onClick={() => edit(item)}>แก้ไข</button>
                <button type="button" className="danger" onClick={() => setPendingDelete(item.id)}>ลบ</button>
              </span>
            </li>)}
          </ul>
        )}
      </section>

      {pendingDelete && <div className="dialog-backdrop" role="presentation">
        <section className="dialog" role="dialog" aria-modal="true" aria-label="ยืนยันการลบ">
          <h2>ลบรายการนี้?</h2>
          <p>การทดสอบนี้จะลบจากรายการจำลองเท่านั้น</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setPendingDelete(null)}>ยกเลิก</button>
            <button type="button" className="danger" onClick={confirmDelete}>ยืนยันลบ</button>
          </div>
        </section>
      </div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
