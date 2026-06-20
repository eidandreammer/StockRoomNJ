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
  const buyerEmail = process.argv[2]
  if (!buyerEmail) {
    console.error('\nError: Please provide a buyer email address as an argument.')
    console.error('Usage: node functions/scripts/create-bidding-sanity-test.mjs <buyer-email> [user-id]\n')
    process.exit(1)
  }

  let userId = process.argv[3]
  if (!userId) {
    console.log(`Checking if a user with email "${buyerEmail}" exists...`)
    const usersSnap = await db.collection('users').where('email', '==', buyerEmail.trim()).limit(1).get()
    if (!usersSnap.empty) {
      userId = usersSnap.docs[0].id
      console.log(`Found existing user: ${userId}`)
    } else {
      userId = 'guest:stripe-bidding-sanity'
      console.log(`No user found with email "${buyerEmail}". Defaulting userId to: ${userId}`)
    }
  }

  const productId = 'stripe-bidding-sanity-product'
  const bidId = 'stripe-bidding-sanity-bid'

  const productRef = db.collection('products').doc(productId)
  const bidRef = db.collection('bids').doc(bidId)

  // 1. Create/overwrite the test product
  await productRef.set({
    name: 'Stripe $1.01 Bidding Sanity Test',
    price: 1.00,
    currentBidPrice: 1.01,
    currentBidId: bidId,
    saleMode: 'auction',
    auctionStatus: 'open',
    status: 'published',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  // 2. Create/overwrite the pending bid document
  await bidRef.set({
    amount: 1.01,
    buyerEmail: buyerEmail.trim(),
    productId: productId,
    productName: 'Stripe $1.01 Bidding Sanity Test',
    status: 'pending_admin_approval',
    userId: userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`\n==================================================`)
  console.log(`SUCCESS: Test bidding records created in production!`)
  console.log(`Product Name : Stripe $1.01 Bidding Sanity Test`)
  console.log(`Product ID   : ${productId}`)
  console.log(`Bid ID       : ${bidId}`)
  console.log(`Winning Bid  : $1.01`)
  console.log(`Buyer Email  : ${buyerEmail}`)
  console.log(`User ID      : ${userId}`)
  console.log(`==================================================`)
  console.log(`\nINSTRUCTIONS FOR TESTING:`)
  console.log(`1. Go to your admin panel (e.g., https://stockroomnj.com/admin or local admin dashboard).`)
  console.log(`2. Under "Bid approvals", locate the bid for "Stripe $1.01 Bidding Sanity Test".`)
  console.log(`3. Click "Approve sale" to trigger Stripe Checkout session generation.`)
  console.log(`4. An email with the checkout link will be sent to "${buyerEmail}".`)
  console.log(`   (Alternatively, look up the created order in the "orders" collection in Firestore to find the "stripeCheckoutUrl").`)
  console.log(`5. Complete the payment of $1.01 via Stripe.`)
  console.log(`6. Once paid, check that:`)
  console.log(`   - The product's status is set to "sold" and auctionStatus to "closed".`)
  console.log(`   - The bid's status is set to "paid".`)
  console.log(`   - An order confirmation email is sent to "${buyerEmail}".`)
  console.log(`==================================================\n`)
}

run().catch((err) => {
  console.error('\nError creating sanity test records:')
  console.error(err)
  console.error('\nTip: If you get a credential error, make sure you are authenticated to Google Cloud by running:')
  console.error('  gcloud auth application-default login')
  process.exit(1)
})
