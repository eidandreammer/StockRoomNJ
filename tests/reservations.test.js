import crypto from 'node:crypto'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import admin from 'firebase-admin'

process.env.GUEST_TOKEN_SECRET = 'reservation-guest-token-test-secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_reservations'

vi.mock('firebase-admin', () => {
  const DELETE_FIELD = '__DELETE_FIELD__'
  let autoId = 0
  let state = {}

  const applyUpdate = (target, update) => {
    const next = { ...(target || {}) }
    Object.entries(update).forEach(([key, value]) => {
      if (value === DELETE_FIELD) delete next[key]
      else next[key] = value
    })
    return next
  }

  const timestamp = (millis) => ({
    toDate: () => new Date(millis),
    toMillis: () => millis,
  })

  const makeDocRef = (collectionName, id) => ({
    collectionName,
    id,
    delete: vi.fn(async () => {
      delete state[collectionName]?.[id]
    }),
    get: vi.fn(async () => {
      const data = state[collectionName]?.[id]
      return {
        data: () => data,
        exists: data !== undefined,
        id,
        ref: makeDocRef(collectionName, id),
      }
    }),
    set: vi.fn(async (data) => {
      if (!state[collectionName]) state[collectionName] = {}
      state[collectionName][id] = data
    }),
    update: vi.fn(async (update) => {
      if (!state[collectionName]) state[collectionName] = {}
      state[collectionName][id] = applyUpdate(state[collectionName][id], update)
    }),
  })

  const comparable = (value) => value?.toMillis?.() ?? value
  const makeQuery = (collectionName, filters = [], max = Infinity) => ({
    get: vi.fn(async () => {
      const entries = Object.entries(state[collectionName] || {})
        .filter(([, data]) => filters.every(({ field, op, value }) => {
          const left = comparable(data[field])
          const right = comparable(value)
          if (op === '==') return left === right
          if (op === '<=') return left <= right
          return true
        }))
        .slice(0, max)
      const docs = entries.map(([id, data]) => ({
        data: () => data,
        exists: true,
        id,
        ref: makeDocRef(collectionName, id),
      }))
      return { docs, empty: docs.length === 0, size: docs.length }
    }),
    limit: vi.fn((limit) => makeQuery(collectionName, filters, limit)),
    where: vi.fn((field, op, value) => makeQuery(collectionName, [...filters, { field, op, value }], max)),
  })

  const makeCollectionRef = (collectionName) => ({
    ...makeQuery(collectionName),
    doc: vi.fn((id) => makeDocRef(collectionName, id || `auto-${++autoId}`)),
  })

  const firestore = {
    batch: vi.fn(() => {
      const deletes = []
      return {
        commit: vi.fn(async () => Promise.all(deletes.map((ref) => ref.delete()))),
        delete: vi.fn((ref) => deletes.push(ref)),
      }
    }),
    collection: vi.fn((collectionName) => makeCollectionRef(collectionName)),
    runTransaction: vi.fn(async (callback) => callback({
      get: vi.fn((ref) => ref.get()),
      set: vi.fn((ref, data) => ref.set(data)),
      update: vi.fn((ref, data) => ref.update(data)),
    })),
  }

  const resetDb = () => {
    autoId = 0
    const tosId = crypto.createHash('sha256').update('buyer-1:TOS_1.0').digest('hex')
    const privacyId = crypto.createHash('sha256').update('buyer-1:PRIVACY_POLICY_1.0').digest('hex')
    state = {
      legal_documents: {
        'PRIVACY_POLICY_1.0': { document_type: 'PRIVACY_POLICY', is_active: true },
        'TOS_1.0': { document_type: 'TOS', is_active: true },
      },
      orders: {},
      products: {
        'product-1': { name: 'One-off collectible', price: 25, saleMode: 'fixed', status: 'published' },
      },
      rate_limits: {},
      user_agreements: {
        [privacyId]: { document_id: 'PRIVACY_POLICY_1.0', user_id: 'buyer-1' },
        [tosId]: { document_id: 'TOS_1.0', user_id: 'buyer-1' },
      },
      users: {},
    }
  }

  const mockAdmin = {
    auth: () => ({
      verifyIdToken: vi.fn(async () => ({ email: 'buyer@example.com', uid: 'buyer-1' })),
    }),
    firestore: Object.assign(() => firestore, {
      FieldValue: {
        delete: () => DELETE_FIELD,
        increment: (value) => value,
        serverTimestamp: () => 'SERVER_TIMESTAMP',
      },
      Timestamp: {
        fromDate: (date) => timestamp(date.getTime()),
        fromMillis: timestamp,
        now: () => timestamp(Date.now()),
      },
    }),
    getDbState: () => state,
    initializeApp: vi.fn(),
    resetDb,
  }

  return { default: mockAdmin }
})

const stripeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  expire: vi.fn(),
  retrieve: vi.fn(),
}))

vi.mock('stripe', () => {
  class MockStripe {
    constructor() {
      this.checkout = { sessions: stripeMocks }
      this.webhooks = { constructEvent: vi.fn() }
    }
  }
  MockStripe.mocks = stripeMocks
  return { default: MockStripe }
})

vi.mock('../functions/email/index.js', () => ({
  sendEmail: vi.fn(async () => 'email-log-id'),
}))

