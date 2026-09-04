import { useEffect, useState } from 'react'
import { api } from '../api'
import { showAlert } from '../tg'
import ProductForm from './ProductForm'

const STATUS = { new: 'новый', confirmed: 'подтверждён', done: 'выдан', canceled: 'отменён' }

export default function Admin({ categories, products, onChange }) {
  const [section, setSection] = useState('products')
  const [editing, setEditing] = useState(null)   // товар или {} для нового

  return (
    <>
      <div className="chips">
        {[['products', 'Товары'], ['orders', 'Заказы'], ['categories', 'Категории']].map(([key, label]) => (
          <button key={key} className={section === key ? 'chip active' : 'chip'} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {section === 'products' && (
        <>
          <button className="primary" onClick={() => setEditing({})}>+ Добавить товар</button>
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

  return (
    <>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая категория" />
        <button className="primary narrow" onClick={add}>Добавить</button>
      </div>
      <ul className="admin-list">
        {categories.map((c) => (
          <li key={c.id}>
            <div className="cart-info"><strong>{c.name}</strong></div>
            <button className="ghost danger" onClick={() => remove(c.id)}>Удалить</button>
          </li>
        ))}
      </ul>
    </>
  )
}
