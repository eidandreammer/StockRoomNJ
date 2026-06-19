const baseUrl = import.meta.env.BASE_URL

export const brandLogo = `${baseUrl}segundo%20logo%20the%20stock%20room.png`
export const footerLogo = `${baseUrl}circle%20logo.png`
export const homeUrl = baseUrl
export const productGalleryUrl = `${baseUrl}shop`

export const storeAddress = '66 Union Blvd, Wallington, NJ 07057'
export const storeCoordinates = { lat: 40.853372, lng: -74.114231 }
export const storeEmail = 'thestockroomnj@gmail.com'
export const storePhone = '(609) 459-5069'
export const storePhoneHref = 'tel:+16094595069'

const encodedStoreAddress = encodeURIComponent(storeAddress)
const encodedMapQuery = encodeURIComponent(`The Stock Room, ${storeAddress}`)

export const googleMapEmbedUrl = `https://www.google.com/maps?q=${encodedMapQuery}&output=embed`
export const googleMapsPlaceUrl = `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`
export const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedStoreAddress}`

export const hours = [
  ['Mon-Fri', '9:00 AM - 6:00 PM'],
  ['Saturday', 'Closed'],
  ['Sunday', 'Closed'],
]