import {
  finalizeOrderPayment,
  handleCreateCheckoutSession,
  releaseExpiredReservationsHandler,
} from '../functions/index.js'

function checkoutRequest() {
  return {
    body: {
      agreement_ids: [],
      buyer_email: 'buyer@example.com',
      checkout_mode: 'account',
      customer_name: 'Buyer One',
      fulfillment_method: 'pickup',
      items: [{ product_id: 'product-1' }],
      user_id: 'buyer-1',
    },
    headers: { authorization: 'Bearer valid-token' },
  }
}

function response() {
  return {
    json: vi.fn(),
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }
}

describe('direct checkout reservations', () => {
  beforeEach(() => {
    admin.resetDb()
    vi.clearAllMocks()
    stripeMocks.create.mockImplementation(async (payload) => ({
      amount_total: 2500,
      currency: 'usd',
      expires_at: payload.expires_at,
      id: 'cs_direct_1',
      payment_status: 'unpaid',
      status: 'open',
      url: 'https://checkout.stripe.test/cs_direct_1',
    }))
    stripeMocks.expire.mockResolvedValue({ id: 'cs_direct_1', status: 'expired' })
  })

  it('reserves inventory and synchronizes the returned Stripe expiration', async () => {
    const startedAt = Math.floor(Date.now() / 1000)
    const mockResponse = response()

    await handleCreateCheckoutSession(checkoutRequest(), mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(200)
    const payload = stripeMocks.create.mock.calls[0][0]
    const options = stripeMocks.create.mock.calls[0][1]
    expect(payload.expires_at).toBeGreaterThanOrEqual(startedAt + 31 * 60 - 1)
    expect(payload).not.toHaveProperty('payment_method_types')
    expect(options.idempotencyKey).toMatch(/^direct-checkout-auto-1$/)

    const product = admin.getDbState().products['product-1']
    const order = admin.getDbState().orders['auto-1']
    expect(product.status).toBe('reserved')
    expect(product.reservedOrderId).toBe('auto-1')
    expect(product.reservationExpiresAt.toMillis()).toBe(payload.expires_at * 1000)
    expect(order.reservationExpiresAt.toMillis()).toBe(payload.expires_at * 1000)
  })

  it('rejects a second checkout while the first reservation is active', async () => {
    await handleCreateCheckoutSession(checkoutRequest(), response())
    const secondResponse = response()

    await handleCreateCheckoutSession(checkoutRequest(), secondResponse)

    expect(secondResponse.status).toHaveBeenCalledWith(409)
    expect(stripeMocks.create).toHaveBeenCalledTimes(1)
  })

  it('reclaims an expired reservation for a new checkout', async () => {
    admin.getDbState().products['product-1'] = {
      ...admin.getDbState().products['product-1'],
      reservationExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000),
      reservedBy: 'old-buyer',
      reservedOrderId: 'old-order',
      status: 'reserved',
    }

    await handleCreateCheckoutSession(checkoutRequest(), response())

    expect(admin.getDbState().products['product-1'].reservedOrderId).toBe('auto-1')
  })

  it('rolls reservations back when Stripe session creation fails', async () => {
    stripeMocks.create.mockRejectedValueOnce(new Error('Stripe unavailable'))
    const mockResponse = response()

    await handleCreateCheckoutSession(checkoutRequest(), mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(503)
    expect(admin.getDbState().products['product-1'].status).toBe('published')
    expect(admin.getDbState().products['product-1']).not.toHaveProperty('reservedOrderId')
    expect(admin.getDbState().orders['auto-1'].status).toBe('failed')
  })

  it('rejects payment finalization when reservation ownership changed', async () => {
    admin.getDbState().orders['order-1'] = {
      amount: 25,
      buyerEmail: 'buyer@example.com',
      fulfillmentMethod: 'pickup',
      items: [{ productId: 'product-1', productName: 'One-off collectible' }],
      productId: 'product-1',
      status: 'pending_payment',
      userId: 'buyer-1',
    }
    admin.getDbState().products['product-1'] = {
      ...admin.getDbState().products['product-1'],
      reservedOrderId: 'different-order',
      status: 'reserved',
    }

    await expect(finalizeOrderPayment('order-1', 'pi_1', {
      amount_total: 2500,
      currency: 'usd',
    })).rejects.toThrow(/no longer reserved/)
  })

  it('releases inventory after Stripe confirms an expired session', async () => {
    const expiredAt = admin.firestore.Timestamp.fromMillis(Date.now() - 1000)
    admin.getDbState().orders['order-expired'] = {
      reservationExpiresAt: expiredAt,
      reservationProductIds: ['product-1'],
      status: 'pending_payment',
      stripeCheckoutSessionId: 'cs_expired',
    }
    admin.getDbState().products['product-1'] = {
      ...admin.getDbState().products['product-1'],
      reservationExpiresAt: expiredAt,
      reservedBy: 'buyer-1',
      reservedOrderId: 'order-expired',
      status: 'reserved',
    }
    stripeMocks.retrieve.mockResolvedValueOnce({ id: 'cs_expired', status: 'expired' })

    await releaseExpiredReservationsHandler()

    expect(admin.getDbState().products['product-1'].status).toBe('published')
    expect(admin.getDbState().orders['order-expired'].status).toBe('expired')
  })
})
