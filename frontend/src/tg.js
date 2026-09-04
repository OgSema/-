export const tg = window.Telegram?.WebApp

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
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

export function showAlert(text) {
  // showAlert появился в Bot API 6.2, на старых клиентах кидает исключение.
  try {
    if (tg?.showAlert) return tg.showAlert(text)
  } catch { /* падаем на обычный alert */ }
  alert(text)
}
