import { useMemo, useState } from 'react'
import ProductDetailModal from './ProductDetailModal'
import SiteShell from './SiteChrome'
import { shopCategories } from './shopCatalog'
import { usePublishedProducts } from './usePublishedProducts'
import './App.css'
import './Gallery.css'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function GalleryApp() {
  const { error, products, status } = usePublishedProducts()
  const [selectedProduct, setSelectedProduct] = useState(null)
  const categories = useMemo(
    () =>
      shopCategories.map((category) => ({
        ...category,
        products: products.filter((product) => product.categoryId === category.id),
      })),
    [products],
  )

  return (
    <SiteShell currentPage="shop">
      <main className="product-gallery-page" id="main-content">
        <section className="gallery-intro" aria-labelledby="gallery-title">
          <div className="gallery-container">
            <p className="gallery-eyebrow">The Stock Room shop</p>
            <h1 id="gallery-title">Browse the shop.</h1>
            <p className="gallery-intro-copy">
              Explore current finds by category. Pokemon now has its own section
              alongside the rest of the shop categories.
            </p>

            <nav className="gallery-category-grid" aria-label="Shop categories">
              {categories.map((category) => (
                <a
                  className={`gallery-category-card${category.featured ? ' is-featured' : ''}`}
                  href={`#${category.id}`}
                  key={category.id}
                >
                  <span className="gallery-card-label">{category.label}</span>
                  <span>{category.note}</span>
                  <strong>View section</strong>
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="gallery-sections">
          {status === 'loading' && (
            <div className="gallery-container">
              <p className="gallery-status-message">Loading current shop inventory...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="gallery-container">
              <p className="gallery-status-message is-error">{error}</p>
            </div>
          )}

          {categories.map((category) => (
            <section
              className={`product-gallery-section${category.featured ? ' is-featured' : ''}`}
              id={category.id}
              key={category.id}
              aria-labelledby={`${category.id}-title`}
            >
              <div className="gallery-container">
                <div className="product-gallery-heading">
                  <div>
                    <p className="gallery-eyebrow">
                      {category.featured
                        ? 'Latest arrivals'
                        : category.id === 'pokemon'
                          ? 'Pokemon section'
                          : 'Shop section'}
                    </p>
                    <h2 id={`${category.id}-title`}>{category.label}</h2>
                  </div>
                  <a href="#gallery-title">Back to categories</a>
                </div>

                {category.products.length > 0 ? (
                  <div className="shop-product-grid">
                    {category.products.map((product) => (
                      <button
                        aria-label={`View details for ${product.name}`}
                        className="shop-product-card"
                        key={product.id}
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="shop-product-media">
                          <img src={product.image} alt={product.name} loading="lazy" />
                          {product.imageCount > 1 && (
                            <span className="shop-product-image-count">
                              {product.imageCount} photos
                            </span>
                          )}
                        </div>
                        <div className="shop-product-content">
                          <div>
                            <span className="shop-product-category">
                              {product.categoryName}
                            </span>
                            <h3>{product.name}</h3>
                            <p>{product.description}</p>
                          </div>
                          <div className="shop-product-meta">
                            <span>{product.categoryName}</span>
                            <strong>{priceFormatter.format(product.price)}</strong>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="gallery-empty-state">
                    <p>Photos for {category.label} are coming soon.</p>
                    <span>New inventory images will appear here.</span>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      </main>
    </SiteShell>
  )
}

export default GalleryApp
