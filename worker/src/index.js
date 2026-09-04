import { Hono } from 'hono'
import { HttpError, currentUser, requireAdmin } from './auth.js'
import { handleUpdate } from './bot/index.js'
import { adminChat, notifyNewOrder } from './notify.js'
import { createOrder, listCategories, listProducts, orderItems, productRow } from './shop.js'
import { fetchPhoto, uploadPhoto } from './telegram.js'

const app = new Hono()

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500
  if (status === 500) console.error(err)
  return c.json({ detail: err.message || 'Внутренняя ошибка' }, status)
})

const product = productRow

// ---------- профиль ----------

app.get('/api/me', async (c) => {
  const user = await currentUser(c)
  return c.json({ ...user, shop_name: c.env.SHOP_NAME || 'Магазин' })
})

// ---------- категории ----------

app.get('/api/categories', async (c) => c.json(await listCategories(c.env.DB)))

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
  // Покупатель видит только опубликованные позиции в наличии.
  const user = await currentUser(c)
  return c.json(await listProducts(c.env.DB, { all: user.is_admin }))
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
  const fileId = await uploadPhoto(c.env, adminChat(c.env), file)
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

const withItems = async (db, order) => ({ ...order, items: await orderItems(db, order.id) })

app.post('/api/orders', async (c) => {
  const user = await currentUser(c)
  const { items } = await c.req.json()
  const order = await createOrder(c.env, user, items)
  return c.json({ ...order, ...(await notifyNewOrder(c.env, order)) })
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

// ---------- вебхук бота ----------

app.post('/tg', async (c) => {
  // Секрет Telegram присылает заголовком — чужой запрос сюда не пройдёт.
  if (!c.env.WEBHOOK_SECRET || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.WEBHOOK_SECRET) {
    return c.text('forbidden', 403)
  }
  const update = await c.req.json()
  c.executionCtx.waitUntil(handleUpdate(c.env, update))
  return c.json({ ok: true })
})

app.get('/health', (c) => c.json({
  ok: true,
  bot_configured: !!c.env.BOT_TOKEN,
  webhook_configured: !!c.env.WEBHOOK_SECRET,
}))

export default app
