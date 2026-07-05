# Google Maps JavaScript Map With Iframe Fallback

This guide explains how to recreate the map feature that appears when the Google Maps API key is present and usable. The primary implementation is an interactive Google Maps JavaScript API map with a branded HTML marker attached to the store coordinates. The iframe map is only the fallback for missing keys, auth failures, script load failures, or runtime errors.

## Implementation Target

Build the map in this order:

1. Try the Google Maps JavaScript API map.
2. Attach the branded marker with `google.maps.OverlayView`, not with a fixed centered HTML overlay.
3. Keep the address banner as normal HTML over the map.
4. If the API key is missing or Google Maps fails, render the non-interactive iframe fallback.

Do not recreate only the iframe fallback when the goal is to match the normal production experience.

The map must not show Google's standard place details compact container, and it must not show the standard red Google place label/pin text for `BUSINESS_NAME_HERE`.

## Tech Stack Contract

- **Primary map:** Google Maps JavaScript API, loaded with the bootstrap loader or a callback script URL.
- **Overlay marker:** `OverlayView` inserted into `overlayMouseTarget`, positioned from latitude/longitude in `draw()`.
- **Map options:** `disableDefaultUI: true`, `zoomControl: true`, `gestureHandling: "cooperative"`, `zoom: 17`.
- **Map styling:** Google Maps `styles` array for the map tiles, plus regular CSS for the marker and banner.
- **Fallback map:** Google Maps iframe URL using `https://www.google.com/maps?q=...&output=embed`.
- **External link:** Google Maps place/search URL using `https://www.google.com/maps/search/?api=1&query=...`.
- **This repo:** React function components on Vite, plain JavaScript modules, CSS in `src/App.css`.

## Required Runtime Behavior

The successful API map is interactive:

- Users can pan and zoom the Google map.
- The branded marker remains attached to the real latitude/longitude while the map moves.
- The marker opens the real Google Maps place URL on click, Enter, or Space.
- The address banner stays pinned to the top-left of the panel and does not block map gestures.
- Default Google UI is hidden except for the zoom control.
- Google's standard place details compact container is not visible.
- The standard red Google place name label/pin text for `BUSINESS_NAME_HERE` is not visible.
- `gestureHandling: "cooperative"` prevents the map from hijacking normal page scroll.

The iframe fallback is intentionally different:

- It is a branded non-interactive backdrop.
- It uses `pointer-events: none` and `tabIndex="-1"` by default.
- Its centered branded marker is fixed HTML and cannot follow map camera movement.
- It must not expose Google's standard place details compact container or the red Google place name label/pin text for `BUSINESS_NAME_HERE`.
- Do not enable iframe panning/zooming unless you accept that the iframe native pin can drift away from the fixed overlay.

## Shared Location Config

Use one set of values for React, WordPress/PHP, and plain HTML.

```js
const storeName = 'The Stock Room NJ'
const storeAddress = '66 Union Blvd, Wallington, NJ 07057'
const storeCoordinates = { lat: 40.853372, lng: -74.114231 }
const logoSrc = '/circle%20logo.png'

const encodedStoreAddress = encodeURIComponent(storeAddress)
const encodedMapQuery = encodeURIComponent(`${storeName}, ${storeAddress}`)

const googleMapEmbedUrl = `https://www.google.com/maps?q=${encodedMapQuery}&output=embed`
const googleMapsPlaceUrl = `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`
const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedStoreAddress}`
```

## Map Styles

Use this styles array for the API map. The iframe fallback cannot use this array; it is styled only with CSS filters.

```js
const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#F0F2F5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#002366' }] },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#0057ff' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#E8EBF5' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#D0D9FC' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#002366' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E2E5E9' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8A8D91' }],
  },
  {
    featureType: 'poi',
    elementType: 'all',
    stylers: [{ visibility: 'off' }],
  },
]
```

## Shared CSS

Use this CSS for the primary API map and the iframe fallback. The API marker uses `.custom-map-marker-js`; the fallback anchor uses `.custom-map-marker`.

