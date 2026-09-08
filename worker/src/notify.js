import { adminIds } from './auth.js'
import { sendMessage } from './telegram.js'

const lines = (items) =>
  items.map((i) => `• ${i.name} — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`).join('\n')

/** Строка со скидкой: её даёт либо промокод, либо уровень лояльности. */
const discountLine = (order) => {
  if (order.discount <= 0) return ''
  const source = order.promo_code ? `Промокод ${order.promo_code}` : `Уровень ${order.loyalty_tier}`
  return `\n\nБез скидки: ${order.total + order.discount} ₽\n${source}: −${order.discount} ₽`
}

/** Куда везти и как связаться — то, ради чего админ вообще открывает сообщение. */
const delivery = (order) => {
  const rows = [
    order.phone && `Телефон: ${order.phone}`,
    order.address && `Адрес: ${order.address}`,
    order.comment && `Комментарий: ${order.comment}`,
  ].filter(Boolean)
  return rows.length ? `\n\n${rows.join('\n')}` : ''
}

const clientLink = (order) =>
  order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.tg_user_id}">написать</a>`

/** Служебный чат: туда заливаются картинки товаров ради file_id. */
export const adminChat = (env) =>
  env.ORDER_CHAT_ID || String(env.ADMIN_IDS || '').split(',')[0].trim()

/** Кому уходит заказ: отдельный чат, если он задан, иначе каждый админ. */
export const orderChats = (env) => (env.ORDER_CHAT_ID ? [env.ORDER_CHAT_ID] : [...adminIds(env)])

export async function notifyAdmin(env, order) {
  const text =
    `🛒 <b>Новый заказ №${order.id}</b>\n` +
    `Клиент: ${order.customer_name || 'без имени'} · ${clientLink(order)} (id ${order.tg_user_id})` +
    `${delivery(order)}\n\n${lines(order.items)}${discountLine(order)}\n\n<b>Итого: ${order.total} ₽</b>`
  const extra = order.username
    ? { reply_markup: { inline_keyboard: [[{ text: 'Написать клиенту', url: `https://t.me/${order.username}` }]] } }
    : {}

  // Админов может быть несколько. Заказ уходит каждому, и хватает одного
  // дошедшего: остальные могли не нажать /start, тогда бот им написать не может.
  const sent = await Promise.all(orderChats(env).map((chat) => sendMessage(env, chat, text, extra)))
  return sent.some(Boolean)
}

export const notifyCustomer = (env, order) =>
  sendMessage(
    env,
    order.tg_user_id,
    `<b>Заказ №${order.id} принят</b>\n\n${lines(order.items)}${discountLine(order)}\n\n` +
      `<b>Итого: ${order.total} ₽</b>${delivery(order)}\n\nСкоро напишем сюда, чтобы подтвердить детали.`,
  )

/** Для Mini App: пишем и покупателю, и админу. */
export async function notifyNewOrder(env, order) {
  return {
    customer_notified: await notifyCustomer(env, order),
    admin_notified: await notifyAdmin(env, order),
  }
}
