import { describe, expect, it } from 'vitest'
import { calculateIncrement } from '../src/bidMath'

describe('calculateIncrement', () => {
  it('uses the configured bid tiers', () => {
    expect(calculateIncrement(0)).toBe(0.5)
    expect(calculateIncrement(9.99)).toBe(0.5)
    expect(calculateIncrement(10)).toBe(1)
    expect(calculateIncrement(49.99)).toBe(1)
    expect(calculateIncrement(50)).toBe(2.5)
    expect(calculateIncrement(199.99)).toBe(2.5)
    expect(calculateIncrement(200)).toBe(5)
    expect(calculateIncrement(499.99)).toBe(5)
    expect(calculateIncrement(500)).toBe(10)
  })
})
