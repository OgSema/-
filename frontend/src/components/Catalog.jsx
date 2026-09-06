import { useEffect, useMemo, useState } from 'react'
import { haptic } from '../tg'
import Product from './Product'

const plural = (n, forms) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2]

/**
 * Витрина. Первый экран — лицо магазина: реклама и разделы, а не весь товар
 * подряд. Товары показываются внутри выбранного раздела; общий список остаётся
 * только у поиска, чтобы искомое находилось не глядя на разделы.
 */
const SHOW = 4500   // сколько баннер висит перед сменой

/** Реклама сменяется сама: полоса стоит на месте, картинки перетекают друг в друга. */
function Banners({ items }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (items.length < 2) return
    const timer = setInterval(() => setShown((n) => (n + 1) % items.length), SHOW)
    return () => clearInterval(timer)
  }, [items.length])

  return (
    <div className="banners">
      {items.map((b, i) => (
        <img
          key={b.id}
          className={i === shown ? 'banner shown' : 'banner'}
          src={b.photo_url}
          alt=""
        />
      ))}
    </div>
  )
}

export default function Catalog({ products, categories, banners = [], cart, onAdd }) {
  const [categoryId, setCategoryId] = useState(null)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState(null)   // товар, открытый по кнопке «!»

  const q = query.trim().toLowerCase()

  const visible = useMemo(() => {
    if (q) return products.filter((p) => `${p.name} ${p.flavor}`.toLowerCase().includes(q))
    return categoryId ? products.filter((p) => p.category_id === categoryId) : []
  }, [products, categoryId, q])

  // Пустые разделы на главной не показываем: тыкать в них не за чем.
  const sections = useMemo(
    () => categories
      .map((c) => ({ ...c, items: products.filter((p) => p.category_id === c.id) }))
      .filter((c) => c.items.length > 0),
    [categories, products],
  )

  const current = categories.find((c) => c.id === categoryId)
  const home = !q && !categoryId

  const grid = (items) => (
    <div className="grid">
      {items.map((p) => (
        <article key={p.id} className="card">
          <button className="info" aria-label="Подробнее" onClick={() => setDetail(p)}>!</button>
          {p.photo_url ? (
            <img src={p.photo_url} alt={p.name} loading="lazy" />
          ) : (
            <div className="no-photo">нет фото</div>
          )}
          <div className="card-body">
            <h3>{p.name}</h3>
            {p.flavor && <p className="muted small">{p.flavor}</p>}
            <div className="card-bottom">
              <span className="price">{p.price} ₽</span>
              <button
                className="add"
                disabled={(cart[p.id] || 0) >= p.stock}
                onClick={() => { haptic(); onAdd(p) }}
              >
                {cart[p.id] ? `в корзине · ${cart[p.id]}` : 'В корзину'}
              </button>
            </div>
            {p.stock <= 3 && <p className="left">осталось {p.stock} шт.</p>}
          </div>
        </article>
      ))}
    </div>
  )

  return (
    <>
      {home && banners.length > 0 && <Banners items={banners} />}

      <input
        className="search"
        placeholder="Поиск по названию или вкусу"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {home && (
        sections.length === 0
          ? <p className="muted center">Товаров пока нет</p>
          : (
            <div className="sections">
              {sections.map((c) => {
                // Заставка раздела, а если её не поставили — фото первого товара.
                const cover = c.photo_url || c.items.find((p) => p.photo_url)?.photo_url
                return (
                  <button key={c.id} className="section" onClick={() => { haptic(); setCategoryId(c.id) }}>
                    {cover ? <img src={cover} alt="" loading="lazy" /> : <div className="no-photo" />}
                    <span className="section-name">{c.name}</span>
                    <span className="section-count">
                      {c.items.length} {plural(c.items.length, ['товар', 'товара', 'товаров'])}
                    </span>
                  </button>
                )
              })}
            </div>
          )
      )}

      {!home && (
        <>
          <div className="section-head">
            <button className="ghost back" aria-label="Назад" onClick={() => { setCategoryId(null); setQuery('') }}>←</button>
            <h2>{q ? `Поиск: ${query.trim()}` : current?.name}</h2>
          </div>
          {visible.length === 0
            ? <p className="muted center">{q ? 'Ничего не нашлось' : 'В этом разделе пока пусто'}</p>
            : grid(visible)}
        </>
      )}

      {detail && (
        <Product
          product={detail}
          inCart={cart[detail.id] || 0}
          onAdd={onAdd}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}
