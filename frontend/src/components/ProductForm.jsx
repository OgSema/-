import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { squareCutout } from '../photo'
import { showAlert } from '../tg'
import Cropper from './Cropper'

// Числа пустые, а не нулевые: ноль в поле нового товара пришлось бы стирать
// перед каждым вводом. Пустое поле сохраняется тем же нулём.
const EMPTY = {
  name: '', flavor: '', price: '', cost: '',
  description: '', photo_url: '', stock: '', is_active: true, category_id: null,
}

export default function ProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...product,
    // Товар вне раздела на витрину не попадёт, поэтому раздел выбран заранее.
    category_id: product?.category_id ?? categories[0]?.id ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [cropping, setCropping] = useState(null)   // файл, ожидающий кадрирования
  const pasteBox = useRef(null)

  const set = (field) => (e) => {
    const el = e.target
    const value = el.type === 'checkbox' ? el.checked : el.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  const upload = async (file) => {
    setCropping(null)
    setBusy(true)
    try {
      const { url } = await api.upload(file)
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Общий вход для картинки, откуда бы она ни пришла: из «Фото», из буфера или
   * перетаскиванием. Вырезанный объект грузим как есть, обычный снимок сначала
   * кадрируем — так карточки в каталоге остаются ровными.
   */
  const accept = async (file) => {
    if (!file) return
    const cutout = await squareCutout(file).catch(() => null)
    if (cutout) upload(cutout)
    else setCropping(file)
  }

  const pickPhoto = (e) => {
    accept(e.target.files?.[0])
    e.target.value = ''
  }

  // Вставка ловится на всём документе: на айфоне «Вставить» предлагают только
  // в поле для текста, и событие всплывает оттуда.
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()      // иначе картинка осядет в рамке для вставки
      accept(item.getAsFile())
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  /**
   * Запасной путь: часть клиентов кладёт вставленную картинку не в файлы, а
   * прямо в разметку. Тогда забираем её из вставленного <img> и чистим рамку.
   */
  const rescuePasted = () => setTimeout(async () => {
    const img = pasteBox.current?.querySelector('img')
    if (!img) return
    pasteBox.current.innerHTML = ''
    try {
      const blob = await (await fetch(img.src)).blob()
      accept(new File([blob], 'paste.png', { type: blob.type || 'image/png' }))
    } catch {
      showAlert('Картинку из буфера прочитать не вышло. Сохраните её в «Фото» и выберите файлом.')
    }
  }, 0)

  const drop = (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    accept(file)
  }

  const pastePhoto = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await item.getType(type)
          return accept(new File([blob], `paste.${type.split('/')[1]}`, { type }))
        }
      }
      showAlert('В буфере обмена нет картинки')
    } catch {
      // Telegram не даёт читать буфер сам — остаётся системная вставка в рамку.
      pasteBox.current?.focus()
      showAlert('Нажмите на рамку под кнопками, подержите палец и выберите «Вставить».')
    }
  }

  const save = async () => {
    if (!form.name.trim()) return showAlert('Укажите название')
    if (!form.category_id) return showAlert('Выберите раздел')
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        flavor: form.flavor,
        description: form.description,
        photo_url: form.photo_url,
        price: Number(form.price) || 0,
        cost: Number(form.cost) || 0,
        stock: Number(form.stock) || 0,
        is_active: !!form.is_active,
        category_id: Number(form.category_id),
      }
      if (form.id) await api.updateProduct(form.id, payload)
      else await api.createProduct(payload)
      onSaved()
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteProduct(form.id)
      onSaved()
    } catch (err) {
      showAlert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
      >
        <h2>{form.id ? 'Редактирование' : 'Новый товар'}</h2>

        <label>Название<input value={form.name} onChange={set('name')} placeholder="Darkside Supernova" /></label>
        <div className="row">
          <label>Цена, ₽<input type="number" inputMode="numeric" placeholder="0" value={form.price} onChange={set('price')} /></label>
          <label>Остаток<input type="number" inputMode="numeric" placeholder="0" value={form.stock} onChange={set('stock')} /></label>
        </div>
        <label>
          Закупка, ₽ <span className="muted">(только для вас)</span>
          <input type="number" inputMode="numeric" placeholder="0" value={form.cost} onChange={set('cost')} />
        </label>
        <p className="muted small">
          Покупателю закупка не видна. По ней считаются прибыль и стоимость склада в сводке.
        </p>
        <label>Вкус<input value={form.flavor} onChange={set('flavor')} placeholder="Supernova" /></label>
        <label>
          Раздел
          <select value={form.category_id ?? ''} onChange={set('category_id')}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Описание<textarea rows="2" value={form.description} onChange={set('description')} /></label>

        <div className="photo-pick">
          <label className="ghost pick">
            Выбрать фото
            <input type="file" accept="image/*" onChange={pickPhoto} hidden />
          </label>
          <button className="ghost" onClick={pastePhoto}>Вставить из буфера</button>
        </div>
        <div
          className="paste-box"
          ref={pasteBox}
          contentEditable
          inputMode="none"
          suppressContentEditableWarning
          onPaste={rescuePasted}
        />
        <p className="muted small">
          Вырезанный на айфоне объект: перетащите его сюда или нажмите на рамку,
          подержите палец и выберите «Вставить». Прозрачный фон сохранится,
          кадрировать такой объект не нужно.
        </p>
        {form.photo_url && <img className="preview" src={form.photo_url} alt="" />}

        <label className="checkbox">
          <input type="checkbox" checked={!!form.is_active} onChange={set('is_active')} />
          Показывать в каталоге
        </label>

        <div className="sheet-actions">
          <button className="ghost" onClick={onClose}>Отмена</button>
          {form.id && <button className="ghost danger" disabled={busy} onClick={remove}>Удалить</button>}
          <button className="primary narrow" disabled={busy} onClick={save}>
            {busy ? '…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {cropping && (
        <Cropper
          file={cropping}
          aspect={1}
          outWidth={900}
          onCancel={() => setCropping(null)}
          onDone={upload}
        />
      )}
    </div>
  )
}
