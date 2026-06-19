import { useEffect, useRef, useState } from 'react'
import {
  brandLogo,
  footerLogo,
  googleDirectionsUrl,
  homeUrl,
  productGalleryUrl,
  storeAddress,
  storeEmail,
  storePhone,
  storePhoneHref,
} from './siteConfig'
import { useShoppingCart } from './ShoppingCartContext'
import { ShoppingCartProvider } from './ShoppingCartProvider'
import CheckoutDialog from './CheckoutDialog'
import LegalConsentPrompt from './LegalConsentPrompt'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const socialLinks = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/stockroomnj/',
    icon: 'instagram',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@stockroomnj',
    icon: 'tiktok',
  },
]

const icons = {
  admin: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M3 4h2.2l2.1 11.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21.3 8H6" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  tiktok: (
    <path
      d="M15.9 3.5c.4 2.6 1.9 4.1 4.4 4.3v3.3c-1.5.1-2.9-.3-4.2-1.1v5.6c0 3.4-2.1 5.6-5.4 5.6-3 0-5.2-1.9-5.2-4.7 0-3.1 2.7-5.1 6-4.5v3.5c-1.4-.4-2.4.2-2.4 1.2 0 .8.7 1.3 1.6 1.3 1.1 0 1.7-.7 1.7-2V3.5h3.5Z"
      fill="currentColor"
      stroke="none"
    />
  ),
}

