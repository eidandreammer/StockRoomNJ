import { useEffect, useMemo, useState } from 'react'
import { inventoryProducts, productCategories } from './mockInventory'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const sortOptions = [
  { label: 'Best Match', value: 'featured' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
]

const normalizeText = (value) => value.toString().trim().toLowerCase()

const parsePriceInput = (value) => {
  const price = Number.parseFloat(value)

  return Number.isFinite(price) && price >= 0 ? price : undefined
}

function InventorySearch() {
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
    () => productCategories.find((category) => category.id === selectedCategory),
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

  const visibleProducts = useMemo(() => {
    const activeQuery = normalizeText(debouncedQuery)

    return inventoryProducts
      .filter((product) => {
        const searchableText = normalizeText(
          [
            product.name,
            product.categoryName,
            product.departmentName,
            product.condition,
            product.description,
            ...product.tags,
          ].join(' '),
        )
        const matchesQuery = !activeQuery || searchableText.includes(activeQuery)
        const matchesCategory =
          selectedCategory === 'all' ||
          product.categoryId === selectedCategory ||
          product.departmentId === selectedCategory
        const matchesMinimum =
          priceBounds.minimum === undefined || product.price >= priceBounds.minimum
        const matchesMaximum =
          priceBounds.maximum === undefined || product.price <= priceBounds.maximum

        return matchesQuery && matchesCategory && matchesMinimum && matchesMaximum
      })
      .sort((firstProduct, secondProduct) => {
        if (sortOrder === 'price-asc') {
          return firstProduct.price - secondProduct.price
        }

        if (sortOrder === 'price-desc') {
          return secondProduct.price - firstProduct.price
        }

        return firstProduct.featureRank - secondProduct.featureRank
      })
  }, [debouncedQuery, priceBounds, selectedCategory, sortOrder])

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
            Search local mock stock by product name, category, condition, tag, and price.
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
                {productCategories.map((category) => (
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
                <strong>{visibleProducts.length}</strong>{' '}
                {visibleProducts.length === 1 ? 'result' : 'results'}
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
                  <article className="inventory-product-card" key={product.id}>
                    <div className="inventory-product-media">
                      <img src={product.image} alt={product.name} loading="lazy" />
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
                        <span>{product.condition}</span>
                        <strong>{priceFormatter.format(product.price)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inventory-empty-state">
                <h3>No matching products</h3>
                <p>Adjust the search, category, sort, or price range to refresh the results.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default InventorySearch
