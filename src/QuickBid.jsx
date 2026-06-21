import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { apiRequest } from './api'
import { calculateIncrement } from './bidMath'
import { auth } from './firebase'
import { getVisitorId } from './legalIdentity'
import { getFriendlyErrorMessage } from './friendlyErrors'
import { loadActiveLegalDocuments, agreeToLegalDocument } from './legalDocuments'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function toCents(value) {
  return Math.round(Number(value) * 100)
}

function centsToDollars(cents) {
  return Math.round(cents) / 100
}

function bidAmount(currentPrice, increment, multiplier) {
  return centsToDollars(toCents(currentPrice) + toCents(increment) * multiplier)
}

function recommendedBid(currentPrice, increment) {
  return bidAmount(currentPrice, increment, 2)
}

function QuickBid({ className = '', currentPrice, onBidPlaced, product }) {
  const [customBid, setCustomBid] = useState('')
  const [email, setEmail] = useState(auth?.currentUser?.email ?? '')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    if (!auth) return

    return onAuthStateChanged(auth, (user) => {
      if (user?.email) {
        setEmail(user.email)
      }
    })
  }, [])
  const increment = useMemo(() => calculateIncrement(currentPrice), [currentPrice])
  const minimumBid = useMemo(() => bidAmount(currentPrice, increment, 1), [currentPrice, increment])
  const aggressiveBid = useMemo(() => recommendedBid(currentPrice, increment), [currentPrice, increment])
  const customValue = Number.parseFloat(customBid)
  const isCustomInvalid = customBid !== '' && (!Number.isFinite(customValue) || customValue < minimumBid)
  const hasEmail = /\S+@\S+\.\S+/.test(email.trim())
  const isGuest = !auth?.currentUser

  const placeBid = async (amount) => {
    if (!product?.id) {
      setMessage('This item is not ready for bidding.')
      return
    }

    if (isGuest && !agreed) {
      setMessage('You must accept the Terms of Service and Privacy Policy before bidding.')
      setStatus('error')
      return
    }

    setStatus('saving')
    setMessage('')

    try {
      const user = auth?.currentUser
      const visitorId = getVisitorId()
      const guestUserId = `guest:${visitorId}`
      const guestEmail = email.trim()

      let guestToken = null
      const cacheKey = `guest_token_${guestEmail.toLowerCase()}`

      const refreshGuestToken = async () => {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(cacheKey)
        }

        const activeDocs = await loadActiveLegalDocuments()
        for (const doc of activeDocs) {
          await agreeToLegalDocument({
            documentType: doc.document_type,
            user: null,
            userId: guestUserId,
            versionNumber: doc.version_number,
            email: guestEmail,
            context: { bidding: true },
          })
        }

        return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(cacheKey) : null
      }

      if (isGuest) {
        guestToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(cacheKey) : null

        if (!guestToken) {
          guestToken = await refreshGuestToken()
        }
      }

      const payload = {
        bid_amount: amount,
        buyer_email: guestEmail,
        product_id: product.id,
        user_id: user?.uid ?? guestUserId,
      }

      if (isGuest) {
        payload.guest_token = guestToken
      }

      const authHeaders = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}
      const submitBid = () => apiRequest('/api/bids/place', {
        body: JSON.stringify(payload),
        headers: authHeaders,
        method: 'POST',
      })

      let result
      try {
        result = await submitBid()
      } catch (error) {
        const shouldRefreshGuestToken = isGuest
          && error?.status === 401
          && /guest session token/i.test(error?.message || '')

        if (!shouldRefreshGuestToken) throw error

        payload.guest_token = await refreshGuestToken()
        result = await submitBid()
      }

      setStatus('success')
      setMessage(`Bid placed at ${priceFormatter.format(result.bid.amount)}.`)
      setCustomBid('')
      onBidPlaced?.(result)
    } catch (error) {
      setStatus('error')
      setMessage(getFriendlyErrorMessage(error, 'customer'))
    }
  }

  return (
    <div className={`quick-bid ${className}`.trim()}>
      <div className="quick-bid-head">
        <span>Current bid</span>
        <strong>{priceFormatter.format(Number(currentPrice) || 0)}</strong>
      </div>
      <p>Recommended bid: {priceFormatter.format(aggressiveBid)}</p>
      <div className="quick-bid-status-notice">
        {!hasEmail ? (
          <div className="quick-bid-lock">
            <span className="pulse-dot"></span>
            <span>Enter email below to unlock bidding</span>
          </div>
        ) : (
          <div className="quick-bid-lock is-unlocked">
            <span className="unlock-dot"></span>
            <span>Bidding unlocked</span>
          </div>
        )}
      </div>
      <div className="quick-bid-actions">
        <button
          className="bid-low"
          disabled={status === 'saving' || !hasEmail || (isGuest && !agreed)}
          type="button"
          onClick={() => placeBid(minimumBid)}
        >
          {priceFormatter.format(minimumBid)}
        </button>
        <button
          className="bid-high"
          disabled={status === 'saving' || !hasEmail || (isGuest && !agreed)}
          type="button"
          onClick={() => placeBid(aggressiveBid)}
        >
          {priceFormatter.format(aggressiveBid)}
        </button>
      </div>
      <label className={`quick-bid-email${!hasEmail ? ' needs-attention' : ' is-valid'}`}>
        <span>Email for approval notice</span>
        <input
          required
          autoComplete="email"
          placeholder="your@email.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {isGuest && (
        <label className="quick-bid-consent" style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0', fontSize: '0.9em', cursor: 'pointer' }}>
          <input
            required
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>I agree to the <a href="/legal.html" target="_blank" onClick={(e) => e.stopPropagation()}>Terms of Service & Privacy Policy</a></span>
        </label>
      )}
      <form
        className="quick-bid-custom"
        onSubmit={(event) => {
          event.preventDefault()
          if (!isCustomInvalid && customBid !== '') {
            placeBid(customValue)
          }
        }}
      >
        <label>
          <span>Custom bid</span>
          <input
            aria-invalid={isCustomInvalid}
            inputMode="decimal"
            min={minimumBid}
            step="0.01"
            type="number"
            value={customBid}
            onChange={(event) => setCustomBid(event.target.value)}
          />
        </label>
        <button disabled={status === 'saving' || isCustomInvalid || customBid === '' || !hasEmail || (isGuest && !agreed)} type="submit">
          Bid
        </button>
      </form>
      {isCustomInvalid && (
        <span className="quick-bid-error">
          Custom bids must be at least {priceFormatter.format(minimumBid)}.
        </span>
      )}
      {message && (
        <span className={`quick-bid-message is-${status}`} role={status === 'error' ? 'alert' : 'status'}>
          {message}
        </span>
      )}
    </div>
  )
}

export default QuickBid
