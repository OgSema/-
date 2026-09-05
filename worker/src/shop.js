/** Общая логика каталога и заказов. */

import { HttpError } from './auth.js'

export const productRow = (row) => ({ ...row, is_active: !!row.is_active })

export const listCategories = async (db) =>
  (await db.prepare('SELECT * FROM categories ORDER BY sort, name').all()).results

export const listProducts = async (db, { all = false, categoryId = null } = {}) => {
  const where = [all ? '1=1' : 'is_active = 1 AND stock > 0']
  if (categoryId) where.push(`category_id = ${Number(categoryId)}`)
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC`).all()
  return results.map(productRow)
}

export const getProduct = async (db, id) =>
  db.prepare('SELECT * FROM products WHERE id = ?').bind(Number(id)).first()

export const orderItems = async (db, orderId) =>
  (await db.prepare('SELECT name, price, qty FROM order_items WHERE order_id = ?').bind(orderId).all()).results

/**
 * Создаёт заказ: цены берутся из базы, остаток списывается условием stock >= qty,
 * поэтому две одновременные покупки последней пачки не уведут склад в минус.
 */
// ---------- промокоды ----------

/**
 * Действующий код или null. Регистр не важен, интервал дат включительный,
 * исчерпанный лимит применений исключает код так же, как истёкший срок.
 */
export const findPromo = async (db, code) => {
  const clean = String(code || '').trim().toUpperCase()
  if (!clean) return null
  return db.prepare(
    `SELECT * FROM promos WHERE code = ? AND is_active = 1
       AND date('now') BETWEEN starts_at AND ends_at
       AND (max_uses = 0 OR used_count < max_uses)`,
  ).bind(clean).first()
}

/**
 * Занимает одно применение кода. Условие max_uses повторяется в UPDATE, поэтому
 * два одновременных заказа не уведут счётчик за лимит: второму придёт 0 строк.
 */
const claimPromo = async (db, promo) => {
  if (!promo) return false
  const res = await db.prepare(
    'UPDATE promos SET used_count = used_count + 1 WHERE id = ? AND (max_uses = 0 OR used_count < max_uses)',
  ).bind(promo.id).run()
  return res.meta.changes > 0
}

const releasePromo = (db, promo) =>
  db.prepare('UPDATE promos SET used_count = used_count - 1 WHERE id = ? AND used_count > 0').bind(promo.id).run()

/** Скидка в рублях. Больше суммы заказа не бывает, в минус не уводит. */
export const promoDiscount = (promo, total) => {
  if (!promo) return 0
  const raw = promo.kind === 'percent'
    ? Math.floor((total * promo.value) / 100)
    : promo.value
  return Math.max(0, Math.min(raw, total))
}

/** Пересчитывает корзину по ценам из базы: клиент присылает только id и количество. */
export async function priceCart(db, requested) {
  if (!requested?.length) throw new HttpError(400, 'Корзина пуста')

  const lines = []
  let total = 0
  for (const line of requested) {
    const qty = Number(line.qty)
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Некорректное количество')

    const row = await getProduct(db, line.product_id)
    if (!row || !row.is_active) throw new HttpError(400, `Товар ${line.product_id} недоступен`)
    if (row.stock < qty) throw new HttpError(409, `«${row.name}»: осталось ${row.stock} шт.`)

    lines.push({ product_id: row.id, name: row.name, price: row.price, qty })
    total += row.price * qty
  }
  return { lines, total }
}

/** Контакты и адрес: без них заказ везти некуда. */
export function deliveryFields(body) {
  const trim = (v, limit) => String(v ?? '').trim().slice(0, limit)
  const delivery = {
    name: trim(body.name, 100),
    phone: trim(body.phone, 60),
    address: trim(body.address, 300),
    comment: trim(body.comment, 500),
  }
  if (!delivery.name) throw new HttpError(400, 'Укажите имя')
  if (delivery.phone.length < 5) throw new HttpError(400, 'Укажите телефон или другой способ связи')
  if (delivery.address.length < 5) throw new HttpError(400, 'Укажите адрес доставки')
  return delivery
}

export async function createOrder(env, user, requested, promoCode = '', delivery = {}) {
  const { lines, total } = await priceCart(env.DB, requested)

  // Код проверяем на сервере: клиент присылает только строку.
  const promo = await findPromo(env.DB, promoCode)
  // Применение занимаем до заказа: если лимит только что выбрали, скидки не будет.
  const applied = (await claimPromo(env.DB, promo)) ? promo : null
  const discount = promoDiscount(applied, total)

  const order = await env.DB.prepare(
    `INSERT INTO orders (tg_user_id, username, customer_name, phone, address, comment, total, discount, promo_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    user.id, user.username || '', delivery.name || user.name || '',
    delivery.phone || '', delivery.address || '', delivery.comment || '',
    total - discount, discount, applied?.code || '',
  ).first()

  const writes = await env.DB.batch(lines.flatMap((l) => [
    env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
      .bind(l.qty, l.product_id, l.qty),
    env.DB.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)')
      .bind(order.id, l.product_id, l.name, l.price, l.qty),
  ]))

  const soldOut = writes.filter((_, i) => i % 2 === 0).some((r) => r.meta.changes === 0)
  if (soldOut) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(order.id),
      env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(order.id),
    ])
    if (applied) await releasePromo(env.DB, applied)
    throw new HttpError(409, 'Товар разобрали, пока вы оформляли заказ')
  }

  return { ...order, items: lines, subtotal: total }
}
