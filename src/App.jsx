import { useEffect, useRef, useState } from 'react'
import catalogImage from './assets/collectibles-hero.png'
import Masonry from './Masonry'
import './App.css'

const brandLogo = `${import.meta.env.BASE_URL}StockRoomNJ%20Logo.png`
const heroBackground = `${import.meta.env.BASE_URL}Images/13.png`
const storeAddress = '66 Union Blvd, Wallington, NJ 07057'
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
  { label: 'Pokemon', href: '#categories' },
  { label: 'Video Games', href: '#categories' },
  { label: 'Collectibles', href: '#categories' },
]

const categories = [
  {
    title: 'Pokemon TCG',
    detail: 'Booster packs, singles, elite trainer boxes',
    href: '#catalog',
    position: '11% 58%',
  },
  {
    title: 'Video Games',
    detail: 'Retro classics to modern releases',
    href: '#catalog',
    position: '58% 56%',
  },
  {
    title: 'Action Figures & Statues',
    detail: 'Display-ready figures and boxed releases',
    href: '#catalog',
    position: '83% 43%',
  },
  {
    title: 'Limited Collectibles',
    detail: 'Graded slabs, cases, pins, and hard-to-find drops',
    href: '#catalog',
    position: '48% 68%',
  },
]

const hours = [
  ['Mon-Fri', '9:00 AM - 6:00 PM'],
  ['Saturday', 'Closed'],
  ['Sunday', 'Closed'],
]

const footerGroups = [
  {
    title: 'Customer Support',
    links: ['Contact', 'Trade-Ins', 'Store Hours'],
  },
  {
    title: 'Store Policy',
    links: ['Returns', 'Authenticity', 'Condition Guide'],
  },
  {
    title: 'Location',
    links: ['Wallington, NJ', 'Store Hours', 'Directions', 'Events'],
  },
  {
    title: 'Socials',
    links: ['Instagram', 'TikTok', 'Discord', 'YouTube'],
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
          <a className="brand" href="#top" aria-label="StockRoom NJ home">
            <img className="brand-logo" src={brandLogo} alt="StockRoom NJ logo" />
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
              <img className="brand-logo" src={brandLogo} alt="StockRoom NJ logo" />
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
                <a className="button secondary" href="#location">
                  Visit Store Location
                </a>
              </div>
            </div>

            <dl className="hero-proof" aria-label="Store highlights">
              <div>
                <dt>Daily</dt>
                <dd>Restocks</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>Trade-ins</dd>
              </div>
              <div>
                <dt>Rare</dt>
                <dd>Drops</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section categories-section" id="categories">
          
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

        <section className="section local-section" id="location">
          <div className="container local-grid">
            <div className="local-copy">
              <p className="eyebrow">Local hub</p>
              <h2>Stop in for drops, trade-ins, and Union Boulevard finds.</h2>
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
        <div className="container footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#top" aria-label="StockRoom NJ home">
              <img className="brand-logo" src={brandLogo} alt="StockRoom NJ logo" />
            </a>
            <form
              aria-label="Newsletter signup"
              className="newsletter"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="visually-hidden" htmlFor="newsletter-email">
                Email address
              </label>
              <input
                id="newsletter-email"
                placeholder="Email address"
                type="email"
              />
              <button aria-label="Submit newsletter signup" type="submit">
                <Icon name="arrow" />
              </button>
            </form>
          </div>

          {footerGroups.map((group) => (
            <div className="footer-column" key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link}>
                    <a href="#top">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="container footer-bottom">
          <p>Copyright 2026 StockRoom NJ. All rights reserved.</p>
          <p>Cards. Games. Figures. Local pickups.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
