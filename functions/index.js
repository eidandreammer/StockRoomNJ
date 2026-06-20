import crypto from 'node:crypto'
import admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore'
import Stripe from 'stripe'
import { sendEmail } from './email/index.js'

admin.initializeApp()

const db = admin.firestore()

let stripeInstance = null
function getStripe() {
  if (stripeInstance) return stripeInstance
  const key = process.env.STRIPE_SECRET_KEY || ''
  if (key) {
    stripeInstance = new Stripe(key)
  }
  return stripeInstance
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
const documentTypes = ['TOS', 'PRIVACY_POLICY']

function sendJson(response, status, payload) {
  response.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.status(status).json(payload)
}

function applyCors(request, response) {
  const origin = request.headers.origin

  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin || '*')
  }

  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function body(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body
  }

  if (!request.rawBody) {
    return {}
  }

  return JSON.parse(request.rawBody.toString('utf8'))
}

function requiredString(payload, key) {
  const value = payload[key]

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required.`)
  }

  return value.trim()
}

function requestIp(request) {
  const forwardedFor = request.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return request.ip || request.socket?.remoteAddress || ''
}

function agreementId(userId, documentId) {
  return crypto.createHash('sha256').update(`${userId}:${documentId}`).digest('hex')
}

function cents(value) {
  return Math.round(Number(value) * 100)
}

function dollars(value) {
  return Math.round(Number(value)) / 100
}

function calculateIncrement(currentPrice) {
  const price = Number(currentPrice) || 0

  if (price < 10) return 0.5
  if (price < 50) return 1
  if (price < 200) return 2.5
  if (price < 500) return 5

  return 10
}

async function activeLegalDocuments() {
  const snapshot = await db
    .collection('legal_documents')
    .where('is_active', '==', true)
    .get()

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

async function checkConsent(userId) {
  const activeDocuments = await activeLegalDocuments()
  const missing = []

  for (const documentType of documentTypes) {
    const document = activeDocuments.find((activeDocument) => activeDocument.document_type === documentType)

    if (!document) {
      missing.push(documentType)
      continue
    }

    const signed = await db.collection('user_agreements').doc(agreementId(userId, document.id)).get()

    if (!signed.exists) {
      missing.push(documentType)
    }
  }

  return {
    has_consent: missing.length === 0,
    missing_document_types: missing,
  }
}

async function validateGuestAgreementIds(userId, agreementIds) {
  const activeDocuments = await activeLegalDocuments()
  const requiredDocumentIds = new Set(
    documentTypes.map((documentType) => {
      const document = activeDocuments.find((activeDocument) => activeDocument.document_type === documentType)
      return document?.id
    }),
  )
  const signedDocumentIds = new Set()
  const minimumAgreedAt = Date.now() - 30 * 60 * 1000

  for (const id of agreementIds) {
    const agreementSnapshot = await db.collection('user_agreements').doc(String(id)).get()

    if (!agreementSnapshot.exists) {
      continue
    }

    const agreement = agreementSnapshot.data()
    const agreedAtMillis = agreement.agreed_at?.toMillis?.() ?? 0

    if (agreement.user_id === userId && agreedAtMillis >= minimumAgreedAt) {
      signedDocumentIds.add(agreement.document_id)
    }
  }

  requiredDocumentIds.delete(undefined)

  return [...requiredDocumentIds].every((documentId) => signedDocumentIds.has(documentId))
}

async function assertAdmin(request) {
  const header = request.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''

  if (!token) {
    throw new Error('Admin authorization is required.')
  }

  const decoded = await admin.auth().verifyIdToken(token)
  const adminDoc = await db.collection('admins').doc(decoded.uid).get()

  if (!adminDoc.exists) {
    throw new Error('Admin authorization is required.')
  }

  return decoded
}

async function assertUserRequest(request, userId) {
  if (userId.startsWith('guest:')) {
    return null
  }

  const header = request.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''

  if (!token) {
    throw new Error('Account authorization is required.')
  }

  const decoded = await admin.auth().verifyIdToken(token)

  if (decoded.uid !== userId) {
    throw new Error('Account authorization does not match this user.')
  }

  return decoded
}

async function handleActiveLegal(_request, response) {
  const documents = await activeLegalDocuments()

  sendJson(response, 200, { documents })
}

async function handleCheckConsent(request, response) {
  const userId = String(request.query.user_id || '').trim()

  if (!userId) {
    sendJson(response, 400, { error: 'user_id is required.' })
    return
  }

  sendJson(response, 200, await checkConsent(userId))
}

async function handleAgree(request, response) {
  const payload = body(request)
  const userId = requiredString(payload, 'user_id')
  const documentType = requiredString(payload, 'document_type')
  const versionNumber = requiredString(payload, 'version_number')

  await assertUserRequest(request, userId)

  if (!documentTypes.includes(documentType)) {
    sendJson(response, 400, { error: 'Unsupported document_type.' })
    return
  }

  const documentSnapshot = await db
    .collection('legal_documents')
    .where('document_type', '==', documentType)
    .where('version_number', '==', versionNumber)
    .limit(1)
    .get()

  if (documentSnapshot.empty) {
    sendJson(response, 404, { error: 'Legal document version was not found.' })
    return
  }

  const document = documentSnapshot.docs[0]
  const id = agreementId(userId, document.id)
  const agreementRef = db.collection('user_agreements').doc(id)
  const now = admin.firestore.Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(agreementRef)

    if (existing.exists) {
      transaction.update(agreementRef, {
        agreed_at: now,
        ip_address: requestIp(request),
      })
      return
    }

    transaction.set(agreementRef, {
      agreed_at: now,
      document_id: document.id,
      document_type: documentType,
      ip_address: requestIp(request),
      user_id: userId,
      version_number: versionNumber,
    })
  })

  sendJson(response, 200, { agreement_id: id })
}

async function handlePublishLegal(request, response) {
  const adminUser = await assertAdmin(request)
  const payload = body(request)
  const documentType = requiredString(payload, 'document_type')
  const versionNumber = requiredString(payload, 'version_number')
  const contentUrl = String(payload.content_url || '').trim()

  if (!contentUrl) {
    sendJson(response, 400, { error: 'content_url is required.' })
    return
  }

  if (!documentTypes.includes(documentType)) {
    sendJson(response, 400, { error: 'Unsupported document_type.' })
    return
  }

  const newDocumentRef = db.collection('legal_documents').doc(`${documentType}_${versionNumber}`)
  const now = admin.firestore.Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const existingVersion = await transaction.get(newDocumentRef)

    if (existingVersion.exists) {
      throw new Error('This legal document version already exists.')
    }

    const activeSnapshot = await transaction.get(
      db.collection('legal_documents')
        .where('document_type', '==', documentType)
        .where('is_active', '==', true),
    )

    activeSnapshot.docs.forEach((activeDoc) => {
      transaction.update(activeDoc.ref, { is_active: false, updated_at: now })
    })

    transaction.set(newDocumentRef, {
      content_url: contentUrl,
      document_type: documentType,
      effective_date: now,
      is_active: true,
      published_by: adminUser.uid,
      version_number: versionNumber,
    })
  })

  sendJson(response, 201, { document_id: newDocumentRef.id })
}

async function handlePlaceBid(request, response) {
  const payload = body(request)
  const productId = requiredString(payload, 'product_id')
  const userId = requiredString(payload, 'user_id')
  const buyerEmail = requiredString(payload, 'buyer_email')
  const bidAmount = Number(payload.bid_amount)

  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    sendJson(response, 400, { error: 'bid_amount must be a positive number.' })
    return
  }

  const productRef = db.collection('products').doc(productId)
  const bidRef = db.collection('bids').doc()
  let bidRecord = null
  let previousBidId = null
  let productName = productId

  await db.runTransaction(async (transaction) => {
    const productSnapshot = await transaction.get(productRef)

    if (!productSnapshot.exists) {
      throw new Error('Product was not found.')
    }

    const product = productSnapshot.data()

    if (product.status !== 'published' || product.saleMode !== 'auction' || product.auctionStatus === 'closed') {
      throw new Error('This item is not open for bidding.')
    }

    const currentPrice = Number(product.currentBidPrice) || Number(product.price) || 0
    const minimumBid = dollars(cents(currentPrice) + cents(calculateIncrement(currentPrice)))

    if (cents(bidAmount) < cents(minimumBid)) {
      throw new Error(`Bid must be at least $${minimumBid.toFixed(2)}.`)
    }

    previousBidId = product.currentBidId || null
    productName = product.name || productId

    bidRecord = {
      amount: dollars(cents(bidAmount)),
      buyerEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: requestIp(request),
      productId,
      productName: product.name || productId,
      status: 'pending_admin_approval',
      userId,
    }

    transaction.set(bidRef, bidRecord)
    transaction.update(productRef, {
      currentBidId: bidRef.id,
      currentBidPrice: bidRecord.amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })

  // 1. Send bid confirmation email to current bidder
  const sendBidEmail = async () => {
    try {
      await sendEmail({
        to: buyerEmail,
        category: 'bidding',
        templateName: 'bid_received',
        data: { productName, amount: bidRecord.amount },
        metadata: { userId, bidId: bidRef.id, productId: bidRecord.productId }
      })
    } catch (err) {
      console.error(`Failed to send bid confirmation email to ${buyerEmail}:`, err)
    }
  }
  await sendBidEmail()

  // 2. Send outbid alert email to previous bidder
  if (previousBidId) {
    try {
      const previousBidSnap = await db.collection('bids').doc(previousBidId).get()
      if (previousBidSnap.exists) {
        const prevBid = previousBidSnap.data()
        const previousEmail = String(prevBid.buyerEmail || '').trim()
        const currentEmail = buyerEmail.trim().toLowerCase()

        if (previousEmail && previousEmail.toLowerCase() !== currentEmail) {
          await sendEmail({
            to: previousEmail,
            category: 'bidding',
            templateName: 'outbid',
            data: { productName, currentBidAmount: bidRecord.amount },
            metadata: { userId: prevBid.userId, bidId: previousBidId, productId: bidRecord.productId }
          })
        }
      }
    } catch (err) {
      console.error('Failed to send outbid email:', err)
    }
  }

  sendJson(response, 201, {
    bid: {
      ...bidRecord,
      id: bidRef.id,
    },
  })
}

async function createCheckoutSession({ agreementIds, buyerEmail, items, metadata }) {
  const stripe = getStripe()
  if (!stripe) {
    return { id: '', url: '', warning: 'Stripe is not configured.' }
  }

  const paymentMethodTypes = (process.env.STRIPE_PAYMENT_METHOD_TYPES || '')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean)

  const sessionPayload = {
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://stockroomnj.com/shop?checkout=cancel',
    customer_email: buyerEmail,
    line_items: items,
    metadata: {
      agreement_ids: agreementIds.join(','),
      ...metadata,
    },
    mode: 'payment',
    success_url: process.env.STRIPE_SUCCESS_URL || 'https://stockroomnj.com/shop?checkout=success',
  }

  if (paymentMethodTypes.length > 0) {
    sessionPayload.payment_method_types = paymentMethodTypes
  }

  return stripe.checkout.sessions.create(sessionPayload)
}

async function handleCreateCheckoutSession(request, response) {
  const payload = body(request)
  const userId = requiredString(payload, 'user_id')
  const buyerEmail = requiredString(payload, 'buyer_email')
  const checkoutMode = requiredString(payload, 'checkout_mode')
  const agreementIds = Array.isArray(payload.agreement_ids) ? payload.agreement_ids : []
  const cartItems = Array.isArray(payload.items) ? payload.items : []

  if (!['account', 'guest'].includes(checkoutMode)) {
    sendJson(response, 400, { error: 'checkout_mode must be account or guest.' })
    return
  }

  if (checkoutMode === 'account') {
    await assertUserRequest(request, userId)
  }

  if (cartItems.length === 0) {
    sendJson(response, 400, { error: 'At least one checkout item is required.' })
    return
  }

  const consent = await checkConsent(userId)

  if (!consent.has_consent) {
    sendJson(response, 409, {
      error: 'Active Terms of Service and Privacy Policy agreements are required before checkout.',
      ...consent,
    })
    return
  }

  if (checkoutMode === 'guest' && !(await validateGuestAgreementIds(userId, agreementIds))) {
    sendJson(response, 409, { error: 'Guest checkout requires fresh legal acceptance for this purchase.' })
    return
  }

  const lineItems = []
  const checkoutProductIds = new Set()

  for (const item of cartItems) {
    const productId = String(item.product_id || '').trim()

    if (!productId) {
      sendJson(response, 400, { error: 'Each checkout item requires a product_id.' })
      return
    }

    if (checkoutProductIds.has(productId)) {
      sendJson(response, 400, { error: `Product ${productId} can only be checked out once.` })
      return
    }

    checkoutProductIds.add(productId)
    const productSnapshot = await db.collection('products').doc(productId).get()

    if (!productSnapshot.exists) {
      sendJson(response, 404, { error: `Product ${productId} was not found.` })
      return
    }

    const product = productSnapshot.data()

    if (product.status !== 'published' || product.saleMode === 'auction') {
      sendJson(response, 400, { error: `${product.name || productId} is not available for direct checkout.` })
      return
    }

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.name || productId,
        },
        unit_amount: cents(product.price),
      },
      quantity: 1,
    })
  }

  const orderRef = db.collection('orders').doc()
  const orderData = {
    amount: dollars(lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0)),
    buyerEmail,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending_payment',
    userId,
    checkoutMode,
    items: cartItems.map((item, idx) => ({
      productId: item.product_id,
      productName: lineItems[idx].price_data.product_data.name,
      amount: dollars(lineItems[idx].price_data.unit_amount),
    })),
  }

  if (lineItems.length > 0) {
    orderData.productId = cartItems[0].product_id
    orderData.productName = lineItems[0].price_data.product_data.name
  }

  await orderRef.set(orderData)

  const session = await createCheckoutSession({
    agreementIds,
    buyerEmail,
    items: lineItems,
    metadata: {
      checkout_mode: checkoutMode,
      order_id: orderRef.id,
      user_id: userId,
    },
  })

  if (session.id) {
    await orderRef.update({
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url,
    })
  }

  sendJson(response, 200, { id: session.id, url: session.url, warning: session.warning })
}

async function handleApproveBid(request, response) {
  const adminUser = await assertAdmin(request)
  const payload = body(request)
  const bidId = requiredString(payload, 'bid_id')
  const bidRef = db.collection('bids').doc(bidId)
  const orderRef = db.collection('orders').doc()
  let order = null

  await db.runTransaction(async (transaction) => {
    const bidSnapshot = await transaction.get(bidRef)

    if (!bidSnapshot.exists) {
      throw new Error('Bid was not found.')
    }

    const bid = bidSnapshot.data()

    if (bid.status !== 'pending_admin_approval') {
      throw new Error('This bid is not pending approval.')
    }

    order = {
      amount: Number(bid.amount) || 0,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: adminUser.uid,
      bidId,
      buyerEmail: bid.buyerEmail,
      productId: bid.productId,
      productName: bid.productName,
      status: 'approved_awaiting_payment',
      userId: bid.userId,
      approvalEmailSent: false,
    }

    transaction.set(orderRef, order)
    transaction.update(bidRef, {
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: adminUser.uid,
      orderId: orderRef.id,
      status: 'approved_awaiting_payment',
    })
    transaction.update(db.collection('products').doc(bid.productId), {
      auctionStatus: 'approved_awaiting_payment',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })

  const session = await createCheckoutSession({
    agreementIds: [],
    buyerEmail: order.buyerEmail,
    items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: order.productName,
          },
          unit_amount: cents(order.amount),
        },
        quantity: 1,
      },
    ],
    metadata: {
      bid_id: bidId,
      order_id: orderRef.id,
      user_id: order.userId,
    },
  })

  if (session.id) {
    await orderRef.update({
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url,
    })

    // Send email to bidder containing the Stripe invoice checkout link
    const sendInvoiceEmail = async () => {
      try {
        const orderSnap = await orderRef.get()
        if (orderSnap.exists && orderSnap.data().approvalEmailSent) {
          console.log(`Approval checkout email already sent for order ${orderRef.id}. Skipping.`)
          return
        }

        await sendEmail({
          to: order.buyerEmail,
          category: 'checkout',
          templateName: 'bid_approved_checkout',
          data: { productName: order.productName, amount: order.amount, checkoutUrl: session.url },
          metadata: { userId: order.userId, orderId: orderRef.id, bidId }
        })

        await orderRef.update({ approvalEmailSent: true })
      } catch (err) {
        console.error(`Failed to send bid approval checkout email to ${order.buyerEmail}:`, err)
      }
    }
    await sendInvoiceEmail()
  }

  sendJson(response, 200, {
    order: {
      ...order,
      id: orderRef.id,
      stripeCheckoutUrl: session.url,
    },
  })
}

async function handleUpdateShipping(request, response) {
  const adminUser = await assertAdmin(request)
  const payload = body(request)
  
  const orderId = requiredString(payload, 'order_id')
  const shippingMethod = requiredString(payload, 'shipping_method') // 'shipping' or 'pickup'
  const carrier = payload.carrier || ''
  const trackingNumber = payload.tracking_number || ''
  const pickupInstructions = payload.pickup_instructions || ''

  if (shippingMethod !== 'shipping' && shippingMethod !== 'pickup') {
    throw new Error("shipping_method must be either 'shipping' or 'pickup'.")
  }

  const orderRef = db.collection('orders').doc(orderId)
  const orderSnap = await orderRef.get()

  if (!orderSnap.exists) {
    throw new Error(`Order ${orderId} does not exist.`)
  }

  const orderData = orderSnap.data()
  if (orderData.status !== 'paid') {
    throw new Error(`Order ${orderId} is not paid. Current status: ${orderData.status}`)
  }

  // Update order document
  const updateData = {
    shippingMethod,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    shippingUpdatedBy: adminUser.uid,
  }

  if (shippingMethod === 'shipping') {
    updateData.carrier = carrier
    updateData.trackingNumber = trackingNumber
    updateData.shippingStatus = 'shipped'
  } else {
    updateData.pickupInstructions = pickupInstructions
    updateData.shippingStatus = 'ready_for_pickup'
  }

  await orderRef.update(updateData)

  // Send update email safely
  try {
    await sendEmail({
      to: orderData.buyerEmail,
      category: 'shipping',
      templateName: 'shipping_or_pickup',
      data: {
        orderId,
        productName: orderData.productName || 'Your Item',
        shippingMethod,
        carrier,
        trackingNumber,
        pickupInstructions,
      },
      metadata: {
        userId: orderData.userId,
        orderId,
        productId: orderData.productId || null,
      }
    })
  } catch (err) {
    console.error(`Failed to send shipping/pickup update email for order ${orderId}:`, err)
  }

  sendJson(response, 200, { success: true, orderId })
}

async function finalizeOrderPayment(orderId, paymentIntentId) {
  if (!orderId) return
  const orderRef = db.collection('orders').doc(orderId)

  let orderData = null
  let shouldSendEmail = false

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef)
    if (!orderSnap.exists) {
      console.log(`Order ${orderId} does not exist for finalization.`)
      return
    }

    orderData = orderSnap.data()
    
    // Check if paid and email was already sent
    if (orderData.status === 'paid') {
      if (!orderData.confirmationEmailSent) {
        shouldSendEmail = true
        transaction.update(orderRef, {
          confirmationEmailSent: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
      return
    }

    transaction.update(orderRef, {
      status: 'paid',
      confirmationEmailSent: true,
      paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripePaymentIntentId: paymentIntentId || orderData.stripePaymentIntentId || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Mark products as sold
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        transaction.update(db.collection('products').doc(item.productId), {
          status: 'sold',
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    } else if (orderData.productId) {
      const updatePayload = {
        status: 'sold',
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
      if (orderData.bidId) {
        updatePayload.auctionStatus = 'closed'
      }
      transaction.update(db.collection('products').doc(orderData.productId), updatePayload)
    }

    if (orderData.bidId) {
      transaction.update(db.collection('bids').doc(orderData.bidId), {
        status: 'paid',
        paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    shouldSendEmail = true
  })

  // Send confirmation email safely
  if (shouldSendEmail && orderData) {
    try {
      const itemsList = orderData.items || []
      await sendEmail({
        to: orderData.buyerEmail,
        category: 'orders',
        templateName: 'order_confirmed',
        data: {
          productName: orderData.productName,
          amount: orderData.amount,
          items: itemsList,
        },
        metadata: {
          userId: orderData.userId,
          orderId,
          productId: orderData.productId || null,
          bidId: orderData.bidId || null,
        }
      })
    } catch (err) {
      console.error(`[Webhook] Order payment finalized but confirmation email failed for order ${orderId}:`, err)
      // Suppress error so payment finalization is not aborted
    }
  }
}

async function handleOrderPaymentFailed(orderId, isExpiration) {
  if (!orderId) return
  const orderRef = db.collection('orders').doc(orderId)

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef)
    if (!orderSnap.exists) {
      console.log(`Order ${orderId} does not exist for failure update.`)
      return
    }

    const orderData = orderSnap.data()
    if (orderData.status === 'paid') {
      console.log(`Order ${orderId} is already paid. Cannot mark as failed/expired.`)
      return
    }

    const newStatus = isExpiration ? 'expired' : 'failed'
    transaction.update(orderRef, {
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // For auction orders, revert the product and bid status so they can be re-approved/re-bid
    if (orderData.bidId) {
      const bidRef = db.collection('bids').doc(orderData.bidId)
      transaction.update(bidRef, {
        status: 'pending_admin_approval',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      const productRef = db.collection('products').doc(orderData.productId)
      transaction.update(productRef, {
        auctionStatus: 'open',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  })
}

async function handleStripeWebhook(request, response) {
  const stripe = getStripe()
  if (!stripe) {
    sendJson(response, 500, { error: 'Stripe is not configured.' })
    return
  }

  const sig = request.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    console.error('Missing stripe-signature or STRIPE_WEBHOOK_SECRET')
    sendJson(response, 400, { error: 'Webhook signature verification failed.' })
    return
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(request.rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    sendJson(response, 400, { error: `Webhook Error: ${err.message}` })
    return
  }

  console.log(`Received Stripe webhook event: ${event.type}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.payment_status === 'paid') {
          const orderId = session.metadata?.order_id
          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id
          await finalizeOrderPayment(orderId, paymentIntentId)
        } else {
          console.log(`Checkout session completed but payment_status is ${session.payment_status}`)
        }
        break
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const orderId = paymentIntent.metadata?.order_id
        await finalizeOrderPayment(orderId, paymentIntent.id)
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        const orderId = session.metadata?.order_id
        await handleOrderPaymentFailed(orderId, true)
        break
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object
        const orderId = paymentIntent.metadata?.order_id
        await handleOrderPaymentFailed(orderId, false)
        break
      }
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }

    sendJson(response, 200, { received: true })
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err)
    sendJson(response, 500, { error: err.message || 'Error processing webhook event' })
  }
}

