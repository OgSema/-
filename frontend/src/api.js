const BASE = import.meta.env.VITE_API_URL || ''
const initData = window.Telegram?.WebApp?.initData || ''

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  if (initData) headers.Authorization = `tma ${initData}`
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })

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

  categories: () => request('/api/categories'),
  createCategory: (data) => request('/api/categories', { method: 'POST', body: data }),
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

  createOrder: (items) => request('/api/orders', { method: 'POST', body: { items } }),
  orders: () => request('/api/orders'),
  setOrderStatus: (id, status) => request(`/api/orders/${id}`, { method: 'PATCH', body: { status } }),
}
