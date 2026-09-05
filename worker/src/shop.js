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
export async function createOrder(env, user, requested) {
  if (!requested?.length) throw new HttpError(400, 'Корзина пуста')

  const lines = []
  let total = 0
  for (const line of requested) {
    const qty = Number(line.qty)
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Некорректное количество')

    const row = await getProduct(env.DB, line.product_id)
    if (!row || !row.is_active) throw new HttpError(400, `Товар ${line.product_id} недоступен`)
    if (row.stock < qty) throw new HttpError(409, `«${row.name}»: осталось ${row.stock} шт.`)

    lines.push({ product_id: row.id, name: row.name, price: row.price, qty })
    total += row.price * qty
  }

  const order = await env.DB.prepare(
    'INSERT INTO orders (tg_user_id, username, customer_name, total) VALUES (?, ?, ?, ?) RETURNING *',
  ).bind(user.id, user.username || '', user.name || '', total).first()

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
    throw new HttpError(409, 'Товар разобрали, пока вы оформляли заказ')
  }

  return { ...order, items: lines }
}
