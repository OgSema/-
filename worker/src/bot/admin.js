/** Админка прямо в чате: добавление товаров, остатки, категории, заказы. */

import { getProduct, listCategories, listProducts, orderItems, saveSession } from '../shop.js'
import { answerCallback, editMessage, sendMessage } from '../telegram.js'

const kb = (rows) => ({ inline_keyboard: rows })
const btn = (text, data) => ({ text, callback_data: data })

const STATUS = { new: 'новый', confirmed: 'подтверждён', done: 'выдан', canceled: 'отменён' }

export const menuKeyboard = () =>
  kb([
    [btn('➕ Добавить товар', 'adm:new')],
    [btn('📦 Товары', 'adm:list'), btn('🗂 Категории', 'adm:cats')],
    [btn('🧾 Заказы', 'adm:orders')],
    [btn('◀️ Меню', 'menu')],
  ])

export async function showMenu(env, chatId, messageId) {
  const text = '⚙️ <b>Админка</b>\n\nДобавляй товары и следи за заказами.'
  return messageId
    ? editMessage(env, chatId, messageId, text, { reply_markup: menuKeyboard() })
    : sendMessage(env, chatId, text, { reply_markup: menuKeyboard() })
}

async function showProducts(env, chatId, messageId) {
  const products = await listProducts(env.DB, { all: true })
  const text = products.length
    ? '📦 <b>Товары</b>\n\nНажми на товар, чтобы изменить остаток, скрыть или удалить.'
    : '📦 <b>Товары</b>\n\nПока пусто — добавь первый.'
  const rows = products.map((p) => [
    btn(`${p.is_active ? '' : '🚫 '}${p.name} · ${p.price} ₽ · ${p.stock} шт.`, `adm:p:${p.id}`),
  ])
  return editMessage(env, chatId, messageId, text, {
    reply_markup: kb([...rows, [btn('➕ Добавить', 'adm:new')], [btn('◀️ Админка', 'adm')]]),
  })
}

async function showProduct(env, chatId, messageId, id) {
  const p = await getProduct(env.DB, id)
  if (!p) return editMessage(env, chatId, messageId, 'Товар не найден', { reply_markup: menuKeyboard() })

  const text =
    `<b>${p.name}</b>\n${[p.brand, p.flavor, p.weight].filter(Boolean).join(' · ')}\n\n` +
    `Цена: <b>${p.price} ₽</b>\nОстаток: <b>${p.stock}</b> шт.\n` +
    `В каталоге: ${p.is_active ? 'да' : 'нет'}${p.photo_url ? '\nФото: есть' : '\nФото: нет'}`

  return editMessage(env, chatId, messageId, text, {
    reply_markup: kb([
      [btn('−1', `adm:stock:${p.id}:-1`), btn('Остаток', 'noop'), btn('+1', `adm:stock:${p.id}:1`)],
      [btn('−10', `adm:stock:${p.id}:-10`), btn('+10', `adm:stock:${p.id}:10`)],
      [btn(p.is_active ? '🚫 Скрыть' : '✅ Показать', `adm:toggle:${p.id}`)],
      [btn('🗑 Удалить', `adm:del:${p.id}`)],
      [btn('◀️ К товарам', 'adm:list')],
    ]),
  })
}

async function showCategories(env, chatId, messageId) {
  const categories = await listCategories(env.DB)
  return editMessage(env, chatId, messageId,
    '🗂 <b>Категории</b>\n\nНажми, чтобы удалить. Товары из удалённой категории останутся в каталоге.',
    {
      reply_markup: kb([
        ...categories.map((c) => [btn(`🗑 ${c.name}`, `adm:cat_del:${c.id}`)]),
        [btn('➕ Новая категория', 'adm:cat_new')],
        [btn('◀️ Админка', 'adm')],
      ]),
    })
}

