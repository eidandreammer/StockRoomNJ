import SiteShell from './SiteChrome'
import './App.css'
import './Gallery.css'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const categories = [
  {
    id: 'new-hot',
    label: 'New Hot',
    note: 'Fresh drops and recent arrivals.',
    featured: true,
    images: [],
  },
  {
    id: 'pokemon',
    label: 'Pokemon',
    note: 'Pokemon TCG singles, sealed items, and collector finds.',
    images: [],
  },
  {
    id: 'funko-pops',
    label: 'Funko Pops',
    note: 'Collectible figures and character finds.',
    images: [],
  },
  {
    id: 'sneakers',
    label: 'Sneakers',
    note: 'Pairs worth a closer look.',
    images: [],
  },
  {
    id: 'clothes',
    label: 'Clothes',
    note: 'Apparel, streetwear, and shop finds.',
    images: [],
  },
  {
    id: 'retro',
    label: 'Retro',
    note: 'Throwbacks, classics, and nostalgia.',
    images: [],
  },
]

function GalleryApp() {
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

                {category.products?.length > 0 ? (
                  <div className="shop-product-grid">
                    {category.products.map((product) => (
                      <article className="shop-product-card" key={product.id}>
                        <div className="shop-product-media">
                          <img src={product.image} alt={product.name} loading="lazy" />
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
                            <span>{product.condition}</span>
                            <strong>{priceFormatter.format(product.price)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : category.images.length > 0 ? (
                  <div className="product-image-grid">
                    {category.images.map((image) => (
                      <a href={image.src} key={image.src} target="_blank" rel="noreferrer">
                        <img src={image.src} alt={image.alt} />
                      </a>
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
      </main>
    </SiteShell>
  )
}

export default GalleryApp
