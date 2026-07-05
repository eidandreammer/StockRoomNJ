import { mapColorwayStyle, stockRoomMapColorway } from './googleMapsIframeColorways'

function classNames(...names) {
  return names.filter(Boolean).join(' ')
}

function MapBanner({ address, storeName }) {
  if (!storeName && !address) return null

  const bannerLabel = storeName && address ? `${storeName} address: ${address}` : storeName || address

  return (
    <div className="google-map-embed__banner map-store-banner" aria-label={bannerLabel}>
      {storeName && <strong>{storeName}</strong>}
      {address && <span>{address}</span>}
    </div>
  )
}

function MapMarker({ logoAlt, logoSrc, markerLabel, placeUrl }) {
  if (!placeUrl) return null

  return (
    <a
      href={placeUrl}
      target="_blank"
      rel="noreferrer"
      className="google-map-embed__marker custom-map-marker"
      aria-label={markerLabel}
      title={markerLabel}
    >
      <div className="marker-pulse" />
      <div className="marker-badge">
        {logoSrc && <img src={logoSrc} alt={logoAlt} className="marker-logo" />}
      </div>
    </a>
  )
}

function GoogleMapsIframe({
  address = '',
  className = '',
  colorway = stockRoomMapColorway,
  embedUrl,
  frameClassName = '',
  interactive = false,
  logoAlt,
  logoSrc,
  markerLabel,
  placeUrl,
  showBanner = true,
  showMarker = true,
  storeName = '',
  style,
  title,
}) {
  const resolvedTitle = title || `Google Map${storeName ? ` for ${storeName}` : ''}`
  const resolvedMarkerLabel = markerLabel || `Open ${storeName || address || 'location'} on Google Maps`
  const resolvedLogoAlt = logoAlt || `${storeName || 'Location'} logo`

  return (
    <div
      className={classNames('google-map-embed', className)}
      style={{ ...mapColorwayStyle(colorway), ...style }}
    >
      <iframe
        allowFullScreen
        className={classNames(
          'google-map-embed__frame map-frame',
          interactive && 'google-map-embed__frame--interactive',
          frameClassName
        )}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={embedUrl}
        tabIndex={interactive ? undefined : -1}
        title={resolvedTitle}
      />
      {showBanner && <MapBanner address={address} storeName={storeName} />}
      {showMarker && (
        <MapMarker
          logoAlt={resolvedLogoAlt}
          logoSrc={logoSrc}
          markerLabel={resolvedMarkerLabel}
          placeUrl={placeUrl}
        />
      )}
    </div>
  )
}

export default GoogleMapsIframe