async function showOrders(env, chatId, messageId) {
  const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 10').all()
  if (!results.length) {
    return editMessage(env, chatId, messageId, '🧾 <b>Заказы</b>\n\nПока пусто.',
      { reply_markup: kb([[btn('◀️ Админка', 'adm')]]) })
  }

  const blocks = []
  for (const o of results) {
    const items = await orderItems(env.DB, o.id)
    blocks.push(
      `<b>№${o.id}</b> · ${STATUS[o.status]}\n` +
      `${o.customer_name}${o.username ? ` @${o.username}` : ''}\n` +
      items.map((i) => `  ${i.name} — ${i.qty} × ${i.price} ₽`).join('\n') +
      `\n  <b>${o.total} ₽</b>`,
    )
  }

  return editMessage(env, chatId, messageId, `🧾 <b>Заказы</b>\n\n${blocks.join('\n\n')}`, {
    reply_markup: kb([
      ...results.slice(0, 5).map((o) => [
        btn(`№${o.id}: подтвердить`, `adm:o:${o.id}:confirmed`),
        btn('выдан', `adm:o:${o.id}:done`),
        btn('отмена', `adm:o:${o.id}:canceled`),
      ]),
      [btn('◀️ Админка', 'adm')],
    ]),
  })
}

// ---------- пошаговое добавление товара ----------

const STEPS = {
  name: 'Название товара?\n\nНапример: Darkside Base Supernova',
  price: 'Цена в рублях? Только число.',
  stock: 'Сколько штук в наличии? Только число.',
  photo: 'Пришли фото товара.\n\nИли отправь «-», чтобы обойтись без него.',
}

export async function startNewProduct(env, chatId, messageId) {
  await saveSession(env.DB, chatId, { state: { flow: 'new_product', step: 'name', draft: {} }, cart: {} })
  return editMessage(env, chatId, messageId, `➕ <b>Новый товар</b>\n\n${STEPS.name}`,
    { reply_markup: kb([[btn('Отмена', 'adm')]]) })
}

/** Обрабатывает текст/фото в диалоге добавления. Возвращает true, если сообщение поглощено. */
export async function handleDialog(env, message, session) {
  const { state, cart } = session
  if (state.flow !== 'new_product') return false

  const chatId = message.chat.id
  const text = (message.text || '').trim()
  const draft = state.draft || {}

  const ask = async (step, extra = '') => {
    await saveSession(env.DB, chatId, { state: { ...state, step, draft }, cart })
    await sendMessage(env, chatId, extra + STEPS[step], { reply_markup: kb([[btn('Отмена', 'adm')]]) })
  }

  if (text === '/cancel') {
    await saveSession(env.DB, chatId, { state: {}, cart })
    await sendMessage(env, chatId, 'Отменил.', { reply_markup: menuKeyboard() })
    return true
  }

  switch (state.step) {
    case 'name': {
      if (!text) return true
      draft.name = text
      await ask('price')
      return true
    }
    case 'price': {
      const price = Number(text.replace(/\s/g, ''))
      if (!Number.isFinite(price) || price < 0) {
        await sendMessage(env, chatId, 'Нужно число. ' + STEPS.price)
        return true
      }
      draft.price = Math.round(price)
      await ask('stock')
      return true
    }
    case 'stock': {
      const stock = Number(text.replace(/\s/g, ''))
      if (!Number.isInteger(stock) || stock < 0) {
        await sendMessage(env, chatId, 'Нужно целое число. ' + STEPS.stock)
        return true
      }
      draft.stock = stock

      const categories = await listCategories(env.DB)
      if (!categories.length) {
        await ask('photo')
        return true
      }
      await saveSession(env.DB, chatId, { state: { ...state, step: 'category', draft }, cart })
      await sendMessage(env, chatId, 'Категория?', {
        reply_markup: kb([
          ...categories.map((c) => [btn(c.name, `adm:pick_cat:${c.id}`)]),
          [btn('Без категории', 'adm:pick_cat:0')],
        ]),
      })
      return true
    }
    case 'photo': {
      const photo = message.photo?.[message.photo.length - 1]
      if (photo) draft.photo_url = photo.file_id
      else if (text !== '-') {
        await sendMessage(env, chatId, STEPS.photo)
        return true
      }
      await finish(env, chatId, draft, cart)
      return true
    }
    default:
      return false
  }
}

