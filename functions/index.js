import crypto from 'node:crypto'
import admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
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

export function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
}
const documentTypes = ['TOS', 'PRIVACY_POLICY']
const DIRECT_CHECKOUT_EXPIRATION_SECONDS = 31 * 60
const GUEST_TOKEN_TTL_SECONDS = 24 * 60 * 60
const RATE_LIMIT_WINDOW_MS = 60 * 1000

function sendJson(response, status, payload) {
  response.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.status(status).json(payload)
}

function requestError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function isLocalOrigin(origin) {
  try {
    const parsed = new URL(origin)
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    const isLoopback = parsed.hostname === 'localhost'
      || parsed.hostname === '::1'
      || /^127(?:\.\d{1,3}){3}$/.test(parsed.hostname)

    return isHttp && isLoopback
  } catch {
    return false
  }
}

export function isCorsOriginAllowed(origin) {
  if (!origin) return true

  const isLocalRuntime = process.env.FUNCTIONS_EMULATOR === 'true'
    || process.env.NODE_ENV === 'development'
    || process.env.NODE_ENV === 'test'

  return getAllowedOrigins().includes(origin) || (isLocalRuntime && isLocalOrigin(origin))
}

export function applyCors(request, response) {
  const origin = request.headers.origin
  if (!origin) return true

  if (isCorsOriginAllowed(origin)) {
    response.set('Access-Control-Allow-Origin', origin)
    response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Guest-Token')
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.set('Vary', 'Origin')
    return true
  }

  return false
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function getGuestTokenSecret() {
  const secret = process.env.GUEST_TOKEN_SECRET || ''

  if (!secret) {
    throw requestError('Guest token signing is not configured.', 500)
  }

  return secret
}

export function signGuestSession(userId, email, options = {}) {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const expiresAt = nowSeconds + (options.ttlSeconds ?? GUEST_TOKEN_TTL_SECONDS)
  const encodedPayload = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    exp: expiresAt,
    iat: nowSeconds,
    sub: userId,
    v: 1,
  })).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getGuestTokenSecret())
    .update(encodedPayload)
    .digest('hex')

  return `${encodedPayload}.${signature}`
}

export function verifyGuestSession(userId, email, token, options = {}) {
  if (!token || typeof token !== 'string') {
    return false
  }

  try {
    const [encodedPayload, signature, extra] = token.split('.')
    if (!encodedPayload || !signature || extra || signature.length !== 64) return false

    const expected = crypto
      .createHmac('sha256', getGuestTokenSecret())
      .update(encodedPayload)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return false
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)

    return payload.v === 1
      && payload.sub === userId
      && payload.email === normalizeEmail(email)
      && Number.isInteger(payload.iat)
      && Number.isInteger(payload.exp)
      && payload.iat <= nowSeconds + 60
      && payload.exp > nowSeconds
  } catch {
    return false
  }
}

function rateLimitDocumentId(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

async function consumeRateLimits(limits, nowMillis = Date.now()) {
  const cutoff = nowMillis - RATE_LIMIT_WINDOW_MS
  const refs = limits.map((limit) => db.collection('rate_limits').doc(rateLimitDocumentId(limit.key)))

  await db.runTransaction(async (transaction) => {
    const snapshots = []
    for (const ref of refs) {
      snapshots.push(await transaction.get(ref))
    }

    const nextHits = snapshots.map((snapshot) => {
      const hits = snapshot.exists && Array.isArray(snapshot.data().hits) ? snapshot.data().hits : []
      return hits.filter((hit) => Number.isFinite(hit) && hit > cutoff)
    })

    const blockedIndex = nextHits.findIndex((hits, index) => hits.length >= limits[index].maxRequests)
    if (blockedIndex >= 0) {
      throw new Error(limits[blockedIndex].message)
    }

    refs.forEach((ref, index) => {
      transaction.set(ref, {
        expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis + RATE_LIMIT_WINDOW_MS * 2),
        hits: [...nextHits[index], nowMillis],
        type: limits[index].type,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })
  })
}

export async function applyRateLimiting(request, userId, buyerEmail, productId) {
  const ip = requestIp(request)
  const limits = [
    { key: `email:${normalizeEmail(buyerEmail)}`, maxRequests: 5, message: 'Too many bids with this email. Please wait a moment.', type: 'email' },
    { key: `user:${userId}`, maxRequests: 5, message: 'Too many bids from this user. Please wait a moment.', type: 'user' },
    { key: `product:${productId}`, maxRequests: 20, message: 'Too many bids on this product. Please wait a moment.', type: 'product' },
  ]

  if (ip) {
    limits.unshift({ key: `ip:${ip}`, maxRequests: 10, message: 'Too many bids from this IP. Please wait a moment.', type: 'ip' })
  }

  await consumeRateLimits(limits)
}

async function applyGuestAgreementRateLimit(request, userId, email) {
  const ip = requestIp(request)
  const limits = [
    { key: `legal-user:${userId}`, maxRequests: 10, message: 'Too many agreement requests. Please wait a moment.', type: 'legal-user' },
    { key: `legal-email:${normalizeEmail(email)}`, maxRequests: 10, message: 'Too many agreement requests. Please wait a moment.', type: 'legal-email' },
  ]

  if (ip) {
    limits.unshift({ key: `legal-ip:${ip}`, maxRequests: 20, message: 'Too many agreement requests. Please wait a moment.', type: 'legal-ip' })
  }

  await consumeRateLimits(limits)
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
    throw requestError('Admin authorization is required.', 401)
  }

  let decoded
  try {
    decoded = await admin.auth().verifyIdToken(token)
  } catch {
    throw requestError('Admin authorization is invalid.', 401)
  }
  const adminDoc = await db.collection('admins').doc(decoded.uid).get()

  if (!adminDoc.exists) {
    throw requestError('Admin authorization is required.', 403)
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
    throw requestError('Account authorization is required.', 401)
  }

  let decoded
  try {
    decoded = await admin.auth().verifyIdToken(token)
  } catch {
    throw requestError('Account authorization is invalid.', 401)
  }

  if (decoded.uid !== userId) {
    throw requestError('Account authorization does not match this user.', 401)
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

  const ip = requestIp(request)
  const limits = [
    { key: `consent-user:${userId}`, maxRequests: 20, message: 'Too many consent checks. Please wait a moment.', type: 'consent-user' },
  ]
  if (ip) {
    limits.unshift({ key: `consent-ip:${ip}`, maxRequests: 30, message: 'Too many consent checks. Please wait a moment.', type: 'consent-ip' })
  }

  try {
    await consumeRateLimits(limits)
  } catch (error) {
    sendJson(response, 429, { error: error.message })
    return
  }

  sendJson(response, 200, await checkConsent(userId))
}

async function handleAgree(request, response) {
  const payload = body(request)
  const userId = requiredString(payload, 'user_id')
  const documentType = requiredString(payload, 'document_type')
  const versionNumber = requiredString(payload, 'version_number')
  const email = payload.email ? normalizeEmail(payload.email) : null
  const context = payload.context || null
  const userAgent = payload.user_agent || null

  if (userId.startsWith('guest:')) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(response, 400, { error: 'A valid guest email is required.' })
      return
    }

    try {
      await applyGuestAgreementRateLimit(request, userId, email)
    } catch (error) {
      sendJson(response, 429, { error: error.message })
      return
    }
  } else {
    await assertUserRequest(request, userId)
  }

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
    } else {
      transaction.set(agreementRef, {
        agreed_at: now,
        document_id: document.id,
        document_type: documentType,
        ip_address: requestIp(request),
        user_id: userId,
        version_number: versionNumber,
      })
    }

    const historyRef = db.collection('user_agreement_history').doc()
    transaction.set(historyRef, {
      acceptedAt: now,
      document_id: document.id,
      document_type: documentType,
      ip_address: requestIp(request),
      user_agent: userAgent,
      user_id: userId,
      email: email,
      version_number: versionNumber,
      context: context,
    })
  })

  const resPayload = { agreement_id: id }
  if (userId.startsWith('guest:')) {
    resPayload.guest_token = signGuestSession(userId, email)
  }
  sendJson(response, 200, resPayload)
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

