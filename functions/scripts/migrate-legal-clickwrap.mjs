import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
})

const db = admin.firestore()

const rootDir = resolve(import.meta.dirname, '..', '..')
const documents = [
  {
    contentUrl: process.env.TOS_CONTENT_URL || '/Terms%20of%20Service%20-%20Stock%20Room%20NJ.md',
    documentType: 'TOS',
    filePath: resolve(rootDir, 'public', 'Terms of Service - Stock Room NJ.md'),
    versionNumber: process.env.TOS_VERSION || '1.0',
  },
  {
    contentUrl: process.env.PRIVACY_POLICY_CONTENT_URL || '/Privacy%20Policy%20-%20StockRoomNJ.md',
    documentType: 'PRIVACY_POLICY',
    filePath: resolve(rootDir, 'public', 'Privacy Policy - StockRoomNJ.md'),
    versionNumber: process.env.PRIVACY_POLICY_VERSION || '1.0',
  },
]

async function fileHash(path) {
  const content = await readFile(path)

  return createHash('sha256').update(content).digest('hex')
}

async function publishDocument({ contentUrl, documentType, filePath, versionNumber }) {
  const documentId = `${documentType}_${versionNumber}`
  const documentRef = db.collection('legal_documents').doc(documentId)
  const now = admin.firestore.Timestamp.now()
  const sourceSha256 = await fileHash(filePath)

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(documentRef)
    const activeSnapshot = await transaction.get(
      db.collection('legal_documents')
        .where('document_type', '==', documentType)
        .where('is_active', '==', true),
    )

    if (current.exists) {
      transaction.update(documentRef, {
        content_sha256: sourceSha256,
        content_url: contentUrl,
        is_active: true,
        updated_at: now,
      })
    } else {
      transaction.set(documentRef, {
        content_sha256: sourceSha256,
        content_url: contentUrl,
        document_type: documentType,
        effective_date: now,
        is_active: true,
        version_number: versionNumber,
      })
    }

    activeSnapshot.docs
      .filter((activeDoc) => activeDoc.id !== documentId)
      .forEach((activeDoc) => {
        transaction.update(activeDoc.ref, {
          is_active: false,
          updated_at: now,
        })
      })
  })

  console.log(`Published ${documentType} ${versionNumber} as ${documentId}`)
}

for (const document of documents) {
  await publishDocument(document)
}

console.log('Clickwrap collections ready: users, legal_documents, user_agreements.')
