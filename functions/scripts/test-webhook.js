import admin from 'firebase-admin'
import Stripe from 'stripe'

// Initialize Firebase Admin pointing to local emulators
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

admin.initializeApp({
  projectId: 'stockroomnj-10e7d',
})

const db = admin.firestore()
const stripeKey = 'rkcs_test_51TkBfkCaQommyYPDce3AuVN9ubp4zKKe0aMv6dZFZd9cwJuj2ughFWmr1sIFIptUyg8USjzGEInhmO3cxQ6e3u00Jalj45pD'
const stripe = new Stripe(stripeKey)
const webhookSecret = 'whsec_test_secret'

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function triggerWebhook(type, dataObject) {
  const payload = JSON.stringify({
    id: `evt_test_${Math.random().toString(36).substr(2, 9)}`,
    object: 'event',
    api_version: '2026-05-27.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: dataObject,
    },
    type,
  })

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  })

  console.log(`Sending webhook event: ${type}...`)
  const response = await fetch('http://127.0.0.1:5001/stockroomnj-10e7d/us-central1/api/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
    },
    body: payload,
  })

  const responseText = await response.text()
  console.log(`Response status: ${response.status}`)
  console.log(`Response body: ${responseText}`)
  if (!response.ok) {
    throw new Error(`Webhook request failed: ${responseText}`)
  }
}

async function run() {
  console.log('--- STARTING WEBHOOK AND ORDER FINALIZATION TEST ---')

  // 1. Create a dummy direct product
  const productRef = db.collection('products').doc('test-direct-product')
  await productRef.set({
    name: 'Direct Buy Collectible Card',
    price: 15.5,
    saleMode: 'fixed',
    status: 'published',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  console.log('Created test product: test-direct-product')

  // 2. Create a dummy order for direct checkout
  const orderRef = db.collection('orders').doc('test-direct-order')
  await orderRef.set({
    amount: 15.5,
    buyerEmail: 'testbuyer@example.com',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending_payment',
    userId: 'test-user-123',
    checkoutMode: 'account',
    items: [
      {
        productId: 'test-direct-product',
        productName: 'Direct Buy Collectible Card',
        amount: 15.5,
      },
    ],
    productId: 'test-direct-product',
    productName: 'Direct Buy Collectible Card',
  })
  console.log('Created test order: test-direct-order')

  // 3. Trigger checkout.session.completed for direct checkout
  const mockSession = {
    id: 'cs_test_direct_123',
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: 'pi_test_direct_123',
    customer_details: {
      email: 'testbuyer@example.com',
    },
    metadata: {
      order_id: 'test-direct-order',
      checkout_mode: 'account',
      user_id: 'test-user-123',
    },
  }

  await triggerWebhook('checkout.session.completed', mockSession)
  await sleep(1000)

  // Verify direct checkout finalization results
  const updatedOrder = await orderRef.get()
  const updatedProduct = await productRef.get()

  console.log('\n--- VERIFYING DIRECT CHECKOUT RESULTS ---')
  console.log(`Order status (expected: paid): ${updatedOrder.data().status}`)
  console.log(`Product status (expected: sold): ${updatedProduct.data().status}`)

  const mailDocs = await db.collection('mail').where('category', '==', 'order_confirmation').get()
  console.log(`Emails enqueued: ${mailDocs.size}`)
  if (mailDocs.size > 0) {
    console.log(`Confirmation email sent to: ${mailDocs.docs[0].data().to.join(', ')}`)
  }

  if (updatedOrder.data().status !== 'paid' || updatedProduct.data().status !== 'sold') {
    throw new Error('Direct checkout verification failed!')
  }

  // 4. Create an auction product, bid, and order
  const auctionProductRef = db.collection('products').doc('test-auction-product')
  await auctionProductRef.set({
    name: 'Rare Gold Coin',
    price: 100,
    currentBidPrice: 150,
    currentBidId: 'test-bid-id',
    saleMode: 'auction',
    auctionStatus: 'approved_awaiting_payment',
    status: 'published',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  const bidRef = db.collection('bids').doc('test-bid-id')
  await bidRef.set({
    amount: 150,
    buyerEmail: 'bidwinner@example.com',
    productId: 'test-auction-product',
    productName: 'Rare Gold Coin',
    status: 'approved_awaiting_payment',
    userId: 'auction-user-999',
  })

  const auctionOrderRef = db.collection('orders').doc('test-auction-order')
  await auctionOrderRef.set({
    amount: 150,
    buyerEmail: 'bidwinner@example.com',
    bidId: 'test-bid-id',
    productId: 'test-auction-product',
    productName: 'Rare Gold Coin',
    status: 'approved_awaiting_payment',
    userId: 'auction-user-999',
  })
  console.log('\nCreated test auction records')

  // 5. Trigger checkout.session.expired for the auction
  const mockExpiredSession = {
    id: 'cs_test_auction_expired',
    object: 'checkout.session',
    payment_status: 'unpaid',
    metadata: {
      order_id: 'test-auction-order',
      bid_id: 'test-bid-id',
      user_id: 'auction-user-999',
    },
  }

  await triggerWebhook('checkout.session.expired', mockExpiredSession)
  await sleep(1000)

  // Verify auction expiration reversion results
  const expiredOrder = await auctionOrderRef.get()
  const revertedBid = await bidRef.get()
  const revertedProduct = await auctionProductRef.get()

  console.log('\n--- VERIFYING AUCTION EXPIRATION REVERSION ---')
  console.log(`Order status (expected: expired): ${expiredOrder.data().status}`)
  console.log(`Bid status (expected: pending_admin_approval): ${revertedBid.data().status}`)
  console.log(`Product auctionStatus (expected: open): ${revertedProduct.data().auctionStatus}`)

  if (
    expiredOrder.data().status !== 'expired' ||
    revertedBid.data().status !== 'pending_admin_approval' ||
    revertedProduct.data().auctionStatus !== 'open'
  ) {
    throw new Error('Auction expiration reversion verification failed!')
  }

  // Cleanup test documents
  console.log('\nCleaning up test documents...')
  await productRef.delete()
  await orderRef.delete()
  await auctionProductRef.delete()
  await bidRef.delete()
  await auctionOrderRef.delete()
  for (const doc of mailDocs.docs) {
    await doc.ref.delete()
  }
  console.log('Cleanup complete.')

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---')
}

run().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
