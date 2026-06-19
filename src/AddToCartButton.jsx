import { useEffect, useRef, useState } from 'react'
import { useShoppingCart } from './ShoppingCartContext'

function AddToCartButton({ className = '', product }) {
  const { addItem, hasItem } = useShoppingCart()
  const [isAnimating, setIsAnimating] = useState(false)
  const resetTimer = useRef(null)
  const isInCart = hasItem(product.id)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  const handleClick = () => {
    if (isInCart) {
      return
    }

    addItem(product)
    setIsAnimating(false)
    window.clearTimeout(resetTimer.current)
    window.requestAnimationFrame(() => {
      setIsAnimating(true)
      resetTimer.current = window.setTimeout(() => setIsAnimating(false), 620)
    })
  }

  return (
    <button
      aria-label={isInCart ? `${product.name} is already in your shopping cart` : `Add ${product.name} to shopping cart`}
      className={`${className} add-cart-feedback${isAnimating ? ' is-adding' : ''}`.trim()}
      disabled={isInCart}
      type="button"
      onClick={handleClick}
    >
      <span>{isInCart ? 'In cart' : 'Add to cart'}</span>
      <span aria-hidden="true" className="add-cart-feedback-check">Added</span>
    </button>
  )
}

export default AddToCartButton
