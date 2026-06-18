import { createContext, useContext } from 'react'

export const ShoppingCartContext = createContext(null)

export function useShoppingCart() {
  const context = useContext(ShoppingCartContext)

  if (!context) {
    throw new Error('useShoppingCart must be used within ShoppingCartProvider')
  }

  return context
}
