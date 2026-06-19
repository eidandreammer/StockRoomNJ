const visitorStorageKey = 'stockroomnj-visitor-id'

export function getVisitorId() {
  if (typeof window === 'undefined') {
    return 'guest-server'
  }

  const existingId = window.localStorage.getItem(visitorStorageKey)

  if (existingId) {
    return existingId
  }

  const nextId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`

  window.localStorage.setItem(visitorStorageKey, nextId)

  return nextId
}
