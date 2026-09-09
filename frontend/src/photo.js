/**
 * Приём картинки перед загрузкой.
 *
 * Вырезанный на айфоне объект — PNG с прозрачным фоном. Кадрировать его нечем:
 * он уже обрезан по контуру, а квадратная рамка отрезала бы банке горлышко.
 * Такую картинку вписываем целиком в квадрат, поля остаются прозрачными.
 */

const load = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => { URL.revokeObjectURL(url); res(img) }
  img.onerror = (e) => { URL.revokeObjectURL(url); rej(e) }
  img.src = url
})

/** Скриншот — тоже PNG, но его кадрируют как обычный снимок. Решает прозрачность. */
const transparent = (img) => {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 64        // мельче, чем нужно глазу, но дырки в фоне видны
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, probe.width, probe.height)
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}

/**
 * Квадрат со вписанным объектом и прозрачными полями.
 * null — если картинка обычная: её отправляем в кадрирование.
 */
export async function squareCutout(file, size = 900) {
  if (file.type !== 'image/png') return null
  const img = await load(file)
  if (!transparent(img)) return null

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  return new File([blob], 'cutout.png', { type: 'image/png' })
}
