import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import BulkProductCreator from './BulkProductCreator'
import { buildItemId, getItemType, itemTypes, nextItemSequence } from './itemTypes'
import { db } from './firebase'
import { getShopCategory, shopCategories } from './shopCatalog'
import {
  createProductImagePreview,
  deleteStoredImages,
  imageValidationError,
  uploadProductImage,
  uploadProductImages,
} from './productImages'
import { normalizeProduct, sortProducts } from './usePublishedProducts'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const initialProductLimit = 6

function emptyProductForm() {
  return {
    categoryId: shopCategories[0].id,
    description: '',
    imageFile: null,
    imageUrl: '',
    itemId: '',
    itemTypeCode: '',
    name: '',
    price: '',
    saleMode: 'fixed',
    status: 'published',
  }
}

function recordToProductForm(record) {
  if (!record) {
    return emptyProductForm()
  }

  return {
    categoryId: record.categoryId || shopCategories[0].id,
    description: record.description ?? '',
    imageFile: null,
    imageUrl: record.imageUrl ?? record.image ?? '',
    itemId: record.itemId ?? record.id ?? '',
    itemTypeCode: record.itemTypeCode ?? record.type ?? '',
    name: record.name ?? '',
    price: record.price === undefined ? '' : String(record.price),
    saleMode: record.saleMode ?? 'fixed',
    status: record.status ?? 'published',
  }
}

function normalizeAdminProduct(productDoc) {
  const product = normalizeProduct(productDoc)

  return {
    ...product,
    imageUrl: product.image,
  }
}

function validateProductForm(form) {
  const price = Number.parseFloat(form.price)

  if (!form.name.trim()) {
    return 'Add a product name.'
  }

  if (!Number.isFinite(price) || price < 0) {
    return 'Add a valid price.'
  }

  if (!form.description.trim()) {
    return 'Add a description.'
  }

  if (!form.categoryId) {
    return 'Choose a shop category.'
  }

  if (!['fixed', 'auction'].includes(form.saleMode)) {
    return 'Choose a sale mode.'
  }

  if (!form.imageUrl && !form.imageFile) {
    return 'Choose a product image.'
  }

  if (form.imageFile) {
    return imageValidationError(form.imageFile)
  }

  return ''
}

function mergePrimaryImage(currentImages, imageFields) {
  if (!imageFields.imagePath) {
    return currentImages
  }

  const remainingImages = currentImages.slice(1).map((image, index) => ({
    ...image,
    sortOrder: index + 1,
  }))

  return [
    {
      ...currentImages[0],
      ...imageFields,
      sortOrder: 0,
    },
    ...remainingImages,
  ]
}

