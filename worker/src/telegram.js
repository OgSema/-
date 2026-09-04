const base = (env) => env.TELEGRAM_API_BASE || 'https://api.telegram.org'
const api = (env, method) => `${base(env)}/bot${env.BOT_TOKEN}/${method}`

export async function call(env, method, payload) {
  if (!env.BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не настроен' }
  const res = await fetch(api(env, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json().catch(() => ({ ok: false }))
}

export async function sendMessage(env, chatId, text, extra = {}) {
  if (!chatId) return false
  // Частый случай: покупатель не нажимал /start — тогда бот не может ему написать.
  const r = await call(env, 'sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra,
  })
  return !!r.ok
}

export const editMessage = (env, chatId, messageId, text, extra = {}) =>
  call(env, 'editMessageText', {
    chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML',
    disable_web_page_preview: true, ...extra,
  })

export const sendPhoto = (env, chatId, photo, caption, extra = {}) =>
  call(env, 'sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra })

export const answerCallback = (env, id, text) =>
  call(env, 'answerCallbackQuery', { callback_query_id: id, text, show_alert: false })

export const deleteMessage = (env, chatId, messageId) =>
  call(env, 'deleteMessage', { chat_id: chatId, message_id: messageId })

/** Фото храним в самом Telegram: возвращает file_id загруженной картинки. */
export async function uploadPhoto(env, chatId, file) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('photo', file, file.name || 'photo.jpg')

  const res = await fetch(api(env, 'sendPhoto'), { method: 'POST', body: form })
  const data = await res.json()
  if (!data.ok) throw new Error(data.description || 'Telegram отказался принять фото')

  const sizes = data.result.photo
  return sizes[sizes.length - 1].file_id
}

/** Отдаёт содержимое фото по file_id (ссылки Telegram живут недолго, поэтому резолвим каждый раз). */
export async function fetchPhoto(env, fileId) {
  const info = await (await fetch(api(env, 'getFile') + `?file_id=${encodeURIComponent(fileId)}`)).json()
  if (!info.ok) return null
  return fetch(`${base(env)}/file/bot${env.BOT_TOKEN}/${info.result.file_path}`)
}
