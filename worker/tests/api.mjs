import crypto from 'node:crypto'
import fs from 'node:fs'

const BASE = 'http://localhost:8787'
const TOKEN = '111111:TEST-TOKEN'
const LOG = process.env.TG_LOG || '/tmp/tgcalls.jsonl'
// Админов может быть несколько: список берём из конфига, иначе тест
// устаревает при каждом добавлении нового.
const ADMIN_IDS = fs
  .readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  .match(/ADMIN_IDS\s*=\s*"([^"]+)"/)[1]
  .split(',').map((s) => s.trim()).filter(Boolean)
const ADMIN = Number(process.env.ADMIN_ID || ADMIN_IDS[0])
const CUSTOMER = 800000 + Math.floor(Math.random() * 100000)

// Исходящие вызовы бота ловит мок (tests/mock.mjs). Журнал общий с bot.mjs,
// поэтому читаем только то, что дописано с прошлого взгляда.
let seen = 0
const tgCalls = () => {
  const all = (() => {
    try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean) } catch { return [] }
  })().map((l) => JSON.parse(l))
  const fresh = all.slice(seen)
  seen = all.length
  return fresh
}

const initData = (id, username = '') => {
  const f = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAA',
    user: JSON.stringify({ id, first_name: 'Иван', username }),
  }
  const dcs = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest()
  f.hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex')
  return new URLSearchParams(f).toString()
}

const call = (path, id, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: {
      Authorization: `tma ${typeof id === 'string' ? id : initData(id, opts.username)}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

let failed = false
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} ${detail}`)
  if (!ok) failed = true
}

// 1. Подпись
check('битая подпись отклонена', (await call('/api/me', 'user=%7B%22id%22%3A1%7D&hash=deadbeef')).status === 401)
check('без заголовка отклонён', (await fetch(BASE + '/api/me', { headers: { Authorization: 'x' } })).status === 401)
for (const id of ADMIN_IDS) {
  check(`админ ${id} узнан по подписи`, (await (await call('/api/me', Number(id))).json()).is_admin === true)
}
check('обычный юзер не админ', (await (await call('/api/me', CUSTOMER)).json()).is_admin === false)

// 2. Права
// Витрина построена на разделах: товар без раздела сервер не принимает.
const cat = await (await call('/api/categories', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Проверочный раздел ' + Math.random().toString(36).slice(2, 7) }),
})).json()
check('админ создал раздел', cat.id > 0, JSON.stringify(cat).slice(0, 80))
check('покупатель не может менять раздел', (await call(`/api/categories/${cat.id}`, CUSTOMER, {
  method: 'PATCH', body: JSON.stringify({ photo_url: '/photo/x' }),
})).status === 403)
const covered = await (await call(`/api/categories/${cat.id}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ photo_url: '/photo/cover' }),
})).json()
check('заставка раздела сохранена', covered.photo_url === '/photo/cover', covered.photo_url)
check('заставка видна покупателю',
  (await (await call('/api/categories', CUSTOMER)).json()).find((x) => x.id === cat.id)?.photo_url === '/photo/cover')
const bare = await (await call(`/api/categories/${cat.id}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ photo_url: '' }),
})).json()
check('заставку можно убрать', bare.photo_url === '' && bare.name === cat.name)

check('товар без раздела отклонён', (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Ничей', price: 10, stock: 1 }),
})).status === 400)
check('товар в несуществующий раздел отклонён', (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Ничей', price: 10, stock: 1, category_id: 10 ** 9 }),
})).status === 400)

const body = JSON.stringify({ name: 'Проверочный табак', price: 1200, cost: 700, stock: 2, category_id: cat.id })
check('покупатель не может создать товар', (await call('/api/products', CUSTOMER, { method: 'POST', body })).status === 403)
const created = await (await call('/api/products', ADMIN, { method: 'POST', body })).json()
check('админ создал товар', created.id > 0, JSON.stringify(created).slice(0, 90))
check('закупка сохранена и видна админу', created.cost === 700, String(created.cost))
check('закупка не уходит покупателю',
  (await (await call('/api/products', CUSTOMER)).json()).every((p) => p.cost === undefined))