```css
.map-panel {
  position: relative;
  isolation: isolate;
  min-height: 460px;
  overflow: hidden;
  border: 1px solid var(--color-border, #d0d5dd);
  border-radius: 4px;
  background: var(--color-surface, #ffffff);
}

.map-canvas,
.google-map-embed {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 460px;
}

.map-store-banner {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 4;
  display: grid;
  gap: 2px;
  max-width: min(calc(100% - 36px), 360px);
  border: 1px solid var(--map-embed-banner-border, rgba(17, 17, 17, 0.12));
  border-radius: 4px;
  background: var(--map-embed-banner-background, rgba(255, 255, 255, 0.94));
  color: var(--color-text, #111111);
  padding: 11px 14px;
  text-decoration: none;
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 30px rgba(17, 17, 17, 0.14);
  pointer-events: none;
}

.map-store-banner strong {
  color: var(--map-embed-banner-text, #002366);
  font-size: 0.98rem;
  font-weight: 900;
  line-height: 1.1;
}

.map-store-banner span {
  color: var(--map-embed-banner-muted, #667085);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.25;
}

.custom-map-marker,
.custom-map-marker-js {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.custom-map-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -50%);
}

.custom-map-marker-js {
  position: relative;
  transform: translate(-50%, -50%);
}

.marker-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border: 3px solid var(--map-embed-accent, #0057ff);
  border-radius: 50%;
  background: var(--map-embed-marker-background, #ffffff);
  box-shadow: 0 8px 24px var(--map-embed-marker-shadow, rgba(0, 87, 255, 0.35)), 0 0 0 4px rgba(255, 255, 255, 0.8);
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.3s ease, box-shadow 0.3s ease;
}

.custom-map-marker:hover .marker-badge,
.custom-map-marker:focus-visible .marker-badge,
.custom-map-marker-js:hover .marker-badge,
.custom-map-marker-js:focus-visible .marker-badge {
  transform: scale(1.12);
  border-color: var(--map-embed-accent-strong, #0046cc);
  box-shadow: 0 12px 32px var(--map-embed-marker-shadow-hover, rgba(0, 87, 255, 0.45)), 0 0 0 6px rgba(255, 255, 255, 0.9);
}

.marker-logo {
  width: 82%;
  height: 82%;
  object-fit: contain;
}

.marker-pulse {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--map-embed-marker-halo, rgba(0, 87, 255, 0.2));
  animation: marker-pulse-glow 2.5s infinite ease-out;
}

@keyframes marker-pulse-glow {
  0% {
    opacity: 0.8;
    transform: scale(0.4);
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 0;
    transform: scale(1.4);
  }
}

.google-map-embed__frame,
.map-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  filter: var(--map-embed-filter, grayscale(1) sepia(0.3) saturate(1.8) hue-rotate(200deg) brightness(0.95) contrast(1.05));
  pointer-events: none;
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface, #ffffff);
  color: var(--color-muted, #667085);
  font-size: 0.9rem;
}
```

## React Implementation

This matches the repo behavior: try the API map first, then render `GoogleMapsIframe` when anything fails.

