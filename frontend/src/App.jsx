import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { addToHomeScreen, homeScreenStatus, initTelegram, onEvent } from './tg'
import AgeGate from './components/AgeGate'
import Catalog from './components/Catalog'
import Cart from './components/Cart'
import Profile from './components/Profile'
import Admin from './components/Admin'

/** Корзина переживает закрытие Mini App: Telegram выгружает страницу целиком. */
const savedCart = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('cart') || '{}')
    return typeof saved === 'object' && saved ? saved : {}
  } catch {
    return {}
  }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [adult, setAdult] = useState(() => localStorage.getItem('adult') === '1')
  const [tab, setTab] = useState('catalog')

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState(savedCart)
  const [banners, setBanners] = useState([])
  const [tier, setTier] = useState(null)              // уровень лояльности покупателя
  const [shortcut, setShortcut] = useState('unsupported')   // ярлык на экране телефона

  const load = useCallback(async () => {
    const [cats, items, ads] = await Promise.all([api.categories(), api.products(), api.banners()])
    setCategories(cats)
    setProducts(items)
    setBanners(ads.filter((b) => b.is_active))

    // Пока корзина лежала в памяти телефона, товар могли снять с продажи или
    // разобрать: выкидываем исчезнувшее и подрезаем количество под остаток.
    setCart((c) => {
      const next = {}
      for (const [id, qty] of Object.entries(c)) {
        const p = items.find((i) => i.id === Number(id))
        if (p && p.stock > 0) next[id] = Math.min(qty, p.stock)
      }
      return next
    })
  }, [])

  useEffect(() => {
    initTelegram()
    api.me()
      .then(setUser)
      .then(load)
      .catch((e) => setError(e.message))
    // Уровень нужен уже в корзине — показать скидку до открытия профиля.
    api.profile().then((p) => setTier(p.tier)).catch(() => { /* профиль подождёт */ })
  }, [load])

  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart))
    } catch { /* приватный режим — переживём без сохранения */ }
  }, [cart])

  useEffect(() => {
    homeScreenStatus().then(setShortcut)
    // Telegram не сообщает результат сразу: ярлык появляется после согласия.
    return onEvent('homeScreenAdded', () => setShortcut('added'))
  }, [])

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
        {(shortcut === 'missed' || shortcut === 'unknown') && (
          <button className="ghost shortcut" onClick={addToHomeScreen}>На экран</button>
        )}
      </header>

      <main className="content">
        {tab === 'catalog' && (
          <Catalog products={products} categories={categories} banners={banners} cart={cart} onAdd={addToCart} />
        )}
        {tab === 'cart' && (
          <Cart
            cart={cart}
            products={products}
            user={user}
            tier={tier}
            onQty={setQty}
            onDone={() => { setCart({}); setTab('catalog'); load() }}
          />
        )}
        {tab === 'profile' && <Profile />}
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
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          Профиль
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
