import { useEffect, useState } from 'react'
import { api } from '../api'
import { showAlert } from '../tg'
import ProductForm from './ProductForm'
import Cropper from './Cropper'

const STATUS = { new: 'новый', confirmed: 'подтверждён', done: 'выдан', canceled: 'отменён' }

export default function Admin({ categories, products, onChange }) {
  const [section, setSection] = useState('products')
  const [editing, setEditing] = useState(null)   // товар или {} для нового

  return (
    <>
      <div className="chips">
        {[['products', 'Товары'], ['orders', 'Заказы'], ['categories', 'Разделы'],
          ['banners', 'Баннеры'], ['promos', 'Промокоды']].map(([key, label]) => (
          <button key={key} className={section === key ? 'chip active' : 'chip'} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {section === 'products' && (
        <>
          {categories.length === 0
            ? <p className="muted center">Сначала заведите раздел во вкладке «Разделы»: товар вне раздела в витрину не попадёт.</p>
            : <button className="primary" onClick={() => setEditing({})}>+ Добавить товар</button>}
          <ul className="admin-list">
            {products.map((p) => (
              <li key={p.id}>
                {p.photo_url ? <img src={p.photo_url} alt="" /> : <div className="no-photo small-thumb">—</div>}
                <div className="cart-info">
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {p.price} ₽ · остаток {p.stock}{!p.is_active && ' · скрыт'}
                  </span>
                </div>
                <button className="ghost" onClick={() => setEditing(p)}>Изменить</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {section === 'orders' && <Orders />}
      {section === 'categories' && <Categories categories={categories} onChange={onChange} />}
      {section === 'banners' && <Banners onChange={onChange} />}
      {section === 'promos' && <Promos />}

      {editing && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange() }}
        />
      )}
    </>
  )
}

function Orders() {
  const [orders, setOrders] = useState([])

  const load = () => api.orders().then(setOrders).catch((e) => showAlert(e.message))
  useEffect(() => { load() }, [])

  const change = async (id, status) => {
    try {
      await api.setOrderStatus(id, status)
      load()
    } catch (e) {
      showAlert(e.message)
    }
  }

  if (orders.length === 0) return <p className="muted center">Заказов пока нет</p>

  return (
    <ul className="admin-list orders">
      {orders.map((o) => (
        <li key={o.id} className="order">
          <div className="order-head">
            <strong>№{o.id}</strong>
            <span className={`status ${o.status}`}>{STATUS[o.status]}</span>
          </div>
          <p className="muted small">
            {o.customer_name}{o.username && ` · @${o.username}`} · id {o.tg_user_id}
          </p>
          {(o.phone || o.address || o.comment) && (
            <p className="small delivery-info">
              {o.phone && <>{o.phone}<br /></>}
              {o.address && <>{o.address}<br /></>}
              {o.comment && <span className="muted">{o.comment}</span>}
            </p>
          )}
          <ul className="order-items">
            {o.items.map((i, idx) => <li key={idx}>{i.name} — {i.qty} × {i.price} ₽</li>)}
          </ul>
          <div className="order-foot">
            <strong>{o.total} ₽</strong>
            <div className="order-actions">
              {o.username && <a className="ghost" href={`https://t.me/${o.username}`} target="_blank" rel="noreferrer">Написать</a>}
              {o.status !== 'confirmed' && o.status !== 'done' && (
                <button className="ghost" onClick={() => change(o.id, 'confirmed')}>Подтвердить</button>
              )}
              {o.status !== 'done' && <button className="ghost" onClick={() => change(o.id, 'done')}>Выдан</button>}
              {o.status !== 'canceled' && <button className="ghost danger" onClick={() => change(o.id, 'canceled')}>Отменить</button>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Categories({ categories, onChange }) {
  const [name, setName] = useState('')
  const [cropping, setCropping] = useState(null)   // { file, id } — заставка ждёт обрезки
  const [busy, setBusy] = useState(0)              // id раздела, чья заставка грузится

  const add = async () => {
    if (!name.trim()) return
    try {
      await api.createCategory({ name: name.trim(), sort: categories.length })
      setName('')
      onChange()
    } catch (e) {
      showAlert(e.message)
    }
  }

  const remove = async (id) => {
    try {
      await api.deleteCategory(id)
      onChange()
    } catch (e) {
      showAlert(e.message)
    }
  }

  const pick = (id) => (e) => {
    const file = e.target.files?.[0]
    if (file) setCropping({ file, id })
    e.target.value = ''
  }

  const saveCover = async (file) => {
    const { id } = cropping
    setCropping(null)
    setBusy(id)
    try {
      const { url } = await api.upload(file)
      await api.updateCategory(id, { photo_url: url })
      onChange()
    } catch (e) {
      showAlert(e.message)
    } finally {
      setBusy(0)
    }
  }

  const dropCover = async (id) => {
    setBusy(id)
    try {
      await api.updateCategory(id, { photo_url: '' })
      onChange()
    } catch (e) {
      showAlert(e.message)
    } finally {
      setBusy(0)
    }
  }

  return (
    <>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новый раздел" />
        <button className="primary narrow" onClick={add}>Добавить</button>
      </div>
      <ul className="admin-list">
        {categories.map((c) => (
          <li key={c.id} className="cat-row">
            <div className="cat-head">
              {c.photo_url
                ? <img src={c.photo_url} alt="" />
                : <div className="no-photo">—</div>}
              <div className="cart-info">
                <strong>{c.name}</strong>
                {!c.photo_url && <span className="muted small">без заставки</span>}
              </div>
            </div>
            <div className="cat-actions">
              <label className="ghost pick">
                {busy === c.id ? '…' : c.photo_url ? 'Заменить заставку' : 'Поставить заставку'}
                <input type="file" accept="image/*" disabled={!!busy} onChange={pick(c.id)} hidden />
              </label>
              {c.photo_url && (
                <button className="ghost" disabled={!!busy} onClick={() => dropCover(c.id)}>Убрать</button>
              )}
              <button className="ghost danger" onClick={() => remove(c.id)}>Удалить</button>
            </div>
          </li>
        ))}
      </ul>

      {/* 4:3 — ровно то, чем плитка показывается на главной. */}
      {cropping && (
        <Cropper file={cropping.file} aspect={4 / 3} outWidth={900}
          onCancel={() => setCropping(null)} onDone={saveCover} />
      )}
    </>
  )
}

/** Реклама на главной: широкие картинки, порядок — по полю sort. */
function Banners({ onChange }) {
  const [list, setList] = useState([])
  const [cropping, setCropping] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.banners().then(setList).catch((e) => showAlert(e.message))
  useEffect(() => { load() }, [])

  const pick = (e) => {
    const file = e.target.files?.[0]
    if (file) setCropping(file)
    e.target.value = ''
  }

  const add = async (file) => {
    setCropping(null)
    setBusy(true)
    try {
      const { url } = await api.upload(file)
      await api.createBanner({ photo_url: url, sort: list.length })
      load()
      onChange()
    } catch (e) {
      showAlert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await api.deleteBanner(id)
      load()
      onChange()
    } catch (e) {
      showAlert(e.message)
    }
  }

  return (
    <>
      <label className="ghost pick">
        {busy ? 'Загружаем…' : '+ Добавить баннер'}
        <input type="file" accept="image/*" disabled={busy} onChange={pick} hidden />
      </label>

      {list.length === 0 && <p className="muted center">Баннеров пока нет</p>}

      <ul className="admin-list">
        {list.map((b) => (
          <li key={b.id} className="banner-row">
            <img src={b.photo_url} alt="" />
            <button className="ghost danger" onClick={() => remove(b.id)}>Удалить</button>
          </li>
        ))}
      </ul>

      {cropping && (
        <Cropper file={cropping} aspect={3} outWidth={1500}
          onCancel={() => setCropping(null)} onDone={add} />
      )}
    </>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

function Promos() {
  const [list, setList] = useState([])
  const [form, setForm] = useState({
    code: '', kind: 'percent', value: 10, starts_at: today(), ends_at: inDays(30), max_uses: 0,
  })
  const [busy, setBusy] = useState(false)

  const load = () => api.promos().then(setList).catch((e) => showAlert(e.message))
  useEffect(() => { load() }, [])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const add = async () => {
    setBusy(true)
    try {
      await api.createPromo({ ...form, value: Number(form.value), max_uses: Number(form.max_uses) || 0 })
      setForm((f) => ({ ...f, code: '' }))
      load()
    } catch (e) {
      showAlert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await api.deletePromo(id)
      load()
    } catch (e) {
      showAlert(e.message)
    }
  }

  const expired = (p) => p.ends_at < today()

  return (
    <>
      <label>Код<input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LETO10" /></label>
      <div className="row">
        <label>
          Тип
          <select value={form.kind} onChange={set('kind')}>
            <option value="percent">процент</option>
            <option value="amount">рубли</option>
          </select>
        </label>
        <label>
          {form.kind === 'percent' ? 'Скидка, %' : 'Скидка, ₽'}
          <input type="number" inputMode="numeric" value={form.value} onChange={set('value')} />
        </label>
      </div>
      <div className="row">
        <label>С<input type="date" value={form.starts_at} onChange={set('starts_at')} /></label>
        <label>По<input type="date" value={form.ends_at} onChange={set('ends_at')} /></label>
      </div>
      <label>
        Лимит применений <span className="muted">(0 — без ограничения)</span>
        <input type="number" inputMode="numeric" min="0" value={form.max_uses} onChange={set('max_uses')} />
      </label>
      <button className="primary" disabled={busy} onClick={add}>{busy ? '…' : 'Создать код'}</button>

      {list.length === 0 && <p className="muted center">Промокодов пока нет</p>}

      <ul className="admin-list">
        {list.map((p) => (
          <li key={p.id}>
            <div className="cart-info">
              <strong>{p.code}</strong>
              <span className="muted small">
                {p.kind === 'percent' ? `${p.value}%` : `${p.value} ₽`} · {p.starts_at} — {p.ends_at}
                {p.max_uses > 0
                  ? ` · использован ${p.used_count} из ${p.max_uses}`
                  : p.used_count > 0 && ` · использован ${p.used_count} раз`}
                {expired(p) && ' · истёк'}
                {p.max_uses > 0 && p.used_count >= p.max_uses && ' · лимит выбран'}
              </span>
            </div>
            <button className="ghost danger" onClick={() => remove(p.id)}>Удалить</button>
          </li>
        ))}
      </ul>
    </>
  )
}
