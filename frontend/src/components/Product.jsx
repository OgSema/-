import { haptic } from '../tg'

/** Подробности товара: открывается кнопкой «!» на карточке в каталоге. */
export default function Product({ product, inCart, onAdd, onClose }) {
  const specs = [
    ['Бренд', product.brand],
    ['Вкус', product.flavor],
    ['Фасовка', product.weight],
  ].filter(([, v]) => v)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet product-sheet" onClick={(e) => e.stopPropagation()}>
        {product.photo_url && <img className="product-photo" src={product.photo_url} alt={product.name} />}

        <h2>{product.name}</h2>

        {specs.length > 0 && (
          <dl className="specs">
            {specs.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {product.description && <p className="description">{product.description}</p>}

        <p className="muted small">
          {product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Закончился'}
        </p>

        <div className="product-buy">
          <span className="price">{product.price} ₽</span>
          <button
            className="primary narrow"
            disabled={inCart >= product.stock}
            onClick={() => { haptic(); onAdd(product) }}
          >
            {inCart ? `в корзине · ${inCart}` : 'В корзину'}
          </button>
        </div>
      </div>
    </div>
  )
}
