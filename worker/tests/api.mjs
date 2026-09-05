import crypto from 'node:crypto'

const BASE = 'http://localhost:8787'
const TOKEN = '111111:TEST-TOKEN'
const ADMIN = Number(process.env.ADMIN_ID || 7500381413)
const CUSTOMER = 800000 + Math.floor(Math.random() * 100000)

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
check('админ узнан по подписи', (await (await call('/api/me', ADMIN)).json()).is_admin === true)
check('обычный юзер не админ', (await (await call('/api/me', CUSTOMER)).json()).is_admin === false)

// 2. Права
const body = JSON.stringify({ name: 'Проверочный табак', price: 1200, stock: 2, brand: 'Darkside' })
check('покупатель не может создать товар', (await call('/api/products', CUSTOMER, { method: 'POST', body })).status === 403)
const created = await (await call('/api/products', ADMIN, { method: 'POST', body })).json()
check('админ создал товар', created.id > 0, JSON.stringify(created).slice(0, 90))

const hidden = await (await call('/api/products', ADMIN, {
  method: 'POST', body: JSON.stringify({ name: 'Скрытый', price: 10, stock: 0 }),
})).json()
const visible = (await (await call('/api/products', CUSTOMER)).json()).map((p) => p.id)
check('товар без остатка скрыт от покупателя', !visible.includes(hidden.id) && visible.includes(created.id))

// 3. Заказ
// Имя в форме нарочно отличается от имени в initData («Иван»).
const DELIVERY = { name: 'Пётр', comment: 'после 18:00' }

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

const again = await call('/api/orders', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: created.id, qty: 1 }], ...DELIVERY }),
})
check('остаток списан, повторный заказ отклонён', again.status === 409, (await again.json()).detail)

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
  method: 'POST', body: JSON.stringify({ name: 'Товар для промо', price: 1000, stock: 10 }),
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
  method: 'POST', body: JSON.stringify({ name: 'Товар для уровней', price: 1000, stock: 60 }),
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
  method: 'POST', body: JSON.stringify({ name: 'Кальян в сборе', price: 20000, stock: 3 }),
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

// 8. Уборка тестовых данных
for (const id of [promo.id, expired.id, bigOff.id, limited.id, weak.id, strong.id]) {
  await call(`/api/promos/${id}`, ADMIN, { method: 'DELETE' })
}
for (const id of [created.id, hidden.id, promoItem.id, loyaltyItem.id, vipItem.id]) {
  await call(`/api/products/${id}`, ADMIN, { method: 'DELETE' })
}

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
