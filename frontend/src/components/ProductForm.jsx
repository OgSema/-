import { useState } from 'react'
import { api } from '../api'
import { showAlert } from '../tg'

const EMPTY = {
  name: '', brand: '', flavor: '', weight: '', price: 0,
  description: '', photo_url: '', stock: 0, is_active: true, category_id: null,
}

export default function ProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...product })
  const [busy, setBusy] = useState(false)

  const set = (field) => (e) => {
    const el = e.target
    const value = el.type === 'checkbox' ? el.checked : el.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const { url } = await api.upload(file)
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!form.name.trim()) return showAlert('Укажите название')
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand,
        flavor: form.flavor,
        weight: form.weight,
        description: form.description,
        photo_url: form.photo_url,
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
        is_active: !!form.is_active,
        category_id: form.category_id ? Number(form.category_id) : null,
      }
      if (form.id) await api.updateProduct(form.id, payload)
      else await api.createProduct(payload)
      onSaved()
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteProduct(form.id)
      onSaved()
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{form.id ? 'Редактирование' : 'Новый товар'}</h2>

        <label>Название<input value={form.name} onChange={set('name')} placeholder="Darkside Supernova" /></label>
        <div className="row">
          <label>Цена, ₽<input type="number" inputMode="numeric" value={form.price} onChange={set('price')} /></label>
          <label>Остаток<input type="number" inputMode="numeric" value={form.stock} onChange={set('stock')} /></label>
        </div>
        <div className="row">
          <label>Бренд<input value={form.brand} onChange={set('brand')} placeholder="Darkside" /></label>
          <label>Фасовка<input value={form.weight} onChange={set('weight')} placeholder="100 г" /></label>
        </div>
        <label>Вкус<input value={form.flavor} onChange={set('flavor')} placeholder="Supernova" /></label>
        <label>
          Категория
          <select value={form.category_id ?? ''} onChange={set('category_id')}>
            <option value="">без категории</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Описание<textarea rows="2" value={form.description} onChange={set('description')} /></label>

        <label className="photo">
          Фото
          <input type="file" accept="image/*" onChange={uploadPhoto} />
        </label>
        {form.photo_url && <img className="preview" src={form.photo_url} alt="" />}

        <label className="checkbox">
          <input type="checkbox" checked={!!form.is_active} onChange={set('is_active')} />
          Показывать в каталоге
        </label>

        <div className="sheet-actions">
          <button className="ghost" onClick={onClose}>Отмена</button>
          {form.id && <button className="ghost danger" disabled={busy} onClick={remove}>Удалить</button>}
          <button className="primary narrow" disabled={busy} onClick={save}>
            {busy ? '…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
