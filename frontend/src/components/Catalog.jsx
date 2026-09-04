import { useMemo, useState } from 'react'
import { haptic } from '../tg'

export default function Catalog({ products, categories, cart, onAdd }) {
  const [categoryId, setCategoryId] = useState(null)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false
      if (!q) return true
      return `${p.name} ${p.brand} ${p.flavor}`.toLowerCase().includes(q)
    })
  }, [products, categoryId, query])

  return (
    <>
      <input
        className="search"
        placeholder="Поиск по названию или вкусу"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {categories.length > 0 && (
        <div className="chips">
          <button className={!categoryId ? 'chip active' : 'chip'} onClick={() => setCategoryId(null)}>
            Все
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={categoryId === c.id ? 'chip active' : 'chip'}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && <p className="muted center">Товаров пока нет</p>}

      <div className="grid">
        {visible.map((p) => (
          <article key={p.id} className="card">
            {p.photo_url ? (
              <img src={p.photo_url} alt={p.name} loading="lazy" />
            ) : (
              <div className="no-photo">нет фото</div>
            )}
            <div className="card-body">
              <h3>{p.name}</h3>
              <p className="muted small">
                {[p.brand, p.flavor, p.weight].filter(Boolean).join(' · ')}
              </p>
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
    </>
  )
}
