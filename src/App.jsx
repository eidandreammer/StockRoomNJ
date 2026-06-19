import InventorySearch from './InventorySearch'
import Masonry from './Masonry'
import SiteShell, { Icon } from './SiteChrome'
import GoogleMap from './GoogleMap'
import {
  googleDirectionsUrl,
  hours,
  productGalleryUrl,
  storeAddress,
  storeEmail,
  storePhone,
  storePhoneHref,
} from './siteConfig'
import EventsCalendar from './events/EventsCalendar'
import heroBackground from './assets/hero-background.png'
import './App.css'

const galleryItems = [
  {
    id: 'gallery-test-vid',
    alt: 'Stock Room Test Vid',
    width: 1920,
    height: 1080,
    type: 'video',
    fullWidth: true,
    img: `${import.meta.env.BASE_URL}Images/Stock Room Test Vid.mp4`,
    url: `${import.meta.env.BASE_URL}Images/Stock Room Test Vid.mp4`,
  },
  {
    id: 'gallery-1',
    alt: 'StockRoom NJ gallery image 1',
    width: 1366,
    height: 768,
    img: `${import.meta.env.BASE_URL}Images/1.png`,
    url: `${import.meta.env.BASE_URL}Images/1.png`,
  },
  {
    id: 'gallery-naruto-rug',
    alt: 'Naruto Rug',
    width: 2528,
    height: 1684,
    img: `${import.meta.env.BASE_URL}Images/Naruto Rug.png`,
    url: `${import.meta.env.BASE_URL}Images/Naruto Rug.png`,
  },
]

function App() {
  return (
    <SiteShell currentPage="home">
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
              <h1 id="hero-title">Curated Collectibles. Rare Finds. Local Spirit.</h1>
              <p className="hero-text">
                Your local hub for Pokemon cards, retro and modern video games,
                and premium figures.
              </p>
              <div className="hero-actions" aria-label="Primary actions">
                <a className="button primary" href={productGalleryUrl}>
                  View Shop
                </a>
                <a className="button secondary" href="#find-us">
                  Find Us
                </a>
              </div>
            </div>
          </div>
        </section>

        <InventorySearch />

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
              <GoogleMap />
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

        <section className="section contact-section" id="contact" aria-labelledby="contact-title">
          <div className="container contact-grid">
            <div>
              <p className="eyebrow">Contact us</p>
              <h2 id="contact-title">Questions about the shop or an upcoming event?</h2>
            </div>
            <div className="contact-methods">
              <a className="contact-method" href={storePhoneHref}>
                <span>Phone</span>
                <strong>{storePhone}</strong>
              </a>
              <a className="contact-method" href={`mailto:${storeEmail}`}>
                <span>Email</span>
                <strong>{storeEmail}</strong>
              </a>
              <a
                className="contact-method"
                href={googleDirectionsUrl}
                rel="noreferrer"
                target="_blank"
              >
                <span>Store directions</span>
                <strong>{storeAddress}</strong>
              </a>
            </div>
          </div>
        </section>

        <section className="section events-section" id="events" aria-labelledby="events-title">
          <div className="container">
            <div className="section-heading events-heading">
              <div>
                <p className="eyebrow">Where we will be</p>
                <h2 id="events-title">Upcoming events and pop-up stops.</h2>
              </div>
              <p>
                Switch between month, week, and day views to see where to find us and
                what we are bringing.
              </p>
            </div>
            <EventsCalendar />
          </div>
        </section>
      </main>
    </SiteShell>
  )
}

export default App