// Закончившийся товар остаётся на витрине под печатью SOLD OUT, а прячет
// позицию только снятая галочка «в продаже».
const soldOut = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Кончился', price: 10, stock: 0, category_id: cat.id }),
})).json()
const hidden = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Скрытый', price: 10, stock: 5, is_active: false, category_id: cat.id }),
})).json()
const visible = (await (await call('/api/products', CUSTOMER)).json()).map((p) => p.id)
check('товар без остатка виден покупателю', visible.includes(soldOut.id))
check('снятый с продажи товар покупателю не виден',
  !visible.includes(hidden.id) && visible.includes(created.id))

// 3. Заказ
// Имя в форме нарочно отличается от имени в initData («Иван»).
const DELIVERY = { name: 'Пётр', comment: 'после 18:00' }

check('заказать то, чего нет, нельзя', (await call('/api/orders', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: soldOut.id, qty: 1 }], ...DELIVERY }),
})).status === 409)

tgCalls()
const orderRes = await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: [{ product_id: created.id, qty: 2 }], ...DELIVERY }),
})
const order = await orderRes.json()
check('заказ создан', orderRes.status === 200, JSON.stringify(order).slice(0, 120))
check('сумма посчитана по базе', order.total === 2400, String(order.total))
check('состав заказа сохранён', order.items?.length === 1)
check('имя и комментарий сохранены',
  order.customer_name === DELIVERY.name && order.comment === DELIVERY.comment,
  `${order.customer_name} / ${order.comment}`)

// Заказ уходит каждому админу, а не только первому в списке.
const notified = tgCalls().filter((c) => c.method === 'sendMessage').map((c) => String(c.payload.chat_id))
check('заказ ушёл каждому админу', ADMIN_IDS.every((id) => notified.includes(id)), notified.join(', '))
check('покупатель получил подтверждение', notified.includes(String(CUSTOMER)), notified.join(', '))

const again = await call('/api/orders', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: created.id, qty: 1 }], ...DELIVERY }),
})
check('остаток списан, повторный заказ отклонён', again.status === 409, (await again.json()).detail)

// 3a. Покупатель, который ни разу не писал боту: в магазин можно зайти
// с иконки или из профиля, минуя чат, и тогда бот не вправе ему писать.
// Заказ всё равно принимается, а подтверждение ждёт первого сообщения.
const MUTED = Number(process.env.TG_MUTED || 909090)
// Мок живёт дольше одного прогона: возвращаем ему молчание, иначе со второго
// раза подтверждение «дойдёт» и проверка станет бессмысленной.
await fetch((process.env.TELEGRAM_API_BASE || 'http://localhost:9099') + '/mute').catch(() => {})
const forMuted = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Молчуну', price: 100, stock: 1, category_id: cat.id }),
})).json()

tgCalls()
const mutedOrder = await (await call('/api/orders', MUTED, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: forMuted.id, qty: 1 }], ...DELIVERY }),
})).json()
check('заказ принят и без переписки с ботом', mutedOrder.id > 0, JSON.stringify(mutedOrder).slice(0, 100))
check('подтверждение не дошло', mutedOrder.customer_notified === false, String(mutedOrder.customer_notified))
check('админ заказ всё равно получил', mutedOrder.admin_notified === true)

const owed = (await (await call('/api/orders', ADMIN)).json()).find((o) => o.id === mutedOrder.id)
check('долг перед покупателем записан', owed?.customer_notified === 0, String(owed?.customer_notified))

// Покупатель написал боту — право писать появилось, подтверждение уходит следом.
tgCalls()
await fetch(BASE + '/tg', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Telegram-Bot-Api-Secret-Token': process.env.WEBHOOK_SECRET || 'testsecret',
  },
  body: JSON.stringify({
    update_id: 1,
    message: { message_id: 1, chat: { id: MUTED, type: 'private' }, from: { id: MUTED }, text: '/start' },
  }),
})
await new Promise((r) => setTimeout(r, 500))
const afterStart = tgCalls().filter((c) => c.method === 'sendMessage' && Number(c.payload.chat_id) === MUTED)
check('после первого сообщения подтверждение дослано',
  afterStart.some((c) => c.payload.text.includes(`Заказ №${mutedOrder.id} принят`)),
  afterStart.map((c) => c.payload.text.slice(0, 30)).join(' | '))

const settled = (await (await call('/api/orders', ADMIN)).json()).find((o) => o.id === mutedOrder.id)
check('долг закрыт', settled?.customer_notified === 1, String(settled?.customer_notified))

// Товар больше не нужен: пустой остаток вытеснял бы чужие позиции из сводки.
await call(`/api/products/${forMuted.id}`, ADMIN, { method: 'DELETE' })

