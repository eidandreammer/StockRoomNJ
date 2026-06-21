import crypto from 'node:crypto'
import process from 'node:process'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import admin from 'firebase-admin'
import { handlePlaceBid, signGuestSession } from '../functions/index.js'

process.env.GUEST_TOKEN_SECRET = 'guest-token-test-secret-with-sufficient-entropy'

// Mock firebase-admin (hoisted)
vi.mock('firebase-admin', () => {
  let mockDbState = {}
  
  const resetDb = () => {
    mockDbState = {
      products: {
        'prod_open': { name: 'Open Product', status: 'published', price: 10.0, saleMode: 'auction', auctionStatus: 'open' },
        'prod_closed': { name: 'Closed Product', status: 'published', price: 10.0, saleMode: 'auction', auctionStatus: 'closed' },
        'prod_draft': { name: 'Draft Product', status: 'draft', price: 10.0, saleMode: 'auction', auctionStatus: 'open' },
      },
      bids: {},
      user_agreements: {},
      legal_documents: {
        'TOS': { document_type: 'TOS', is_active: true },
        'PRIVACY_POLICY': { document_type: 'PRIVACY_POLICY', is_active: true },
      },
      rate_limits: {},
      users: {
        'user-123': { displayName: 'Alice', email: 'alice@example.com' },
      }
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
        return Promise.resolve()
      }),
      update: vi.fn((data) => {
        if (!mockDbState[col]) mockDbState[col] = {}
        mockDbState[col][id] = { ...mockDbState[col][id], ...data }
        return Promise.resolve()
      }),
    }
  }

  const makeCollectionRef = (col) => {
    return {
      doc: vi.fn((id) => makeDocRef(col, id || `auto-id-${Math.random()}`)),
      add: vi.fn((data) => {
        const id = `auto-id-${Math.random()}`
        if (!mockDbState[col]) mockDbState[col] = {}
        mockDbState[col][id] = data
        return Promise.resolve({ id })
      }),
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
          size: docs.length,
        })
      }),
      where: vi.fn(function (field, op, val) {
        return {
          where: vi.fn(function() { return this }),
          limit: vi.fn(function() { return this }),
          get: vi.fn(() => {
            const colData = mockDbState[col] || {}
            let docs = Object.keys(colData).map((id) => ({
              id,
              exists: true,
              data: () => colData[id],
            }))
            docs = docs.filter(d => {
              const dData = d.data()
              if (op === '==') return dData[field] === val
              if (op === '>') {
                const docVal = dData[field]
                const valDate = val instanceof Date ? val.getTime() : val
                const docValDate = docVal instanceof Date ? docVal.getTime() : (docVal?.toDate ? docVal.toDate().getTime() : docVal)
                return docValDate > valDate
              }
              return true
            })
            return Promise.resolve({
              empty: docs.length === 0,
              docs,
              size: docs.length,
            })
          })
        }
      }),
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
    batch: vi.fn(() => ({
      delete: vi.fn(),
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
  }

  const mockAuth = {
    verifyIdToken: vi.fn((token) => {
      if (token === 'valid-token') {
        return Promise.resolve({ uid: 'user-123', email: 'alice@example.com' })
      }
      if (token === 'other-token') {
        return Promise.resolve({ uid: 'other-user', email: 'other@example.com' })
      }
      return Promise.reject(new Error('Invalid token'))
    }),
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
  }

  return { default: mockAdmin }
})

vi.mock('../functions/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('log_id_123'),
}))

