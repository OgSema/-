/**
 * Прогон магазина в чате: апдейты шлём в вебхук, исходящие вызовы Telegram
 * ловит мок (tests/mock.mjs), запущенный на TELEGRAM_API_BASE.
 */

import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8787'
const SECRET = process.env.WEBHOOK_SECRET || 'testsecret'
const LOG = process.env.TG_LOG || '/tmp/tgcalls.jsonl'
const CUSTOMER = { id: 777, first_name: 'Иван', username: 'ivan' }
const ADMIN = { id: 7500381413, first_name: 'Vivi', username: 'wwestwoods' }

let seen = 0
const calls = () => {
  const all = fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const fresh = all.slice(seen)
  seen = all.length
  return fresh
}

const post = async (update) => {
  await fetch(BASE + '/tg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
    body: JSON.stringify(update),
  })
  await new Promise((r) => setTimeout(r, 350))
  return calls()
}

let id = 0
const message = (from, text, extra = {}) =>
  post({ update_id: ++id, message: { message_id: ++id, chat: { id: from.id }, from, text, ...extra } })
const press = (from, data) =>
  post({
    update_id: ++id,
    callback_query: { id: `q${id}`, from, data, message: { message_id: 500, chat: { id: from.id } } },
  })

const texts = (list) => list.map((c) => String(c.payload.text || c.payload.caption || '')).join('\n---\n')
const buttons = (list) =>
  list.flatMap((c) => (c.payload.reply_markup?.inline_keyboard || []).flat()).map((b) => b.text + '|' + b.callback_data)

let failed = false
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed = true
}

// ---------- покупатель ----------

check('возрастной гейт на /start', texts(await message(CUSTOMER, '/start')).includes('старше 18'))

const menu = await press(CUSTOMER, 'age')
check('после подтверждения — меню', texts(menu).includes('каталоге'))
check('покупателю не показывают админку', !buttons(menu).some((b) => b.includes('adm')))

const catalog = await press(CUSTOMER, 'cat:0')
const productBtn = buttons(catalog).find((b) => b.includes('|p:'))
check('каталог отдаёт товары кнопками', !!productBtn, productBtn)
const productId = productBtn?.split('|p:')[1]

const card = await press(CUSTOMER, `p:${productId}`)
check('карточка товара с ценой', /\d+ ₽/.test(texts(card)))

const added = await press(CUSTOMER, `add:${productId}`)
check('товар кладётся в корзину', buttons(added).some((b) => b.startsWith('В корзине')))

const cart = await press(CUSTOMER, 'cart')
check('в корзине есть итог и кнопка заказа', /Итого/.test(texts(cart)) && buttons(cart).some((b) => b.includes('|order')))

const ordered = await press(CUSTOMER, 'order')
check('заказ подтверждён покупателю', /Заказ №\d+ принят/.test(texts(ordered)))
check('админу ушло уведомление', texts(ordered).includes('Новый заказ'))

const emptyCart = await press(CUSTOMER, 'cart')
check('после заказа корзина пуста', texts(emptyCart).includes('Корзина пуста'))

// ---------- админ ----------

const admMenu = await message(ADMIN, '/admin')
check('админ видит админку', texts(admMenu).includes('Админка'))

check('спрашивает название', texts(await press(ADMIN, 'adm:new')).includes('Название'))
check('спрашивает цену', texts(await message(ADMIN, 'Тестовый из бота')).includes('Цена'))
check('не принимает нечисловую цену', texts(await message(ADMIN, 'дорого')).includes('Нужно число'))
check('спрашивает остаток', texts(await message(ADMIN, '999')).includes('наличии'))
check('предлагает категорию', buttons(await message(ADMIN, '3')).some((b) => b.includes('pick_cat')))
check('просит фото', texts(await press(ADMIN, 'adm:pick_cat:0')).includes('фото'))
const created = await message(ADMIN, '-')
check('товар создан', texts(created).includes('Тестовый из бота') && texts(created).includes('999 ₽'))

const list = await press(ADMIN, 'adm:list')
check('новый товар в списке админки', buttons(list).some((b) => b.includes('Тестовый из бота')))

const orders = await press(ADMIN, 'adm:orders')
check('заказ виден в админке', /№\d+/.test(texts(orders)))
check('статус переключается', texts(await press(ADMIN, `adm:o:1:confirmed`)).includes('подтверждён'))

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