export async function pickCategory(env, chatId, messageId, categoryId, session) {
  const draft = { ...(session.state.draft || {}), category_id: categoryId || null }
  await saveSession(env.DB, chatId, { state: { ...session.state, step: 'photo', draft }, cart: session.cart })
  await editMessage(env, chatId, messageId, 'Категория выбрана.')
  await sendMessage(env, chatId, STEPS.photo, { reply_markup: kb([[btn('Отмена', 'adm')]]) })
}

async function finish(env, chatId, draft, cart) {
  await env.DB.prepare(
    `INSERT INTO products (name, category_id, brand, flavor, weight, price, description, photo_url, stock, is_active)
     VALUES (?, ?, '', '', '', ?, '', ?, ?, 1)`,
  ).bind(draft.name, draft.category_id || null, draft.price || 0, draft.photo_url || '', draft.stock || 0).run()

  await saveSession(env.DB, chatId, { state: {}, cart })
  await sendMessage(env, chatId,
    `✅ <b>${draft.name}</b> добавлен: ${draft.price} ₽, ${draft.stock} шт.\n\nТовар уже виден покупателям.`,
    { reply_markup: menuKeyboard() })
}

// ---------- обработка нажатий ----------

export async function handleCallback(env, query, action, session) {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const [key, a, b] = action.split(':')

  switch (key) {
    case undefined:
    case '':
      return showMenu(env, chatId, messageId)
    case 'new':
      return startNewProduct(env, chatId, messageId)
    case 'list':
      return showProducts(env, chatId, messageId)
    case 'p':
      return showProduct(env, chatId, messageId, a)
    case 'stock': {
      await env.DB.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').bind(Number(b), Number(a)).run()
      return showProduct(env, chatId, messageId, a)
    }
    case 'toggle': {
      await env.DB.prepare('UPDATE products SET is_active = 1 - is_active WHERE id = ?').bind(Number(a)).run()
      return showProduct(env, chatId, messageId, a)
    }
    case 'del': {
      await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(Number(a)).run()
      await answerCallback(env, query.id, 'Товар удалён')
      return showProducts(env, chatId, messageId)
    }
    case 'cats':
      return showCategories(env, chatId, messageId)
    case 'cat_new': {
      await saveSession(env.DB, chatId, { state: { flow: 'new_category' }, cart: session.cart })
      return editMessage(env, chatId, messageId, 'Название новой категории?',
        { reply_markup: kb([[btn('Отмена', 'adm')]]) })
    }
    case 'cat_del': {
      await env.DB.batch([
        env.DB.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').bind(Number(a)),
        env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(Number(a)),
      ])
      return showCategories(env, chatId, messageId)
    }
    case 'pick_cat':
      return pickCategory(env, chatId, messageId, Number(a), session)
    case 'orders':
      return showOrders(env, chatId, messageId)
    case 'o': {
      await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(b, Number(a)).run()
      await answerCallback(env, query.id, `Заказ №${a}: ${STATUS[b]}`)
      return showOrders(env, chatId, messageId)
    }
    default:
      return showMenu(env, chatId, messageId)
  }
}

export async function handleCategoryName(env, chatId, name, session) {
  const clean = name.trim()
  if (!clean) return
  const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM categories').all()
  await env.DB.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)').bind(clean, results[0].n).run()
  await saveSession(env.DB, chatId, { state: {}, cart: session.cart })
  await sendMessage(env, chatId, `Категория «${clean}» добавлена.`, { reply_markup: menuKeyboard() })
}