const routes = {
  'GET /api/legal/active': handleActiveLegal,
  'GET /api/legal/check-consent': handleCheckConsent,
  'POST /api/legal/agree': handleAgree,
  'POST /api/admin/legal/publish': handlePublishLegal,
  'POST /api/bids/place': handlePlaceBid,
  'POST /api/checkout/create-session': handleCreateCheckoutSession,
  'POST /api/admin/bids/approve': handleApproveBid,
  'POST /api/stripe/webhook': handleStripeWebhook,
  'POST /api/admin/orders/update-shipping': handleUpdateShipping,
}

export const api = onRequest({
  secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'POSTMARK_SERVER_TOKEN', 'EMAIL_FROM', 'EMAIL_REPLY_TO']
}, async (request, response) => {
  applyCors(request, response)

  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  const path = new URL(request.url, 'https://stockroomnj.local').pathname
  const handler = routes[`${request.method} ${path}`]

  if (!handler) {
    sendJson(response, 404, { error: 'Endpoint not found.' })
    return
  }

  try {
    await handler(request, response)
  } catch (error) {
    sendJson(response, 400, { error: error.message || 'Request failed.' })
  }
})

export const onUserCreated = onDocumentCreated(
  {
    document: 'users/{uid}',
    secrets: ['POSTMARK_SERVER_TOKEN', 'EMAIL_FROM', 'EMAIL_REPLY_TO'],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return
    const uid = event.params.uid

    const email = data.email || ''
    const name = data.displayName || 'Collector'

    if (!email) {
      console.log('User has no email address. Skipping welcome email.')
      return
    }

    try {
      await sendEmail({
        to: email,
        category: 'account',
        templateName: 'welcome',
        data: { name },
        metadata: { userId: uid }
      })
    } catch (err) {
      console.error(`Failed to send welcome email to ${email}:`, err)
    }
  }
)

export const onUserDeleted = onDocumentDeleted(
  {
    document: 'users/{uid}',
    secrets: ['POSTMARK_SERVER_TOKEN', 'EMAIL_FROM', 'EMAIL_REPLY_TO'],
  },
  async (event) => {
    const data = event.data?.before.data()
    if (!data) return
    const uid = event.params.uid

    const email = data.email || ''
    const name = data.displayName || 'Collector'

    if (!email) {
      console.log('Deleted user has no email address. Skipping account deleted email.')
      return
    }

    try {
      await sendEmail({
        to: email,
        category: 'account',
        templateName: 'account_deleted',
        data: { name },
        metadata: { userId: uid }
      })
    } catch (err) {
      console.error(`Failed to send account deleted email to ${email}:`, err)
    }
  }
)
