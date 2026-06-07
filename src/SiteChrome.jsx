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
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef(null)
  const scrollFrame = useRef(null)
  const homeHref = getHomeHref(currentPage)
  const navLinks = getNavLinks(currentPage)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('is-locked', isMenuOpen)

    return () => document.body.classList.remove('is-locked')
  }, [isMenuOpen])

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
    setIsMenuOpen(true)
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
          <p>&copy; {new Date().getFullYear()} The Stock Room. Wallington, NJ.</p>
          <div className="footer-social" aria-label="Social media">
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
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <SiteHeader currentPage={currentPage} isFooterVisible={isFooterVisible} />
      {children}
      <SiteFooter currentPage={currentPage} footerRef={footerRef} />
    </div>
  )
}

export default SiteShell
