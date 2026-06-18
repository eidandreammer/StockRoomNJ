import { useEffect, useMemo, useState } from 'react'
import { ShoppingCartContext } from './ShoppingCartContext'

const storageKey = 'stockroomnj-shopping-cart'

function normalizeCartItem(product) {
  return {
    categoryName: product.categoryName ?? '',
    id: product.id,
    image: product.image ?? '',
    itemId: product.itemId ?? product.id,
    name: product.name ?? 'Untitled item',
    price: Number(product.price) || 0,
  }
}

function readStoredCart() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const storedCart = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')

    if (!Array.isArray(storedCart)) {
      return []
    }

    return storedCart
      .filter((item) => item && item.id)
      .map((item) => ({
        categoryName: item.categoryName ?? '',
        id: item.id,
        image: item.image ?? '',
        itemId: item.itemId ?? item.id,
        name: item.name ?? 'Untitled item',
        price: Number(item.price) || 0,
        quantity: Math.max(1, Number(item.quantity) || 1),
      }))
  } catch {
    return []
  }
}

export function ShoppingCartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart)

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      // Cart still works for the current session if storage is unavailable.
    }
  }, [items])

  const value = useMemo(() => {
    const addItem = (product) => {
      const nextItem = normalizeCartItem(product)

      setItems((currentItems) => {
        const existingItem = currentItems.find((item) => item.id === nextItem.id)

        if (!existingItem) {
          return [...currentItems, { ...nextItem, quantity: 1 }]
        }

        return currentItems.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                ...nextItem,
                quantity: item.quantity + 1,
              }
            : item,
        )
      })
    }

    const removeItem = (itemId) => {
      setItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    }

    const totalItems = items.reduce((total, item) => total + item.quantity, 0)
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0)

    return {
      addItem,
      items,
      removeItem,
      subtotal,
      totalItems,
    }
  }, [items])

  return (
    <ShoppingCartContext.Provider value={value}>
      {children}
    </ShoppingCartContext.Provider>
  )
}
