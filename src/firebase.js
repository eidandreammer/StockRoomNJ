import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
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

function getAdminAuth(appInstance) {
  try {
    return initializeAuth(appInstance, { persistence: inMemoryPersistence })
  } catch (error) {
    if (error?.code === 'auth/already-initialized') {
      return getAuth(appInstance)
    }

    throw error
  }
}

export const auth = app ? getAdminAuth(app) : null
export const db = app ? getFirestore(app) : null
export const storage = app && firebaseConfig.storageBucket ? getStorage(app) : null

if (
  app &&
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  !globalThis.__stockRoomFirebaseEmulatorsConnected
) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  if (storage) {
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }
  globalThis.__stockRoomFirebaseEmulatorsConnected = true
}
