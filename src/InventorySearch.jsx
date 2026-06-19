import { useEffect, useMemo, useRef, useState } from 'react'
import AddToCartButton from './AddToCartButton'
import ProductDetailModal from './ProductDetailModal'
import { shopProductCategories, shopCategories } from './shopCatalog'
import { usePublishedProducts } from './usePublishedProducts'
import { productGalleryUrl } from './siteConfig'
import QuickBid from './QuickBid'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const getProductDisplayPrice = (product) =>
  product.saleMode === 'auction' ? product.currentBidPrice || product.price : product.price

function FeaturedProductCard({ onSelect, product }) {
  const isAuction = product.saleMode === 'auction'
  const displayPrice = getProductDisplayPrice(product)

  return (
    <article className="home-featured-product-card">
      <button
        aria-label={`View details for ${product.name}`}
        className="home-featured-product-view"
        type="button"
        onClick={() => onSelect(product)}
      >
        <div className="home-featured-product-media">
          <img src={product.image} alt={product.name} loading="lazy" />
          {product.imageCount > 1 && (
            <span>{product.imageCount} photos</span>
          )}
        </div>
        <div className="home-featured-product-content">
          <span>{isAuction ? 'Bidding open' : product.categoryName}</span>
          <h3>{product.name}</h3>
          <strong>{priceFormatter.format(displayPrice)}</strong>
        </div>
      </button>
      <div className="home-featured-product-actions">
        {isAuction ? (
          <QuickBid currentPrice={displayPrice} product={product} />
        ) : (
          <AddToCartButton
            className="button primary home-featured-add-cart"
            product={product}
          />
        )}
      </div>
    </article>
  )
}

