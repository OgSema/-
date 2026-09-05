import { Hono } from 'hono'
import { HttpError, currentUser, requireAdmin } from './auth.js'
import { handleUpdate } from './bot/index.js'
import { adminChat, notifyNewOrder } from './notify.js'
import { createOrder, deliveryFields, effectiveDiscount, findPromo, listCategories, listProducts, orderItems, priceCart, productRow } from './shop.js'
import { TIERS, loyaltyStatus, spentByUser, tierFor } from './loyalty.js'
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

// ---------- профиль и лояльность ----------

/** Личный кабинет: уровень, путь до следующего и своя история заказов. */
app.get('/api/profile', async (c) => {
  const user = await currentUser(c)
  const spent = await spentByUser(c.env.DB, user.id)

  const { results } = await c.env.DB
    .prepare('SELECT * FROM orders WHERE tg_user_id = ? ORDER BY id DESC LIMIT 50').bind(user.id).all()

  return c.json({
    user,
    ...loyaltyStatus(spent),
    tiers: TIERS,
    orders: await Promise.all(results.map((o) => withItems(c.env.DB, o))),
  })
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

// ---------- баннеры ----------

app.get('/api/banners', async (c) => {
  const user = await currentUser(c)
  const where = user.is_admin ? '' : 'WHERE is_active = 1'
  const { results } = await c.env.DB.prepare(`SELECT * FROM banners ${where} ORDER BY sort, id`).all()
  return c.json(results.map((b) => ({ ...b, is_active: !!b.is_active })))
})

app.post('/api/banners', async (c) => {
  await requireAdmin(c)
  const { photo_url, sort = 0 } = await c.req.json()
  if (!photo_url) throw new HttpError(400, 'Загрузите картинку')
  const row = await c.env.DB.prepare('INSERT INTO banners (photo_url, sort) VALUES (?, ?) RETURNING *')
    .bind(photo_url, Number(sort) || 0).first()
  return c.json({ ...row, is_active: !!row.is_active })
})

app.delete('/api/banners/:id', async (c) => {
  await requireAdmin(c)
  await c.env.DB.prepare('DELETE FROM banners WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

// ---------- промокоды ----------

const promoRow = (row) => ({ ...row, is_active: !!row.is_active })

app.get('/api/promos', async (c) => {
  await requireAdmin(c)
  const { results } = await c.env.DB.prepare('SELECT * FROM promos ORDER BY id DESC').all()
  return c.json(results.map(promoRow))
})

app.post('/api/promos', async (c) => {
  await requireAdmin(c)
  const { code, kind, value, starts_at, ends_at, max_uses = 0 } = await c.req.json()

  const clean = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9-]{3,32}$/.test(clean)) throw new HttpError(400, 'Код: 3–32 знака, латиница, цифры и дефис')
  if (kind !== 'percent' && kind !== 'amount') throw new HttpError(400, 'Неизвестный тип скидки')

  const amount = Number(value)
  if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, 'Размер скидки должен быть больше нуля')
  if (kind === 'percent' && amount > 100) throw new HttpError(400, 'Процент не может быть больше 100')

  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
  if (!isDate(starts_at) || !isDate(ends_at)) throw new HttpError(400, 'Укажите даты начала и окончания')
  if (ends_at < starts_at) throw new HttpError(400, 'Дата окончания раньше начала')

  // 0 — без ограничения: код живёт только по датам.
  const limit = Number(max_uses) || 0
  if (!Number.isInteger(limit) || limit < 0) throw new HttpError(400, 'Лимит применений не может быть отрицательным')

  try {
    const row = await c.env.DB.prepare(
      'INSERT INTO promos (code, kind, value, starts_at, ends_at, max_uses) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
    ).bind(clean, kind, amount, starts_at, ends_at, limit).first()
    return c.json(promoRow(row))
  } catch {
    throw new HttpError(409, 'Такой код уже есть')
  }
})

app.delete('/api/promos/:id', async (c) => {
  await requireAdmin(c)
  await c.env.DB.prepare('DELETE FROM promos WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/** Покупатель проверяет код до оформления: сумму считаем по базе, не по корзине клиента. */
app.post('/api/promos/check', async (c) => {
  const user = await currentUser(c)
  const { code, items } = await c.req.json()

  const promo = await findPromo(c.env.DB, code)
  if (!promo) throw new HttpError(404, 'Код не найден или срок действия истёк')

  const { total } = await priceCart(c.env.DB, items)
  // Скидки не складываются: показываем ту, что победит при оформлении.
  const tier = tierFor(await spentByUser(c.env.DB, user.id))
  const { kind, discount } = effectiveDiscount(tier, promo, total)
  return c.json({
    code: promo.code, kind: promo.kind, value: promo.value,
    left: promo.max_uses ? promo.max_uses - promo.used_count : null,
    applied: kind, tier: kind === 'loyalty' ? tier.name : '',
    subtotal: total, discount, total: total - discount,
  })
})

// ---------- заказы ----------

const withItems = async (db, order) => ({ ...order, items: await orderItems(db, order.id) })

app.post('/api/orders', async (c) => {
  const user = await currentUser(c)
  const body = await c.req.json()
  const { items, promo_code = '' } = body
  // Имя берём из формы, но если покупатель стёр его — подставляем имя из Telegram.
  const order = await createOrder(c.env, user, items, promo_code, deliveryFields({ ...body, name: body.name || user.name }))
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
