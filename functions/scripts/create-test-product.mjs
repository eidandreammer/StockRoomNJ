import admin from 'firebase-admin'

// Ensure we are talking to production, not emulator
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn('Temporarily disabling emulator host for production write...')
  delete process.env.FIRESTORE_EMULATOR_HOST
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'stockroomnj-10e7d',
})

const db = admin.firestore()

async function run() {
  const productId = 'stripe-sanity-test'
  const productRef = db.collection('products').doc(productId)
  
  await productRef.set({
    name: 'Stripe $1.00 Sanity Test',
    price: 1.00,
    saleMode: 'fixed',
    status: 'published',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  
  console.log(`\n==================================================`)
  console.log(`SUCCESS: Test product created in production Firestore!`)
  console.log(`Product Name : Stripe $1.00 Sanity Test`)
  console.log(`Product ID   : ${productId}`)
  console.log(`Price        : $1.00`)
  console.log(`Status       : published`)
  console.log(`==================================================\n`)
}

run().catch((err) => {
  console.error('\nError creating test product in production:')
  console.error(err)
  console.error('\nTip: If you get a credential error, make sure you are authenticated to Google Cloud by running:')
  console.error('  gcloud auth application-default login')
  process.exit(1)
})