describe('Bidding Endpoint Security', () => {
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

  const seedConsent = (userId) => {
    const dbState = admin.getDbState()
    const tosId = 'TOS'
    const privacyId = 'PRIVACY_POLICY'
    
    const hashTos = crypto.createHash('sha256').update(`${userId}:${tosId}`).digest('hex')
    const hashPrivacy = crypto.createHash('sha256').update(`${userId}:${privacyId}`).digest('hex')

    dbState.user_agreements[hashTos] = { user_id: userId, document_id: tosId }
    dbState.user_agreements[hashPrivacy] = { user_id: userId, document_id: privacyId }
  }

  it('signs guest tokens only with GUEST_TOKEN_SECRET', () => {
    const originalGuestSecret = process.env.GUEST_TOKEN_SECRET
    const originalStripeSecret = process.env.STRIPE_SECRET_KEY
    const options = { nowSeconds: 1000, ttlSeconds: 60 }
    const firstToken = signGuestSession('guest:one', 'guest@example.com', options)

    process.env.STRIPE_SECRET_KEY = 'a-different-stripe-key'
    expect(signGuestSession('guest:one', 'guest@example.com', options)).toBe(firstToken)

    process.env.GUEST_TOKEN_SECRET = 'a-different-guest-token-secret'
    expect(signGuestSession('guest:one', 'guest@example.com', options)).not.toBe(firstToken)

    process.env.GUEST_TOKEN_SECRET = originalGuestSecret
    if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = originalStripeSecret
  })

  it('valid authenticated bid succeeds', async () => {
    seedConsent('user-123')
    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 15.0,
      },
      headers: { authorization: 'Bearer valid-token' }
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(201)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.bid.amount).toBe(15.0)
    expect(body.bid.userId).toBe('user-123')
  })

  it('spoofed user_id (token mismatch) is rejected', async () => {
    seedConsent('user-123')
    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 15.0,
      },
      headers: { authorization: 'Bearer other-token' }
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('Account authorization does not match')
  })

  it('guest bid with valid guest token succeeds', async () => {
    const guestId = 'guest:visitor-456'
    const guestEmail = 'guest@example.com'
    seedConsent(guestId)

    const token = signGuestSession(guestId, guestEmail)

    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: guestId,
        buyer_email: guestEmail,
        bid_amount: 15.0,
        guest_token: token,
      },
      headers: {}
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(201)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.bid.userId).toBe(guestId)
  })

  it('unauthenticated guest bid without guest token is rejected', async () => {
    const guestId = 'guest:visitor-456'
    const guestEmail = 'guest@example.com'
    seedConsent(guestId)

    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: guestId,
        buyer_email: guestEmail,
        bid_amount: 15.0,
      },
      headers: {}
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('Invalid or missing guest session token')
  })

  it('guest bid with spoofed guest token (mismatched email) is rejected', async () => {
    const guestId = 'guest:visitor-456'
    const guestEmail = 'guest@example.com'
    seedConsent(guestId)

    const token = signGuestSession(guestId, 'different@example.com')

    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: guestId,
        buyer_email: guestEmail,
        bid_amount: 15.0,
        guest_token: token,
      },
      headers: {}
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('Invalid or missing guest session token')
  })

  it('guest bid with an expired guest token is rejected', async () => {
    const guestId = 'guest:visitor-456'
    const guestEmail = 'guest@example.com'
    seedConsent(guestId)
    const token = signGuestSession(guestId, guestEmail, { nowSeconds: 100, ttlSeconds: 10 })

    await handlePlaceBid({
      body: {
        bid_amount: 15,
        buyer_email: guestEmail,
        guest_token: token,
        product_id: 'prod_open',
        user_id: guestId,
      },
      headers: {},
    }, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
  })

  it('rejects numeric strings instead of coercing bid_amount', async () => {
    await handlePlaceBid({
      body: {
        bid_amount: '15',
        buyer_email: 'alice@example.com',
        product_id: 'prod_open',
        user_id: 'user-123',
      },
      headers: { authorization: 'Bearer valid-token' },
    }, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
  })

  it('rejects a bid exactly at the auction end time', async () => {
    seedConsent('user-123')
    admin.getDbState().products.prod_open.auctionEndsAt = { toMillis: () => Date.now() }

    await handlePlaceBid({
      body: {
        bid_amount: 15,
        buyer_email: 'alice@example.com',
        product_id: 'prod_open',
        user_id: 'user-123',
      },
      headers: { authorization: 'Bearer valid-token' },
    }, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'This auction has closed.' }))
  })

  it('bid below minimum is rejected', async () => {
    seedConsent('user-123')
    admin.getDbState().products.prod_open.currentBidPrice = 100.0

    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 50.0,
      },
      headers: { authorization: 'Bearer valid-token' }
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('Bid must be at least')
  })

  it('bid on unpublished product is rejected', async () => {
    seedConsent('user-123')
    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_draft',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 15.0,
      },
      headers: { authorization: 'Bearer valid-token' }
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('not open for bidding')
  })

  it('bid on closed auction is rejected', async () => {
    seedConsent('user-123')
    const mockRequest = {
      method: 'POST',
      body: {
        product_id: 'prod_closed',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 15.0,
      },
      headers: { authorization: 'Bearer valid-token' }
    }

    await handlePlaceBid(mockRequest, mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
    const body = mockResponse.json.mock.calls[0][0]
    expect(body.error).toContain('not open for bidding')
  })

  it('rate limiting blocks spam bids', async () => {
    seedConsent('user-123')

    // Submit 5 bids (limit is 5 per user/email per minute)
    for (let i = 0; i < 5; i++) {
      const mockRequest = {
        method: 'POST',
        body: {
          product_id: 'prod_open',
          user_id: 'user-123',
          buyer_email: 'alice@example.com',
          bid_amount: 15.0 + i * 5, // Increment bid amount to avoid minimum bid errors
        },
        headers: { authorization: 'Bearer valid-token' }
      }
      await handlePlaceBid(mockRequest, mockResponse)
      expect(mockResponse.status).toHaveBeenLastCalledWith(201)
    }

    const mockRequestBlock = {
      method: 'POST',
      body: {
        product_id: 'prod_open',
        user_id: 'user-123',
        buyer_email: 'alice@example.com',
        bid_amount: 50.0,
      },
      headers: { authorization: 'Bearer valid-token' }
    }
    await handlePlaceBid(mockRequestBlock, mockResponse)
    expect(mockResponse.status).toHaveBeenLastCalledWith(429)
    const body = mockResponse.json.mock.calls[mockResponse.json.mock.calls.length - 1][0]
    expect(body.error).toContain('Too many bids')
  })
})
