import { useState } from 'react'
import { api } from '../api'
import { haptic, showAlert } from '../tg'

const EMPTY_DELIVERY = { name: '', phone: '', address: '', comment: '' }

/** Контакты не меняются от заказа к заказу — незачем набирать их каждый раз. */
const savedDelivery = (user) => {
  try {
    return { ...EMPTY_DELIVERY, name: user?.name || '', ...JSON.parse(localStorage.getItem('delivery') || '{}') }
  } catch {
    return { ...EMPTY_DELIVERY, name: user?.name || '' }
  }
}

export default function Cart({ cart, products, user, tier, onQty, onDone }) {
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState('')
  const [promo, setPromo] = useState(null)      // подтверждённый сервером код
  const [checking, setChecking] = useState(false)
  const [delivery, setDelivery] = useState(() => savedDelivery(user))

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === Number(id)), qty }))
    .filter((l) => l.product)

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  // Повторяем формулы сервера, чтобы цифры не устаревали при смене количества.
  // Решающий расчёт всё равно на сервере — клиент присылает только код.
  const byTier = tier ? Math.floor((subtotal * tier.percent) / 100) : 0
  const byPromo = !promo
    ? 0
    : promo.kind === 'percent'
      ? Math.floor((subtotal * promo.value) / 100)
      : Math.min(promo.value, subtotal)
  // Скидки не складываются: побеждает большая, при равенстве — уровень.
  const promoWins = byPromo > byTier
  const discount = Math.max(byTier, byPromo)
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

  const set = (field) => (e) => setDelivery((d) => ({ ...d, [field]: e.target.value }))

  const submit = async () => {
    if (sending || lines.length === 0) return
    setSending(true)
    try {
      await api.createOrder(items(), promo?.code || '', delivery)
      try {
        localStorage.setItem('delivery', JSON.stringify(delivery))
      } catch { /* приватный режим — просто не запомним */ }
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

      {tier && (
        <p className="promo-ok small">
          Уровень <span className={`tier tier-${tier.name.toLowerCase()}`}>{tier.name}</span>
          {' '}— скидка {tier.percent}%{promoWins ? ' (по коду выгоднее)' : `: −${byTier} ₽`}
        </p>
      )}

      {promo && (
        <p className={promoWins ? 'promo-ok small' : 'muted small'}>
          Код {promo.code}: −{byPromo} ₽
          {promo.kind === 'percent' && ` (${promo.value}%)`}
          {promo.left !== null && promo.left !== undefined && ` · осталось применений: ${promo.left}`}
          {!promoWins && ' — скидка уровня выгоднее, код останется у вас'}
        </p>
      )}

      <section className="delivery">
        <h3>Доставка</h3>
        <label>Имя<input value={delivery.name} onChange={set('name')} placeholder="Как к вам обращаться" /></label>
        <label>
          Телефон или контакт
          <input type="tel" inputMode="tel" value={delivery.phone} onChange={set('phone')} placeholder="+7 999 123-45-67" />
        </label>
        <label>Адрес<input value={delivery.address} onChange={set('address')} placeholder="Улица, дом, квартира" /></label>
        <label>
          Комментарий
          <textarea rows="2" value={delivery.comment} onChange={set('comment')} placeholder="Домофон, время, пожелания" />
        </label>
      </section>

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
