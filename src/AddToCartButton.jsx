import { useEffect, useRef, useState } from 'react'
import { useShoppingCart } from './ShoppingCartContext'

function AddToCartButton({ className = '', product }) {
  const { addItem } = useShoppingCart()
  const [isAnimating, setIsAnimating] = useState(false)
  const resetTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  const handleClick = () => {
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
      aria-label={`Add ${product.name} to shopping cart`}
      className={`${className} add-cart-feedback${isAnimating ? ' is-adding' : ''}`.trim()}
      type="button"
      onClick={handleClick}
    >
      <span>Add to cart</span>
      <span aria-hidden="true" className="add-cart-feedback-check">Added</span>
    </button>
  )
}

export default AddToCartButton
