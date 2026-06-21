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
    await setDoc(doc(database, 'legal_documents', 'TOS_1.0'), {
      document_type: 'TOS',
      is_active: true,
      version_number: '1.0',
    })
    await setDoc(doc(database, 'legal_documents', 'TOS_0.9'), {
      document_type: 'TOS',
      is_active: false,
      version_number: '0.9',
    })
    await setDoc(doc(database, 'user_agreements', 'agreement-1'), {
      document_id: 'TOS_1.0',
      user_id: 'staff-user',
    })
    await setDoc(doc(database, 'bids', 'bid-1'), {
      amount: 25,
      status: 'pending_admin_approval',
    })
    await setDoc(doc(database, 'orders', 'order-1'), {
      status: 'approved_awaiting_payment',
      userId: 'staff-user',
    })
    await setDoc(doc(database, 'user_agreement_history', 'history-1'), {
      document_id: 'TOS_1.0',
      user_id: 'staff-user',
    })
    await setDoc(doc(database, 'deadline_extensions', 'extension-1'), {
      orderId: 'order-1',
    })
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

describe('Firestore legal and commerce rules', () => {
  it('allows public reads for active legal documents only', async () => {
    await seed()
    const database = testEnv.unauthenticatedContext().firestore()

    await assertSucceeds(getDoc(doc(database, 'legal_documents', 'TOS_1.0')))
    await assertFails(getDoc(doc(database, 'legal_documents', 'TOS_0.9')))
    await assertSucceeds(
      getDocs(query(collection(database, 'legal_documents'), where('is_active', '==', true))),
    )
  })

  it('keeps agreement, bid, and order writes server-owned', async () => {
    await seed()
    const publicDb = testEnv.unauthenticatedContext().firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()

    await assertFails(setDoc(doc(publicDb, 'user_agreements', 'new-agreement'), { user_id: 'guest' }))
    await assertFails(setDoc(doc(staffDb, 'bids', 'new-bid'), { amount: 30 }))
    await assertFails(updateDoc(doc(staffDb, 'orders', 'order-1'), { status: 'paid' }))
  })

  it('allows admins to read bids and users to read their own orders and agreements', async () => {
    await seed()
    const adminDb = testEnv.authenticatedContext('admin-user').firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()
    const otherDb = testEnv.authenticatedContext('other-user').firestore()

    await assertSucceeds(getDoc(doc(adminDb, 'bids', 'bid-1')))
    await assertSucceeds(getDoc(doc(staffDb, 'orders', 'order-1')))
    await assertSucceeds(getDoc(doc(staffDb, 'user_agreements', 'agreement-1')))
    await assertFails(getDoc(doc(otherDb, 'orders', 'order-1')))
  })

  it('secures user_agreement_history and deadline_extensions writes', async () => {
    await seed()
    const publicDb = testEnv.unauthenticatedContext().firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()

    await assertFails(setDoc(doc(publicDb, 'user_agreement_history', 'new-hist'), { user_id: 'guest' }))
    await assertFails(setDoc(doc(staffDb, 'deadline_extensions', 'new-ext'), { orderId: 'order-1' }))
  })

  it('allows read for user_agreement_history (owner/admin) and deadline_extensions (admin only)', async () => {
    await seed()
    const adminDb = testEnv.authenticatedContext('admin-user').firestore()
    const staffDb = testEnv.authenticatedContext('staff-user').firestore()
    const otherDb = testEnv.authenticatedContext('other-user').firestore()

    // user_agreement_history read
    await assertSucceeds(getDoc(doc(adminDb, 'user_agreement_history', 'history-1')))
    await assertSucceeds(getDoc(doc(staffDb, 'user_agreement_history', 'history-1')))
    await assertFails(getDoc(doc(otherDb, 'user_agreement_history', 'history-1')))

    // deadline_extensions read
    await assertSucceeds(getDoc(doc(adminDb, 'deadline_extensions', 'extension-1')))
    await assertFails(getDoc(doc(staffDb, 'deadline_extensions', 'extension-1')))
  })
})

describe('Firestore user profile rules', () => {
  it('allows users to read and write their own user profile document', async () => {
    const userDb = testEnv.authenticatedContext('user-123').firestore()
    const otherDb = testEnv.authenticatedContext('other-user').firestore()
    const guestDb = testEnv.unauthenticatedContext().firestore()

    // 1. Authenticated owner can write
    await assertSucceeds(setDoc(doc(userDb, 'users', 'user-123'), {
      displayName: 'Alice',
      email: 'alice@example.com',
      notifications: { biddingUpdates: true }
    }))

    // 2. Authenticated owner can read
    await assertSucceeds(getDoc(doc(userDb, 'users', 'user-123')))

    // 3. Unauthenticated visitor cannot read or write
    await assertFails(getDoc(doc(guestDb, 'users', 'user-123')))
    await assertFails(setDoc(doc(guestDb, 'users', 'user-123'), { displayName: 'Guest' }))

    // 4. Other authenticated user cannot read or write
    await assertFails(getDoc(doc(otherDb, 'users', 'user-123')))
    await assertFails(setDoc(doc(otherDb, 'users', 'user-123'), { displayName: 'Bob' }))
  })
})