const sortOptions = [
  { label: 'Best Match', value: 'featured' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
]

const parsePriceInput = (value) => {
  const price = Number.parseFloat(value)

  return Number.isFinite(price) && price >= 0 ? price : undefined
}

function InventorySearch() {
  const { error, products, status } = usePublishedProducts()
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortOrder, setSortOrder] = useState('featured')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [isSearchDocked, setIsSearchDocked] = useState(false)
  const searchFormRef = useRef(null)

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 220)

    return () => window.clearTimeout(debounceTimer)
  }, [query])

  useEffect(() => {
    const searchForm = searchFormRef.current

    if (!searchForm || typeof IntersectionObserver === 'undefined') {
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

    observer.observe(searchForm)

    return () => observer.disconnect()
  }, [])

  const selectedCategoryOption = useMemo(
    () => shopProductCategories.find((category) => category.id === selectedCategory),
    [selectedCategory],
  )

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

  const activeFilterLabels = useMemo(() => {
    const labels = []

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
  }, [debouncedQuery, priceBounds, selectedCategory, selectedCategoryOption, sortOrder])

  const visibleProducts = useMemo(() => {
    const normalizedQuery = debouncedQuery.toLowerCase()

    return products
      .filter((product) => {
        if (selectedCategory !== 'all' && product.categoryId !== selectedCategory) {
          return false
        }

        if (priceBounds.minimum !== undefined && product.price < priceBounds.minimum) {
          return false
        }

        if (priceBounds.maximum !== undefined && product.price > priceBounds.maximum) {
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
          return a.price - b.price
        }

        if (sortOrder === 'price-desc') {
          return b.price - a.price
        }

        return 0
      })
  }, [debouncedQuery, priceBounds, products, selectedCategory, sortOrder])

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

  const isSearching = useMemo(() => {
    return (
      debouncedQuery !== '' ||
      selectedCategory !== 'all' ||
      minPrice !== '' ||
      maxPrice !== '' ||
      sortOrder !== 'featured'
    )
  }, [debouncedQuery, selectedCategory, minPrice, maxPrice, sortOrder])

  const categoryHighlights = useMemo(
    () =>
      shopCategories
        .map((category) => ({
          ...category,
          products: products
            .filter((product) => product.categoryId === category.id)
            .sort((a, b) => getProductDisplayPrice(b) - getProductDisplayPrice(a))
            .slice(0, 3),
        }))
        .filter((category) => category.products.length > 0),
    [products],
  )

  return (
    <section
      aria-labelledby="inventory-search-title"
      className="section inventory-search-section"
      id="inventory-search"
    >
      <div className="container">
        <div className="section-heading inventory-heading">
          <div>
            <p className="eyebrow">Search inventory</p>
            <h2 id="inventory-search-title">Find cards, games, and collectibles.</h2>
          </div>
          <p>
            Search current shop stock by product name, category, description, and price.
          </p>
        </div>

        <form
          className={`inventory-search-form${isSearchDocked ? ' is-docking' : ''}`}
          ref={searchFormRef}
          role="search"
          onSubmit={handleSearchSubmit}
        >
          <label className="inventory-search-label" htmlFor="inventory-query">
            Search
          </label>
          <div className="inventory-search-control">
            <input
              autoComplete="off"
              id="inventory-query"
              name="inventory-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Charizard, Dragon, Switch..."
              type="search"
              value={query}
            />
            <button className="button primary inventory-search-button" type="submit">
              Search
            </button>
          </div>
        </form>

        {isSearching ? (
          <div className="inventory-browser">
            <aside className="inventory-filter-panel" aria-label="Inventory filters">
              <form
                aria-hidden={!isSearchDocked}
                className={`inventory-docked-search${isSearchDocked ? ' is-visible' : ''}`}
                role="search"
                onSubmit={handleSearchSubmit}
              >
                <label htmlFor="inventory-docked-query">
                  <span>Search</span>
                  <div className="inventory-docked-search-control">
                    <input
                      autoComplete="off"
                      id="inventory-docked-query"
                      name="inventory-docked-query"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search inventory"
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

              <div className="inventory-filter-head">
                <h3>Filters</h3>
                <button className="inventory-reset" type="button" onClick={resetFilters}>
                  Reset
                </button>
              </div>

              <label className="filter-field" htmlFor="inventory-category">
                <span>Category</span>
                <select
                  id="inventory-category"
                  name="inventory-category"
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

              <label className="filter-field" htmlFor="inventory-sort">
                <span>Sort & View</span>
                <select
                  id="inventory-sort"
                  name="inventory-sort"
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

              <div className="price-filter-group">
                <span>Price range</span>
                <div className="price-filter-inputs">
                  <label htmlFor="inventory-min-price">
                    <span>Min</span>
                    <input
                      id="inventory-min-price"
                      inputMode="decimal"
                      min="0"
                      name="inventory-min-price"
                      onChange={(event) => setMinPrice(event.target.value)}
                      placeholder="0"
                      type="number"
                      value={minPrice}
                    />
                  </label>
                  <label htmlFor="inventory-max-price">
                    <span>Max</span>
                    <input
                      id="inventory-max-price"
                      inputMode="decimal"
                      min="0"
                      name="inventory-max-price"
                      onChange={(event) => setMaxPrice(event.target.value)}
                      placeholder="200"
                      type="number"
                      value={maxPrice}
                    />
                  </label>
                </div>
              </div>
            </aside>

            <div className="inventory-results-panel">
              <div className="inventory-results-head">
                <p>
                  <strong>{visibleProducts.length}</strong> item{visibleProducts.length === 1 ? '' : 's'}
                </p>
                {selectedCategoryOption && <span>{selectedCategoryOption.label}</span>}
              </div>

              {activeFilterLabels.length > 0 && (
                <div className="active-filter-list" aria-label="Active filters">
                  {activeFilterLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              )}

              {visibleProducts.length > 0 ? (
                <div className="inventory-grid">
                  {visibleProducts.map((product) => (
                    <article
                      className="inventory-product-card"
                      key={product.id}
                    >
                      <button
                        aria-label={`View details for ${product.name}`}
                        className="inventory-product-view"
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="inventory-product-media">
                          <img src={product.image} alt={product.name} loading="lazy" />
                          {product.imageCount > 1 && (
                            <span className="inventory-product-image-count">
                              {product.imageCount} photos
                            </span>
                          )}
                        </div>
                        <div className="inventory-product-content">
                          <div>
                            <span className="inventory-product-category">
                              {product.categoryName}
                            </span>
                            <h3>{product.name}</h3>
                            <p>{product.description}</p>
                          </div>
                          <div className="inventory-product-meta">
                            <span>{product.categoryName}</span>
                            <strong>{priceFormatter.format(product.price)}</strong>
                          </div>
                        </div>
                      </button>
                      <div className="inventory-product-actions">
                        <AddToCartButton
                          className="button primary inventory-add-cart"
                          product={product}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="inventory-empty-state">
                  {status === 'loading' ? (
                    <>
                      <p>Loading inventory...</p>
                      <span>Current products will appear here.</span>
                    </>
                  ) : status === 'error' ? (
                    <>
                      <p>Inventory is unavailable.</p>
                      <span>{error}</span>
                    </>
                  ) : (
                    <>
                      <p>No products match this view.</p>
                      <span>Try changing the category, search, or price range.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="home-featured-list" style={{ marginTop: '32px' }}>
            <div className="section-heading home-featured-heading" style={{ marginBottom: '32px' }}>
              <div>
                <p className="eyebrow">Shop highlights</p>
                <h2 id="shop-highlights-title" style={{ fontSize: '2rem' }}>Top finds by category.</h2>
              </div>
              <p>
                The three highest-priced products currently available in each shop category.
              </p>
            </div>

            {status === 'loading' && (
              <p className="home-featured-status">Loading current shop highlights...</p>
            )}

            {status === 'error' && (
              <p className="home-featured-status is-error">{error}</p>
            )}

            {categoryHighlights.length > 0 ? (
              categoryHighlights.map((category) => (
                <section
                  className="home-category-preview"
                  key={category.id}
                  aria-labelledby={`home-${category.id}-title`}
                  style={{ marginBottom: '48px' }}
                >
                  <div className="home-category-preview-head">
                    <div>
                      <p className="eyebrow">{category.featured ? 'Latest arrivals' : 'Category'}</p>
                      <h3 id={`home-${category.id}-title`}>{category.label}</h3>
                    </div>
                    <a className="button secondary" href={`${productGalleryUrl}#${category.id}`}>
                      View full shop
                    </a>
                  </div>

                  <div className="home-featured-product-grid">
                    {category.products.map((product) => (
                      <FeaturedProductCard
                        key={product.id}
                        product={product}
                        onSelect={setSelectedProduct}
                      />
                    ))}
                  </div>
                </section>
              ))
            ) : status !== 'loading' && status !== 'error' ? (
              <div className="home-featured-empty">
                <p>Shop highlights are coming soon.</p>
                <span>Published products will appear here once they are available.</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </section>
  )
}

export default InventorySearch
