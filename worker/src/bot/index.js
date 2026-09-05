/**
 * Магазин прямо в чате бота.
 *
 * Зачем: Mini App грузится браузером телефона, и если провайдер режет домен
 * приложения, покупатель видит пустой экран. В чате телефон общается только
 * с Telegram, а до нашего Worker достукивается сам Telegram — блокировка
 * домена перестаёт мешать.
 */

import { adminIds } from '../auth.js'
import { createOrder, getProduct, getSession, listCategories, listProducts, saveSession } from '../shop.js'
import { notifyAdmin } from '../notify.js'
import { answerCallback, editMessage, sendMessage, sendPhoto, setMenuButton } from '../telegram.js'
import * as admin from './admin.js'
import * as v from './views.js'

const isAdmin = (env, id) => adminIds(env).has(String(id))
const cartCount = (cart) => Object.values(cart).reduce((a, b) => a + b, 0)

async function cartLines(db, cart) {
  const lines = []
  for (const [id, qty] of Object.entries(cart)) {
    const p = await getProduct(db, id)
    if (p) lines.push({ product_id: p.id, name: p.name, price: p.price, qty, stock: p.stock })
  }
  return lines
}

const showMenu = async (env, chatId, messageId, user, cart) => {
  const text = v.menuText(user.first_name)
  const markup = { reply_markup: v.menuKeyboard(isAdmin(env, user.id), cartCount(cart)) }
  return messageId
    ? editMessage(env, chatId, messageId, text, markup)
    : sendMessage(env, chatId, text, markup)
}

async function showCatalog(env, chatId, messageId, categoryId) {
  const [categories, products] = await Promise.all([
    listCategories(env.DB),
    listProducts(env.DB, { categoryId: categoryId || null }),
  ])
  const name = categoryId ? categories.find((c) => c.id === categoryId)?.name || 'Каталог' : 'Все товары'
  return editMessage(env, chatId, messageId, v.catalogText(products, name), {
    reply_markup: v.productsKeyboard(products, categories, categoryId),
  })
}

async function showProduct(env, chatId, productId, cart) {
  const p = await getProduct(env.DB, productId)
  if (!p) return sendMessage(env, chatId, 'Товар больше недоступен', { reply_markup: v.backKeyboard() })

  const text = v.productText(p)
  const markup = { reply_markup: v.productKeyboard(p, cart[p.id] || 0) }
  return p.photo_url
    ? sendPhoto(env, chatId, p.photo_url, text, markup)
    : sendMessage(env, chatId, text, markup)
}

async function showCart(env, chatId, messageId, cart) {
  const lines = await cartLines(env.DB, cart)
  return editMessage(env, chatId, messageId, v.cartText(lines), { reply_markup: v.cartKeyboard(lines) })
}

// ---------- входящие сообщения ----------

async function onMessage(env, message) {
  const chatId = message.chat.id
  const user = message.from
  const session = await getSession(env.DB, chatId)
  const text = (message.text || '').trim()

  if (text === '/start') {
    await setMenuButton(env, chatId)
    if (!session.state.adult) {
      return sendMessage(env, chatId, v.AGE_TEXT, { reply_markup: v.ageKeyboard() })
    }
    return showMenu(env, chatId, null, user, session.cart)
  }

  if (text === '/admin' && isAdmin(env, user.id)) return admin.showMenu(env, chatId, null)

  if (session.state.flow === 'new_category' && isAdmin(env, user.id)) {
    return admin.handleCategoryName(env, chatId, text, session)
  }
  if (session.state.flow && isAdmin(env, user.id)) {
    if (await admin.handleDialog(env, message, session)) return
  }

  return showMenu(env, chatId, null, user, session.cart)
}

// ---------- нажатия на кнопки ----------

async function onCallback(env, query) {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const user = query.from
  const data = query.data || ''
  const session = await getSession(env.DB, chatId)
  let { cart } = session

  const persist = (next) => saveSession(env.DB, chatId, { state: session.state, cart: next })

  if (data.startsWith('adm')) {
    if (!isAdmin(env, user.id)) return answerCallback(env, query.id, 'Только для администратора')
    await answerCallback(env, query.id)
    return admin.handleCallback(env, query, data.slice(4), session)
  }

  const [key, arg] = data.split(':')

  switch (key) {
    case 'age': {
      await saveSession(env.DB, chatId, { state: { ...session.state, adult: true }, cart })
      await answerCallback(env, query.id)
      return showMenu(env, chatId, messageId, user, cart)
    }
    case 'menu':
      await answerCallback(env, query.id)
      return showMenu(env, chatId, messageId, user, cart)

    case 'cat':
      await answerCallback(env, query.id)
      return showCatalog(env, chatId, messageId, Number(arg))

    case 'p':
      await answerCallback(env, query.id)
      return showProduct(env, chatId, arg, cart)

    case 'add':
    case 'inc': {
      const p = await getProduct(env.DB, arg)
      const have = cart[arg] || 0
      if (!p || p.stock <= have) return answerCallback(env, query.id, 'Больше нет в наличии')
      cart = { ...cart, [arg]: have + 1 }
      await persist(cart)
      await answerCallback(env, query.id, key === 'add' ? 'Добавлено в корзину' : '')
      return key === 'add'
        ? editMessage(env, chatId, messageId, v.productText(p), {
            reply_markup: v.productKeyboard(p, cart[arg]),
          }).catch(() => showCart(env, chatId, messageId, cart))
        : showCart(env, chatId, messageId, cart)
    }
    case 'dec': {
      const qty = (cart[arg] || 0) - 1
      cart = { ...cart }
      if (qty > 0) cart[arg] = qty
      else delete cart[arg]
      await persist(cart)
      await answerCallback(env, query.id)
      return showCart(env, chatId, messageId, cart)
    }
    case 'clear':
      await persist({})
      await answerCallback(env, query.id, 'Корзина очищена')
      return showCart(env, chatId, messageId, {})

    case 'cart':
      await answerCallback(env, query.id)
      return showCart(env, chatId, messageId, cart)

    case 'order': {
      const lines = await cartLines(env.DB, cart)
      try {
        const order = await createOrder(env, {
          id: user.id,
          username: user.username || '',
          name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        }, lines.map((l) => ({ product_id: l.product_id, qty: l.qty })))

        await persist({})
        await answerCallback(env, query.id, 'Заказ отправлен')
        await editMessage(env, chatId, messageId, v.orderText(order), { reply_markup: v.backKeyboard() })
        return notifyAdmin(env, order)
      } catch (e) {
        return answerCallback(env, query.id, e.message)
      }
    }
    default:
      return answerCallback(env, query.id)
  }
}

export async function handleUpdate(env, update) {
  try {
    if (update.callback_query) return await onCallback(env, update.callback_query)
    if (update.message) return await onMessage(env, update.message)
  } catch (e) {
    console.error('bot update failed', e)
  }
}
