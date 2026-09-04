import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { initTelegram } from './tg'
import AgeGate from './components/AgeGate'
import Catalog from './components/Catalog'
import Cart from './components/Cart'
import Admin from './components/Admin'

export default function App() {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [adult, setAdult] = useState(() => localStorage.getItem('adult') === '1')
  const [tab, setTab] = useState('catalog')

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})

  const load = useCallback(async () => {
    const [cats, items] = await Promise.all([api.categories(), api.products()])
    setCategories(cats)
    setProducts(items)
  }, [])

  useEffect(() => {
    initTelegram()
    api.me()
      .then(setUser)
      .then(load)
      .catch((e) => setError(e.message))
  }, [load])

  const addToCart = (product) => setCart((c) => ({ ...c, [product.id]: (c[product.id] || 0) + 1 }))
  const setQty = (id, qty) =>
    setCart((c) => {
      const next = { ...c }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })

  if (error) return <div className="screen"><p className="error">{error}</p></div>
  if (!user) return <div className="screen"><div className="spinner" /></div>
  if (!adult) return <AgeGate onConfirm={() => { localStorage.setItem('adult', '1'); setAdult(true) }} />

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)

  return (
    <div className="app">
      <header className="header">
        <h1>{user.shop_name}</h1>
        {user.is_admin && <span className="badge">админ</span>}
      </header>

      <main className="content">
        {tab === 'catalog' && (
          <Catalog products={products} categories={categories} cart={cart} onAdd={addToCart} />
        )}
        {tab === 'cart' && (
          <Cart
            cart={cart}
            products={products}
            onQty={setQty}
            onDone={() => { setCart({}); setTab('catalog'); load() }}
          />
        )}
        {tab === 'admin' && user.is_admin && (
          <Admin categories={categories} products={products} onChange={load} />
        )}
      </main>

      <nav className="tabbar">
        <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>
          Каталог
        </button>
        <button className={tab === 'cart' ? 'active' : ''} onClick={() => setTab('cart')}>
          Корзина{cartCount > 0 && <span className="dot">{cartCount}</span>}
        </button>
        {user.is_admin && (
          <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
            Админ
          </button>
        )}
      </nav>
    </div>
  )
}