export async function handlePlaceBid(request, response) {
  const payload = body(request)
  const productId = requiredString(payload, 'product_id')
  const userId = requiredString(payload, 'user_id')
  const buyerEmail = normalizeEmail(requiredString(payload, 'buyer_email'))
  const bidAmount = payload.bid_amount

  if (typeof bidAmount !== 'number' || !Number.isFinite(bidAmount) || bidAmount <= 0) {
    sendJson(response, 400, { error: 'bid_amount must be a positive number.' })
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(buyerEmail)) {
    sendJson(response, 400, { error: 'A valid email is required.' })
    return
  }

  try {
    if (userId.startsWith('guest:')) {
      const guestToken = payload.guest_token
      if (!verifyGuestSession(userId, buyerEmail, guestToken)) {
        sendJson(response, 401, { error: 'Invalid or missing guest session token. Please re-agree to legal terms.' })
        return
      }
    } else {
      const decoded = await assertUserRequest(request, userId)
      if (!decoded.email || normalizeEmail(decoded.email) !== buyerEmail) {
        sendJson(response, 401, { error: 'Account email does not match this bid.' })
        return
      }
    }
  } catch (authErr) {
    sendJson(response, 401, { error: authErr.message || 'Authorization failed.' })
    return
  }

  const consent = await checkConsent(userId)
  if (!consent.has_consent) {
    sendJson(response, 409, { error: 'You must accept the Terms of Service and Privacy Policy before bidding.' })
    return
  }

  try {
    await applyRateLimiting(request, userId, buyerEmail, productId)
  } catch (rlErr) {
    sendJson(response, 429, { error: rlErr.message })
    return
  }

  const productRef = db.collection('products').doc(productId)
  const bidRef = db.collection('bids').doc()
  let bidRecord = null
  let previousBidId = null
  let productName = productId

  try {
    await db.runTransaction(async (transaction) => {
      const productSnapshot = await transaction.get(productRef)

      if (!productSnapshot.exists) {
        throw new Error('Product was not found.')
      }

      const product = productSnapshot.data()

      if (product.status !== 'published' || product.saleMode !== 'auction' || product.auctionStatus !== 'open') {
        throw new Error('This item is not open for bidding.')
      }

      if (product.auctionEndsAt) {
        const endsAt = product.auctionEndsAt.toMillis ? product.auctionEndsAt.toMillis() : new Date(product.auctionEndsAt).getTime()
        if (Date.now() >= endsAt) {
          throw new Error('This auction has closed.')
        }
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
  } catch (err) {
    sendJson(response, 400, { error: err.message || 'Bidding transaction failed.' })
    return
  }

  let customerName = 'Collector'
  if (userId && !userId.startsWith('guest:')) {
    try {
      const userDoc = await db.collection('users').doc(userId).get()
      if (userDoc.exists) {
        customerName = userDoc.data().displayName || customerName
      }
    } catch (err) {
      console.error('Failed to fetch user profile for bidding display name:', err)
    }
  }

  const sendBidEmail = async () => {
    try {
      await sendEmail({
        to: buyerEmail,
        category: 'bidding',
        templateName: 'bid_received',
        data: { customerName, productName, amount: bidRecord.amount },
        metadata: { userId, bidId: bidRef.id, productId: bidRecord.productId }
      })
    } catch (err) {
      console.error(`Failed to send bid confirmation email to ${buyerEmail}:`, err)
    }
  }
  await sendBidEmail()

  if (previousBidId) {
    try {
      const previousBidSnap = await db.collection('bids').doc(previousBidId).get()
      if (previousBidSnap.exists) {
        const prevBid = previousBidSnap.data()
        const previousEmail = String(prevBid.buyerEmail || '').trim()
        const currentEmail = buyerEmail.trim().toLowerCase()

        if (previousEmail && previousEmail.toLowerCase() !== currentEmail) {
          let prevCustomerName = 'Collector'
          if (prevBid.userId && !prevBid.userId.startsWith('guest:')) {
            try {
              const prevUserDoc = await db.collection('users').doc(prevBid.userId).get()
              if (prevUserDoc.exists) {
                prevCustomerName = prevUserDoc.data().displayName || prevCustomerName
              }
            } catch (err) {
              console.error('Failed to fetch previous user profile:', err)
            }
          }
          await sendEmail({
            to: previousEmail,
            category: 'bidding',
            templateName: 'outbid',
            data: { customerName: prevCustomerName, productName, currentBidAmount: bidRecord.amount },
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

async function createCheckoutSession({
  agreementIds,
  buyerEmail,
  clientReferenceId,
  expiresAt,
  idempotencyKey,
  items,
  metadata,
}) {
  const stripe = getStripe()
  if (!stripe) {
    throw new Error('Stripe is not configured.')
  }

  const sessionPayload = {
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://stockroomnj.com/shop?checkout=cancel',
    client_reference_id: clientReferenceId,
    customer_email: buyerEmail,
    expires_at: expiresAt,
    line_items: items,
    metadata: {
      agreement_ids: agreementIds.join(','),
      ...metadata,
    },
    mode: 'payment',
    payment_intent_data: {
      metadata: {
        order_id: clientReferenceId,
        user_id: metadata.user_id || '',
      },
    },
    success_url: process.env.STRIPE_SUCCESS_URL || 'https://stockroomnj.com/shop?checkout=success',
  }

  return stripe.checkout.sessions.create(sessionPayload, { idempotencyKey })
}

function clearedReservationFields() {
  return {
    reservationExpiresAt: admin.firestore.FieldValue.delete(),
    reservedBy: admin.firestore.FieldValue.delete(),
    reservedOrderId: admin.firestore.FieldValue.delete(),
  }
}

export async function releaseDirectOrderReservations(orderId, nextStatus = 'failed') {
  const orderRef = db.collection('orders').doc(orderId)

  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef)
    if (!orderSnapshot.exists) return

    const order = orderSnapshot.data()
    const productIds = Array.isArray(order.reservationProductIds)
      ? order.reservationProductIds
      : (order.items || []).map((item) => item.productId).filter(Boolean)
    const productRefs = productIds.map((productId) => db.collection('products').doc(productId))
    const productSnapshots = []

    for (const productRef of productRefs) {
      productSnapshots.push(await transaction.get(productRef))
    }

    productSnapshots.forEach((productSnapshot, index) => {
      if (!productSnapshot.exists) return
      const product = productSnapshot.data()
      if (product.status === 'reserved' && product.reservedOrderId === orderId) {
        transaction.update(productRefs[index], {
          ...clearedReservationFields(),
          status: 'published',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    })

    if (!['paid', 'paid_pending_fulfillment'].includes(order.status)) {
      transaction.update(orderRef, {
        reservationExpiresAt: admin.firestore.FieldValue.delete(),
        status: nextStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  })
}

export async function handleCreateCheckoutSession(request, response) {
  const payload = body(request)
  const userId = requiredString(payload, 'user_id')
  const buyerEmail = normalizeEmail(requiredString(payload, 'buyer_email'))
  const checkoutMode = requiredString(payload, 'checkout_mode')
  const agreementIds = Array.isArray(payload.agreement_ids) ? payload.agreement_ids : []
  const cartItems = Array.isArray(payload.items) ? payload.items : []
  const fulfillmentMethod = requiredString(payload, 'fulfillment_method')

  if (!['account', 'guest'].includes(checkoutMode)) {
    sendJson(response, 400, { error: 'checkout_mode must be account or guest.' })
    return
  }

  if (checkoutMode === 'account') {
    const decoded = await assertUserRequest(request, userId)
    if (!decoded.email || normalizeEmail(decoded.email) !== buyerEmail) {
      sendJson(response, 401, { error: 'Account email does not match this checkout.' })
      return
    }
  } else if (!userId.startsWith('guest:') || !verifyGuestSession(userId, buyerEmail, payload.guest_token)) {
    sendJson(response, 401, { error: 'Invalid or missing guest session token.' })
    return
  }

  if (cartItems.length === 0) {
    sendJson(response, 400, { error: 'At least one checkout item is required.' })
    return
  }

  if (!['pickup', 'shipping'].includes(fulfillmentMethod)) {
    sendJson(response, 400, { error: 'fulfillment_method must be pickup or shipping.' })
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

  let customerName
  let customerPhone
  let normalizedShippingAddress = null
  let pickupLocation = ''
  let pickupStatus = ''
  let fulfillmentStatus

  if (fulfillmentMethod === 'shipping') {
    const shipping_address = payload.shipping_address || {}
    normalizedShippingAddress = {
      fullName: requiredString(shipping_address, 'full_name'),
      street: requiredString(shipping_address, 'street'),
      city: requiredString(shipping_address, 'city'),
      state: requiredString(shipping_address, 'state'),
      zip: requiredString(shipping_address, 'zip'),
      country: requiredString(shipping_address, 'country'),
      phone: (shipping_address.phone || '').trim(),
    }
    customerName = normalizedShippingAddress.fullName
    customerPhone = normalizedShippingAddress.phone
    fulfillmentStatus = 'pending'
  } else {
    customerName = requiredString(payload, 'customer_name')
    customerPhone = (payload.customer_phone || '').trim()
    pickupLocation = '66 Union Blvd, Wallington, NJ 07057'
    pickupStatus = 'pending_ready'
    fulfillmentStatus = 'pending_ready'
  }

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
  }

  const orderRef = db.collection('orders').doc()
  const productIds = [...checkoutProductIds]
  const productRefs = productIds.map((productId) => db.collection('products').doc(productId))
  const stripeExpiresAt = Math.floor(Date.now() / 1000) + DIRECT_CHECKOUT_EXPIRATION_SECONDS
  const provisionalExpiration = admin.firestore.Timestamp.fromMillis(stripeExpiresAt * 1000)
  let lineItems = []

  try {
    await db.runTransaction(async (transaction) => {
      const productSnapshots = []
      for (const productRef of productRefs) {
        productSnapshots.push(await transaction.get(productRef))
      }

      const nowMillis = Date.now()
      lineItems = productSnapshots.map((productSnapshot, index) => {
        const productId = productIds[index]
        if (!productSnapshot.exists) {
          throw requestError(`Product ${productId} was not found.`, 404)
        }

        const product = productSnapshot.data()
        const reservationExpiresAt = product.reservationExpiresAt?.toMillis?.() ?? 0
        const isExpiredReservation = product.status === 'reserved' && reservationExpiresAt <= nowMillis
        const isAvailable = product.status === 'published' || isExpiredReservation

        if (!isAvailable || product.saleMode === 'auction') {
          const status = product.status === 'reserved' ? 409 : 400
          throw requestError(`${product.name || productId} is not available for direct checkout.`, status)
        }

        const unitAmount = cents(product.price)
        if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
          throw requestError(`${product.name || productId} does not have a valid checkout price.`)
        }

        return {
          price_data: {
            currency: 'usd',
            product_data: { name: product.name || productId },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }
      })

      const orderItems = productIds.map((productId, index) => ({
        amount: dollars(lineItems[index].price_data.unit_amount),
        productId,
        productName: lineItems[index].price_data.product_data.name,
      }))
      const orderData = {
        amount: dollars(lineItems.reduce((sum, item) => sum + item.price_data.unit_amount, 0)),
        buyerEmail,
        checkoutMode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        customerName,
        customerPhone,
        fulfillmentMethod,
        fulfillmentStatus,
        items: orderItems,
        productId: productIds[0],
        productName: orderItems[0].productName,
        reservationExpiresAt: provisionalExpiration,
        reservationProductIds: productIds,
        status: 'pending_payment',
        userId,
      }

      if (fulfillmentMethod === 'shipping') {
        orderData.shippingAddress = normalizedShippingAddress
      } else {
        orderData.pickupLocation = pickupLocation
        orderData.pickupStatus = pickupStatus
      }

      transaction.set(orderRef, orderData)
      productRefs.forEach((productRef) => {
        transaction.update(productRef, {
          reservationExpiresAt: provisionalExpiration,
          reservedBy: userId,
          reservedOrderId: orderRef.id,
          status: 'reserved',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })
    })
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || 'Could not reserve checkout inventory.' })
    return
  }

  const metadataPayload = {
    checkout_mode: checkoutMode,
    order_id: orderRef.id,
    user_id: userId,
    fulfillment_method: fulfillmentMethod,
    customer_name: customerName.substring(0, 100),
  }
  if (customerPhone) {
    metadataPayload.customer_phone = customerPhone.substring(0, 100)
  }

  let session
  try {
    session = await createCheckoutSession({
      agreementIds,
      buyerEmail,
      clientReferenceId: orderRef.id,
      expiresAt: stripeExpiresAt,
      idempotencyKey: `direct-checkout-${orderRef.id}`,
      items: lineItems,
      metadata: metadataPayload,
    })
  } catch (error) {
    await releaseDirectOrderReservations(orderRef.id, 'failed')
    sendJson(response, 503, { error: error.message || 'Could not create payment checkout.' })
    return
  }

  if (!Number.isInteger(session.expires_at)) {
    try {
      await getStripe().checkout.sessions.expire(session.id)
      await releaseDirectOrderReservations(orderRef.id, 'failed')
    } catch (cleanupError) {
      console.error(`Could not clean up Stripe session ${session.id} with an invalid expiration:`, cleanupError.message)
    }
    sendJson(response, 500, { error: 'Stripe Checkout did not return a valid expiration.' })
    return
  }

  const actualExpiration = admin.firestore.Timestamp.fromMillis(session.expires_at * 1000)
  try {
    await db.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef)
      const productSnapshots = []
      for (const productRef of productRefs) {
        productSnapshots.push(await transaction.get(productRef))
      }

      if (!orderSnapshot.exists || productSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new Error('Reserved checkout records could not be synchronized.')
      }
      if (productSnapshots.some((snapshot) => snapshot.data().reservedOrderId !== orderRef.id)) {
        throw new Error('Checkout reservation ownership changed before payment setup completed.')
      }

      transaction.update(orderRef, {
        reservationExpiresAt: actualExpiration,
        stripeCheckoutExpiresAt: actualExpiration,
        stripeCheckoutSessionId: session.id,
        stripeCheckoutUrl: session.url,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      productRefs.forEach((productRef) => {
        transaction.update(productRef, {
          reservationExpiresAt: actualExpiration,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })
    })
  } catch (error) {
    let stripeSessionExpired = false
    try {
      await getStripe().checkout.sessions.expire(session.id)
      stripeSessionExpired = true
    } catch (expireError) {
      console.error(`Could not expire Stripe session ${session.id} after reservation sync failure:`, expireError.message)
    }

    if (stripeSessionExpired) {
      await releaseDirectOrderReservations(orderRef.id, 'failed')
    }
    sendJson(response, 500, { error: error.message || 'Could not synchronize checkout reservation.' })
    return
  }

  sendJson(response, 200, { id: session.id, url: session.url })
}

export async function handleApproveBid(request, response) {
  const adminUser = await assertAdmin(request)
  const payload = body(request)
  const bidId = requiredString(payload, 'bid_id')
  const bidRef = db.collection('bids').doc(bidId)
  const orderRef = db.collection('orders').doc()
  let order = null
  let customerName = 'Collector'

  // Generate cryptographically random token and token hash
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  // Calculate payment deadline (default 48 hours)
  const BID_PAYMENT_DUE_HOURS = Number(process.env.BID_PAYMENT_DUE_HOURS) || 48
  const paymentDueAt = (admin.firestore.Timestamp && typeof admin.firestore.Timestamp.fromDate === 'function')
    ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + BID_PAYMENT_DUE_HOURS * 60 * 60 * 1000))
    : new Date(Date.now() + BID_PAYMENT_DUE_HOURS * 60 * 60 * 1000)

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
      currency: 'usd',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: adminUser.uid,
      bidId,
      productId: bid.productId,
      productName: bid.productName,
      status: 'awaiting_payment',
      userId: bid.userId || null,
      customerEmail: bid.buyerEmail,
      buyerEmail: bid.buyerEmail, // for backwards compatibility
      approvalEmailSent: false,
      fulfillmentMethod: 'pending_customer_selection',
      fulfillmentStatus: 'pending_selection',
      customerName: '',
      customerPhone: '',
      paymentDueAt,
      paymentLinkTokenHash: tokenHash,
      paymentLinkCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeCheckoutSessionId: null,
      stripeCheckoutUrl: null,
      stripeCheckoutExpiresAt: null,
      paymentLinkClicks: 0,
      lastPaymentLinkClickAt: null,
      failedTokenAttempts: 0,
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

  // Fetch customer's display name from their profile
  if (order.userId && !order.userId.startsWith('guest:')) {
    try {
      const userDoc = await db.collection('users').doc(order.userId).get()
      if (userDoc.exists) {
        customerName = userDoc.data().displayName || customerName
      }
    } catch (e) {
      console.error('Failed to get user name for bid approval:', e)
    }
  }

  // Update order's customerName in database
  await orderRef.update({ customerName })

  // Send email to bidder containing the secure internal payment link
  const sendInvoiceEmail = async () => {
    try {
      const orderSnap = await orderRef.get()
      if (orderSnap.exists && orderSnap.data().approvalEmailSent) {
        console.log(`Approval checkout email already sent for order ${orderRef.id}. Skipping.`)
        return
      }

      const appUrl = process.env.STRIPE_SUCCESS_URL 
        ? new URL(process.env.STRIPE_SUCCESS_URL).origin 
        : 'https://stockroomnj.com'

      const checkoutUrl = `${appUrl}/pay/approved-bid/${orderRef.id}?token=${rawToken}`

      await sendEmail({
        to: order.buyerEmail,
        category: 'checkout',
        templateName: 'bid_approved_checkout',
        data: { 
          customerName,
          productName: order.productName, 
          amount: order.amount, 
          checkoutUrl,
          paymentDueAt: typeof paymentDueAt.toDate === 'function' ? paymentDueAt.toDate().toLocaleString() : paymentDueAt.toLocaleString(),
        },
        metadata: { userId: order.userId, orderId: orderRef.id, bidId }
      })

      await orderRef.update({ approvalEmailSent: true })
    } catch (err) {
      console.error(`Failed to send bid approval checkout email to ${order.buyerEmail}:`, err)
    }
  }
  await sendInvoiceEmail()

  sendJson(response, 200, {
    order: {
      ...order,
      customerName,
      id: orderRef.id,
      stripeCheckoutUrl: null,
    },
  })
}

export async function handleUpdateShipping(request, response) {
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

  // Enforce original customer fulfillment selection unless explicit override is provided
  const originalMethod = orderData.fulfillmentMethod || 'shipping'
  if (shippingMethod !== originalMethod && !payload.explicit_override) {
    throw new Error(`Fulfillment method update (${shippingMethod}) contradicts original customer choice (${originalMethod}). Set explicit_override to bypass.`)
  }

  // Update order document
  const updateData = {
    shippingMethod,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    shippingUpdatedBy: adminUser.uid,
    shippingUpdateEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  if (shippingMethod === 'shipping') {
    updateData.carrier = carrier
    updateData.trackingNumber = trackingNumber
    updateData.shippingStatus = 'shipped'
    updateData.fulfillmentStatus = 'shipped'
  } else {
    updateData.pickupInstructions = pickupInstructions
    updateData.shippingStatus = 'ready_for_pickup'
    updateData.fulfillmentStatus = 'ready_for_pickup'
  }

  await orderRef.update(updateData)

  // Send update email safely
  try {
    const itemsList = orderData.items || []
    await sendEmail({
      to: orderData.buyerEmail,
      category: 'shipping',
      templateName: 'shipping_or_pickup',
      data: {
        orderId,
        customerName: orderData.customerName || 'Collector',
        productName: orderData.productName || 'Your Item',
        items: itemsList,
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

async function assertOrderRequest(request, orderRef, orderData, payload = {}) {
  if (orderData.bidId) {
    if ((orderData.failedTokenAttempts || 0) >= 5) {
      throw requestError('Too many failed payment link attempts. Please contact support.', 429)
    }
    const token = String(payload.token || '').trim()
    const tokenHash = token ? crypto.createHash('sha256').update(token).digest('hex') : ''
    if (!tokenHash || tokenHash !== orderData.paymentLinkTokenHash) {
      if ((orderData.failedTokenAttempts || 0) < 5) {
        await orderRef.update({ failedTokenAttempts: admin.firestore.FieldValue.increment(1) })
      }
      throw requestError('Invalid payment link token.', 401)
    }
    return
  }

  if (orderData.userId?.startsWith('guest:')) {
    const guestToken = payload.guest_token || request.headers['x-guest-token']
    if (!verifyGuestSession(orderData.userId, orderData.buyerEmail, guestToken)) {
      throw requestError('Invalid or missing guest session token.', 401)
    }
    return
  }

  await assertUserRequest(request, orderData.userId)
}

export async function handleGetOrderDetails(request, response) {
  const orderId = String(request.query.order_id || '').trim()

  if (!orderId) {
    sendJson(response, 400, { error: 'order_id is required.' })
    return
  }

  const orderRef = db.collection('orders').doc(orderId)
  const orderSnap = await orderRef.get()

  if (!orderSnap.exists) {
    sendJson(response, 404, { error: 'Order not found.' })
    return
  }

  const order = orderSnap.data()
  try {
    await assertOrderRequest(request, orderRef, order, request.query)
  } catch (error) {
    sendJson(response, error.status || 401, { error: error.message || 'Order authorization failed.' })
    return
  }

  sendJson(response, 200, {
    id: orderSnap.id,
    amount: order.amount,
    buyerEmail: order.buyerEmail,
    productName: order.productName,
    items: order.items || [],
    fulfillmentMethod: order.fulfillmentMethod || 'pending_customer_selection',
    fulfillmentStatus: order.fulfillmentStatus || 'pending',
    status: order.status,
    checkoutMode: order.checkoutMode || 'guest',
    stripeCheckoutUrl: order.stripeCheckoutUrl || '',
  })
}

export async function handleSelectFulfillment(request, response) {
  const payload = body(request)
  const orderId = requiredString(payload, 'order_id')
  const fulfillmentMethod = requiredString(payload, 'fulfillment_method')
  const customerName = requiredString(payload, 'customer_name')
  const customerPhone = (payload.customer_phone || '').trim()

  if (!['pickup', 'shipping'].includes(fulfillmentMethod)) {
    sendJson(response, 400, { error: 'fulfillment_method must be pickup or shipping.' })
    return
  }

  const orderRef = db.collection('orders').doc(orderId)
  const orderSnap = await orderRef.get()

  if (!orderSnap.exists) {
    sendJson(response, 404, { error: 'Order not found.' })
    return
  }

  const orderData = orderSnap.data()
  try {
    await assertOrderRequest(request, orderRef, orderData, payload)
  } catch (error) {
    sendJson(response, error.status || 401, { error: error.message || 'Order authorization failed.' })
    return
  }

  if (orderData.status !== 'approved_awaiting_payment' && orderData.status !== 'awaiting_payment' && orderData.status !== 'paid_pending_fulfillment' && orderData.status !== 'pending_payment') {
    sendJson(response, 400, { error: `Order fulfillment cannot be modified in status: ${orderData.status}` })
    return
  }

  const updatePayload = {
    fulfillmentMethod,
    customerName,
    customerPhone,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  if (fulfillmentMethod === 'shipping') {
    const shipping_address = payload.shipping_address || {}
    const normalizedShippingAddress = {
      fullName: requiredString(shipping_address, 'full_name'),
      street: requiredString(shipping_address, 'street'),
      city: requiredString(shipping_address, 'city'),
      state: requiredString(shipping_address, 'state'),
      zip: requiredString(shipping_address, 'zip'),
      country: requiredString(shipping_address, 'country'),
      phone: (shipping_address.phone || '').trim(),
    }
    updatePayload.shippingAddress = normalizedShippingAddress
    updatePayload.fulfillmentStatus = 'pending'
  } else {
    updatePayload.pickupLocation = '66 Union Blvd, Wallington, NJ 07057'
    updatePayload.pickupStatus = 'pending_ready'
    updatePayload.fulfillmentStatus = 'pending_ready'
  }

  // If the status is 'paid_pending_fulfillment', we can now transition it to 'paid' and send the confirmation email!
  let shouldSendEmail = false
  if (orderData.status === 'paid_pending_fulfillment') {
    updatePayload.status = 'paid'
    updatePayload.confirmationEmailSent = true
    shouldSendEmail = true
  }

  // If order is awaiting payment and is a bid order, verify/refresh Stripe session
  if (orderData.status === 'awaiting_payment' || orderData.status === 'approved_awaiting_payment') {
    if (orderData.paymentDueAt) {
      const dueMillis = orderData.paymentDueAt.toDate().getTime()
      if (Date.now() >= dueMillis) {
        sendJson(response, 400, { error: 'The 48-hour payment window for this approved bid has expired. Please contact support.' })
        return
      }
      if (dueMillis - Date.now() < 30 * 60 * 1000) {
        sendJson(response, 400, { error: 'This payment link has expired or is too close to the deadline. Please contact support.' })
        return
      }
    }

    const stripe = getStripe()
    if (!stripe) {
      sendJson(response, 500, { error: 'Stripe is not configured.' })
      return
    }

    let session = null
    if (orderData.stripeCheckoutSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(orderData.stripeCheckoutSessionId)
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (existingSession && existingSession.status === 'open' && existingSession.expires_at > nowSeconds + 60) {
          session = existingSession
        }
      } catch (err) {
        console.log('Failed to retrieve existing checkout session in selectFulfillment:', err.message)
      }
    }

    if (!session) {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const paymentDueSeconds = orderData.paymentDueAt ? Math.floor(orderData.paymentDueAt.toDate().getTime() / 1000) : nowSeconds + 24 * 60 * 60
      const maxSessionSeconds = 24 * 60 * 60
      const minSessionSeconds = 30 * 60

      let expiresAt = nowSeconds + maxSessionSeconds
      if (expiresAt > paymentDueSeconds) {
        expiresAt = paymentDueSeconds
      }

      if (expiresAt < nowSeconds + minSessionSeconds) {
        sendJson(response, 400, { error: 'Payment deadline is too close or has passed. Please contact support.' })
        return
      }

      const appUrl = process.env.STRIPE_SUCCESS_URL 
        ? new URL(process.env.STRIPE_SUCCESS_URL).origin 
        : 'https://stockroomnj.com'

      const cancelUrl = process.env.STRIPE_CANCEL_URL || `${appUrl}/shop?checkout=cancel`
      const successUrl = process.env.STRIPE_SUCCESS_URL || `${appUrl}/shop?checkout=success`

      const sessionPayload = {
        cancel_url: cancelUrl,
        customer_email: orderData.buyerEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: orderData.productName,
              },
              unit_amount: cents(orderData.amount),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        client_reference_id: orderId,
        expires_at: expiresAt,
        metadata: {
          orderId: orderId,
          bidId: orderData.bidId || '',
          productId: orderData.productId || '',
          checkoutMode: 'approved_bid',
          fulfillment_method: fulfillmentMethod,
        },
        payment_intent_data: {
          metadata: {
            order_id: orderId,
          },
        },
        after_expiration: {
          recovery: {
            enabled: true,
          },
        },
      }

      session = await stripe.checkout.sessions.create(sessionPayload)
    }

    if (session) {
      updatePayload.stripeCheckoutSessionId = session.id
      updatePayload.stripeCheckoutUrl = session.url
      updatePayload.stripeCheckoutExpiresAt = admin.firestore.Timestamp.fromMillis(session.expires_at * 1000)
    }
  }

  await orderRef.update(updatePayload)

  if (shouldSendEmail) {
    try {
      const itemsList = orderData.items || []
      await sendEmail({
        to: orderData.buyerEmail,
        category: 'orders',
        templateName: 'order_confirmed',
        data: {
          orderId,
          customerName,
          productName: orderData.productName,
          amount: orderData.amount,
          items: itemsList,
          fulfillmentMethod,
          shippingAddress: updatePayload.shippingAddress || null,
          pickupLocation: updatePayload.pickupLocation || null,
          pickupInstructions: '',
        },
        metadata: {
          userId: orderData.userId,
          orderId,
          productId: orderData.productId || null,
          bidId: orderData.bidId || null,
        }
      })
    } catch (err) {
      console.error(`Failed to send order confirmation email for order ${orderId}:`, err)
    }
  }

  sendJson(response, 200, {
    success: true,
    alreadyPaid: orderData.status === 'paid_pending_fulfillment',
    stripeCheckoutUrl: updatePayload.stripeCheckoutUrl || orderData.stripeCheckoutUrl || '',
  })
}

export async function finalizeOrderPayment(orderId, paymentIntentId, session) {
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

    if (!['awaiting_payment', 'pending_payment', 'approved_awaiting_payment'].includes(orderData.status)) {
      throw new Error(`Order is not in an awaiting payment status. Current status: ${orderData.status}`)
    }

    if (session) {
      const sessionAmount = session.amount_total ? dollars(session.amount_total) : 0
      const sessionCurrency = (session.currency || '').toLowerCase()
      const expectedAmount = Number(orderData.amount) || 0
      const expectedCurrency = (orderData.currency || 'usd').toLowerCase()

      if (Math.abs(sessionAmount - expectedAmount) > 0.01) {
        throw new Error(`Amount mismatch: Stripe session has ${sessionAmount}, order has ${expectedAmount}`)
      }
      if (sessionCurrency !== expectedCurrency) {
        throw new Error(`Currency mismatch: Stripe session has ${sessionCurrency}, order has ${expectedCurrency}`)
      }
    }

    const productIds = Array.isArray(orderData.items) && orderData.items.length > 0
      ? orderData.items.map((item) => item.productId)
      : [orderData.productId].filter(Boolean)
    const productRefs = productIds.map((productId) => db.collection('products').doc(productId))
    const productSnapshots = []
    for (const productRef of productRefs) {
      productSnapshots.push(await transaction.get(productRef))
    }

    if (productSnapshots.some((productSnapshot) => !productSnapshot.exists)) {
      throw new Error('A product in this order was not found.')
    }

    if (orderData.bidId) {
      const product = productSnapshots[0]?.data()
      if (!product || product.auctionStatus !== 'approved_awaiting_payment') {
        throw new Error('Product is no longer reserved for this approved bid.')
      }
    } else if (productSnapshots.some((productSnapshot) => {
      const product = productSnapshot.data()
      return product.status !== 'reserved' || product.reservedOrderId !== orderId
    })) {
      throw new Error('One or more products are no longer reserved for this order.')
    }

    if (orderData.fulfillmentMethod === 'pending_customer_selection') {
      transaction.update(orderRef, {
        status: 'paid_pending_fulfillment',
        paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        stripePaymentIntentId: paymentIntentId || orderData.stripePaymentIntentId || '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      // Do NOT send confirmation email yet
      return
    }

    transaction.update(orderRef, {
      status: 'paid',
      confirmationEmailSent: true,
      paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      reservationExpiresAt: admin.firestore.FieldValue.delete(),
      stripePaymentIntentId: paymentIntentId || orderData.stripePaymentIntentId || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Mark products as sold
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const productRef of productRefs) {
        transaction.update(productRef, {
          ...(!orderData.bidId ? clearedReservationFields() : {}),
          status: 'sold',
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    } else if (orderData.productId) {
      const updatePayload = {
        ...(!orderData.bidId ? clearedReservationFields() : {}),
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
  if (shouldSendEmail && orderData && orderData.fulfillmentMethod !== 'pending_customer_selection') {
    try {
      const itemsList = orderData.items || []
      await sendEmail({
        to: orderData.buyerEmail,
        category: 'orders',
        templateName: 'order_confirmed',
        data: {
          orderId,
          customerName: orderData.customerName || 'Collector',
          productName: orderData.productName,
          amount: orderData.amount,
          items: itemsList,
          fulfillmentMethod: orderData.fulfillmentMethod,
          shippingAddress: orderData.shippingAddress || null,
          pickupLocation: orderData.pickupLocation || null,
          pickupInstructions: '',
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

async function handleOrderPaymentFailed(orderId, isExpiration, isTerminal = false) {
  if (!orderId) return
  const orderRef = db.collection('orders').doc(orderId)
  const existingOrder = await orderRef.get()

  if (!existingOrder.exists) {
    console.log(`Order ${orderId} does not exist for failure update.`)
    return
  }

  const existingOrderData = existingOrder.data()
  if (!existingOrderData.bidId) {
    if (isExpiration || isTerminal) {
      await releaseDirectOrderReservations(orderId, isExpiration ? 'expired' : 'failed')
    } else {
      console.log(`Direct order ${orderId} payment attempt failed; reservation remains until Checkout expires.`)
    }
    return
  }

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
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.payment_status === 'paid') {
          const orderId = session.client_reference_id || session.metadata?.order_id || session.metadata?.orderId
          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id
          await finalizeOrderPayment(orderId, paymentIntentId, session)
        } else {
          console.log(`Checkout session completed but payment_status is ${session.payment_status}`)
        }
        break
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object
        const orderId = session.client_reference_id || session.metadata?.order_id || session.metadata?.orderId
        await handleOrderPaymentFailed(orderId, false, true)
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

export async function releaseExpiredReservationsHandler() {
  const now = admin.firestore.Timestamp.now()
  const expiredOrders = await db.collection('orders')
    .where('reservationExpiresAt', '<=', now)
    .limit(100)
    .get()
  const stripe = getStripe()

  for (const orderSnapshot of expiredOrders.docs) {
    const order = orderSnapshot.data()
    if (order.bidId || order.status !== 'pending_payment') continue

    if (!order.stripeCheckoutSessionId) {
      await releaseDirectOrderReservations(orderSnapshot.id, 'expired')
      continue
    }

    if (!stripe) {
      console.error(`Stripe is not configured; leaving reservation ${orderSnapshot.id} intact.`)
      continue
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId)

      if (session.status === 'complete' && session.payment_status === 'paid') {
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id
        await finalizeOrderPayment(orderSnapshot.id, paymentIntentId, session)
      } else if (session.status === 'expired') {
        await releaseDirectOrderReservations(orderSnapshot.id, 'expired')
      } else if (session.status === 'open') {
        await stripe.checkout.sessions.expire(session.id)
        await releaseDirectOrderReservations(orderSnapshot.id, 'expired')
      }
      // Completed sessions with a pending asynchronous payment remain reserved.
    } catch (error) {
      console.error(`Could not reconcile expired reservation ${orderSnapshot.id}:`, error.message)
    }
  }

  const expiredRateLimits = await db.collection('rate_limits')
    .where('expiresAt', '<=', now)
    .limit(400)
    .get()

  if (!expiredRateLimits.empty) {
    const batch = db.batch()
    expiredRateLimits.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
  }
}

export const releaseExpiredReservations = onSchedule({
  schedule: 'every 5 minutes',
  secrets: ['STRIPE_SECRET_KEY'],
}, releaseExpiredReservationsHandler)

async function getAndValidateApprovedBidOrder(orderId, token) {
  if (!orderId || !token) {
    throw new Error('Order ID and token are required.')
  }

  const orderRef = db.collection('orders').doc(orderId)
  const orderSnap = await orderRef.get()

  if (!orderSnap.exists) {
    throw new Error('Order not found.')
  }

  const orderData = orderSnap.data()

  if (!orderData.bidId) {
    throw new Error('This order is not associated with an approved bid.')
  }

  if ((orderData.failedTokenAttempts || 0) >= 5) {
    throw new Error('Too many failed payment attempts. Please contact support.')
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  if (orderData.paymentLinkTokenHash !== tokenHash) {
    await orderRef.update({
      failedTokenAttempts: admin.firestore.FieldValue.increment(1)
    })
    throw new Error('Invalid payment link token.')
  }

  return { orderRef, orderData }
}

export async function handleGetApprovedBidDetails(request, response) {
  const payload = body(request)
  const orderId = requiredString(payload, 'order_id')
  const token = requiredString(payload, 'token')

  const { orderRef, orderData } = await getAndValidateApprovedBidOrder(orderId, token)

  await orderRef.update({
    paymentLinkClicks: admin.firestore.FieldValue.increment(1),
    lastPaymentLinkClickAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  let currentStatus = orderData.status
  let currentPaymentDueAt = orderData.paymentDueAt

  if (currentStatus === 'awaiting_payment' && currentPaymentDueAt && currentPaymentDueAt.toMillis() < Date.now()) {
    await db.runTransaction(async (transaction) => {
      transaction.update(orderRef, {
        status: 'expired',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

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

    currentStatus = 'expired'
  }

  sendJson(response, 200, {
    id: orderId,
    amount: orderData.amount,
    currency: orderData.currency || 'usd',
    buyerEmail: orderData.buyerEmail,
    productName: orderData.productName,
    status: currentStatus,
    paymentDueAt: currentPaymentDueAt ? currentPaymentDueAt.toMillis() : null,
    fulfillmentMethod: orderData.fulfillmentMethod || 'pending_customer_selection',
    customerName: orderData.customerName || '',
    customerPhone: orderData.customerPhone || '',
    shippingAddress: orderData.shippingAddress || null,
  })
}

export async function handleApprovedBidCheckout(request, response) {
  const payload = body(request)
  const orderId = requiredString(payload, 'order_id')
  const token = requiredString(payload, 'token')

  const { orderRef, orderData } = await getAndValidateApprovedBidOrder(orderId, token)

  if (orderData.status === 'paid' || orderData.status === 'paid_pending_fulfillment') {
    sendJson(response, 200, { status: 'paid', url: orderData.stripeCheckoutUrl || '' })
    return
  }

  if (['cancelled', 'expired', 'refunded'].includes(orderData.status)) {
    sendJson(response, 400, { error: `Cannot pay for order in status: ${orderData.status}` })
    return
  }

  if (orderData.paymentDueAt && orderData.paymentDueAt.toMillis() < Date.now()) {
    await db.runTransaction(async (transaction) => {
      transaction.update(orderRef, {
        status: 'expired',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
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
    sendJson(response, 400, { error: 'The payment link has expired.' })
    return
  }

  const productSnap = await db.collection('products').doc(orderData.productId).get()
  if (!productSnap.exists) {
    sendJson(response, 404, { error: 'Product not found.' })
    return
  }
  const productData = productSnap.data()
  if (productData.status === 'sold' || productData.auctionStatus !== 'approved_awaiting_payment') {
    sendJson(response, 400, { error: 'This item is no longer available.' })
    return
  }

  let updatedFulfillmentMethod = orderData.fulfillmentMethod
  const reqFulfillmentMethod = payload.fulfillment_method

  if (orderData.fulfillmentMethod === 'pending_customer_selection') {
    if (!reqFulfillmentMethod) {
      sendJson(response, 400, { error: 'fulfillment_required', message: 'Fulfillment preference is required.' })
      return
    }

    if (!['pickup', 'shipping'].includes(reqFulfillmentMethod)) {
      sendJson(response, 400, { error: 'Fulfillment method must be pickup or shipping.' })
      return
    }

    const customerName = requiredString(payload, 'customer_name')
    const customerPhone = (payload.customer_phone || '').trim()

    const updatePayload = {
      fulfillmentMethod: reqFulfillmentMethod,
      customerName,
      customerPhone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    if (reqFulfillmentMethod === 'shipping') {
      const shipping_address = payload.shipping_address || {}
      const normalizedShippingAddress = {
        fullName: requiredString(shipping_address, 'full_name'),
        street: requiredString(shipping_address, 'street'),
        city: requiredString(shipping_address, 'city'),
        state: requiredString(shipping_address, 'state'),
        zip: requiredString(shipping_address, 'zip'),
        country: requiredString(shipping_address, 'country'),
        phone: (shipping_address.phone || '').trim(),
      }
      updatePayload.shippingAddress = normalizedShippingAddress
      updatePayload.fulfillmentStatus = 'pending'
    } else {
      updatePayload.pickupLocation = '66 Union Blvd, Wallington, NJ 07057'
      updatePayload.pickupStatus = 'pending_ready'
      updatePayload.fulfillmentStatus = 'pending_ready'
    }

    await orderRef.update(updatePayload)
    updatedFulfillmentMethod = reqFulfillmentMethod
  }

  const stripe = getStripe()
  if (!stripe) {
    sendJson(response, 500, { error: 'Stripe is not configured.' })
    return
  }

  let session = null
  if (orderData.stripeCheckoutSessionId) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(orderData.stripeCheckoutSessionId)
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (existingSession && existingSession.status === 'open' && existingSession.expires_at > nowSeconds + 60) {
        session = existingSession
      }
    } catch (err) {
      console.log('Failed to retrieve existing checkout session:', err.message)
    }
  }

  if (!session) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const paymentDueSeconds = Math.floor(orderData.paymentDueAt.toMillis() / 1000)
    const maxSessionSeconds = 24 * 60 * 60
    const minSessionSeconds = 30 * 60

    let expiresAt = nowSeconds + maxSessionSeconds
    if (expiresAt > paymentDueSeconds) {
      expiresAt = paymentDueSeconds
    }

    if (expiresAt < nowSeconds + minSessionSeconds) {
      sendJson(response, 400, { error: 'Payment deadline is too close or has passed. Please contact support.' })
      return
    }

    const appUrl = process.env.STRIPE_SUCCESS_URL 
      ? new URL(process.env.STRIPE_SUCCESS_URL).origin 
      : 'https://stockroomnj.com'

    const sessionPayload = {
      cancel_url: `${appUrl}/pay/approved-bid/${orderId}?token=${token}&checkout=cancel`,
      customer_email: orderData.buyerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: orderData.productName,
            },
            unit_amount: cents(orderData.amount),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appUrl}/pay/approved-bid/${orderId}?token=${token}&checkout=success`,
      client_reference_id: orderId,
      expires_at: expiresAt,
      metadata: {
        orderId: orderId,
        bidId: orderData.bidId,
        productId: orderData.productId,
        checkoutMode: 'approved_bid',
        fulfillment_method: updatedFulfillmentMethod,
      },
      payment_intent_data: {
        metadata: {
          order_id: orderId,
        },
      },
      after_expiration: {
        recovery: {
          enabled: true,
        },
      },
    }

    session = await stripe.checkout.sessions.create(sessionPayload)

    await orderRef.update({
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url,
      stripeCheckoutExpiresAt: admin.firestore.Timestamp.fromMillis(session.expires_at * 1000),
      lastPaymentSessionCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  sendJson(response, 200, { url: session.url })
}

export async function handleExtendDeadline(request, response) {
  const adminUser = await assertAdmin(request)
  const payload = body(request)
  const orderId = requiredString(payload, 'order_id')
  const extendHours = Number(payload.extend_hours) || 48
  const reason = payload.reason || 'Admin extension'

  if (extendHours <= 0) {
    sendJson(response, 400, { error: 'extend_hours must be positive.' })
    return
  }

  const orderRef = db.collection('orders').doc(orderId)
  let orderData = null
  let rawToken = null
  let tokenHash = null
  let customerName = 'Collector'
  const now = admin.firestore.Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef)
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} not found.`)
    }

    orderData = orderSnap.data()
    if (!orderData.bidId) {
      throw new Error('This order is not associated with an approved bid.')
    }
    if (['paid', 'refunded', 'cancelled'].includes(orderData.status)) {
      throw new Error(`Cannot extend deadline for order in status: ${orderData.status}`)
    }

    rawToken = crypto.randomBytes(32).toString('hex')
    tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const oldDeadline = orderData.paymentDueAt || null
    const newPaymentDueAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + extendHours * 60 * 60 * 1000))

    transaction.update(orderRef, {
      status: 'awaiting_payment',
      paymentDueAt: newPaymentDueAt,
      paymentLinkTokenHash: tokenHash,
      paymentLinkCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeCheckoutSessionId: null,
      stripeCheckoutUrl: null,
      stripeCheckoutExpiresAt: null,
      failedTokenAttempts: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const bidRef = db.collection('bids').doc(orderData.bidId)
    transaction.update(bidRef, {
      status: 'approved_awaiting_payment',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const productRef = db.collection('products').doc(orderData.productId)
    transaction.update(productRef, {
      auctionStatus: 'approved_awaiting_payment',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Log the deadline extension
    const extensionLogRef = db.collection('deadline_extensions').doc()
    transaction.set(extensionLogRef, {
      orderId,
      oldDeadline,
      newDeadline: newPaymentDueAt,
      adminUser: adminUser.uid,
      reason,
      timestamp: now,
    })
  })

  if (orderData.userId && !orderData.userId.startsWith('guest:')) {
    try {
      const userDoc = await db.collection('users').doc(orderData.userId).get()
      if (userDoc.exists) {
        customerName = userDoc.data().displayName || customerName
      }
    } catch (e) {
      console.error('Failed to get user name for bid approval:', e)
    }
  }

  const appUrl = process.env.STRIPE_SUCCESS_URL 
    ? new URL(process.env.STRIPE_SUCCESS_URL).origin 
    : 'https://stockroomnj.com'

  const checkoutUrl = `${appUrl}/pay/approved-bid/${orderId}?token=${rawToken}`

  await sendEmail({
    to: orderData.buyerEmail,
    category: 'checkout',
    templateName: 'bid_approved_checkout',
    data: { 
      customerName,
      productName: orderData.productName, 
      amount: orderData.amount, 
      checkoutUrl,
      paymentDueAt: new Date(Date.now() + extendHours * 60 * 60 * 1000).toLocaleString(),
    },
    metadata: { userId: orderData.userId, orderId, bidId: orderData.bidId }
  })

  sendJson(response, 200, { success: true, orderId })
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
  'GET /api/orders/details': handleGetOrderDetails,
  'POST /api/orders/select-fulfillment': handleSelectFulfillment,
  'POST /api/pay/approved-bid/details': handleGetApprovedBidDetails,
  'POST /api/pay/approved-bid/checkout': handleApprovedBidCheckout,
  'POST /api/admin/orders/extend-deadline': handleExtendDeadline,
}

// Note: EMAIL_FROM and EMAIL_REPLY_TO are normal runtime env vars,
// while API keys and tokens are secure secrets.
export async function handleApiRequest(request, response) {
  const corsAllowed = applyCors(request, response)

  if (!corsAllowed) {
    response.status(403).send('Forbidden: CORS origin not allowed.')
    return
  }

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
    sendJson(response, error.status || 400, { error: error.message || 'Request failed.' })
  }
}

export const api = onRequest({
  secrets: ['GUEST_TOKEN_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'POSTMARK_SERVER_TOKEN']
}, handleApiRequest)

// Note: EMAIL_FROM and EMAIL_REPLY_TO are normal runtime env vars,
// while API keys and tokens are secure secrets.
export const onUserCreated = onDocumentCreated(
  {
    document: 'users/{uid}',
    secrets: ['POSTMARK_SERVER_TOKEN'],
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

// Note: EMAIL_FROM and EMAIL_REPLY_TO are normal runtime env vars,
// while API keys and tokens are secure secrets.
export const onUserDeleted = onDocumentDeleted(
  {
    document: 'users/{uid}',
    secrets: ['POSTMARK_SERVER_TOKEN'],
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
