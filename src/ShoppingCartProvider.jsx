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

    const uniqueItems = []
    const seenItemIds = new Set()

    for (const item of storedCart) {
      if (!item || !item.id || seenItemIds.has(item.id)) {
        continue
      }

      seenItemIds.add(item.id)
      uniqueItems.push({
        categoryName: item.categoryName ?? '',
        id: item.id,
        image: item.image ?? '',
        itemId: item.itemId ?? item.id,
        name: item.name ?? 'Untitled item',
        price: Number(item.price) || 0,
        quantity: 1,
      })
    }

    return uniqueItems
  } catch {
    return []
  }
}

export function ShoppingCartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart)
  const [cartAnimationKey, setCartAnimationKey] = useState(0)

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

      if (items.some((item) => item.id === nextItem.id)) {
        return
      }

      setCartAnimationKey((currentKey) => currentKey + 1)
      setItems((currentItems) => {
        const existingItem = currentItems.find((item) => item.id === nextItem.id)

        if (existingItem) {
          return currentItems
        }

        return [...currentItems, { ...nextItem, quantity: 1 }]
      })
    }

    const hasItem = (itemId) => items.some((item) => item.id === itemId)

    const removeItem = (itemId) => {
      setItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    }

    const clearCart = () => {
      setItems([])
    }

    const totalItems = items.length
    const subtotal = items.reduce((total, item) => total + item.price, 0)

    return {
      addItem,
      cartAnimationKey,
      clearCart,
      hasItem,
      items,
      removeItem,
      subtotal,
      totalItems,
    }
  }, [cartAnimationKey, items])

  return (
    <ShoppingCartContext.Provider value={value}>
      {children}
    </ShoppingCartContext.Provider>
  )
}