// 3b. Загрузка картинки. Вырезанный на айфоне объект — PNG с прозрачным фоном:
// sendPhoto пережал бы его в JPEG и залил фон чёрным, поэтому такие уходят
// документом. Обычный снимок остаётся фотографией.
const upload = async (id, name, type, bytes) => {
  const form = new FormData()
  form.append('file', new File([bytes], name, { type }), name)
  return fetch(BASE + '/api/upload', {
    method: 'POST', body: form, headers: { Authorization: `tma ${initData(id)}` },
  })
}
const PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
), (ch) => ch.charCodeAt(0))

check('покупатель не может грузить фото', (await upload(CUSTOMER, 'x.png', 'image/png', PNG)).status === 403)

tgCalls()
const pngUp = await upload(ADMIN, 'cutout.png', 'image/png', PNG)
const pngBody = await pngUp.json()
const pngCall = tgCalls().find((c) => c.method === 'sendDocument' || c.method === 'sendPhoto')
check('прозрачный PNG уходит документом', pngCall?.method === 'sendDocument', pngCall?.method)
check('ссылка на фото ведёт на file_id документа', pngBody.url === '/photo/FAKE_DOC_ID', pngBody.url)

tgCalls()
const jpgUp = await upload(ADMIN, 'photo.jpg', 'image/jpeg', PNG)
const jpgBody = await jpgUp.json()
const jpgCall = tgCalls().find((c) => c.method === 'sendDocument' || c.method === 'sendPhoto')
check('обычный снимок уходит фотографией', jpgCall?.method === 'sendPhoto', jpgCall?.method)
check('ссылка на снимок ведёт на file_id фото', jpgBody.url === '/photo/FAKE_FILE_ID', jpgBody.url)

// 4. Заказы только для админа
check('покупатель не видит заказы', (await call('/api/orders', CUSTOMER)).status === 403)
const orders = await (await call('/api/orders', ADMIN)).json()
check('админ видит заказ с составом', orders.length > 0 && orders[0].items.length === 1)
const patched = await (await call(`/api/orders/${order.id}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ status: 'done' }),
})).json()
check('статус меняется', patched.status === 'done')
check('плохой статус отклонён', (await call(`/api/orders/${order.id}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ status: 'hacked' }),
})).status === 400)

// 5. Промокоды
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const rnd = () => Math.floor(Math.random() * 100000)
const mkPromo = (o) => call('/api/promos', ADMIN, { method: 'POST', body: JSON.stringify(o) })

check('покупатель не может создать промокод', (await call('/api/promos', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ code: 'HACK', kind: 'percent', value: 50, starts_at: day(0), ends_at: day(1) }),
})).status === 403)

check('процент больше 100 отклонён',
  (await mkPromo({ code: 'TOOMUCH', kind: 'percent', value: 150, starts_at: day(0), ends_at: day(1) })).status === 400)

check('конец раньше начала отклонён',
  (await mkPromo({ code: 'BACKWARDS', kind: 'percent', value: 10, starts_at: day(5), ends_at: day(1) })).status === 400)

const code10 = 'TEST' + rnd()
const promo = await (await mkPromo({ code: code10.toLowerCase(), kind: 'percent', value: 10, starts_at: day(-1), ends_at: day(7) })).json()
check('промокод создан, код приведён к верхнему регистру', promo.code === code10, promo.code)

const expired = await (await mkPromo({ code: 'OLD' + rnd(), kind: 'amount', value: 300, starts_at: day(-10), ends_at: day(-2) })).json()
const bigOff = await (await mkPromo({ code: 'BIG' + rnd(), kind: 'amount', value: 5000, starts_at: day(-1), ends_at: day(7) })).json()

// Товар ровно за 1000 ₽ — на нём удобно считать скидки.
const promoItem = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Товар для промо', price: 1000, stock: 10, category_id: cat.id }),
})).json()
const oneItem = [{ product_id: promoItem.id, qty: 1 }]
const checkCode = (code) => call('/api/promos/check', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ code, items: oneItem }),
})

const checked = await (await checkCode(code10)).json()
check('скидка 10% посчитана сервером', checked.discount === 100 && checked.total === 900, JSON.stringify(checked))
check('код регистронезависим', (await (await checkCode(code10.toLowerCase())).json()).discount === 100)
check('истёкший код не принимается', (await checkCode(expired.code)).status === 404)
check('несуществующий код не принимается', (await checkCode('NETAKOGO')).status === 404)