export function Icon({ name, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`.trim()}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {icons[name]}
    </svg>
  )
}

function ShoppingCartDrawer({ isOpen, onClose }) {
  const { clearCart, items, removeItem, subtotal, totalItems } = useShoppingCart()
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const formattedSubtotal = priceFormatter.format(subtotal)

  if (!isOpen) {
    return null
  }

  return (
    <div className="shopping-cart-drawer is-open" id="shopping-cart">
      <button
        aria-label="Close shopping cart"
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
      />
      <aside
        aria-labelledby="shopping-cart-title"
        aria-modal="true"
        className="cart-panel"
        role="dialog"
      >
        <div className="cart-panel-head">
          <div>
            <p className="cart-kicker">Shopping cart</p>
            <h2 id="shopping-cart-title">Your items</h2>
          </div>
          <button
            aria-label="Close shopping cart"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        {items.length > 0 ? (
          <>
            <div className="cart-scroll-area">
              <ul className="cart-item-list" aria-label="Shopping cart items">
                {items.map((item) => (
                  <li className="cart-item" key={item.id}>
                    <div className="cart-item-media">
                      {item.image ? (
                        <img src={item.image} alt="" />
                      ) : (
                        <span>No image</span>
                      )}
                    </div>
                    <div className="cart-item-content">
                      <div>
                        {item.categoryName && (
                          <span className="cart-item-category">{item.categoryName}</span>
                        )}
                        <h3>{item.name}</h3>
                        <p>
                          {priceFormatter.format(item.price)}
                          {item.quantity > 1 ? ` x ${item.quantity}` : ''}
                        </p>
                      </div>
                      <button
                        className="cart-remove-button"
                        type="button"
                        onClick={() => removeItem(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="cart-summary">
              <span>
                {totalItems} item{totalItems === 1 ? '' : 's'}
              </span>
              <strong>{formattedSubtotal}</strong>
            </div>
            <div className="cart-actions">
              <button
                className="button primary cart-checkout-button"
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
              >
                Checkout
              </button>
              <button
                aria-label="Clear all items from shopping cart"
                className="cart-clear-button"
                type="button"
                onClick={clearCart}
              >
                Clear cart
              </button>
            </div>
          </>
        ) : (
          <div className="cart-empty-state">
            <p>Your cart is empty.</p>
            <span>Add items from the shop to see them here.</span>
          </div>
        )}
      </aside>
      {isCheckoutOpen && (
        <CheckoutDialog
          items={items}
          subtotal={formattedSubtotal}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}
    </div>
  )
}

const getHomeHref = (currentPage) => (currentPage === 'home' ? '#top' : `${homeUrl}#top`)

const getHomeSectionHref = (currentPage, sectionId) =>
  currentPage === 'home' ? `#${sectionId}` : `${homeUrl}#${sectionId}`

const getNavLinks = (currentPage) => [
  ...(currentPage === 'shop' ? [{ label: 'Home', href: getHomeHref(currentPage), page: 'home' }] : []),
  { label: 'Shop', href: productGalleryUrl, page: 'shop' },
  { label: 'Search', href: getHomeSectionHref(currentPage, 'inventory-search') },
  { label: 'About Us', href: getHomeSectionHref(currentPage, 'about-us') },
  { label: 'Find Us', href: getHomeSectionHref(currentPage, 'find-us') },
  { label: 'Contact', href: getHomeSectionHref(currentPage, 'contact') },
  { label: 'Events', href: getHomeSectionHref(currentPage, 'events') },
]

function SiteHeader({ currentPage, isFooterVisible }) {
  const [headerState, setHeaderState] = useState({
    isHidden: false,
    isPastHero: false,
  })
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { cartAnimationKey, totalItems } = useShoppingCart()
  const headerRef = useRef(null)
  const scrollFrame = useRef(null)
  const homeHref = getHomeHref(currentPage)
  const navLinks = getNavLinks(currentPage)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsCartOpen(false)
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('is-locked', isMenuOpen || isCartOpen)

    return () => document.body.classList.remove('is-locked')
  }, [isCartOpen, isMenuOpen])

  useEffect(() => {
    const updateHeader = () => {
      const currentScrollY = Math.max(window.scrollY, 0)
      const hero = document.querySelector('.hero-section, .gallery-intro')
      const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : window.innerHeight
      const compressionProgress = Math.min(currentScrollY / 120, 1)
      const headerSizes =
        window.innerWidth <= 640
          ? {
              height: [96, 68],
              logoHeight: [52, 42],
              logoWidth: [120, 118],
              actionSize: [42, 42],
              socialSize: [36, 36],
              navFont: [0.94, 0.88],
            }
          : window.innerWidth <= 980
            ? {
                height: [96, 68],
                logoHeight: [58, 42],
                logoWidth: [166, 118],
                actionSize: [46, 42],
                socialSize: [40, 36],
                navFont: [0.96, 0.88],
              }
            : window.innerWidth <= 1180
              ? {
                  height: [112, 72],
                  logoHeight: [86, 58],
                  logoWidth: [200, 140],
                  actionSize: [48, 42],
                  socialSize: [40, 38],
                  navFont: [0.96, 0.88],
                }
              : {
                  height: [122, 72],
                  logoHeight: [106, 62],
                  logoWidth: [240, 148],
                  actionSize: [50, 42],
                  socialSize: [42, 38],
                  navFont: [1.02, 0.9],
                }
      const nextState = {
        isHidden: false,
        isPastHero: currentScrollY > heroBottom - 88,
      }
      const interpolateSize = ([maximum, minimum]) =>
        `${maximum - (maximum - minimum) * compressionProgress}px`

      headerRef.current?.style.setProperty('--header-height', interpolateSize(headerSizes.height))
      headerRef.current?.style.setProperty('--logo-height', interpolateSize(headerSizes.logoHeight))
      headerRef.current?.style.setProperty('--logo-width', interpolateSize(headerSizes.logoWidth))
      headerRef.current?.style.setProperty('--action-size', interpolateSize(headerSizes.actionSize))
      headerRef.current?.style.setProperty('--social-size', interpolateSize(headerSizes.socialSize))
      headerRef.current?.style.setProperty(
        '--nav-font-size',
        `${headerSizes.navFont[0] - (headerSizes.navFont[0] - headerSizes.navFont[1]) * compressionProgress}rem`,
      )
      setHeaderState((currentState) => {
        if (
          currentState.isHidden === nextState.isHidden &&
          currentState.isPastHero === nextState.isPastHero
        ) {
          return currentState
        }

        return nextState
      })

      scrollFrame.current = null
    }

    const handleScroll = () => {
      if (scrollFrame.current !== null) {
        return
      }

      scrollFrame.current = window.requestAnimationFrame(updateHeader)
    }

    updateHeader()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)

      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current)
      }
    }
  }, [])

  const openMenu = () => {
    setIsCartOpen(false)
    setIsMenuOpen(true)
  }

  const openCart = () => {
    setIsMenuOpen(false)
    setIsCartOpen(true)
  }

  return (
    <>
      <header
        ref={headerRef}
        className={[
          'site-header',
          headerState.isHidden ? 'is-hidden' : '',
          headerState.isPastHero ? 'is-past-hero' : 'is-over-hero',
          isFooterVisible ? 'is-footer-visible' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="header-inner">
          <div className="header-left">
            <nav className="header-social" aria-label="Social media">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  aria-label={social.label}
                  className="icon-button social-link"
                  href={social.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon name={social.icon} />
                </a>
              ))}
            </nav>

            <a className="brand header-brand" href={homeHref} aria-label="StockRoom NJ home">
              <img className="brand-logo" src={brandLogo} alt="The Stock Room logo" />
            </a>
          </div>

          <div className="header-right">
            <nav className="desktop-nav" aria-label="Primary navigation">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  aria-current={link.page === currentPage ? 'page' : undefined}
                  href={link.href}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="header-actions">
              <button
                key={`cart-toggle-${cartAnimationKey}`}
                aria-controls="shopping-cart"
                aria-expanded={isCartOpen}
                aria-label={`Open shopping cart with ${totalItems} item${totalItems === 1 ? '' : 's'}`}
                className={`icon-button cart-toggle${cartAnimationKey ? ' is-cart-adding' : ''}`}
                type="button"
                onClick={openCart}
              >
                <Icon name="cart" />
                {totalItems > 0 && (
                  <span className="cart-count-badge">{totalItems}</span>
                )}
              </button>

              <button
                aria-controls="mobile-menu"
                aria-expanded={isMenuOpen}
                aria-label="Open menu"
                className="icon-button menu-toggle"
                type="button"
                onClick={openMenu}
              >
                <Icon name="menu" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="mobile-menu is-open" id="mobile-menu">
          <button
            aria-label="Close menu"
            className="drawer-backdrop"
            type="button"
            onClick={() => setIsMenuOpen(false)}
          />
          <aside
            aria-label="Mobile navigation"
            aria-modal="true"
            className="drawer-panel"
            role="dialog"
          >
            <div className="modal-head">
              <img className="brand-logo" src={brandLogo} alt="The Stock Room logo" />
              <button
                aria-label="Close menu"
                className="icon-button"
                type="button"
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <nav aria-label="Mobile primary navigation" className="drawer-nav">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  aria-current={link.page === currentPage ? 'page' : undefined}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                  <Icon name="arrow" />
                </a>
              ))}
            </nav>
            <p className="drawer-note">Open Monday-Friday in Wallington.</p>
          </aside>
        </div>
      )}

      <ShoppingCartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  )
}

