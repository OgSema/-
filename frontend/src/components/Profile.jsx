import { useEffect, useState } from 'react'
import { api } from '../api'
import { showAlert } from '../tg'

const STATUS = { new: 'новый', confirmed: 'подтверждён', done: 'выдан', canceled: 'отменён' }
const money = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`

/** Овал уровня: цвет, заливка и свечение задаются классом tier-<name>. */
const Badge = ({ name, locked }) => (
  <span className={`tier tier-${name.toLowerCase()}${locked ? ' locked' : ''}`}>{name}</span>
)

export default function Profile() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.profile().then(setData).catch((e) => showAlert(e.message))
  }, [])

  if (!data) return <div className="screen"><div className="spinner" /></div>

  const { spent, tier, next, progress, left, tiers, orders } = data

  return (
    <>
      <section className="loyalty">
        <div className="loyalty-head">
          {tier ? <Badge name={tier.name} /> : <span className="tier tier-basic">BASIC</span>}
          <span className="tier-percent">{tier ? `${tier.percent}%` : '0%'}</span>
        </div>

        <p className="muted small">Выкуплено на {money(spent)}</p>

        <div className="tier-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>

        <p className="small">
          {next
            ? <>До уровня <Badge name={next.name} locked /> осталось {money(left)}</>
            : 'Максимальный уровень — скидка 25% на всё'}
        </p>
      </section>

      <ul className="tier-list">
        {tiers.map((t) => {
          const done = spent >= t.from
          const fill = done ? 1 : Math.min(1, spent / t.from)
          return (
            <li key={t.name}>
              <div className="tier-row">
                <Badge name={t.name} locked={!done} />
                <span className="tier-percent small">−{t.percent}%</span>
                <span className="muted small">от {money(t.from)}</span>
              </div>
              <div className="tier-bar small-bar">
                <span className={done ? 'done' : ''} style={{ width: `${Math.round(fill * 100)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="muted small">
        Скидка уровня действует всегда и не складывается с промокодами: при заказе
        применяется то, что выгоднее. Уровень растёт после подтверждения заказа.
      </p>

      <h3 className="history-title">История заказов</h3>
      {orders.length === 0 && <p className="muted center">Заказов пока нет</p>}

      <ul className="admin-list orders">
        {orders.map((o) => (
          <li key={o.id} className="order">
            <div className="order-head">
              <strong>№{o.id}</strong>
              <span className={`status ${o.status}`}>{STATUS[o.status]}</span>
            </div>
            <p className="muted small">{o.created_at?.slice(0, 10)}</p>
            <ul className="order-items">
              {o.items.map((i, idx) => <li key={idx}>{i.name} — {i.qty} × {money(i.price)}</li>)}
            </ul>
            <div className="order-foot">
              <strong>{money(o.total)}</strong>
              {o.discount > 0 && (
                <span className="muted small">
                  скидка {money(o.discount)} · {o.promo_code || o.loyalty_tier}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
