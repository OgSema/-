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

// 5. Уборка тестовых товаров
for (const id of [created.id, hidden.id]) await call(`/api/products/${id}`, ADMIN, { method: 'DELETE' })

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
