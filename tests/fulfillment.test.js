import { describe, expect, it, vi, beforeEach } from 'vitest'
import admin from 'firebase-admin'
import Stripe from 'stripe'
import crypto from 'node:crypto'
import process from 'node:process'
import {
  templates,
  escapeHtml,
  formatMoney,
  formatAddressPlain,
  formatAddressHtml,
} from '../functions/email/templates.js'

// Set Stripe environment variables for checkout creation
process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
process.env.STRIPE_SUCCESS_URL = 'https://stockroomnj.com/shop?checkout=success'
const approvedBidToken = 'approved-bid-test-token'
const approvedBidTokenHash = crypto.createHash('sha256').update(approvedBidToken).digest('hex')

// Mock firebase-admin completely at the top (hoisted)
vi.mock('firebase-admin', () => {
  let mockDbState = {}
  const mockDocSet = vi.fn()
  const mockDocUpdate = vi.fn()

  const resetDb = () => {
    const tosHash = crypto.createHash('sha256').update('test-user-uid:TOS_1.0').digest('hex')
    const ppHash = crypto.createHash('sha256').update('test-user-uid:PRIVACY_POLICY_1.0').digest('hex')

    mockDbState = {
      admins: {
        'test-user-uid': { enabled: true },
        'admin-uid': { enabled: true },
      },
      products: {
        'prod_123': { name: 'Test Product', status: 'published', price: 10.0, saleMode: 'fixed' },
      },
      bids: {
        'bid_winning': { amount: 100, buyerEmail: 'winner@example.com', productId: 'prod_123', productName: 'Bid Item', status: 'pending_admin_approval', userId: 'test-user-uid' },
      },
      orders: {},
      users: {
        'test-user-uid': { displayName: 'Test User', email: 'test@example.com' },
      },
      legal_documents: {
        'TOS_1.0': { id: 'TOS_1.0', document_type: 'TOS', is_active: true, version_number: '1.0' },
        'PRIVACY_POLICY_1.0': { id: 'PRIVACY_POLICY_1.0', document_type: 'PRIVACY_POLICY', is_active: true, version_number: '1.0' },
      },
      user_agreements: {
        [tosHash]: { user_id: 'test-user-uid', document_id: 'TOS_1.0' },
        [ppHash]: { user_id: 'test-user-uid', document_id: 'PRIVACY_POLICY_1.0' },
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
      add: vi.fn((data) => {
        const id = `auto-id-${Math.random()}`
        if (!mockDbState[col]) mockDbState[col] = {}
        mockDbState[col][id] = data
        return Promise.resolve({ id, get: () => makeDocRef(col, id).get() })
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
    verifyIdToken: vi.fn((token) => {
      if (token === 'admin-token') {
        return Promise.resolve({ uid: 'admin-uid', email: 'admin@example.com' })
      }
      return Promise.resolve({ uid: 'test-user-uid', email: 'test@example.com' })
    }),
  }

  const mockAdmin = {
    initializeApp: vi.fn(),
    firestore: Object.assign(() => mockFirestore, {
      FieldValue: {
        delete: () => 'MOCK_DELETE_FIELD',
        increment: (value) => value,
        serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
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
vi.mock('stripe', () => {
  const mockCreate = vi.fn((payload) => Promise.resolve({
    expires_at: payload.expires_at,
    id: 'sess_stripe_123',
    url: 'https://checkout.stripe.com/sess_123',
  }))
  const mockConstructEvent = vi.fn(() => ({ type: 'checkout.session.completed', data: { object: {} } }))
  const mockExpire = vi.fn(() => Promise.resolve({ status: 'expired' }))
  const mockRetrieve = vi.fn()

  class MockStripe {
    constructor(key) {
      this.key = key
      this.checkout = {
        sessions: {
          create: mockCreate,
          expire: mockExpire,
          retrieve: mockRetrieve,
        }
      }
      this.webhooks = {
        constructEvent: mockConstructEvent,
      }
    }
  }

  MockStripe.mockCreate = mockCreate
  MockStripe.mockConstructEvent = mockConstructEvent
  MockStripe.mockExpire = mockExpire
  MockStripe.mockRetrieve = mockRetrieve

  return { default: MockStripe }
})

// Mock Email sending module
vi.mock('../functions/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('log_id_123'),
}))

// Import functions under test after mocks are defined
import {
  handleCreateCheckoutSession,
  handleApproveBid,
  handleUpdateShipping,
  handleSelectFulfillment,
  handleExtendDeadline,
} from '../functions/index.js'
import { sendEmail } from '../functions/email/index.js'

describe('Email Templates & Helpers', () => {
  it('escapes malicious HTML in product and customer fields', () => {
    const maliciousName = '<script>alert("XSS")</script> & "John"';
    const escaped = escapeHtml(maliciousName);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;John&quot;');
    expect(escaped).not.toContain('<script>');
  });

  it('formats money values correctly', () => {
    expect(formatMoney(10.5)).toBe('$10.50');
    expect(formatMoney(999)).toBe('$999.00');
    expect(formatMoney('abc')).toBe('$0.00');
  });

  it('formats addresses cleanly for plaintext and HTML', () => {
    const address = {
      fullName: 'Alice Smith',
      street: '123 Hobby Lane',
      city: 'Wallington',
      state: 'NJ',
      zip: '07057',
      country: 'US',
    };
    const plain = formatAddressPlain(address);
    expect(plain).toBe('Alice Smith\n123 Hobby Lane\nWallington, NJ 07057\nUS');

    const html = formatAddressHtml(address);
    expect(html).toBe('Alice Smith<br/>123 Hobby Lane<br/>Wallington, NJ 07057<br/>US');
  });

  it('generates order confirmation template with items and fulfillment details', () => {
    const orderData = {
      orderId: 'order-999',
      customerName: 'Bob Builder',
      amount: 15.5,
      items: [{ productName: 'Pokemon Card Pack', amount: 15.5 }],
      fulfillmentMethod: 'pickup',
      pickupLocation: '66 Union Blvd, Wallington, NJ 07057',
      pickupInstructions: 'Pick up at the front counter.',
    };

    const rendered = templates.order_confirmed(orderData);
    expect(rendered.subject).toContain('Order Confirmed');
    expect(rendered.html).toContain('Bob Builder');
    expect(rendered.html).toContain('Pokemon Card Pack');
    expect(rendered.html).toContain('In-store Pickup');
    expect(rendered.html).toContain('order-999');
    expect(rendered.text).toContain('Bob Builder');
    expect(rendered.text).toContain('In-store Pickup');
  });

  it('generates shipping or pickup template with tracking details', () => {
    const shippingData = {
      orderId: 'order-123',
      customerName: 'Charlie',
      productName: 'Retro Video Game',
      shippingMethod: 'shipping',
      carrier: 'USPS',
      trackingNumber: '9400100000000000000000',
    };

    const rendered = templates.shipping_or_pickup(shippingData);
    expect(rendered.subject).toContain('order-123');
    expect(rendered.html).toContain('Charlie');
    expect(rendered.html).toContain('USPS');
    expect(rendered.html).toContain('9400100000000000000000');
    expect(rendered.text).toContain('shipped');
  });
});

describe('Checkout Fulfillment Flow API', () => {
  let mockResponse;
  
  beforeEach(() => {
    admin.resetDb();
    vi.clearAllMocks();
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };
  });

  it('rejects checkout with missing fulfillment method', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        user_id: 'test-user-uid',
        buyer_email: 'test@example.com',
        checkout_mode: 'account',
        items: [{ product_id: 'prod_123' }],
      },
      headers: {
        authorization: 'Bearer token',
      }
    };

    await expect(handleCreateCheckoutSession(mockRequest, mockResponse)).rejects.toThrow(
      /fulfillment_method is required/
    );
  });

  it('rejects checkout with incomplete shipping address', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        user_id: 'test-user-uid',
        buyer_email: 'test@example.com',
        checkout_mode: 'account',
        fulfillment_method: 'shipping',
        shipping_address: {
          full_name: 'Recipient Name',
          street: '123 Main St',
          city: '', // Empty city
          state: 'NJ',
          zip: '07057',
          country: 'US',
        },
        items: [{ product_id: 'prod_123' }],
      },
      headers: {
        authorization: 'Bearer token',
      }
    };

    await expect(handleCreateCheckoutSession(mockRequest, mockResponse)).rejects.toThrow(
      /city is required/
    );
  });

  it('creates a pickup order with pickup fields and location', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        user_id: 'test-user-uid',
        buyer_email: 'test@example.com',
        checkout_mode: 'account',
        fulfillment_method: 'pickup',
        customer_name: 'Test Customer',
        customer_phone: '123-456-7890',
        items: [{ product_id: 'prod_123' }],
      },
      headers: {
        authorization: 'Bearer token',
      }
    };

    await handleCreateCheckoutSession(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(admin.mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentMethod: 'pickup',
      pickupLocation: '66 Union Blvd, Wallington, NJ 07057',
      pickupStatus: 'pending_ready',
      customerName: 'Test Customer',
    }));
    expect(Stripe.mockCreate).toHaveBeenCalled();
  });

  it('creates a shipping order with shipping address fields', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        user_id: 'test-user-uid',
        buyer_email: 'test@example.com',
        checkout_mode: 'account',
        fulfillment_method: 'shipping',
        shipping_address: {
          full_name: 'Recipient Name',
          street: '123 Main St',
          city: 'Wallington',
          state: 'NJ',
          zip: '07057',
          country: 'US',
          phone: '123-456-7890',
        },
        items: [{ product_id: 'prod_123' }],
      },
      headers: {
        authorization: 'Bearer token',
      }
    };

    await handleCreateCheckoutSession(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(admin.mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentMethod: 'shipping',
      shippingAddress: expect.objectContaining({
        fullName: 'Recipient Name',
        street: '123 Main St',
      }),
    }));
  });
});

