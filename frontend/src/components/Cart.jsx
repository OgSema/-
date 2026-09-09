import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { haptic, openChat, showAlert } from '../tg'

const EMPTY_DELIVERY = { name: '', comment: '' }

const SWIPE_OUT = 0.45   // доля ширины строки: дальше свайп считается полным
const SWIPE_START = 8    // px: пока меньше, жест ещё может оказаться прокруткой
const FLY_OUT = 260      // мс: столько строка уезжает за край и схлопывается

/**
 * Строка корзины со свайпом влево. Пока палец идёт, строка едет за ним и
 * наливается красным — по цвету видно, отпустишь сейчас или ещё рано.
 * Полный свайп убирает товар: кнопка «−» до нуля осталась для тех, кто
 * про жест не знает.
 */
function CartRow({ product, qty, onQty }) {
  const row = useRef(null)
  const drag = useRef(null)
  const frame = useRef(0)
  const [swiping, setSwiping] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Сдвиг пишем прямо в узел и не чаще кадра. Через состояние React строка
  // перерисовывалась бы на каждое движение пальца — вот откуда дёрганость.
  const paint = () => {
    frame.current = 0
    const d = drag.current
    if (!d || !row.current) return
    row.current.style.setProperty('--swipe', `${d.dx}px`)
    row.current.style.setProperty('--kill', String(Math.min(1, -d.dx / (d.width * SWIPE_OUT))))
  }

  const start = (e) => {
    if (gone) return
    drag.current = {
      x: e.clientX, y: e.clientY, dx: 0,
      width: row.current.offsetWidth, active: false, passed: false,
    }
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const moved = e.clientX - d.x

    if (!d.active) {
      // Пока не ясно, куда ведут палец, не мешаем списку прокручиваться:
      // жест наш, только если он заметно горизонтальный и именно влево.
      if (moved > -SWIPE_START || Math.abs(moved) <= Math.abs(e.clientY - d.y)) return
      d.active = true
      setSwiping(true)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }

    d.dx = Math.max(-d.width, Math.min(0, moved))
    // Отдача на границе: по ней понятно, что можно отпускать.
    const passed = -d.dx >= d.width * SWIPE_OUT
    if (passed !== d.passed) {
      d.passed = passed
      haptic()
    }
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return

    const el = row.current
    setSwiping(false)   // вернуть строке плавность: дальше она едет сама

    if (!d.passed) {
      el.style.setProperty('--swipe', '0px')
      el.style.setProperty('--kill', '0')
      return
    }

    haptic('medium')
    // Высоту фиксируем числом и сразу заставляем браузер её посчитать: от auto
    // строка не схлопнулась бы, и список дёргался бы вверх рывком в тот
    // момент, когда товар уходит из корзины.
    el.style.setProperty('--h', `${el.offsetHeight}px`)
    el.getBoundingClientRect()
    setGone(true)
    setTimeout(() => onQty(product.id, 0), FLY_OUT)
  }

  return (
    <li
      ref={row}
      className={`cart-row${swiping ? ' swiping' : ''}${gone ? ' gone' : ''}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
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
  )
}

/** Имя не меняется от заказа к заказу — незачем набирать его каждый раз. */
const savedDelivery = (user) => {
  try {
    const saved = JSON.parse(localStorage.getItem('delivery') || '{}')
    return { ...EMPTY_DELIVERY, name: saved.name || user?.name || '' }
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
      const order = await api.createOrder(items(), promo?.code || '', delivery)
      try {
        localStorage.setItem('delivery', JSON.stringify({ name: delivery.name }))
      } catch { /* приватный режим — просто не запомним */ }
      haptic('medium')
      // Бот не вправе писать первым тому, кто ни разу ему не написал: в магазин
      // можно зайти с иконки или из профиля, минуя чат. Тогда подтверждение
      // ждёт в очереди, а покупателя отправляем нажать «Старт».
      if (order.customer_notified) {
        showAlert('Заказ отправлен. Подробности — в чате с ботом.')
      } else {
        showAlert(
          'Заказ принят, админ его уже видит.\n\nЧтобы получать подтверждение и статус, ' +
            'откройте чат с ботом и нажмите «Старт» — подтверждение придёт сразу.',
          () => openChat(user?.bot_username),
        )
      }
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
          <CartRow key={product.id} product={product} qty={qty} onQty={onQty} />
        ))}
      </ul>
      <p className="muted small swipe-hint">Смахните товар влево, чтобы убрать</p>

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
        <h3>Ваши данные</h3>
        <label>Имя<input value={delivery.name} onChange={set('name')} placeholder="Как к вам обращаться" /></label>
        <label>
          Комментарий <span className="muted">(необязательно)</span>
          <textarea rows="2" value={delivery.comment} onChange={set('comment')} placeholder="Пожелания к заказу" />
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
