import { useEffect, useMemo, useState } from 'react'
import heroImage from './assets/collectibles-hero.png'
import './App.css'

const navLinks = [
  { label: 'Shop All', href: '#catalog' },
  { label: 'Pokémon', href: '#categories' },
  { label: 'Video Games', href: '#categories' },
  { label: 'Collectibles', href: '#categories' },
]

const categories = [
  {
    title: 'Pokémon TCG',
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

const filters = ['All', 'New In', 'Pre-orders', 'Rare']

const products = [
  {
    category: 'Pokémon TCG',
    name: 'Obsidian Booster Pack',
    price: '$5.99',
    tags: ['New In'],
    position: '13% 58%',
  },
  {
    category: 'Pokémon TCG',
    name: 'Graded Holo Single',
    price: '$89.00',
    tags: ['Rare'],
    position: '72% 58%',
  },
  {
    category: 'Retro Games',
    name: '8-Bit Cartridge Set',
    price: '$42.00',
    tags: ['New In', 'Rare'],
    position: '55% 52%',
  },
  {
    category: 'Console Gear',
    name: 'Wireless Controller',
    price: '$64.99',
    tags: ['All'],
    position: '67% 76%',
  },
  {
    category: 'Collectibles',
    name: 'Collector Figure Box',
    price: '$34.00',
    tags: ['Pre-orders'],
    position: '82% 44%',
  },
  {
    category: 'Pokémon TCG',
    name: 'Elite Trainer Box',
    price: '$49.99',
    tags: ['Pre-orders', 'New In'],
    position: '18% 45%',
  },
  {
    category: 'Accessories',
    name: 'Slab Display Case',
    price: '$18.00',
    tags: ['All'],
    position: '43% 68%',
  },
  {
    category: 'Collectibles',
    name: 'Limited Pin Drop',
    price: '$12.00',
    tags: ['Rare'],
    position: '92% 57%',
  },
]

const hours = [
  ['Mon-Thu', '12:00 PM - 8:00 PM'],
  ['Friday', '12:00 PM - 9:00 PM'],
  ['Saturday', '11:00 AM - 9:00 PM'],
  ['Sunday', '11:00 AM - 6:00 PM'],
]

const footerGroups = [
  {
    title: 'Customer Support',
    links: ['Contact', 'Order Status', 'Trade-Ins', 'Gift Cards'],
  },
  {
    title: 'Store Policy',
    links: ['Returns', 'Pre-orders', 'Authenticity', 'Condition Guide'],
  },
  {
    title: 'Location',
    links: ['North Jersey', 'Store Hours', 'Directions', 'Events'],
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
  cart: (
    <>
      <path d="M6 6h15l-2 8H8L6 2H3" />
      <path d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
      <path d="M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
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
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
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
  const [activeFilter, setActiveFilter] = useState('All')
  const [cartCount, setCartCount] = useState(2)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const visibleProducts = useMemo(() => {
    if (activeFilter === 'All') {
      return products
    }

    return products.filter((product) => product.tags.includes(activeFilter))
  }, [activeFilter])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        setIsSearchOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('is-locked', isMenuOpen || isSearchOpen)

    return () => document.body.classList.remove('is-locked')
  }, [isMenuOpen, isSearchOpen])

  const openSearch = () => {
    setIsMenuOpen(false)
    setIsSearchOpen(true)
  }

  const openMenu = () => {
    setIsSearchOpen(false)
    setIsMenuOpen(true)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="StockRoom NJ home">
            <span className="brand-mark">SR</span>
            <span className="brand-name">StockRoom NJ</span>
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <button
              aria-label="Open search"
              className="icon-button"
              type="button"
              onClick={openSearch}
            >
              <Icon name="search" />
            </button>
            <button
              aria-label={`${cartCount} items in cart`}
              className="cart-button"
              type="button"
            >
              <Icon name="cart" />
              <span>{cartCount}</span>
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
      </header>

      {isSearchOpen && (
        <div className="search-layer">
          <button
            aria-label="Close search"
            className="modal-backdrop"
            type="button"
            onClick={() => setIsSearchOpen(false)}
          />
          <div
            aria-labelledby="search-title"
            aria-modal="true"
            className="search-dialog"
            role="dialog"
          >
            <div className="modal-head">
              <p id="search-title">Search catalog</p>
              <button
                aria-label="Close search"
                className="icon-button"
                type="button"
                onClick={() => setIsSearchOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <label className="visually-hidden" htmlFor="site-search">
              Search products
            </label>
            <div className="search-input-row">
              <Icon name="search" />
              <input
                autoFocus
                id="site-search"
                placeholder="Search Pokémon, consoles, figures"
                type="search"
              />
            </div>
          </div>
        </div>
      )}

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
              <span className="brand-mark">SR</span>
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
            <button className="drawer-search" type="button" onClick={openSearch}>
              <Icon name="search" />
              Search the catalog
            </button>
            <p className="drawer-note">Open daily in North Jersey.</p>
          </aside>
        </div>
      )}

      <main id="main-content">
        <section className="hero-section" id="top" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Local hobby shop / North Jersey</p>
              <h1 id="hero-title">
                Curated Collectibles. Rare Finds. Local Spirit.
              </h1>
              <p className="hero-text">
                Your local hub for Pokémon cards, retro and modern video games,
                and premium figures.
              </p>
              <div className="hero-actions" aria-label="Primary actions">
                <a className="button primary" href="#catalog">
                  Browse Catalog
                </a>
                <a className="button secondary" href="#location">
                  Visit Store Location
                </a>
              </div>
            </div>

            <div className="hero-visual" aria-label="Featured collectibles">
              <img
                alt="Studio arrangement of collectible card packs, game cartridges, a controller, and display figures"
                src={heroImage}
              />
              <dl className="hero-proof">
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
          </div>
        </section>

        <section className="section categories-section" id="categories">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Shop by category</p>
                <h2>Built for fast browsing.</h2>
              </div>
              <a className="text-link" href="#catalog">
                View all
                <Icon name="arrow" />
              </a>
            </div>

            <div className="category-grid">
              {categories.map((category) => (
                <a className="category-card" href={category.href} key={category.title}>
                  <span className="category-media">
                    <img
                      alt=""
                      src={heroImage}
                      style={{ objectPosition: category.position }}
                    />
                  </span>
                  <span className="category-content">
                    <span>
                      <strong>{category.title}</strong>
                      <span>{category.detail}</span>
                    </span>
                    <Icon name="arrow" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="section catalog-section" id="catalog">
          <div className="container">
            <div className="section-heading product-heading">
              <div>
                <p className="eyebrow">Latest arrivals</p>
                <h2>Fresh inventory, cleanly sorted.</h2>
              </div>
              <div className="filter-tags" aria-label="Product filters">
                {filters.map((filter) => (
                  <button
                    aria-pressed={activeFilter === filter}
                    className={activeFilter === filter ? 'is-active' : ''}
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="product-grid">
              {visibleProducts.map((product) => (
                <article className="product-card" key={product.name}>
                  <div className="product-media">
                    <img
                      alt=""
                      src={heroImage}
                      style={{ objectPosition: product.position }}
                    />
                    <button
                      className="product-action"
                      type="button"
                      onClick={() => setCartCount((count) => count + 1)}
                    >
                      <Icon name="plus" />
                      Add
                    </button>
                  </div>
                  <div className="product-details">
                    <p>{product.category}</p>
                    <h3>{product.name}</h3>
                    <span>{product.price}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section local-section" id="location">
          <div className="container local-grid">
            <div className="local-copy">
              <p className="eyebrow">Local hub</p>
              <h2>Stop in for drops, trade-ins, and weekend finds.</h2>
              <p>
                Browse online, then visit the shop to inspect cards, test games,
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
                214 Market Street
                <br />
                North Jersey, NJ 07030
              </address>
            </div>

            <div className="map-panel" aria-label="Map preview for StockRoom NJ">
              <div className="map-lines" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="map-marker">
                <span>SR</span>
              </div>
              <a
                className="map-action"
                href="https://maps.google.com"
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

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#top" aria-label="StockRoom NJ home">
              <span className="brand-mark">SR</span>
              <span className="brand-name">StockRoom NJ</span>
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
