/* eslint-disable no-undef */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import admin from 'firebase-admin'
import crypto from 'node:crypto'
import { sendEmail } from '../functions/email/index.js'
import {
  handleApproveBid,
  handleGetApprovedBidDetails,
  handleApprovedBidCheckout,
  finalizeOrderPayment,
} from '../functions/index.js'

// Setup Stripe env vars
process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
process.env.STRIPE_SUCCESS_URL = 'https://stockroomnj.com/shop?checkout=success'

// Mock firebase-admin (hoisted)
vi.mock('firebase-admin', () => {
  let mockDbState = {}
  const mockDocSet = vi.fn()
  const mockDocUpdate = vi.fn()

  const resetDb = () => {
    mockDbState = {
      admins: {
        'admin-uid': { enabled: true },
      },
      products: {
        'prod_123': { name: 'Test Product', status: 'published', price: 10.0, saleMode: 'auction', auctionStatus: 'approved_awaiting_payment' },
      },
      bids: {
        'bid_winning': { amount: 100, buyerEmail: 'winner@example.com', productId: 'prod_123', productName: 'Bid Item', status: 'pending_admin_approval', userId: 'test-user-uid' },
      },
      orders: {},
      users: {
        'test-user-uid': { displayName: 'Test User', email: 'test@example.com' },
      },
    }
  }

  const makeDocRef = (col, id) => {
    return {
      id,
      get: vi.fn(() => {
        const data = mockDbState[col]?.[id]
        if (data !== undefined) {
          return Promise.resolve({
            id,
            exists: true,
            data: () => data,
          })
        }
        return Promise.resolve({
          id,
          exists: false,
          data: () => null,
        })
      }),
      set: vi.fn((data) => {
        if (!mockDbState[col]) mockDbState[col] = {}
        mockDbState[col][id] = data
        mockDocSet(data)
        return Promise.resolve()
      }),
      update: vi.fn((data) => {
        if (!mockDbState[col]) mockDbState[col] = {}
        mockDbState[col][id] = { ...mockDbState[col][id], ...data }
        mockDocUpdate(data)
        return Promise.resolve()
      }),
    }
  }

  const makeCollectionRef = (col) => {
    return {
      doc: vi.fn((id) => makeDocRef(col, id || `auto-id-${Math.random()}`)),
      get: vi.fn(() => {
        const colData = mockDbState[col] || {}
        const docs = Object.keys(colData).map((id) => ({
          id,
          exists: true,
          data: () => colData[id],
        }))
        return Promise.resolve({
          empty: docs.length === 0,
          docs,
        })
      }),
      where: vi.fn(function () { return this }),
      limit: vi.fn(function () { return this }),
    }
  }

  const mockFirestore = {
    collection: vi.fn((col) => makeCollectionRef(col)),
    doc: vi.fn((path) => {
      const [col, id] = path.split('/')
      return makeDocRef(col, id)
    }),
    runTransaction: vi.fn(async (callback) => {
      return callback({
        get: vi.fn((docRef) => docRef.get()),
        set: vi.fn((docRef, data) => docRef.set(data)),
        update: vi.fn((docRef, data) => docRef.update(data)),
      })
    }),
  }

  const mockAuth = {
    verifyIdToken: vi.fn(() => Promise.resolve({ uid: 'admin-uid' })),
  }

  const mockAdmin = {
    initializeApp: vi.fn(),
    firestore: Object.assign(() => mockFirestore, {
      FieldValue: {
        serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
        increment: (val) => val,
      },
      Timestamp: {
        now: () => {
          return { toMillis: () => Date.now(), toDate: () => new Date() }
        },
        fromDate: (date) => {
          return { toMillis: () => date.getTime(), toDate: () => date }
        },
        fromMillis: (ms) => {
          return { toMillis: () => ms, toDate: () => new Date(ms) }
        },
      },
    }),
    auth: () => mockAuth,
    getDbState: () => mockDbState,
    resetDb,
    mockDocSet,
    mockDocUpdate,
  }

  return { default: mockAdmin }
})

// Mock Stripe API correctly as a class
const mockStripeCreate = vi.fn()
const mockStripeRetrieve = vi.fn()

vi.mock('stripe', () => {
  class MockStripe {
    constructor(key) {
      this.key = key
      this.checkout = {
        sessions: {
          create: mockStripeCreate,
          retrieve: mockStripeRetrieve,
        }
      }
    }
  }
  return { default: MockStripe }
})

// Mock Email sending module
vi.mock('../functions/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('log_id_123'),
}))

