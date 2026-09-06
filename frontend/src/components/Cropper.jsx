import { useEffect, useRef, useState } from 'react'

const MIN = 72   // меньше рамку не ужать: в углы нужно попадать пальцем

/**
 * Обрезка перед загрузкой. Картинка видна целиком, поверх неё — рамка кадра:
 * её таскают пальцем и тянут за углы. Так в кадр попадает любая часть снимка,
 * а не только то, что влезло при масштабировании.
 *
 * Соотношение сторон задаёт вызывающий (1 — квадрат товара, 3 — лента баннеров),
 * поэтому карточки в каталоге и реклама на главной остаются одного размера.
 * Прозрачность переживает обрезку: PNG остаётся PNG.
 */
export default function Cropper({ file, aspect = 1, outWidth = 900, onCancel, onDone }) {
  const [src] = useState(() => URL.createObjectURL(file))
  const [nat, setNat] = useState(null)     // натуральный размер картинки
  const [disp, setDisp] = useState(null)   // её размер на экране
  const [rect, setRect] = useState(null)   // рамка кадра в экранных пикселях
  const [busy, setBusy] = useState(false)
  const imgRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => () => URL.revokeObjectURL(src), [src])

  // Самый большой кадр, влезающий в картинку целиком, по центру.
  const fit = (w, h) => {
    const cw = Math.min(w, h * aspect)
    return { x: (w - cw) / 2, y: (h - cw / aspect) / 2, w: cw }
  }

  const measure = () => {
    const el = imgRef.current
    if (!el?.clientWidth) return
    setNat({ w: el.naturalWidth, h: el.naturalHeight })
    setDisp({ w: el.clientWidth, h: el.clientHeight })
    setRect(fit(el.clientWidth, el.clientHeight))
  }

  const clampMove = (r, dx, dy) => {
    const h = r.w / aspect
    return {
      ...r,
      x: Math.min(disp.w - r.w, Math.max(0, r.x + dx)),
      y: Math.min(disp.h - h, Math.max(0, r.y + dy)),
    }
  }

  // Угол тянет только по горизонтали: высота идёт следом за соотношением,
  // а противоположный угол стоит на месте.
  const resize = (r, corner, dx) => {
    const right = r.x + r.w
    const bottom = r.y + r.w / aspect
    const grow = corner === 'se' || corner === 'ne' ? dx : -dx
    const limit = corner === 'se' ? Math.min(disp.w - r.x, (disp.h - r.y) * aspect)
      : corner === 'sw' ? Math.min(right, (disp.h - r.y) * aspect)
        : corner === 'ne' ? Math.min(disp.w - r.x, bottom * aspect)
          : Math.min(right, bottom * aspect)

    const w = Math.max(MIN, Math.min(limit, r.w + grow))
    const x = corner === 'se' || corner === 'ne' ? r.x : right - w
    const y = corner === 'se' || corner === 'sw' ? r.y : bottom - w / aspect
    return { x, y, w }
  }

  const start = (mode) => (e) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, px: e.clientX, py: e.clientY, from: rect }
  }
  const move = (e) => {
    const d = drag.current
    if (!d || !disp) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    setRect(d.mode === 'move' ? clampMove(d.from, dx, dy) : resize(d.from, d.mode, dx))
  }
  const end = () => { drag.current = null }

  const confirm = async () => {
    if (!nat || !disp || !rect) return
    setBusy(true)
    try {
      const scale = nat.w / disp.w
      const canvas = document.createElement('canvas')
      canvas.width = outWidth
      canvas.height = Math.round(outWidth / aspect)

      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src })
      canvas.getContext('2d').drawImage(
        img,
        rect.x * scale, rect.y * scale, rect.w * scale, (rect.w / aspect) * scale,
        0, 0, canvas.width, canvas.height,
      )

      // JPEG залил бы вырезанный на айфоне фон чёрным — прозрачное отдаём PNG.
      const png = file.type === 'image/png'
      const blob = await new Promise((res) => canvas.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.85))
      onDone(new File([blob], png ? 'photo.png' : 'photo.jpg', { type: blob.type }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="sheet crop" onClick={(e) => e.stopPropagation()}>
        <h2>Обрезка</h2>

        <div className="crop-stage">
          <div className="crop-holder">
            <img ref={imgRef} src={src} alt="" draggable="false" onLoad={measure} />
            {rect && (
              <div
                className="crop-box"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.w / aspect }}
                onPointerDown={start('move')}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              >
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <span
                    key={corner}
                    className={`handle ${corner}`}
                    onPointerDown={start(corner)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="muted small center">Двигайте рамку и тяните её за углы</p>

        <div className="sheet-actions">
          <button className="ghost" onClick={() => rect && setRect(fit(disp.w, disp.h))}>Весь кадр</button>
          <button className="ghost" onClick={onCancel}>Отмена</button>
          <button className="primary narrow" disabled={busy || !rect} onClick={confirm}>
            {busy ? '…' : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  )
}
