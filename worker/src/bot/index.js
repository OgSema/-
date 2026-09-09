/**
 * Бот — только вход в Mini App.
 *
 * Витрина, корзина и админка живут в приложении; здесь остаётся приветствие
 * с кнопкой «Открыть магазин» и та же кнопка в меню рядом с полем ввода.
 * Уведомления о новых заказах шлёт notify.js; отсюда уходят только те, что
 * раньше не дошли, — покупатель написал, и бот наконец вправе ему ответить.
 */

import { deliverPending } from '../notify.js'
import { sendMessage, setMenuButton } from '../telegram.js'

const HELLO = (shop) =>
  `<b>${shop}</b>\n\nКаталог, корзина и оформление заказа — в приложении. ` +
  'Нажмите кнопку ниже.'

const NO_APP =
  'Магазин временно недоступен: не задан адрес приложения. Напишите владельцу.'

export async function handleUpdate(env, update) {
  const chatId = update.message?.chat?.id
  if (!chatId) return

  const shop = env.SHOP_NAME || 'Магазин'
  if (!env.MINI_APP_URL) return sendMessage(env, chatId, NO_APP)

  await setMenuButton(env, chatId)
  await sendMessage(env, chatId, HELLO(shop), {
    reply_markup: {
      inline_keyboard: [[{ text: '🛒 Открыть магазин', web_app: { url: env.MINI_APP_URL } }]],
    },
  })

  // В личном чате id чата и есть id покупателя — по нему и ищем долги.
  if (update.message.chat.type === 'private') await deliverPending(env, chatId)
}
