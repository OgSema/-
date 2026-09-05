/**
 * Бот — только вход в Mini App.
 *
 * Витрина, корзина и админка живут в приложении; здесь остаётся приветствие
 * с кнопкой «Открыть магазин» и та же кнопка в меню рядом с полем ввода.
 * Уведомления о заказах шлёт notify.js, к этому файлу они не относятся.
 */

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
  return sendMessage(env, chatId, HELLO(shop), {
    reply_markup: {
      inline_keyboard: [[{ text: '🛒 Открыть магазин', web_app: { url: env.MINI_APP_URL } }]],
    },
  })
}
