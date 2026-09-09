export const tg = window.Telegram?.WebApp

/** Вызов, которого может не быть на старом клиенте: молча пропускаем. */
const tryCall = (name, ...args) => {
  try {
    return tg?.[name]?.(...args)
  } catch { /* метод из более новой версии Bot API */ }
}

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()

  // Свайп вниз больше не сворачивает и не закрывает магазин: покупатель
  // листает каталог, а не выбрасывает приложение случайным движением.
  tryCall('disableVerticalSwipes')

  // Разворот на весь экран: доступен с Bot API 8.0, на старых клиентах
  // остаётся обычный expand() выше.
  tryCall('requestFullscreen')
  // Приложение всегда тёмное, поэтому шапку и фон Telegram красим под него.
  try {
    tg.setHeaderColor?.('#0e0e11')
    tg.setBackgroundColor?.('#0e0e11')
  } catch {
    tg.setHeaderColor?.('secondary_bg_color')
  }
}

export function haptic(type = 'light') {
  try {
    tg?.HapticFeedback?.impactOccurred?.(type)
  } catch { /* старый клиент */ }
}

export function showAlert(text, after) {
  // showAlert появился в Bot API 6.2, на старых клиентах кидает исключение.
  try {
    if (tg?.showAlert) return tg.showAlert(text, after)
  } catch { /* падаем на обычный alert */ }
  alert(text)
  after?.()
}

/** Спрашиваем перед необратимым. На старых клиентах — обычный confirm. */
export function showConfirm(text, after) {
  try {
    if (tg?.showConfirm) return tg.showConfirm(text, after)
  } catch { /* метод из более новой версии Bot API */ }
  after(window.confirm(text))
}

/** Перейти в чат с ботом: Telegram закрывает приложение и открывает переписку. */
export const openChat = (username) =>
  username && tryCall('openTelegramLink', `https://t.me/${username}`)

/**
 * Ярлык на экране телефона. Статус: added | missed | unknown | unsupported.
 * Спрашиваем через колбэк, потому что таким API отдаёт его Telegram.
 */
export const homeScreenStatus = () => new Promise((resolve) => {
  if (!tg?.checkHomeScreenStatus) return resolve('unsupported')
  try {
    tg.checkHomeScreenStatus(resolve)
  } catch {
    resolve('unsupported')
  }
})

export const addToHomeScreen = () => tryCall('addToHomeScreen')

/** Подписка на событие Telegram, возвращает функцию отписки. */
export const onEvent = (name, handler) => {
  tryCall('onEvent', name, handler)
  return () => tryCall('offEvent', name, handler)
}
