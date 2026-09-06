import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { addToHomeScreen, homeScreenStatus, initTelegram, onEvent } from './tg'
import AgeGate from './components/AgeGate'
import Catalog from './components/Catalog'
import Cart from './components/Cart'
import Profile from './components/Profile'
import Admin from './components/Admin'
import { AdminIcon, CartIcon, HomeIcon, UserIcon } from './components/Icons'

/** Корзина переживает закрытие Mini App: Telegram выгружает страницу целиком. */
const savedCart = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('cart') || '{}')
    return typeof saved === 'object' && saved ? saved : {}
  } catch {
    return {}
  }
}

const TABS = [
  { key: 'catalog', label: 'Магазин', Icon: HomeIcon },
  { key: 'cart', label: 'Корзина', Icon: CartIcon },
  { key: 'profile', label: 'Профиль', Icon: UserIcon },
  { key: 'admin', label: 'Админ', Icon: AdminIcon, adminOnly: true },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [adult, setAdult] = useState(() => localStorage.getItem('adult') === '1')
  const [tab, setTab] = useState('catalog')

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState(savedCart)
  const [banners, setBanners] = useState([])
  const [profile, setProfile] = useState(null)            // уровень и история заказов
  const [shortcut, setShortcut] = useState('unsupported') // ярлык на экране телефона

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

  // Профиль живёт в App, а не во вкладке: иначе каждое переключение вкладки
  // заново стучалось бы на сервер и показывало спиннер вместо готовых данных.
  const loadProfile = useCallback(
    () => api.profile().then(setProfile).catch(() => { /* профиль подождёт */ }),
    [],
  )

  useEffect(() => {
    initTelegram()
    api.me()
      .then(setUser)
      .then(load)
      .catch((e) => setError(e.message))
    loadProfile()
  }, [load, loadProfile])

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
  const tabs = TABS.filter((t) => !t.adminOnly || user.is_admin)

  return (
    <div className="app">
      <header className="header">
        <h1>{user.shop_name}</h1>
        {user.is_admin && <span className="badge">админ</span>}
        {(shortcut === 'missed' || shortcut === 'unknown') && (
          <button className="ghost shortcut" onClick={addToHomeScreen}>На экран</button>
        )}
      </header>

      {/* Вкладки остаются в разметке и только прячутся: переключение мгновенное,
          выбранная категория и набранный поиск не сбрасываются. */}
      <main className="content">
        <div className={tab === 'catalog' ? 'pane active' : 'pane'}>
          <Catalog products={products} categories={categories} banners={banners} cart={cart} onAdd={addToCart} />
        </div>
        <div className={tab === 'cart' ? 'pane active' : 'pane'}>
          <Cart
            cart={cart}
            products={products}
            user={user}
            tier={profile?.tier}
            onQty={setQty}
            onDone={() => { setCart({}); setTab('catalog'); load(); loadProfile() }}
          />
        </div>
        <div className={tab === 'profile' ? 'pane active' : 'pane'}>
          <Profile data={profile} />
        </div>
        {user.is_admin && (
          <div className={tab === 'admin' ? 'pane active' : 'pane'}>
            <Admin categories={categories} products={products} onChange={load} />
          </div>
        )}
      </main>

      <nav className="tabbar">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            aria-label={label}
            onClick={() => setTab(key)}
          >
            <span className="tab-icon">
              <Icon />
              {key === 'cart' && cartCount > 0 && <span className="dot">{cartCount}</span>}
            </span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