```jsx
import { useEffect, useRef, useState } from 'react'
import GoogleMapsIframe from './GoogleMapsIframe'

function decodeKey(key) {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.startsWith('QUl6YVN5')) {
    try {
      return atob(trimmed)
    } catch {
      return ''
    }
  }
  return trimmed
}

function MapStoreBanner({ address, storeName }) {
  return (
    <div className="map-store-banner" aria-label={`${storeName} address: ${address}`}>
      <strong>{storeName}</strong>
      <span>{address}</span>
    </div>
  )
}

function markerHtml({ logoSrc, logoAlt }) {
  return `
    <div class="custom-map-marker-js" title="Open location on Google Maps">
      <div class="marker-pulse"></div>
      <div class="marker-badge">
        <img src="${logoSrc}" alt="${logoAlt}" class="marker-logo" />
      </div>
    </div>
  `
}

export default function GoogleMap({
  apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  address,
  embedUrl,
  logoAlt,
  logoSrc,
  placeUrl,
  storeName,
  position,
}) {
  const mapRef = useRef(null)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    window.gm_authFailure = () => {
      if (isMounted) {
        setHasError(true)
        setIsLoading(false)
      }
    }

    const resolvedApiKey = decodeKey(apiKey)
    if (!resolvedApiKey) {
      setHasError(true)
      setIsLoading(false)
      return
    }

    if (!window.google?.maps?.importLibrary) {
      ;((g) => {
        let h
        let a
        let k
        const p = 'The Google Maps JavaScript API'
        const c = 'google'
        const l = 'importLibrary'
        const q = '__ib__'
        const m = document
        let b = window
        b = b[c] || (b[c] = {})
        const d = b.maps || (b.maps = {})
        const r = new Set()
        const e = new URLSearchParams()
        const u = () =>
          h ||
          (h = new Promise((resolve, reject) => {
            a = m.createElement('script')
            e.set('libraries', [...r] + '')
            for (k in g) e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k])
            e.set('callback', c + '.maps.' + q)
            a.src = `https://maps.${c}apis.com/maps/api/js?` + e
            d[q] = resolve
            a.onerror = () => reject(Error(p + ' could not load.'))
            a.nonce = m.querySelector('script[nonce]')?.nonce || ''
            m.head.append(a)
          }))
        d[l] ? console.warn(p + ' only loads once.') : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)))
      })({ key: resolvedApiKey, v: 'weekly' })
    }

    async function initGoogleMap() {
      try {
        const { Map, OverlayView } = await window.google.maps.importLibrary('maps')
        const { LatLng } = await window.google.maps.importLibrary('core')
        if (!isMounted || !mapRef.current) return

        const map = new Map(mapRef.current, {
          center: position,
          zoom: 17,
          styles: MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
        })

        class HTMLMarker extends OverlayView {
          constructor(pos, html, href) {
            super()
            this.pos = pos
            this.html = html
            this.href = href
            this.div = null
          }

          onAdd() {
            const div = document.createElement('div')
            div.style.position = 'absolute'
            div.style.cursor = 'pointer'
            div.tabIndex = 0
            div.setAttribute('role', 'link')
            div.setAttribute('aria-label', `Open ${storeName} on Google Maps`)
            div.innerHTML = this.html
            const openMap = () => window.open(this.href, '_blank', 'noopener,noreferrer')

            div.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              openMap()
            })
            div.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openMap()
              }
            })

            this.div = div
            this.getPanes().overlayMouseTarget.appendChild(div)
          }

          draw() {
            const point = this.getProjection().fromLatLngToDivPixel(this.pos)
            if (this.div) {
              this.div.style.left = `${point.x}px`
              this.div.style.top = `${point.y}px`
            }
          }

          onRemove() {
            this.div?.parentNode?.removeChild(this.div)
            this.div = null
          }
        }

        new HTMLMarker(
          new LatLng(position.lat, position.lng),
          markerHtml({ logoSrc, logoAlt }),
          placeUrl
        ).setMap(map)

        if (isMounted) setIsLoading(false)
      } catch {
        if (isMounted) {
          setHasError(true)
          setIsLoading(false)
        }
      }
    }

    initGoogleMap()

    return () => {
      isMounted = false
      if (window.gm_authFailure) delete window.gm_authFailure
    }
  }, [apiKey, address, logoAlt, logoSrc, placeUrl, position, storeName])

  if (hasError) {
    return (
      <GoogleMapsIframe
        address={address}
        embedUrl={embedUrl}
        logoAlt={logoAlt}
        logoSrc={logoSrc}
        markerLabel={`Open ${storeName} on Google Maps`}
        placeUrl={placeUrl}
        storeName={storeName}
        title={`Google Map for ${storeName}`}
      />
    )
  }

  return (
    <div className="map-canvas">
      <div ref={mapRef} className="map-canvas" />
      <MapStoreBanner address={address} storeName={storeName} />
      {isLoading && <div className="map-loading">Loading map...</div>}
    </div>
  )
}
```

## Standard HTML Implementation

Use this when there is no React build step. The same script can be hosted as `map.js`.

```html
<div
  class="map-panel"
  data-map
  data-api-key="YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY"
  data-store-name="The Stock Room NJ"
  data-address="66 Union Blvd, Wallington, NJ 07057"
  data-lat="40.853372"
  data-lng="-74.114231"
  data-logo-src="/circle%20logo.png"
  data-logo-alt="Stock Room Logo"
></div>

<script src="/map.js" defer></script>
```

```js
const MAP_STYLES = [/* use the MAP_STYLES array from this guide */]

function urlsForLocation(storeName, address) {
  const encodedMapQuery = encodeURIComponent(`${storeName}, ${address}`)
  return {
    embedUrl: `https://www.google.com/maps?q=${encodedMapQuery}&output=embed`,
    placeUrl: `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`,
  }
}