describe('Secure Approved Bid Payment Flow', () => {
  let mockResponse

  beforeEach(() => {
    admin.resetDb()
    vi.clearAllMocks()
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    }
  })

  it('email uses internal payment link, not raw Stripe checkout URL', async () => {
    const mockRequest = {
      method: 'POST',
      body: { bid_id: 'bid_winning' },
      headers: { authorization: 'Bearer admin-token' }
    }

    await handleApproveBid(mockRequest, mockResponse)
    expect(mockResponse.status).toHaveBeenCalledWith(200)

    // Verify email is sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const emailCall = sendEmail.mock.calls[0][0]
    expect(emailCall.templateName).toBe('bid_approved_checkout')
    
    // Email checkoutUrl should be the internal payment page, not Stripe
    expect(emailCall.data.checkoutUrl).toContain('/pay/approved-bid/')
    expect(emailCall.data.stripeCheckoutUrl).toBeUndefined()
  })

  it('token hash is used, not plaintext token in database', async () => {
    const mockRequest = {
      method: 'POST',
      body: { bid_id: 'bid_winning' },
      headers: { authorization: 'Bearer admin-token' }
    }

    await handleApproveBid(mockRequest, mockResponse)
    const dbState = admin.getDbState()
    const orders = dbState.orders
    const orderId = Object.keys(orders)[0]
    const order = orders[orderId]

    expect(order.paymentLinkTokenHash).toBeDefined()
    // The stored value must be a 64-character hex hash (sha256)
    expect(order.paymentLinkTokenHash).toHaveLength(64)

    // Retrieve rawToken from the email mock to verify it matches
    const emailCall = sendEmail.mock.calls[0][0]
    const url = new URL(emailCall.data.checkoutUrl)
    const rawToken = url.searchParams.get('token')
    expect(rawToken).toBeDefined()

    // Hash rawToken and it should match stored hash
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    expect(hash).toBe(order.paymentLinkTokenHash)
  })

  it('invalid token is rejected', async () => {
    // Seed an order with a token
    const rawToken = 'secretToken123'
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    
    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'awaiting_payment',
      bidId: 'bid_winning',
      paymentLinkTokenHash: tokenHash,
      failedTokenAttempts: 0,
    }

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_secure_123',
        token: 'wrongToken',
      }
    }

    await expect(handleGetApprovedBidDetails(mockRequest, mockResponse)).rejects.toThrow(
      /Invalid payment link token/
    )

    // Check failed attempts incremented
    const order = admin.getDbState().orders['order_secure_123']
    expect(order.failedTokenAttempts).toBe(1)
  })

  it('expired Stripe session creates a fresh session if paymentDueAt is still valid', async () => {
    const rawToken = 'secretToken123'
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const futureDue = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    const pastExpires = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10000))

    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'awaiting_payment',
      bidId: 'bid_winning',
      paymentLinkTokenHash: tokenHash,
      paymentDueAt: futureDue,
      stripeCheckoutSessionId: 'sess_expired',
      stripeCheckoutExpiresAt: pastExpires,
    }

    // Stripe retrieve returns expired
    mockStripeRetrieve.mockResolvedValueOnce({
      id: 'sess_expired',
      status: 'expired',
      expires_at: Math.floor(Date.now() / 1000) - 10,
    })

    // Stripe create creates fresh session
    mockStripeCreate.mockResolvedValueOnce({
      id: 'sess_fresh',
      url: 'https://checkout.stripe.com/sess_fresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_secure_123',
        token: rawToken,
      }
    }

    await handleApprovedBidCheckout(mockRequest, mockResponse)
    
    expect(mockStripeRetrieve).toHaveBeenCalledWith('sess_expired')
    expect(mockStripeCreate).toHaveBeenCalled()
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://checkout.stripe.com/sess_fresh'
    }))

    const order = admin.getDbState().orders['order_secure_123']
    expect(order.stripeCheckoutSessionId).toBe('sess_fresh')
  })

  it('expired order does not create a new Stripe session', async () => {
    const rawToken = 'secretToken123'
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const pastDue = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 20000))

    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'awaiting_payment',
      bidId: 'bid_winning',
      paymentLinkTokenHash: tokenHash,
      paymentDueAt: pastDue,
    }

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_secure_123',
        token: rawToken,
      }
    }

    await handleApprovedBidCheckout(mockRequest, mockResponse)
    expect(mockResponse.status).toHaveBeenCalledWith(400)
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'The payment link has expired.'
    }))

    const order = admin.getDbState().orders['order_secure_123']
    expect(order.status).toBe('expired')
    expect(mockStripeCreate).not.toHaveBeenCalled()
  })

  it('paid order does not create a new Stripe session', async () => {
    const rawToken = 'secretToken123'
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const futureDue = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))

    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'paid',
      bidId: 'bid_winning',
      paymentLinkTokenHash: tokenHash,
      paymentDueAt: futureDue,
      stripeCheckoutUrl: 'https://checkout.stripe.com/sess_already_paid',
    }

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_secure_123',
        token: rawToken,
      }
    }

    await handleApprovedBidCheckout(mockRequest, mockResponse)
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'paid',
      url: 'https://checkout.stripe.com/sess_already_paid'
    }))
    expect(mockStripeCreate).not.toHaveBeenCalled()
  })

  it('webhook finalizes payment once (idempotently)', async () => {
    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'awaiting_payment',
      currency: 'usd',
      bidId: 'bid_winning',
    }

    // Call webhook payment completion
    const stripeSessionMock = {
      amount_total: 10000,
      currency: 'usd',
    }

    await finalizeOrderPayment('order_secure_123', 'pi_mock', stripeSessionMock)
    
    const order = admin.getDbState().orders['order_secure_123']
    expect(order.status).toBe('paid')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0].templateName).toBe('order_confirmed')

    // Second webhook execution should complete idempotently without throwing or sending another email
    await finalizeOrderPayment('order_secure_123', 'pi_mock', stripeSessionMock)
    expect(sendEmail).toHaveBeenCalledTimes(1) // still 1
  })

  it('amount/currency mismatch is rejected by webhook', async () => {
    admin.getDbState().orders['order_secure_123'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productId: 'prod_123',
      productName: 'Bid Item',
      status: 'awaiting_payment',
      currency: 'usd',
      bidId: 'bid_winning',
    }

    const stripeSessionMismatchedAmount = {
      amount_total: 5000, // $50 instead of $100
      currency: 'usd',
    }

    await expect(
      finalizeOrderPayment('order_secure_123', 'pi_mock', stripeSessionMismatchedAmount)
    ).rejects.toThrow(/Amount mismatch/)

    const stripeSessionMismatchedCurrency = {
      amount_total: 10000,
      currency: 'eur', // EUR instead of USD
    }

    await expect(
      finalizeOrderPayment('order_secure_123', 'pi_mock', stripeSessionMismatchedCurrency)
    ).rejects.toThrow(/Currency mismatch/)
  })
})
