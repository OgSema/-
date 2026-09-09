/**
 * Приём картинки перед загрузкой.
 *
 * Готовую картинку — вставленную из буфера или брошенную на карточку — не
 * кадрируют: её выбрали целиком, и резать из неё квадрат по середине незачем.
 * Такую вписываем в квадрат карточки как есть, поля остаются прозрачными.
 * То же и с вырезанным на айфоне объектом, откуда бы он ни пришёл: он уже
 * обрезан по контуру, а квадратная рамка отрезала бы банке горлышко.
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
 * Квадрат со вписанной картинкой и прозрачными полями.
 *
 * `ready` — картинка пришла готовой (буфер, перетаскивание): вписываем любую.
 * Без него квадрат достаётся только вырезанному объекту, а обычный снимок из
 * «Фото» возвращает null и уходит в кадрирование.
 */
export async function squareFit(file, { ready = false, size = 900 } = {}) {
  if (!ready && file.type !== 'image/png') return null
  const img = await load(file)
  if (!ready && !transparent(img)) return null

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  return new File([blob], 'cutout.png', { type: 'image/png' })
}