function renderIframeFallback(root, config) {
  root.innerHTML = `
    <div class="google-map-embed">
      <iframe
        allowfullscreen
        class="google-map-embed__frame map-frame"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        src="${config.embedUrl}"
        tabindex="-1"
        title="Google Map for ${config.storeName}"
      ></iframe>
      <div class="map-store-banner" aria-label="${config.storeName} address: ${config.address}">
        <strong>${config.storeName}</strong>
        <span>${config.address}</span>
      </div>
      <a class="custom-map-marker" href="${config.placeUrl}" target="_blank" rel="noreferrer" aria-label="Open ${config.storeName} on Google Maps">
        <div class="marker-pulse"></div>
        <div class="marker-badge">
          <img src="${config.logoSrc}" alt="${config.logoAlt}" class="marker-logo" />
        </div>
      </a>
    </div>
  `
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve()
      return
    }

    window.gm_authFailure = reject
    window.initStockRoomMap = resolve

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initStockRoomMap&v=weekly`
    script.async = true
    script.defer = true
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function renderApiMap(root, config) {
  root.innerHTML = `
    <div class="map-canvas" data-map-canvas></div>
    <div class="map-store-banner" aria-label="${config.storeName} address: ${config.address}">
      <strong>${config.storeName}</strong>
      <span>${config.address}</span>
    </div>
  `

  const map = new google.maps.Map(root.querySelector('[data-map-canvas]'), {
    center: config.position,
    zoom: 17,
    styles: MAP_STYLES,
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'cooperative',
  })

  class HTMLMarker extends google.maps.OverlayView {
    constructor(position, html, href) {
      super()
      this.position = position
      this.html = html
      this.href = href
      this.div = null
    }

    onAdd() {
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.tabIndex = 0
      div.setAttribute('role', 'link')
      div.setAttribute('aria-label', `Open ${config.storeName} on Google Maps`)
      div.innerHTML = this.html
      const openMap = () => window.open(this.href, '_blank', 'noopener,noreferrer')
      div.addEventListener('click', openMap)
      div.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openMap()
        }
      })
      this.div = div
      this.getPanes().overlayMouseTarget.appendChild(div)
    }

    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(this.position)
      if (this.div) {
        this.div.style.left = `${point.x}px`
        this.div.style.top = `${point.y}px`
      }
    }

    onRemove() {
      this.div?.parentNode?.removeChild(this.div)
      this.div = null
    }
  }

  new HTMLMarker(
    new google.maps.LatLng(config.position.lat, config.position.lng),
    `<div class="custom-map-marker-js"><div class="marker-pulse"></div><div class="marker-badge"><img src="${config.logoSrc}" alt="${config.logoAlt}" class="marker-logo" /></div></div>`,
    config.placeUrl
  ).setMap(map)
}

document.querySelectorAll('[data-map]').forEach(async (root) => {
  const storeName = root.dataset.storeName
  const address = root.dataset.address
  const urls = urlsForLocation(storeName, address)
  const config = {
    ...urls,
    storeName,
    address,
    logoSrc: root.dataset.logoSrc,
    logoAlt: root.dataset.logoAlt,
    position: {
      lat: Number(root.dataset.lat),
      lng: Number(root.dataset.lng),
    },
  }

  try {
    if (!root.dataset.apiKey) throw new Error('Missing Google Maps API key')
    await loadGoogleMaps(root.dataset.apiKey)
    await renderApiMap(root, config)
  } catch {
    renderIframeFallback(root, config)
  }
})
```

## WordPress/PHP Implementation

PHP should output configuration and enqueue the JavaScript. Do not hardcode the browser key in a template file; define it in `wp-config.php`, an environment variable, or an options page.

```php
// wp-config.php
define('STOCKROOM_GOOGLE_MAPS_API_KEY', 'YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY');
```

