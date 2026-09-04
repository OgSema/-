import { useState } from 'react'
import { api } from '../api'
import { haptic, showAlert } from '../tg'

export default function Cart({ cart, products, onQty, onDone }) {
  const [sending, setSending] = useState(false)

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === Number(id)), qty }))
    .filter((l) => l.product)

  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)

  const submit = async () => {
    if (sending || lines.length === 0) return
    setSending(true)
    try {
      await api.createOrder(lines.map((l) => ({ product_id: l.product.id, qty: l.qty })))
      haptic('medium')
      showAlert('Заказ отправлен. Подробности — в чате с ботом.')
      onDone()
    } catch (e) {
      showAlert(e.message)
    } finally {
      setSending(false)
    }
  }

  if (lines.length === 0) return <p className="muted center">Корзина пуста</p>

  return (
    <>
      <ul className="cart">
        {lines.map(({ product, qty }) => (
          <li key={product.id}>
            <div className="cart-info">
              <strong>{product.name}</strong>
              <span className="muted small">{product.price} ₽ × {qty} = {product.price * qty} ₽</span>
            </div>
            <div className="stepper">
              <button onClick={() => onQty(product.id, qty - 1)}>−</button>
              <span>{qty}</span>
              <button disabled={qty >= product.stock} onClick={() => onQty(product.id, qty + 1)}>+</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="total">
        <span>Итого</span>
        <strong>{total} ₽</strong>
      </div>

      <button className="primary sticky" disabled={sending} onClick={submit}>
        {sending ? 'Отправляем…' : `Заказать · ${total} ₽`}
      </button>
    </>
  )
}
