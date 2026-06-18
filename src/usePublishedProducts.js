import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

function timestampToMillis(value) {
  if (!value) {
    return 0
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  return Number(value) || 0
}

export function normalizeProduct(productDoc) {
  const data = productDoc.data()

  return {
    id: productDoc.id,
    categoryId: data.categoryId ?? '',
    categoryName: data.categoryName ?? '',
    createdAt: data.createdAt ?? null,
    description: data.description ?? '',
    image: data.imageUrl ?? data.image ?? '',
    imagePath: data.imagePath ?? '',
    name: data.name ?? '',
    price: Number(data.price) || 0,
    status: data.status ?? 'draft',
    updatedAt: data.updatedAt ?? null,
  }
}

export function sortProducts(a, b) {
  return (
    timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt) ||
    a.name.localeCompare(b.name)
  )
}

export function usePublishedProducts() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'unconfigured')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return undefined
    }

    const publishedProductsQuery = query(
      collection(db, 'products'),
      where('status', '==', 'published'),
    )

    return onSnapshot(
      publishedProductsQuery,
      (snapshot) => {
        setProducts(snapshot.docs.map(normalizeProduct).sort(sortProducts))
        setStatus('ready')
        setError('')
      },
      (snapshotError) => {
        setStatus('error')
        setError(snapshotError.message)
      },
    )
  }, [])

  return { error, products, status }
}
