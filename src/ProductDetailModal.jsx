import { useEffect, useMemo, useState } from 'react'
import AddToCartButton from './AddToCartButton'
import './ProductDetailModal.css'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function productImages(product) {
  const images = Array.isArray(product?.images)
    ? product.images
        .map((image, index) => ({
          alt: image.fileName || `${product.name} photo ${index + 1}`,
          id: image.imagePath || image.imageUrl || `${product.id}-${index}`,
          url: image.imageUrl || image.url || '',
        }))
        .filter((image) => image.url)
    : []

  if (images.length > 0) {
    return images
  }

  return product?.image
    ? [
        {
          alt: product.name,
          id: `${product.id}-primary`,
          url: product.image,
        },
      ]
    : []
}

function ProductDetailModal({ onClose, product }) {
  const [imageSelection, setImageSelection] = useState({ imageIndex: 0, productId: '' })
  const images = useMemo(() => productImages(product), [product])
  const activeImageIndex = imageSelection.productId === product?.id
    ? Math.min(imageSelection.imageIndex, Math.max(0, images.length - 1))
    : 0
  const activeImage = images[activeImageIndex] ?? images[0] ?? null
  const typeLabel = product?.type && product?.typeLabel
    ? `${product.type} ${product.typeLabel}`
    : product?.typeLabel || product?.type

  useEffect(() => {
    if (!product) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }

      if (event.key === 'ArrowLeft' && images.length > 1) {
        setImageSelection({
          imageIndex: Math.max(0, activeImageIndex - 1),
          productId: product.id,
        })
      }

      if (event.key === 'ArrowRight' && images.length > 1) {
        setImageSelection({
          imageIndex: Math.min(images.length - 1, activeImageIndex + 1),
          productId: product.id,
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeImageIndex, images.length, onClose, product])

  if (!product) {
    return null
  }

  return (
    <div className="product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
      <button
        aria-label="Close product details"
        className="product-detail-backdrop"
        type="button"
        onClick={onClose}
      />
      <section className="product-detail-panel">
        <div className="product-detail-media">
          <div className="product-detail-primary-image">
            {activeImage ? (
              <img src={activeImage.url} alt={activeImage.alt} />
            ) : (
              <span>No image available</span>
            )}
          </div>

          {images.length > 1 && (
            <div className="product-detail-thumbnails" aria-label="Product photos">
              {images.map((image, index) => (
                <button
                  aria-label={`Show photo ${index + 1} of ${images.length}`}
                  aria-pressed={index === activeImageIndex}
                  className={index === activeImageIndex ? 'is-active' : ''}
                  key={image.id}
                  type="button"
                  onClick={() => setImageSelection({ imageIndex: index, productId: product.id })}
                >
                  <img src={image.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-detail-content">
          <div className="product-detail-head">
            <div>
              <span className="product-detail-category">{product.categoryName}</span>
              <h2 id="product-detail-title">{product.name}</h2>
            </div>
            <button className="product-detail-close" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <strong className="product-detail-price">{priceFormatter.format(product.price)}</strong>

          <AddToCartButton
            className="button primary product-detail-add-cart"
            product={product}
          />

          {product.description && (
            <p className="product-detail-description">{product.description}</p>
          )}

          <dl className="product-detail-list">
            {product.itemId && (
              <div>
                <dt>Item ID</dt>
                <dd>{product.itemId}</dd>
              </div>
            )}
            {typeLabel && (
              <div>
                <dt>Type</dt>
                <dd>{typeLabel}</dd>
              </div>
            )}
            {product.categoryName && (
              <div>
                <dt>Section</dt>
                <dd>{product.categoryName}</dd>
              </div>
            )}
            <div>
              <dt>Photos</dt>
              <dd>{images.length || product.imageCount || 0}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}

export default ProductDetailModal
