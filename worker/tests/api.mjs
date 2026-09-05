import crypto from 'node:crypto'

const BASE = 'http://localhost:8787'
const TOKEN = '111111:TEST-TOKEN'
const ADMIN = Number(process.env.ADMIN_ID || 7500381413)
const CUSTOMER = 777

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
const orderRes = await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: [{ product_id: created.id, qty: 2 }] }),
})
const order = await orderRes.json()
check('заказ создан', orderRes.status === 200, JSON.stringify(order).slice(0, 120))
check('сумма посчитана по базе', order.total === 2400, String(order.total))
check('состав заказа сохранён', order.items?.length === 1)

const again = await call('/api/orders', CUSTOMER, {
  method: 'POST', body: JSON.stringify({ items: [{ product_id: created.id, qty: 1 }] }),
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
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: code10 }),
})).json()
check('заказ сохранил скидку', discounted.total === 900 && discounted.discount === 100 && discounted.promo_code === code10,
  `итого ${discounted.total}, скидка ${discounted.discount}`)

const fake = await (await call('/api/orders', CUSTOMER, {
  method: 'POST', username: 'ivan', body: JSON.stringify({ items: oneItem, promo_code: 'VYDUMANNYJ' }),
})).json()
check('выдуманный код не даёт скидки', fake.total === 1000 && fake.discount === 0)

// 6. Баннеры
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

// 7. Уборка тестовых данных
for (const id of [promo.id, expired.id, bigOff.id]) await call(`/api/promos/${id}`, ADMIN, { method: 'DELETE' })
for (const id of [created.id, hidden.id, promoItem.id]) await call(`/api/products/${id}`, ADMIN, { method: 'DELETE' })

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