const capped = await (await checkCode(bigOff.code)).json()
check('скидка не больше суммы заказа', capped.discount === 1000 && capped.total === 0, JSON.stringify(capped))

const discounted = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: code10, ...DELIVERY }),
})).json()
check('заказ сохранил скидку', discounted.total === 900 && discounted.discount === 100 && discounted.promo_code === code10,
  `итого ${discounted.total}, скидка ${discounted.discount}`)

const fake = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: 'VYDUMANNYJ', ...DELIVERY }),
})).json()
check('выдуманный код не даёт скидки', fake.total === 1000 && fake.discount === 0)

// 5б. Лимит применений
const limited = await (await mkPromo({
  code: 'LIM' + rnd(), kind: 'amount', value: 100, starts_at: day(-1), ends_at: day(7), max_uses: 1,
})).json()
check('лимит сохранён', limited.max_uses === 1 && limited.used_count === 0, JSON.stringify(limited))
check('отрицательный лимит отклонён', (await mkPromo({
  code: 'NEG' + rnd(), kind: 'amount', value: 100, starts_at: day(-1), ends_at: day(7), max_uses: -1,
})).status === 400)

const beforeLimit = await (await checkCode(limited.code)).json()
check('до исчерпания код виден с остатком', beforeLimit.discount === 100 && beforeLimit.left === 1,
  JSON.stringify(beforeLimit))

const usedOnce = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: limited.code, ...DELIVERY }),
})).json()
check('первый заказ получил скидку по лимитному коду', usedOnce.discount === 100, String(usedOnce.discount))

check('исчерпанный код не проходит проверку', (await checkCode(limited.code)).status === 404)
const afterLimit = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: limited.code, ...DELIVERY }),
})).json()
check('второй заказ по исчерпанному коду без скидки', afterLimit.discount === 0 && afterLimit.total === 1000,
  `итого ${afterLimit.total}, скидка ${afterLimit.discount}`)

const promoList = await (await call('/api/promos', ADMIN)).json()
check('счётчик применений вырос ровно на одно',
  promoList.find((x) => x.id === limited.id)?.used_count === 1)

