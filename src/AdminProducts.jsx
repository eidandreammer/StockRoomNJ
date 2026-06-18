import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase'
import { getShopCategory, shopCategories } from './shopCatalog'
import { normalizeProduct, sortProducts } from './usePublishedProducts'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function emptyProductForm() {
  return {
    categoryId: shopCategories[0].id,
    description: '',
    imageFile: null,
    imageUrl: '',
    name: '',
    price: '',
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
    name: record.name ?? '',
    price: record.price === undefined ? '' : String(record.price),
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

function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

  if (!form.imageUrl && !form.imageFile) {
    return 'Choose a product image.'
  }

  if (form.imageFile && !form.imageFile.type.startsWith('image/')) {
    return 'Choose an image file.'
  }

  if (form.imageFile && form.imageFile.size > MAX_IMAGE_SIZE) {
    return 'Use an image smaller than 10 MB.'
  }

  return ''
}

function ProductEditor({ isSaving, onCancel, onSave, record }) {
  const [form, setForm] = useState(() => recordToProductForm(record))
  const [error, setError] = useState('')
  const previewUrl = useMemo(
    () => (form.imageFile ? URL.createObjectURL(form.imageFile) : ''),
    [form.imageFile],
  )

  useEffect(() => {
    if (!previewUrl) {
      return undefined
    }

    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

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

  const displayImage = previewUrl || form.imageUrl

  return (
    <form className="admin-editor admin-product-editor" onSubmit={handleSubmit}>
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">{record ? 'Edit product' : 'New product'}</p>
          <h2>{record?.name ?? 'Add shop inventory'}</h2>
        </div>
        <button className="admin-button is-secondary" type="button" onClick={onCancel}>
          Close
        </button>
      </div>

      {error && <p className="admin-alert is-error">{error}</p>}

      <div className="admin-product-layout">
        <label className="admin-image-picker">
          <span>Product image</span>
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
          <label className="is-wide">
            <span>Name</span>
            <input
              required
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
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
        {isSaving ? 'Saving...' : record ? 'Save product' : 'Add product'}
      </button>
    </form>
  )
}

async function uploadProductImage(file, productId) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Add VITE_FIREBASE_STORAGE_BUCKET before uploading images.')
  }

  const safeName = sanitizeFileName(file.name) || 'product-image'
  const imageRef = ref(storage, `products/${productId}/${randomId()}-${safeName}`)
  const uploadResult = await uploadBytes(imageRef, file, {
    contentType: file.type || 'image/jpeg',
  })

  return {
    imagePath: uploadResult.ref.fullPath,
    imageUrl: await getDownloadURL(uploadResult.ref),
  }
}

async function deleteStoredImage(imagePath) {
  if (!storage || !imagePath) {
    return
  }

  try {
    await deleteObject(ref(storage, imagePath))
  } catch {
    // The product record should not stay blocked if an old image is already gone.
  }
}

function ProductListItem({ onDelete, onEdit, onToggleStatus, product }) {
  return (
    <article className="admin-product-item">
      <div className="admin-product-thumb">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>No image</span>}
      </div>
      <div className="admin-product-details">
        <span className={`admin-status is-${product.status}`}>{product.status}</span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="admin-product-meta">
          <span>{product.categoryName}</span>
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
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [products, setProducts] = useState([])
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

  const visibleProducts = useMemo(
    () => products.filter((product) => filter === 'all' || product.status === filter),
    [filter, products],
  )

  const saveProduct = async (form) => {
    setIsSaving(true)
    setNotice('')
    setError('')

    try {
      const selectedCategory = getShopCategory(form.categoryId)
      const price = Number.parseFloat(form.price)
      const productRef = editing?.id ? doc(db, 'products', editing.id) : doc(collection(db, 'products'))
      const imageFields = form.imageFile ? await uploadProductImage(form.imageFile, productRef.id) : {}
      const payload = {
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.label,
        description: form.description.trim(),
        name: form.name.trim(),
        price: Math.round(price * 100) / 100,
        searchText: `${form.name} ${form.description} ${selectedCategory.label}`.toLowerCase(),
        status: form.status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...imageFields,
      }

      if (editing?.id) {
        await updateDoc(productRef, payload)
        if (imageFields.imagePath && editing.imagePath && editing.imagePath !== imageFields.imagePath) {
          await deleteStoredImage(editing.imagePath)
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
    await deleteStoredImage(product.imagePath)
    setNotice('Product deleted.')
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Shop inventory</p>
          <h2>Products</h2>
        </div>
        <button className="admin-button" type="button" onClick={() => setEditing({})}>
          New product
        </button>
      </div>

      {notice && <p className="admin-alert">{notice}</p>}
      {error && <p className="admin-alert is-error">{error}</p>}

      {editing && (
        <ProductEditor
          key={editing.id ?? 'new-product'}
          isSaving={isSaving}
          record={editing.id ? editing : null}
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
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="admin-product-list">
        {visibleProducts.length === 0 && <p className="admin-muted">No products match this filter.</p>}
        {visibleProducts.map((product) => (
          <ProductListItem
            key={product.id}
            product={product}
            onDelete={deleteProduct}
            onEdit={setEditing}
            onToggleStatus={toggleProductStatus}
          />
        ))}
      </div>
    </section>
  )
}

export default AdminProducts
