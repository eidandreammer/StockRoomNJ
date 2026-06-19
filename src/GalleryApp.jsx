import { useEffect, useMemo, useRef, useState } from 'react'
import AddToCartButton from './AddToCartButton'
import ProductDetailModal from './ProductDetailModal'
import QuickBid from './QuickBid'
import SiteShell from './SiteChrome'
import { shopCategories, shopProductCategories } from './shopCatalog'
import { usePublishedProducts } from './usePublishedProducts'
import './App.css'
import './Gallery.css'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const sortOptions = [
  { label: 'Newest First', value: 'featured' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
]

const getProductDisplayPrice = (product) =>
  product.saleMode === 'auction' ? product.currentBidPrice || product.price : product.price

const parsePriceInput = (value) => {
  const price = Number.parseFloat(value)

  return Number.isFinite(price) && price >= 0 ? price : undefined
}

function ShopProductCard({ onSelect, product }) {
  const isAuction = product.saleMode === 'auction'
  const displayPrice = getProductDisplayPrice(product)

  return (
    <article className="shop-product-card">
      <button
        aria-label={`View details for ${product.name}`}
        className="shop-product-view"
        type="button"
        onClick={() => onSelect(product)}
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
            <span>{isAuction ? 'Bidding open' : product.categoryName}</span>
            <strong>{priceFormatter.format(displayPrice)}</strong>
          </div>
        </div>
      </button>
      <div className="shop-product-actions">
        {isAuction ? (
          <QuickBid currentPrice={displayPrice} product={product} />
        ) : (
          <AddToCartButton
            className="button primary shop-add-cart"
            product={product}
          />
        )}
      </div>
    </article>
  )
}

function GalleryApp() {
  const { error, products, status } = usePublishedProducts()
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortOrder, setSortOrder] = useState('featured')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [isSearchDocked, setIsSearchDocked] = useState(false)
  const filterPanelRef = useRef(null)

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 220)

    return () => window.clearTimeout(debounceTimer)
  }, [query])

  useEffect(() => {
    const filterPanel = filterPanelRef.current

    if (!filterPanel || typeof IntersectionObserver === 'undefined') {
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSearchDocked(!entry.isIntersecting)
      },
      {
        rootMargin: '-92px 0px 0px 0px',
        threshold: 0.08,
      },
    )

    observer.observe(filterPanel)

    return () => observer.disconnect()
  }, [])

  const priceBounds = useMemo(() => {
    const minimum = parsePriceInput(minPrice)
    const maximum = parsePriceInput(maxPrice)

    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      return {
        maximum: minimum,
        minimum: maximum,
      }
    }

    return {
      maximum,
      minimum,
    }
  }, [maxPrice, minPrice])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = debouncedQuery.toLowerCase()

    return products
      .filter((product) => {
        const displayPrice = getProductDisplayPrice(product)

        if (selectedCategory !== 'all' && product.categoryId !== selectedCategory) {
          return false
        }

        if (priceBounds.minimum !== undefined && displayPrice < priceBounds.minimum) {
          return false
        }

        if (priceBounds.maximum !== undefined && displayPrice > priceBounds.maximum) {
          return false
        }

        if (!normalizedQuery) {
          return true
        }

        return [
          product.itemId,
          product.type,
          product.typeLabel,
          product.name,
          product.categoryName,
          product.description,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((a, b) => {
        if (sortOrder === 'price-asc') {
          return getProductDisplayPrice(a) - getProductDisplayPrice(b)
        }

        if (sortOrder === 'price-desc') {
          return getProductDisplayPrice(b) - getProductDisplayPrice(a)
        }

        return 0
      })
  }, [debouncedQuery, priceBounds, products, selectedCategory, sortOrder])

  const categories = useMemo(
    () =>
      shopCategories
        .filter((category) => selectedCategory === 'all' || category.id === selectedCategory)
        .map((category) => ({
          ...category,
          products: filteredProducts.filter((product) => product.categoryId === category.id),
        })),
    [filteredProducts, selectedCategory],
  )

  const activeFilterLabels = useMemo(() => {
    const labels = []
    const selectedCategoryOption = shopProductCategories.find((category) => category.id === selectedCategory)

    if (debouncedQuery) {
      labels.push(`Search: ${debouncedQuery}`)
    }

    if (selectedCategory !== 'all' && selectedCategoryOption) {
      labels.push(`Category: ${selectedCategoryOption.label}`)
    }

    if (priceBounds.minimum !== undefined || priceBounds.maximum !== undefined) {
      const minimum = priceBounds.minimum ?? 0
      const maximum = priceBounds.maximum

      labels.push(
        maximum === undefined
          ? `Price: ${priceFormatter.format(minimum)}+`
          : `Price: ${priceFormatter.format(minimum)}-${priceFormatter.format(maximum)}`,
      )
    }

    if (sortOrder !== 'featured') {
      labels.push(sortOptions.find((option) => option.value === sortOrder)?.label)
    }

    return labels
  }, [debouncedQuery, priceBounds, selectedCategory, sortOrder])

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    setDebouncedQuery(query.trim())
  }

  const resetFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setSelectedCategory('all')
    setSortOrder('featured')
    setMinPrice('')
    setMaxPrice('')
  }

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

            <form className={`gallery-search-form${isSearchDocked ? ' is-docking' : ''}`} role="search" onSubmit={handleSearchSubmit}>
              <label className="gallery-search-label" htmlFor="gallery-query">
                Search
              </label>
              <div className="gallery-search-control">
                <input
                  autoComplete="off"
                  id="gallery-query"
                  name="gallery-query"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Charizard, Dragon, Switch..."
                  type="search"
                  value={query}
                />
                <button className="button primary gallery-search-button" type="submit">
                  Search
                </button>
              </div>
            </form>

            <div
              className={`gallery-filter-panel${isSearchDocked ? ' is-docking' : ''}`}
              ref={filterPanelRef}
              aria-label="Shop filters"
            >
              <label className="gallery-filter-field" htmlFor="gallery-category">
                <span>Category</span>
                <select
                  id="gallery-category"
                  name="gallery-category"
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  value={selectedCategory}
                >
                  {shopProductCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="gallery-filter-field" htmlFor="gallery-sort">
                <span>Sort</span>
                <select
                  id="gallery-sort"
                  name="gallery-sort"
                  onChange={(event) => setSortOrder(event.target.value)}
                  value={sortOrder}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="gallery-price-filter">
                <span>Price range</span>
                <div className="gallery-price-inputs">
                  <label htmlFor="gallery-min-price">
                    <span>Min</span>
                    <input
                      id="gallery-min-price"
                      inputMode="decimal"
                      min="0"
                      name="gallery-min-price"
                      onChange={(event) => setMinPrice(event.target.value)}
                      placeholder="0"
                      type="number"
                      value={minPrice}
                    />
                  </label>
                  <label htmlFor="gallery-max-price">
                    <span>Max</span>
                    <input
                      id="gallery-max-price"
                      inputMode="decimal"
                      min="0"
                      name="gallery-max-price"
                      onChange={(event) => setMaxPrice(event.target.value)}
                      placeholder="200"
                      type="number"
                      value={maxPrice}
                    />
                  </label>
                </div>
              </div>

              <button className="gallery-reset" type="button" onClick={resetFilters}>
                Reset
              </button>
            </div>

            <div className="gallery-results-summary">
              <p>
                <strong>{filteredProducts.length}</strong> item{filteredProducts.length === 1 ? '' : 's'}
              </p>
              {activeFilterLabels.length > 0 && (
                <div className="gallery-active-filters" aria-label="Active filters">
                  {activeFilterLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              )}
            </div>

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

        <div className={`gallery-container gallery-browser${isSearchDocked ? ' has-sidebar' : ''}`}>
          <aside className={`gallery-filter-sidebar${isSearchDocked ? ' is-visible' : ''}`} aria-label="Shop sidebar filters">
            <div className="gallery-filter-sidebar-inner">
              <form
                aria-hidden={!isSearchDocked}
                className={`gallery-docked-search${isSearchDocked ? ' is-visible' : ''}`}
                role="search"
                onSubmit={handleSearchSubmit}
              >
                <label htmlFor="gallery-docked-query">
                  <span>Search</span>
                  <div className="gallery-docked-search-control">
                    <input
                      autoComplete="off"
                      id="gallery-docked-query"
                      name="gallery-docked-query"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search shop"
                      tabIndex={isSearchDocked ? 0 : -1}
                      type="search"
                      value={query}
                    />
                    <button tabIndex={isSearchDocked ? 0 : -1} type="submit">
                      Go
                    </button>
                  </div>
                </label>
              </form>

              <div className="gallery-sidebar-filter-head">
                <h3>Filters</h3>
                <button className="gallery-sidebar-reset" type="button" onClick={resetFilters}>
                  Reset
                </button>
              </div>

              <label className="gallery-sidebar-filter-field" htmlFor="gallery-sidebar-category">
                <span>Category</span>
                <select
                  id="gallery-sidebar-category"
                  name="gallery-sidebar-category"
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  value={selectedCategory}
                >
                  {shopProductCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="gallery-sidebar-filter-field" htmlFor="gallery-sidebar-sort">
                <span>Sort</span>
                <select
                  id="gallery-sidebar-sort"
                  name="gallery-sidebar-sort"
                  onChange={(event) => setSortOrder(event.target.value)}
                  value={sortOrder}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="gallery-sidebar-price-filter">
                <span>Price range</span>
                <div className="gallery-sidebar-price-inputs">
                  <label htmlFor="gallery-sidebar-min-price">
                    <span>Min</span>
                    <input
                      id="gallery-sidebar-min-price"
                      inputMode="decimal"
                      min="0"
                      name="gallery-sidebar-min-price"
                      onChange={(event) => setMinPrice(event.target.value)}
                      placeholder="0"
                      type="number"
                      value={minPrice}
                    />
                  </label>
                  <label htmlFor="gallery-sidebar-max-price">
                    <span>Max</span>
                    <input
                      id="gallery-sidebar-max-price"
                      inputMode="decimal"
                      min="0"
                      name="gallery-sidebar-max-price"
                      onChange={(event) => setMaxPrice(event.target.value)}
                      placeholder="200"
                      type="number"
                      value={maxPrice}
                    />
                  </label>
                </div>
              </div>
            </div>
          </aside>

          <div className="gallery-main-content">
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
                          <ShopProductCard
                            key={product.id}
                            product={product}
                            onSelect={setSelectedProduct}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="gallery-empty-state">
                        <p>No {category.label} products match this view.</p>
                        <span>Try changing the search, filter, or price range.</span>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
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