```php
// functions.php
function stockroom_enqueue_map_assets() {
    wp_enqueue_style(
        'stockroom-map',
        get_stylesheet_directory_uri() . '/assets/map.css',
        array(),
        '1.0.0'
    );

    wp_enqueue_script(
        'stockroom-map',
        get_stylesheet_directory_uri() . '/assets/map.js',
        array(),
        '1.0.0',
        true
    );

    wp_localize_script(
        'stockroom-map',
        'stockroomMapDefaults',
        array(
            'apiKey' => defined('STOCKROOM_GOOGLE_MAPS_API_KEY') ? STOCKROOM_GOOGLE_MAPS_API_KEY : '',
            'storeName' => 'The Stock Room NJ',
            'address' => '66 Union Blvd, Wallington, NJ 07057',
            'lat' => 40.853372,
            'lng' => -74.114231,
            'logoSrc' => get_stylesheet_directory_uri() . '/assets/circle-logo.png',
            'logoAlt' => 'Stock Room Logo',
        )
    );
}
add_action('wp_enqueue_scripts', 'stockroom_enqueue_map_assets');

function stockroom_map_shortcode($atts = array()) {
    $atts = shortcode_atts(
        array(
            'store_name' => 'The Stock Room NJ',
            'address' => '66 Union Blvd, Wallington, NJ 07057',
            'lat' => '40.853372',
            'lng' => '-74.114231',
            'logo_src' => get_stylesheet_directory_uri() . '/assets/circle-logo.png',
            'logo_alt' => 'Stock Room Logo',
        ),
        $atts,
        'stockroom_map'
    );

    return sprintf(
        '<div class="map-panel" data-map data-api-key="%s" data-store-name="%s" data-address="%s" data-lat="%s" data-lng="%s" data-logo-src="%s" data-logo-alt="%s"></div>',
        esc_attr(defined('STOCKROOM_GOOGLE_MAPS_API_KEY') ? STOCKROOM_GOOGLE_MAPS_API_KEY : ''),
        esc_attr($atts['store_name']),
        esc_attr($atts['address']),
        esc_attr($atts['lat']),
        esc_attr($atts['lng']),
        esc_url($atts['logo_src']),
        esc_attr($atts['logo_alt'])
    );
}
add_shortcode('stockroom_map', 'stockroom_map_shortcode');
```

Use the same `map.js` from the standard HTML implementation, with this small addition before reading dataset values:

```js
const defaults = window.stockroomMapDefaults || {}
const apiKey = root.dataset.apiKey || defaults.apiKey || ''
const storeName = root.dataset.storeName || defaults.storeName
const address = root.dataset.address || defaults.address
```

The WordPress fallback path is the same as plain HTML:

- If `STOCKROOM_GOOGLE_MAPS_API_KEY` is empty, render the iframe fallback.
- If `gm_authFailure` fires, render the iframe fallback.
- If the Google script fails to load, render the iframe fallback.
- If map construction or `OverlayView` setup throws, render the iframe fallback.

## Fallback Iframe Component Rules

The fallback is still useful, but it should be treated as the error state. It must not be confused with the successful API map.

Required fallback behavior:

- The iframe uses `pointer-events: none`.
- The iframe uses `tabIndex={-1}` in React or `tabindex="-1"` in HTML.
- The branded marker is a normal link above the iframe.
- The banner uses `pointer-events: none`.
- The fallback presentation must not show Google's standard place details compact container.
- The fallback presentation must not show the standard red Google place name label/pin text for `BUSINESS_NAME_HERE`.
- Do not add wheel, touch, drag, or zoom listeners to the iframe fallback.

React iframe fallback shape:

```jsx
<iframe
  allowFullScreen
  className="google-map-embed__frame map-frame"
  loading="lazy"
  referrerPolicy="no-referrer-when-downgrade"
  src={embedUrl}
  tabIndex={-1}
  title={resolvedTitle}
/>
```

## Verification Checklist

- With a valid key, the map uses Google Maps JavaScript API tiles, not an iframe.
- The branded marker stays attached to the store coordinate while panning and zooming.
- The marker opens Google Maps on click, Enter, and Space.
- The banner stays in the top-left and does not block map movement.
- The zoom control is visible; other default Google UI is hidden.
- Google's standard place details compact container is not visible.
- The standard red Google place name label/pin text for `BUSINESS_NAME_HERE` is not visible.
- Normal page scrolling is not hijacked because `gestureHandling` is `"cooperative"`.
- With no key, invalid key, blocked script, or runtime error, the iframe fallback appears.
- In fallback mode, the iframe is non-interactive and page scroll remains smooth.
