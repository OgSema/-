const BASE = import.meta.env.VITE_API_URL || ''
const initData = window.Telegram?.WebApp?.initData || ''

// Без таймаута зависший запрос оставляет пустой экран без объяснений:
// у части операторов домен просто не отвечает, и молчать об этом нельзя.
const TIMEOUT = 12000
const UNREACHABLE =
  'Не удалось связаться с сервером.\n\nПроверьте интернет, а если включён VPN — попробуйте его отключить.'

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  if (initData) headers.Authorization = `tma ${initData}`
  if (body) headers['Content-Type'] = 'application/json'

  let res
  const stop = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      signal: stop,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new Error(UNREACHABLE)
  }

  if (!res.ok) {
    let detail = `Ошибка ${res.status}`
    try {
      detail = (await res.json()).detail || detail
    } catch { /* тело не json */ }
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  me: () => request('/api/me'),
  profile: () => request('/api/profile'),

  categories: () => request('/api/categories'),
  createCategory: (data) => request('/api/categories', { method: 'POST', body: data }),
  updateCategory: (id, data) => request(`/api/categories/${id}`, { method: 'PATCH', body: data }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),

  products: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
    return request(`/api/products${qs.toString() ? `?${qs}` : ''}`)
  },
  createProduct: (data) => request('/api/products', { method: 'POST', body: data }),
  updateProduct: (id, data) => request(`/api/products/${id}`, { method: 'PATCH', body: data }),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),

  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/upload', { method: 'POST', form })
  },

  banners: () => request('/api/banners'),
  createBanner: (data) => request('/api/banners', { method: 'POST', body: data }),
  deleteBanner: (id) => request(`/api/banners/${id}`, { method: 'DELETE' }),

  promos: () => request('/api/promos'),
  createPromo: (data) => request('/api/promos', { method: 'POST', body: data }),
  deletePromo: (id) => request(`/api/promos/${id}`, { method: 'DELETE' }),
  checkPromo: (code, items) => request('/api/promos/check', { method: 'POST', body: { code, items } }),

  createOrder: (items, promo_code = '', delivery = {}) =>
    request('/api/orders', { method: 'POST', body: { items, promo_code, ...delivery } }),
  orders: () => request('/api/orders'),
  setOrderStatus: (id, status) => request(`/api/orders/${id}`, { method: 'PATCH', body: { status } }),

  stats: () => request('/api/stats'),
}