// 6. Лояльность
const LOYAL = 900000 + rnd()
const loyaltyItem = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Товар для уровней', price: 1000, stock: 60, category_id: cat.id }),
})).json()
const buy = (qty, code = '', id = LOYAL) => call('/api/orders', id, {
  method: 'POST', username: 'loyal',
  body: JSON.stringify({ items: [{ product_id: loyaltyItem.id, qty }], promo_code: code, ...DELIVERY }),
})
const profile = (id = LOYAL) => call('/api/profile', id).then((r) => r.json())
const confirm = (orderId, status) => call(`/api/orders/${orderId}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ status }),
})

const fresh = await profile()
check('новый покупатель без уровня', fresh.spent === 0 && fresh.tier === null && fresh.next.name === 'SILVER',
  JSON.stringify({ spent: fresh.spent, tier: fresh.tier }))

const first = await (await buy(3)).json()
check('заказ создан без скидки', first.total === 3000 && first.discount === 0)
const pending = await profile()
check('неподтверждённый заказ выкуп не даёт', pending.spent === 0 && pending.tier === null, `выкуп ${pending.spent}`)

await confirm(first.id, 'confirmed')
const silver = await profile()
check('после подтверждения выкуп засчитан', silver.spent === 3000, `выкуп ${silver.spent}`)
check('уровень SILVER даёт 5%', silver.tier?.name === 'SILVER' && silver.tier?.percent === 5,
  JSON.stringify(silver.tier))
check('до GOLD показан остаток', silver.next?.name === 'GOLD' && silver.left === 4000,
  `осталось ${silver.left}`)
check('своя история заказов видна', silver.orders.length === 1 && silver.orders[0].items.length === 1)

const withTier = await (await buy(1)).json()
check('скидка уровня применяется сама', withTier.discount === 50 && withTier.total === 950,
  `итого ${withTier.total}, скидка ${withTier.discount}`)
check('в заказе отмечен уровень', withTier.loyalty_tier === 'SILVER' && withTier.promo_code === '')

// Не суммируется: код слабее уровня — применяется уровень, код остаётся целым.
const weak = await (await mkPromo({
  code: 'WEAK' + rnd(), kind: 'percent', value: 3, starts_at: day(-1), ends_at: day(7), max_uses: 1,
})).json()
const weakOrder = await (await buy(1, weak.code)).json()
check('скидка уровня выигрывает у слабого кода',
  weakOrder.discount === 50 && weakOrder.loyalty_tier === 'SILVER' && weakOrder.promo_code === '',
  `скидка ${weakOrder.discount}, код «${weakOrder.promo_code}»`)
const weakAfter = (await (await call('/api/promos', ADMIN)).json()).find((x) => x.id === weak.id)
check('непринятый код не потрачен', weakAfter.used_count === 0, `использован ${weakAfter.used_count}`)

// Код сильнее уровня — тогда уровень уступает, но скидки всё равно не складываются.
const strong = await (await mkPromo({
  code: 'STRONG' + rnd(), kind: 'percent', value: 20, starts_at: day(-1), ends_at: day(7),
})).json()
const strongOrder = await (await buy(1, strong.code)).json()
check('сильный код выигрывает у уровня',
  strongOrder.discount === 200 && strongOrder.promo_code === strong.code && strongOrder.loyalty_tier === '',
  `скидка ${strongOrder.discount}`)

const noName = await (await call('/api/orders', LOYAL, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: loyaltyItem.id, qty: 1 }] }),
})).json()
check('без имени в форме берётся имя из Telegram', noName.customer_name === 'Иван', noName.customer_name)

const preview = await (await call('/api/promos/check', LOYAL, {
  method: 'POST', body: JSON.stringify({ code: weak.code, items: [{ product_id: loyaltyItem.id, qty: 1 }] }),
})).json()
check('проверка кода показывает победившую скидку',
  preview.applied === 'loyalty' && preview.discount === 50 && preview.tier === 'SILVER',
  JSON.stringify(preview))

await confirm(first.id, 'canceled')
const canceled = await profile()
check('отменённый заказ выкуп забирает', canceled.spent === 0 && canceled.tier === null, `выкуп ${canceled.spent}`)

// Верхний уровень: порог 20 000 ₽.
const VIP = 910000 + rnd()
const vipItem = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Кальян в сборе', price: 20000, stock: 3, category_id: cat.id }),
})).json()
const vipOrder = await (await call('/api/orders', VIP, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: vipItem.id, qty: 1 }], ...DELIVERY }),
})).json()
await confirm(vipOrder.id, 'done')
const vip = await profile(VIP)
check('выкуп на 20 000 даёт VIP 25%', vip.tier?.name === 'VIP' && vip.tier?.percent === 25, JSON.stringify(vip.tier))
check('на верхнем уровне полоса залита', vip.next === null && vip.progress === 1)
check('чужие заказы в профиль не попали', vip.orders.every((o) => o.id === vipOrder.id))

// 7. Баннеры
check('покупатель не может добавить баннер', (await call('/api/banners', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ photo_url: '/photo/x' }),
})).status === 403)
check('баннер без картинки отклонён', (await call('/api/banners', ADMIN, {
  method: 'POST', body: JSON.stringify({ photo_url: '' }),
})).status === 400)

const banner = await (await call('/api/banners', ADMIN, {
  method: 'POST', body: JSON.stringify({ photo_url: '/photo/test', sort: 0 }),
})).json()
check('баннер создан', banner.id > 0)
check('баннер виден покупателю', (await (await call('/api/banners', CUSTOMER)).json()).some((b) => b.id === banner.id))
await call(`/api/banners/${banner.id}`, ADMIN, { method: 'DELETE' })
check('баннер удалён', !(await (await call('/api/banners', CUSTOMER)).json()).some((b) => b.id === banner.id))

check('непустой раздел удалить нельзя',
  (await call(`/api/categories/${cat.id}`, ADMIN, { method: 'DELETE' })).status === 409)

// 7б. Сводка админа
check('покупатель не видит сводку', (await call('/api/stats', CUSTOMER)).status === 403)

const statsItem = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Сводочный ' + rnd(), price: 500, cost: 200, stock: 2, category_id: cat.id }),
})).json()

const statsBefore = await (await call('/api/stats', ADMIN)).json()
check('в сводке есть все статусы',
  ['new', 'confirmed', 'done', 'canceled'].every((k) => typeof statsBefore.statuses[k] === 'number'),
  JSON.stringify(statsBefore.statuses))
check('товар на исходе попал в сводку', statsBefore.low.some((p) => p.name === statsItem.name))

const statsOrder = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: statsItem.id, qty: 1 }], ...DELIVERY }),
})).json()
const statsFresh = await (await call('/api/stats', ADMIN)).json()
check('новый заказ виден в сводке',
  statsFresh.statuses.new === statsBefore.statuses.new + 1 && statsFresh.week.orders === statsBefore.week.orders + 1,
  `новых ${statsFresh.statuses.new}, за неделю ${statsFresh.week.orders}`)
// Выкуп — только подтверждённые и выданные, иначе брошенная корзина
// раздувала бы выручку.
check('новый заказ выручку не поднимает', statsFresh.week.revenue === statsBefore.week.revenue,
  `${statsBefore.week.revenue} → ${statsFresh.week.revenue}`)

await call(`/api/orders/${statsOrder.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) })
const statsAfter = await (await call('/api/stats', ADMIN)).json()
check('выданный заказ поднял выручку', statsAfter.week.revenue === statsBefore.week.revenue + statsOrder.total,
  `${statsBefore.week.revenue} + ${statsOrder.total} = ${statsAfter.week.revenue}`)
