import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Кадрирование перед загрузкой: картинка тянется пальцем, масштаб — ползунком.
 * Соотношение сторон задаёт вызывающий (1 — квадрат для товара, 16/9 — баннер),
 * поэтому карточки в каталоге и лента на главной остаются одного размера.
 */
export default function Cropper({ file, aspect = 1, outWidth = 900, onCancel, onDone }) {
  const [src] = useState(() => URL.createObjectURL(file))
  const [nat, setNat] = useState(null)          // натуральный размер картинки
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // сдвиг центра картинки, в пикселях рамки
  const [busy, setBusy] = useState(false)
  const [box, setBox] = useState(0)             // ширина рамки, меряется после вёрстки
  const frame = useRef(null)
  const drag = useRef(null)

  useLayoutEffect(() => () => URL.revokeObjectURL(src), [src])
  useLayoutEffect(() => { setBox(frame.current?.clientWidth || 0) }, [])

  // Высота рамки — из соотношения сторон.
  const boxH = box / aspect

  // Базовый масштаб — «покрыть рамку», дальше умножаем на зум.
  const cover = nat && box ? Math.max(box / nat.w, boxH / nat.h) : 1
  const scale = cover * zoom

  // Картинка обязана закрывать рамку целиком, иначе в кадр попадут пустые поля.
  const clamp = (p, s = scale) => {
    if (!nat) return p
    const maxX = Math.max(0, (nat.w * s - box) / 2)
    const maxY = Math.max(0, (nat.h * s - boxH) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, p.x)),
      y: Math.min(maxY, Math.max(-maxY, p.y)),
    }
  }

  const onDown = (e) => {
    const t = e.touches?.[0] || e
    drag.current = { x: t.clientX - pos.x, y: t.clientY - pos.y }
  }
  const onMove = (e) => {
    if (!drag.current) return
    e.preventDefault()
    const t = e.touches?.[0] || e
    setPos(clamp({ x: t.clientX - drag.current.x, y: t.clientY - drag.current.y }))
  }
  const onUp = () => { drag.current = null }

  const changeZoom = (e) => {
    const z = Number(e.target.value)
    setZoom(z)
    setPos((p) => clamp(p, cover * z))
  }

  const confirm = async () => {
    if (!nat || !box) return
    setBusy(true)
    try {
      // Переводим рамку в координаты исходной картинки и режем канвасом.
      const left = box / 2 + pos.x - (nat.w * scale) / 2
      const top = boxH / 2 + pos.y - (nat.h * scale) / 2
      const sx = -left / scale
      const sy = -top / scale
      const sw = box / scale
      const sh = boxH / scale

      const canvas = document.createElement('canvas')
      canvas.width = outWidth
      canvas.height = Math.round(outWidth / aspect)
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src })
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
      onDone(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="sheet crop" onClick={(e) => e.stopPropagation()}>
        <h2>Кадрирование</h2>

        <div
          className="crop-frame"
          ref={frame}
          style={{ aspectRatio: String(aspect) }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          <img
              src={src}
              alt=""
              draggable="false"
              onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{
                width: nat ? nat.w * scale : 'auto',
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
            }}
          />
        </div>

        <label className="zoom">
          Масштаб
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={changeZoom} />
        </label>
        <p className="muted small center">Потяните картинку, чтобы выбрать видимую часть</p>

        <div className="sheet-actions">
          <button className="ghost" onClick={onCancel}>Отмена</button>
          <button className="primary narrow" disabled={busy || !nat || !box} onClick={confirm}>
            {busy ? '…' : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  )
}
