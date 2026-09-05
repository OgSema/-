import { sendMessage } from './telegram.js'

const lines = (items) =>
  items.map((i) => `• ${i.name} — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`).join('\n')

/** Строка со скидкой появляется, только если промокод действительно сработал. */
const discountLine = (order) =>
  order.discount > 0
    ? `\n\nБез скидки: ${order.total + order.discount} ₽\nПромокод ${order.promo_code}: −${order.discount} ₽`
    : ''

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

export const adminChat = (env) =>
  env.ORDER_CHAT_ID || String(env.ADMIN_IDS || '').split(',')[0].trim()

export const notifyAdmin = (env, order) =>
  sendMessage(
    env,
    adminChat(env),
    `🛒 <b>Новый заказ №${order.id}</b>\n` +
      `Клиент: ${order.customer_name || 'без имени'} · ${clientLink(order)} (id ${order.tg_user_id})` +
      `${delivery(order)}\n\n${lines(order.items)}${discountLine(order)}\n\n<b>Итого: ${order.total} ₽</b>`,
    order.username
      ? { reply_markup: { inline_keyboard: [[{ text: 'Написать клиенту', url: `https://t.me/${order.username}` }]] } }
      : {},
  )

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
