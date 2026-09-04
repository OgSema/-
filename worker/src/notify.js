import { sendMessage } from './telegram.js'

const lines = (items) =>
  items.map((i) => `• ${i.name} — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`).join('\n')

const clientLink = (order) =>
  order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.tg_user_id}">${order.customer_name || 'клиенту'}</a>`

export async function notifyNewOrder(env, order) {
  const customer = await sendMessage(
    env,
    order.tg_user_id,
    `<b>Заказ №${order.id} принят</b>\n\n${lines(order.items)}\n\n` +
      `<b>Итого: ${order.total} ₽</b>\n\nСкоро напишем сюда, чтобы подтвердить детали.`,
  )

  const markup = order.username
    ? { inline_keyboard: [[{ text: 'Написать клиенту', url: `https://t.me/${order.username}` }]] }
    : undefined

  const admin = await sendMessage(
    env,
    env.ORDER_CHAT_ID || String(env.ADMIN_IDS || '').split(',')[0].trim(),
    `🛒 <b>Новый заказ №${order.id}</b>\nКлиент: ${clientLink(order)} (id ${order.tg_user_id})\n\n` +
      `${lines(order.items)}\n\n<b>Итого: ${order.total} ₽</b>`,
    markup,
  )

  return { customer_notified: customer, admin_notified: admin }
}
