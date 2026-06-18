import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'stockroomnj-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

afterEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    await setDoc(doc(database, 'events', 'published'), { title: 'Public', status: 'published' })
    await setDoc(doc(database, 'events', 'draft'), { title: 'Draft', status: 'draft' })
    await setDoc(doc(database, 'products', 'published-product'), {
      name: 'Public product',
      status: 'published',
    })
    await setDoc(doc(database, 'products', 'draft-product'), {
      name: 'Draft product',
      status: 'draft',
    })
    await setDoc(doc(database, 'admins', 'admin-user'), { enabled: true })
  })
}

describe('Firestore event rules', () => {
  it('allows public reads for published events only', async () => {
    await seed()
    const database = testEnv.unauthenticatedContext().firestore()

    await assertSucceeds(getDoc(doc(database, 'events', 'published')))
    await assertFails(getDoc(doc(database, 'events', 'draft')))
    await assertSucceeds(
      getDocs(query(collection(database, 'events'), where('status', '==', 'published'))),
    )
  })

  it('denies unauthenticated and non-admin writes', async () => {
    await seed()
    const publicDb = testEnv.unauthenticatedContext().firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()

    await assertFails(setDoc(doc(publicDb, 'events', 'new-event'), { status: 'draft' }))
    await assertFails(setDoc(doc(staffDb, 'events', 'new-event'), { status: 'draft' }))
  })

  it('allows admin CRUD and denies client writes to admins', async () => {
    await seed()
    const database = testEnv.authenticatedContext('admin-user').firestore()

    await assertSucceeds(setDoc(doc(database, 'events', 'new-event'), { status: 'draft' }))
    await assertSucceeds(getDoc(doc(database, 'events', 'draft')))
    await assertSucceeds(updateDoc(doc(database, 'events', 'new-event'), { status: 'published' }))
    await assertSucceeds(deleteDoc(doc(database, 'events', 'new-event')))
    await assertFails(setDoc(doc(database, 'admins', 'another-admin'), { enabled: true }))
  })
})

describe('Firestore product rules', () => {
  it('allows public reads for published products only', async () => {
    await seed()
    const database = testEnv.unauthenticatedContext().firestore()

    await assertSucceeds(getDoc(doc(database, 'products', 'published-product')))
    await assertFails(getDoc(doc(database, 'products', 'draft-product')))
    await assertSucceeds(
      getDocs(query(collection(database, 'products'), where('status', '==', 'published'))),
    )
  })

  it('denies unauthenticated and non-admin product writes', async () => {
    await seed()
    const publicDb = testEnv.unauthenticatedContext().firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()

    await assertFails(setDoc(doc(publicDb, 'products', 'new-product'), { status: 'published' }))
    await assertFails(setDoc(doc(staffDb, 'products', 'new-product'), { status: 'published' }))
  })

  it('allows admin product CRUD', async () => {
    await seed()
    const database = testEnv.authenticatedContext('admin-user').firestore()

    await assertSucceeds(setDoc(doc(database, 'products', 'new-product'), { status: 'draft' }))
    await assertSucceeds(getDoc(doc(database, 'products', 'draft-product')))
    await assertSucceeds(updateDoc(doc(database, 'products', 'new-product'), { status: 'published' }))
    await assertSucceeds(deleteDoc(doc(database, 'products', 'new-product')))
  })
})
