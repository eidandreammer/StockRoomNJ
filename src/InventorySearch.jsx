import { useEffect, useMemo, useState } from 'react'
import ProductDetailModal from './ProductDetailModal'
import { shopProductCategories } from './shopCatalog'
import { usePublishedProducts } from './usePublishedProducts'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

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

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 220)

    return () => window.clearTimeout(debounceTimer)
  }, [query])

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

        <form className="inventory-search-form" role="search" onSubmit={handleSearchSubmit}>
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

        <div className="inventory-browser">
          <aside className="inventory-filter-panel" aria-label="Inventory filters">
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
                  <button
                    aria-label={`View details for ${product.name}`}
                    className="inventory-product-card"
                    key={product.id}
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
      </div>
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </section>
  )
}

export default InventorySearch
