/**
 * Программа лояльности: уровень зависит от суммы выкупленных заказов.
 *
 * Выкуп — это заказы, которые админ подтвердил или выдал. Новые и отменённые
 * не считаются, поэтому уровень нельзя накрутить, набросав заказов в корзину.
 * Сумма нигде не хранится: считаем её запросом, тогда она не разъезжается с
 * заказами при смене статуса.
 */

export const TIERS = [
  { name: 'SILVER', from: 3000, percent: 5 },
  { name: 'GOLD', from: 7000, percent: 10 },
  { name: 'PLATINUM', from: 12000, percent: 15 },
  { name: 'VIP', from: 20000, percent: 25 },
]

const COUNTED = "('confirmed', 'done')"

export const spentByUser = async (db, userId) => {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(total), 0) AS spent FROM orders
      WHERE tg_user_id = ? AND status IN ${COUNTED}`,
  ).bind(userId).first()
  return row?.spent || 0
}

/** Достигнутый уровень или null, пока выкуп меньше первого порога. */
export const tierFor = (spent) =>
  [...TIERS].reverse().find((t) => spent >= t.from) || null

export const nextTier = (spent) => TIERS.find((t) => spent < t.from) || null

/** Скидка уровня в рублях. Проценты считаются от суммы без скидок. */
export const loyaltyDiscount = (tier, total) =>
  tier ? Math.max(0, Math.min(Math.floor((total * tier.percent) / 100), total)) : 0

/** Всё, что нужно показать в профиле: уровень, следующий и путь до него. */
export function loyaltyStatus(spent) {
  const tier = tierFor(spent)
  const next = nextTier(spent)
  const from = tier?.from || 0
  return {
    spent,
    tier,
    next,
    // Доля пути от текущего порога до следующего: на VIP полоса залита целиком.
    progress: next ? Math.min(1, (spent - from) / (next.from - from)) : 1,
    left: next ? next.from - spent : 0,
  }
}
