import { getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

function decodeKey(key) {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.startsWith('QUl6YVN5')) {
    try {
      return atob(trimmed)
    } catch (e) {
      console.error('Failed to decode base64 API key:', e)
    }
  }
  return trimmed
}

const firebaseConfig = {
  apiKey: decodeKey(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}


export const isFirebaseConfigured = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every(Boolean)

const app = isFirebaseConfigured ? getApps()[0] ?? initializeApp(firebaseConfig) : null

function getAppAuth(appInstance) {
  const isPageAdmin =
    typeof window !== 'undefined' &&
    (window.location.pathname.includes('/admin') ||
      window.location.pathname.includes('admin.html'))
  const selectedPersistence = isPageAdmin ? inMemoryPersistence : browserLocalPersistence

  try {
    return initializeAuth(appInstance, { persistence: selectedPersistence })
  } catch (error) {
    if (error?.code === 'auth/already-initialized') {
      return getAuth(appInstance)
    }

    throw error
  }
}

export const auth = app ? getAppAuth(app) : null
export const db = app ? getFirestore(app) : null
export const storage = app && firebaseConfig.storageBucket ? getStorage(app) : null

export const isUsingFirebaseEmulators = !!(
  app &&
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
)

if (isUsingFirebaseEmulators && !globalThis.__stockRoomFirebaseEmulatorsConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  if (storage) {
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }
  globalThis.__stockRoomFirebaseEmulatorsConnected = true
}

