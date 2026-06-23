import { readFileSync } from 'node:fs'
import process from 'node:process'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import admin from 'firebase-admin'
import { sendEmail } from '../functions/email/index.js'
import { templates } from '../functions/email/templates.js'
import { handlePasswordResetRequest } from '../functions/index.js'

const firebaseMocks = vi.hoisted(() => ({
  generatePasswordResetLink: vi.fn(),
  getUserByEmail: vi.fn(),
  userProfile: { displayName: 'Firestore Name' },
}))

vi.mock('firebase-admin', () => {
  const auth = {
    generatePasswordResetLink: firebaseMocks.generatePasswordResetLink,
    getUserByEmail: firebaseMocks.getUserByEmail,
  }
  const firestore = {
    collection: vi.fn((collectionName) => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => collectionName === 'users'
          ? { exists: true, data: () => firebaseMocks.userProfile }
          : { exists: false, data: () => ({}) }),
      })),
    })),
    runTransaction: vi.fn(async (callback) => callback({
      get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
      set: vi.fn(),
    })),
  }
  const mockAdmin = {
    auth: () => auth,
    firestore: Object.assign(() => firestore, {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
      Timestamp: { fromMillis: (value) => value },
    }),
    initializeApp: vi.fn(),
  }

  return { default: mockAdmin }
})

vi.mock('../functions/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('email-log-id'),
}))

function responseMock() {
  return {
    json: vi.fn(),
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }
}

describe('password reset flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseMocks.userProfile = { displayName: 'Firestore Name' }
    firebaseMocks.generatePasswordResetLink.mockResolvedValue('https://example.firebaseapp.com/reset?oobCode=abc')
    firebaseMocks.getUserByEmail.mockResolvedValue({
      uid: 'user-123',
      displayName: 'Auth Name',
    })
    process.env.APP_BASE_URL = 'https://stockroomnj.com'
  })

  it('uses the custom API from AccountDrawer instead of Firebase frontend email', () => {
    const source = readFileSync(new URL('../src/AccountDrawer.jsx', import.meta.url), 'utf8')

    expect(source).not.toContain('sendPasswordResetEmail')
    expect(source).toContain("apiRequest('/api/auth/password-reset'")
  })

  it('registers the public API route', () => {
    const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8')

    expect(source).toContain("'POST /api/auth/password-reset': handlePasswordResetRequest")
  })

  it('renders the password_reset subject, HTML, and text fallback', () => {
    const resetLink = 'https://example.firebaseapp.com/reset?oobCode=abc&mode=resetPassword'
    const rendered = templates.password_reset({
      name: 'Taylor & Co',
      resetLink,
    })

    expect(rendered.subject).toBe('Reset your Stock Room password')
    expect(rendered.html).toContain('Taylor &amp; Co')
    expect(rendered.html).toContain('Reset Password')
    expect(rendered.text).toContain(resetLink)
    expect(rendered.text).toContain('60 minutes')
  })

  it('sends the custom reset template for an existing user', async () => {
    const response = responseMock()

    await handlePasswordResetRequest({
      body: { email: '  USER@Example.com ' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }, response)

    expect(admin.auth().getUserByEmail).toHaveBeenCalledWith('user@example.com')
    expect(admin.auth().generatePasswordResetLink).toHaveBeenCalledWith('user@example.com', {
      url: 'https://stockroomnj.com',
      handleCodeInApp: false,
    })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      category: 'security',
      templateName: 'password_reset',
      data: expect.objectContaining({
        name: 'Firestore Name',
        expiresMinutes: 60,
      }),
      metadata: {
        userId: 'user-123',
        purpose: 'password_reset',
      },
    }))
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({ success: true })
  })

  it('returns the same success response for a valid unknown email', async () => {
    firebaseMocks.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    const response = responseMock()

    await handlePasswordResetRequest({
      body: { email: 'missing@example.com' },
      headers: {},
    }, response)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({ success: true })
  })

  it('does not expose reset-link generation failures for existing users', async () => {
    firebaseMocks.generatePasswordResetLink.mockRejectedValue(new Error('provider failure'))
    const response = responseMock()

    await handlePasswordResetRequest({
      body: { email: 'user@example.com' },
      headers: {},
    }, response)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({ success: true })
  })
})
