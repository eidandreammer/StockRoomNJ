export const stockRoomMapColorway = {
  accent: '#0057ff',
  accentStrong: '#0046cc',
  bannerBackground: 'rgba(255, 255, 255, 0.94)',
  bannerBorder: 'rgba(17, 17, 17, 0.12)',
  bannerText: 'var(--color-nav-royal-blue)',
  bannerMuted: 'var(--color-muted)',
  markerBackground: '#ffffff',
  markerHalo: 'rgba(0, 87, 255, 0.2)',
  markerShadow: 'rgba(0, 87, 255, 0.35)',
  markerShadowHover: 'rgba(0, 87, 255, 0.45)',
  filter: 'grayscale(1) sepia(0.3) saturate(1.8) hue-rotate(200deg) brightness(0.95) contrast(1.05)',
}

const colorwayVariableNames = {
  accent: '--map-embed-accent',
  accentStrong: '--map-embed-accent-strong',
  bannerBackground: '--map-embed-banner-background',
  bannerBorder: '--map-embed-banner-border',
  bannerText: '--map-embed-banner-text',
  bannerMuted: '--map-embed-banner-muted',
  markerBackground: '--map-embed-marker-background',
  markerHalo: '--map-embed-marker-halo',
  markerShadow: '--map-embed-marker-shadow',
  markerShadowHover: '--map-embed-marker-shadow-hover',
  filter: '--map-embed-filter',
}

export function mapColorwayStyle(colorway = {}) {
  return Object.entries(colorway).reduce((style, [key, value]) => {
    const variableName = colorwayVariableNames[key]
    if (variableName && value) {
      style[variableName] = value
    }
    return style
  }, {})
}
