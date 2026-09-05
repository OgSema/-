import { useState } from 'react'
import { api } from '../api'
import { haptic, showAlert } from '../tg'

export default function Cart({ cart, products, onQty, onDone }) {
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState('')
  const [promo, setPromo] = useState(null)      // подтверждённый сервером код
  const [checking, setChecking] = useState(false)

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === Number(id)), qty }))
    .filter((l) => l.product)

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  // Повторяем формулу сервера, чтобы цифра не устаревала при смене количества.
  // Решающий расчёт всё равно на сервере — клиент присылает только код.
  const discount = !promo
    ? 0
    : promo.kind === 'percent'
      ? Math.floor((subtotal * promo.value) / 100)
      : Math.min(promo.value, subtotal)
  const total = subtotal - discount

  const items = () => lines.map((l) => ({ product_id: l.product.id, qty: l.qty }))

  const apply = async () => {
    const clean = code.trim()
    if (!clean || checking) return
    setChecking(true)
    try {
      setPromo(await api.checkPromo(clean, items()))
      haptic()
    } catch (e) {
      setPromo(null)
      showAlert(e.message)
    } finally {
      setChecking(false)
    }
  }

  const drop = () => { setPromo(null); setCode('') }

  const submit = async () => {
    if (sending || lines.length === 0) return
    setSending(true)
    try {
      await api.createOrder(items(), promo?.code || '')
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

      <div className="promo">
        <input
          placeholder="Промокод"
          value={code}
          disabled={!!promo}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        {promo
          ? <button className="ghost" onClick={drop}>Убрать</button>
          : <button className="ghost" disabled={checking} onClick={apply}>{checking ? '…' : 'Применить'}</button>}
      </div>

      {promo && (
        <p className="promo-ok small">
          Код {promo.code} применён: −{discount} ₽
          {promo.kind === 'percent' && ` (${promo.value}%)`}
        </p>
      )}

      <div className="total">
        <span>Итого</span>
        <strong>
          {discount > 0 && <s className="muted">{subtotal} ₽</s>} {total} ₽
        </strong>
      </div>

      <button className="primary sticky" disabled={sending} onClick={submit}>
        {sending ? 'Отправляем…' : `Заказать · ${total} ₽`}
      </button>
    </>
  )
}
