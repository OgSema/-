import { Hono } from 'hono'
import { HttpError, currentUser, requireAdmin } from './auth.js'
import { notifyNewOrder } from './notify.js'
import { fetchPhoto, uploadPhoto } from './telegram.js'

const app = new Hono()

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500
  if (status === 500) console.error(err)
  return c.json({ detail: err.message || 'Внутренняя ошибка' }, status)
})

const product = (row) => ({ ...row, is_active: !!row.is_active })
const storageChat = (env) => env.ORDER_CHAT_ID || String(env.ADMIN_IDS || '').split(',')[0].trim()

// ---------- профиль ----------

app.get('/api/me', async (c) => {
  const user = await currentUser(c)
  return c.json({ ...user, shop_name: c.env.SHOP_NAME || 'Магазин' })
})

// ---------- категории ----------

app.get('/api/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories ORDER BY sort, name').all()
  return c.json(results)
})

app.post('/api/categories', async (c) => {
  await requireAdmin(c)
  const { name, sort = 0 } = await c.req.json()
  if (!name?.trim()) throw new HttpError(400, 'Укажите название категории')
  const row = await c.env.DB.prepare('INSERT INTO categories (name, sort) VALUES (?, ?) RETURNING *')
    .bind(name.trim(), Number(sort) || 0).first()
  return c.json(row)
})

app.delete('/api/categories/:id', async (c) => {
  await requireAdmin(c)
  const id = Number(c.req.param('id'))
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// ---------- товары ----------

app.get('/api/products', async (c) => {
  const user = await currentUser(c)
  // Покупатель видит только опубликованные позиции в наличии.
  const where = user.is_admin ? '1=1' : 'is_active = 1 AND stock > 0'
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM products WHERE ${where} ORDER BY created_at DESC, id DESC`).all()
  return c.json(results.map(product))
})

const productFields = (body) => [
  String(body.name || '').trim(),
  body.category_id ? Number(body.category_id) : null,
  body.brand || '', body.flavor || '', body.weight || '',
  Number(body.price) || 0, body.description || '', body.photo_url || '',
  Number(body.stock) || 0, body.is_active === false ? 0 : 1,
]

app.post('/api/products', async (c) => {
  await requireAdmin(c)
  const body = await c.req.json()
  if (!String(body.name || '').trim()) throw new HttpError(400, 'Укажите название')
  const row = await c.env.DB.prepare(
    `INSERT INTO products (name, category_id, brand, flavor, weight, price, description, photo_url, stock, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(...productFields(body)).first()
  return c.json(product(row))
})

app.patch('/api/products/:id', async (c) => {
  await requireAdmin(c)
  const body = await c.req.json()
  const row = await c.env.DB.prepare(
    `UPDATE products SET name = ?, category_id = ?, brand = ?, flavor = ?, weight = ?,
       price = ?, description = ?, photo_url = ?, stock = ?, is_active = ?
     WHERE id = ? RETURNING *`,
  ).bind(...productFields(body), Number(c.req.param('id'))).first()
  if (!row) throw new HttpError(404, 'Товар не найден')
  return c.json(product(row))
})

app.delete('/api/products/:id', async (c) => {
  await requireAdmin(c)
  await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

// ---------- фото ----------

app.post('/api/upload', async (c) => {
  await requireAdmin(c)
  const file = (await c.req.formData()).get('file')
  if (!file || typeof file === 'string') throw new HttpError(400, 'Файл не получен')
  if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'Файл больше 5 МБ')

  // Картинки храним в Telegram — не нужно ни диска, ни бакета.
  const fileId = await uploadPhoto(c.env, storageChat(c.env), file)
  return c.json({ url: `/photo/${encodeURIComponent(fileId)}` })
})

app.get('/photo/:fileId', async (c) => {
  const cache = caches.default
  const hit = await cache.match(c.req.raw)
  if (hit) return hit

  const upstream = await fetchPhoto(c.env, c.req.param('fileId'))
  if (!upstream?.ok) return c.text('Фото не найдено', 404)

  const res = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
    },
  })
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()))
  return res
})

// ---------- заказы ----------

const withItems = async (db, order) => {
  const { results } = await db.prepare('SELECT name, price, qty FROM order_items WHERE order_id = ?')
    .bind(order.id).all()
  return { ...order, items: results }
}

app.post('/api/orders', async (c) => {
  const user = await currentUser(c)
  const { items } = await c.req.json()
  if (!items?.length) throw new HttpError(400, 'Корзина пуста')

  const lines = []
  let total = 0
  for (const line of items) {
    const qty = Number(line.qty)
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Некорректное количество')

    const row = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(Number(line.product_id)).first()
    if (!row || !row.is_active) throw new HttpError(400, `Товар ${line.product_id} недоступен`)
    if (row.stock < qty) throw new HttpError(409, `«${row.name}»: осталось ${row.stock} шт.`)

    // Цену берём из базы, а не из корзины клиента.
    lines.push({ product_id: row.id, name: row.name, price: row.price, qty })
    total += row.price * qty
  }

  const order = await c.env.DB.prepare(
    `INSERT INTO orders (tg_user_id, username, customer_name, total) VALUES (?, ?, ?, ?) RETURNING *`,
  ).bind(user.id, user.username, user.name, total).first()

  // Остаток списываем условием stock >= qty: если кто-то успел раньше, изменений не будет.
  const writes = await c.env.DB.batch(lines.flatMap((l) => [
    c.env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
      .bind(l.qty, l.product_id, l.qty),
    c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)')
      .bind(order.id, l.product_id, l.name, l.price, l.qty),
  ]))

  const soldOut = writes.filter((_, i) => i % 2 === 0).some((r) => r.meta.changes === 0)
  if (soldOut) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(order.id),
      c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(order.id),
    ])
    throw new HttpError(409, 'Товар разобрали, пока вы оформляли заказ')
  }

  const full = { ...order, items: lines }
  const delivered = await notifyNewOrder(c.env, full)
  return c.json({ ...full, ...delivered })
})

app.get('/api/orders', async (c) => {
  await requireAdmin(c)
  const { results } = await c.env.DB.prepare('SELECT * FROM orders ORDER BY id DESC').all()
  return c.json(await Promise.all(results.map((o) => withItems(c.env.DB, o))))
})

app.patch('/api/orders/:id', async (c) => {
  await requireAdmin(c)
  const { status } = await c.req.json()
  if (!['new', 'confirmed', 'done', 'canceled'].includes(status)) throw new HttpError(400, 'Неизвестный статус')

  const order = await c.env.DB.prepare('UPDATE orders SET status = ? WHERE id = ? RETURNING *')
    .bind(status, Number(c.req.param('id'))).first()
  if (!order) throw new HttpError(404, 'Заказ не найден')
  return c.json(await withItems(c.env.DB, order))
})

app.get('/health', (c) => c.json({ ok: true, bot_configured: !!c.env.BOT_TOKEN }))

export default app
