import { useEffect, useRef, useState } from 'react'
import Masonry from './Masonry'
import './App.css'

const brandLogo = `${import.meta.env.BASE_URL}segundo%20logo%20the%20stock%20room.png`
const footerLogo = `${import.meta.env.BASE_URL}circle%20logo.png`
const heroBackground = `${import.meta.env.BASE_URL}Images/13.png`
const storeAddress = '66 Union Blvd, Wallington, NJ 07057'
const storeEmail = 'thestockroomnj@gmail.com'
const storePhone = '(609) 459-5069'
const storePhoneHref = 'tel:+16094595069'
const encodedStoreAddress = encodeURIComponent(storeAddress)
const googleMapEmbedUrl = `https://www.google.com/maps?q=${encodedStoreAddress}&output=embed`
const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedStoreAddress}`
const galleryHeights = [760, 520, 620, 700, 480, 580, 660, 500, 740, 560, 640, 460]

const galleryItems = Array.from({ length: 12 }, (_, index) => {
  const imageNumber = index + 1
  const imageSrc = `${import.meta.env.BASE_URL}Images/${imageNumber}.png`

  return {
    id: `gallery-${imageNumber}`,
    alt: `StockRoom NJ gallery image ${imageNumber}`,
    height: galleryHeights[index],
    img: imageSrc,
    url: imageSrc,
  }
})

const navLinks = [
  { label: 'Gallery', href: '#catalog' },
  { label: 'About Us', href: '#about-us' },
  { label: 'Find Us', href: '#find-us' },
  { label: 'Contact', href: '#contact' },
]

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

const hours = [
  ['Mon-Fri', '9:00 AM - 6:00 PM'],
  ['Saturday', 'Closed'],
  ['Sunday', 'Closed'],
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

function Icon({ name, className = '' }) {
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

function App() {
  const [headerState, setHeaderState] = useState({
    isCompressed: false,
    isHidden: false,
  })
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isFooterVisible, setIsFooterVisible] = useState(false)
  const footerRef = useRef(null)
  const lastScrollY = useRef(0)
  const scrollFrame = useRef(null)

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
      const hero = document.querySelector('.hero-section')
      const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : window.innerHeight
      const isScrollingDown = currentScrollY > lastScrollY.current
      const nextState = {
        isCompressed: currentScrollY > 24,
        isHidden: isScrollingDown && currentScrollY > heroBottom + 48,
      }

      setHeaderState((currentState) => {
        if (
          currentState.isCompressed === nextState.isCompressed &&
          currentState.isHidden === nextState.isHidden
        ) {
          return currentState
        }

        return nextState
      })

      lastScrollY.current = currentScrollY
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

  const openMenu = () => {
    setIsMenuOpen(true)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header
        className={[
          'site-header',
          headerState.isCompressed ? 'is-compressed' : '',
          headerState.isHidden ? 'is-hidden' : '',
          isFooterVisible ? 'is-footer-visible' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="header-inner">
          <a className="brand header-brand" href="#top" aria-label="StockRoom NJ home">
            <img className="brand-logo" src={brandLogo} alt="The Stock Room logo" />
          </a>

          <div className="header-right">
            <nav className="desktop-nav" aria-label="Primary navigation">
              {navLinks.map((link) => (
                <a key={link.label} href={link.href}>
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

      <main id="main-content">
        <section
          className="hero-section"
          id="top"
          aria-labelledby="hero-title"
          style={{ '--hero-background': `url("${heroBackground}")` }}
        >
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Local hobby shop / Wallington, NJ</p>
              <h1 id="hero-title">
                Curated Collectibles. Rare Finds. Local Spirit.
              </h1>
              <p className="hero-text">
                Your local hub for Pokemon cards, retro and modern video games,
                and premium figures.
              </p>
              <div className="hero-actions" aria-label="Primary actions">
                <a className="button primary" href="#catalog">
                  View Gallery
                </a>
                <a className="button secondary" href="#find-us">
                  Find Us
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section about-section" id="about-us" aria-labelledby="about-title">
          <div className="container about-grid">
            <div>
              <p className="eyebrow">About us</p>
              <h2 id="about-title">A local spot for cards, games, and collectibles.</h2>
            </div>
            <div className="about-copy">
              <p>
                The Stock Room brings together Pokemon TCG, retro and modern games,
                figures, and hard-to-find collectibles in a shop built for browsing.
              </p>
              <ul className="about-list">
                <li>In-store finds rotate with new arrivals and trade-ins.</li>
                <li>Collectors can inspect items before they buy.</li>
                <li>Local pickups keep the experience simple and personal.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section gallery-section" id="catalog">
          <div className="container">
            <div className="section-heading gallery-heading">
              <div>
                <p className="eyebrow">In-store gallery</p>
                <h2>Inside StockRoom NJ.</h2>
              </div>
            </div>

            <div className="masonry-gallery">
              <Masonry
                animateFrom="bottom"
                blurToFocus
                colorShiftOnHover={false}
                duration={0.6}
                ease="power3.out"
                hoverScale={0.97}
                items={galleryItems}
                scaleOnHover
                stagger={0.05}
              />
            </div>
          </div>
        </section>

        <section className="section local-section" id="find-us" aria-labelledby="find-us-title">
          <div className="container local-grid">
            <div className="local-copy">
              <p className="eyebrow">Find us</p>
              <h2 id="find-us-title">Stop in for drops, trade-ins, and Union Boulevard finds.</h2>
              <p>
                Browse the gallery, then visit the shop to inspect cards, test games,
                and talk through new arrivals with the team.
              </p>

              <div className="store-table" aria-label="Store hours">
                {hours.map(([day, time]) => (
                  <div className="store-row" key={day}>
                    <span>{day}</span>
                    <strong>{time}</strong>
                  </div>
                ))}
              </div>

              <address>
                66 Union Blvd
                <br />
                Wallington, NJ 07057
              </address>
            </div>

            <div className="map-panel" aria-label={`Google Map for StockRoom NJ at ${storeAddress}`}>
              <iframe
                allowFullScreen
                className="map-frame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={googleMapEmbedUrl}
                title="Google Map for StockRoom NJ"
              />
              <a
                className="map-action"
                href={googleDirectionsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open directions
                <Icon name="arrow" />
              </a>
            </div>
          </div>
        </section>

        
      </main>

      <footer className="site-footer" ref={footerRef}>
        <div className="footer-menu-band">
          <div className="container footer-menu-grid">
            <div className="footer-brand">
              <a className="brand footer-brand-link" href="#top" aria-label="StockRoom NJ home">
                <img className="brand-logo" src={footerLogo} alt="The Stock Room logo" />
              </a>
              <p>Cards, games, figures, and collectible finds in Wallington.</p>
            </div>

            <nav className="footer-nav" aria-label="Footer menu">
              <h2>Footer Menu</h2>
              <ul>
                {navLinks.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="footer-contact" id="contact">
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
                  <span>Direction</span>
                  <a href={googleDirectionsUrl} rel="noreferrer" target="_blank">
                    {storeAddress}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="container footer-bottom">
            <p>© {new Date().getFullYear()} The Stock Room. Wallington, NJ.</p>
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
    </div>
  )
}

export default App
