import process from 'node:process'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { applyCors, handleApiRequest } from '../functions/index.js'

describe('CORS validation', () => {
  let mockRequest
  let mockResponse
  let headers

  beforeEach(() => {
    headers = {}
    mockRequest = {
      headers: {},
    }
    mockResponse = {
      set: (key, value) => {
        headers[key] = value
      },
    }
    // Clean environment variables
    delete process.env.ALLOWED_ORIGINS
    delete process.env.NODE_ENV
    delete process.env.FUNCTIONS_EMULATOR
  })

  it('allows production origin that matches ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com, https://another-origin.com'
    process.env.NODE_ENV = 'production'
    mockRequest.headers.origin = 'https://stockroomnj.com'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBe('https://stockroomnj.com')
  })

  it('rejects disallowed production origin', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    process.env.NODE_ENV = 'production'
    mockRequest.headers.origin = 'https://malicious.com'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('rejects localhost in production', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    process.env.NODE_ENV = 'production'
    mockRequest.headers.origin = 'http://localhost:5173'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('allows localhost in local development (NODE_ENV !== production)', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    process.env.NODE_ENV = 'development'
    mockRequest.headers.origin = 'http://localhost:5173'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
  })

  it('allows localhost in emulator (FUNCTIONS_EMULATOR === true)', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    process.env.NODE_ENV = 'production'
    process.env.FUNCTIONS_EMULATOR = 'true'
    mockRequest.headers.origin = 'http://127.0.0.1:5173'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:5173')
  })

  it('fails closed when ALLOWED_ORIGINS is missing or empty in production', () => {
    process.env.NODE_ENV = 'production'
    mockRequest.headers.origin = 'https://stockroomnj.com'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('does not set CORS headers if Origin header is missing (e.g. webhook)', () => {
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    process.env.NODE_ENV = 'production'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('rejects localhost lookalike hostnames', () => {
    process.env.NODE_ENV = 'development'
    mockRequest.headers.origin = 'http://localhost.evil.example:5173'

    applyCors(mockRequest, mockResponse)

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('blocks a disallowed browser origin before route handling', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://stockroomnj.com'
    const response = {
      send: vi.fn(),
      set: vi.fn(),
      status: vi.fn().mockReturnThis(),
    }

    await handleApiRequest({
      headers: { origin: 'https://attacker.example' },
      method: 'POST',
      url: '/api/bids/place',
    }, response)

    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.send).toHaveBeenCalledWith('Forbidden: CORS origin not allowed.')
  })
})