describe('Approved Bid & Fulfillment selection', () => {
  let mockResponse;

  beforeEach(() => {
    admin.resetDb();
    vi.clearAllMocks();
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };
  });

  it('handleApproveBid creates pending fulfillment order and triggers email once', async () => {
    const mockRequest = {
      method: 'POST',
      body: { bid_id: 'bid_winning' },
      headers: { authorization: 'Bearer admin-token' }
    };

    await handleApproveBid(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);

    // Verify order is pending customer selection
    expect(admin.mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentMethod: 'pending_customer_selection',
      status: 'awaiting_payment',
    }));

    // Verify email is sent once
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateName: 'bid_approved_checkout',
    }));
  });

  it('handleSelectFulfillment sets shipping details for approved bid', async () => {
    // Seed existing order
    admin.getDbState().orders['order_bid_123'] = {
      amount: 100,
      bidId: 'bid_123',
      buyerEmail: 'winner@example.com',
      paymentLinkTokenHash: approvedBidTokenHash,
      productName: 'Bid Item',
      status: 'approved_awaiting_payment',
      stripeCheckoutUrl: 'https://stripe.com'
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_bid_123',
        token: approvedBidToken,
        fulfillment_method: 'shipping',
        customer_name: 'Bid Winner Name',
        shipping_address: {
          full_name: 'Bid Winner Name',
          street: '456 Winner Blvd',
          city: 'Winner City',
          state: 'NJ',
          zip: '07000',
          country: 'US',
        }
      },
      headers: {}
    };

    await handleSelectFulfillment(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(admin.mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentMethod: 'shipping',
      shippingAddress: expect.objectContaining({
        fullName: 'Bid Winner Name',
        street: '456 Winner Blvd',
      }),
    }));
  });

  it('rejects update-shipping if it contradicts customer choice without override', async () => {
    // Seed paid pickup order
    admin.getDbState().orders['order_1'] = {
      status: 'paid',
      fulfillmentMethod: 'pickup',
      buyerEmail: 'buyer@example.com',
      productName: 'Bid Item',
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_1',
        shipping_method: 'shipping', // contradicts customer pickup
        carrier: 'UPS',
        tracking_number: '12345',
      },
      headers: { authorization: 'Bearer admin-token' }
    };

    // Should throw an error due to contradiction
    await expect(handleUpdateShipping(mockRequest, mockResponse)).rejects.toThrow(
      /contradicts original customer choice/
    );

    // Now try with override
    const mockRequestOverride = {
      method: 'POST',
      body: {
        order_id: 'order_1',
        shipping_method: 'shipping',
        carrier: 'UPS',
        tracking_number: '12345',
        explicit_override: true, // override contradiction
      },
      headers: { authorization: 'Bearer admin-token' }
    };

    await handleUpdateShipping(mockRequestOverride, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(admin.mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({
      shippingMethod: 'shipping',
      shippingStatus: 'shipped',
    }));
  });

  it('handleSelectFulfillment rejects expired bid orders', async () => {
    // Seed expired order
    admin.getDbState().orders['order_expired'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productName: 'Bid Item',
      status: 'approved_awaiting_payment',
      paymentDueAt: admin.firestore.Timestamp.fromMillis(Date.now() - 10000), // expired 10s ago
      bidId: 'bid_123',
      paymentLinkTokenHash: approvedBidTokenHash,
      productId: 'prod_123',
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_expired',
        token: approvedBidToken,
        fulfillment_method: 'shipping',
        customer_name: 'Bid Winner Name',
        shipping_address: {
          full_name: 'Bid Winner Name',
          street: '456 Winner Blvd',
          city: 'Winner City',
          state: 'NJ',
          zip: '07000',
          country: 'US',
        }
      },
      headers: {}
    };

    await handleSelectFulfillment(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('expired'),
    }));
  });

  it('handleSelectFulfillment rejects orders close to expiration (under 30m)', async () => {
    // Seed order expiring in 15 minutes
    admin.getDbState().orders['order_close'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productName: 'Bid Item',
      status: 'approved_awaiting_payment',
      paymentDueAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000), // expiring in 15 mins
      bidId: 'bid_123',
      paymentLinkTokenHash: approvedBidTokenHash,
      productId: 'prod_123',
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_close',
        token: approvedBidToken,
        fulfillment_method: 'shipping',
        customer_name: 'Bid Winner Name',
        shipping_address: {
          full_name: 'Bid Winner Name',
          street: '456 Winner Blvd',
          city: 'Winner City',
          state: 'NJ',
          zip: '07000',
          country: 'US',
        }
      },
      headers: {}
    };

    await handleSelectFulfillment(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('expired or is too close to the deadline'),
    }));
  });

  it('handleSelectFulfillment creates refreshed Stripe Checkout session with correct expires_at', async () => {
    // Seed valid order expiring in 10 hours
    const targetDueTime = Date.now() + 10 * 60 * 60 * 1000;
    admin.getDbState().orders['order_valid'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productName: 'Bid Item',
      status: 'approved_awaiting_payment',
      paymentDueAt: admin.firestore.Timestamp.fromMillis(targetDueTime),
      bidId: 'bid_123',
      paymentLinkTokenHash: approvedBidTokenHash,
      productId: 'prod_123',
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_valid',
        token: approvedBidToken,
        fulfillment_method: 'pickup',
        customer_name: 'Winner Name',
      },
      headers: {}
    };

    // Reset mock Stripe call history
    Stripe.mockCreate.mockClear();

    await handleSelectFulfillment(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(Stripe.mockCreate).toHaveBeenCalledTimes(1);

    // Expect expires_at to be exactly targetDueTime in seconds
    const expectedExpiresAt = Math.floor(targetDueTime / 1000);
    expect(Stripe.mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      expires_at: expectedExpiresAt,
    }));
  });

  it('handleExtendDeadline updates order and logs to deadline_extensions', async () => {
    const initialDue = Date.now() + 24 * 60 * 60 * 1000;
    admin.getDbState().orders['order_to_extend'] = {
      amount: 100,
      buyerEmail: 'winner@example.com',
      productName: 'Bid Item',
      status: 'approved_awaiting_payment',
      paymentDueAt: admin.firestore.Timestamp.fromMillis(initialDue),
      bidId: 'bid_123',
      productId: 'prod_123',
    };
    // Mock products
    admin.getDbState().products['prod_123'] = {
      status: 'published',
      auctionStatus: 'approved_awaiting_payment',
    };

    const mockRequest = {
      method: 'POST',
      body: {
        order_id: 'order_to_extend',
        extend_hours: 72,
        reason: 'Customer requested extension',
      },
      headers: { authorization: 'Bearer admin-token' }
    };

    // Clear/init extension collection in mockDbState
    admin.getDbState().deadline_extensions = {};

    // Reset mock create check
    await handleExtendDeadline(mockRequest, mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);

    // Check that deadline_extensions contains the log
    const extensions = Object.values(admin.getDbState().deadline_extensions);
    expect(extensions.length).toBe(1);
    expect(extensions[0]).toEqual(expect.objectContaining({
      orderId: 'order_to_extend',
      reason: 'Customer requested extension',
      adminUser: 'admin-uid',
    }));
  });
});
