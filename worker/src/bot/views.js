/** Тексты и клавиатуры магазина в чате. */

const kb = (rows) => ({ inline_keyboard: rows })
const btn = (text, data) => ({ text, callback_data: data })

export const AGE_TEXT =
  '<b>MoscowTab</b>\n\nТовары предназначены для лиц старше 18 лет.\nКурение вредит вашему здоровью.'

export const ageKeyboard = () => kb([[btn('Мне есть 18 лет', 'age')]])

export const menuText = (name) =>
  `Привет${name ? ', ' + name : ''}!\n\nВыбирай товары в каталоге — оформим заказ прямо здесь.`

export const menuKeyboard = (isAdmin, cartCount) =>
  kb([
    [btn('🛍 Каталог', 'cat:0')],
    [btn(cartCount ? `🧺 Корзина · ${cartCount}` : '🧺 Корзина', 'cart')],
    ...(isAdmin ? [[btn('⚙️ Админка', 'adm')]] : []),
  ])

export const categoriesKeyboard = (categories, current) =>
  kb([
    [btn(current === 0 ? '• Все товары •' : 'Все товары', 'cat:0')],
    ...categories.map((c) => [btn(current === c.id ? `• ${c.name} •` : c.name, `cat:${c.id}`)]),
    [btn('◀️ Меню', 'menu')],
  ])

export const catalogText = (products, categoryName) => {
  if (!products.length) return `<b>${categoryName}</b>\n\nПока пусто.`
  const lines = products.map((p) => `• <b>${p.name}</b> — ${p.price} ₽`).join('\n')
  return `<b>${categoryName}</b>\n\n${lines}\n\nНажми на товар, чтобы посмотреть подробнее.`
}

export const productsKeyboard = (products, categories, current) =>
  kb([
    ...products.map((p) => [btn(`${p.name} · ${p.price} ₽`, `p:${p.id}`)]),
    ...categoriesKeyboard(categories, current).inline_keyboard,
  ])

export const productText = (p) => {
  const sub = [p.brand, p.flavor, p.weight].filter(Boolean).join(' · ')
  const parts = [`<b>${p.name}</b>`]
  if (sub) parts.push(sub)
  parts.push('', `<b>${p.price} ₽</b>`)
  if (p.stock <= 3) parts.push(`Осталось ${p.stock} шт.`)
  if (p.description) parts.push('', p.description)
  return parts.join('\n')
}

export const productKeyboard = (p, inCart) =>
  kb([
    [btn(inCart ? `В корзине · ${inCart} шт.` : '➕ В корзину', `add:${p.id}`)],
    [btn('🧺 Корзина', 'cart'), btn('🛍 Каталог', `cat:${p.category_id || 0}`)],
  ])

export const cartText = (lines) => {
  if (!lines.length) return '🧺 <b>Корзина пуста</b>\n\nЗагляни в каталог.'
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const body = lines.map((l) => `• ${l.name} — ${l.qty} × ${l.price} ₽ = ${l.qty * l.price} ₽`).join('\n')
  return `🧺 <b>Корзина</b>\n\n${body}\n\n<b>Итого: ${total} ₽</b>`
}

export const cartKeyboard = (lines) =>
  kb([
    ...lines.map((l) => [
      btn('−', `dec:${l.product_id}`),
      btn(`${l.name} · ${l.qty}`, `p:${l.product_id}`),
      btn('+', `inc:${l.product_id}`),
    ]),
    ...(lines.length ? [[btn('✅ Заказать', 'order')], [btn('🗑 Очистить', 'clear')]] : []),
    [btn('🛍 Каталог', 'cat:0'), btn('◀️ Меню', 'menu')],
  ])

export const orderText = (order) => {
  const body = order.items.map((i) => `• ${i.name} — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`).join('\n')
  return `<b>Заказ №${order.id} принят</b>\n\n${body}\n\n<b>Итого: ${order.total} ₽</b>\n\n` +
    'Скоро напишем сюда, чтобы подтвердить детали.'
}

export const backKeyboard = () => kb([[btn('◀️ Меню', 'menu')]])
