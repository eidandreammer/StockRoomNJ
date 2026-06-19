import { useEffect, useRef, useState } from 'react'
import {
  footerLogo,
  storeAddress,
  storeCoordinates,
  googleMapsPlaceUrl,
  googleMapEmbedUrl,
} from './siteConfig'

function MapStoreBanner() {
  return (
    <div className="map-store-banner" aria-label={`The Stock Room NJ address: ${storeAddress}`}>
      <strong>The Stock Room NJ</strong>
      <span>{storeAddress}</span>
    </div>
  )
}

function GoogleMap() {
  const mapRef = useRef(null)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 1. Listen for global authentication failures (e.g. invalid key or API not enabled)
    window.gm_authFailure = () => {
      console.warn("Google Maps API authentication failed. Falling back to styled iframe.")
      setHasError(true)
      setIsLoading(false)
    }

    const apiKey = (
      import.meta.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
      ''
    ).trim()

    if (!apiKey) {
      console.warn("No Google Maps API Key found. Falling back to styled iframe.")
      setHasError(true)
      setIsLoading(false)
      return
    }

    const scriptId = 'google-maps-js-sdk'
    let script = document.getElementById(scriptId)

    const initGoogleMap = () => {
      if (!mapRef.current) return
      try {
        const position = storeCoordinates

        // Brand Royal Blue and Coin Gray map styling config
        const MAP_STYLES = [
          {
            elementType: "geometry",
            stylers: [{ color: "#F0F2F5" }] // Light coin gray background
          },
          {
            elementType: "labels.text.fill",
            stylers: [{ color: "#002366" }] // Dark royal blue for labels
          },
          {
            featureType: "administrative.neighborhood",
            elementType: "labels.text.fill",
            stylers: [{ color: "#0057ff" }] // Royal blue neighborhood labels
          },
          {
            featureType: "poi",
            elementType: "geometry",
            stylers: [{ color: "#E8EBF5" }] // Soft gray-blue for parks/points of interest
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#D0D9FC" }] // Light royal blue for water bodies
          },
          {
            featureType: "water",
            elementType: "labels.text.fill",
            stylers: [{ color: "#002366" }] // Dark royal blue for water labels
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#FFFFFF" }] // White roads
          },
          {
            featureType: "road",
            elementType: "geometry.stroke",
            stylers: [{ color: "#E2E5E9" }] // Subtle border for roads
          },
          {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#8A8D91" }] // Coin gray for road labels
          },
          {
            featureType: "poi",
            elementType: "all",
            stylers: [{ visibility: "off" }] // Hide all default POIs and business names/pins
          }
        ]

        const map = new window.google.maps.Map(mapRef.current, {
          center: position,
          zoom: 17,
          styles: MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative"
        })

        // Custom Overlay View for HTML/CSS brand marker
        class HTMLMarker extends window.google.maps.OverlayView {
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
            div.setAttribute('aria-label', 'Open The Stock Room NJ on Google Maps')
            div.innerHTML = this.html
            const openMap = () => {
              window.open(this.href, '_blank', 'noopener,noreferrer')
            }
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
            const panes = this.getPanes()
            panes.overlayMouseTarget.appendChild(div)
          }
          draw() {
            const overlayProjection = this.getProjection()
            const position = overlayProjection.fromLatLngToDivPixel(this.pos)
            if (this.div) {
              this.div.style.left = position.x + 'px'
              this.div.style.top = position.y + 'px'
            }
          }
          onRemove() {
            if (this.div) {
              this.div.parentNode.removeChild(this.div)
              this.div = null
            }
          }
        }

        const markerHtml = `
          <div class="custom-map-marker-js" title="Open The Stock Room NJ on Google Maps" style="transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; width: 60px; height: 60px; position: relative; cursor: pointer; text-decoration: none;">
            <div class="marker-pulse" style="position: absolute; width: 80px; height: 80px; border-radius: 50%; background: rgba(0, 87, 255, 0.2); animation: marker-pulse-glow 2.5s infinite ease-out;"></div>
            <div class="marker-badge" style="width: 48px; height: 48px; background: #ffffff; border: 3px solid #0057ff; border-radius: 50%; box-shadow: 0 8px 24px rgba(0, 87, 255, 0.35), 0 0 0 4px rgba(255, 255, 255, 0.8); display: flex; align-items: center; justify-content: center; overflow: hidden; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
              <img src="${footerLogo}" alt="Stock Room Logo" style="width: 82%; height: 82%; object-fit: contain;" />
            </div>
          </div>
        `

        const customMarker = new HTMLMarker(
          new window.google.maps.LatLng(position.lat, position.lng),
          markerHtml,
          googleMapsPlaceUrl
        )
        customMarker.setMap(map)

        setIsLoading(false)
      } catch (err) {
        console.error("Error rendering Google Map JS API:", err)
        setHasError(true)
        setIsLoading(false)
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`
      script.async = true
      script.defer = true
      script.onload = initGoogleMap
      script.onerror = () => {
        console.error("Failed to load Google Maps JS SDK script.")
        setHasError(true)
        setIsLoading(false)
      }
      document.body.appendChild(script)
    } else {
      if (window.google && window.google.maps) {
        initGoogleMap()
      } else {
        script.addEventListener('load', initGoogleMap)
      }
    }
  }, [])

  if (hasError) {
    return (
      <div className="map-panel-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          allowFullScreen
          className="map-frame"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={googleMapEmbedUrl}
          title="Google Map for StockRoom NJ"
        />
        <MapStoreBanner />
        <a
          href={googleMapsPlaceUrl}
          target="_blank"
          rel="noreferrer"
          className="custom-map-marker"
          aria-label="Open The Stock Room NJ on Google Maps"
          title="Open The Stock Room NJ on Google Maps"
        >
          <div className="marker-pulse" />
          <div className="marker-badge">
            <img src={footerLogo} alt="Stock Room Logo" className="marker-logo" />
          </div>
        </a>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '460px' }} />
      <MapStoreBanner />
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', zIndex: 5 }}>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>Loading map...</div>
        </div>
      )}
    </div>
  )
}

export default GoogleMap
