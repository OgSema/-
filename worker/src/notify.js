import { sendMessage } from './telegram.js'

const lines = (items) =>
  items.map((i) => `• ${i.name} — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`).join('\n')

const clientLink = (order) =>
  order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.tg_user_id}">${order.customer_name || 'клиенту'}</a>`

export const adminChat = (env) =>
  env.ORDER_CHAT_ID || String(env.ADMIN_IDS || '').split(',')[0].trim()

export const notifyAdmin = (env, order) =>
  sendMessage(
    env,
    adminChat(env),
    `🛒 <b>Новый заказ №${order.id}</b>\nКлиент: ${clientLink(order)} (id ${order.tg_user_id})\n\n` +
      `${lines(order.items)}\n\n<b>Итого: ${order.total} ₽</b>`,
    order.username
      ? { reply_markup: { inline_keyboard: [[{ text: 'Написать клиенту', url: `https://t.me/${order.username}` }]] } }
      : {},
  )

export const notifyCustomer = (env, order) =>
  sendMessage(
    env,
    order.tg_user_id,
    `<b>Заказ №${order.id} принят</b>\n\n${lines(order.items)}\n\n<b>Итого: ${order.total} ₽</b>\n\n` +
      'Скоро напишем сюда, чтобы подтвердить детали.',
  )

/** Для Mini App: пишем и покупателю, и админу. */
export async function notifyNewOrder(env, order) {
  return {
    customer_notified: await notifyCustomer(env, order),
    admin_notified: await notifyAdmin(env, order),
  }
}