check('топ отсортирован по количеству',
  statsAfter.top.every((t, i, a) => i === 0 || a[i - 1].qty >= t.qty), JSON.stringify(statsAfter.top))
check('покупатели посчитаны', statsAfter.customers > 0, String(statsAfter.customers))
// 500 продали, 200 закупка — 300 прибыли, скидок на этом заказе не было.
check('прибыль считается по закупке', statsAfter.week.profit === statsBefore.week.profit + 300,
  `${statsBefore.week.profit} → ${statsAfter.week.profit}`)
check('состав заказа без закупки',
  (await (await call('/api/profile', CUSTOMER)).json()).orders[0].items.every((i) => i.cost === undefined))

// Закупка снимается в момент продажи: переторговались — старая прибыль стоит.
await call(`/api/products/${statsItem.id}`, ADMIN, {
  method: 'PATCH', body: JSON.stringify({ name: statsItem.name, price: 500, cost: 450, stock: 1, category_id: cat.id }),
})
const reprised = await (await call('/api/stats', ADMIN)).json()
check('смена закупки не переписывает прошлую прибыль', reprised.week.profit === statsAfter.week.profit,
  `${statsAfter.week.profit} → ${reprised.week.profit}`)
check('склад считается по закупке', reprised.stock.spent >= 450, JSON.stringify(reprised.stock))

// 7.1 Счётчик посетителей: считаем людей, а не открытия.
const VISITOR = 900000 + Math.floor(Math.random() * 100000)
const visitorsNow = async () => (await (await call('/api/stats', ADMIN)).json()).visitors
const before = await visitorsNow()

// Отметка пишется в фоне (waitUntil), поэтому ждём её появления, а не мгновения.
const waitVisitors = async (expected) => {
  for (let i = 0; i < 20; i++) {
    const v = await visitorsNow()
    if (v.today >= expected) return v
    await new Promise((r) => setTimeout(r, 100))
  }
  return visitorsNow()
}

await call('/api/me', VISITOR)
const afterFirst = await waitVisitors(before.today + 1)
check('новый посетитель посчитан', afterFirst.today === before.today + 1,
  `${before.today} → ${afterFirst.today}`)
check('посетитель попал в месяц и всего',
  afterFirst.month === before.month + 1 && afterFirst.total === before.total + 1,
  JSON.stringify(afterFirst))

await call('/api/me', VISITOR)
await new Promise((r) => setTimeout(r, 300))
const afterSecond = await visitorsNow()
check('повторный заход того же человека не считается', afterSecond.today === afterFirst.today,
  `${afterFirst.today} → ${afterSecond.today}`)

await call('/api/me', ADMIN)
await new Promise((r) => setTimeout(r, 300))
const afterAdmin = await visitorsNow()
check('заход админа не считается', afterAdmin.today === afterFirst.today,
  `${afterFirst.today} → ${afterAdmin.today}`)

// 8. Уборка тестовых данных
for (const id of [promo.id, expired.id, bigOff.id, limited.id, weak.id, strong.id]) {
  await call(`/api/promos/${id}`, ADMIN, { method: 'DELETE' })
}
for (const id of [created.id, hidden.id, soldOut.id, promoItem.id, loyaltyItem.id, vipItem.id, statsItem.id]) {
  await call(`/api/products/${id}`, ADMIN, { method: 'DELETE' })
}
check('опустевший раздел удалён',
  (await call(`/api/categories/${cat.id}`, ADMIN, { method: 'DELETE' })).ok)

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
