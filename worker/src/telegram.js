const api = (env, method) => `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`

export async function sendMessage(env, chatId, text, replyMarkup) {
  if (!env.BOT_TOKEN || !chatId) return false
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }
  if (replyMarkup) body.reply_markup = replyMarkup

  const res = await fetch(api(env, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // Частый случай: покупатель не нажимал /start, бот не может ему написать.
  return res.ok
}

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
  return fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.result.file_path}`)
}
