import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'stockroomnj-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
})

afterAll(async () => {
  await testEnv.cleanup()
})

async function seedAdmin() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins', 'admin-user'), { enabled: true })
  })
}

function upload(context, path, contentType) {
  return uploadBytes(ref(context.storage(), path), new Uint8Array([1, 2, 3]), { contentType })
}

describe('Storage upload rules', () => {
  it('allows correctly typed legal uploads from admins', async () => {
    await seedAdmin()
    const context = testEnv.authenticatedContext('admin-user')

    await assertSucceeds(upload(context, 'legal-documents/TOS/1.0/terms.pdf', 'application/pdf'))
    await assertSucceeds(upload(context, 'legal-documents/PRIVACY_POLICY/1.0/privacy.md', 'text/markdown'))
  })

  it('rejects octet-stream and extension/content-type mismatches', async () => {
    await seedAdmin()
    const context = testEnv.authenticatedContext('admin-user')

    await assertFails(upload(context, 'legal-documents/TOS/1.0/terms.pdf', 'application/octet-stream'))
    await assertFails(upload(context, 'legal-documents/TOS/1.0/terms.txt', 'application/pdf'))
  })

  it('rejects non-admin writes and unknown legal document paths', async () => {
    await seedAdmin()
    const userContext = testEnv.authenticatedContext('customer-user')
    const adminContext = testEnv.authenticatedContext('admin-user')

    await assertFails(upload(userContext, 'legal-documents/TOS/1.0/terms.pdf', 'application/pdf'))
    await assertFails(upload(adminContext, 'legal-documents/OTHER/1.0/other.pdf', 'application/pdf'))
  })
})
