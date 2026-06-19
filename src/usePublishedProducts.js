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
  const images = Array.isArray(data.images)
    ? data.images
        .map((image, index) => ({
          contentType: image.contentType ?? '',
          fileName: image.fileName ?? '',
          imagePath: image.imagePath ?? '',
          imageUrl: image.imageUrl ?? image.url ?? '',
          size: Number(image.size) || 0,
          sortOrder: Number.isFinite(Number(image.sortOrder)) ? Number(image.sortOrder) : index,
        }))
        .filter((image) => image.imageUrl || image.imagePath)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  const primaryImage = images[0]
  const imageUrl = data.imageUrl || data.image || primaryImage?.imageUrl || ''
  const imagePath = data.imagePath || primaryImage?.imagePath || ''

  return {
    id: productDoc.id,
    auctionEndsAt: data.auctionEndsAt ?? null,
    auctionStatus: data.auctionStatus ?? 'open',
    categoryId: data.categoryId ?? '',
    categoryName: data.categoryName ?? '',
    createdAt: data.createdAt ?? null,
    currentBidPrice: Number(data.currentBidPrice) || Number(data.price) || 0,
    description: data.description ?? '',
    image: imageUrl,
    imageCount: Number(data.imageCount) || images.length || (imageUrl ? 1 : 0),
    imagePath,
    images,
    itemId: data.itemId ?? productDoc.id,
    itemTypeCode: data.itemTypeCode ?? data.type ?? '',
    name: data.name ?? '',
    price: Number(data.price) || 0,
    saleMode: data.saleMode ?? (data.auctionEnabled ? 'auction' : 'fixed'),
    status: data.status ?? 'draft',
    type: data.type ?? data.itemTypeCode ?? '',
    typeLabel: data.typeLabel ?? '',
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
