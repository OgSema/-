CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  photo_url TEXT NOT NULL DEFAULT '',   -- заставка на плитке главной
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  brand       TEXT NOT NULL DEFAULT '',
  flavor      TEXT NOT NULL DEFAULT '',
  weight      TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  photo_url   TEXT NOT NULL DEFAULT '',
  stock       INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_user_id    INTEGER NOT NULL,
  username      TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',     -- телефон или другой контакт
  address       TEXT NOT NULL DEFAULT '',     -- куда везти
  comment       TEXT NOT NULL DEFAULT '',     -- пожелания к доставке
  total         INTEGER NOT NULL DEFAULT 0,   -- к оплате, уже со скидкой
  discount      INTEGER NOT NULL DEFAULT 0,
  promo_code    TEXT NOT NULL DEFAULT '',
  loyalty_tier  TEXT NOT NULL DEFAULT '',    -- уровень, если скидку дал он, а не код
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
-- Профиль и уровень лояльности читают заказы одного покупателя.
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(tg_user_id);

-- Рекламная лента на главной: только картинки, порядок задаёт админ.
CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_url  TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Промокоды: процент или фиксированная сумма, действуют в интервале дат.
CREATE TABLE IF NOT EXISTS promos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,          -- хранится в верхнем регистре
  kind       TEXT NOT NULL,                 -- percent | amount
  value      INTEGER NOT NULL,
  starts_at  TEXT NOT NULL,                 -- YYYY-MM-DD, включительно
  ends_at    TEXT NOT NULL,                 -- YYYY-MM-DD, включительно
  max_uses   INTEGER NOT NULL DEFAULT 0,     -- 0 — без ограничения
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
