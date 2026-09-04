/**
 * Проверка Telegram Mini App initData.
 *
 * Telegram подписывает initData ключом, производным от токена бота, поэтому
 * подделать её нельзя. Отсюда же берётся user id — он и решает, админ ли это.
 */

const MAX_AGE_SECONDS = 24 * 60 * 60
const enc = new TextEncoder()

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function adminIds(env) {
  return new Set(String(env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean))
}

export async function verifyInitData(initData, env) {
  if (!env.BOT_TOKEN) throw new HttpError(500, 'BOT_TOKEN не настроен')

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  if (!receivedHash) throw new HttpError(401, 'Нет подписи initData')
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secret = await hmac(enc.encode('WebAppData'), env.BOT_TOKEN)
  const expected = toHex(await hmac(secret, dataCheckString))
  if (!timingSafeEqual(expected, receivedHash)) throw new HttpError(401, 'Неверная подпись initData')

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    throw new HttpError(401, 'Сессия истекла, откройте приложение заново')
  }

  let user
  try {
    user = JSON.parse(params.get('user'))
  } catch {
    throw new HttpError(401, 'В initData нет пользователя')
  }

  return buildUser(user, env)
}

function buildUser(user, env) {
  return {
    id: Number(user.id),
    username: user.username || '',
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    is_admin: adminIds(env).has(String(user.id)),
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Достаёт пользователя из заголовка Authorization: tma <initData>. */
export async function currentUser(c) {
  const header = c.req.header('Authorization') || ''
  if (header.startsWith('tma ')) return verifyInitData(header.slice(4), c.env)

  if (String(c.env.DEV_MODE) === '1') {
    // Локальная разработка вне Telegram.
    const id = [...adminIds(c.env)][0] || '1'
    return buildUser({ id, first_name: 'Dev', username: 'dev' }, c.env)
  }

  throw new HttpError(401, 'Откройте магазин через Telegram')
}

export async function requireAdmin(c) {
  const user = await currentUser(c)
  if (!user.is_admin) throw new HttpError(403, 'Нужны права администратора')
  return user
}
