/**
 * Сводка для админа: что в магазине происходит прямо сейчас.
 *
 * Выкупом считаем те же статусы, что и лояльность («подтверждён» и «выдан»):
 * иначе брошенная корзина раздувала бы выручку. Все запросы уходят одной
 * пачкой — сводка открывается первой вкладкой админки, лишние круги к базе
 * тут заметны.
 */

const COUNTED = "('confirmed', 'done')"
const LOW_STOCK = 3
// Магазин московский, и админ смотрит сводку по московскому времени: день в
// UTC обрывался бы в три часа ночи посреди вечерних заходов.
const MSK = "'+3 hours'"

/**
 * Отметка посещения: одна строка на человека в день. Повтор молча гасится
 * первичным ключом, поэтому счётчик показывает людей, а не открытия.
 */
export function markVisit(db, userId) {
  return db.prepare(`INSERT OR IGNORE INTO visits (tg_user_id, day) VALUES (?, date('now', ${MSK}))`)
    .bind(userId).run()
}

export async function shopStats(db) {
  // Прибыль считается по снимку закупки в позициях заказа, а скидка вычитается
  // целиком с заказа: в позициях лежит цена до скидки, иначе прибыль завышалась
  // бы ровно на скидку.
  const period = (since) => db.prepare(
    `SELECT COUNT(*) AS orders,
            COALESCE(SUM(CASE WHEN status IN ${COUNTED} THEN total ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN status IN ${COUNTED} THEN
              (SELECT COALESCE(SUM((i.price - i.cost) * i.qty), 0)
                 FROM order_items i WHERE i.order_id = orders.id) - discount
              ELSE 0 END), 0) AS profit
       FROM orders WHERE created_at >= datetime('now', ?)`,
  ).bind(since)

  const [statuses, week, month, top, customers, low, stock, visitors] = await db.batch([
    db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    period('-7 days'),
    period('-30 days'),
    db.prepare(
      `SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS sum
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.status IN ${COUNTED} AND o.created_at >= datetime('now', '-30 days')
        GROUP BY i.name ORDER BY qty DESC LIMIT 5`,
    ),
    db.prepare('SELECT COUNT(DISTINCT tg_user_id) AS n FROM orders'),
    db.prepare(
      `SELECT name, stock FROM products
        WHERE is_active = 1 AND stock <= ? ORDER BY stock, name LIMIT 10`,
    ).bind(LOW_STOCK),
    // Сколько денег лежит на полке: по закупке — вложено, по цене — если всё
    // продать. Скрытые позиции не считаем, их сейчас продать нельзя.
    db.prepare(
      `SELECT COALESCE(SUM(cost * stock), 0) AS spent,
              COALESCE(SUM(price * stock), 0) AS retail,
              COALESCE(SUM(stock), 0) AS items
         FROM products WHERE is_active = 1`,
    ),
    // Заходы считаются с 08.09.2026 — раньше их никто не записывал, так что
    // «за всё время» означает «с того дня».
    db.prepare(
      `SELECT COUNT(DISTINCT CASE WHEN day = date('now', ${MSK}) THEN tg_user_id END) AS today,
              COUNT(DISTINCT CASE WHEN day >= date('now', ${MSK}, '-29 days') THEN tg_user_id END) AS month,
              COUNT(DISTINCT tg_user_id) AS total
         FROM visits`,
    ),
  ])

  return {
    // Ключи всех статусов есть всегда: иначе на пустой базе пришлось бы
    // проверять каждое число во фронте.
    statuses: { new: 0, confirmed: 0, done: 0, canceled: 0, ...Object.fromEntries(statuses.results.map((r) => [r.status, r.n])) },
    week: week.results[0],
    month: month.results[0],
    top: top.results,
    customers: customers.results[0].n,
    low: low.results,
    low_stock: LOW_STOCK,
    stock: stock.results[0],
    visitors: visitors.results[0],
  }
}