function ProductEditor({ isSaving, onCancel, onSave, record }) {
  const [form, setForm] = useState(() => recordToProductForm(record))
  const [error, setError] = useState('')
  const [preview, setPreview] = useState({ file: null, url: '' })

  useEffect(() => {
    if (!form.imageFile) {
      return undefined
    }

    let isCurrent = true
    let objectUrl = ''

    createProductImagePreview(form.imageFile)
      .then(({ previewUrl: nextPreviewUrl }) => {
        objectUrl = nextPreviewUrl

        if (isCurrent) {
          setPreview({ file: form.imageFile, url: nextPreviewUrl })
        } else {
          URL.revokeObjectURL(nextPreviewUrl)
        }
      })
      .catch((previewError) => {
        if (isCurrent) {
          setError(previewError.message)
        }
      })

    return () => {
      isCurrent = false

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [form.imageFile])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextError = validateProductForm(form)

    if (nextError) {
      setError(nextError)
      return
    }

    setError('')
    onSave(form)
  }

  const displayImage = preview.file === form.imageFile ? preview.url : form.imageFile ? '' : form.imageUrl

  return (
    <form className="admin-editor admin-product-editor" onSubmit={handleSubmit}>
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Edit product</p>
          <h2>{record?.name ?? 'Product'}</h2>
        </div>
        <button className="admin-button is-secondary" type="button" onClick={onCancel}>
          Close
        </button>
      </div>

      {error && <p className="admin-alert is-error">{error}</p>}

      <div className="admin-product-layout">
        <label className="admin-image-picker">
          <span>Primary image</span>
          <input
            accept="image/*"
            type="file"
            onChange={(event) => update('imageFile', event.target.files?.[0] ?? null)}
          />
          {displayImage ? (
            <img src={displayImage} alt="Product preview" />
          ) : (
            <strong>Choose an image</strong>
          )}
        </label>

        <div className="admin-form-grid">
          {form.itemId && (
            <div className="admin-id-preview is-wide">
              <span>Item ID</span>
              <strong>{form.itemId}</strong>
            </div>
          )}

          <label className="is-wide">
            <span>Name</span>
            <input
              required
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={form.itemTypeCode}
              onChange={(event) => update('itemTypeCode', event.target.value)}
            >
              <option value="">No type</option>
              {itemTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.code} - {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Price</span>
            <input
              required
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={form.price}
              onChange={(event) => update('price', event.target.value)}
            />
          </label>
          <label>
            <span>Shop section</span>
            <select
              required
              value={form.categoryId}
              onChange={(event) => update('categoryId', event.target.value)}
            >
              {shopCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sale mode</span>
            <select value={form.saleMode} onChange={(event) => update('saleMode', event.target.value)}>
              <option value="fixed">Buy now</option>
              <option value="auction">Bidding</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={form.status} onChange={(event) => update('status', event.target.value)}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <label className="is-wide">
            <span>Description</span>
            <textarea
              required
              rows="4"
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
        </div>
      </div>

      <button className="admin-button" disabled={isSaving} type="submit">
        {isSaving ? 'Saving...' : 'Save product'}
      </button>
    </form>
  )
}

async function reserveProductRef(existingProducts, typeCode, batchDate, reservedIds) {
  let sequence = nextItemSequence(existingProducts, typeCode, batchDate, reservedIds)

  while (true) {
    const itemId = buildItemId(typeCode, batchDate, sequence)

    if (!reservedIds.has(itemId)) {
      const productRef = doc(db, 'products', itemId)
      const snapshot = await getDoc(productRef)

      if (!snapshot.exists()) {
        reservedIds.add(itemId)
        return productRef
      }
    }

    sequence += 1
  }
}

function productImageSources(product) {
  if (product.images.length > 0) {
    return product.images
  }

  return [product.imagePath].filter(Boolean)
}

function ProductListItem({ onDelete, onEdit, onToggleStatus, product }) {
  const typeLabel = product.type && product.typeLabel
    ? `${product.type} ${product.typeLabel}`
    : product.typeLabel || product.type

  return (
    <article className="admin-product-item">
      <div className="admin-product-thumb">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>No image</span>}
        {product.imageCount > 1 && <span className="admin-product-image-count">{product.imageCount}</span>}
      </div>
      <div className="admin-product-details">
        <div className="admin-product-banners">
          <span className={`admin-status is-${product.status}`}>{product.status}</span>
          <span className={`admin-sale-banner is-${product.saleMode === 'auction' ? 'bidding' : 'buying'}`}>
            {product.saleMode === 'auction' ? 'Bidding' : 'Buying'}
          </span>
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="admin-product-meta">
          {product.itemId && <span>{product.itemId}</span>}
          {typeLabel && <span>{typeLabel}</span>}
          <span>{product.categoryName}</span>
          {product.imageCount > 0 && <span>{product.imageCount} image{product.imageCount === 1 ? '' : 's'}</span>}
          <strong>{priceFormatter.format(product.price)}</strong>
        </div>
      </div>
      <div className="admin-row admin-product-actions">
        <button className="admin-text-button" type="button" onClick={() => onEdit(product)}>
          Edit
        </button>
        <button className="admin-text-button" type="button" onClick={() => onToggleStatus(product)}>
          {product.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
        <button className="admin-text-button is-danger" type="button" onClick={() => onDelete(product)}>
          Delete
        </button>
      </div>
    </article>
  )
}

function AdminProducts({ user }) {
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')
  const [isProductListExpanded, setIsProductListExpanded] = useState(false)
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [savingMessage, setSavingMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!db) {
      return undefined
    }

    return onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        setProducts(snapshot.docs.map(normalizeAdminProduct).sort(sortProducts))
        setError('')
      },
      (snapshotError) => setError(snapshotError.message),
    )
  }, [])

  const productSearchQuery = productSearch.trim().toLowerCase()
  const filteredProducts = useMemo(
    () => products.filter((product) => filter === 'all' || product.status === filter),
    [filter, products],
  )
  const matchingProducts = useMemo(() => {
    if (!productSearchQuery) {
      return filteredProducts
    }

    return filteredProducts.filter((product) => {
      const searchableText = [
        product.itemId,
        product.name,
        product.description,
        product.categoryName,
        product.type,
        product.typeLabel,
        product.status,
        product.saleMode,
        priceFormatter.format(product.price),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(productSearchQuery)
    })
  }, [filteredProducts, productSearchQuery])
  const shouldLimitProducts = !productSearchQuery && !isProductListExpanded
  const visibleProducts = shouldLimitProducts
    ? matchingProducts.slice(0, initialProductLimit)
    : matchingProducts
  const hasHiddenProducts = !productSearchQuery && matchingProducts.length > initialProductLimit

  const saveProduct = async (form) => {
    setIsSaving(true)
    setNotice('')
    setError('')

    try {
      const selectedCategory = getShopCategory(form.categoryId)
      const selectedType = getItemType(form.itemTypeCode)
      const price = Number.parseFloat(form.price)
      const productRef = editing?.id ? doc(db, 'products', editing.id) : doc(collection(db, 'products'))
      const imageFields = form.imageFile ? await uploadProductImage(form.imageFile, productRef.id) : {}
      const updatedImages = imageFields.imagePath
        ? mergePrimaryImage(editing?.images ?? [], imageFields)
        : editing?.images ?? []
      const saleMode = form.saleMode === 'auction' ? 'auction' : 'fixed'
      const payload = {
        auctionStatus: saleMode === 'auction' ? editing?.auctionStatus ?? 'open' : null,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.label,
        currentBidPrice: saleMode === 'auction'
          ? editing?.currentBidPrice || Math.round(price * 100) / 100
          : null,
        description: form.description.trim(),
        imageCount: updatedImages.length || (form.imageUrl ? 1 : 0),
        images: updatedImages,
        itemTypeCode: selectedType?.code ?? '',
        name: form.name.trim(),
        price: Math.round(price * 100) / 100,
        saleMode,
        searchText: [
          form.itemId,
          form.name,
          form.description,
          selectedCategory.label,
          selectedType?.code,
          selectedType?.label,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        status: form.status,
        type: selectedType?.code ?? '',
        typeLabel: selectedType?.label ?? '',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...imageFields,
      }

      if (editing?.id) {
        await updateDoc(productRef, payload)
        if (imageFields.imagePath && editing.imagePath && editing.imagePath !== imageFields.imagePath) {
          await deleteStoredImages([editing.imagePath])
        }
        setNotice('Product updated.')
      } else {
        await setDoc(productRef, {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
        setNotice('Product added.')
      }

      setEditing(null)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const saveGroupedProducts = async (groupedDrafts, { batchDate }) => {
    if (!db) {
      throw new Error('Firebase is not configured.')
    }

    setIsSaving(true)
    setSavingMessage('')
    setNotice('')
    setError('')

    const reservedIds = new Set()
    let savedCount = 0

    try {
      for (const [index, groupedDraft] of groupedDrafts.entries()) {
        const selectedType = getItemType(groupedDraft.draft.itemTypeCode)

        if (!selectedType) {
          throw new Error('Every draft needs a valid item type.')
        }

        const productRef = await reserveProductRef(
          products,
          selectedType.code,
          batchDate,
          reservedIds,
        )
        const selectedCategory = getShopCategory(groupedDraft.draft.categoryId || selectedType.categoryId)
        const price = Number.parseFloat(groupedDraft.draft.price)
        let uploadedImages = []

        setSavingMessage(`Saving ${index + 1} of ${groupedDrafts.length}: ${productRef.id}`)

        try {
          uploadedImages = await uploadProductImages(groupedDraft.files, productRef.id)
          const primaryImage = uploadedImages[0]

          await setDoc(productRef, {
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.label,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            description: groupedDraft.draft.description.trim(),
            imageCount: uploadedImages.length,
            imagePath: primaryImage?.imagePath ?? '',
            imageUrl: primaryImage?.imageUrl ?? '',
            images: uploadedImages,
            itemId: productRef.id,
            itemTypeCode: selectedType.code,
            name: groupedDraft.draft.name.trim(),
            price: Math.round(price * 100) / 100,
            saleMode: groupedDraft.draft.saleMode === 'auction' ? 'auction' : 'fixed',
            currentBidPrice: groupedDraft.draft.saleMode === 'auction'
              ? Math.round(price * 100) / 100
              : null,
            auctionStatus: groupedDraft.draft.saleMode === 'auction' ? 'open' : null,
            searchText: [
              productRef.id,
              groupedDraft.draft.name,
              groupedDraft.draft.description,
              selectedCategory.label,
              selectedType.code,
              selectedType.label,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
            status: groupedDraft.draft.status || 'draft',
            type: selectedType.code,
            typeLabel: selectedType.label,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          })
        } catch (groupError) {
          await deleteStoredImages(uploadedImages)
          throw groupError
        }

        savedCount += 1
      }

      setIsBatchOpen(false)
      setNotice(`${savedCount} product draft${savedCount === 1 ? '' : 's'} saved.`)
    } catch (saveError) {
      setError(saveError.message)
      throw saveError
    } finally {
      setIsSaving(false)
      setSavingMessage('')
    }
  }

  const toggleProductStatus = async (product) => {
    await updateDoc(doc(db, 'products', product.id), {
      status: product.status === 'published' ? 'draft' : 'published',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    })
  }

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}" from shop inventory?`)) {
      return
    }

    await deleteDoc(doc(db, 'products', product.id))
    await deleteStoredImages(productImageSources(product))
    setNotice('Product deleted.')
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Shop inventory</p>
          <h2>Products</h2>
        </div>
        <button
          className="admin-button"
          type="button"
          onClick={() => {
            setEditing(null)
            setIsBatchOpen(true)
          }}
        >
          New products
        </button>
      </div>

      {notice && <p className="admin-alert">{notice}</p>}
      {error && <p className="admin-alert is-error">{error}</p>}

      {isBatchOpen && (
        <BulkProductCreator
          existingProducts={products}
          isSaving={isSaving}
          savingMessage={savingMessage}
          onCancel={() => setIsBatchOpen(false)}
          onSaveGroups={saveGroupedProducts}
        />
      )}

      {editing && (
        <ProductEditor
          key={editing.id}
          isSaving={isSaving}
          record={editing}
          onCancel={() => setEditing(null)}
          onSave={saveProduct}
        />
      )}

      <div className="admin-filters" aria-label="Filter products">
        {['all', 'draft', 'published'].map((option) => (
          <button
            className={filter === option ? 'is-active' : ''}
            key={option}
            type="button"
            onClick={() => {
              setFilter(option)
              setIsProductListExpanded(false)
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="admin-product-tools">
        <label className="admin-product-search">
          <span>Search products</span>
          <input
            type="search"
            placeholder="Search by name, item ID, category, type, price..."
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
          />
        </label>
        <p className="admin-muted">
          Showing {visibleProducts.length} of {matchingProducts.length} product
          {matchingProducts.length === 1 ? '' : 's'}
          {filter === 'all' ? '' : ` in ${filter}`}
        </p>
      </div>

      <div className="admin-product-list">
        {visibleProducts.length === 0 && (
          <p className="admin-muted">
            {productSearchQuery ? 'No products match this search.' : 'No products match this filter.'}
          </p>
        )}
        {visibleProducts.map((product) => (
          <ProductListItem
            key={product.id}
            product={product}
            onDelete={deleteProduct}
            onEdit={(nextProduct) => {
              setIsBatchOpen(false)
              setEditing(nextProduct)
            }}
            onToggleStatus={toggleProductStatus}
          />
        ))}
      </div>

      {hasHiddenProducts && (
        <div className="admin-product-list-actions">
          <button
            className="admin-button is-secondary"
            type="button"
            onClick={() => setIsProductListExpanded((current) => !current)}
          >
            {isProductListExpanded
              ? `Show first ${initialProductLimit}`
              : `Show all ${matchingProducts.length} products`}
          </button>
        </div>
      )}
    </section>
  )
}

export default AdminProducts