function SiteFooter({ currentPage, footerRef }) {
  const homeHref = getHomeHref(currentPage)
  const navLinks = getNavLinks(currentPage)

  return (
    <footer className="site-footer" ref={footerRef}>
      <div className="footer-menu-band">
        <div className="container footer-menu-grid">
          <div className="footer-brand">
            <a className="brand footer-brand-link" href={homeHref} aria-label="StockRoom NJ home">
              <img className="brand-logo" src={footerLogo} alt="The Stock Room logo" />
            </a>
            <p>Cards, games, figures, and collectible finds in Wallington.</p>
          </div>

          <nav className="footer-nav" aria-label="Footer menu">
            <h2>Footer Menu</h2>
            <ul>
              {navLinks.map((link) => (
                <li key={link.label}>
                  <a
                    aria-current={link.page === currentPage ? 'page' : undefined}
                    href={link.href}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="footer-contact">
            <h2>Contact</h2>
            <ul>
              <li>
                <span>Phone</span>
                <a href={storePhoneHref}>{storePhone}</a>
              </li>
              <li>
                <span>Email</span>
                <a href={`mailto:${storeEmail}`}>{storeEmail}</a>
              </li>
              <li>
                <span>Directions</span>
                <a href={googleDirectionsUrl} rel="noreferrer" target="_blank">
                  {storeAddress}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="container footer-bottom">
          <p>
            &copy; {new Date().getFullYear()} The Stock Room. Wallington, NJ.
            <span style={{ margin: '0 0.75rem', opacity: 0.5 }}>|</span>
            <a href="./legal.html?doc=TOS" style={{ textDecoration: 'none', transition: 'color 0.15s' }} className="footer-legal-link">Terms of Service</a>
            <span style={{ margin: '0 0.75rem', opacity: 0.5 }}>|</span>
            <a href="./legal.html?doc=PRIVACY_POLICY" style={{ textDecoration: 'none', transition: 'color 0.15s' }} className="footer-legal-link">Privacy Policy</a>
          </p>
          <div className="footer-social" aria-label="Social media">
            <a aria-label="Admin dashboard" href="./admin">
              <Icon name="admin" />
            </a>
            {socialLinks.map((social) => (
              <a
                key={social.label}
                aria-label={social.label}
                href={social.href}
                rel="noreferrer"
                target="_blank"
              >
                <Icon name={social.icon} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

function SiteShell({ children, currentPage = 'home' }) {
  const [isFooterVisible, setIsFooterVisible] = useState(false)
  const footerRef = useRef(null)

  useEffect(() => {
    const footer = footerRef.current

    if (!footer) {
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsFooterVisible(entry.isIntersecting)
    })

    observer.observe(footer)

    return () => observer.disconnect()
  }, [])

  return (
    <ShoppingCartProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>

        <SiteHeader currentPage={currentPage} isFooterVisible={isFooterVisible} />
        {children}
        <SiteFooter currentPage={currentPage} footerRef={footerRef} />
        <LegalConsentPrompt />
      </div>
    </ShoppingCartProvider>
  )
}

export default SiteShell
