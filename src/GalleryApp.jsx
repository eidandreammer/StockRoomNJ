import './Gallery.css'

const baseUrl = import.meta.env.BASE_URL
const brandLogo = `${baseUrl}segundo%20logo%20the%20stock%20room.png`
const homeUrl = `${baseUrl}index.html`

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
    <div className="product-gallery-page">
      <header className="gallery-header">
        <div className="gallery-container gallery-header-inner">
          <a className="gallery-brand" href={homeUrl} aria-label="StockRoom NJ home">
            <img src={brandLogo} alt="The Stock Room logo" />
          </a>
          <a className="gallery-home-link" href={homeUrl}>
            Back to home
          </a>
        </div>
      </header>

      <main>
        <section className="gallery-intro" aria-labelledby="gallery-title">
          <div className="gallery-container">
            <p className="gallery-eyebrow">The Stock Room collection</p>
            <h1 id="gallery-title">Browse the galleries.</h1>
            <p className="gallery-intro-copy">
              Explore current finds by category. Check back for newly added photos
              as the shop inventory rotates.
            </p>

            <nav className="gallery-category-grid" aria-label="Gallery categories">
              {categories.map((category) => (
                <a
                  className={`gallery-category-card${category.featured ? ' is-featured' : ''}`}
                  href={`#${category.id}`}
                  key={category.id}
                >
                  <span className="gallery-card-label">{category.label}</span>
                  <span>{category.note}</span>
                  <strong>View gallery</strong>
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
                      {category.featured ? 'Latest arrivals' : 'Product gallery'}
                    </p>
                    <h2 id={`${category.id}-title`}>{category.label}</h2>
                  </div>
                  <a href="#gallery-title">Back to categories</a>
                </div>

                {category.images.length > 0 ? (
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

      <footer className="gallery-footer">
        <div className="gallery-container gallery-footer-inner">
          <p>The Stock Room NJ</p>
          <a href={homeUrl}>Return to the main site</a>
        </div>
      </footer>
    </div>
  )
}

export default GalleryApp
